const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

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

async function getCareerResultsSchema() {
    const columns = await getTableColumns('student_career_results');

    const hasCompletedAt = columns.has('completed_at');
    const hasTakenAt = columns.has('taken_at');

    const timeExpr = hasCompletedAt && hasTakenAt
        ? 'COALESCE(completed_at, taken_at)'
        : (hasCompletedAt ? 'completed_at' : (hasTakenAt ? 'taken_at' : 'NULL::timestamp'));

    const orderExpr = hasCompletedAt && hasTakenAt
        ? 'COALESCE(completed_at, taken_at)'
        : (hasCompletedAt ? 'completed_at' : (hasTakenAt ? 'taken_at' : 'id'));

    return {
        selectAttemptNo: columns.has('attempt_no') ? 'attempt_no' : 'NULL::integer AS attempt_no',
        selectInterestsScores: columns.has('interests_scores') ? 'interests_scores' : 'NULL::jsonb AS interests_scores',
        selectRecommendedSubjects: columns.has('recommended_subjects') ? 'recommended_subjects' : 'NULL::jsonb AS recommended_subjects',
        selectResults: columns.has('results') ? 'results' : 'NULL::jsonb AS results',
        selectReliability: columns.has('reliability') ? 'reliability' : 'NULL::jsonb AS reliability',
        selectTopInterests: columns.has('top_interests') ? 'top_interests' : 'NULL::text[] AS top_interests',
        selectRecommendations: columns.has('recommendations') ? 'recommendations' : 'NULL::text AS recommendations',
        timeExpr,
        orderExpr
    };
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

function normalizeExportCellValue(value) {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') return JSON.stringify(value);
    return value;
}

function appendJsonWorksheet(workbook, name, rows) {
    const worksheet = workbook.addWorksheet(name);
    const safeRows = Array.isArray(rows) ? rows : [];

    if (!safeRows.length) {
        worksheet.addRow(['No data']);
        return;
    }

    const headers = Array.from(
        safeRows.reduce((set, row) => {
            Object.keys(row || {}).forEach((key) => set.add(key));
            return set;
        }, new Set())
    );

    worksheet.columns = headers.map((header) => ({
        header,
        key: header,
        width: Math.min(40, Math.max(12, String(header).length + 2))
    }));

    safeRows.forEach((row) => {
        const item = {};
        headers.forEach((header) => {
            item[header] = normalizeExportCellValue(row?.[header]);
        });
        worksheet.addRow(item);
    });

    worksheet.getRow(1).font = { bold: true };
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
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

function resolveSchoolScope(req) {
    const isSuperadmin = req.user.role === 'superadmin';
    if (!isSuperadmin) {
        return { isSuperadmin: false, schoolId: req.user.school_id };
    }

    const rawSchoolId = String(req.query.school_id ?? req.query.schoolId ?? req.user.school_id ?? '').trim();
    if (!rawSchoolId) {
        return { isSuperadmin: true, schoolId: null };
    }

    return { isSuperadmin: true, schoolId: rawSchoolId };
}

const ANALYTICS_CACHE_TTL_MS = 10 * 60 * 1000;
const ANALYTICS_CACHE = new Map();

function sanitizeDirection(rawValue, fallback = 'DESC') {
    const value = String(rawValue || fallback).trim().toLowerCase();
    return value === 'asc' ? 'ASC' : 'DESC';
}

function clampInt(rawValue, min, max, fallback) {
    const parsed = Number.parseInt(String(rawValue ?? fallback), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(parsed, min), max);
}

function normalizeFilterValue(rawValue) {
    const value = String(rawValue ?? '').trim();
    return value ? value : null;
}

function parseDateOnly(rawValue) {
    const value = String(rawValue ?? '').trim();
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
}

function resolvePresetPeriodDays(rawPreset) {
    const preset = String(rawPreset || '').trim().toLowerCase();
    if (preset === 'this_week') return 7;
    if (preset === 'this_month') return 30;
    if (preset === 'current_quarter') return 90;
    if (preset === 'academic_year') return 270;
    return null;
}

function resolveDateRange(queryParams, fallbackDays = 30) {
    const presetDays = resolvePresetPeriodDays(queryParams?.period_preset);
    const periodDays = sanitizePeriodDays(queryParams?.period, presetDays ?? fallbackDays);
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - periodDays + 1);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);

    const customStart = parseDateOnly(queryParams?.date_from);
    const customEnd = parseDateOnly(queryParams?.date_to);

    if (customStart && customEnd) {
        customStart.setHours(0, 0, 0, 0);
        customEnd.setHours(23, 59, 59, 999);
        if (customStart.getTime() <= customEnd.getTime()) {
            const diffMs = customEnd.getTime() - customStart.getTime();
            const diffDays = Math.max(1, Math.round(diffMs / 86400000) + 1);
            return {
                startDate: customStart,
                endDate: customEnd,
                periodDays: diffDays
            };
        }
    }

    return {
        startDate: start,
        endDate: end,
        periodDays
    };
}

function buildAdvancedScopeParams(req, defaultPeriodDays = 30) {
    const { schoolId } = resolveSchoolScope(req);
    if (!schoolId) {
        return null;
    }

    const isTeacher = req.user.role === 'teacher';
    const teacherId = isTeacher ? String(req.user.id) : normalizeFilterValue(req.query.teacher_id);
    const range = resolveDateRange(req.query, defaultPeriodDays);

    return {
        schoolId,
        isTeacher,
        teacherId,
        gradeLevel: normalizeFilterValue(req.query.grade_level),
        classId: normalizeFilterValue(req.query.class_id),
        subjectId: normalizeFilterValue(req.query.subject_id),
        dateRange: range
    };
}

function applyAdvancedAttemptFilters({
    addParam,
    scope,
    classGradeColumn,
    classAlias = 'c',
    testAlias = 't',
    attemptCompletedExpr = 'ta.completed_at',
    includeDateRange = true
}) {
    const clauses = [];

    if (scope.gradeLevel) {
        clauses.push(`AND ${classAlias}.${classGradeColumn} = ${addParam(scope.gradeLevel)}`);
    }
    if (scope.classId) {
        clauses.push(`AND ${classAlias}.id = ${addParam(scope.classId)}`);
    }
    if (scope.subjectId) {
        clauses.push(`AND ${testAlias}.subject_id = ${addParam(scope.subjectId)}`);
    }
    if (scope.teacherId) {
        const teacherRef = addParam(scope.teacherId);
        clauses.push(`AND ${testAlias}.teacher_id = ${teacherRef}`);
    }
    if (includeDateRange) {
        const startRef = addParam(scope.dateRange.startDate);
        const endRef = addParam(scope.dateRange.endDate);
        clauses.push(`AND ${attemptCompletedExpr} BETWEEN ${startRef} AND ${endRef}`);
    }

    return clauses.join('\n');
}

function toCacheKey(prefix, req, scope, extra = {}) {
    return JSON.stringify({
        prefix,
        role: req.user.role,
        userId: req.user.id,
        schoolId: scope.schoolId,
        query: req.query,
        extra
    });
}

async function withAnalyticsCache(cacheKey, loader, ttlMs = ANALYTICS_CACHE_TTL_MS) {
    const now = Date.now();
    const existing = ANALYTICS_CACHE.get(cacheKey);
    if (existing && existing.expiresAt > now) {
        return existing.value;
    }

    const value = await loader();
    ANALYTICS_CACHE.set(cacheKey, {
        value,
        expiresAt: now + ttlMs
    });

    if (ANALYTICS_CACHE.size > 300) {
        for (const [key, entry] of ANALYTICS_CACHE.entries()) {
            if (entry.expiresAt <= now) {
                ANALYTICS_CACHE.delete(key);
            }
        }
    }

    return value;
}

function buildTeacherStatus(lastActivityAt) {
    if (!lastActivityAt) {
        return {
            code: 'inactive_long',
            label: 'давно не активен',
            days_since_activity: null
        };
    }

    const now = Date.now();
    const last = new Date(lastActivityAt).getTime();
    if (!Number.isFinite(last)) {
        return {
            code: 'inactive_long',
            label: 'давно не активен',
            days_since_activity: null
        };
    }

    const diffDays = Math.max(0, Math.floor((now - last) / 86400000));
    if (diffDays <= 7) {
        return {
            code: 'active',
            label: 'активен',
            days_since_activity: diffDays
        };
    }
    if (diffDays <= 14) {
        return {
            code: 'inactive',
            label: 'неактивен',
            days_since_activity: diffDays
        };
    }
    return {
        code: 'inactive_long',
        label: 'давно не активен',
        days_since_activity: diffDays
    };
}

function computeLinearTrend(points) {
    const safePoints = Array.isArray(points) ? points : [];
    if (safePoints.length < 2) return [];

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;
    const n = safePoints.length;

    safePoints.forEach((point, index) => {
        const x = index + 1;
        const y = Number(point?.value ?? 0);
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumXX += x * x;
    });

    const denominator = (n * sumXX) - (sumX * sumX);
    if (denominator === 0) return [];

    const slope = ((n * sumXY) - (sumX * sumY)) / denominator;
    const intercept = (sumY - slope * sumX) / n;

    return safePoints.map((point, index) => {
        const x = index + 1;
        return {
            label: point.label,
            value: Number((intercept + slope * x).toFixed(2))
        };
    });
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
router.get('/school/overview', authorize('school_admin', 'teacher', 'superadmin'), async (req, res) => {
    try {
        const { schoolId } = resolveSchoolScope(req);
        if (!schoolId) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'school_id is required for superadmin analytics'
            });
        }
        const isTeacher = req.user.role === 'teacher';
        const { period = '30', grade_level, subject_id, class_id } = req.query; // days
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
        const classParam = class_id ? addParam(class_id) : null;
        const teacherParam = isTeacher ? addParam(req.user.id) : null;

        const gradeJoin = (gradeParam || classParam || teacherParam) ? `
                JOIN users u ON u.id = ta.student_id
                JOIN class_students cs ON cs.student_id = u.id AND cs.is_active = true
                JOIN classes c ON c.id = cs.class_id
        ` : '';
        const gradeWhere = gradeParam ? `AND c.${classGradeColumn} = ${gradeParam}` : '';
        const classWhere = classParam ? `AND c.id = ${classParam}` : '';
        const subjectWhere = subjectParam ? `AND t.subject_id = ${subjectParam}` : '';
        const teacherWhere = teacherParam
            ? `AND ${buildTeacherClassScopeSql(teacherParam, 'c')}`
            : '';

        const totalStudentsExpression = (gradeParam || classParam || teacherParam)
            ? `(SELECT COUNT(DISTINCT u.id)
                FROM users u
                JOIN class_students cs ON cs.student_id = u.id
                JOIN classes c ON c.id = cs.class_id
                WHERE u.school_id = $1
                  AND u.role = 'student'
                  AND u.is_active = true
                  ${gradeWhere}
                  ${classWhere}
                  ${teacherWhere})`
            : `(SELECT COUNT(*) FROM users WHERE school_id = $1 AND role = 'student' AND is_active = true)`;

        const totalTestsExpression = (gradeParam || classParam || subjectParam || teacherParam)
            ? `(SELECT COUNT(DISTINCT t.id)
                FROM tests t
                JOIN test_attempts ta ON ta.test_id = t.id
                ${gradeJoin}
                WHERE t.school_id = $1
                  AND ${attempt.completedFilter}
                  ${gradeWhere}
                  ${classWhere}
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
                  ${classWhere}
                  AND ${buildTeacherClassScopeSql(teacherParam, 'c')})`
            : classParam
                ? `(SELECT COUNT(*) FROM classes c WHERE c.school_id = $1 ${classWhere})`
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
                   ${classWhere}
                   ${teacherWhere}
                   ${subjectWhere}) as total_attempts,
                (SELECT AVG(${attempt.score})
                 FROM test_attempts ta
                 JOIN tests t ON t.id = ta.test_id
                 ${gradeJoin}
                 WHERE t.school_id = $1
                   AND ${attempt.completedFilter}
                   ${gradeWhere}
                   ${classWhere}
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
                            ${classWhere}
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
              ${classWhere}
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
              ${classWhere}
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
router.get('/school/heatmap', authorize('school_admin', 'teacher', 'superadmin'), async (req, res) => {
    try {
        const { schoolId } = resolveSchoolScope(req);
        if (!schoolId) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'school_id is required for superadmin analytics'
            });
        }
        const isTeacher = req.user.role === 'teacher';
        const { grade_level, class_id, period = '90' } = req.query;
        const periodDays = sanitizePeriodDays(period, 90);
        const { nameRu } = await getSubjectNameExpressions();
        const attempt = await getAttemptExpressions();
        const classGradeColumn = await getClassGradeColumn();

        const params = [schoolId];
        const addParam = (value) => {
            params.push(value);
            return `$${params.length}`;
        };
        const gradeParam = grade_level ? addParam(grade_level) : null;
        const classParam = class_id ? addParam(class_id) : null;
        const teacherParam = isTeacher ? addParam(req.user.id) : null;
        const gradeFilter = gradeParam ? `AND c.${classGradeColumn} = ${gradeParam}` : '';
        const classFilter = classParam ? `AND c.id = ${classParam}` : '';
        const teacherFilter = teacherParam ? `AND ${buildTeacherClassScopeSql(teacherParam, 'c')}` : '';

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
              ${classFilter}
              ${teacherFilter}
                        GROUP BY ${nameRu}, EXTRACT(WEEK FROM ${attempt.completedAt}), DATE_TRUNC('week', ${attempt.completedAt})
            ORDER BY week_start DESC, subject
        `, params);

        res.json({
            heatmap: heatmapData.rows,
            period: periodDays,
            grade_level: grade_level || 'all',
            class_id: class_id || 'all'
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
router.get('/school/risk-dashboard', authorize('school_admin', 'teacher', 'superadmin'), async (req, res) => {
    try {
        const { schoolId } = resolveSchoolScope(req);
        if (!schoolId) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'school_id is required for superadmin analytics'
            });
        }
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
router.get('/school/comparison', authorize('school_admin', 'teacher', 'superadmin'), async (req, res) => {
    try {
        const { schoolId } = resolveSchoolScope(req);
        if (!schoolId) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'school_id is required for superadmin analytics'
            });
        }
        const isTeacher = req.user.role === 'teacher';
        const { type = 'classes', subject_id, grade_level, class_id } = req.query;
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
            if (class_id) {
                params.push(class_id);
                conditions.push(`c.id = $${params.length}`);
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
            if (class_id) {
                params.push(class_id);
                conditions.push(`c.id = $${params.length}`);
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
            if (class_id) {
                params.push(class_id);
                conditions.push(`c.id = $${params.length}`);
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
router.get('/student/:id/report', authorize('school_admin', 'teacher', 'student', 'superadmin', 'psychologist'), async (req, res) => {
    try {
        const { id } = req.params;
        const isSuperadmin = req.user.role === 'superadmin';
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
        const studentInfoParams = [id];
        const studentSchoolFilter = isSuperadmin ? '' : 'AND u.school_id = $2';
        if (!isSuperadmin) {
            studentInfoParams.push(schoolId);
        }

        const studentInfo = await query(`
            SELECT
                u.id, u.first_name, u.last_name, u.email,
                c.name as class_name, c.${classGradeColumn} as grade_level
            FROM users u
            LEFT JOIN class_students cs ON cs.student_id = u.id AND cs.is_active = true
            LEFT JOIN classes c ON c.id = cs.class_id
            WHERE u.id = $1
              ${studentSchoolFilter}
              AND u.role = 'student'
        `, studentInfoParams);

        if (studentInfo.rows.length === 0) {
            return res.status(404).json({
                error: 'not_found',
                message: 'Student not found'
            });
        }
        const testSchoolFilter = isSuperadmin ? '' : 'AND t.school_id = $2';
        const rankingSchoolJoinFilter = isSuperadmin ? '' : 'AND t.school_id = $2';
        const params = isSuperadmin ? [id] : [id, schoolId];

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
              ${testSchoolFilter}
              AND ${attempt.completedFilter}
        `, params);

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
              ${testSchoolFilter}
              AND ${attempt.completedFilter}
            GROUP BY ${nameRu}
            ORDER BY avg_score DESC
        `, params);

        // Progress over time
        const progress = await query(`
            SELECT
                                DATE_TRUNC('week', ${attempt.completedAt}) as week,
                                AVG(${attempt.score}) as avg_score,
                COUNT(*) as attempts
                        FROM test_attempts ta
                        JOIN tests t ON t.id = ta.test_id
                        WHERE ta.student_id = $1
                          ${testSchoolFilter}
                          AND ${attempt.completedFilter}
                            AND ${attempt.completedAt} > CURRENT_DATE - INTERVAL '90 days'
                        GROUP BY DATE_TRUNC('week', ${attempt.completedAt})
            ORDER BY week
        `, params);

        // Strengths and weaknesses (by subject)
        const strengths = await query(`
            SELECT
                ${nameRu} as subject,
                AVG(${attempt.score}) as avg_score
            FROM test_attempts ta
            JOIN tests t ON t.id = ta.test_id
            JOIN subjects s ON s.id = t.subject_id
            WHERE ta.student_id = $1
              ${testSchoolFilter}
              AND ${attempt.completedFilter}
            GROUP BY ${nameRu}
            HAVING COUNT(*) >= 3
            ORDER BY avg_score DESC
            LIMIT 3
        `, params);

        const weaknesses = await query(`
            SELECT
                ${nameRu} as subject,
                AVG(${attempt.score}) as avg_score
            FROM test_attempts ta
            JOIN tests t ON t.id = ta.test_id
            JOIN subjects s ON s.id = t.subject_id
            WHERE ta.student_id = $1
              ${testSchoolFilter}
              AND ${attempt.completedFilter}
            GROUP BY ${nameRu}
            HAVING COUNT(*) >= 3
            ORDER BY avg_score ASC
            LIMIT 3
        `, params);

        // Class ranking
        const ranking = await query(`
            WITH target_class AS (
                SELECT class_id
                FROM class_students
                WHERE student_id = $1
                  AND is_active = true
                LIMIT 1
            ),
            class_members AS (
                SELECT cs.student_id
                FROM class_students cs
                JOIN target_class tc ON tc.class_id = cs.class_id
                WHERE cs.is_active = true
            ),
            student_scores AS (
                SELECT
                    cm.student_id,
                    AVG(
                        CASE
                            WHEN t.id IS NOT NULL AND ${attempt.completedFilter}
                            THEN ${attempt.score}
                        END
                    ) as avg_score,
                    COUNT(*) FILTER (
                        WHERE t.id IS NOT NULL AND ${attempt.completedFilter}
                    ) as attempts
                FROM class_members cm
                LEFT JOIN test_attempts ta
                    ON ta.student_id = cm.student_id
                LEFT JOIN tests t
                    ON t.id = ta.test_id
                   ${rankingSchoolJoinFilter}
                GROUP BY cm.student_id
            ),
            ranked AS (
                SELECT
                    student_id,
                    RANK() OVER (
                        ORDER BY avg_score DESC NULLS LAST, attempts DESC, student_id
                    ) as rank,
                    COUNT(*) OVER () as total_students
                FROM student_scores
            )
            SELECT rank, total_students
            FROM ranked
            WHERE student_id = $1
        `, params);

        const careerInterestColumns = await getTableColumns('career_interests');
        const careerNameRuColumn = pickColumn(careerInterestColumns, ['name_ru', 'name'], 'name');
        const careerNameUzColumn = pickColumn(careerInterestColumns, ['name_uz', 'name'], 'name');
        const careerResultsSchema = await getCareerResultsSchema();
        const careerInterestsResult = await query(
            `SELECT
                id,
                ${careerNameRuColumn} AS name_ru,
                ${careerNameUzColumn} AS name_uz
             FROM career_interests`
        );
        const careerInterestsById = new Map(
            careerInterestsResult.rows.map((row) => [String(row.id), row])
        );

        const careerHistoryResult = await query(
            `SELECT
                id,
                ${careerResultsSchema.selectAttemptNo},
                ${careerResultsSchema.selectResults},
                ${careerResultsSchema.selectInterestsScores},
                ${careerResultsSchema.selectRecommendedSubjects},
                ${careerResultsSchema.selectTopInterests},
                ${careerResultsSchema.selectRecommendations},
                ${careerResultsSchema.selectReliability},
                ${careerResultsSchema.timeExpr} AS completed_at
             FROM student_career_results
             WHERE student_id = $1
             ORDER BY ${careerResultsSchema.orderExpr} DESC NULLS LAST, id DESC
             LIMIT 20`,
            [id]
        );

        const careerAttempts = careerHistoryResult.rows.map((row, index) => {
            const scores = row.interests_scores
                || (row.results && typeof row.results === 'object' ? row.results.scores : null)
                || {};
            const recommendedSubjects = row.recommended_subjects
                || (row.results && typeof row.results === 'object' ? row.results.recommended_subjects : null)
                || null;
            const reliability = row.reliability
                || (row.results && typeof row.results === 'object' ? row.results.reliability : null)
                || null;
            const interestSeries = Object.entries(scores).map(([interestId, score]) => {
                const interest = careerInterestsById.get(String(interestId)) || {};
                return {
                    id: interestId,
                    name_ru: interest.name_ru || interestId,
                    name_uz: interest.name_uz || interest.name_ru || interestId,
                    score: Number(score) || 0
                };
            });

            return {
                id: row.id,
                attempt_no: row.attempt_no || (careerHistoryResult.rows.length - index),
                completed_at: row.completed_at,
                interests_scores: scores,
                interests: interestSeries,
                top_interests: Array.isArray(row.top_interests) ? row.top_interests : [],
                recommended_subjects: recommendedSubjects,
                recommendations: row.recommendations || null,
                reliability
            };
        });

        res.json({
            student: studentInfo.rows[0],
            overall: overallStats.rows[0],
            by_subject: subjectPerformance.rows,
            progress: progress.rows,
            strengths: strengths.rows,
            weaknesses: weaknesses.rows,
            ranking: ranking.rows[0] || { rank: null, total_students: 0 },
            career: {
                latest: careerAttempts[0] || null,
                history: careerAttempts
            }
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
 * GET /api/analytics/student/:id/career/report.pdf
 * Export student's career report as PDF (school-scoped RBAC)
 */
router.get('/student/:id/career/report.pdf', authorize('school_admin', 'teacher', 'student', 'superadmin', 'psychologist'), async (req, res) => {
    try {
        const { id } = req.params;
        const isSuperadmin = req.user.role === 'superadmin';
        const schoolId = req.user.school_id;

        if (req.user.role === 'student' && String(req.user.id) !== String(id)) {
            return res.status(403).json({ error: 'forbidden', message: 'Access denied' });
        }

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

            if (!teacherScopeResult.rows.length) {
                return res.status(403).json({ error: 'forbidden', message: 'Access denied' });
            }
        }

        const studentParams = isSuperadmin ? [id] : [id, schoolId];
        const schoolFilter = isSuperadmin ? '' : 'AND school_id = $2';
        const studentRes = await query(
            `SELECT id, username, first_name, last_name
             FROM users
             WHERE id = $1
               ${schoolFilter}
               AND role = 'student'
             LIMIT 1`,
            studentParams
        );

        if (!studentRes.rows.length) {
            return res.status(404).json({ error: 'not_found', message: 'Student not found' });
        }

        let PDFDocument;
        try {
            PDFDocument = require('pdfkit');
        } catch (error) {
            return res.status(500).json({
                error: 'dependency_missing',
                message: 'pdfkit is not installed'
            });
        }

        const careerResultsSchema = await getCareerResultsSchema();
        const historyResult = await query(
            `SELECT
                ${careerResultsSchema.selectAttemptNo},
                ${careerResultsSchema.selectInterestsScores},
                ${careerResultsSchema.selectRecommendedSubjects},
                ${careerResultsSchema.selectResults},
                ${careerResultsSchema.selectReliability},
                ${careerResultsSchema.selectTopInterests},
                ${careerResultsSchema.timeExpr} AS completed_at
             FROM student_career_results
             WHERE student_id = $1
             ORDER BY ${careerResultsSchema.orderExpr} DESC NULLS LAST, id DESC
             LIMIT 20`,
            [id]
        );

        const student = studentRes.rows[0];
        const latest = historyResult.rows[0] || null;
        const fullName = `${student.first_name || ''} ${student.last_name || ''}`.trim() || student.username || 'Student';
        const filename = `career-report-${String(student.username || id).replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        const doc = new PDFDocument({ margin: 48, size: 'A4' });
        doc.pipe(res);

        doc.fontSize(18).text('ZEDLY Career Orientation Report');
        doc.moveDown(0.5);
        doc.fontSize(12).text(`Student: ${fullName}`);
        doc.fontSize(10).text(`Generated: ${new Date().toLocaleString('ru-RU')}`);
        doc.moveDown(1);

        if (!latest) {
            doc.fontSize(12).text('No career attempts yet.');
            doc.end();
            return;
        }

        const scores = latest.interests_scores
            || (latest.results && typeof latest.results === 'object' ? latest.results.scores : null)
            || {};
        const reliability = latest.reliability
            || (latest.results && typeof latest.results === 'object' ? latest.results.reliability : null)
            || null;
        const recommended = latest.recommended_subjects
            || (latest.results && typeof latest.results === 'object' ? latest.results.recommended_subjects : null)
            || { ru: [], uz: [] };

        doc.fontSize(13).text('Latest attempt', { underline: true });
        doc.fontSize(10).text(`Attempt: ${latest.attempt_no || '-'}`);
        doc.text(`Date: ${latest.completed_at ? new Date(latest.completed_at).toLocaleString('ru-RU') : '-'}`);
        if (reliability) {
            doc.text(`Reliability: ${String(reliability.level || '-')} (neutral_ratio=${reliability.neutral_ratio ?? '-'})`);
        }
        doc.moveDown(0.5);
        doc.fontSize(11).text('Top interests:');
        const top = Array.isArray(latest.top_interests) ? latest.top_interests : [];
        if (top.length) top.slice(0, 5).forEach((interest, idx) => doc.text(`${idx + 1}. ${String(interest)}`));
        else doc.text('No data');

        doc.moveDown(0.5);
        doc.fontSize(11).text('Recommended subjects:');
        const recRu = Array.isArray(recommended.ru) ? recommended.ru : [];
        if (recRu.length) recRu.slice(0, 12).forEach((subject, idx) => doc.text(`${idx + 1}. ${String(subject)}`));
        else doc.text('No recommendations');

        doc.moveDown(0.5);
        doc.fontSize(11).text('Interest scores:');
        const sortedScores = Object.entries(scores).sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0));
        if (sortedScores.length) {
            sortedScores.slice(0, 15).forEach(([interestId, score]) => {
                doc.text(`${interestId}: ${Number(score) || 0}`);
            });
        } else {
            doc.text('No score data');
        }

        doc.addPage();
        doc.fontSize(13).text('Attempt history', { underline: true });
        doc.moveDown(0.5);
        historyResult.rows.forEach((row, idx) => {
            const rel = row.reliability
                || (row.results && typeof row.results === 'object' ? row.results.reliability : null)
                || null;
            const dt = row.completed_at ? new Date(row.completed_at).toLocaleString('ru-RU') : '-';
            doc.fontSize(10).text(
                `${idx + 1}. Attempt #${row.attempt_no || '-'} | ${dt} | reliability=${rel?.level || '-'}`
            );
        });

        doc.end();
    } catch (error) {
        console.error('Career PDF analytics export error:', error);
        if (!res.headersSent) {
            res.status(500).json({
                error: 'server_error',
                message: 'Failed to export career PDF'
            });
        }
    }
});

/**
 * ========================================
 * ADVANCED SCHOOL ANALYTICS (v2)
 * ========================================
 */

router.get('/school/advanced/filter-options', authorize('school_admin', 'teacher', 'superadmin'), async (req, res) => {
    try {
        const scope = buildAdvancedScopeParams(req, 30);
        if (!scope) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'school_id is required for superadmin analytics'
            });
        }

        const classGradeColumn = await getClassGradeColumn();
        const params = [scope.schoolId];
        const addParam = (value) => {
            params.push(value);
            return `$${params.length}`;
        };
        const teacherScopeClause = scope.teacherId
            ? `AND (
                    c.homeroom_teacher_id = ${addParam(scope.teacherId)}
                    OR EXISTS (
                        SELECT 1
                        FROM teacher_class_subjects tcs_scope
                        WHERE tcs_scope.class_id = c.id
                          AND tcs_scope.teacher_id = $${params.length}
                    )
                )`
            : '';

        const classesResult = await query(
            `
            SELECT
                c.id,
                c.name,
                c.${classGradeColumn} as grade_level
            FROM classes c
            WHERE c.school_id = $1
              ${teacherScopeClause}
            ORDER BY c.${classGradeColumn}, c.name
            `,
            params
        );

        const teacherParams = [scope.schoolId];
        let teachersWhere = "u.school_id = $1 AND u.role = 'teacher' AND u.is_active = true";
        if (scope.teacherId) {
            teacherParams.push(scope.teacherId);
            teachersWhere += ` AND u.id = $${teacherParams.length}`;
        }
        const teachersResult = await query(
            `
            SELECT u.id, u.first_name, u.last_name
            FROM users u
            WHERE ${teachersWhere}
            ORDER BY u.first_name, u.last_name
            `,
            teacherParams
        );

        const subjectParams = [scope.schoolId];
        const subjectFilters = ['s.school_id = $1'];
        if (scope.teacherId) {
            subjectParams.push(scope.teacherId);
            const teacherRef = `$${subjectParams.length}`;
            subjectFilters.push(`EXISTS (
                SELECT 1
                FROM tests t_scope
                WHERE t_scope.subject_id = s.id
                  AND t_scope.teacher_id = ${teacherRef}
                  AND t_scope.school_id = $1
            )`);
        }
        if (scope.classId) {
            subjectParams.push(scope.classId);
            subjectFilters.push(`EXISTS (
                SELECT 1
                FROM test_assignments tas_scope
                JOIN tests t_scope ON t_scope.id = tas_scope.test_id
                WHERE tas_scope.class_id = $${subjectParams.length}
                  AND t_scope.subject_id = s.id
                  AND t_scope.school_id = $1
            )`);
        }

        const { nameRu, nameUz } = await getSubjectNameExpressions();
        const subjectsResult = await query(
            `
            SELECT
                s.id,
                ${nameRu} as name_ru,
                ${nameUz} as name_uz
            FROM subjects s
            WHERE ${subjectFilters.join(' AND ')}
            ORDER BY ${nameRu}
            `,
            subjectParams
        );

        const gradeLevels = [...new Set(
            classesResult.rows
                .map((item) => Number(item.grade_level))
                .filter((item) => Number.isFinite(item) && item > 0)
        )].sort((a, b) => a - b);

        return res.json({
            grade_levels: gradeLevels,
            classes: classesResult.rows,
            teachers: teachersResult.rows.map((teacher) => ({
                id: teacher.id,
                name: `${teacher.first_name || ''} ${teacher.last_name || ''}`.trim() || String(teacher.id)
            })),
            subjects: subjectsResult.rows
        });
    } catch (error) {
        console.error('Advanced analytics filter options error:', error);
        return res.status(500).json({
            error: 'server_error',
            message: 'Failed to load filter options'
        });
    }
});

router.get('/school/advanced/overview', authorize('school_admin', 'teacher', 'superadmin'), async (req, res) => {
    try {
        const scope = buildAdvancedScopeParams(req, 30);
        if (!scope) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'school_id is required for superadmin analytics'
            });
        }

        const classGradeColumn = await getClassGradeColumn();
        const attempt = await getAttemptExpressions('ta');
        const { nameRu, nameUz } = await getSubjectNameExpressions();
        const baseParams = [scope.schoolId];
        const addParam = (value) => {
            baseParams.push(value);
            return `$${baseParams.length}`;
        };

        const studentFilters = [];
        if (scope.gradeLevel) {
            studentFilters.push(`AND c.${classGradeColumn} = ${addParam(scope.gradeLevel)}`);
        }
        if (scope.classId) {
            studentFilters.push(`AND c.id = ${addParam(scope.classId)}`);
        }
        if (scope.teacherId) {
            const teacherRef = addParam(scope.teacherId);
            studentFilters.push(`AND ${buildTeacherClassScopeSql(teacherRef, 'c')}`);
        }

        const attemptFilters = applyAdvancedAttemptFilters({
            params: baseParams,
            addParam,
            scope,
            classGradeColumn,
            classAlias: 'c',
            testAlias: 't',
            attemptCompletedExpr: attempt.completedAt,
            includeDateRange: true
        });

        const studentsResult = await query(
            `
            SELECT COUNT(DISTINCT u.id) as total_students
            FROM users u
            JOIN class_students cs ON cs.student_id = u.id AND cs.is_active = true
            JOIN classes c ON c.id = cs.class_id
            WHERE u.school_id = $1
              AND u.role = 'student'
              AND u.is_active = true
              ${studentFilters.join('\n')}
            `,
            baseParams
        );

        const testsFilters = [];
        if (scope.subjectId) {
            testsFilters.push(`AND t.subject_id = ${addParam(scope.subjectId)}`);
        }
        if (scope.teacherId) {
            testsFilters.push(`AND t.teacher_id = ${addParam(scope.teacherId)}`);
        }
        const testCreatedStartRef = addParam(scope.dateRange.startDate);
        const testCreatedEndRef = addParam(scope.dateRange.endDate);
        testsFilters.push(`AND t.created_at BETWEEN ${testCreatedStartRef} AND ${testCreatedEndRef}`);

        const testsResult = await query(
            `
            SELECT COUNT(*) as total_tests
            FROM tests t
            WHERE t.school_id = $1
              ${testsFilters.join('\n')}
            `,
            baseParams
        );

        const attemptsResult = await query(
            `
            SELECT
                COUNT(ta.id) as total_attempts,
                AVG(${attempt.score}) as average_score
            FROM test_attempts ta
            JOIN tests t ON t.id = ta.test_id
            JOIN class_students cs ON cs.student_id = ta.student_id AND cs.is_active = true
            JOIN classes c ON c.id = cs.class_id
            WHERE t.school_id = $1
              AND ${attempt.completedFilter}
              ${attemptFilters}
            `,
            baseParams
        );

        const activityResult = await query(
            `
            SELECT
                DATE(${attempt.completedAt}) as date,
                COUNT(ta.id) as attempts,
                AVG(${attempt.score}) as avg_score
            FROM test_attempts ta
            JOIN tests t ON t.id = ta.test_id
            JOIN class_students cs ON cs.student_id = ta.student_id AND cs.is_active = true
            JOIN classes c ON c.id = cs.class_id
            WHERE t.school_id = $1
              AND ${attempt.completedFilter}
              ${attemptFilters}
            GROUP BY DATE(${attempt.completedAt})
            ORDER BY date ASC
            `,
            baseParams
        );

        const topClassesResult = await query(
            `
            SELECT
                c.id,
                c.name,
                c.${classGradeColumn} as grade_level,
                COUNT(ta.id) as total_attempts,
                AVG(${attempt.score}) as avg_score
            FROM classes c
            JOIN class_students cs ON cs.class_id = c.id AND cs.is_active = true
            JOIN test_attempts ta ON ta.student_id = cs.student_id
            JOIN tests t ON t.id = ta.test_id
            WHERE c.school_id = $1
              AND ${attempt.completedFilter}
              ${attemptFilters}
            GROUP BY c.id, c.name, c.${classGradeColumn}
            HAVING COUNT(ta.id) > 0
            ORDER BY avg_score DESC
            LIMIT 10
            `,
            baseParams
        );

        const subjectsResult = await query(
            `
            SELECT
                s.id,
                ${nameRu} as name_ru,
                ${nameUz} as name_uz,
                COUNT(DISTINCT t.id) as test_count,
                COUNT(ta.id) as attempt_count,
                AVG(${attempt.score}) as avg_score
            FROM subjects s
            LEFT JOIN tests t ON t.subject_id = s.id AND t.school_id = $1
            LEFT JOIN test_attempts ta ON ta.test_id = t.id
            LEFT JOIN class_students cs ON cs.student_id = ta.student_id AND cs.is_active = true
            LEFT JOIN classes c ON c.id = cs.class_id
            WHERE s.school_id = $1
              AND (${attempt.completedFilter} OR ta.id IS NULL)
              ${attemptFilters}
            GROUP BY s.id, ${nameRu}, ${nameUz}
            ORDER BY avg_score DESC NULLS LAST
            `,
            baseParams
        );

        return res.json({
            overview: {
                total_students: Number.parseInt(studentsResult.rows[0]?.total_students || 0, 10),
                total_tests: Number.parseInt(testsResult.rows[0]?.total_tests || 0, 10),
                total_attempts: Number.parseInt(attemptsResult.rows[0]?.total_attempts || 0, 10),
                average_score: attemptsResult.rows[0]?.average_score
            },
            recent_activity: activityResult.rows,
            top_classes: topClassesResult.rows,
            subject_performance: subjectsResult.rows
        });
    } catch (error) {
        console.error('Advanced overview error:', error);
        return res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch advanced overview'
        });
    }
});

router.get('/school/advanced/heatmap', authorize('school_admin', 'teacher', 'superadmin'), async (req, res) => {
    try {
        const scope = buildAdvancedScopeParams(req, 90);
        if (!scope) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'school_id is required for superadmin analytics'
            });
        }

        const cacheKey = toCacheKey('advanced-heatmap', req, scope);
        const payload = await withAnalyticsCache(cacheKey, async () => {
            const attempt = await getAttemptExpressions('ta');
            const classGradeColumn = await getClassGradeColumn();
            const { nameRu } = await getSubjectNameExpressions();

            const params = [scope.schoolId];
            const addParam = (value) => {
                params.push(value);
                return `$${params.length}`;
            };
            const filters = applyAdvancedAttemptFilters({
                params,
                addParam,
                scope,
                classGradeColumn,
                classAlias: 'c',
                testAlias: 't',
                attemptCompletedExpr: attempt.completedAt,
                includeDateRange: true
            });

            const heatmapResult = await query(
                `
                SELECT
                    s.id as subject_id,
                    ${nameRu} as subject,
                    EXTRACT(WEEK FROM ${attempt.completedAt}) as week,
                    DATE_TRUNC('week', ${attempt.completedAt})::date as week_start,
                    AVG(${attempt.score}) as avg_score,
                    COUNT(ta.id) as attempt_count
                FROM test_attempts ta
                JOIN tests t ON t.id = ta.test_id
                JOIN subjects s ON s.id = t.subject_id
                JOIN class_students cs ON cs.student_id = ta.student_id AND cs.is_active = true
                JOIN classes c ON c.id = cs.class_id
                WHERE t.school_id = $1
                  AND ${attempt.completedFilter}
                  ${filters}
                GROUP BY s.id, ${nameRu}, EXTRACT(WEEK FROM ${attempt.completedAt}), DATE_TRUNC('week', ${attempt.completedAt})
                ORDER BY week_start DESC, ${nameRu} ASC
                `,
                params
            );

            return {
                heatmap: heatmapResult.rows,
                date_from: scope.dateRange.startDate,
                date_to: scope.dateRange.endDate
            };
        });

        return res.json(payload);
    } catch (error) {
        console.error('Advanced heatmap error:', error);
        return res.status(500).json({
            error: 'server_error',
            message: 'Failed to build heatmap'
        });
    }
});

router.get('/school/advanced/heatmap/students', authorize('school_admin', 'teacher', 'superadmin'), async (req, res) => {
    try {
        const subjectId = normalizeFilterValue(req.query.subject_id);
        const weekStart = parseDateOnly(req.query.week_start);
        if (!subjectId || !weekStart) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'subject_id and week_start are required'
            });
        }

        const scope = buildAdvancedScopeParams(req, 90);
        if (!scope) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'school_id is required for superadmin analytics'
            });
        }

        const attempt = await getAttemptExpressions('ta');
        const classGradeColumn = await getClassGradeColumn();
        const params = [scope.schoolId, subjectId, weekStart];
        const addParam = (value) => {
            params.push(value);
            return `$${params.length}`;
        };

        const scopeWithSubject = {
            ...scope,
            subjectId
        };
        const filters = applyAdvancedAttemptFilters({
            params,
            addParam,
            scope: scopeWithSubject,
            classGradeColumn,
            classAlias: 'c',
            testAlias: 't',
            attemptCompletedExpr: attempt.completedAt,
            includeDateRange: false
        });

        const studentsResult = await query(
            `
            SELECT
                u.id,
                u.first_name,
                u.last_name,
                c.name as class_name,
                AVG(${attempt.score}) as avg_score,
                COUNT(ta.id) as attempts
            FROM test_attempts ta
            JOIN tests t ON t.id = ta.test_id
            JOIN users u ON u.id = ta.student_id
            JOIN class_students cs ON cs.student_id = u.id AND cs.is_active = true
            JOIN classes c ON c.id = cs.class_id
            WHERE t.school_id = $1
              AND t.subject_id = $2
              AND DATE_TRUNC('week', ${attempt.completedAt}) = DATE_TRUNC('week', $3::timestamp)
              AND ${attempt.completedFilter}
              ${filters}
            GROUP BY u.id, u.first_name, u.last_name, c.name
            ORDER BY avg_score DESC NULLS LAST, u.last_name, u.first_name
            `,
            params
        );

        return res.json({
            students: studentsResult.rows
        });
    } catch (error) {
        console.error('Advanced heatmap students error:', error);
        return res.status(500).json({
            error: 'server_error',
            message: 'Failed to load students for heatmap cell'
        });
    }
});

router.get('/school/advanced/subjects', authorize('school_admin', 'teacher', 'superadmin'), async (req, res) => {
    try {
        const scope = buildAdvancedScopeParams(req, 30);
        if (!scope) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'school_id is required for superadmin analytics'
            });
        }

        const attempt = await getAttemptExpressions('ta');
        const classGradeColumn = await getClassGradeColumn();
        const { nameRu, nameUz } = await getSubjectNameExpressions();
        const params = [scope.schoolId];
        const addParam = (value) => {
            params.push(value);
            return `$${params.length}`;
        };
        const filters = applyAdvancedAttemptFilters({
            params,
            addParam,
            scope,
            classGradeColumn,
            classAlias: 'c',
            testAlias: 't',
            attemptCompletedExpr: attempt.completedAt,
            includeDateRange: true
        });
        const filtersWithoutDate = applyAdvancedAttemptFilters({
            params,
            addParam,
            scope,
            classGradeColumn,
            classAlias: 'c',
            testAlias: 't',
            attemptCompletedExpr: attempt.completedAt,
            includeDateRange: false
        });

        const subjectsResult = await query(
            `
            SELECT
                s.id,
                ${nameRu} as name_ru,
                ${nameUz} as name_uz,
                COUNT(DISTINCT t.id) as test_count,
                COUNT(ta.id) as attempt_count,
                AVG(${attempt.score}) as avg_score,
                AVG(${attempt.timeSpent}) / 60 as avg_time_minutes
            FROM subjects s
            LEFT JOIN tests t ON t.subject_id = s.id AND t.school_id = $1
            LEFT JOIN test_attempts ta ON ta.test_id = t.id
            LEFT JOIN class_students cs ON cs.student_id = ta.student_id AND cs.is_active = true
            LEFT JOIN classes c ON c.id = cs.class_id
            WHERE s.school_id = $1
              AND (${attempt.completedFilter} OR ta.id IS NULL)
              ${filters}
            GROUP BY s.id, ${nameRu}, ${nameUz}
            HAVING COUNT(ta.id) > 0
            ORDER BY avg_score DESC
            `,
            params
        );

        return res.json({
            subjects: subjectsResult.rows
        });
    } catch (error) {
        console.error('Advanced subjects error:', error);
        return res.status(500).json({
            error: 'server_error',
            message: 'Failed to load subject analytics'
        });
    }
});

router.get('/school/advanced/trends', authorize('school_admin', 'teacher', 'superadmin'), async (req, res) => {
    try {
        const scope = buildAdvancedScopeParams(req, 90);
        if (!scope) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'school_id is required for superadmin analytics'
            });
        }

        const attempt = await getAttemptExpressions('ta');
        const classGradeColumn = await getClassGradeColumn();
        const params = [scope.schoolId];
        const addParam = (value) => {
            params.push(value);
            return `$${params.length}`;
        };
        const filters = applyAdvancedAttemptFilters({
            params,
            addParam,
            scope,
            classGradeColumn,
            classAlias: 'c',
            testAlias: 't',
            attemptCompletedExpr: attempt.completedAt,
            includeDateRange: true
        });

        const weeklyResult = await query(
            `
            SELECT
                DATE_TRUNC('week', ${attempt.completedAt})::date as week_start,
                AVG(${attempt.score}) as avg_score,
                COUNT(ta.id) as attempts
            FROM test_attempts ta
            JOIN tests t ON t.id = ta.test_id
            JOIN class_students cs ON cs.student_id = ta.student_id AND cs.is_active = true
            JOIN classes c ON c.id = cs.class_id
            WHERE t.school_id = $1
              AND ${attempt.completedFilter}
              ${filters}
            GROUP BY DATE_TRUNC('week', ${attempt.completedAt})
            ORDER BY week_start ASC
            `,
            params
        );

        const topClassesResult = await query(
            `
            SELECT
                c.id,
                c.name,
                COUNT(ta.id) as total_attempts,
                AVG(${attempt.score}) as avg_score
            FROM classes c
            JOIN class_students cs ON cs.class_id = c.id AND cs.is_active = true
            JOIN test_attempts ta ON ta.student_id = cs.student_id
            JOIN tests t ON t.id = ta.test_id
            WHERE c.school_id = $1
              AND ${attempt.completedFilter}
              ${filters}
            GROUP BY c.id, c.name
            HAVING COUNT(ta.id) > 0
            ORDER BY avg_score DESC
            LIMIT 10
            `,
            params
        );

        const weeklySeries = weeklyResult.rows.map((row) => ({
            week_start: row.week_start,
            avg_score: Number(row.avg_score || 0),
            attempts: Number.parseInt(row.attempts || 0, 10)
        }));
        const trendLine = computeLinearTrend(
            weeklySeries.map((item) => ({
                label: item.week_start,
                value: item.avg_score
            }))
        );

        const anomalies = [];
        for (let index = 1; index < weeklySeries.length; index += 1) {
            const previous = weeklySeries[index - 1];
            const current = weeklySeries[index];
            const delta = current.avg_score - previous.avg_score;
            if (Math.abs(delta) >= 10) {
                anomalies.push({
                    week_start: current.week_start,
                    delta: Number(delta.toFixed(2)),
                    label: delta > 0 ? 'резкий рост' : 'резкое падение'
                });
            }
        }

        const sortedByLow = [...topClassesResult.rows]
            .sort((a, b) => Number(a.avg_score || 0) - Number(b.avg_score || 0))
            .slice(0, 5);

        return res.json({
            weekly: weeklySeries,
            trend_line: trendLine,
            anomalies,
            top_classes: topClassesResult.rows.slice(0, 5),
            needs_attention: sortedByLow
        });
    } catch (error) {
        console.error('Advanced trends error:', error);
        return res.status(500).json({
            error: 'server_error',
            message: 'Failed to load trends analytics'
        });
    }
});

router.get('/school/advanced/comparison', authorize('school_admin', 'teacher', 'superadmin'), async (req, res) => {
    try {
        const scope = buildAdvancedScopeParams(req, 30);
        if (!scope) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'school_id is required for superadmin analytics'
            });
        }

        const type = String(req.query.type || 'classes').trim().toLowerCase();
        const mode = String(req.query.mode || 'default').trim().toLowerCase();
        const attempt = await getAttemptExpressions('ta');
        const classGradeColumn = await getClassGradeColumn();
        const { nameRu, nameUz } = await getSubjectNameExpressions();

        const params = [scope.schoolId];
        const addParam = (value) => {
            params.push(value);
            return `$${params.length}`;
        };
        const filters = applyAdvancedAttemptFilters({
            params,
            addParam,
            scope,
            classGradeColumn,
            classAlias: 'c',
            testAlias: 't',
            attemptCompletedExpr: attempt.completedAt,
            includeDateRange: true
        });

        if (mode === 'class_dual') {
            const classA = normalizeFilterValue(req.query.class_a_id);
            const classB = normalizeFilterValue(req.query.class_b_id);
            if (!classA || !classB || classA === classB) {
                return res.status(400).json({
                    error: 'validation_error',
                    message: 'class_a_id and class_b_id (different values) are required'
                });
            }

            const classARef = addParam(classA);
            const classBRef = addParam(classB);
            const comparisonResult = await query(
                `
                SELECT
                    s.id,
                    ${nameRu} as name_ru,
                    ${nameUz} as name_uz,
                    AVG(${attempt.score}) FILTER (WHERE c.id = ${classARef}) as class_a_avg_score,
                    AVG(${attempt.score}) FILTER (WHERE c.id = ${classBRef}) as class_b_avg_score,
                    COUNT(ta.id) FILTER (WHERE c.id = ${classARef}) as class_a_attempts,
                    COUNT(ta.id) FILTER (WHERE c.id = ${classBRef}) as class_b_attempts
                FROM test_attempts ta
                JOIN tests t ON t.id = ta.test_id
                JOIN subjects s ON s.id = t.subject_id
                JOIN class_students cs ON cs.student_id = ta.student_id AND cs.is_active = true
                JOIN classes c ON c.id = cs.class_id
                WHERE t.school_id = $1
                  AND c.id IN (${classARef}, ${classBRef})
                  AND ${attempt.completedFilter}
                  ${filters}
                GROUP BY s.id, ${nameRu}, ${nameUz}
                HAVING COUNT(ta.id) FILTER (WHERE c.id = ${classARef}) > 0
                    OR COUNT(ta.id) FILTER (WHERE c.id = ${classBRef}) > 0
                ORDER BY ${nameRu}
                `,
                params
            );

            const classNamesResult = await query(
                `
                SELECT id, name
                FROM classes
                WHERE school_id = $1 AND id IN (${classARef}, ${classBRef})
                `,
                params
            );
            const classMap = new Map(classNamesResult.rows.map((row) => [String(row.id), row.name]));

            return res.json({
                mode: 'class_dual',
                class_a: { id: classA, name: classMap.get(String(classA)) || classA },
                class_b: { id: classB, name: classMap.get(String(classB)) || classB },
                data: comparisonResult.rows.map((row) => ({
                    ...row,
                    diff: Number((Number(row.class_a_avg_score || 0) - Number(row.class_b_avg_score || 0)).toFixed(2))
                }))
            });
        }

        if (mode === 'year_ago') {
            const currentStart = scope.dateRange.startDate;
            const currentEnd = scope.dateRange.endDate;
            const previousStart = new Date(currentStart);
            previousStart.setFullYear(previousStart.getFullYear() - 1);
            const previousEnd = new Date(currentEnd);
            previousEnd.setFullYear(previousEnd.getFullYear() - 1);

            const currentStartRef = addParam(currentStart);
            const currentEndRef = addParam(currentEnd);
            const previousStartRef = addParam(previousStart);
            const previousEndRef = addParam(previousEnd);

            if (type === 'subjects') {
                const bySubject = await query(
                    `
                    SELECT
                        s.id,
                        ${nameRu} as name_ru,
                        ${nameUz} as name_uz,
                        AVG(${attempt.score}) FILTER (
                            WHERE ${attempt.completedAt} BETWEEN ${currentStartRef} AND ${currentEndRef}
                        ) as current_avg_score,
                        AVG(${attempt.score}) FILTER (
                            WHERE ${attempt.completedAt} BETWEEN ${previousStartRef} AND ${previousEndRef}
                        ) as year_ago_avg_score
                    FROM test_attempts ta
                    JOIN tests t ON t.id = ta.test_id
                    JOIN subjects s ON s.id = t.subject_id
                    JOIN class_students cs ON cs.student_id = ta.student_id AND cs.is_active = true
                    JOIN classes c ON c.id = cs.class_id
                    WHERE t.school_id = $1
                      AND ${attempt.completedFilter}
                      AND ${attempt.completedAt} BETWEEN ${previousStartRef} AND ${currentEndRef}
                      ${filtersWithoutDate}
                    GROUP BY s.id, ${nameRu}, ${nameUz}
                    ORDER BY ${nameRu}
                    `,
                    params
                );
                return res.json({
                    mode: 'year_ago',
                    type: 'subjects',
                    data: bySubject.rows.map((row) => ({
                        ...row,
                        delta: Number((Number(row.current_avg_score || 0) - Number(row.year_ago_avg_score || 0)).toFixed(2))
                    }))
                });
            }

            const byClass = await query(
                `
                SELECT
                    c.id,
                    c.name,
                    AVG(${attempt.score}) FILTER (
                        WHERE ${attempt.completedAt} BETWEEN ${currentStartRef} AND ${currentEndRef}
                    ) as current_avg_score,
                    AVG(${attempt.score}) FILTER (
                        WHERE ${attempt.completedAt} BETWEEN ${previousStartRef} AND ${previousEndRef}
                    ) as year_ago_avg_score
                FROM classes c
                JOIN class_students cs ON cs.class_id = c.id AND cs.is_active = true
                JOIN test_attempts ta ON ta.student_id = cs.student_id
                JOIN tests t ON t.id = ta.test_id
                WHERE c.school_id = $1
                  AND ${attempt.completedFilter}
                  AND ${attempt.completedAt} BETWEEN ${previousStartRef} AND ${currentEndRef}
                  ${filtersWithoutDate}
                GROUP BY c.id, c.name
                ORDER BY c.name
                `,
                params
            );
            return res.json({
                mode: 'year_ago',
                type: 'classes',
                data: byClass.rows.map((row) => ({
                    ...row,
                    delta: Number((Number(row.current_avg_score || 0) - Number(row.year_ago_avg_score || 0)).toFixed(2))
                }))
            });
        }

        if (type === 'subjects') {
            const result = await query(
                `
                SELECT
                    s.id,
                    ${nameRu} as name_ru,
                    ${nameUz} as name_uz,
                    COUNT(ta.id) as attempt_count,
                    AVG(${attempt.score}) as avg_score,
                    MIN(${attempt.score}) as min_score,
                    MAX(${attempt.score}) as max_score
                FROM subjects s
                LEFT JOIN tests t ON t.subject_id = s.id AND t.school_id = $1
                LEFT JOIN test_attempts ta ON ta.test_id = t.id
                LEFT JOIN class_students cs ON cs.student_id = ta.student_id AND cs.is_active = true
                LEFT JOIN classes c ON c.id = cs.class_id
                WHERE s.school_id = $1
                  AND (${attempt.completedFilter} OR ta.id IS NULL)
                  ${filters}
                GROUP BY s.id, ${nameRu}, ${nameUz}
                HAVING COUNT(ta.id) > 0
                ORDER BY avg_score DESC
                `,
                params
            );
            return res.json({ mode: 'default', type: 'subjects', data: result.rows });
        }

        if (type === 'students') {
            const result = await query(
                `
                SELECT
                    u.id,
                    u.first_name,
                    u.last_name,
                    c.name as class_name,
                    COUNT(ta.id) as total_attempts,
                    AVG(${attempt.score}) as avg_score,
                    MIN(${attempt.score}) as min_score,
                    MAX(${attempt.score}) as max_score
                FROM users u
                JOIN class_students cs ON cs.student_id = u.id AND cs.is_active = true
                JOIN classes c ON c.id = cs.class_id
                JOIN test_attempts ta ON ta.student_id = u.id
                JOIN tests t ON t.id = ta.test_id
                WHERE u.school_id = $1
                  AND u.role = 'student'
                  AND ${attempt.completedFilter}
                  ${filters}
                GROUP BY u.id, u.first_name, u.last_name, c.name
                HAVING COUNT(ta.id) > 0
                ORDER BY avg_score DESC
                LIMIT 120
                `,
                params
            );
            return res.json({ mode: 'default', type: 'students', data: result.rows });
        }

        const result = await query(
            `
            SELECT
                c.id,
                c.name,
                COUNT(ta.id) as total_attempts,
                AVG(${attempt.score}) as avg_score,
                MIN(${attempt.score}) as min_score,
                MAX(${attempt.score}) as max_score
            FROM classes c
            JOIN class_students cs ON cs.class_id = c.id AND cs.is_active = true
            JOIN test_attempts ta ON ta.student_id = cs.student_id
            JOIN tests t ON t.id = ta.test_id
            WHERE c.school_id = $1
              AND ${attempt.completedFilter}
              ${filters}
            GROUP BY c.id, c.name
            HAVING COUNT(ta.id) > 0
            ORDER BY c.name
            `,
            params
        );

        return res.json({ mode: 'default', type: 'classes', data: result.rows });
    } catch (error) {
        console.error('Advanced comparison error:', error);
        return res.status(500).json({
            error: 'server_error',
            message: 'Failed to load comparison analytics'
        });
    }
});

router.get('/school/advanced/teachers', authorize('school_admin', 'teacher', 'superadmin'), async (req, res) => {
    try {
        const scope = buildAdvancedScopeParams(req, 30);
        if (!scope) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'school_id is required for superadmin analytics'
            });
        }

        const sortByRaw = String(req.query.sort_by || 'last_activity').trim().toLowerCase();
        const sortDir = sanitizeDirection(req.query.sort_dir, 'DESC');
        const attempt = await getAttemptExpressions('ta');
        const classGradeColumn = await getClassGradeColumn();
        const { nameRu } = await getSubjectNameExpressions();

        const params = [scope.schoolId];
        const addParam = (value) => {
            params.push(value);
            return `$${params.length}`;
        };

        const baseTeacherFilters = ["u.role = 'teacher'", 'u.is_active = true', 'u.school_id = $1'];
        if (scope.teacherId) {
            baseTeacherFilters.push(`u.id = ${addParam(scope.teacherId)}`);
        }

        const teacherRowsResult = await query(
            `
            WITH teacher_scope AS (
                SELECT u.id, u.first_name, u.last_name, u.last_login
                FROM users u
                WHERE ${baseTeacherFilters.join(' AND ')}
            ),
            teacher_subjects AS (
                SELECT
                    ts.id as teacher_id,
                    COALESCE(
                        string_agg(DISTINCT ${nameRu}, ', ' ORDER BY ${nameRu}),
                        '—'
                    ) as subjects
                FROM teacher_scope ts
                LEFT JOIN teacher_class_subjects tcs ON tcs.teacher_id = ts.id
                LEFT JOIN subjects s ON s.id = tcs.subject_id
                GROUP BY ts.id
            ),
            tests_created AS (
                SELECT
                    t.teacher_id,
                    COUNT(t.id) as tests_created
                FROM tests t
                WHERE t.school_id = $1
                  AND t.created_at BETWEEN ${addParam(scope.dateRange.startDate)} AND ${addParam(scope.dateRange.endDate)}
                  ${scope.subjectId ? `AND t.subject_id = ${addParam(scope.subjectId)}` : ''}
                GROUP BY t.teacher_id
            ),
            tests_assigned AS (
                SELECT
                    t.teacher_id,
                    COUNT(tas.id) as tests_assigned
                FROM tests t
                JOIN test_assignments tas ON tas.test_id = t.id
                JOIN classes c ON c.id = tas.class_id
                WHERE t.school_id = $1
                  AND COALESCE(tas.created_at, tas.start_date) BETWEEN ${addParam(scope.dateRange.startDate)} AND ${addParam(scope.dateRange.endDate)}
                  ${scope.subjectId ? `AND t.subject_id = ${addParam(scope.subjectId)}` : ''}
                  ${scope.classId ? `AND c.id = ${addParam(scope.classId)}` : ''}
                  ${scope.gradeLevel ? `AND c.${classGradeColumn} = ${addParam(scope.gradeLevel)}` : ''}
                GROUP BY t.teacher_id
            ),
            test_scores AS (
                SELECT
                    t.teacher_id,
                    AVG(${attempt.score}) as avg_student_score,
                    MAX(${attempt.completedAt}) as last_attempt_at
                FROM test_attempts ta
                JOIN tests t ON t.id = ta.test_id
                JOIN class_students cs ON cs.student_id = ta.student_id AND cs.is_active = true
                JOIN classes c ON c.id = cs.class_id
                WHERE t.school_id = $1
                  AND ${attempt.completedFilter}
                  AND ${attempt.completedAt} BETWEEN ${addParam(scope.dateRange.startDate)} AND ${addParam(scope.dateRange.endDate)}
                  ${scope.subjectId ? `AND t.subject_id = ${addParam(scope.subjectId)}` : ''}
                  ${scope.classId ? `AND c.id = ${addParam(scope.classId)}` : ''}
                  ${scope.gradeLevel ? `AND c.${classGradeColumn} = ${addParam(scope.gradeLevel)}` : ''}
                GROUP BY t.teacher_id
            ),
            test_activity AS (
                SELECT
                    t.teacher_id,
                    MAX(GREATEST(COALESCE(t.updated_at, t.created_at), COALESCE(ts.last_attempt_at, t.created_at))) as last_activity_at
                FROM tests t
                LEFT JOIN test_scores ts ON ts.teacher_id = t.teacher_id
                WHERE t.school_id = $1
                GROUP BY t.teacher_id
            )
            SELECT
                ts.id,
                ts.first_name,
                ts.last_name,
                COALESCE(tsub.subjects, '—') as subjects,
                COALESCE(tc.tests_created, 0) as tests_created,
                COALESCE(ta.tests_assigned, 0) as tests_assigned,
                COALESCE(tsc.avg_student_score, 0) as avg_student_score,
                COALESCE(tact.last_activity_at, ts.last_login) as last_activity_at
            FROM teacher_scope ts
            LEFT JOIN teacher_subjects tsub ON tsub.teacher_id = ts.id
            LEFT JOIN tests_created tc ON tc.teacher_id = ts.id
            LEFT JOIN tests_assigned ta ON ta.teacher_id = ts.id
            LEFT JOIN test_scores tsc ON tsc.teacher_id = ts.id
            LEFT JOIN test_activity tact ON tact.teacher_id = ts.id
            `,
            params
        );

        const rows = teacherRowsResult.rows.map((row) => {
            const status = buildTeacherStatus(row.last_activity_at);
            return {
                id: row.id,
                name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || String(row.id),
                subjects: row.subjects || '—',
                tests_created: Number.parseInt(row.tests_created || 0, 10),
                tests_assigned: Number.parseInt(row.tests_assigned || 0, 10),
                avg_student_score: Number(row.avg_student_score || 0),
                last_activity_at: row.last_activity_at,
                status: status.label,
                status_code: status.code,
                days_since_activity: status.days_since_activity
            };
        });

        const sortHandlers = {
            name: (item) => item.name.toLowerCase(),
            subjects: (item) => String(item.subjects || '').toLowerCase(),
            tests_created: (item) => item.tests_created,
            tests_assigned: (item) => item.tests_assigned,
            avg_student_score: (item) => item.avg_student_score,
            last_activity: (item) => item.days_since_activity ?? Number.MAX_SAFE_INTEGER,
            status: (item) => item.days_since_activity ?? Number.MAX_SAFE_INTEGER
        };
        const sortBy = sortHandlers[sortByRaw] ? sortByRaw : 'last_activity';
        rows.sort((a, b) => {
            const left = sortHandlers[sortBy](a);
            const right = sortHandlers[sortBy](b);
            if (left === right) return 0;
            if (sortDir === 'ASC') return left > right ? 1 : -1;
            return left > right ? -1 : 1;
        });

        return res.json({ teachers: rows });
    } catch (error) {
        console.error('Advanced teachers analytics error:', error);
        return res.status(500).json({
            error: 'server_error',
            message: 'Failed to load teachers analytics'
        });
    }
});

router.get('/school/advanced/teachers/:id/details', authorize('school_admin', 'teacher', 'superadmin'), async (req, res) => {
    try {
        const teacherId = String(req.params.id || '').trim();
        if (!teacherId) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'teacher id is required'
            });
        }

        if (req.user.role === 'teacher' && String(req.user.id) !== teacherId) {
            return res.status(403).json({
                error: 'forbidden',
                message: 'Access denied'
            });
        }

        const scope = buildAdvancedScopeParams(req, 30);
        if (!scope) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'school_id is required for superadmin analytics'
            });
        }

        const attempt = await getAttemptExpressions('ta');
        const classGradeColumn = await getClassGradeColumn();
        const { nameRu, nameUz } = await getSubjectNameExpressions();
        const params = [scope.schoolId, teacherId];
        const addParam = (value) => {
            params.push(value);
            return `$${params.length}`;
        };
        const detailsScope = {
            ...scope,
            teacherId
        };
        const filters = applyAdvancedAttemptFilters({
            params,
            addParam,
            scope: detailsScope,
            classGradeColumn,
            classAlias: 'c',
            testAlias: 't',
            attemptCompletedExpr: attempt.completedAt,
            includeDateRange: true
        });

        const teacherResult = await query(
            `
            SELECT id, first_name, last_name
            FROM users
            WHERE id = $2
              AND school_id = $1
              AND role = 'teacher'
            LIMIT 1
            `,
            params
        );
        if (!teacherResult.rows.length) {
            return res.status(404).json({
                error: 'not_found',
                message: 'Teacher not found'
            });
        }

        const classesResult = await query(
            `
            SELECT DISTINCT
                c.id,
                c.name,
                c.${classGradeColumn} as grade_level
            FROM teacher_class_subjects tcs
            JOIN classes c ON c.id = tcs.class_id
            WHERE tcs.teacher_id = $2
              AND c.school_id = $1
              ${scope.subjectId ? `AND tcs.subject_id = ${addParam(scope.subjectId)}` : ''}
              ${scope.classId ? `AND c.id = ${addParam(scope.classId)}` : ''}
              ${scope.gradeLevel ? `AND c.${classGradeColumn} = ${addParam(scope.gradeLevel)}` : ''}
            ORDER BY c.${classGradeColumn}, c.name
            `,
            params
        );

        const trendResult = await query(
            `
            SELECT
                DATE_TRUNC('week', ${attempt.completedAt})::date as week_start,
                AVG(${attempt.score}) as avg_score,
                COUNT(ta.id) as attempts
            FROM test_attempts ta
            JOIN tests t ON t.id = ta.test_id
            JOIN class_students cs ON cs.student_id = ta.student_id AND cs.is_active = true
            JOIN classes c ON c.id = cs.class_id
            WHERE t.school_id = $1
              AND t.teacher_id = $2
              AND ${attempt.completedFilter}
              ${filters}
            GROUP BY DATE_TRUNC('week', ${attempt.completedAt})
            ORDER BY week_start ASC
            `,
            params
        );

        const testsResult = await query(
            `
            SELECT
                t.id,
                t.title,
                ${nameRu} as subject_name_ru,
                ${nameUz} as subject_name_uz,
                COALESCE(string_agg(DISTINCT c_assign.name, ', '), '—') as classes,
                COUNT(DISTINCT ta.id) as attempts,
                AVG(${attempt.score}) as avg_score,
                MAX(${attempt.completedAt}) as last_attempt_at
            FROM tests t
            LEFT JOIN subjects s ON s.id = t.subject_id
            LEFT JOIN test_assignments tas ON tas.test_id = t.id
            LEFT JOIN classes c_assign ON c_assign.id = tas.class_id
            LEFT JOIN test_attempts ta ON ta.test_id = t.id AND ${attempt.completedFilter}
            LEFT JOIN class_students cs ON cs.student_id = ta.student_id AND cs.is_active = true
            LEFT JOIN classes c ON c.id = cs.class_id
            WHERE t.school_id = $1
              AND t.teacher_id = $2
              ${scope.subjectId ? `AND t.subject_id = ${addParam(scope.subjectId)}` : ''}
              ${scope.classId ? `AND c_assign.id = ${addParam(scope.classId)}` : ''}
              ${scope.gradeLevel ? `AND c_assign.${classGradeColumn} = ${addParam(scope.gradeLevel)}` : ''}
              ${scope.dateRange ? `AND (ta.id IS NULL OR ${attempt.completedAt} BETWEEN ${addParam(scope.dateRange.startDate)} AND ${addParam(scope.dateRange.endDate)})` : ''}
            GROUP BY t.id, t.title, ${nameRu}, ${nameUz}
            ORDER BY COALESCE(MAX(${attempt.completedAt}), t.created_at) DESC
            LIMIT 100
            `,
            params
        );

        return res.json({
            teacher: {
                id: teacherResult.rows[0].id,
                name: `${teacherResult.rows[0].first_name || ''} ${teacherResult.rows[0].last_name || ''}`.trim()
            },
            classes: classesResult.rows,
            trend: trendResult.rows,
            tests: testsResult.rows
        });
    } catch (error) {
        console.error('Advanced teacher details error:', error);
        return res.status(500).json({
            error: 'server_error',
            message: 'Failed to load teacher details'
        });
    }
});

router.get('/school/advanced/students-progress', authorize('school_admin', 'teacher', 'superadmin'), async (req, res) => {
    try {
        const scope = buildAdvancedScopeParams(req, 30);
        if (!scope) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'school_id is required for superadmin analytics'
            });
        }

        const attempt = await getAttemptExpressions('ta');
        const classGradeColumn = await getClassGradeColumn();
        const halfPoint = new Date(scope.dateRange.startDate);
        halfPoint.setTime(
            scope.dateRange.startDate.getTime() + ((scope.dateRange.endDate.getTime() - scope.dateRange.startDate.getTime()) / 2)
        );

        const params = [scope.schoolId];
        const addParam = (value) => {
            params.push(value);
            return `$${params.length}`;
        };
        const classScopeFilters = [];
        const attemptScopeFilters = [];
        if (scope.gradeLevel) {
            const gradeRef = addParam(scope.gradeLevel);
            classScopeFilters.push(`AND c.${classGradeColumn} = ${gradeRef}`);
            attemptScopeFilters.push(`AND c.${classGradeColumn} = ${gradeRef}`);
        }
        if (scope.classId) {
            const classRef = addParam(scope.classId);
            classScopeFilters.push(`AND c.id = ${classRef}`);
            attemptScopeFilters.push(`AND c.id = ${classRef}`);
        }
        if (scope.teacherId) {
            const teacherRef = addParam(scope.teacherId);
            classScopeFilters.push(`AND ${buildTeacherClassScopeSql(teacherRef, 'c')}`);
            attemptScopeFilters.push(`AND ${buildTeacherClassScopeSql(teacherRef, 'c')}`);
        }
        if (scope.subjectId) {
            attemptScopeFilters.push(`AND t.subject_id = ${addParam(scope.subjectId)}`);
        }
        if (scope.teacherId) {
            attemptScopeFilters.push(`AND t.teacher_id = ${addParam(scope.teacherId)}`);
        }
        const periodStartRef = addParam(scope.dateRange.startDate);
        const periodEndRef = addParam(scope.dateRange.endDate);
        const halfPointRef = addParam(halfPoint);

        const result = await query(
            `
            WITH scoped_students AS (
                SELECT
                    u.id as student_id,
                    u.first_name,
                    u.last_name,
                    c.id as class_id,
                    c.name as class_name
                FROM users u
                JOIN class_students cs ON cs.student_id = u.id AND cs.is_active = true
                JOIN classes c ON c.id = cs.class_id
                WHERE u.school_id = $1
                  AND u.role = 'student'
                  AND u.is_active = true
                  ${classScopeFilters.join('\n')}
            ),
            scoped_attempts AS (
                SELECT
                    ta.student_id,
                    ${attempt.score} as score,
                    ${attempt.completedAt} as completed_at
                FROM test_attempts ta
                JOIN tests t ON t.id = ta.test_id
                JOIN class_students cs ON cs.student_id = ta.student_id AND cs.is_active = true
                JOIN classes c ON c.id = cs.class_id
                WHERE t.school_id = $1
                  AND ${attempt.completedFilter}
                  AND ${attempt.completedAt} BETWEEN ${periodStartRef} AND ${periodEndRef}
                  ${attemptScopeFilters.join('\n')}
            )
            SELECT
                ss.student_id as id,
                ss.first_name,
                ss.last_name,
                ss.class_id,
                ss.class_name,
                AVG(sa.score) FILTER (WHERE sa.completed_at < ${halfPointRef}) as avg_before,
                AVG(sa.score) FILTER (WHERE sa.completed_at >= ${halfPointRef}) as avg_after,
                AVG(sa.score) as avg_score,
                COUNT(sa.score) as attempts,
                MAX(sa.completed_at) as last_attempt_at
            FROM scoped_students ss
            LEFT JOIN scoped_attempts sa ON sa.student_id = ss.student_id
            GROUP BY ss.student_id, ss.first_name, ss.last_name, ss.class_id, ss.class_name
            `,
            params
        );

        const nowTs = Date.now();
        const enriched = result.rows.map((row) => {
            const before = Number(row.avg_before || 0);
            const after = Number(row.avg_after || 0);
            const avgScore = Number(row.avg_score || 0);
            const attempts = Number.parseInt(row.attempts || 0, 10);
            const growthAbs = after - before;
            const growthPercent = before > 0
                ? (growthAbs / before) * 100
                : (after > 0 ? 100 : 0);
            const lastAttemptTs = row.last_attempt_at ? new Date(row.last_attempt_at).getTime() : null;
            const daysInactive = lastAttemptTs
                ? Math.max(0, Math.floor((nowTs - lastAttemptTs) / 86400000))
                : 999;
            const dropPercent = before - after;

            const reasons = [];
            if (avgScore < 40) reasons.push('средний балл ниже 40%');
            if (dropPercent > 15) reasons.push('падение более чем на 15%');
            if (daysInactive > 7) reasons.push('не проходил тесты более 7 дней');
            if (attempts === 0) reasons.push('нет попыток в выбранном периоде');

            const riskScore = (avgScore < 40 ? (40 - avgScore) * 2 + 50 : 0)
                + (dropPercent > 15 ? dropPercent * 2 : 0)
                + (daysInactive > 7 ? (daysInactive - 7) * 1.5 : 0)
                + (attempts === 0 ? 60 : 0);

            return {
                id: row.id,
                first_name: row.first_name,
                last_name: row.last_name,
                class_id: row.class_id,
                class_name: row.class_name,
                avg_before: Number(before.toFixed(2)),
                avg_after: Number(after.toFixed(2)),
                avg_score: Number(avgScore.toFixed(2)),
                attempts,
                growth_percent: Number(growthPercent.toFixed(2)),
                risk_reasons: reasons,
                days_inactive: Number.isFinite(daysInactive) ? daysInactive : null,
                risk_score: Number(riskScore.toFixed(2))
            };
        });

        const topImproved = [...enriched]
            .filter((item) => item.avg_after > 0 || item.avg_before > 0)
            .sort((a, b) => b.growth_percent - a.growth_percent)
            .slice(0, 10)
            .map((item, index) => ({
                ...item,
                rocket: index < 3
            }));

        const riskZone = [...enriched]
            .filter((item) => item.risk_reasons.length > 0)
            .sort((a, b) => b.risk_score - a.risk_score)
            .slice(0, 120);

        return res.json({
            top_improved: topImproved,
            risk_zone: riskZone
        });
    } catch (error) {
        console.error('Advanced students progress error:', error);
        return res.status(500).json({
            error: 'server_error',
            message: 'Failed to load students progress analytics'
        });
    }
});

router.get('/school/advanced/tests-analysis', authorize('school_admin', 'teacher', 'superadmin'), async (req, res) => {
    try {
        const scope = buildAdvancedScopeParams(req, 30);
        if (!scope) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'school_id is required for superadmin analytics'
            });
        }

        const attempt = await getAttemptExpressions('ta');
        const classGradeColumn = await getClassGradeColumn();
        const { nameRu } = await getSubjectNameExpressions();
        const params = [scope.schoolId];
        const addParam = (value) => {
            params.push(value);
            return `$${params.length}`;
        };
        const filters = applyAdvancedAttemptFilters({
            params,
            addParam,
            scope,
            classGradeColumn,
            classAlias: 'c',
            testAlias: 't',
            attemptCompletedExpr: attempt.completedAt,
            includeDateRange: true
        });
        const filtersNoDate = applyAdvancedAttemptFilters({
            params,
            addParam,
            scope,
            classGradeColumn,
            classAlias: 'c',
            testAlias: 't',
            attemptCompletedExpr: attempt.completedAt,
            includeDateRange: false
        });

        const hardestTestsResult = await query(
            `
            SELECT
                t.id,
                t.title,
                ${nameRu} as subject_name,
                CONCAT(COALESCE(teacher.first_name, ''), ' ', COALESCE(teacher.last_name, '')) as teacher_name,
                AVG(${attempt.score}) as avg_score,
                COUNT(ta.id) as attempts_count
            FROM tests t
            LEFT JOIN users teacher ON teacher.id = t.teacher_id
            LEFT JOIN subjects s ON s.id = t.subject_id
            LEFT JOIN test_attempts ta ON ta.test_id = t.id
            LEFT JOIN class_students cs ON cs.student_id = ta.student_id AND cs.is_active = true
            LEFT JOIN classes c ON c.id = cs.class_id
            WHERE t.school_id = $1
              AND ${attempt.completedFilter}
              ${filters}
            GROUP BY t.id, t.title, ${nameRu}, teacher.first_name, teacher.last_name
            HAVING COUNT(ta.id) > 0
            ORDER BY avg_score ASC, attempts_count DESC
            LIMIT 10
            `,
            params
        );

        const problematicQuestionsResult = await query(
            `
            WITH scoped_attempts AS (
                SELECT ta.id, ta.test_id, ta.answers
                FROM test_attempts ta
                JOIN tests t ON t.id = ta.test_id
                JOIN class_students cs ON cs.student_id = ta.student_id AND cs.is_active = true
                JOIN classes c ON c.id = cs.class_id
                WHERE t.school_id = $1
                  AND ${attempt.completedFilter}
                  ${filters}
            ),
            expanded AS (
                SELECT
                    sa.test_id,
                    entry.key as question_id,
                    COALESCE(
                        entry.value->'question_snapshot'->>'question_text',
                        entry.value->>'question_text',
                        ''
                    ) as question_text,
                    (entry.value->>'is_correct') as is_correct
                FROM scoped_attempts sa
                CROSS JOIN LATERAL jsonb_each(
                    CASE
                        WHEN jsonb_typeof(sa.answers) = 'object' THEN sa.answers
                        ELSE '{}'::jsonb
                    END
                ) entry
                WHERE entry.value ? 'is_correct'
            )
            SELECT
                ex.question_id,
                ex.question_text,
                t.title as test_title,
                COUNT(*) as answers_count,
                COUNT(*) FILTER (WHERE LOWER(ex.is_correct) = 'false') as wrong_count,
                CASE
                    WHEN COUNT(*) = 0 THEN 0
                    ELSE (COUNT(*) FILTER (WHERE LOWER(ex.is_correct) = 'false')::float / COUNT(*)::float) * 100
                END as wrong_percent
            FROM expanded ex
            JOIN tests t ON t.id = ex.test_id
            GROUP BY ex.question_id, ex.question_text, t.title
            HAVING COUNT(*) >= 3
            ORDER BY wrong_percent DESC, answers_count DESC
            LIMIT 10
            `,
            params
        );

        const abandonedCreatedResult = await query(
            `
            SELECT
                t.id,
                t.title,
                CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) as teacher_name,
                t.created_at,
                'created_not_assigned' as status_code,
                'создан, но не назначен более 14 дней' as status
            FROM tests t
            LEFT JOIN users u ON u.id = t.teacher_id
            LEFT JOIN test_assignments tas ON tas.test_id = t.id
            WHERE t.school_id = $1
              AND tas.id IS NULL
              AND t.created_at < NOW() - INTERVAL '14 days'
              ${scope.subjectId ? `AND t.subject_id = ${addParam(scope.subjectId)}` : ''}
              ${scope.teacherId ? `AND t.teacher_id = ${addParam(scope.teacherId)}` : ''}
            ORDER BY t.created_at ASC
            LIMIT 50
            `,
            params
        );

        const abandonedAssignedResult = await query(
            `
            SELECT
                t.id,
                t.title,
                CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) as teacher_name,
                MIN(tas.created_at) as created_at,
                'assigned_no_attempts' as status_code,
                'назначен, но никто не проходил более 7 дней' as status
            FROM tests t
            JOIN test_assignments tas ON tas.test_id = t.id
            JOIN classes c ON c.id = tas.class_id
            LEFT JOIN users u ON u.id = t.teacher_id
            LEFT JOIN test_attempts ta
                ON ta.assignment_id = tas.id
               AND ${attempt.completedFilter}
               AND ${attempt.completedAt} > NOW() - INTERVAL '7 days'
            WHERE t.school_id = $1
              AND ta.id IS NULL
              AND tas.created_at < NOW() - INTERVAL '7 days'
              ${scope.subjectId ? `AND t.subject_id = ${addParam(scope.subjectId)}` : ''}
              ${scope.teacherId ? `AND t.teacher_id = ${addParam(scope.teacherId)}` : ''}
              ${scope.classId ? `AND c.id = ${addParam(scope.classId)}` : ''}
              ${scope.gradeLevel ? `AND c.${classGradeColumn} = ${addParam(scope.gradeLevel)}` : ''}
              ${filtersNoDate}
            GROUP BY t.id, t.title, u.first_name, u.last_name
            ORDER BY MIN(tas.created_at) ASC
            LIMIT 50
            `,
            params
        );

        return res.json({
            hardest_tests: hardestTestsResult.rows,
            problematic_questions: problematicQuestionsResult.rows.map((row) => ({
                ...row,
                short_text: String(row.question_text || '').slice(0, 60)
            })),
            abandoned_tests: [
                ...abandonedCreatedResult.rows,
                ...abandonedAssignedResult.rows
            ]
        });
    } catch (error) {
        console.error('Advanced tests analysis error:', error);
        return res.status(500).json({
            error: 'server_error',
            message: 'Failed to load tests analytics'
        });
    }
});

router.get('/school/advanced/period-comparison', authorize('school_admin', 'teacher', 'superadmin'), async (req, res) => {
    try {
        const scope = buildAdvancedScopeParams(req, 180);
        if (!scope) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'school_id is required for superadmin analytics'
            });
        }

        const cacheKey = toCacheKey('advanced-period-comparison', req, scope);
        const payload = await withAnalyticsCache(cacheKey, async () => {
            const dimension = String(req.query.dimension || 'subjects').trim().toLowerCase();
            const months = clampInt(req.query.months, 4, 6, 6);
            const attempt = await getAttemptExpressions('ta');
            const classGradeColumn = await getClassGradeColumn();
            const { nameRu } = await getSubjectNameExpressions();

            const now = new Date();
            const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const monthStarts = [];
            for (let offset = months - 1; offset >= 0; offset -= 1) {
                monthStarts.push(new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() - offset, 1));
            }
            const startBound = monthStarts[0];
            const endBound = new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() + 1, 1);

            const params = [scope.schoolId, startBound, endBound];
            const addParam = (value) => {
                params.push(value);
                return `$${params.length}`;
            };

            const commonFilters = [];
            if (scope.gradeLevel) {
                commonFilters.push(`AND c.${classGradeColumn} = ${addParam(scope.gradeLevel)}`);
            }
            if (scope.classId) {
                commonFilters.push(`AND c.id = ${addParam(scope.classId)}`);
            }
            if (scope.subjectId) {
                commonFilters.push(`AND t.subject_id = ${addParam(scope.subjectId)}`);
            }
            if (scope.teacherId) {
                const teacherRef = addParam(scope.teacherId);
                commonFilters.push(`AND t.teacher_id = ${teacherRef}`);
                commonFilters.push(`AND ${buildTeacherClassScopeSql(teacherRef, 'c')}`);
            }

            let rowsResult;
            if (dimension === 'classes') {
                rowsResult = await query(
                    `
                    SELECT
                        c.id as dimension_id,
                        c.name as dimension_name,
                        DATE_TRUNC('month', ${attempt.completedAt})::date as month_start,
                        AVG(${attempt.score}) as avg_score
                    FROM test_attempts ta
                    JOIN tests t ON t.id = ta.test_id
                    JOIN class_students cs ON cs.student_id = ta.student_id AND cs.is_active = true
                    JOIN classes c ON c.id = cs.class_id
                    WHERE t.school_id = $1
                      AND ${attempt.completedFilter}
                      AND ${attempt.completedAt} >= $2
                      AND ${attempt.completedAt} < $3
                      ${commonFilters.join('\n')}
                    GROUP BY c.id, c.name, DATE_TRUNC('month', ${attempt.completedAt})
                    ORDER BY c.name, month_start
                    `,
                    params
                );
            } else if (dimension === 'teachers') {
                rowsResult = await query(
                    `
                    SELECT
                        u.id as dimension_id,
                        CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) as dimension_name,
                        DATE_TRUNC('month', ${attempt.completedAt})::date as month_start,
                        AVG(${attempt.score}) as avg_score
                    FROM test_attempts ta
                    JOIN tests t ON t.id = ta.test_id
                    JOIN users u ON u.id = t.teacher_id
                    JOIN class_students cs ON cs.student_id = ta.student_id AND cs.is_active = true
                    JOIN classes c ON c.id = cs.class_id
                    WHERE t.school_id = $1
                      AND ${attempt.completedFilter}
                      AND ${attempt.completedAt} >= $2
                      AND ${attempt.completedAt} < $3
                      ${commonFilters.join('\n')}
                    GROUP BY u.id, u.first_name, u.last_name, DATE_TRUNC('month', ${attempt.completedAt})
                    ORDER BY dimension_name, month_start
                    `,
                    params
                );
            } else {
                rowsResult = await query(
                    `
                    SELECT
                        s.id as dimension_id,
                        ${nameRu} as dimension_name,
                        DATE_TRUNC('month', ${attempt.completedAt})::date as month_start,
                        AVG(${attempt.score}) as avg_score
                    FROM test_attempts ta
                    JOIN tests t ON t.id = ta.test_id
                    JOIN subjects s ON s.id = t.subject_id
                    JOIN class_students cs ON cs.student_id = ta.student_id AND cs.is_active = true
                    JOIN classes c ON c.id = cs.class_id
                    WHERE t.school_id = $1
                      AND ${attempt.completedFilter}
                      AND ${attempt.completedAt} >= $2
                      AND ${attempt.completedAt} < $3
                      ${commonFilters.join('\n')}
                    GROUP BY s.id, ${nameRu}, DATE_TRUNC('month', ${attempt.completedAt})
                    ORDER BY dimension_name, month_start
                    `,
                    params
                );
            }

            const monthLabels = monthStarts.map((monthStart) => {
                const date = new Date(monthStart);
                return date.toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' });
            });

            const grouped = new Map();
            rowsResult.rows.forEach((row) => {
                const key = String(row.dimension_id);
                if (!grouped.has(key)) {
                    grouped.set(key, {
                        id: row.dimension_id,
                        name: row.dimension_name,
                        monthly: Array(monthStarts.length).fill(null)
                    });
                }
                const monthIndex = monthStarts.findIndex((monthStart) => {
                    const left = new Date(monthStart);
                    const right = new Date(row.month_start);
                    return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
                });
                if (monthIndex >= 0) {
                    grouped.get(key).monthly[monthIndex] = Number(Number(row.avg_score || 0).toFixed(2));
                }
            });

            const rows = Array.from(grouped.values()).map((item) => {
                const firstValue = item.monthly[0] ?? 0;
                const lastValue = item.monthly[item.monthly.length - 1] ?? 0;
                let trend = 'stable';
                if (lastValue > firstValue) trend = 'up';
                if (lastValue < firstValue) trend = 'down';
                return {
                    id: item.id,
                    name: item.name,
                    monthly: item.monthly,
                    trend
                };
            });

            const periodAStart = parseDateOnly(req.query.period_a_start);
            const periodAEnd = parseDateOnly(req.query.period_a_end);
            const periodBStart = parseDateOnly(req.query.period_b_start);
            const periodBEnd = parseDateOnly(req.query.period_b_end);
            let compareRows = [];
            if (periodAStart && periodAEnd && periodBStart && periodBEnd) {
                periodAStart.setHours(0, 0, 0, 0);
                periodAEnd.setHours(23, 59, 59, 999);
                periodBStart.setHours(0, 0, 0, 0);
                periodBEnd.setHours(23, 59, 59, 999);

                const compareParams = [scope.schoolId, periodAStart, periodAEnd, periodBStart, periodBEnd];
                const addCompareParam = (value) => {
                    compareParams.push(value);
                    return `$${compareParams.length}`;
                };
                const compareFilters = [];
                if (scope.gradeLevel) compareFilters.push(`AND c.${classGradeColumn} = ${addCompareParam(scope.gradeLevel)}`);
                if (scope.classId) compareFilters.push(`AND c.id = ${addCompareParam(scope.classId)}`);
                if (scope.subjectId) compareFilters.push(`AND t.subject_id = ${addCompareParam(scope.subjectId)}`);
                if (scope.teacherId) {
                    const teacherRef = addCompareParam(scope.teacherId);
                    compareFilters.push(`AND t.teacher_id = ${teacherRef}`);
                    compareFilters.push(`AND ${buildTeacherClassScopeSql(teacherRef, 'c')}`);
                }

                let compareQuery;
                if (dimension === 'classes') {
                    compareQuery = `
                        SELECT
                            c.id as dimension_id,
                            c.name as dimension_name,
                            AVG(${attempt.score}) FILTER (WHERE ${attempt.completedAt} BETWEEN $2 AND $3) as period_a_avg,
                            AVG(${attempt.score}) FILTER (WHERE ${attempt.completedAt} BETWEEN $4 AND $5) as period_b_avg
                        FROM test_attempts ta
                        JOIN tests t ON t.id = ta.test_id
                        JOIN class_students cs ON cs.student_id = ta.student_id AND cs.is_active = true
                        JOIN classes c ON c.id = cs.class_id
                        WHERE t.school_id = $1
                          AND ${attempt.completedFilter}
                          ${compareFilters.join('\n')}
                        GROUP BY c.id, c.name
                        ORDER BY c.name
                    `;
                } else if (dimension === 'teachers') {
                    compareQuery = `
                        SELECT
                            u.id as dimension_id,
                            CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) as dimension_name,
                            AVG(${attempt.score}) FILTER (WHERE ${attempt.completedAt} BETWEEN $2 AND $3) as period_a_avg,
                            AVG(${attempt.score}) FILTER (WHERE ${attempt.completedAt} BETWEEN $4 AND $5) as period_b_avg
                        FROM test_attempts ta
                        JOIN tests t ON t.id = ta.test_id
                        JOIN users u ON u.id = t.teacher_id
                        JOIN class_students cs ON cs.student_id = ta.student_id AND cs.is_active = true
                        JOIN classes c ON c.id = cs.class_id
                        WHERE t.school_id = $1
                          AND ${attempt.completedFilter}
                          ${compareFilters.join('\n')}
                        GROUP BY u.id, u.first_name, u.last_name
                        ORDER BY dimension_name
                    `;
                } else {
                    compareQuery = `
                        SELECT
                            s.id as dimension_id,
                            ${nameRu} as dimension_name,
                            AVG(${attempt.score}) FILTER (WHERE ${attempt.completedAt} BETWEEN $2 AND $3) as period_a_avg,
                            AVG(${attempt.score}) FILTER (WHERE ${attempt.completedAt} BETWEEN $4 AND $5) as period_b_avg
                        FROM test_attempts ta
                        JOIN tests t ON t.id = ta.test_id
                        JOIN subjects s ON s.id = t.subject_id
                        JOIN class_students cs ON cs.student_id = ta.student_id AND cs.is_active = true
                        JOIN classes c ON c.id = cs.class_id
                        WHERE t.school_id = $1
                          AND ${attempt.completedFilter}
                          ${compareFilters.join('\n')}
                        GROUP BY s.id, ${nameRu}
                        ORDER BY dimension_name
                    `;
                }
                const compareResult = await query(compareQuery, compareParams);
                compareRows = compareResult.rows.map((row) => ({
                    id: row.dimension_id,
                    name: row.dimension_name,
                    period_a_avg: Number(Number(row.period_a_avg || 0).toFixed(2)),
                    period_b_avg: Number(Number(row.period_b_avg || 0).toFixed(2)),
                    delta: Number((Number(row.period_b_avg || 0) - Number(row.period_a_avg || 0)).toFixed(2))
                }));
            }

            return {
                dimension,
                months: monthLabels,
                rows,
                compare_rows: compareRows
            };
        });

        return res.json(payload);
    } catch (error) {
        console.error('Advanced period comparison error:', error);
        return res.status(500).json({
            error: 'server_error',
            message: 'Failed to load period comparison'
        });
    }
});

router.get('/school/advanced/export/excel', authorize('school_admin', 'teacher', 'superadmin'), async (req, res) => {
    try {
        const scope = buildAdvancedScopeParams(req, 30);
        if (!scope) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'school_id is required for superadmin analytics'
            });
        }

        const attempt = await getAttemptExpressions('ta');
        const classGradeColumn = await getClassGradeColumn();
        const { nameRu } = await getSubjectNameExpressions();
        const params = [scope.schoolId];
        const addParam = (value) => {
            params.push(value);
            return `$${params.length}`;
        };
        const filters = applyAdvancedAttemptFilters({
            params,
            addParam,
            scope,
            classGradeColumn,
            classAlias: 'c',
            testAlias: 't',
            attemptCompletedExpr: attempt.completedAt,
            includeDateRange: true
        });

        const studentsData = await query(
            `
            SELECT
                u.id as student_id,
                CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) as student_name,
                c.name as class_name,
                COUNT(ta.id) as attempts,
                AVG(${attempt.score}) as avg_score,
                MAX(${attempt.completedAt}) as last_attempt_at
            FROM users u
            JOIN class_students cs ON cs.student_id = u.id AND cs.is_active = true
            JOIN classes c ON c.id = cs.class_id
            LEFT JOIN test_attempts ta ON ta.student_id = u.id
            LEFT JOIN tests t ON t.id = ta.test_id
            WHERE u.school_id = $1
              AND u.role = 'student'
              AND (${attempt.completedFilter} OR ta.id IS NULL)
              ${filters}
            GROUP BY u.id, u.first_name, u.last_name, c.name
            ORDER BY c.name, student_name
            `,
            params
        );

        const classesData = await query(
            `
            SELECT
                c.id as class_id,
                c.name as class_name,
                c.${classGradeColumn} as grade_level,
                COUNT(DISTINCT cs.student_id) as students,
                COUNT(ta.id) as attempts,
                AVG(${attempt.score}) as avg_score
            FROM classes c
            LEFT JOIN class_students cs ON cs.class_id = c.id AND cs.is_active = true
            LEFT JOIN test_attempts ta ON ta.student_id = cs.student_id
            LEFT JOIN tests t ON t.id = ta.test_id
            WHERE c.school_id = $1
              AND (${attempt.completedFilter} OR ta.id IS NULL)
              ${filters}
            GROUP BY c.id, c.name, c.${classGradeColumn}
            ORDER BY c.${classGradeColumn}, c.name
            `,
            params
        );

        const teachersData = await query(
            `
            SELECT
                u.id as teacher_id,
                CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) as teacher_name,
                COUNT(DISTINCT t.id) as tests_created,
                COUNT(ta.id) as attempts,
                AVG(${attempt.score}) as avg_score
            FROM users u
            LEFT JOIN tests t ON t.teacher_id = u.id AND t.school_id = $1
            LEFT JOIN test_attempts ta ON ta.test_id = t.id
            LEFT JOIN class_students cs ON cs.student_id = ta.student_id AND cs.is_active = true
            LEFT JOIN classes c ON c.id = cs.class_id
            WHERE u.school_id = $1
              AND u.role = 'teacher'
              AND u.is_active = true
              AND (${attempt.completedFilter} OR ta.id IS NULL)
              ${filters}
            GROUP BY u.id, u.first_name, u.last_name
            ORDER BY teacher_name
            `,
            params
        );

        const subjectsData = await query(
            `
            SELECT
                s.id as subject_id,
                ${nameRu} as subject_name,
                COUNT(DISTINCT t.id) as tests,
                COUNT(ta.id) as attempts,
                AVG(${attempt.score}) as avg_score
            FROM subjects s
            LEFT JOIN tests t ON t.subject_id = s.id AND t.school_id = $1
            LEFT JOIN test_attempts ta ON ta.test_id = t.id
            LEFT JOIN class_students cs ON cs.student_id = ta.student_id AND cs.is_active = true
            LEFT JOIN classes c ON c.id = cs.class_id
            WHERE s.school_id = $1
              AND (${attempt.completedFilter} OR ta.id IS NULL)
              ${filters}
            GROUP BY s.id, ${nameRu}
            ORDER BY subject_name
            `,
            params
        );

        const workbook = new ExcelJS.Workbook();
        appendJsonWorksheet(workbook, 'Classes', classesData.rows);
        appendJsonWorksheet(workbook, 'Students', studentsData.rows);
        appendJsonWorksheet(workbook, 'Teachers', teachersData.rows);
        appendJsonWorksheet(workbook, 'Subjects', subjectsData.rows);

        const workbookBuffer = await workbook.xlsx.writeBuffer();
        const buffer = Buffer.isBuffer(workbookBuffer)
            ? workbookBuffer
            : Buffer.from(workbookBuffer);

        res.setHeader('Content-Disposition', `attachment; filename=advanced_analytics_${Date.now()}.xlsx`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        return res.send(buffer);
    } catch (error) {
        console.error('Advanced Excel export error:', error);
        return res.status(500).json({
            error: 'server_error',
            message: 'Failed to export Excel'
        });
    }
});

router.get('/school/advanced/export/pdf', authorize('school_admin', 'teacher', 'superadmin'), async (req, res) => {
    try {
        const scope = buildAdvancedScopeParams(req, 30);
        if (!scope) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'school_id is required for superadmin analytics'
            });
        }

        let PDFDocument;
        try {
            PDFDocument = require('pdfkit');
        } catch (error) {
            return res.status(500).json({
                error: 'dependency_missing',
                message: 'pdfkit is not installed'
            });
        }

        const attempt = await getAttemptExpressions('ta');
        const classGradeColumn = await getClassGradeColumn();
        const { nameRu } = await getSubjectNameExpressions();

        const params = [scope.schoolId];
        const addParam = (value) => {
            params.push(value);
            return `$${params.length}`;
        };
        const filters = applyAdvancedAttemptFilters({
            params,
            addParam,
            scope,
            classGradeColumn,
            classAlias: 'c',
            testAlias: 't',
            attemptCompletedExpr: attempt.completedAt,
            includeDateRange: true
        });

        const schoolResult = await query(
            `SELECT name FROM schools WHERE id = $1 LIMIT 1`,
            [scope.schoolId]
        );
        const schoolName = schoolResult.rows[0]?.name || 'School';

        const overviewResult = await query(
            `
            SELECT
                COUNT(DISTINCT u.id) as total_students,
                COUNT(ta.id) as total_attempts,
                COUNT(DISTINCT t.id) as total_tests,
                AVG(${attempt.score}) as avg_score
            FROM users u
            LEFT JOIN class_students cs ON cs.student_id = u.id AND cs.is_active = true
            LEFT JOIN classes c ON c.id = cs.class_id
            LEFT JOIN test_attempts ta ON ta.student_id = u.id
            LEFT JOIN tests t ON t.id = ta.test_id
            WHERE u.school_id = $1
              AND u.role = 'student'
              AND (${attempt.completedFilter} OR ta.id IS NULL)
              ${filters}
            `,
            params
        );

        const heatmapResult = await query(
            `
            SELECT
                ${nameRu} as subject_name,
                DATE_TRUNC('week', ${attempt.completedAt})::date as week_start,
                AVG(${attempt.score}) as avg_score
            FROM test_attempts ta
            JOIN tests t ON t.id = ta.test_id
            JOIN subjects s ON s.id = t.subject_id
            JOIN class_students cs ON cs.student_id = ta.student_id AND cs.is_active = true
            JOIN classes c ON c.id = cs.class_id
            WHERE t.school_id = $1
              AND ${attempt.completedFilter}
              ${filters}
            GROUP BY ${nameRu}, DATE_TRUNC('week', ${attempt.completedAt})
            ORDER BY week_start DESC
            LIMIT 20
            `,
            params
        );

        const classRankingResult = await query(
            `
            SELECT
                c.name,
                AVG(${attempt.score}) as avg_score,
                COUNT(ta.id) as attempts
            FROM classes c
            JOIN class_students cs ON cs.class_id = c.id AND cs.is_active = true
            JOIN test_attempts ta ON ta.student_id = cs.student_id
            JOIN tests t ON t.id = ta.test_id
            WHERE c.school_id = $1
              AND ${attempt.completedFilter}
              ${filters}
            GROUP BY c.name
            HAVING COUNT(ta.id) > 0
            ORDER BY avg_score DESC
            LIMIT 10
            `,
            params
        );

        const riskResult = await query(
            `
            SELECT
                CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) as student_name,
                c.name as class_name,
                AVG(${attempt.score}) as avg_score,
                MAX(${attempt.completedAt}) as last_attempt_at
            FROM users u
            JOIN class_students cs ON cs.student_id = u.id AND cs.is_active = true
            JOIN classes c ON c.id = cs.class_id
            LEFT JOIN test_attempts ta ON ta.student_id = u.id
            LEFT JOIN tests t ON t.id = ta.test_id
            WHERE u.school_id = $1
              AND u.role = 'student'
              AND (${attempt.completedFilter} OR ta.id IS NULL)
              ${filters}
            GROUP BY u.id, u.first_name, u.last_name, c.name
            ORDER BY avg_score ASC NULLS FIRST
            LIMIT 30
            `,
            params
        );

        const teacherActivityResult = await query(
            `
            SELECT
                CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) as teacher_name,
                COUNT(DISTINCT t.id) as tests_created,
                COUNT(ta.id) as attempts,
                MAX(${attempt.completedAt}) as last_activity_at
            FROM users u
            LEFT JOIN tests t ON t.teacher_id = u.id AND t.school_id = $1
            LEFT JOIN test_attempts ta ON ta.test_id = t.id
            LEFT JOIN class_students cs ON cs.student_id = ta.student_id AND cs.is_active = true
            LEFT JOIN classes c ON c.id = cs.class_id
            WHERE u.school_id = $1
              AND u.role = 'teacher'
              AND u.is_active = true
              AND (${attempt.completedFilter} OR ta.id IS NULL)
              ${filters}
            GROUP BY u.id, u.first_name, u.last_name
            ORDER BY last_activity_at DESC NULLS LAST
            LIMIT 20
            `,
            params
        );

        const filename = `advanced_analytics_${Date.now()}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        doc.pipe(res);

        const logoPath = path.join(__dirname, '..', '..', 'public', 'images', 'zedly_logo_bg.png');
        if (fs.existsSync(logoPath)) {
            doc.image(logoPath, 40, 30, { width: 46 });
        }
        doc.fontSize(17).text(`${schoolName}: Сводный отчёт аналитики`, 95, 36);
        doc.fontSize(10).fillColor('#555').text(`Период: ${scope.dateRange.startDate.toLocaleDateString('ru-RU')} - ${scope.dateRange.endDate.toLocaleDateString('ru-RU')}`, 95, 58);
        doc.fillColor('#000');
        doc.moveDown(3);

        const overview = overviewResult.rows[0] || {};
        doc.fontSize(12).text('Главные цифры', { underline: true });
        doc.fontSize(10).text(`Всего студентов: ${overview.total_students || 0}`);
        doc.text(`Средний балл: ${Number(overview.avg_score || 0).toFixed(1)}%`);
        doc.text(`Всего тестов: ${overview.total_tests || 0}`);
        doc.text(`Всего попыток: ${overview.total_attempts || 0}`);

        doc.moveDown(1);
        doc.fontSize(12).text('Тепловая карта (фрагмент)', { underline: true });
        heatmapResult.rows.slice(0, 12).forEach((row, index) => {
            doc.fontSize(9).text(
                `${index + 1}. ${row.subject_name || '—'} | ${new Date(row.week_start).toLocaleDateString('ru-RU')} | ${Number(row.avg_score || 0).toFixed(1)}%`
            );
        });

        doc.moveDown(1);
        doc.fontSize(12).text('Рейтинг классов', { underline: true });
        classRankingResult.rows.slice(0, 10).forEach((row, index) => {
            doc.fontSize(9).text(
                `${index + 1}. ${row.name}: ${Number(row.avg_score || 0).toFixed(1)}% (${row.attempts || 0} попыток)`
            );
        });

        doc.addPage();
        doc.fontSize(12).text('Зона риска', { underline: true });
        riskResult.rows
            .filter((row) => Number(row.avg_score || 0) < 40)
            .slice(0, 15)
            .forEach((row, index) => {
                doc.fontSize(9).text(
                    `${index + 1}. ${row.student_name || '—'} (${row.class_name || '—'}) | ${Number(row.avg_score || 0).toFixed(1)}%`
                );
            });

        doc.moveDown(1);
        doc.fontSize(12).text('Активность учителей', { underline: true });
        teacherActivityResult.rows.slice(0, 15).forEach((row, index) => {
            const status = buildTeacherStatus(row.last_activity_at);
            doc.fontSize(9).text(
                `${index + 1}. ${row.teacher_name || '—'} | тестов: ${row.tests_created || 0} | попыток: ${row.attempts || 0} | ${status.label}`
            );
        });

        doc.end();
        return undefined;
    } catch (error) {
        console.error('Advanced PDF export error:', error);
        if (!res.headersSent) {
            return res.status(500).json({
                error: 'server_error',
                message: 'Failed to export PDF'
            });
        }
        return undefined;
    }
});

/**
 * GET /api/analytics/export/school
 * Export school analytics to Excel
 */
router.get('/export/school', authorize('school_admin', 'teacher', 'superadmin'), async (req, res) => {
    try {
        const { schoolId } = resolveSchoolScope(req);
        if (!schoolId) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'school_id is required for superadmin analytics'
            });
        }
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
        const workbook = new ExcelJS.Workbook();
        appendJsonWorksheet(workbook, 'Students', studentsData.rows);
        appendJsonWorksheet(workbook, 'Classes', classesData.rows);
        appendJsonWorksheet(workbook, 'Subjects', subjectsData.rows);

        // Generate buffer
        const workbookBuffer = await workbook.xlsx.writeBuffer();
        const buffer = Buffer.isBuffer(workbookBuffer)
            ? workbookBuffer
            : Buffer.from(workbookBuffer);

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
