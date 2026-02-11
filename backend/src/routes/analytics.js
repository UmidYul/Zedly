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
        const { period = '30' } = req.query; // days
        const { nameRu, nameUz } = await getSubjectNameExpressions();
        const attempt = await getAttemptExpressions();
        const classGradeColumn = await getClassGradeColumn();

        // Overall statistics
        const overallStats = await query(`
            SELECT
                (SELECT COUNT(*) FROM users WHERE school_id = $1 AND role = 'student' AND is_active = true) as total_students,
                (SELECT COUNT(*) FROM users WHERE school_id = $1 AND role = 'teacher' AND is_active = true) as total_teachers,
                (SELECT COUNT(*) FROM classes WHERE school_id = $1) as total_classes,
                (SELECT COUNT(*) FROM subjects WHERE school_id = $1) as total_subjects,
                (SELECT COUNT(*) FROM tests WHERE school_id = $1) as total_tests,
                (SELECT COUNT(*) FROM test_attempts ta JOIN tests t ON t.id = ta.test_id WHERE t.school_id = $1 AND ${attempt.completedFilter}) as total_attempts,
                (SELECT AVG(${attempt.score}) FROM test_attempts ta JOIN tests t ON t.id = ta.test_id WHERE t.school_id = $1 AND ${attempt.completedFilter}) as average_score
        `, [schoolId]);

        // Recent activity (last N days)
        const recentActivity = await query(`
            SELECT
                                DATE(${attempt.completedAt}) as date,
                COUNT(*) as attempts,
                                AVG(${attempt.score}) as avg_score
            FROM test_attempts ta
            JOIN tests t ON t.id = ta.test_id
            WHERE t.school_id = $1 
                            AND ${attempt.completedFilter}
                            AND ${attempt.completedAt} > CURRENT_DATE - INTERVAL '${period} days'
                        GROUP BY DATE(${attempt.completedAt})
            ORDER BY date DESC
        `, [schoolId]);

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
            LEFT JOIN class_students cs ON cs.class_id = c.id
            LEFT JOIN test_attempts ta ON ta.student_id = cs.student_id AND ${attempt.completedFilter}
            WHERE c.school_id = $1
            GROUP BY c.id, c.name, c.${classGradeColumn}
            HAVING COUNT(ta.id) > 0
            ORDER BY avg_score DESC
            LIMIT 10
        `, [schoolId]);

        // Subject performance
        const subjectPerformance = await query(`
            SELECT
                s.id,
                s.name as name_ru,
                s.name as name_uz,
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
            WHERE s.school_id = $1
            GROUP BY s.id, s.name, s.code, s.color
            ORDER BY test_count DESC, avg_score DESC
        `, [schoolId]);

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
        const { grade_level, period = '90' } = req.query;
        const { nameRu } = await getSubjectNameExpressions();
        const attempt = await getAttemptExpressions();
        const classGradeColumn = await getClassGradeColumn();

        let gradeFilter = '';
        const params = [schoolId];

        if (grade_level) {
            params.push(grade_level);
            gradeFilter = `AND c.${classGradeColumn} = $2`;
        }

        // Get heatmap data: [subject, week, average_score]
        const heatmapData = await query(`
            SELECT
                s.name as subject,
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
                            AND ${attempt.completedAt} > CURRENT_DATE - INTERVAL '${period} days'
              ${gradeFilter}
                        GROUP BY s.name, EXTRACT(WEEK FROM ${attempt.completedAt}), DATE_TRUNC('week', ${attempt.completedAt})
            ORDER BY week_start DESC, subject
        `, params);

        res.json({
            heatmap: heatmapData.rows,
            period: period,
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
 * GET /api/analytics/school/comparison
 * Compare performance across different dimensions
 */
router.get('/school/comparison', authorize('school_admin', 'teacher'), async (req, res) => {
    try {
        const schoolId = req.user.school_id;
        const { type = 'classes', subject_id } = req.query;
        const { nameRu, nameUz } = await getSubjectNameExpressions();
        const attempt = await getAttemptExpressions();
        const classGradeColumn = await getClassGradeColumn();

        let comparisonData;

        if (type === 'classes') {
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
                LEFT JOIN test_attempts ta ON ta.student_id = cs.student_id AND ${attempt.completedFilter}
                LEFT JOIN tests t ON t.id = ta.test_id
                LEFT JOIN subjects s ON s.id = t.subject_id
                WHERE c.school_id = $1
                  ${subject_id ? 'AND t.subject_id = $2' : ''}
                GROUP BY c.id, c.name, c.${classGradeColumn}
                ORDER BY c.${classGradeColumn}, c.name
            `, subject_id ? [schoolId, subject_id] : [schoolId]);
        } else if (type === 'subjects') {
            // Compare subjects
            comparisonData = await query(`
                SELECT
                    s.id,
                    s.name as name_ru,
                    s.name as name_uz,
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
                LEFT JOIN tests t ON t.subject_id = s.id
                LEFT JOIN test_attempts ta ON ta.test_id = t.id AND ${attempt.completedFilter}
                WHERE s.school_id = $1
                GROUP BY s.id, s.name, s.code, s.color
                HAVING COUNT(ta.id) > 0
                ORDER BY avg_score DESC
            `, [schoolId]);
        } else if (type === 'students') {
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
                JOIN classes c ON c.id = cs.class_id
                LEFT JOIN test_attempts ta ON ta.student_id = u.id AND ${attempt.completedFilter}
                WHERE u.school_id = $1 AND u.role = 'student'
                  ${subject_id ? 'AND EXISTS (SELECT 1 FROM tests t WHERE t.id = ta.test_id AND t.subject_id = $2)' : ''}
                GROUP BY u.id, u.first_name, u.last_name, c.name
                HAVING COUNT(ta.id) > 0
                ORDER BY avg_score DESC
                LIMIT 100
            `, subject_id ? [schoolId, subject_id] : [schoolId]);
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
        const { nameRu } = await getSubjectNameExpressions();
        const attempt = await getAttemptExpressions();
        const classGradeColumn = await getClassGradeColumn();

        // Verify access
        const classCheck = await query(
            `SELECT id, name, ${classGradeColumn} as grade_level FROM classes WHERE id = $1 AND school_id = $2`,
            [id, schoolId]
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
            LEFT JOIN test_attempts ta ON ta.student_id = u.id AND ${attempt.completedFilter}
            LEFT JOIN tests t ON t.id = ta.test_id
            LEFT JOIN subjects s ON s.id = t.subject_id
            WHERE cs.class_id = $1
            GROUP BY u.id, u.first_name, u.last_name, ${nameRu}
            ORDER BY u.last_name, u.first_name, ${nameRu}
        `, [id]);

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
            WHERE cs.class_id = $1 AND ${attempt.completedFilter}
            GROUP BY ${nameRu}
            ORDER BY avg_score DESC
        `, [id]);

        // Time-based progress
        const progressOverTime = await query(`
            SELECT
                                DATE_TRUNC('week', ${attempt.completedAt}) as week,
                                AVG(${attempt.score}) as avg_score,
                COUNT(ta.id) as attempts
            FROM test_attempts ta
            JOIN class_students cs ON cs.student_id = ta.student_id
                        WHERE cs.class_id = $1 AND ${attempt.completedFilter}
                            AND ${attempt.completedAt} > CURRENT_DATE - INTERVAL '90 days'
                        GROUP BY DATE_TRUNC('week', ${attempt.completedAt})
            ORDER BY week
        `, [id]);

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
            LEFT JOIN test_attempts ta ON ta.student_id = u.id AND ${attempt.completedFilter}
            WHERE cs.class_id = $1
            GROUP BY u.id, u.first_name, u.last_name
            HAVING COUNT(ta.id) > 0
            ORDER BY rank
        `, [id]);

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

        // If student, can only view own report
        if (req.user.role === 'student' && req.user.id !== id) {
            return res.status(403).json({
                error: 'forbidden',
                message: 'Access denied'
            });
        }

        // Get student info
        const studentInfo = await query(`
            SELECT
                u.id, u.first_name, u.last_name, u.email,
                c.name as class_name, c.${classGradeColumn} as grade_level
            FROM users u
            LEFT JOIN class_students cs ON cs.student_id = u.id
            LEFT JOIN classes c ON c.id = cs.class_id
            WHERE u.id = $1 AND u.school_id = $2
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
            WHERE ta.student_id = $1 AND ${attempt.completedFilter}
        `, [id]);

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
            WHERE ta.student_id = $1 AND ${attempt.completedFilter}
            GROUP BY ${nameRu}
            ORDER BY avg_score DESC
        `, [id]);

        // Progress over time
        const progress = await query(`
            SELECT
                                DATE_TRUNC('week', ${attempt.completedAt}) as week,
                                AVG(${attempt.score}) as avg_score,
                COUNT(*) as attempts
                        FROM test_attempts ta
                        WHERE ta.student_id = $1 AND ${attempt.completedFilter}
                            AND ${attempt.completedAt} > CURRENT_DATE - INTERVAL '90 days'
                        GROUP BY DATE_TRUNC('week', ${attempt.completedAt})
            ORDER BY week
        `, [id]);

        // Strengths and weaknesses (by subject)
        const strengths = await query(`
            SELECT
                ${nameRu} as subject,
                AVG(${attempt.score}) as avg_score
            FROM test_attempts ta
            JOIN tests t ON t.id = ta.test_id
            JOIN subjects s ON s.id = t.subject_id
            WHERE ta.student_id = $1 AND ${attempt.completedFilter}
            GROUP BY ${nameRu}
            HAVING COUNT(*) >= 3
            ORDER BY avg_score DESC
            LIMIT 3
        `, [id]);

        const weaknesses = await query(`
            SELECT
                ${nameRu} as subject,
                AVG(${attempt.score}) as avg_score
            FROM test_attempts ta
            JOIN tests t ON t.id = ta.test_id
            JOIN subjects s ON s.id = t.subject_id
            WHERE ta.student_id = $1 AND ${attempt.completedFilter}
            GROUP BY ${nameRu}
            HAVING COUNT(*) >= 3
            ORDER BY avg_score ASC
            LIMIT 3
        `, [id]);

        // Class ranking
        const ranking = await query(`
            WITH class_students AS (
                SELECT cs.student_id
                FROM class_students cs
                WHERE cs.class_id = (
                    SELECT class_id FROM class_students WHERE student_id = $1 LIMIT 1
                )
            ),
            student_scores AS (
                SELECT
                    ta.student_id,
                    AVG(${attempt.score}) as avg_score
                FROM test_attempts ta
                WHERE ta.student_id IN (SELECT student_id FROM class_students)
                  AND ${attempt.completedFilter}
                GROUP BY ta.student_id
            )
            SELECT
                RANK() OVER (ORDER BY avg_score DESC) as rank,
                COUNT(*) OVER () as total_students
            FROM student_scores
            WHERE student_id = $1
        `, [id]);

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
        const { nameRu } = await getSubjectNameExpressions();
        const attempt = await getAttemptExpressions();
        const classGradeColumn = await getClassGradeColumn();

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
            JOIN class_students cs ON cs.student_id = u.id
            JOIN classes c ON c.id = cs.class_id
            LEFT JOIN test_attempts ta ON ta.student_id = u.id AND ${attempt.completedFilter}
            WHERE u.school_id = $1 AND u.role = 'student'
            GROUP BY u.id, u.first_name, u.last_name, c.name
            ORDER BY c.name, u.last_name, u.first_name
        `, [schoolId]);

        const classesData = await query(`
            SELECT
                c.name,
                c.${classGradeColumn} as grade_level,
                COUNT(DISTINCT cs.student_id) as students,
                AVG(${attempt.score}) as avg_score
            FROM classes c
            LEFT JOIN class_students cs ON cs.class_id = c.id
            LEFT JOIN test_attempts ta ON ta.student_id = cs.student_id AND ${attempt.completedFilter}
            WHERE c.school_id = $1
            GROUP BY c.id, c.name, c.${classGradeColumn}
            ORDER BY c.${classGradeColumn}, c.name
        `, [schoolId]);

        const subjectsData = await query(`
            SELECT
                ${nameRu} as subject,
                COUNT(DISTINCT t.id) as tests,
                COUNT(ta.id) as attempts,
                AVG(${attempt.score}) as avg_score
            FROM subjects s
            LEFT JOIN tests t ON t.subject_id = s.id
            LEFT JOIN test_attempts ta ON ta.test_id = t.id AND ${attempt.completedFilter}
            WHERE s.school_id = $1
            GROUP BY ${nameRu}
            ORDER BY subject
        `, [schoolId]);

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
