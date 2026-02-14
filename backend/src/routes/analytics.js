const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const XLSX = require('xlsx');

const COLUMN_CACHE = {};

async function getTableColumns(tableName) {
    if (COLUMN_CACHE[tableName]) {
        return COLUMN_CACHE[tableName];
    }

    const result = await query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1`,
        [tableName]
    );

    const columns = new Set(result.rows.map(row => row.column_name));
    COLUMN_CACHE[tableName] = columns;
    return columns;
}

function pickColumn(columns, candidates, fallback = null) {
    for (const candidate of candidates) {
        if (columns.has(candidate)) {
            return candidate;
        }
    }
    return fallback;
}

async function getClassGradeColumn() {
    const columns = await getTableColumns('classes');
    return pickColumn(columns, ['grade_level', 'grade'], 'grade_level');
}

async function getSubjectNameExpressions() {
    const nameRuResult = await query(`
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public'
                    AND table_name = 'subjects'
                    AND column_name = 'name_ru'
                LIMIT 1
        `);

    const nameUzResult = await query(`
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public'
                    AND table_name = 'subjects'
                    AND column_name = 'name_uz'
                LIMIT 1
        `);

    return {
        nameRu: nameRuResult.rowCount ? 's.name_ru' : 's.name',
        nameUz: nameUzResult.rowCount ? 's.name_uz' : 's.name'
    };
}

async function getAttemptExpressions(alias = 'ta') {
    const columnsResult = await query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'test_attempts'
    `);
    const columns = new Set(columnsResult.rows.map((row) => row.column_name));

    const col = (name) => (columns.has(name) ? `${alias}.${name}` : null);

    const scorePercent = col('score_percentage') || col('percentage');
    const score = col('score');
    const maxScore = col('max_score');
    let scoreExpr = 'NULL';
    if (scorePercent) {
        scoreExpr = scorePercent;
    } else if (score && maxScore) {
        scoreExpr = `CASE WHEN ${maxScore} IS NOT NULL AND ${maxScore} > 0 THEN (${score} / ${maxScore} * 100) ELSE ${score} END`;
    } else if (score) {
        scoreExpr = score;
    }

    const timeExpr = col('time_spent') || col('time_spent_seconds') || col('duration_seconds') || 'NULL';

    const completedAt = col('completed_at') || col('submitted_at') || col('graded_at') || col('created_at') || 'NULL';

    let completedFilter = 'TRUE';
    if (columns.has('status')) {
        completedFilter = `${alias}.status = 'completed'`;
    } else if (columns.has('is_completed')) {
        completedFilter = `${alias}.is_completed = true`;
    } else if (completedAt !== 'NULL') {
        completedFilter = `${completedAt} IS NOT NULL`;
    }

    const passedCase = columns.has('passed')
        ? `CASE WHEN ${alias}.passed = true THEN 1 ELSE 0 END`
        : '0';

    return {
        score: scoreExpr,
        timeSpent: timeExpr,
        completedAt,
        completedFilter,
        passedCase
    };
}

function buildTeacherClassScopeSql(teacherParamRef, classAlias = 'c') {
    return `(
        ${classAlias}.homeroom_teacher_id = ${teacherParamRef}
        OR EXISTS (
            SELECT 1
            FROM teacher_class_subjects tcs_scope
            WHERE tcs_scope.class_id = ${classAlias}.id
              AND tcs_scope.teacher_id = ${teacherParamRef}
        )
    )`;
}

function sanitizePeriodDays(rawValue, fallback = 30) {
    const parsed = Number.parseInt(String(rawValue ?? fallback), 10);
    if (!Number.isFinite(parsed)) return fallback;
    if (parsed < 1) return 1;
    if (parsed > 365) return 365;
    return parsed;
}

// All routes require authentication
router.use(authenticate);

/**
 * ========================================
 * SCHOOL ADMIN ANALYTICS
 * ========================================
 */

/**
 * GET /api/analytics/school/overview
 * Get comprehensive school analytics
 */
router.get('/school/overview', authorize('school_admin', 'teacher'), async (req, res) => {
    try {
        const schoolId = req.user.school_id;
        const isTeacher = req.user.role === 'teacher';
        const { period = '30', grade_level, subject_id } = req.query; // days
        const periodDays = sanitizePeriodDays(period, 30);
        const { nameRu, nameUz } = await getSubjectNameExpressions();
        const attempt = await getAttemptExpressions();
        const classGradeColumn = await getClassGradeColumn();
        const params = [schoolId];
        const addParam = (value) => {
            params.push(value);
            return `$${params.length}`;
        };
        const gradeParam = grade_level ? addParam(grade_level) : null;
        const subjectParam = subject_id ? addParam(subject_id) : null;
        const teacherParam = isTeacher ? addParam(req.user.id) : null;

        const gradeJoin = (gradeParam || teacherParam) ? `
                JOIN users u ON u.id = ta.student_id
                JOIN class_students cs ON cs.student_id = u.id AND cs.is_active = true
                JOIN classes c ON c.id = cs.class_id
        ` : '';
        const gradeWhere = gradeParam ? `AND c.${classGradeColumn} = ${gradeParam}` : '';
        const subjectWhere = subjectParam ? `AND t.subject_id = ${subjectParam}` : '';
        const teacherWhere = teacherParam
            ? `AND ${buildTeacherClassScopeSql(teacherParam, 'c')}`
            : '';

        const totalStudentsExpression = (gradeParam || teacherParam)
            ? `(SELECT COUNT(DISTINCT u.id)
                FROM users u
                JOIN class_students cs ON cs.student_id = u.id
                JOIN classes c ON c.id = cs.class_id
                WHERE u.school_id = $1
                  AND u.role = 'student'
                  AND u.is_active = true
                  ${gradeWhere}
                  ${teacherWhere})`
            : `(SELECT COUNT(*) FROM users WHERE school_id = $1 AND role = 'student' AND is_active = true)`;

        const totalTestsExpression = (gradeParam || subjectParam || teacherParam)
            ? `(SELECT COUNT(DISTINCT t.id)
                FROM tests t
                JOIN test_attempts ta ON ta.test_id = t.id
                ${gradeJoin}
                WHERE t.school_id = $1
                  AND ${attempt.completedFilter}
                  ${gradeWhere}
                  ${teacherWhere}
                  ${subjectWhere})`
            : `(SELECT COUNT(*) FROM tests WHERE school_id = $1)`;

        const totalTeachersExpression = teacherParam
            ? `(SELECT COUNT(DISTINCT u.id)
                FROM users u
                JOIN teacher_class_subjects tcs ON tcs.teacher_id = u.id
                JOIN classes c ON c.id = tcs.class_id
                WHERE u.school_id = $1
                  AND u.role = 'teacher'
                  AND u.is_active = true
                  AND ${buildTeacherClassScopeSql(teacherParam, 'c')})`
            : `(SELECT COUNT(*) FROM users WHERE school_id = $1 AND role = 'teacher' AND is_active = true)`;

        const totalClassesExpression = teacherParam
            ? `(SELECT COUNT(DISTINCT c.id)
                FROM classes c
                WHERE c.school_id = $1
                  AND ${buildTeacherClassScopeSql(teacherParam, 'c')})`
            : `(SELECT COUNT(*) FROM classes WHERE school_id = $1)`;

        const totalSubjectsExpression = teacherParam
            ? `(SELECT COUNT(DISTINCT s.id)
                FROM teacher_class_subjects tcs
                JOIN subjects s ON s.id = tcs.subject_id
                WHERE tcs.teacher_id = ${teacherParam}
                  AND s.school_id = $1
                  AND s.is_active = true)`
            : `(SELECT COUNT(*) FROM subjects WHERE school_id = $1)`;

        // Overall statistics
        const overallStats = await query(`
            SELECT
                ${totalStudentsExpression} as total_students,
                ${totalTeachersExpression} as total_teachers,
                ${totalClassesExpression} as total_classes,
                ${totalSubjectsExpression} as total_subjects,
                ${totalTestsExpression} as total_tests,
                (SELECT COUNT(*)
                 FROM test_attempts ta
                 JOIN tests t ON t.id = ta.test_id
                 ${gradeJoin}
                 WHERE t.school_id = $1
                   AND ${attempt.completedFilter}
                   ${gradeWhere}
                   ${teacherWhere}
                   ${subjectWhere}) as total_attempts,
                (SELECT AVG(${attempt.score})
                 FROM test_attempts ta
                 JOIN tests t ON t.id = ta.test_id
                 ${gradeJoin}
                 WHERE t.school_id = $1
                   AND ${attempt.completedFilter}
                   ${gradeWhere}
                   ${teacherWhere}
                   ${subjectWhere}) as average_score
        `, params);

        // Recent activity (last N days)
        const recentActivity = await query(`
            SELECT
                                DATE(${attempt.completedAt}) as date,
                COUNT(*) as attempts,
                                AVG(${attempt.score}) as avg_score
            FROM test_attempts ta
            JOIN tests t ON t.id = ta.test_id
            ${gradeJoin}
            WHERE t.school_id = $1 
                            AND ${attempt.completedFilter}
                            ${gradeWhere}
                            ${teacherWhere}
                            ${subjectWhere}
                            AND ${attempt.completedAt} > CURRENT_DATE - INTERVAL '${periodDays} days'
                        GROUP BY DATE(${attempt.completedAt})
            ORDER BY date DESC
        `, params);

        // Top performing classes
        const topClasses = await query(`
            SELECT
                c.id,
                c.name,
                c.${classGradeColumn} as grade_level,
                COUNT(DISTINCT ta.student_id) as student_count,
                COUNT(ta.id) as total_attempts,
                AVG(${attempt.score}) as avg_score,
                SUM(${attempt.passedCase})::float / NULLIF(COUNT(ta.id), 0) * 100 as pass_rate
            FROM classes c
            LEFT JOIN class_students cs ON cs.class_id = c.id AND cs.is_active = true
            LEFT JOIN test_attempts ta ON ta.student_id = cs.student_id
                AND ${attempt.completedFilter}
                AND EXISTS (
                    SELECT 1
                    FROM tests t_scope
                    WHERE t_scope.id = ta.test_id
                      AND t_scope.school_id = $1
                )
            LEFT JOIN tests t ON t.id = ta.test_id
            WHERE c.school_id = $1
              ${gradeParam ? `AND c.${classGradeColumn} = ${gradeParam}` : ''}
              ${teacherWhere}
              ${subjectWhere}
            GROUP BY c.id, c.name, c.${classGradeColumn}
            HAVING COUNT(ta.id) > 0
            ORDER BY avg_score DESC
            LIMIT 10
        `, params);

        // Subject performance
        const subjectPerformance = await query(`
            SELECT
                s.id,
                ${nameRu} as name_ru,
                ${nameUz} as name_uz,
                s.code,
                s.color,
                COUNT(DISTINCT t.id) as test_count,
                COUNT(ta.id) as attempt_count,
                COALESCE(AVG(${attempt.score}), 0) as avg_score,
                COALESCE(MIN(${attempt.score}), 0) as min_score,
                COALESCE(MAX(${attempt.score}), 0) as max_score,
                COALESCE(AVG(EXTRACT(EPOCH FROM (${attempt.completedAt} - ta.started_at)) / 60), 0) as avg_time_minutes
            FROM subjects s
            LEFT JOIN tests t ON t.subject_id = s.id AND t.school_id = $1
            LEFT JOIN test_attempts ta ON ta.test_id = t.id AND ${attempt.completedFilter}
            LEFT JOIN users u ON u.id = ta.student_id
            LEFT JOIN class_students cs ON cs.student_id = u.id AND cs.is_active = true
            LEFT JOIN classes c ON c.id = cs.class_id
            WHERE s.school_id = $1
              ${subjectParam ? `AND s.id = ${subjectParam}` : ''}
              ${gradeWhere}
              ${teacherWhere}
            GROUP BY s.id, ${nameRu}, ${nameUz}, s.code, s.color
            ORDER BY test_count DESC, avg_score DESC
        `, params);

        res.json({
            overview: overallStats.rows[0],
            recent_activity: recentActivity.rows,
            top_classes: topClasses.rows,
            subject_performance: subjectPerformance.rows
        });
    } catch (error) {
        console.error('School analytics error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch analytics'
        });
    }
});

/**
 * GET /api/analytics/school/heatmap
 * Get heatmap data for student performance by subject and time
 */
router.get('/school/heatmap', authorize('school_admin', 'teacher'), async (req, res) => {
    try {
        const schoolId = req.user.school_id;
        const isTeacher = req.user.role === 'teacher';
        const { grade_level, period = '90' } = req.query;
        const periodDays = sanitizePeriodDays(period, 90);
        const { nameRu } = await getSubjectNameExpressions();
        const attempt = await getAttemptExpressions();
        const classGradeColumn = await getClassGradeColumn();

        let gradeFilter = '';
        let teacherFilter = '';
        const params = [schoolId];

        if (grade_level) {
            params.push(grade_level);
            gradeFilter = `AND c.${classGradeColumn} = $2`;
        }
        if (isTeacher) {
            params.push(req.user.id);
            const teacherParam = `$${params.length}`;
            teacherFilter = `AND ${buildTeacherClassScopeSql(teacherParam, 'c')}`;
        }

        // Get heatmap data: [subject, week, average_score]
        const heatmapData = await query(`
            SELECT
                ${nameRu} as subject,
                                EXTRACT(WEEK FROM ${attempt.completedAt}) as week,
                                DATE_TRUNC('week', ${attempt.completedAt}) as week_start,
                                AVG(${attempt.score}) as avg_score,
                COUNT(ta.id) as attempt_count
            FROM test_attempts ta
            JOIN tests t ON t.id = ta.test_id
            JOIN subjects s ON s.id = t.subject_id
            JOIN users u ON u.id = ta.student_id
            JOIN class_students cs ON cs.student_id = u.id
            JOIN classes c ON c.id = cs.class_id
                        WHERE t.school_id = $1
                            AND ${attempt.completedFilter}
                            AND ${attempt.completedAt} > CURRENT_DATE - INTERVAL '${periodDays} days'
              ${gradeFilter}
              ${teacherFilter}
                        GROUP BY ${nameRu}, EXTRACT(WEEK FROM ${attempt.completedAt}), DATE_TRUNC('week', ${attempt.completedAt})
            ORDER BY week_start DESC, subject
        `, params);

        res.json({
            heatmap: heatmapData.rows,
            period: periodDays,
            grade_level: grade_level || 'all'
        });
    } catch (error) {
        console.error('Heatmap error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to generate heatmap'
        });
    }
});

/**
 * GET /api/analytics/school/risk-dashboard
 * Students-at-risk dashboard with role-aware scope
 */
router.get('/school/risk-dashboard', authorize('school_admin', 'teacher'), async (req, res) => {
    try {
        const schoolId = req.user.school_id;
        const isTeacher = req.user.role === 'teacher';
        const periodDays = sanitizePeriodDays(req.query.period, 30);
        const riskThresholdRaw = Number.parseFloat(String(req.query.risk_threshold ?? 60));
        const riskThreshold = Number.isFinite(riskThresholdRaw)
            ? Math.min(Math.max(riskThresholdRaw, 1), 100)
            : 60;
        const minAttemptsRaw = Number.parseInt(String(req.query.min_attempts ?? 1), 10);
        const minAttempts = Number.isFinite(minAttemptsRaw)
            ? Math.min(Math.max(minAttemptsRaw, 0), 30)
            : 1;
        const pageRaw = Number.parseInt(String(req.query.page ?? 1), 10);
        const limitRaw = Number.parseInt(String(req.query.limit ?? 20), 10);
        const page = Number.isFinite(pageRaw) ? Math.max(pageRaw, 1) : 1;
        const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 20;
        const offset = (page - 1) * limit;
        const { grade_level, subject_id } = req.query;

        const attempt = await getAttemptExpressions();
        const classGradeColumn = await getClassGradeColumn();
        const attemptDateExpr = attempt.completedAt !== 'NULL' ? attempt.completedAt : 'ta.created_at';

        const params = [schoolId];
        const addParam = (value) => {
            params.push(value);
            return `$${params.length}`;
        };

        const gradeParam = grade_level ? addParam(grade_level) : null;
        const subjectParam = subject_id ? addParam(subject_id) : null;
        const teacherParam = isTeacher ? addParam(req.user.id) : null;
        const riskThresholdParam = addParam(riskThreshold);
        const minAttemptsParam = addParam(minAttempts);
        const limitParam = addParam(limit);
        const offsetParam = addParam(offset);

        const scopeFilters = [
            'u.school_id = $1',
            "u.role = 'student'",
            'u.is_active = true',
            'c.school_id = $1',
            'cs.is_active = true'
        ];

        if (gradeParam) {
            scopeFilters.push(`c.${classGradeColumn} = ${gradeParam}`);
        }
        if (teacherParam) {
            scopeFilters.push(buildTeacherClassScopeSql(teacherParam, 'c'));
        }

        const subjectFilter = subjectParam ? `AND t.subject_id = ${subjectParam}` : '';

        const riskResult = await query(
            `
            WITH scope_students AS (
                SELECT
                    student_id,
                    first_name,
                    last_name,
                    username,
                    class_id,
                    class_name,
                    grade_level
                FROM (
                    SELECT
                        u.id as student_id,
                        u.first_name,
                        u.last_name,
                        u.username,
                        c.id as class_id,
                        c.name as class_name,
                        c.${classGradeColumn} as grade_level,
                        ROW_NUMBER() OVER (PARTITION BY u.id ORDER BY c.name ASC) as rn
                    FROM users u
                    JOIN class_students cs ON cs.student_id = u.id
                    JOIN classes c ON c.id = cs.class_id
                    WHERE ${scopeFilters.join(' AND ')}
                ) ranked
                WHERE ranked.rn = 1
            ),
            attempt_stats AS (
                SELECT
                    ta.student_id,
                    COUNT(*) FILTER (WHERE ${attempt.completedFilter}) as attempts_completed,
                    AVG(${attempt.score}) FILTER (WHERE ${attempt.completedFilter}) as avg_score,
                    MAX(${attemptDateExpr}) FILTER (WHERE ${attempt.completedFilter}) as last_attempt_at
                FROM test_attempts ta
                JOIN tests t ON t.id = ta.test_id
                JOIN scope_students ss ON ss.student_id = ta.student_id
                WHERE ${attemptDateExpr} > CURRENT_DATE - INTERVAL '${periodDays} days'
                  ${subjectFilter}
                GROUP BY ta.student_id
            ),
            enriched AS (
                SELECT
                    ss.student_id as id,
                    ss.first_name,
                    ss.last_name,
                    ss.username,
                    ss.class_id,
                    ss.class_name,
                    ss.grade_level,
                    COALESCE(ast.attempts_completed, 0) as attempts_completed,
                    COALESCE(ast.avg_score, 0) as avg_score,
                    ast.last_attempt_at,
                    CASE
                        WHEN COALESCE(ast.attempts_completed, 0) = 0 THEN 'critical'
                        WHEN COALESCE(ast.avg_score, 0) < ${riskThresholdParam} - 15 THEN 'critical'
                        WHEN COALESCE(ast.avg_score, 0) < ${riskThresholdParam} THEN 'high'
                        WHEN COALESCE(ast.avg_score, 0) < ${riskThresholdParam} + 10 THEN 'medium'
                        ELSE 'safe'
                    END as risk_level
                FROM scope_students ss
                LEFT JOIN attempt_stats ast ON ast.student_id = ss.student_id
            )
            SELECT
                (SELECT COUNT(*) FROM enriched) as total_students,
                (SELECT COUNT(*) FROM enriched WHERE risk_level = 'critical') as critical_count,
                (SELECT COUNT(*) FROM enriched WHERE risk_level = 'high') as high_count,
                (SELECT COUNT(*) FROM enriched WHERE risk_level = 'medium') as medium_count,
                (SELECT AVG(avg_score) FROM enriched WHERE attempts_completed > 0) as average_score,
                (SELECT COUNT(*) FROM enriched WHERE attempts_completed = 0) as no_data_count,
                (
                    SELECT COUNT(*)
                    FROM enriched
                    WHERE risk_level <> 'safe'
                      AND (attempts_completed >= ${minAttemptsParam} OR attempts_completed = 0)
                ) as total_risk_students,
                (
                    SELECT COALESCE(json_agg(x), '[]'::json)
                    FROM (
                        SELECT
                            id, first_name, last_name, username,
                            class_id, class_name, grade_level,
                            attempts_completed, avg_score, last_attempt_at, risk_level
                        FROM enriched
                        WHERE risk_level <> 'safe'
                          AND (attempts_completed >= ${minAttemptsParam} OR attempts_completed = 0)
                        ORDER BY
                            CASE risk_level WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
                            avg_score ASC NULLS FIRST,
                            attempts_completed ASC
                        LIMIT ${limitParam} OFFSET ${offsetParam}
                    ) x
                ) as students,
                (
                    SELECT COALESCE(json_agg(y), '[]'::json)
                    FROM (
                        SELECT
                            class_id,
                            class_name,
                            COUNT(*) FILTER (WHERE risk_level = 'critical') as critical_count,
                            COUNT(*) FILTER (WHERE risk_level = 'high') as high_count,
                            COUNT(*) FILTER (WHERE risk_level = 'medium') as medium_count,
                            COUNT(*) as total_students
                        FROM enriched
                        GROUP BY class_id, class_name
                        ORDER BY critical_count DESC, high_count DESC, class_name ASC
                        LIMIT 30
                    ) y
                ) as classes
            `,
            params
        );

        const row = riskResult.rows[0] || {};
        res.json({
            summary: {
                total_students: parseInt(row.total_students || 0, 10),
                critical_count: parseInt(row.critical_count || 0, 10),
                high_count: parseInt(row.high_count || 0, 10),
                medium_count: parseInt(row.medium_count || 0, 10),
                no_data_count: parseInt(row.no_data_count || 0, 10),
                average_score: row.average_score
            },
            risk_threshold: riskThreshold,
            min_attempts: minAttempts,
            students: Array.isArray(row.students) ? row.students : [],
            classes: Array.isArray(row.classes) ? row.classes : [],
            pagination: {
                page,
                limit,
                total: parseInt(row.total_risk_students || 0, 10),
                has_more: offset + limit < parseInt(row.total_risk_students || 0, 10)
            }
        });
    } catch (error) {
        console.error('Risk dashboard analytics error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch risk dashboard analytics'
        });
    }
});

/**
 * GET /api/analytics/school/comparison
 * Compare performance across different dimensions
 */
router.get('/school/comparison', authorize('school_admin', 'teacher'), async (req, res) => {
    try {
        const schoolId = req.user.school_id;
        const isTeacher = req.user.role === 'teacher';
        const { type = 'classes', subject_id, grade_level } = req.query;
        const { nameRu, nameUz } = await getSubjectNameExpressions();
        const attempt = await getAttemptExpressions();
        const classGradeColumn = await getClassGradeColumn();

        let comparisonData;

        if (type === 'classes') {
            const params = [schoolId];
            const conditions = ['c.school_id = $1'];
            if (isTeacher) {
                params.push(req.user.id);
                const teacherParam = `$${params.length}`;
                conditions.push(buildTeacherClassScopeSql(teacherParam, 'c'));
            }
            if (grade_level) {
                params.push(grade_level);
                conditions.push(`c.${classGradeColumn} = $${params.length}`);
            }
            if (subject_id) {
                params.push(subject_id);
                conditions.push(`t.subject_id = $${params.length}`);
            }

            // Compare classes
            comparisonData = await query(`
                SELECT
                    c.id,
                    c.name,
                    c.${classGradeColumn} as grade_level,
                    COUNT(DISTINCT cs.student_id) as student_count,
                    COUNT(ta.id) as total_attempts,
                    AVG(${attempt.score}) as avg_score,
                    STDDEV(${attempt.score}) as score_stddev,
                    MIN(${attempt.score}) as min_score,
                    MAX(${attempt.score}) as max_score,
                    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${attempt.score}) as median_score
                FROM classes c
                JOIN class_students cs ON cs.class_id = c.id
                    AND cs.is_active = true
                LEFT JOIN test_attempts ta ON ta.student_id = cs.student_id
                    AND ${attempt.completedFilter}
                    AND EXISTS (
                        SELECT 1
                        FROM tests t_scope
                        WHERE t_scope.id = ta.test_id
                          AND t_scope.school_id = $1
                    )
                LEFT JOIN tests t ON t.id = ta.test_id
                LEFT JOIN subjects s ON s.id = t.subject_id
                WHERE ${conditions.join(' AND ')}
                GROUP BY c.id, c.name, c.${classGradeColumn}
                ORDER BY NULLIF(REGEXP_REPLACE(c.${classGradeColumn}::text, '[^0-9]', '', 'g'), '')::int NULLS LAST, c.name
            `, params);
        } else if (type === 'subjects') {
            const params = [schoolId];
            const conditions = ['s.school_id = $1'];
            if (isTeacher) {
                params.push(req.user.id);
                const teacherParam = `$${params.length}`;
                conditions.push(buildTeacherClassScopeSql(teacherParam, 'c'));
            }
            if (subject_id) {
                params.push(subject_id);
                conditions.push(`s.id = $${params.length}`);
            }
            if (grade_level) {
                params.push(grade_level);
                conditions.push(`c.${classGradeColumn} = $${params.length}`);
            }

            // Compare subjects
            comparisonData = await query(`
                SELECT
                    s.id,
                    ${nameRu} as name_ru,
                    ${nameUz} as name_uz,
                    s.code,
                    s.color,
                    COUNT(DISTINCT t.id) as test_count,
                    COUNT(ta.id) as attempt_count,
                    AVG(${attempt.score}) as avg_score,
                    STDDEV(${attempt.score}) as score_stddev,
                    MIN(${attempt.score}) as min_score,
                    MAX(${attempt.score}) as max_score,
                    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${attempt.score}) as median_score,
                    AVG(${attempt.timeSpent}) / 60 as avg_time_minutes
                FROM subjects s
                LEFT JOIN tests t ON t.subject_id = s.id AND t.school_id = $1
                LEFT JOIN test_attempts ta ON ta.test_id = t.id AND ${attempt.completedFilter}
                LEFT JOIN users u ON u.id = ta.student_id
                LEFT JOIN class_students cs ON cs.student_id = u.id AND cs.is_active = true
                LEFT JOIN classes c ON c.id = cs.class_id
                WHERE ${conditions.join(' AND ')}
                GROUP BY s.id, ${nameRu}, ${nameUz}, s.code, s.color
                HAVING COUNT(ta.id) > 0
                ORDER BY avg_score DESC
            `, params);
        } else if (type === 'students') {
            const params = [schoolId];
            const conditions = ['u.school_id = $1', `u.role = 'student'`];
            if (isTeacher) {
                params.push(req.user.id);
                const teacherParam = `$${params.length}`;
                conditions.push(buildTeacherClassScopeSql(teacherParam, 'c'));
            }
            if (grade_level) {
                params.push(grade_level);
                conditions.push(`c.${classGradeColumn} = $${params.length}`);
            }
            if (subject_id) {
                params.push(subject_id);
                conditions.push(`EXISTS (SELECT 1 FROM tests t WHERE t.id = ta.test_id AND t.subject_id = $${params.length})`);
            }

            // Compare student performance
            comparisonData = await query(`
                SELECT
                    u.id,
                    u.first_name,
                    u.last_name,
                    c.name as class_name,
                    COUNT(ta.id) as total_attempts,
                    AVG(${attempt.score}) as avg_score,
                    STDDEV(${attempt.score}) as score_stddev,
                    MIN(${attempt.score}) as min_score,
                    MAX(${attempt.score}) as max_score,
                    SUM(${attempt.passedCase})::float / NULLIF(COUNT(ta.id), 0) * 100 as pass_rate,
                    AVG(${attempt.timeSpent}) / 60 as avg_time_minutes
                FROM users u
                JOIN class_students cs ON cs.student_id = u.id
                    AND cs.is_active = true
                JOIN classes c ON c.id = cs.class_id
                LEFT JOIN test_attempts ta ON ta.student_id = u.id
                    AND ${attempt.completedFilter}
                    AND EXISTS (
                        SELECT 1
                        FROM tests t_scope
                        WHERE t_scope.id = ta.test_id
                          AND t_scope.school_id = $1
                    )
                WHERE ${conditions.join(' AND ')}
                GROUP BY u.id, u.first_name, u.last_name, c.name
                HAVING COUNT(ta.id) > 0
                ORDER BY avg_score DESC
                LIMIT 100
            `, params);
        }

        res.json({
            type,
            data: comparisonData.rows
        });
    } catch (error) {
        console.error('Comparison error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to generate comparison'
        });
    }
});

/**
 * GET /api/analytics/class/:id/detailed
 * Get detailed analytics for a specific class
 */
router.get('/class/:id/detailed', authorize('school_admin', 'teacher'), async (req, res) => {
    try {
        const { id } = req.params;
        const schoolId = req.user.school_id;
        const isTeacher = req.user.role === 'teacher';
        const { nameRu } = await getSubjectNameExpressions();
        const attempt = await getAttemptExpressions();
        const classGradeColumn = await getClassGradeColumn();

        // Verify access
        const accessParams = [id, schoolId];
        const teacherScopeCondition = isTeacher
            ? ` AND ${buildTeacherClassScopeSql(`$${accessParams.push(req.user.id)}`, 'classes')}`
            : '';
        const classCheck = await query(
            `SELECT id, name, ${classGradeColumn} as grade_level
             FROM classes
             WHERE id = $1
               AND school_id = $2
               ${teacherScopeCondition}`,
            accessParams
        );

        if (classCheck.rows.length === 0) {
            return res.status(404).json({
                error: 'not_found',
                message: 'Class not found'
            });
        }

        const classInfo = classCheck.rows[0];

        // Student performance matrix
        const studentPerformance = await query(`
            SELECT
                u.id as student_id,
                u.first_name,
                u.last_name,
                ${nameRu} as subject,
                COUNT(ta.id) as attempts,
                AVG(${attempt.score}) as avg_score,
                MAX(${attempt.score}) as best_score,
                SUM(${attempt.passedCase}) as passed_count
            FROM users u
            JOIN class_students cs ON cs.student_id = u.id
            LEFT JOIN test_attempts ta ON ta.student_id = u.id
                AND ${attempt.completedFilter}
                AND EXISTS (
                    SELECT 1
                    FROM test_assignments tas
                    WHERE tas.id = ta.assignment_id
                      AND tas.class_id = $1
                )
                AND EXISTS (
                    SELECT 1
                    FROM tests t_scope
                    WHERE t_scope.id = ta.test_id
                      AND t_scope.school_id = $2
                )
            LEFT JOIN tests t ON t.id = ta.test_id
            LEFT JOIN subjects s ON s.id = t.subject_id
            WHERE cs.class_id = $1
              AND cs.is_active = true
            GROUP BY u.id, u.first_name, u.last_name, ${nameRu}
            ORDER BY u.last_name, u.first_name, ${nameRu}
        `, [id, schoolId]);

        // Subject breakdown for the class
        const subjectBreakdown = await query(`
            SELECT
                ${nameRu} as subject,
                COUNT(DISTINCT ta.id) as total_attempts,
                AVG(${attempt.score}) as avg_score,
                STDDEV(${attempt.score}) as score_stddev,
                MIN(${attempt.score}) as min_score,
                MAX(${attempt.score}) as max_score,
                COUNT(DISTINCT ta.student_id) as students_participated
            FROM test_attempts ta
            JOIN tests t ON t.id = ta.test_id
            JOIN subjects s ON s.id = t.subject_id
            JOIN class_students cs ON cs.student_id = ta.student_id
            WHERE cs.class_id = $1
              AND cs.is_active = true
              AND t.school_id = $2
              AND EXISTS (
                    SELECT 1
                    FROM test_assignments tas
                    WHERE tas.id = ta.assignment_id
                      AND tas.class_id = $1
              )
              AND ${attempt.completedFilter}
            GROUP BY ${nameRu}
            ORDER BY avg_score DESC
        `, [id, schoolId]);

        // Time-based progress
        const progressOverTime = await query(`
            SELECT
                                DATE_TRUNC('week', ${attempt.completedAt}) as week,
                                AVG(${attempt.score}) as avg_score,
                COUNT(ta.id) as attempts
            FROM test_attempts ta
            JOIN class_students cs ON cs.student_id = ta.student_id
            JOIN tests t ON t.id = ta.test_id
                        WHERE cs.class_id = $1
                            AND cs.is_active = true
                            AND t.school_id = $2
                            AND EXISTS (
                                SELECT 1
                                FROM test_assignments tas
                                WHERE tas.id = ta.assignment_id
                                  AND tas.class_id = $1
                            )
                            AND ${attempt.completedFilter}
                            AND ${attempt.completedAt} > CURRENT_DATE - INTERVAL '90 days'
                        GROUP BY DATE_TRUNC('week', ${attempt.completedAt})
            ORDER BY week
        `, [id, schoolId]);

        // Student rankings
        const rankings = await query(`
            SELECT
                u.id,
                u.first_name,
                u.last_name,
                COUNT(ta.id) as total_attempts,
                AVG(${attempt.score}) as avg_score,
                RANK() OVER (ORDER BY AVG(${attempt.score}) DESC) as rank
            FROM users u
            JOIN class_students cs ON cs.student_id = u.id
            LEFT JOIN test_attempts ta ON ta.student_id = u.id
                AND ${attempt.completedFilter}
                AND EXISTS (
                    SELECT 1
                    FROM test_assignments tas
                    WHERE tas.id = ta.assignment_id
                      AND tas.class_id = $1
                )
                AND EXISTS (
                    SELECT 1
                    FROM tests t_scope
                    WHERE t_scope.id = ta.test_id
                      AND t_scope.school_id = $2
                )
            WHERE cs.class_id = $1
              AND cs.is_active = true
            GROUP BY u.id, u.first_name, u.last_name
            HAVING COUNT(ta.id) > 0
            ORDER BY rank
        `, [id, schoolId]);

        res.json({
            class: classInfo,
            student_performance: studentPerformance.rows,
            subject_breakdown: subjectBreakdown.rows,
            progress_over_time: progressOverTime.rows,
            rankings: rankings.rows
        });
    } catch (error) {
        console.error('Detailed class analytics error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch class analytics'
        });
    }
});

/**
 * GET /api/analytics/student/:id/report
 * Get comprehensive student performance report
 */
router.get('/student/:id/report', authorize('school_admin', 'teacher', 'student'), async (req, res) => {
    try {
        const { id } = req.params;
        const schoolId = req.user.school_id;
        const { nameRu } = await getSubjectNameExpressions();
        const attempt = await getAttemptExpressions();
        const classGradeColumn = await getClassGradeColumn();

        // If student, can only view own report
        if (req.user.role === 'student' && String(req.user.id) !== String(id)) {
            return res.status(403).json({
                error: 'forbidden',
                message: 'Access denied'
            });
        }

        // If teacher, can only view students from own scoped classes.
        if (req.user.role === 'teacher') {
            const teacherScopeResult = await query(
                `SELECT 1
                 FROM class_students cs
                 JOIN classes c ON c.id = cs.class_id
                 WHERE cs.student_id = $1
                   AND cs.is_active = true
                   AND c.school_id = $2
                   AND (
                        c.homeroom_teacher_id = $3
                        OR EXISTS (
                            SELECT 1
                            FROM teacher_class_subjects tcs
                            WHERE tcs.class_id = c.id
                              AND tcs.teacher_id = $3
                        )
                   )
                 LIMIT 1`,
                [id, schoolId, req.user.id]
            );

            if (teacherScopeResult.rows.length === 0) {
                return res.status(403).json({
                    error: 'forbidden',
                    message: 'Access denied'
                });
            }
        }

        // Get student info
        const studentInfo = await query(`
            SELECT
                u.id, u.first_name, u.last_name, u.email,
                c.name as class_name, c.${classGradeColumn} as grade_level
            FROM users u
            LEFT JOIN class_students cs ON cs.student_id = u.id AND cs.is_active = true
            LEFT JOIN classes c ON c.id = cs.class_id
            WHERE u.id = $1
              AND u.school_id = $2
              AND u.role = 'student'
        `, [id, schoolId]);

        if (studentInfo.rows.length === 0) {
            return res.status(404).json({
                error: 'not_found',
                message: 'Student not found'
            });
        }

        // Overall statistics
        const overallStats = await query(`
            SELECT
                COUNT(*) as total_attempts,
                AVG(${attempt.score}) as avg_score,
                MIN(${attempt.score}) as min_score,
                MAX(${attempt.score}) as max_score,
                SUM(${attempt.passedCase}) as passed_count,
                AVG(${attempt.timeSpent}) / 60 as avg_time_minutes
            FROM test_attempts ta
            JOIN tests t ON t.id = ta.test_id
            WHERE ta.student_id = $1
              AND t.school_id = $2
              AND ${attempt.completedFilter}
        `, [id, schoolId]);

        // Performance by subject
        const subjectPerformance = await query(`
            SELECT
                ${nameRu} as subject,
                COUNT(ta.id) as attempts,
                AVG(${attempt.score}) as avg_score,
                MAX(${attempt.score}) as best_score,
                MIN(${attempt.score}) as worst_score,
                SUM(${attempt.passedCase})::float / NULLIF(COUNT(ta.id), 0) * 100 as pass_rate
            FROM test_attempts ta
            JOIN tests t ON t.id = ta.test_id
            JOIN subjects s ON s.id = t.subject_id
            WHERE ta.student_id = $1
              AND t.school_id = $2
              AND ${attempt.completedFilter}
            GROUP BY ${nameRu}
            ORDER BY avg_score DESC
        `, [id, schoolId]);

        // Progress over time
        const progress = await query(`
            SELECT
                                DATE_TRUNC('week', ${attempt.completedAt}) as week,
                                AVG(${attempt.score}) as avg_score,
                COUNT(*) as attempts
                        FROM test_attempts ta
                        JOIN tests t ON t.id = ta.test_id
                        WHERE ta.student_id = $1
                          AND t.school_id = $2
                          AND ${attempt.completedFilter}
                            AND ${attempt.completedAt} > CURRENT_DATE - INTERVAL '90 days'
                        GROUP BY DATE_TRUNC('week', ${attempt.completedAt})
            ORDER BY week
        `, [id, schoolId]);

        // Strengths and weaknesses (by subject)
        const strengths = await query(`
            SELECT
                ${nameRu} as subject,
                AVG(${attempt.score}) as avg_score
            FROM test_attempts ta
            JOIN tests t ON t.id = ta.test_id
            JOIN subjects s ON s.id = t.subject_id
            WHERE ta.student_id = $1
              AND t.school_id = $2
              AND ${attempt.completedFilter}
            GROUP BY ${nameRu}
            HAVING COUNT(*) >= 3
            ORDER BY avg_score DESC
            LIMIT 3
        `, [id, schoolId]);

        const weaknesses = await query(`
            SELECT
                ${nameRu} as subject,
                AVG(${attempt.score}) as avg_score
            FROM test_attempts ta
            JOIN tests t ON t.id = ta.test_id
            JOIN subjects s ON s.id = t.subject_id
            WHERE ta.student_id = $1
              AND t.school_id = $2
              AND ${attempt.completedFilter}
            GROUP BY ${nameRu}
            HAVING COUNT(*) >= 3
            ORDER BY avg_score ASC
            LIMIT 3
        `, [id, schoolId]);

        // Class ranking
        const ranking = await query(`
            WITH class_students AS (
                SELECT cs.student_id
                FROM class_students cs
                WHERE cs.class_id = (
                    SELECT class_id
                    FROM class_students
                    WHERE student_id = $1
                      AND is_active = true
                    LIMIT 1
                )
                  AND cs.is_active = true
            ),
            student_scores AS (
                SELECT
                    ta.student_id,
                    AVG(${attempt.score}) as avg_score
                FROM test_attempts ta
                JOIN tests t ON t.id = ta.test_id
                WHERE ta.student_id IN (SELECT student_id FROM class_students)
                  AND t.school_id = $2
                  AND ${attempt.completedFilter}
                GROUP BY ta.student_id
            )
            SELECT
                RANK() OVER (ORDER BY avg_score DESC) as rank,
                COUNT(*) OVER () as total_students
            FROM student_scores
            WHERE student_id = $1
        `, [id, schoolId]);

        res.json({
            student: studentInfo.rows[0],
            overall: overallStats.rows[0],
            by_subject: subjectPerformance.rows,
            progress: progress.rows,
            strengths: strengths.rows,
            weaknesses: weaknesses.rows,
            ranking: ranking.rows[0] || { rank: null, total_students: 0 }
        });
    } catch (error) {
        console.error('Student report error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to generate student report'
        });
    }
});

/**
 * GET /api/analytics/export/school
 * Export school analytics to Excel
 */
router.get('/export/school', authorize('school_admin', 'teacher'), async (req, res) => {
    try {
        const schoolId = req.user.school_id;
        const isTeacher = req.user.role === 'teacher';
        const teacherId = req.user.id;
        const { nameRu } = await getSubjectNameExpressions();
        const attempt = await getAttemptExpressions();
        const classGradeColumn = await getClassGradeColumn();
        const teacherScopeWhere = isTeacher
            ? `AND (
                    c.homeroom_teacher_id = $2
                    OR EXISTS (
                        SELECT 1
                        FROM teacher_class_subjects tcs_scope
                        WHERE tcs_scope.class_id = c.id
                          AND tcs_scope.teacher_id = $2
                    )
                )`
            : '';
        const teacherScopeParams = isTeacher ? [schoolId, teacherId] : [schoolId];

        // Get comprehensive data
        const studentsData = await query(`
            SELECT
                u.first_name, u.last_name,
                c.name as class,
                COUNT(ta.id) as total_attempts,
                AVG(${attempt.score}) as avg_score,
                MAX(${attempt.score}) as best_score,
                MIN(${attempt.score}) as worst_score,
                SUM(${attempt.passedCase}) as passed_tests
            FROM users u
            JOIN class_students cs ON cs.student_id = u.id AND cs.is_active = true
            JOIN classes c ON c.id = cs.class_id
            LEFT JOIN test_attempts ta ON ta.student_id = u.id
                AND ${attempt.completedFilter}
                AND EXISTS (
                    SELECT 1
                    FROM tests t_scope
                    WHERE t_scope.id = ta.test_id
                      AND t_scope.school_id = $1
                )
            WHERE u.school_id = $1 AND u.role = 'student'
              ${teacherScopeWhere}
            GROUP BY u.id, u.first_name, u.last_name, c.name
            ORDER BY c.name, u.last_name, u.first_name
        `, teacherScopeParams);

        const classesData = await query(`
            SELECT
                c.name,
                c.${classGradeColumn} as grade_level,
                COUNT(DISTINCT cs.student_id) as students,
                AVG(${attempt.score}) as avg_score
            FROM classes c
            LEFT JOIN class_students cs ON cs.class_id = c.id AND cs.is_active = true
            LEFT JOIN test_attempts ta ON ta.student_id = cs.student_id
                AND ${attempt.completedFilter}
                AND EXISTS (
                    SELECT 1
                    FROM tests t_scope
                    WHERE t_scope.id = ta.test_id
                      AND t_scope.school_id = $1
                )
            WHERE c.school_id = $1
              ${teacherScopeWhere}
            GROUP BY c.id, c.name, c.${classGradeColumn}
            ORDER BY NULLIF(REGEXP_REPLACE(c.${classGradeColumn}::text, '[^0-9]', '', 'g'), '')::int NULLS LAST, c.name
        `, teacherScopeParams);

        const subjectsData = await query(`
            SELECT
                ${nameRu} as subject,
                COUNT(DISTINCT t.id) as tests,
                COUNT(ta.id) as attempts,
                AVG(${attempt.score}) as avg_score
            FROM subjects s
            LEFT JOIN tests t ON t.subject_id = s.id AND t.school_id = $1
            LEFT JOIN test_attempts ta ON ta.test_id = t.id AND ${attempt.completedFilter}
            WHERE s.school_id = $1
              ${isTeacher ? `
                AND EXISTS (
                    SELECT 1
                    FROM teacher_class_subjects tcs_scope
                    WHERE tcs_scope.subject_id = s.id
                      AND tcs_scope.teacher_id = $2
                )` : ''}
            GROUP BY ${nameRu}
            ORDER BY subject
        `, teacherScopeParams);

        // Create workbook
        const workbook = XLSX.utils.book_new();

        // Add students sheet
        const studentsSheet = XLSX.utils.json_to_sheet(studentsData.rows);
        XLSX.utils.book_append_sheet(workbook, studentsSheet, 'Students');

        // Add classes sheet
        const classesSheet = XLSX.utils.json_to_sheet(classesData.rows);
        XLSX.utils.book_append_sheet(workbook, classesSheet, 'Classes');

        // Add subjects sheet
        const subjectsSheet = XLSX.utils.json_to_sheet(subjectsData.rows);
        XLSX.utils.book_append_sheet(workbook, subjectsSheet, 'Subjects');

        // Generate buffer
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        // Send file
        res.setHeader('Content-Disposition', `attachment; filename=school_analytics_${Date.now()}.xlsx`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);

    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to export analytics'
        });
    }
});

module.exports = router;
