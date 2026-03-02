const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const multer = require('multer');
const ExcelJS = require('exceljs');
const { query, getClient } = require('../config/database');
const { authenticate, authorize, enforceSchoolIsolation } = require('../middleware/auth');
const { notifyNewUser, notifySystemChange, getRoleNotificationDefaultsMap } = require('../utils/notifications');

// --- Career Analytics and Tests for SchoolAdmin ---
const { getCareerStats, getCareerTests } = require('./careerHandlers');

// All routes require school_admin role
router.use(authenticate);
router.use(authorize('school_admin'));

/**
 * GET /api/admin/career/analytics
 * Career analytics for SchoolAdmin
 */
router.get('/career/analytics', async (req, res) => {
    return getCareerStats(req, res);
});

/**
 * GET /api/admin/career/tests
 * Career tests for SchoolAdmin
 */
router.get('/career/tests', async (req, res) => {
    return getCareerTests(req, res);
});

const SUBJECT_COLOR_PALETTE = [
    '#4A90E2', '#E94C4C', '#50C878', '#F59E0B',
    '#8B5CF6', '#EC4899', '#06B6D4', '#10B981',
    '#F97316', '#6366F1', '#84CC16', '#EF4444'
];

function pickSubjectColor(usedColors) {
    for (const color of SUBJECT_COLOR_PALETTE) {
        if (!usedColors.has(color.toLowerCase())) {
            return color;
        }
    }
    return SUBJECT_COLOR_PALETTE[Math.floor(Math.random() * SUBJECT_COLOR_PALETTE.length)];
}

function buildSubjectCodeBase(nameRu, nameUz, name) {
    const source = String(nameRu || nameUz || name || '').trim();
    const transliterated = transliterateToLatin(source)
        .toUpperCase()
        .replace(/[^A-Z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!transliterated) return 'SUBJ';

    const words = transliterated.split(' ').filter(Boolean);
    if (words.length >= 2) {
        return words.map(word => word[0]).join('').slice(0, 6) || 'SUBJ';
    }

    const compact = words[0] || '';
    if (!compact) return 'SUBJ';
    return compact.slice(0, 6) || 'SUBJ';
}

async function generateUniqueSubjectCode(schoolId, nameRu, nameUz, name) {
    const base = buildSubjectCodeBase(nameRu, nameUz, name);
    let suffix = 0;

    while (true) {
        const code = suffix === 0 ? base : `${base}${suffix}`;
        const exists = await query(
            'SELECT id FROM subjects WHERE school_id = $1 AND code = $2 LIMIT 1',
            [schoolId, code]
        );
        if (exists.rows.length === 0) return code;
        suffix += 1;
    }
}

function isZipSignature(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 4) return false;
    if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) return false; // PK

    return (
        (buffer[2] === 0x03 && buffer[3] === 0x04) ||
        (buffer[2] === 0x05 && buffer[3] === 0x06) ||
        (buffer[2] === 0x07 && buffer[3] === 0x08)
    );
}

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        const fileName = String(file.originalname || '').toLowerCase();
        const mime = String(file.mimetype || '').toLowerCase();
        const allowedMimeTypes = new Set([
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/octet-stream'
        ]);
        const hasAllowedExtension = fileName.endsWith('.xlsx');
        const hasAllowedMime = !mime || allowedMimeTypes.has(mime);

        if (hasAllowedExtension && hasAllowedMime) {
            cb(null, true);
        } else {
            cb(new Error('Only .xlsx files are allowed'));
        }
    }
});

// All routes require school_admin role
router.use(authenticate);
router.use(authorize('school_admin'));

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

async function getUserRoleEnumValues() {
    const result = await query(
        `SELECT e.enumlabel
         FROM pg_type t
         JOIN pg_enum e ON e.enumtypid = t.oid
         WHERE t.typnamespace = 'public'::regnamespace
           AND t.typname = 'user_role'
         ORDER BY e.enumsortorder`
    );

    return (result.rows || []).map((row) => row.enumlabel);
}

function pickColumn(columns, candidates, fallback = null) {
    for (const candidate of candidates) {
        if (columns.has(candidate)) {
            return candidate;
        }
    }
    return fallback;
}

async function getAttemptOverviewExpressions(alias = 'att') {
    const result = await query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'test_attempts'
    `);
    const columns = new Set(result.rows.map((row) => row.column_name));
    const col = (name) => (columns.has(name) ? `${alias}.${name}` : null);

    const percent = col('percentage') || col('score_percentage');
    const score = col('score');
    const maxScore = col('max_score');
    let scoreExpr = 'NULL';
    if (percent) {
        scoreExpr = percent;
    } else if (score && maxScore) {
        scoreExpr = `(${score}::float / NULLIF(${maxScore}, 0) * 100)`;
    } else if (score) {
        scoreExpr = score;
    }

    const completedAt = col('submitted_at') || col('completed_at') || col('graded_at') || col('created_at') || 'NULL';

    let completedFilter = 'false';
    if (columns.has('status')) {
        completedFilter = `${alias}.status = 'completed'`;
    } else if (columns.has('is_completed')) {
        completedFilter = `${alias}.is_completed = true`;
    } else if (completedAt !== 'NULL') {
        completedFilter = `${completedAt} IS NOT NULL`;
    }

    return { scoreExpr, completedAt, completedFilter };
}

function startOfDay(date) {
    const value = new Date(date);
    value.setHours(0, 0, 0, 0);
    return value;
}

function endOfDayExclusive(date) {
    const value = startOfDay(date);
    value.setDate(value.getDate() + 1);
    return value;
}

function getDirectorDateRanges(referenceDate = new Date()) {
    const now = new Date(referenceDate);
    const todayStart = startOfDay(now);
    const tomorrowStart = endOfDayExclusive(now);
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const twoWeeksAgo = startOfDay(now);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    const sevenDaysAgo = startOfDay(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const fourteenDaysAgo = startOfDay(now);
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const threeMonthsAgo = startOfDay(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    return {
        now,
        todayStart,
        tomorrowStart,
        currentMonthStart,
        nextMonthStart,
        prevMonthStart,
        twoWeeksAgo,
        sevenDaysAgo,
        fourteenDaysAgo,
        threeMonthsAgo
    };
}

function computeTrend(deltaValue) {
    const delta = Number(deltaValue || 0);
    if (!Number.isFinite(delta) || Math.abs(delta) < 0.01) {
        return 'stable';
    }
    return delta > 0 ? 'up' : 'down';
}

function formatTeacherName(row) {
    return `${row?.first_name || ''} ${row?.last_name || ''}`.trim() || String(row?.id || '—');
}

async function buildDirectorOverviewPayload(schoolId) {
    const ranges = getDirectorDateRanges();
    const attemptAtt = await getAttemptOverviewExpressions('att');
    const attemptTa = await getAttemptOverviewExpressions('ta');
    const attemptSa = await getAttemptOverviewExpressions('sa');
    const subjectColumns = await getTableColumns('subjects');
    const subjectNameColumn = pickColumn(subjectColumns, ['name_ru', 'name', 'name_uz'], 'name');
    const subjectActiveFilter = subjectColumns.has('is_active') ? 'AND s.is_active = true' : '';

    const mainNumbersResult = await query(
        `
        SELECT
            (SELECT COUNT(*)::int FROM users WHERE school_id = $1 AND role = 'student' AND is_active = true) as total_students,
            (SELECT COUNT(*)::int FROM users WHERE school_id = $1 AND role = 'teacher' AND is_active = true) as total_teachers,
            (
                SELECT COUNT(*)::int
                FROM test_attempts att
                JOIN tests t ON t.id = att.test_id
                WHERE t.school_id = $1
                  AND ${attemptAtt.completedFilter}
                  AND ${attemptAtt.completedAt} >= $2
                  AND ${attemptAtt.completedAt} < $3
            ) as tests_completed_today,
            (
                SELECT AVG(${attemptAtt.scoreExpr})::float
                FROM test_attempts att
                JOIN tests t ON t.id = att.test_id
                WHERE t.school_id = $1
                  AND ${attemptAtt.completedFilter}
                  AND ${attemptAtt.completedAt} >= $4
                  AND ${attemptAtt.completedAt} < $5
            ) as avg_score_current_month,
            (
                SELECT AVG(${attemptAtt.scoreExpr})::float
                FROM test_attempts att
                JOIN tests t ON t.id = att.test_id
                WHERE t.school_id = $1
                  AND ${attemptAtt.completedFilter}
                  AND ${attemptAtt.completedAt} >= $6
                  AND ${attemptAtt.completedAt} < $4
            ) as avg_score_prev_month
        `,
        [
            schoolId,
            ranges.todayStart,
            ranges.tomorrowStart,
            ranges.currentMonthStart,
            ranges.nextMonthStart,
            ranges.prevMonthStart
        ]
    );

    const classRankingResult = await query(
        `
        WITH class_scores AS (
            SELECT
                c.id,
                c.name,
                AVG(${attemptTa.scoreExpr}) FILTER (
                    WHERE t.id IS NOT NULL
                      AND ${attemptTa.completedFilter}
                      AND ${attemptTa.completedAt} >= $2
                      AND ${attemptTa.completedAt} < $3
                ) as current_avg_score,
                AVG(${attemptTa.scoreExpr}) FILTER (
                    WHERE t.id IS NOT NULL
                      AND ${attemptTa.completedFilter}
                      AND ${attemptTa.completedAt} >= $4
                      AND ${attemptTa.completedAt} < $2
                ) as prev_avg_score,
                COUNT(ta.id) FILTER (
                    WHERE t.id IS NOT NULL
                      AND ${attemptTa.completedFilter}
                      AND ${attemptTa.completedAt} >= $2
                      AND ${attemptTa.completedAt} < $3
                )::int as attempts_current_month
            FROM classes c
            LEFT JOIN class_students cs ON cs.class_id = c.id AND cs.is_active = true
            LEFT JOIN test_attempts ta ON ta.student_id = cs.student_id
            LEFT JOIN tests t ON t.id = ta.test_id AND t.school_id = $1
            WHERE c.school_id = $1
            GROUP BY c.id, c.name
        )
        SELECT
            id,
            name,
            COALESCE(current_avg_score, 0)::float as avg_score,
            COALESCE(prev_avg_score, 0)::float as prev_avg_score,
            COALESCE(attempts_current_month, 0)::int as attempts_current_month,
            (COALESCE(current_avg_score, 0) - COALESCE(prev_avg_score, 0))::float as delta
        FROM class_scores
        ORDER BY avg_score DESC, name ASC
        `,
        [schoolId, ranges.currentMonthStart, ranges.nextMonthStart, ranges.prevMonthStart]
    );

    const lowPerformanceClassesResult = await query(
        `
        SELECT
            c.id,
            c.name,
            AVG(${attemptTa.scoreExpr})::float as avg_score,
            COUNT(ta.id)::int as attempts
        FROM classes c
        JOIN class_students cs ON cs.class_id = c.id AND cs.is_active = true
        JOIN test_attempts ta ON ta.student_id = cs.student_id
        JOIN tests t ON t.id = ta.test_id
        WHERE c.school_id = $1
          AND t.school_id = $1
          AND ${attemptTa.completedFilter}
          AND ${attemptTa.completedAt} >= $2
        GROUP BY c.id, c.name
        HAVING AVG(${attemptTa.scoreExpr}) < 50
        ORDER BY avg_score ASC, c.name ASC
        `,
        [schoolId, ranges.twoWeeksAgo]
    );

    const inactiveTeachersResult = await query(
        `
        SELECT
            u.id,
            u.first_name,
            u.last_name,
            MAX(tas.created_at) as last_assigned_at
        FROM users u
        LEFT JOIN tests t ON t.teacher_id = u.id AND t.school_id = $1
        LEFT JOIN test_assignments tas ON tas.test_id = t.id
        WHERE u.school_id = $1
          AND u.role = 'teacher'
          AND u.is_active = true
        GROUP BY u.id, u.first_name, u.last_name
        HAVING MAX(tas.created_at) IS NULL OR MAX(tas.created_at) < $2
        ORDER BY last_assigned_at ASC NULLS FIRST, u.last_name ASC, u.first_name ASC
        `,
        [schoolId, ranges.fourteenDaysAgo]
    );

    const inactiveStudentsCountResult = await query(
        `
        WITH student_last_attempt AS (
            SELECT
                u.id,
                MAX(${attemptSa.completedAt}) FILTER (
                    WHERE t.id IS NOT NULL
                      AND ${attemptSa.completedFilter}
                ) as last_attempt_at
            FROM users u
            LEFT JOIN test_attempts sa ON sa.student_id = u.id
            LEFT JOIN tests t ON t.id = sa.test_id AND t.school_id = $1
            WHERE u.school_id = $1
              AND u.role = 'student'
              AND u.is_active = true
            GROUP BY u.id
        )
        SELECT COUNT(*)::int as inactive_students_count
        FROM student_last_attempt
        WHERE last_attempt_at IS NULL OR last_attempt_at < $2
        `,
        [schoolId, ranges.sevenDaysAgo]
    );

    const teacherActivityResult = await query(
        `
        SELECT
            u.id,
            u.first_name,
            u.last_name,
            COUNT(DISTINCT t.id) FILTER (
                WHERE t.created_at >= $2 AND t.created_at < $3
            )::int as tests_created_month,
            MAX(COALESCE(tas.created_at, t.updated_at, t.created_at, u.last_login)) as last_activity_at
        FROM users u
        LEFT JOIN tests t ON t.teacher_id = u.id AND t.school_id = $1
        LEFT JOIN test_assignments tas ON tas.test_id = t.id
        WHERE u.school_id = $1
          AND u.role = 'teacher'
          AND u.is_active = true
        GROUP BY u.id, u.first_name, u.last_name
        ORDER BY last_activity_at DESC NULLS LAST, u.last_name ASC, u.first_name ASC
        `,
        [schoolId, ranges.currentMonthStart, ranges.nextMonthStart]
    );

    const weakSubjectsResult = await query(
        `
        SELECT
            s.id,
            s.${subjectNameColumn} as subject_name,
            AVG(${attemptTa.scoreExpr}) FILTER (
                WHERE t.id IS NOT NULL
                  AND ${attemptTa.completedFilter}
                  AND ${attemptTa.completedAt} >= $2
            )::float as avg_score,
            COUNT(ta.id) FILTER (
                WHERE t.id IS NOT NULL
                  AND ${attemptTa.completedFilter}
                  AND ${attemptTa.completedAt} >= $2
            )::int as attempts
        FROM subjects s
        LEFT JOIN tests t ON t.subject_id = s.id AND t.school_id = $1
        LEFT JOIN test_attempts ta ON ta.test_id = t.id
        WHERE s.school_id = $1
          ${subjectActiveFilter}
        GROUP BY s.id, s.${subjectNameColumn}
        HAVING COUNT(ta.id) FILTER (
                WHERE t.id IS NOT NULL
                  AND ${attemptTa.completedFilter}
                  AND ${attemptTa.completedAt} >= $2
            ) > 0
        ORDER BY avg_score ASC, subject_name ASC
        `,
        [schoolId, ranges.threeMonthsAgo]
    );

    const riskStudentsResult = await query(
        `
        WITH student_scores AS (
            SELECT
                u.id,
                u.first_name,
                u.last_name,
                COALESCE(MIN(c.name), '—') as class_name,
                AVG(${attemptSa.scoreExpr}) FILTER (
                    WHERE t.id IS NOT NULL
                      AND ${attemptSa.completedFilter}
                      AND ${attemptSa.completedAt} >= $2
                      AND ${attemptSa.completedAt} < $3
                )::float as avg_score,
                MAX(${attemptSa.completedAt}) FILTER (
                    WHERE t.id IS NOT NULL
                      AND ${attemptSa.completedFilter}
                ) as last_attempt_at
            FROM users u
            LEFT JOIN class_students cs ON cs.student_id = u.id AND cs.is_active = true
            LEFT JOIN classes c ON c.id = cs.class_id
            LEFT JOIN test_attempts sa ON sa.student_id = u.id
            LEFT JOIN tests t ON t.id = sa.test_id AND t.school_id = $1
            WHERE u.school_id = $1
              AND u.role = 'student'
              AND u.is_active = true
            GROUP BY u.id, u.first_name, u.last_name
        )
        SELECT
            id,
            first_name,
            last_name,
            class_name,
            COALESCE(avg_score, 0)::float as avg_score,
            last_attempt_at
        FROM student_scores
        WHERE COALESCE(avg_score, 0) < 40
        ORDER BY avg_score ASC, last_attempt_at ASC NULLS FIRST
        LIMIT 10
        `,
        [schoolId, ranges.currentMonthStart, ranges.nextMonthStart]
    );

    const todayActivityResult = await query(
        `
        SELECT
            (
                SELECT COUNT(*)::int
                FROM test_attempts att
                JOIN tests t ON t.id = att.test_id
                WHERE t.school_id = $1
                  AND ${attemptAtt.completedFilter}
                  AND ${attemptAtt.completedAt} >= $2
                  AND ${attemptAtt.completedAt} < $3
            ) as tests_completed_today,
            (
                SELECT COUNT(*)::int
                FROM test_assignments tas
                JOIN tests t ON t.id = tas.test_id
                WHERE t.school_id = $1
                  AND tas.created_at >= $2
                  AND tas.created_at < $3
            ) as tests_assigned_today,
            (
                SELECT COUNT(DISTINCT att.student_id)::int
                FROM test_attempts att
                JOIN tests t ON t.id = att.test_id
                WHERE t.school_id = $1
                  AND ${attemptAtt.completedFilter}
                  AND ${attemptAtt.completedAt} >= $2
                  AND ${attemptAtt.completedAt} < $3
            ) as active_students_today
        `,
        [schoolId, ranges.todayStart, ranges.tomorrowStart]
    );

    const main = mainNumbersResult.rows[0] || {};
    const avgCurrent = Number(main.avg_score_current_month || 0);
    const avgPrev = Number(main.avg_score_prev_month || 0);
    const avgDelta = avgCurrent - avgPrev;

    const classRanking = classRankingResult.rows.map((row) => {
        const delta = Number(row.delta || 0);
        return {
            id: row.id,
            name: row.name,
            avg_score: Number(row.avg_score || 0),
            prev_avg_score: Number(row.prev_avg_score || 0),
            attempts_current_month: Number(row.attempts_current_month || 0),
            trend_delta: delta,
            trend: computeTrend(delta)
        };
    });

    const improvedClasses = classRanking
        .filter((item) => item.prev_avg_score > 0 && item.trend_delta > 10)
        .map((item) => ({
            id: item.id,
            name: item.name,
            previous_score: Number(item.prev_avg_score.toFixed(2)),
            current_score: Number(item.avg_score.toFixed(2)),
            improvement: Number(item.trend_delta.toFixed(2))
        }));

    const inactiveTeacherRows = inactiveTeachersResult.rows.map((row) => ({
        id: row.id,
        name: formatTeacherName(row),
        last_assigned_at: row.last_assigned_at
    }));

    const today = todayActivityResult.rows[0] || {};
    const totalStudents = Number(main.total_students || 0);
    const activeToday = Number(today.active_students_today || 0);

    const riskStudents = riskStudentsResult.rows.map((row) => {
        const lastAttempt = row.last_attempt_at ? new Date(row.last_attempt_at) : null;
        const inactiveDays = lastAttempt
            ? Math.max(0, Math.floor((ranges.now.getTime() - lastAttempt.getTime()) / 86400000))
            : null;
        return {
            id: row.id,
            name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || String(row.id),
            class_name: row.class_name || '—',
            avg_score: Number(row.avg_score || 0),
            inactive_days: inactiveDays
        };
    });

    const teacherActivity = teacherActivityResult.rows.map((row) => {
        const lastActivity = row.last_activity_at ? new Date(row.last_activity_at) : null;
        const inactiveDays = lastActivity
            ? Math.max(0, Math.floor((ranges.now.getTime() - lastActivity.getTime()) / 86400000))
            : null;
        return {
            id: row.id,
            name: formatTeacherName(row),
            tests_created_month: Number(row.tests_created_month || 0),
            last_activity_at: row.last_activity_at,
            inactive_days: inactiveDays,
            is_inactive_14_days: inactiveDays === null || inactiveDays > 14
        };
    });

    const lowPerformanceClasses = lowPerformanceClassesResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
        avg_score: Number(row.avg_score || 0),
        attempts: Number(row.attempts || 0)
    }));

    const weakSubjects = weakSubjectsResult.rows.map((row) => ({
        id: row.id,
        subject_name: row.subject_name,
        avg_score: Number(row.avg_score || 0),
        attempts: Number(row.attempts || 0),
        is_weak: Number(row.avg_score || 0) < 60
    }));

    const inactiveStudentsCount = Number(inactiveStudentsCountResult.rows[0]?.inactive_students_count || 0);

    const alerts = {
        low_score_classes: lowPerformanceClasses,
        inactive_teachers: inactiveTeacherRows,
        inactive_students_count: inactiveStudentsCount,
        improved_classes: improvedClasses
    };

    const hasAlerts = Boolean(
        lowPerformanceClasses.length
        || inactiveTeacherRows.length
        || inactiveStudentsCount > 0
        || improvedClasses.length
    );

    return {
        school_id: schoolId,
        generated_at: ranges.now.toISOString(),
        main_numbers: {
            total_students: totalStudents,
            total_teachers: Number(main.total_teachers || 0),
            tests_completed_today: Number(main.tests_completed_today || 0),
            avg_score: Number(avgCurrent.toFixed(2)),
            avg_score_prev_month: Number(avgPrev.toFixed(2)),
            avg_score_delta: Number(avgDelta.toFixed(2)),
            avg_score_trend: computeTrend(avgDelta)
        },
        alerts: {
            show: hasAlerts,
            ...alerts
        },
        monthly_comparison: {
            current_month_avg: Number(avgCurrent.toFixed(2)),
            previous_month_avg: Number(avgPrev.toFixed(2)),
            delta: Number(avgDelta.toFixed(2)),
            trend: computeTrend(avgDelta)
        },
        class_ranking: classRanking,
        teacher_activity: teacherActivity,
        weak_subjects: weakSubjects,
        risk_students: riskStudents,
        today_activity: {
            tests_completed_today: Number(today.tests_completed_today || 0),
            tests_assigned_today: Number(today.tests_assigned_today || 0),
            active_students_today: activeToday,
            total_students: totalStudents,
            active_students_ratio: totalStudents > 0
                ? Number(((activeToday / totalStudents) * 100).toFixed(2))
                : 0
        }
    };
}

async function buildDirectorPerformanceChartPayload(schoolId, mode = 'classes') {
    const safeMode = mode === 'subjects' ? 'subjects' : 'classes';
    const ranges = getDirectorDateRanges();
    const startDate = ranges.threeMonthsAgo;
    const attempt = await getAttemptOverviewExpressions('att');
    const subjectColumns = await getTableColumns('subjects');
    const subjectNameColumn = pickColumn(subjectColumns, ['name_ru', 'name', 'name_uz'], 'name');

    let dimensionRowsResult;
    if (safeMode === 'subjects') {
        dimensionRowsResult = await query(
            `
            SELECT
                DATE_TRUNC('week', ${attempt.completedAt})::date as week_start,
                s.id as dimension_id,
                s.${subjectNameColumn} as dimension_name,
                AVG(${attempt.scoreExpr})::float as avg_score,
                COUNT(att.id)::int as attempts
            FROM test_attempts att
            JOIN tests t ON t.id = att.test_id
            JOIN subjects s ON s.id = t.subject_id
            WHERE t.school_id = $1
              AND ${attempt.completedFilter}
              AND ${attempt.completedAt} >= $2
            GROUP BY DATE_TRUNC('week', ${attempt.completedAt}), s.id, s.${subjectNameColumn}
            ORDER BY week_start ASC, dimension_name ASC
            `,
            [schoolId, startDate]
        );
    } else {
        dimensionRowsResult = await query(
            `
            SELECT
                DATE_TRUNC('week', ${attempt.completedAt})::date as week_start,
                c.id as dimension_id,
                c.name as dimension_name,
                AVG(${attempt.scoreExpr})::float as avg_score,
                COUNT(att.id)::int as attempts
            FROM test_attempts att
            JOIN tests t ON t.id = att.test_id
            JOIN class_students cs ON cs.student_id = att.student_id AND cs.is_active = true
            JOIN classes c ON c.id = cs.class_id
            WHERE t.school_id = $1
              AND c.school_id = $1
              AND ${attempt.completedFilter}
              AND ${attempt.completedAt} >= $2
            GROUP BY DATE_TRUNC('week', ${attempt.completedAt}), c.id, c.name
            ORDER BY week_start ASC, dimension_name ASC
            `,
            [schoolId, startDate]
        );
    }

    const schoolWeeklyResult = await query(
        `
        SELECT
            DATE_TRUNC('week', ${attempt.completedAt})::date as week_start,
            AVG(${attempt.scoreExpr})::float as avg_score,
            COUNT(att.id)::int as attempts
        FROM test_attempts att
        JOIN tests t ON t.id = att.test_id
        WHERE t.school_id = $1
          AND ${attempt.completedFilter}
          AND ${attempt.completedAt} >= $2
        GROUP BY DATE_TRUNC('week', ${attempt.completedAt})
        ORDER BY week_start ASC
        `,
        [schoolId, startDate]
    );

    const monthCompareResult = await query(
        `
        SELECT
            AVG(${attempt.scoreExpr}) FILTER (
                WHERE ${attempt.completedAt} >= $2 AND ${attempt.completedAt} < $3
            )::float as current_month_avg,
            AVG(${attempt.scoreExpr}) FILTER (
                WHERE ${attempt.completedAt} >= $4 AND ${attempt.completedAt} < $2
            )::float as previous_month_avg
        FROM test_attempts att
        JOIN tests t ON t.id = att.test_id
        WHERE t.school_id = $1
          AND ${attempt.completedFilter}
          AND ${attempt.completedAt} >= $4
          AND ${attempt.completedAt} < $3
        `,
        [schoolId, ranges.currentMonthStart, ranges.nextMonthStart, ranges.prevMonthStart]
    );

    const allWeeksSet = new Set();
    schoolWeeklyResult.rows.forEach((row) => allWeeksSet.add(String(row.week_start)));
    dimensionRowsResult.rows.forEach((row) => allWeeksSet.add(String(row.week_start)));
    const weeklyLabels = Array.from(allWeeksSet).sort((left, right) => new Date(left) - new Date(right));

    const totalAttemptsByDimension = new Map();
    dimensionRowsResult.rows.forEach((row) => {
        const id = String(row.dimension_id);
        const prev = totalAttemptsByDimension.get(id) || { id, name: row.dimension_name, attempts: 0 };
        prev.attempts += Number(row.attempts || 0);
        totalAttemptsByDimension.set(id, prev);
    });

    const topDimensionIds = Array.from(totalAttemptsByDimension.values())
        .sort((a, b) => b.attempts - a.attempts)
        .slice(0, 6)
        .map((item) => item.id);

    const seriesMap = new Map();
    topDimensionIds.forEach((id) => {
        const dimension = totalAttemptsByDimension.get(id);
        seriesMap.set(id, {
            id,
            name: dimension?.name || id,
            attempts: dimension?.attempts || 0,
            points: weeklyLabels.map((weekLabel) => ({
                week_start: weekLabel,
                avg_score: null
            }))
        });
    });

    dimensionRowsResult.rows.forEach((row) => {
        const id = String(row.dimension_id);
        if (!seriesMap.has(id)) return;
        const weekLabel = String(row.week_start);
        const target = seriesMap.get(id);
        const point = target.points.find((item) => item.week_start === weekLabel);
        if (point) {
            point.avg_score = Number(Number(row.avg_score || 0).toFixed(2));
        }
    });

    const schoolSeries = weeklyLabels.map((weekLabel) => {
        const found = schoolWeeklyResult.rows.find((row) => String(row.week_start) === weekLabel);
        return {
            week_start: weekLabel,
            avg_score: found ? Number(Number(found.avg_score || 0).toFixed(2)) : null
        };
    });

    const monthCompare = monthCompareResult.rows[0] || {};
    const currentMonthAvg = Number(monthCompare.current_month_avg || 0);
    const previousMonthAvg = Number(monthCompare.previous_month_avg || 0);
    const delta = currentMonthAvg - previousMonthAvg;

    return {
        mode: safeMode,
        weekly_labels: weeklyLabels,
        school_series: schoolSeries,
        dimension_series: Array.from(seriesMap.values()),
        month_comparison: {
            current_month_avg: Number(currentMonthAvg.toFixed(2)),
            previous_month_avg: Number(previousMonthAvg.toFixed(2)),
            delta: Number(delta.toFixed(2)),
            trend: computeTrend(delta)
        }
    };
}

/**
 * GET /api/admin/dashboard/overview
 * Get school admin dashboard overview
 */
router.get('/dashboard/overview', async (req, res) => {
    try {
        const schoolId = req.user.school_id;
        const attempt = await getAttemptOverviewExpressions();
        const testColumns = await getTableColumns('tests');
        const testTitleColumn = pickColumn(testColumns, ['title', 'title_ru', 'title_uz'], 'title');
        const testTeacherColumn = pickColumn(testColumns, ['teacher_id', 'created_by', 'creator_id'], null);

        const studentsResult = await query(
            `SELECT COUNT(*) as count
             FROM users
             WHERE school_id = $1 AND role = 'student' AND is_active = true`,
            [schoolId]
        );

        const teachersResult = await query(
            `SELECT COUNT(*) as count
             FROM users
             WHERE school_id = $1 AND role = 'teacher' AND is_active = true`,
            [schoolId]
        );

        const adminsResult = await query(
            `SELECT COUNT(*) as count
             FROM users
             WHERE school_id = $1 AND role = 'school_admin' AND is_active = true`,
            [schoolId]
        );

        const classesResult = await query(
            `SELECT COUNT(*) as count
             FROM classes
             WHERE school_id = $1`,
            [schoolId]
        );

        const testsResult = await query(
            `SELECT COUNT(*) as count
             FROM tests
             WHERE school_id = $1`,
            [schoolId]
        );

        const subjectsResult = await query(
            `SELECT COUNT(*) as count
             FROM subjects
             WHERE school_id = $1 AND is_active = true`,
            [schoolId]
        );

        let avgScore = 0;
        if (attempt.scoreExpr !== 'NULL') {
            const avgScoreResult = await query(
                `SELECT AVG(${attempt.scoreExpr})::float as avg
                 FROM test_attempts att
                 JOIN tests t ON t.id = att.test_id
                 WHERE t.school_id = $1 AND ${attempt.completedFilter}`,
                [schoolId]
            );
            avgScore = parseFloat(avgScoreResult.rows[0]?.avg || 0);
        }

        const recentAttemptsResult = await query(
            `SELECT
                att.id,
                ${attempt.completedAt} as completed_at,
                t.${testTitleColumn} as test_title,
                c.name as class_name,
                CONCAT(u.first_name, ' ', u.last_name) as student_name,
                ${attempt.scoreExpr}::float as percentage
             FROM test_attempts att
             JOIN tests t ON t.id = att.test_id
             JOIN test_assignments ta ON ta.id = att.assignment_id
             JOIN classes c ON c.id = ta.class_id
             JOIN users u ON u.id = att.student_id
             WHERE t.school_id = $1 AND ${attempt.completedFilter}
             ORDER BY ${attempt.completedAt} DESC
             LIMIT 5`,
            [schoolId]
        );

        const recentTestsResult = await query(
            `SELECT
                t.id,
                t.${testTitleColumn} as test_title,
                t.created_at,
                ${testTeacherColumn ? `CONCAT(u.first_name, ' ', u.last_name) as teacher_name` : "'' as teacher_name"}
             FROM tests t
             ${testTeacherColumn ? `LEFT JOIN users u ON u.id = t.${testTeacherColumn}` : ''}
             WHERE t.school_id = $1
             ORDER BY t.created_at DESC
             LIMIT 5`,
            [schoolId]
        );

        const activity = [];
        recentAttemptsResult.rows.forEach(row => {
            activity.push({
                type: 'attempt',
                title: row.test_title,
                subtitle: `${row.student_name} · ${row.class_name}`,
                percentage: row.percentage,
                date: row.completed_at
            });
        });
        recentTestsResult.rows.forEach(row => {
            activity.push({
                type: 'test',
                title: row.test_title,
                subtitle: row.teacher_name || 'Teacher',
                date: row.created_at
            });
        });
        activity.sort((a, b) => new Date(b.date) - new Date(a.date));

        res.json({
            stats: {
                students: parseInt(studentsResult.rows[0]?.count || 0),
                teachers: parseInt(teachersResult.rows[0]?.count || 0),
                admins: parseInt(adminsResult.rows[0]?.count || 0),
                classes: parseInt(classesResult.rows[0]?.count || 0),
                subjects: parseInt(subjectsResult.rows[0]?.count || 0),
                tests: parseInt(testsResult.rows[0]?.count || 0),
                avg_score: avgScore
            },
            recent_activity: activity.slice(0, 8)
        });
    } catch (error) {
        console.error('Admin dashboard overview error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch dashboard overview'
        });
    }
});

/**
 * GET /api/admin/director/overview
 * Main school director overview dashboard payload
 */
router.get('/director/overview', async (req, res) => {
    try {
        const schoolId = req.user.school_id;
        const payload = await buildDirectorOverviewPayload(schoolId);
        res.json(payload);
    } catch (error) {
        console.error('Director overview error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch director overview'
        });
    }
});

/**
 * GET /api/admin/director/performance-chart
 * Weekly performance chart for school director overview
 */
router.get('/director/performance-chart', async (req, res) => {
    try {
        const schoolId = req.user.school_id;
        const mode = String(req.query.mode || 'classes').trim().toLowerCase();
        const payload = await buildDirectorPerformanceChartPayload(schoolId, mode);
        res.json(payload);
    } catch (error) {
        console.error('Director performance chart error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch director performance chart'
        });
    }
});

/**
 * GET /api/admin/director/reports/monthly.pdf
 * Quick report: monthly PDF for director
 */
router.get('/director/reports/monthly.pdf', async (req, res) => {
    try {
        let PDFDocument;
        try {
            PDFDocument = require('pdfkit');
        } catch (error) {
            return res.status(500).json({
                error: 'dependency_missing',
                message: 'pdfkit is not installed'
            });
        }

        const schoolId = req.user.school_id;
        const payload = await buildDirectorOverviewPayload(schoolId);
        const now = new Date();
        const filename = `director_monthly_report_${now.toISOString().slice(0, 10)}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        const doc = new PDFDocument({ margin: 44, size: 'A4' });
        doc.pipe(res);

        doc.fontSize(18).text('ZEDLY: Отчёт директора за месяц');
        doc.moveDown(0.4);
        doc.fontSize(10).fillColor('#4b5563').text(`Дата формирования: ${now.toLocaleString('ru-RU')}`);
        doc.fillColor('#111827');
        doc.moveDown(1);

        doc.fontSize(13).text('Главные цифры', { underline: true });
        doc.fontSize(10)
            .text(`Учеников: ${payload.main_numbers.total_students}`)
            .text(`Учителей: ${payload.main_numbers.total_teachers}`)
            .text(`Тестов пройдено сегодня: ${payload.main_numbers.tests_completed_today}`)
            .text(`Средний балл: ${Number(payload.main_numbers.avg_score || 0).toFixed(1)}%`)
            .text(`Динамика к прошлому месяцу: ${payload.main_numbers.avg_score_delta >= 0 ? '+' : ''}${Number(payload.main_numbers.avg_score_delta || 0).toFixed(1)}%`);
        doc.moveDown(0.8);

        doc.fontSize(13).text('Алерты', { underline: true });
        if (!payload.alerts.show) {
            doc.fontSize(10).text('Алертов нет.');
        } else {
            doc.fontSize(10);
            if (payload.alerts.low_score_classes.length) {
                doc.text(`Классы ниже 50% за 2 недели: ${payload.alerts.low_score_classes.length}`);
            }
            if (payload.alerts.inactive_teachers.length) {
                doc.text(`Неактивные учителя (>14 дней): ${payload.alerts.inactive_teachers.length}`);
            }
            if (payload.alerts.inactive_students_count > 0) {
                doc.text(`Ученики без активности >7 дней: ${payload.alerts.inactive_students_count}`);
            }
            if (payload.alerts.improved_classes.length) {
                doc.text(`Классы с улучшением >10%: ${payload.alerts.improved_classes.length}`);
            }
        }
        doc.moveDown(0.8);

        doc.fontSize(13).text('Рейтинг классов (топ-10)', { underline: true });
        payload.class_ranking.slice(0, 10).forEach((item, index) => {
            const trendIcon = item.trend === 'up' ? '↑' : (item.trend === 'down' ? '↓' : '→');
            doc.fontSize(10).text(
                `${index + 1}. ${item.name}: ${Number(item.avg_score || 0).toFixed(1)}% (${trendIcon} ${Number(item.trend_delta || 0).toFixed(1)}%)`
            );
        });
        doc.moveDown(0.8);

        doc.fontSize(13).text('Слабые предметы (топ-10)', { underline: true });
        payload.weak_subjects.slice(0, 10).forEach((item, index) => {
            doc.fontSize(10).text(
                `${index + 1}. ${item.subject_name}: ${Number(item.avg_score || 0).toFixed(1)}%`
            );
        });

        doc.end();
        return undefined;
    } catch (error) {
        console.error('Director monthly PDF report error:', error);
        if (!res.headersSent) {
            return res.status(500).json({
                error: 'server_error',
                message: 'Failed to generate monthly PDF report'
            });
        }
        return undefined;
    }
});

/**
 * GET /api/admin/director/reports/class-ranking.xlsx
 * Quick report: class ranking Excel for director
 */
router.get('/director/reports/class-ranking.xlsx', async (req, res) => {
    try {
        const schoolId = req.user.school_id;
        const payload = await buildDirectorOverviewPayload(schoolId);
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Class Ranking');

        sheet.columns = [
            { header: 'Class ID', key: 'id', width: 38 },
            { header: 'Class Name', key: 'name', width: 24 },
            { header: 'Avg Score (%)', key: 'avg_score', width: 16 },
            { header: 'Prev Avg Score (%)', key: 'prev_avg_score', width: 18 },
            { header: 'Trend Delta (%)', key: 'trend_delta', width: 16 },
            { header: 'Trend', key: 'trend', width: 10 },
            { header: 'Attempts (Month)', key: 'attempts_current_month', width: 18 },
            { header: 'Below 50%', key: 'below_50', width: 12 }
        ];

        payload.class_ranking.forEach((item) => {
            sheet.addRow({
                id: item.id,
                name: item.name,
                avg_score: Number(item.avg_score || 0).toFixed(2),
                prev_avg_score: Number(item.prev_avg_score || 0).toFixed(2),
                trend_delta: Number(item.trend_delta || 0).toFixed(2),
                trend: item.trend,
                attempts_current_month: item.attempts_current_month || 0,
                below_50: Number(item.avg_score || 0) < 50 ? 'YES' : 'NO'
            });
        });

        sheet.getRow(1).font = { bold: true };
        sheet.views = [{ state: 'frozen', ySplit: 1 }];

        const workbookBuffer = await workbook.xlsx.writeBuffer();
        const buffer = Buffer.isBuffer(workbookBuffer)
            ? workbookBuffer
            : Buffer.from(workbookBuffer);

        const now = new Date();
        const filename = `class_ranking_${now.toISOString().slice(0, 10)}.xlsx`;
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (error) {
        console.error('Director class ranking Excel report error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to generate class ranking Excel report'
        });
    }
});

/**
 * GET /api/admin/users
 * Get all users in school
 */
router.get('/users', async (req, res) => {
    try {
        const { search = '', role = 'all', status = 'all', class_id: classId = 'all' } = req.query;
        const { page, limit, offset } = normalizePagination(req.query.page, req.query.limit, 100);
        const schoolId = req.user.school_id;

        // Build WHERE clause
        let whereClause = 'WHERE school_id = $1';
        const params = [schoolId];
        let paramCount = 2;

        if (search) {
            params.push(`%${search}%`);
            whereClause += ` AND (first_name ILIKE $${paramCount} OR last_name ILIKE $${paramCount} OR username ILIKE $${paramCount})`;
            paramCount++;
        }

        if (role !== 'all') {
            params.push(role);
            whereClause += ` AND role = $${paramCount}`;
            paramCount++;
        }

        if (status === 'active' || status === 'inactive') {
            params.push(status === 'active');
            whereClause += ` AND is_active = $${paramCount}`;
            paramCount++;
        }

        if (classId && classId !== 'all') {
            params.push(String(classId));
            whereClause += ` AND EXISTS (
                SELECT 1
                FROM class_students cs_filter
                WHERE cs_filter.student_id = users.id
                  AND cs_filter.is_active = true
                  AND cs_filter.class_id::text = $${paramCount}
            )`;
            paramCount++;
        }

        // Get total count
        const countResult = await query(
            `SELECT COUNT(*) FROM users ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0].count);

        // Get users
        params.push(limit, offset);
        const result = await query(
            `SELECT
                id, username, role, first_name, last_name, email, phone,
                is_active, created_at, last_login
             FROM users
             ${whereClause}
             ORDER BY created_at DESC
             LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
            params
        );

        const users = result.rows.map((user) => ({
            ...user,
            phone: user.phone ? normalizeUzPhone(user.phone) : user.phone
        }));

        res.json({
            users,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch users'
        });
    }
});

/**
 * GET /api/admin/users/:id
 * Get single user by ID
 */
router.get('/users/:id', enforceSchoolIsolation, async (req, res) => {
    try {
        const { id } = req.params;
        const schoolId = req.user.school_id;

        const result = await query(
            `SELECT
                id, username, role, first_name, last_name, email, phone,
                telegram_id, is_active, created_at, last_login, settings
             FROM users
             WHERE id = $1 AND school_id = $2`,
            [id, schoolId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'not_found',
                message: 'User not found'
            });
        }

        const user = result.rows[0];
        if (user.phone) {
            user.phone = normalizeUzPhone(user.phone);
        }
        const settings = parseSettingsValue(user.settings);
        const personalInfo = settings?.profile?.personal_info || {};
        user.date_of_birth = personalInfo.date_of_birth || null;
        user.gender = personalInfo.gender || null;
        delete user.settings;

        if (user.role === 'teacher') {
            const assignmentsResult = await query(
                `SELECT subject_id, array_agg(class_id) as class_ids
                 FROM teacher_class_subjects
                 WHERE teacher_id = $1
                 GROUP BY subject_id`,
                [id]
            );
            user.teacher_assignments = assignmentsResult.rows || [];
        } else if (user.role === 'student') {
            const classStudentColumns = await getTableColumns('class_students');
            const classStudentActiveFilter = classStudentColumns.has('is_active')
                ? 'AND is_active = true'
                : '';
            const classResult = await query(
                `SELECT class_id
                 FROM class_students
                 WHERE student_id = $1
                   ${classStudentActiveFilter}
                 ORDER BY class_id ASC
                 LIMIT 1`,
                [id]
            );
            user.student_class_id = classResult.rows[0]?.class_id || null;
        }

        res.json({ user });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch user'
        });
    }
});

/**
 * POST /api/admin/users
 * Create new user
 */
router.post('/users', async (req, res) => {
    try {
        const {
            username,
            password,
            role,
            first_name,
            last_name,
            email,
            phone,
            telegram_id,
            date_of_birth,
            gender,
            personal_info,
            settings
        } = req.body;
        const schoolId = req.user.school_id;
        const normalizedPhone = phone ? normalizeUzPhone(phone) : null;
        const settingsInput = normalizeSettingsInput(settings);
        if (settingsInput.error) {
            return res.status(400).json({
                error: 'validation_error',
                message: settingsInput.error
            });
        }

        const rawDateOfBirth = personal_info && Object.prototype.hasOwnProperty.call(personal_info, 'date_of_birth')
            ? personal_info.date_of_birth
            : date_of_birth;
        const rawGender = personal_info && Object.prototype.hasOwnProperty.call(personal_info, 'gender')
            ? personal_info.gender
            : gender;
        const personalInfoInput = {};
        if (rawDateOfBirth !== undefined) personalInfoInput.date_of_birth = rawDateOfBirth;
        if (rawGender !== undefined) personalInfoInput.gender = rawGender;

        const personalInfoPatch = normalizePersonalInfoPatch(personalInfoInput);
        if (personalInfoPatch.error) {
            return res.status(400).json({
                error: 'validation_error',
                message: personalInfoPatch.error
            });
        }

        let userSettings = mergeSettingsWithPersonalInfo(
            settingsInput.provided ? settingsInput.value : {},
            personalInfoPatch.data
        );
        userSettings = applyAdminContactVerificationPolicy(userSettings, {
            mode: 'create',
            nextEmail: email || '',
            nextPhone: normalizedPhone || ''
        }).settings;

        const normalizedRole = String(role || '').trim();

        // Validation
        if (!username || !normalizedRole || !first_name || !last_name) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Username, role, first name and last name are required'
            });
        }

        // Valid roles for school admin
        const validRoles = ['school_admin', 'teacher', 'student', 'psychologist'];
        if (!validRoles.includes(normalizedRole)) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Invalid role'
            });
        }

        const dbRoles = await getUserRoleEnumValues();
        if (dbRoles.length && !dbRoles.includes(normalizedRole)) {
            return res.status(400).json({
                error: 'validation_error',
                message: `Role "${normalizedRole}" is not available in current database schema`
            });
        }

        // Check if username exists
        const existingUser = await query(
            'SELECT id FROM users WHERE username = $1',
            [username.trim()]
        );

        if (existingUser.rows.length > 0) {
            return res.status(400).json({
                error: 'duplicate_error',
                message: 'Username already exists'
            });
        }

        // Generate password (OTP if not provided)
        const isTemporaryPassword = !password;
        const finalPassword = password || generateOTP();
        const passwordHash = await bcrypt.hash(finalPassword, 10);

        // Create user
        const result = await query(
            `INSERT INTO users (
                school_id, role, username, password_hash,
                first_name, last_name, email, phone, telegram_id,
                is_active, must_change_password, settings
            )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10, $11)
             RETURNING id, username, role, first_name, last_name, email, phone, telegram_id, created_at`,
            [
                schoolId,
                normalizedRole,
                username.trim(),
                passwordHash,
                first_name.trim(),
                last_name.trim(),
                email || null,
                normalizedPhone,
                telegram_id || null,
                isTemporaryPassword,
                userSettings
            ]
        );

        const userId = result.rows[0].id;
        let teacherAssignmentsApplied = 0;
        let studentClassAssigned = false;

        // If teacher, save teacher assignments
        if (normalizedRole === 'teacher' && req.body.teacher_assignments && Array.isArray(req.body.teacher_assignments)) {
            for (const assignment of req.body.teacher_assignments) {
                const { subject_id, class_ids } = assignment;
                if (subject_id && Array.isArray(class_ids)) {
                    const subjectCheck = await query(
                        'SELECT id FROM subjects WHERE id = $1 AND school_id = $2',
                        [subject_id, schoolId]
                    );
                    if (subjectCheck.rows.length === 0) {
                        return res.status(400).json({
                            error: 'validation_error',
                            message: 'Invalid subject for this school'
                        });
                    }

                    for (const classId of class_ids) {
                        // fetch academic_year for this classId
                        const classResult = await query(
                            'SELECT academic_year FROM classes WHERE id = $1 AND school_id = $2',
                            [classId, schoolId]
                        );
                        const academicYear = classResult.rows[0]?.academic_year;
                        if (!academicYear) {
                            throw new Error(`Class with id ${classId} not found in this school or missing academic_year`);
                        }
                        await query(
                            `INSERT INTO teacher_class_subjects (teacher_id, class_id, subject_id, academic_year)
                             VALUES ($1, $2, $3, $4)
                             ON CONFLICT (teacher_id, class_id, subject_id, academic_year) DO NOTHING`,
                            [userId, classId, subject_id, academicYear]
                        );
                        teacherAssignmentsApplied += 1;
                    }
                }
            }
        }
        // If student, save class assignment
        if (normalizedRole === 'student' && req.body.student_class_id) {
            const classAccessCheck = await query(
                'SELECT id FROM classes WHERE id = $1 AND school_id = $2',
                [req.body.student_class_id, schoolId]
            );
            if (classAccessCheck.rows.length === 0) {
                return res.status(400).json({
                    error: 'validation_error',
                    message: 'Invalid class for this school'
                });
            }

            await query(
                `INSERT INTO class_students (class_id, student_id, is_active)
                 VALUES ($1, $2, true)
                 ON CONFLICT (class_id, student_id) DO NOTHING`,
                [req.body.student_class_id, userId]
            );
            studentClassAssigned = true;
        }

        // Log action
        await query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [
                req.user.id,
                'create',
                'user',
                userId,
                {
                    username: username.trim(),
                    role: normalizedRole,
                    teacher_assignments_applied: teacherAssignmentsApplied,
                    student_class_assigned: studentClassAssigned
                }
            ]
        );

        // Send notification to new user
        const newUser = result.rows[0];
        if (newUser.email || newUser.telegram_id) {
            try {
                await notifyNewUser(newUser, finalPassword, req.query.lang || 'ru');
            } catch (notifyError) {
                console.error('Notification error:', notifyError);
            }
        }

        try {
            await notifySystemChange({
                actor: req.user.username,
                action: 'create',
                entityType: 'user',
                entityName: newUser.username,
                details: `role=${newUser.role}`
            });
        } catch (notifyError) {
            console.error('System telegram notification error:', notifyError);
        }

        res.status(201).json({
            message: 'User created successfully',
            user: result.rows[0],
            ...(isTemporaryPassword ? { otp_password: finalPassword } : {})
        });
    } catch (error) {
        console.error('Create user error:', error);

        if (error?.code === '23505') {
            const details = `${error.constraint || ''} ${error.detail || ''} ${error.message || ''}`.toLowerCase();
            let message = 'Duplicate value already exists';
            if (details.includes('username')) message = 'Username already exists';
            else if (details.includes('email')) message = 'Email already exists';
            else if (details.includes('phone')) message = 'Phone already exists';
            return res.status(400).json({
                error: 'duplicate_error',
                message
            });
        }

        if (error?.code === '22P02' && /enum user_role|user_role/i.test(String(error.message || ''))) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Selected role is not supported by current database schema'
            });
        }

        res.status(500).json({
            error: 'server_error',
            message: 'Failed to create user'
        });
    }
});

/**
 * PUT /api/admin/users/:id
 * Update user
 */
router.put('/users/:id', enforceSchoolIsolation, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            username,
            password,
            role,
            first_name,
            last_name,
            email,
            phone,
            telegram_id,
            is_active,
            date_of_birth,
            gender,
            personal_info,
            settings
        } = req.body;
        const schoolId = req.user.school_id;
        const normalizedPhone = phone === undefined
            ? undefined
            : (phone ? normalizeUzPhone(phone) : null);
        const settingsInput = normalizeSettingsInput(settings);
        if (settingsInput.error) {
            return res.status(400).json({
                error: 'validation_error',
                message: settingsInput.error
            });
        }
        const rawDateOfBirth = personal_info && Object.prototype.hasOwnProperty.call(personal_info, 'date_of_birth')
            ? personal_info.date_of_birth
            : date_of_birth;
        const rawGender = personal_info && Object.prototype.hasOwnProperty.call(personal_info, 'gender')
            ? personal_info.gender
            : gender;
        const personalInfoInput = {};
        if (rawDateOfBirth !== undefined) personalInfoInput.date_of_birth = rawDateOfBirth;
        if (rawGender !== undefined) personalInfoInput.gender = rawGender;
        const personalInfoPatch = normalizePersonalInfoPatch(personalInfoInput);
        if (personalInfoPatch.error) {
            return res.status(400).json({
                error: 'validation_error',
                message: personalInfoPatch.error
            });
        }

        // Check if user exists in same school
        const existingUser = await query(
            'SELECT id, email, phone, settings FROM users WHERE id = $1 AND school_id = $2',
            [id, schoolId]
        );

        if (existingUser.rows.length === 0) {
            return res.status(404).json({
                error: 'not_found',
                message: 'User not found'
            });
        }

        // Check duplicate username
        if (username) {
            const duplicateCheck = await query(
                'SELECT id FROM users WHERE username = $1 AND id != $2',
                [username.trim(), id]
            );

            if (duplicateCheck.rows.length > 0) {
                return res.status(400).json({
                    error: 'duplicate_error',
                    message: 'Username already exists'
                });
            }
        }

        // Build update query
        const updates = [];
        const params = [];
        let paramCount = 1;

        if (username !== undefined) {
            params.push(username.trim());
            updates.push(`username = $${paramCount++}`);
        }

        if (password) {
            const passwordHash = await bcrypt.hash(password, 10);
            params.push(passwordHash);
            updates.push(`password_hash = $${paramCount++}`);
        }

        if (role !== undefined) {
            const validRoles = ['school_admin', 'teacher', 'student', 'psychologist'];
            if (!validRoles.includes(role)) {
                return res.status(400).json({
                    error: 'validation_error',
                    message: 'Invalid role'
                });
            }
            params.push(role);
            updates.push(`role = $${paramCount++}`);
        }

        if (first_name !== undefined) {
            params.push(first_name.trim());
            updates.push(`first_name = $${paramCount++}`);
        }

        if (last_name !== undefined) {
            params.push(last_name.trim());
            updates.push(`last_name = $${paramCount++}`);
        }

        if (email !== undefined) {
            params.push(email);
            updates.push(`email = $${paramCount++}`);
        }

        if (phone !== undefined) {
            params.push(normalizedPhone);
            updates.push(`phone = $${paramCount++}`);
        }

        if (telegram_id !== undefined) {
            params.push(telegram_id);
            updates.push(`telegram_id = $${paramCount++}`);
        }

        if (is_active !== undefined) {
            params.push(is_active);
            updates.push(`is_active = $${paramCount++}`);
        }

        const baseSettings = settingsInput.provided
            ? settingsInput.value
            : parseSettingsValue(existingUser.rows[0].settings);
        const mergedSettings = mergeSettingsWithPersonalInfo(baseSettings, personalInfoPatch.data);
        const contactPolicy = applyAdminContactVerificationPolicy(mergedSettings, {
            mode: 'update',
            prevEmail: existingUser.rows[0].email || '',
            prevPhone: existingUser.rows[0].phone || '',
            nextEmailProvided: email !== undefined,
            nextPhoneProvided: phone !== undefined,
            nextEmail: email !== undefined ? (email || '') : '',
            nextPhone: phone !== undefined ? (normalizedPhone || '') : ''
        });
        const shouldUpdateSettings = settingsInput.provided
            || Object.keys(personalInfoPatch.data).length > 0
            || contactPolicy.changed;

        if (shouldUpdateSettings) {
            params.push(contactPolicy.settings);
            updates.push(`settings = $${paramCount++}`);
        }

        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        params.push(id);

        // Update user
        const result = await query(
            `UPDATE users
             SET ${updates.join(', ')}
             WHERE id = $${paramCount}
             RETURNING id, username, role, first_name, last_name, email, phone, is_active, updated_at`,
            params
        );

        const effectiveRole = role !== undefined ? role : result.rows[0].role;
        let teacherAssignmentsApplied = 0;
        let studentClassUpdated = false;

        // Update teacher assignments if provided
        if (effectiveRole === 'teacher' && Array.isArray(req.body.teacher_assignments)) {
            // Remove previous assignments for this teacher
            await query('DELETE FROM teacher_class_subjects WHERE teacher_id = $1', [id]);

            for (const assignment of req.body.teacher_assignments) {
                const { subject_id, class_ids } = assignment;
                if (subject_id && Array.isArray(class_ids)) {
                    const subjectCheck = await query(
                        'SELECT id FROM subjects WHERE id = $1 AND school_id = $2',
                        [subject_id, schoolId]
                    );
                    if (subjectCheck.rows.length === 0) {
                        return res.status(400).json({
                            error: 'validation_error',
                            message: 'Invalid subject for this school'
                        });
                    }

                    for (const classId of class_ids) {
                        const classResult = await query(
                            'SELECT academic_year FROM classes WHERE id = $1 AND school_id = $2',
                            [classId, schoolId]
                        );
                        const academicYear = classResult.rows[0]?.academic_year;
                        if (!academicYear) {
                            throw new Error(`Class with id ${classId} not found in this school or missing academic_year`);
                        }
                        await query(
                            `INSERT INTO teacher_class_subjects (teacher_id, class_id, subject_id, academic_year)
                             VALUES ($1, $2, $3, $4)
                             ON CONFLICT (teacher_id, class_id, subject_id, academic_year) DO NOTHING`,
                            [id, classId, subject_id, academicYear]
                        );
                        teacherAssignmentsApplied += 1;
                    }
                }
            }
        } else if (role !== undefined && role !== 'teacher') {
            // If role changed from teacher to another role, drop stale teaching assignments.
            await query('DELETE FROM teacher_class_subjects WHERE teacher_id = $1', [id]);
        }

        // Update student class assignment when explicitly provided.
        if (effectiveRole === 'student' && Object.prototype.hasOwnProperty.call(req.body, 'student_class_id')) {
            const studentClassId = req.body.student_class_id;

            if (studentClassId) {
                const classAccessCheck = await query(
                    'SELECT id FROM classes WHERE id = $1 AND school_id = $2',
                    [studentClassId, schoolId]
                );
                if (classAccessCheck.rows.length === 0) {
                    return res.status(400).json({
                        error: 'validation_error',
                        message: 'Invalid class for this school'
                    });
                }
            }

            await query('DELETE FROM class_students WHERE student_id = $1', [id]);

            if (studentClassId) {
                await query(
                    `INSERT INTO class_students (class_id, student_id, is_active)
                     VALUES ($1, $2, true)
                     ON CONFLICT (class_id, student_id) DO UPDATE SET is_active = true`,
                    [studentClassId, id]
                );
            }

            studentClassUpdated = true;
        } else if (role !== undefined && role !== 'student') {
            // If role changed from student to another role, drop stale class links.
            await query('DELETE FROM class_students WHERE student_id = $1', [id]);
            studentClassUpdated = true;
        }

        const auditDetails = {
            username,
            role,
            first_name,
            last_name,
            email,
            phone: normalizedPhone,
            telegram_id,
            is_active,
            date_of_birth: personalInfoPatch.data.date_of_birth,
            gender: personalInfoPatch.data.gender,
            settings_updated: shouldUpdateSettings,
            student_class_updated: studentClassUpdated,
            teacher_assignments_updated: Array.isArray(req.body.teacher_assignments),
            teacher_assignments_applied: teacherAssignmentsApplied
        };
        if (password !== undefined) {
            auditDetails.password_changed = true;
        }

        // Log action
        await query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [req.user.id, 'update', 'user', id, auditDetails]
        );

        try {
            await notifySystemChange({
                actor: req.user.username,
                action: 'update',
                entityType: 'user',
                entityName: result.rows[0].username,
                details: `id=${id}`
            });
        } catch (notifyError) {
            console.error('System telegram notification error:', notifyError);
        }

        res.json({
            message: 'User updated successfully',
            user: result.rows[0]
        });
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to update user'
        });
    }
});

/**
 * DELETE /api/admin/users/:id
 * Delete user (hard delete)
 */
router.delete('/users/:id', enforceSchoolIsolation, async (req, res) => {
    let client;
    try {
        const { id } = req.params;
        const schoolId = req.user.school_id;
        client = await getClient();
        await client.query('BEGIN');

        // Check if user exists in same school
        const existingUser = await client.query(
            'SELECT id, username FROM users WHERE id = $1 AND school_id = $2',
            [id, schoolId]
        );

        if (existingUser.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                error: 'not_found',
                message: 'User not found'
            });
        }

        await deleteUserCascadeById(client, id);

        // Log action
        await client.query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [
                req.user.id,
                'delete',
                'user',
                id,
                { username: existingUser.rows[0].username }
            ]
        );
        await client.query('COMMIT');

        try {
            await notifySystemChange({
                actor: req.user.username,
                action: 'delete',
                entityType: 'user',
                entityName: existingUser.rows[0].username,
                details: `id=${id}`
            });
        } catch (notifyError) {
            console.error('System telegram notification error:', notifyError);
        }

        res.json({
            message: 'User deleted successfully'
        });
    } catch (error) {
        if (client) {
            try { await client.query('ROLLBACK'); } catch (_) { /* noop */ }
        }
        console.error('Delete user error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to delete user'
        });
    } finally {
        if (client) client.release();
    }
});

/**
 * ========================================
 * IMPORT / EXPORT USERS
 * ========================================
 */

/**
 * GET /api/admin/import/template/users
 * Download Excel template for user import
 */
router.get('/import/template/users', async (req, res) => {
    try {
        const importType = normalizeImportType(req.query.type);
        let templateRows;
        let merges;
        let headerRows = 1;

        if (importType === 'teacher') {
            templateRows = [
                ['№', 'ФИО', 'Пол', 'Дата рождения', 'ПИНФЛ', 'Должность', 'Классы', 'Телефоны', 'Эл. почта'],
                [1, 'Иванов Иван Петрович', 'М', '1989-04-22', '12345678901234', 'Учитель', '5-А, 5-Б', '+998901234567', 'teacher@example.com']
            ];
            merges = [];
        } else {
            templateRows = [
                ['№', 'Ученик', 'Пол', 'Дата рождения', 'ПИНФЛ', 'Класс', 'Родственники', 'Контактные данные родственников', ''],
                ['', '', '', '', '', '', '', 'Телефон', 'Эл. почта'],
                [1, 'Иванов Иван', 'Мужской', '2010-05-14', '12345678901234', '9А', 'Иванова Мария (мать)', '+998901234567', 'parent@example.com']
            ];
            merges = [
                'A1:A2',
                'B1:B2',
                'C1:C2',
                'D1:D2',
                'E1:E2',
                'F1:F2',
                'G1:G2',
                'H1:I1'
            ];
            headerRows = 2;
        }

        const buffer = await buildStyledWorkbookBuffer({
            sheetName: 'users',
            rows: templateRows,
            headerRows,
            merges,
            columnFormats: {
                4: 'yyyy-mm-dd',
                8: '@'
            },
            autoFilter: false,
            freezeHeader: true
        });

        res.setHeader('Content-Disposition', 'attachment; filename="users_import_template.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (error) {
        console.error('Download import template error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to generate template'
        });
    }
});

/**
 * GET /api/admin/import/template/teaching-assignments
 * Download Excel template for teacher->subject->class matrix import
 */
router.get('/import/template/teaching-assignments', async (req, res) => {
    try {
        const schoolId = req.user.school_id;
        const classesResult = await query(
            `SELECT name
             FROM classes
             WHERE school_id = $1 AND is_active = true
             ORDER BY grade_level ASC, name ASC`,
            [schoolId]
        );

        const classNames = classesResult.rows.map((row) => String(row.name || '').trim()).filter(Boolean);
        const effectiveClassNames = classNames.length > 0
            ? classNames
            : ['5-\u0410', '5-\u0411', '6-\u0410'];

        const rows = [
            ['#', '\u0423\u0447\u0438\u0442\u0435\u043b\u044c', '\u041f\u0440\u0435\u0434\u043c\u0435\u0442', ...effectiveClassNames],
            [1, '\u0410\u0431\u0434\u0443\u043b\u043b\u0430\u0435\u0432 \u0421. \u0410.', '\u041c\u0430\u0442\u0435\u043c\u0430\u0442\u0438\u043a\u0430', ...effectiveClassNames.map((_, idx) => (idx === 0 ? 12 : 0))],
            [2, '\u0410\u0431\u0434\u0443\u043b\u043b\u0430\u0435\u0432\u0430 \u0410. \u0420.', '\u0420\u0443\u0441\u0441\u043a\u0438\u0439 \u044f\u0437\u044b\u043a', ...effectiveClassNames.map(() => 0)]
        ];

        const buffer = await buildStyledWorkbookBuffer({
            sheetName: 'teaching_assignments',
            rows,
            headerRows: 1,
            autoFilter: true,
            freezeHeader: true
        });

        res.setHeader('Content-Disposition', 'attachment; filename="teaching_assignments_import_template.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (error) {
        console.error('Download teaching assignments template error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to generate teaching assignments template'
        });
    }
});

/**
 * POST /api/admin/import/users
 * Import users from Excel
 */
router.post('/import/users', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'No file uploaded'
            });
        }

        if (!isZipSignature(req.file.buffer)) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Invalid XLSX file format'
            });
        }

        const schoolId = req.user.school_id;
        const importType = normalizeImportType(req.body.import_type);
        const worksheet = await loadWorkbookFirstWorksheet(req.file.buffer);
        const parsedRows = parseImportRows(worksheet, importType);

        const results = {
            total_rows: parsedRows.length,
            processed_rows: 0,
            imported: 0,
            created: [],
            errors: [],
            auto_created_classes: [],
            skipped: 0,
            skipped_rows: []
        };

        for (let i = 0; i < parsedRows.length; i++) {
            const { row, rowNumber } = parsedRows[i];
            const mapped = mapImportRow(row);

            if (!mapped) {
                results.skipped += 1;
                results.skipped_rows.push({ row: rowNumber, reason: 'Empty row' });
                continue;
            }

            try {
                if (importType === 'teacher') {
                    hydrateTeacherNameFields(mapped);
                    if (!isTeacherPosition(mapped.position)) {
                        results.skipped += 1;
                        results.skipped_rows.push({
                            row: rowNumber,
                            reason: 'Position is not teacher'
                        });
                        continue;
                    }
                } else {
                    hydrateStudentNameFields(mapped);
                }

                results.processed_rows += 1;

                const validationError = validateImportRow(mapped, importType);
                if (validationError) {
                    results.errors.push({ row: rowNumber, message: validationError });
                    continue;
                }

                const role = importType === 'teacher'
                    ? 'teacher'
                    : (normalizeRole(mapped.role) || (mapped.student_name ? 'student' : null));

                let username = mapped.username ? mapped.username.trim() : '';
                if (!username) {
                    const baseUsername = normalizeUsername(mapped.first_name, mapped.last_name);
                    username = await generateUniqueUsername(baseUsername);
                }

                const usernameCheck = await query(
                    'SELECT id FROM users WHERE username = $1',
                    [username]
                );

                if (usernameCheck.rows.length > 0) {
                    results.errors.push({ row: rowNumber, message: `Username already exists: ${username}` });
                    continue;
                }

                const otpPassword = generateOTP();
                const passwordHash = await bcrypt.hash(otpPassword, 10);
                const settings = buildImportedUserSettings(mapped);

                const userResult = await query(
                    `INSERT INTO users (
                        school_id, role, username, password_hash,
                        first_name, last_name, email, phone,
                        is_active, must_change_password, settings
                    )
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, true, $9)
                     RETURNING id, username, role, first_name, last_name, email`,
                    [
                        schoolId,
                        role,
                        username,
                        passwordHash,
                        mapped.first_name.trim(),
                        mapped.last_name.trim(),
                        mapped.email || null,
                        mapped.phone || null,
                        settings
                    ]
                );

                const userId = userResult.rows[0].id;
                let importedClassName = '';

                if (role === 'student' && mapped.class_name) {
                    const classResult = await ensureActiveClassForImport(
                        schoolId,
                        mapped.class_name,
                        mapped.academic_year
                    );

                    if (!classResult) {
                        results.errors.push({ row: rowNumber, message: `Class not found: ${mapped.class_name}` });
                    } else {
                        if (classResult.autoCreated) {
                            const alreadyAdded = results.auto_created_classes.some((item) => item.id === classResult.id);
                            if (!alreadyAdded) {
                                results.auto_created_classes.push({
                                    id: classResult.id,
                                    name: classResult.name,
                                    grade_level: classResult.grade_level,
                                    academic_year: classResult.academic_year
                                });
                            }
                        }

                        await query(
                            `INSERT INTO class_students (class_id, student_id, roll_number, is_active)
                             VALUES ($1, $2, $3, true)
                             ON CONFLICT (class_id, student_id) DO NOTHING`,
                            [classResult.id, userId, mapped.roll_number || null]
                        );
                        importedClassName = classResult.name || mapped.class_name || '';
                    }
                }

                if (role === 'teacher' && mapped.class_names) {
                    const classesList = parseTeacherClassList(mapped.class_names);
                    importedClassName = classesList.join(', ');
                    for (const className of classesList) {
                        await ensureHomeroomTeacherForClass(
                            schoolId,
                            className,
                            userId,
                            mapped.academic_year
                        );
                    }
                }

                await query(
                    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [req.user.id, 'import', 'user', userId, { username, role }]
                );

                results.imported += 1;
                results.created.push({
                    id: userId,
                    username,
                    role,
                    otp_password: otpPassword,
                    class_name: importedClassName
                });
            } catch (rowError) {
                console.error('Import row error:', rowError);
                results.errors.push({
                    row: rowNumber,
                    message: rowError?.message ? `Failed to import row: ${rowError.message}` : 'Failed to import row'
                });
            }
        }

        // Keep payload reasonable on very large imports.
        if (results.errors.length > 300) {
            results.errors = results.errors.slice(0, 300);
            results.errors_truncated = true;
        }
        if (results.skipped_rows.length > 300) {
            results.skipped_rows = results.skipped_rows.slice(0, 300);
            results.skipped_truncated = true;
        }
        results.failed = results.errors.length;

        await query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [
                req.user.id,
                'import',
                'user_import_batch',
                req.user.id,
                {
                    school_id: schoolId,
                    import_type: importType,
                    total_rows: results.total_rows,
                    processed_rows: results.processed_rows,
                    imported: results.imported,
                    skipped: results.skipped,
                    failed: results.failed,
                    auto_created_classes: (results.auto_created_classes || []).length
                }
            ]
        );

        res.json({
            message: 'Import completed',
            ...results
        });

        try {
            await notifySystemChange({
                actor: req.user.username,
                action: 'import',
                entityType: 'user',
                entityName: `school_id=${schoolId}`,
                details: `imported=${results.imported}, errors=${results.errors.length}`
            });
        } catch (notifyError) {
            console.error('System telegram notification error:', notifyError);
        }
    } catch (error) {
        console.error('Import users error:', error);
        try {
            await query(
                `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                    req.user?.id || null,
                    'import_failed',
                    'user_import_batch',
                    req.user?.id || null,
                    {
                        school_id: req.user?.school_id || null,
                        error: error.message || 'Failed to import users'
                    }
                ]
            );
        } catch (auditError) {
            console.error('Import failure audit log error:', auditError);
        }
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to import users'
        });
    }
});

/**
 * POST /api/admin/import/teaching-assignments
 * Import teacher -> subject -> class assignments from matrix Excel
 */
router.post('/import/teaching-assignments', upload.single('file'), async (req, res) => {
    let client = null;
    try {
        if (!req.file) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'No file uploaded'
            });
        }

        if (!isZipSignature(req.file.buffer)) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Invalid XLSX file format'
            });
        }

        const schoolId = req.user.school_id;
        const worksheet = await loadWorkbookFirstWorksheet(req.file.buffer);
        const parsed = parseTeachingAssignmentsMatrix(worksheet);

        const results = {
            total_rows: parsed.totalRows,
            processed_rows: 0,
            imported: 0,
            skipped: 0,
            skipped_rows: [],
            errors: [],
            failed: 0,
            stats: {
                positive_cells: 0,
                inserted: 0,
                already_exists: 0,
                teacher_not_found: 0,
                subject_not_found: 0,
                class_not_found: 0,
                ignored_zero: 0
            }
        };

        const teachersResult = await query(
            `SELECT id, first_name, last_name
             FROM users
             WHERE school_id = $1 AND role = 'teacher'`,
            [schoolId]
        );
        const teacherLookup = buildTeacherLookup(teachersResult.rows || []);

        const subjectsResult = await query(
            `SELECT id, name, name_ru, name_uz, code
             FROM subjects
             WHERE school_id = $1`,
            [schoolId]
        );
        const subjectLookup = buildSubjectLookup(subjectsResult.rows || []);

        const classesResult = await query(
            `SELECT id, name, academic_year, is_active, created_at
             FROM classes
             WHERE school_id = $1
             ORDER BY is_active DESC, created_at DESC`,
            [schoolId]
        );
        const classLookup = buildClassLookup(classesResult.rows || []);

        client = await getClient();
        await client.query('BEGIN');

        for (const rowData of parsed.rows) {
            const rowNumber = rowData.rowNumber;
            const teacherLabel = rowData.teacher;
            const subjectLabel = rowData.subject;

            const teacher = resolveTeacherForImport(teacherLookup, teacherLabel);
            if (!teacher) {
                results.skipped += 1;
                results.stats.teacher_not_found += 1;
                results.skipped_rows.push({
                    row: rowNumber,
                    reason: `Teacher not found: ${teacherLabel || '-'}`,
                    teacher: teacherLabel || '',
                    subject: subjectLabel || ''
                });
                continue;
            }

            const subject = resolveSubjectForImport(subjectLookup, subjectLabel);
            if (!subject) {
                results.skipped += 1;
                results.stats.subject_not_found += 1;
                results.skipped_rows.push({
                    row: rowNumber,
                    reason: `Subject not found: ${subjectLabel || '-'}`,
                    teacher: teacherLabel || '',
                    subject: subjectLabel || ''
                });
                continue;
            }

            results.processed_rows += 1;

            for (const valueCell of rowData.values) {
                const numericValue = parseTeachingCellValue(valueCell.value);
                if (!(numericValue > 0)) {
                    results.stats.ignored_zero += 1;
                    continue;
                }

                results.stats.positive_cells += 1;
                const classMatch = classLookup.get(valueCell.classKey);

                if (!classMatch) {
                    results.skipped += 1;
                    results.stats.class_not_found += 1;
                    results.skipped_rows.push({
                        row: rowNumber,
                        reason: `Class not found: ${valueCell.className}`,
                        teacher: teacherLabel || '',
                        subject: subjectLabel || '',
                        class_name: valueCell.className || ''
                    });
                    continue;
                }

                const insertResult = await client.query(
                    `INSERT INTO teacher_class_subjects (teacher_id, class_id, subject_id, academic_year)
                     VALUES ($1, $2, $3, $4)
                     ON CONFLICT (teacher_id, class_id, subject_id, academic_year) DO NOTHING
                     RETURNING id`,
                    [teacher.id, classMatch.id, subject.id, classMatch.academic_year]
                );

                if (insertResult.rowCount > 0) {
                    results.imported += 1;
                    results.stats.inserted += 1;
                } else {
                    results.stats.already_exists += 1;
                }
            }
        }

        if (results.errors.length > 300) {
            results.errors = results.errors.slice(0, 300);
            results.errors_truncated = true;
        }
        if (results.skipped_rows.length > 300) {
            results.skipped_rows = results.skipped_rows.slice(0, 300);
            results.skipped_truncated = true;
        }
        results.failed = results.errors.length;

        await client.query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [
                req.user.id,
                'import',
                'teaching_assignment_import_batch',
                req.user.id,
                {
                    school_id: schoolId,
                    total_rows: results.total_rows,
                    processed_rows: results.processed_rows,
                    imported: results.imported,
                    skipped: results.skipped,
                    failed: results.failed,
                    stats: results.stats
                }
            ]
        );

        await client.query('COMMIT');

        res.json({
            message: 'Teaching assignments import completed',
            ...results
        });
    } catch (error) {
        if (client) {
            try { await client.query('ROLLBACK'); } catch (_) { /* noop */ }
        }
        console.error('Import teaching assignments error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to import teaching assignments'
        });
    } finally {
        if (client) client.release();
    }
});

/**
 * POST /api/admin/import/credentials/export
 * Build XLSX file with imported usernames and OTP passwords
 */
router.post('/import/credentials/export', async (req, res) => {
    try {
        const users = Array.isArray(req.body?.users) ? req.body.users : [];

        if (users.length === 0) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'No credentials to export'
            });
        }

        const rows = [
            ['#', 'Login', 'OTP password', 'Role', 'Class'],
            ...users.map((user, index) => ([
                index + 1,
                String(user.username || '').trim(),
                String(user.otp_password || '').trim(),
                String(user.role || '').trim(),
                String(user.class_name || '').trim()
            ]))
        ];

        const buffer = await buildStyledWorkbookBuffer({
            sheetName: 'credentials',
            rows,
            headerRows: 1,
            autoFilter: true,
            freezeHeader: true
        });

        const datePart = new Date().toISOString().slice(0, 10);
        res.setHeader('Content-Disposition', `attachment; filename="import_credentials_${datePart}.xlsx"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (error) {
        console.error('Export import credentials error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to export credentials'
        });
    }
});

/**
 * GET /api/admin/export/users
 * Export users to Excel
 */
router.get('/export/users', async (req, res) => {
    try {
        const schoolId = req.user.school_id;
        const search = String(req.query.search || '').trim();
        const role = String(req.query.role || 'all').trim();
        const status = String(req.query.status || 'all').trim();
        const classId = String(req.query.class_id || 'all').trim();

        const whereParts = ['u.school_id = $1'];
        const params = [schoolId];
        let paramIndex = 2;

        if (search) {
            params.push(`%${search}%`);
            whereParts.push(`(
                u.first_name ILIKE $${paramIndex}
                OR u.last_name ILIKE $${paramIndex}
                OR u.username ILIKE $${paramIndex}
                OR COALESCE(u.email, '') ILIKE $${paramIndex}
                OR COALESCE(u.phone, '') ILIKE $${paramIndex}
            )`);
            paramIndex += 1;
        }

        if (role && role !== 'all') {
            params.push(role);
            whereParts.push(`u.role = $${paramIndex}`);
            paramIndex += 1;
        }

        if (status === 'active' || status === 'inactive') {
            params.push(status === 'active');
            whereParts.push(`u.is_active = $${paramIndex}`);
            paramIndex += 1;
        }

        if (classId && classId !== 'all') {
            params.push(classId);
            whereParts.push(`EXISTS (
                SELECT 1
                FROM class_students cs_filter
                WHERE cs_filter.student_id = u.id
                  AND cs_filter.is_active = true
                  AND cs_filter.class_id::text = $${paramIndex}
            )`);
            paramIndex += 1;
        }

        const result = await query(
            `SELECT
                u.id,
                u.username,
                u.role,
                u.first_name,
                u.last_name,
                u.email,
                u.phone,
                STRING_AGG(DISTINCT c.name, ', ') as class_name,
                STRING_AGG(DISTINCT c.academic_year, ', ') as academic_year,
                STRING_AGG(DISTINCT cs.roll_number::text, ', ') as roll_number
             FROM users u
             LEFT JOIN class_students cs ON cs.student_id = u.id AND cs.is_active = true
             LEFT JOIN classes c ON c.id = cs.class_id
             WHERE ${whereParts.join(' AND ')}
             GROUP BY u.id
             ORDER BY u.last_name ASC, u.first_name ASC`,
            params
        );

        const exportRows = result.rows.map(row => ({
            username: row.username,
            role: row.role,
            first_name: row.first_name,
            last_name: row.last_name,
            email: row.email || '',
            phone: row.phone || '',
            class_name: row.class_name || '',
            academic_year: row.academic_year || '',
            roll_number: row.roll_number || ''
        }));

        const headers = ['username', 'role', 'first_name', 'last_name', 'email', 'phone', 'class_name', 'academic_year', 'roll_number'];
        const rows = [
            headers,
            ...exportRows.map((row) => headers.map((key) => row[key] ?? ''))
        ];

        const buffer = await buildStyledWorkbookBuffer({
            sheetName: 'users',
            rows,
            headerRows: 1,
            autoFilter: true,
            freezeHeader: true,
            columnFormats: {
                6: '@'
            }
        });

        res.setHeader('Content-Disposition', 'attachment; filename="users_export.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (error) {
        console.error('Export users error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to export users'
        });
    }
});

/**
 * POST /api/admin/users/:id/reset-password
 * Reset user password and generate temporary OTP
 */
router.post('/users/:id/reset-password', enforceSchoolIsolation, async (req, res) => {
    try {
        const { id } = req.params;
        const schoolId = req.user.school_id;

        // Check if user exists in same school
        const existingUser = await query(
            'SELECT id, username, first_name, last_name, email, telegram_id, role, settings FROM users WHERE id = $1 AND school_id = $2',
            [id, schoolId]
        );

        if (existingUser.rows.length === 0) {
            return res.status(404).json({
                error: 'not_found',
                message: 'User not found'
            });
        }

        const user = existingUser.rows[0];

        // Generate 8-character OTP (excluding similar looking characters)
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
        let otp = '';
        for (let i = 0; i < 8; i++) {
            otp += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        // Hash the OTP
        const hashedPassword = await bcrypt.hash(otp, 10);

        // Update user password and set must_change_password flag
        await query(
            `UPDATE users 
             SET password_hash = $1, 
                 must_change_password = true, 
                 token_version = token_version + 1,
                 updated_at = CURRENT_TIMESTAMP 
             WHERE id = $2`,
            [hashedPassword, id]
        );

        // Log action
        await query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [
                req.user.id,
                'update',
                'user',
                id,
                {
                    action_type: 'password_reset',
                    username: user.username,
                    reset_by: req.user.username
                }
            ]
        );

        // Send notification about password reset
        if (user.email || user.telegram_id) {
            try {
                const { notifyPasswordReset } = require('../utils/notifications');
                await notifyPasswordReset({ ...user, telegram_id: user.telegram_id }, otp, req.query.lang || 'ru');
            } catch (notifyError) {
                console.error('Notification error:', notifyError);
            }
        }

        try {
            await notifySystemChange({
                actor: req.user.username,
                action: 'reset_password',
                entityType: 'user',
                entityName: user.username,
                details: `id=${id}`
            });
        } catch (notifyError) {
            console.error('System telegram notification error:', notifyError);
        }

        res.json({
            message: 'Password reset successfully',
            tempPassword: otp,
            user: {
                id: user.id,
                username: user.username,
                name: `${user.first_name} ${user.last_name}`
            }
        });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to reset password'
        });
    }
});

/**
 * ========================================
 * CLASSES MANAGEMENT
 * ========================================
 */

/**
 * GET /api/admin/classes
 * Get all classes in school
 */
router.get('/classes', async (req, res) => {
    try {
        const { search = '', grade = 'all' } = req.query;
        const { page, limit, offset } = normalizePagination(req.query.page, req.query.limit, 100);

        const schoolId = req.user.school_id;

        // Build WHERE clause
        let whereClause = 'WHERE c.school_id = $1';
        const params = [schoolId];
        let paramCount = 2;

        if (search) {
            params.push(`%${search}%`);
            whereClause += ` AND (c.name ILIKE $${paramCount} OR c.academic_year ILIKE $${paramCount})`;
            paramCount++;
        }

        if (grade !== 'all') {
            params.push(parseInt(grade));
            whereClause += ` AND c.grade_level = $${paramCount}`;
            paramCount++;
        }

        // Get total count
        const countResult = await query(
            `SELECT COUNT(*) FROM classes c ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0].count);

        // Get classes with student count and teacher name
        params.push(limit, offset);
        const result = await query(
            `SELECT
                c.id, c.name, c.grade_level, c.academic_year, c.is_active, c.created_at,
                (SELECT COUNT(*) FROM class_students WHERE class_id = c.id) as student_count,
                u.first_name || ' ' || u.last_name as homeroom_teacher_name,
                u.id as homeroom_teacher_id
             FROM classes c
             LEFT JOIN users u ON c.homeroom_teacher_id = u.id
             ${whereClause}
             ORDER BY c.grade_level ASC, c.name ASC
             LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
            params
        );

        res.json({
            classes: result.rows,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Get classes error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch classes'
        });
    }
});

/**
 * GET /api/admin/classes/:id
 * Get single class by ID
 */
router.get('/classes/:id', enforceSchoolIsolation, async (req, res) => {
    try {
        const { id } = req.params;
        const schoolId = req.user.school_id;

        const result = await query(
            `SELECT
                c.id, c.name, c.grade_level, c.academic_year, c.homeroom_teacher_id, c.is_active, c.created_at,
                u.first_name || ' ' || u.last_name as homeroom_teacher_name
             FROM classes c
             LEFT JOIN users u ON c.homeroom_teacher_id = u.id
             WHERE c.id = $1 AND c.school_id = $2`,
            [id, schoolId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'not_found',
                message: 'Class not found'
            });
        }

        res.json({ class: result.rows[0] });
    } catch (error) {
        console.error('Get class error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch class'
        });
    }
});

/**
 * GET /api/admin/classes/:id/subjects
 * Get subjects and assigned teachers for a class
 */
router.get('/classes/:id/subjects', enforceSchoolIsolation, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await query(
            `SELECT
                s.id as subject_id,
                COALESCE(s.name_ru, s.name, s.name_uz) as subject_name,
                CONCAT(u.first_name, ' ', u.last_name) as teacher_name
             FROM teacher_class_subjects tcs
             JOIN subjects s ON tcs.subject_id = s.id
             LEFT JOIN users u ON tcs.teacher_id = u.id
             WHERE tcs.class_id = $1
             ORDER BY subject_name ASC`,
            [id]
        );

        res.json(result.rows);
    } catch (error) {
        console.error('Get class subjects error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch class subjects'
        });
    }
});

/**
 * GET /api/admin/classes/:id/students
 * Get students in a class
 */
router.get('/classes/:id/students', enforceSchoolIsolation, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await query(
            `SELECT
                u.id,
                CONCAT(u.first_name, ' ', u.last_name) as name,
                u.username as login
             FROM class_students cs
             JOIN users u ON cs.student_id = u.id
             WHERE cs.class_id = $1 AND cs.is_active = true
             ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC`,
            [id]
        );

        res.json(result.rows);
    } catch (error) {
        console.error('Get class students error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch class students'
        });
    }
});

/**
 * POST /api/admin/classes
 * Create new class
 */
router.post('/classes', async (req, res) => {
    try {
        const { name, grade_level, academic_year, homeroom_teacher_id } = req.body;
        const schoolId = req.user.school_id;
        const normalizedClassName = normalizeClassName(name);

        // Validation
        if (!normalizedClassName || !grade_level || !academic_year) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Name, grade level and academic year are required'
            });
        }

        // Validate grade level (1-11 for Uzbekistan schools)
        if (grade_level < 1 || grade_level > 11) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Grade level must be between 1 and 11'
            });
        }

        // Check if teacher exists and is in same school
        if (homeroom_teacher_id) {
            const teacherCheck = await query(
                'SELECT id FROM users WHERE id = $1 AND school_id = $2 AND role = $3',
                [homeroom_teacher_id, schoolId, 'teacher']
            );

            if (teacherCheck.rows.length === 0) {
                return res.status(400).json({
                    error: 'validation_error',
                    message: 'Invalid teacher selection'
                });
            }
        }

        // Check duplicate class name in same school
        const duplicateCheck = await query(
            'SELECT id FROM classes WHERE school_id = $1 AND name = $2 AND academic_year = $3',
            [schoolId, normalizedClassName, academic_year.trim()]
        );

        if (duplicateCheck.rows.length > 0) {
            return res.status(400).json({
                error: 'duplicate_error',
                message: 'Class with this name already exists for this academic year'
            });
        }

        // Create class
        const result = await query(
            `INSERT INTO classes (school_id, name, grade_level, academic_year, homeroom_teacher_id, is_active)
             VALUES ($1, $2, $3, $4, $5, true)
             RETURNING id, name, grade_level, academic_year, homeroom_teacher_id, is_active, created_at`,
            [schoolId, normalizedClassName, grade_level, academic_year.trim(), homeroom_teacher_id || null]
        );

        // Log action
        await query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [req.user.id, 'create', 'class', result.rows[0].id, { name: normalizedClassName, grade_level }]
        );

        res.status(201).json({
            message: 'Class created successfully',
            class: result.rows[0]
        });
    } catch (error) {
        console.error('Create class error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to create class'
        });
    }
});

/**
 * PUT /api/admin/classes/:id
 * Update class
 */
router.put('/classes/:id', enforceSchoolIsolation, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, grade_level, academic_year, homeroom_teacher_id, is_active } = req.body;
        const schoolId = req.user.school_id;
        const normalizedClassName = name === undefined ? undefined : normalizeClassName(name);

        // Check if class exists in same school
        const existingClass = await query(
            'SELECT id FROM classes WHERE id = $1 AND school_id = $2',
            [id, schoolId]
        );

        if (existingClass.rows.length === 0) {
            return res.status(404).json({
                error: 'not_found',
                message: 'Class not found'
            });
        }

        // Check duplicate name
        if (normalizedClassName) {
            const duplicateCheck = await query(
                'SELECT id FROM classes WHERE school_id = $1 AND name = $2 AND academic_year = $3 AND id != $4',
                [schoolId, normalizedClassName, academic_year, id]
            );

            if (duplicateCheck.rows.length > 0) {
                return res.status(400).json({
                    error: 'duplicate_error',
                    message: 'Class with this name already exists'
                });
            }
        }

        // Build update query
        const updates = [];
        const params = [];
        let paramCount = 1;

        if (normalizedClassName !== undefined) {
            params.push(normalizedClassName);
            updates.push(`name = $${paramCount++}`);
        }

        if (grade_level !== undefined) {
            if (grade_level < 1 || grade_level > 11) {
                return res.status(400).json({
                    error: 'validation_error',
                    message: 'Grade level must be between 1 and 11'
                });
            }
            params.push(grade_level);
            updates.push(`grade_level = $${paramCount++}`);
        }

        if (academic_year !== undefined) {
            params.push(academic_year.trim());
            updates.push(`academic_year = $${paramCount++}`);
        }

        if (homeroom_teacher_id !== undefined) {
            if (homeroom_teacher_id) {
                const teacherCheck = await query(
                    'SELECT id FROM users WHERE id = $1 AND school_id = $2 AND role = $3',
                    [homeroom_teacher_id, schoolId, 'teacher']
                );

                if (teacherCheck.rows.length === 0) {
                    return res.status(400).json({
                        error: 'validation_error',
                        message: 'Invalid teacher selection'
                    });
                }
            }
            params.push(homeroom_teacher_id);
            updates.push(`homeroom_teacher_id = $${paramCount++}`);
        }

        if (is_active !== undefined) {
            params.push(is_active);
            updates.push(`is_active = $${paramCount++}`);
        }

        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        params.push(id);

        // Update class
        const result = await query(
            `UPDATE classes
             SET ${updates.join(', ')}
             WHERE id = $${paramCount}
             RETURNING id, name, grade_level, academic_year, homeroom_teacher_id, is_active, updated_at`,
            params
        );

        // Log action
        await query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [req.user.id, 'update', 'class', id, req.body]
        );

        res.json({
            message: 'Class updated successfully',
            class: result.rows[0]
        });
    } catch (error) {
        console.error('Update class error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to update class'
        });
    }
});

/**
 * DELETE /api/admin/classes/:id
 * Delete class (hard delete)
 */
router.delete('/classes/:id', enforceSchoolIsolation, async (req, res) => {
    let client;
    try {
        const { id } = req.params;
        const schoolId = req.user.school_id;
        client = await getClient();
        await client.query('BEGIN');

        // Check if class exists in same school
        const existingClass = await client.query(
            'SELECT id, name FROM classes WHERE id = $1 AND school_id = $2',
            [id, schoolId]
        );

        if (existingClass.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                error: 'not_found',
                message: 'Class not found'
            });
        }

        // Delete assignments and all related attempts for this class
        const assignmentRows = await client.query('SELECT id FROM test_assignments WHERE class_id = $1', [id]);
        for (const row of assignmentRows.rows) {
            await deleteAssignmentCascadeById(client, row.id);
        }

        // Delete all students in this class from users table (full delete).
        // If student has links in other classes, requirement still says remove class students completely.
        const studentRows = await client.query(
            `SELECT DISTINCT u.id
             FROM class_students cs
             JOIN users u ON u.id = cs.student_id
             WHERE cs.class_id = $1
               AND u.school_id = $2
               AND u.role = 'student'`,
            [id, schoolId]
        );

        for (const row of studentRows.rows) {
            await deleteUserCascadeById(client, row.id);
        }

        // Remove class links
        await client.query('DELETE FROM class_students WHERE class_id = $1', [id]);
        await client.query('DELETE FROM teacher_class_subjects WHERE class_id = $1', [id]);

        // Hard delete class
        await client.query('DELETE FROM classes WHERE id = $1', [id]);

        // Log action
        await client.query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [req.user.id, 'delete', 'class', id, { name: existingClass.rows[0].name }]
        );
        await client.query('COMMIT');

        res.json({
            message: 'Class deleted successfully'
        });
    } catch (error) {
        if (client) {
            try { await client.query('ROLLBACK'); } catch (_) { /* noop */ }
        }
        console.error('Delete class error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to delete class'
        });
    } finally {
        if (client) client.release();
    }
});

/**
 * ========================================
 * SUBJECTS MANAGEMENT
 * ========================================
 */

/**
 * GET /api/admin/subjects
 * Get all subjects in school
 */
router.get('/subjects', async (req, res) => {
    try {
        const { search = '' } = req.query;
        const { page, limit, offset } = normalizePagination(req.query.page, req.query.limit, 100);
        const schoolId = req.user.school_id;

        // Build WHERE clause
        let whereClause = 'WHERE school_id = $1';
        const params = [schoolId];
        let paramCount = 2;

        if (search) {
            params.push(`%${search}%`);
            whereClause += ` AND (name_ru ILIKE $${paramCount} OR name_uz ILIKE $${paramCount} OR name ILIKE $${paramCount} OR code ILIKE $${paramCount})`;
            paramCount++;
        }

        // Get total count
        const countResult = await query(
            `SELECT COUNT(*) FROM subjects ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0].count);

        // Get subjects
        params.push(limit, offset);
        const result = await query(
            `SELECT id, name_ru, name_uz, name, code, color, is_active, created_at
             FROM subjects
             ${whereClause}
             ORDER BY name_ru ASC, name ASC
             LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
            params
        );

        res.json({
            subjects: result.rows,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Get subjects error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch subjects'
        });
    }
});

/**
 * GET /api/admin/subjects/:id
 * Get single subject by ID
 */
router.get('/subjects/:id', enforceSchoolIsolation, async (req, res) => {
    try {
        const { id } = req.params;
        const schoolId = req.user.school_id;

        const result = await query(
            `SELECT id, name_ru, name_uz, name, code, color, is_active, created_at
             FROM subjects
             WHERE id = $1 AND school_id = $2`,
            [id, schoolId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'not_found',
                message: 'Subject not found'
            });
        }

        res.json({ subject: result.rows[0] });
    } catch (error) {
        console.error('Get subject error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch subject'
        });
    }
});

/**
 * POST /api/admin/subjects
 * Create new subject
 */
router.post('/subjects', async (req, res) => {
    try {
        const { name, name_ru, name_uz, color } = req.body;
        const schoolId = req.user.school_id;
        const normalizedNameRu = String(name_ru || '').trim();
        const normalizedNameUz = String(name_uz || '').trim();
        const normalizedName = String(name || '').trim() || normalizedNameRu || normalizedNameUz;

        // Validation
        if (!normalizedNameRu || !normalizedNameUz) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'name_ru and name_uz are required'
            });
        }

        const normalizedCode = await generateUniqueSubjectCode(
            schoolId,
            normalizedNameRu,
            normalizedNameUz,
            normalizedName
        );

        const existingColorsResult = await query(
            'SELECT color FROM subjects WHERE school_id = $1 AND color IS NOT NULL',
            [schoolId]
        );
        const usedColors = new Set(
            existingColorsResult.rows
                .map(row => String(row.color || '').toLowerCase())
                .filter(Boolean)
        );

        const finalColor = color?.trim() || pickSubjectColor(usedColors);

        // Create subject
        const result = await query(
            `INSERT INTO subjects (school_id, name_ru, name_uz, name, code, color, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, true)
             RETURNING id, name_ru, name_uz, name, code, color, is_active, created_at`,
            [
                schoolId,
                normalizedNameRu,
                normalizedNameUz,
                normalizedName,
                normalizedCode,
                finalColor
            ]
        );

        // Log action (best effort): audit failures must not break successful subject creation
        try {
            const actorUserId = Number(req.user?.id);
            if (Number.isInteger(actorUserId) && actorUserId > 0) {
                await query(
                    `INSERT INTO audit_logs (school_id, user_id, action, entity_type, entity_id, details)
                     SELECT $1, $2, $3, $4, $5, $6
                     WHERE EXISTS (SELECT 1 FROM users WHERE id = $2)`,
                    [
                        schoolId || null,
                        actorUserId,
                        'create',
                        'subject',
                        result.rows[0].id,
                        { name: normalizedName, name_ru: normalizedNameRu, name_uz: normalizedNameUz, code: normalizedCode }
                    ]
                );
            }
        } catch (auditError) {
            console.warn('Create subject audit log skipped:', auditError.message);
        }

        res.status(201).json({
            message: 'Subject created successfully',
            subject: result.rows[0]
        });
    } catch (error) {
        console.error('Create subject error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to create subject'
        });
    }
});

/**
 * PUT /api/admin/subjects/:id
 * Update subject
 */
router.put('/subjects/:id', enforceSchoolIsolation, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, name_ru, name_uz, color, is_active } = req.body;
        const schoolId = req.user.school_id;

        // Check if subject exists in same school
        const existingSubject = await query(
            'SELECT id FROM subjects WHERE id = $1 AND school_id = $2',
            [id, schoolId]
        );

        if (existingSubject.rows.length === 0) {
            return res.status(404).json({
                error: 'not_found',
                message: 'Subject not found'
            });
        }

        // Build update query
        const updates = [];
        const params = [];
        let paramCount = 1;

        if (name !== undefined) {
            params.push(name.trim());
            updates.push(`name = $${paramCount++}`);
        }

        if (name_ru !== undefined) {
            params.push(String(name_ru || '').trim() || null);
            updates.push(`name_ru = $${paramCount++}`);
        }

        if (name_uz !== undefined) {
            params.push(String(name_uz || '').trim() || null);
            updates.push(`name_uz = $${paramCount++}`);
        }

        if (color !== undefined) {
            params.push(color);
            updates.push(`color = $${paramCount++}`);
        }

        if (is_active !== undefined) {
            params.push(is_active);
            updates.push(`is_active = $${paramCount++}`);
        }

        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        params.push(id);

        // Update subject
        const result = await query(
            `UPDATE subjects
             SET ${updates.join(', ')}
             WHERE id = $${paramCount}
             RETURNING id, name_ru, name_uz, name, code, color, is_active, updated_at`,
            params
        );

        // Log action
        await query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [req.user.id, 'update', 'subject', id, req.body]
        );

        res.json({
            message: 'Subject updated successfully',
            subject: result.rows[0]
        });
    } catch (error) {
        console.error('Update subject error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to update subject'
        });
    }
});

/**
 * DELETE /api/admin/subjects/:id
 * Delete subject (hard delete)
 */
router.delete('/subjects/:id', enforceSchoolIsolation, async (req, res) => {
    let client;
    try {
        const { id } = req.params;
        const schoolId = req.user.school_id;
        client = await getClient();
        await client.query('BEGIN');

        // Check if subject exists in same school
        const existingSubject = await client.query(
            'SELECT id, name FROM subjects WHERE id = $1 AND school_id = $2',
            [id, schoolId]
        );

        if (existingSubject.rows.length === 0) {
            return res.status(404).json({
                error: 'not_found',
                message: 'Subject not found'
            });
        }

        // Delete all tests for this subject (and their dependent entities)
        const testsRows = await client.query('SELECT id FROM tests WHERE subject_id = $1', [id]);
        for (const row of testsRows.rows) {
            await deleteTestCascadeById(client, row.id);
        }

        // Remove teacher-subject-class mappings
        await client.query('DELETE FROM teacher_class_subjects WHERE subject_id = $1', [id]);

        // Hard delete subject
        await client.query('DELETE FROM subjects WHERE id = $1', [id]);

        // Log action
        await client.query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [req.user.id, 'delete', 'subject', id, { name: existingSubject.rows[0].name }]
        );
        await client.query('COMMIT');

        res.json({
            message: 'Subject deleted successfully'
        });
    } catch (error) {
        if (client) {
            try { await client.query('ROLLBACK'); } catch (_) { /* noop */ }
        }
        console.error('Delete subject error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to delete subject'
        });
    } finally {
        if (client) client.release();
    }
});

/**
 * GET /api/admin/teachers
 * Get list of teachers for dropdown selection
 */
router.get('/teachers', async (req, res) => {
    try {
        const schoolId = req.user.school_id;

        const result = await query(
            `SELECT id, first_name, last_name, email
             FROM users
             WHERE school_id = $1 AND role = 'teacher' AND is_active = true
             ORDER BY first_name, last_name`,
            [schoolId]
        );

        res.json({
            teachers: result.rows.map(t => ({
                id: t.id,
                name: `${t.first_name} ${t.last_name}`,
                email: t.email
            }))
        });
    } catch (error) {
        console.error('Get teachers error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch teachers'
        });
    }
});

// Generate OTP password
function generateOTP() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let otp = '';
    for (let i = 0; i < 8; i++) {
        otp += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return otp;
}

function mapImportRow(row) {
    if (!row || typeof row !== 'object') return null;
    const mapped = {};
    Object.entries(row).forEach(([key, value]) => {
        if (INTERNAL_IMPORT_FIELDS.has(key)) {
            mapped[key] = typeof value === 'string' ? value.trim() : value;
            return;
        }
        const normalized = normalizeHeader(key);
        const field = IMPORT_HEADER_MAP[normalized];
        if (field) {
            mapped[field] = typeof value === 'string' ? value.trim() : value;
        }
    });

    if (mapped.phone !== undefined && mapped.phone !== null && String(mapped.phone).trim() !== '') {
        mapped.phone = normalizeUzPhone(mapped.phone);
    }
    if (mapped.class_name !== undefined && mapped.class_name !== null && String(mapped.class_name).trim() !== '') {
        mapped.class_name = normalizeClassName(mapped.class_name);
    }
    if (mapped.class_names !== undefined && mapped.class_names !== null && String(mapped.class_names).trim() !== '') {
        mapped.class_names = String(mapped.class_names)
            .split(',')
            .map((item) => normalizeClassName(item))
            .filter(Boolean)
            .join(', ');
    }

    const hasValues = Object.values(mapped).some(val => String(val || '').trim() !== '');
    return hasValues ? mapped : null;
}

function normalizePagination(rawPage, rawLimit, maxLimit = 100) {
    const parsedPage = Number.parseInt(rawPage, 10);
    const parsedLimit = Number.parseInt(rawLimit, 10);
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, maxLimit)
        : 10;
    const offset = (page - 1) * limit;
    return { page, limit, offset };
}

function validateImportRow(row, importType = 'student') {
    if (importType === 'teacher') {
        const fullName = String(row.full_name || '').trim();
        if (!fullName) {
            return 'Missing required field: ФИО';
        }
        if (!row.first_name || !row.last_name) {
            return 'Could not parse teacher name from ФИО';
        }
        if (row.gender && !normalizeGender(row.gender)) {
            return 'Invalid gender value';
        }
        return null;
    }

    const hasStudentFullName = String(row.student_name || '').trim().length > 0;
    if (!hasStudentFullName) {
        return 'Missing required field: student name (Ученик)';
    }

    if (row.role && !normalizeRole(row.role)) {
        return 'Invalid role';
    }

    if (!row.class_name) {
        return 'Class is required for student import format';
    }

    if (row.gender && !normalizeGender(row.gender)) {
        return 'Invalid gender value';
    }

    return null;
}

function normalizeHeader(header) {
    return String(header)
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, '');
}

function normalizeRole(role) {
    const value = String(role || '').trim().toLowerCase();
    const roleMap = {
        student: 'student',
        ученик: 'student',
        учащийся: 'student',
        teacher: 'teacher',
        учитель: 'teacher',
        преподаватель: 'teacher',
        schooladmin: 'school_admin',
        school_admin: 'school_admin',
        админ: 'school_admin',
        администратор: 'school_admin',
        администраторшколы: 'school_admin',
        psychologist: 'psychologist',
        психлог: 'psychologist',
        психолог: 'psychologist'
    };
    return roleMap[value] || null;
}

function normalizeGender(gender) {
    const value = String(gender || '').trim().toLowerCase();
    const compact = value.replace(/[.\s_-]+/g, '');
    const genderMap = {
        male: 'male',
        female: 'female',
        other: 'other',
        m: 'male',
        f: 'female',
        '1': 'male',
        '2': 'female',
        erkek: 'male',
        ayol: 'female',
        ayel: 'female',
        мужской: 'male',
        муж: 'male',
        м: 'male',
        женский: 'female',
        жен: 'female',
        ж: 'female',
        другой: 'other'
    };
    return genderMap[value] || genderMap[compact] || null;
}

function normalizeDateInput(rawValue) {
    if (rawValue instanceof Date && !Number.isNaN(rawValue.getTime())) {
        const y = rawValue.getFullYear();
        const m = String(rawValue.getMonth() + 1).padStart(2, '0');
        const d = String(rawValue.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + d;
    }
    if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
        // Excel serial date: days since 1899-12-30.
        const excelEpochUtc = Date.UTC(1899, 11, 30);
        const millis = Math.round(rawValue * 86400000);
        const date = new Date(excelEpochUtc + millis);
        if (!Number.isNaN(date.getTime())) {
            const y = date.getUTCFullYear();
            const m = String(date.getUTCMonth() + 1).padStart(2, '0');
            const d = String(date.getUTCDate()).padStart(2, '0');
            return y + '-' + m + '-' + d;
        }
    }
    const value = String(rawValue || '').trim();
    if (!value) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value;
    }
    const dotDate = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value);
    if (dotDate) {
        const day = dotDate[1].padStart(2, '0');
        const month = dotDate[2].padStart(2, '0');
        return dotDate[3] + '-' + month + '-' + day;
    }
    const slashDate = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
    if (slashDate) {
        const day = slashDate[1].padStart(2, '0');
        const month = slashDate[2].padStart(2, '0');
        return slashDate[3] + '-' + month + '-' + day;
    }
    const compactDate = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
    if (compactDate) {
        return compactDate[1] + '-' + compactDate[2] + '-' + compactDate[3];
    }
    return null;
}

function hydrateStudentNameFields(row) {
    if (!row || typeof row !== 'object') return row;
    if ((!row.first_name || !row.last_name) && row.student_name) {
        const fullName = String(row.student_name).trim().replace(/\s+/g, ' ');
        if (!fullName) return row;
        const parts = fullName.split(' ');
        if (parts.length === 1) {
            row.first_name = row.first_name || parts[0];
            row.last_name = row.last_name || '-';
        } else {
            row.last_name = row.last_name || parts.shift();
            row.first_name = row.first_name || parts.join(' ');
        }
    }
    return row;
}

function hydrateTeacherNameFields(row) {
    if (!row || typeof row !== 'object') return row;
    if (row.full_name && (!row.first_name || !row.last_name)) {
        const fullName = String(row.full_name).trim().replace(/\s+/g, ' ');
        const parts = fullName.split(' ').filter(Boolean);
        if (parts.length >= 2) {
            row.last_name = parts[0];
            row.first_name = parts[1];
        } else if (parts.length === 1) {
            row.last_name = parts[0];
            row.first_name = 'Teacher';
        }
    }
    return row;
}

function isTeacherPosition(positionValue) {
    const value = normalizeHeader(positionValue);
    if (!value) return false;
    return value.includes('учитель') || value.includes('teacher') || value.includes('преподаватель');
}

function parseTeacherClassList(rawValue) {
    const normalized = String(rawValue || '')
        .replace(/[;|]/g, ',')
        .replace(/\n/g, ',');
    return normalized
        .split(',')
        .map((item) => normalizeClassName(item))
        .filter(Boolean);
}

function parseSettingsValue(value) {
    if (!value) return {};
    if (typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed;
            }
            return {};
        } catch (error) {
            return {};
        }
    }
    return {};
}

function normalizeSettingsInput(rawSettings) {
    if (rawSettings === undefined) {
        return { provided: false, value: {} };
    }
    if (rawSettings === null) {
        return { provided: true, value: {} };
    }
    if (typeof rawSettings === 'object' && !Array.isArray(rawSettings)) {
        return { provided: true, value: rawSettings };
    }
    if (typeof rawSettings === 'string') {
        const trimmed = rawSettings.trim();
        if (!trimmed) {
            return { provided: true, value: {} };
        }
        try {
            const parsed = JSON.parse(trimmed);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                return { error: 'Settings must be a JSON object' };
            }
            return { provided: true, value: parsed };
        } catch (error) {
            return { error: 'Invalid settings JSON' };
        }
    }
    return { error: 'Settings must be an object' };
}

function normalizePersonalInfoPatch(rawPersonalInfo) {
    const normalized = {};

    if (Object.prototype.hasOwnProperty.call(rawPersonalInfo, 'date_of_birth')) {
        const rawDate = rawPersonalInfo.date_of_birth;
        if (rawDate === null || String(rawDate).trim() === '') {
            normalized.date_of_birth = null;
        } else {
            const parsedDate = normalizeDateInput(rawDate);
            if (!parsedDate) {
                return { error: 'Invalid date_of_birth format' };
            }
            normalized.date_of_birth = parsedDate;
        }
    }

    if (Object.prototype.hasOwnProperty.call(rawPersonalInfo, 'gender')) {
        const rawGender = rawPersonalInfo.gender;
        if (rawGender === null || String(rawGender).trim() === '') {
            normalized.gender = null;
        } else {
            const parsedGender = normalizeGender(rawGender);
            if (!parsedGender) {
                return { error: 'Invalid gender value' };
            }
            normalized.gender = parsedGender;
        }
    }

    return { data: normalized };
}

function mergeSettingsWithPersonalInfo(baseSettings, personalInfoPatch) {
    const settings = parseSettingsValue(baseSettings);
    if (Object.keys(personalInfoPatch).length === 0) {
        return settings;
    }
    const profile = (settings.profile && typeof settings.profile === 'object' && !Array.isArray(settings.profile))
        ? settings.profile
        : {};
    const existingPersonalInfo = (profile.personal_info && typeof profile.personal_info === 'object' && !Array.isArray(profile.personal_info))
        ? profile.personal_info
        : {};

    settings.profile = {
        ...profile,
        personal_info: {
            ...existingPersonalInfo,
            ...personalInfoPatch
        }
    };
    return settings;
}

function normalizeContactValueForCompare(type, value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return type === 'email' ? raw.toLowerCase() : raw;
}

function applyAdminContactVerificationPolicy(baseSettings, options = {}) {
    const {
        mode = 'update',
        prevEmail = '',
        prevPhone = '',
        nextEmailProvided = false,
        nextPhoneProvided = false,
        nextEmail = '',
        nextPhone = ''
    } = options;

    const settings = parseSettingsValue(baseSettings);
    const profile = (settings.profile && typeof settings.profile === 'object' && !Array.isArray(settings.profile))
        ? settings.profile
        : {};
    const verification = (profile.contact_verification && typeof profile.contact_verification === 'object' && !Array.isArray(profile.contact_verification))
        ? profile.contact_verification
        : {};
    const pending = (verification.pending && typeof verification.pending === 'object' && !Array.isArray(verification.pending))
        ? verification.pending
        : {};

    const prevEmailNorm = normalizeContactValueForCompare('email', prevEmail);
    const prevPhoneNorm = normalizeContactValueForCompare('phone', prevPhone);
    const nextEmailNorm = normalizeContactValueForCompare('email', nextEmail);
    const nextPhoneNorm = normalizeContactValueForCompare('phone', nextPhone);

    let changed = false;
    const nextVerification = {
        ...verification,
        pending: { ...pending }
    };

    const shouldResetEmail = mode === 'create'
        ? !!nextEmailNorm
        : (nextEmailProvided && nextEmailNorm !== prevEmailNorm);
    if (shouldResetEmail) {
        nextVerification.email_verified = false;
        nextVerification.pending.email = null;
        changed = true;
    }

    const shouldResetPhone = mode === 'create'
        ? !!nextPhoneNorm
        : (nextPhoneProvided && nextPhoneNorm !== prevPhoneNorm);
    if (shouldResetPhone) {
        nextVerification.phone_verified = false;
        nextVerification.pending.phone = null;
        changed = true;
    }

    if (!changed && !profile.contact_verification) {
        return { settings, changed: false };
    }

    settings.profile = {
        ...profile,
        contact_verification: nextVerification
    };

    return { settings, changed };
}

function buildImportedUserSettings(row) {
    const dateOfBirth = normalizeDateInput(row.date_of_birth);
    const gender = normalizeGender(row.gender);

    const profileSettings = {};
    const personalInfo = {};

    if (dateOfBirth) personalInfo.date_of_birth = dateOfBirth;
    if (gender) personalInfo.gender = gender;

    if (Object.keys(personalInfo).length > 0) {
        profileSettings.personal_info = personalInfo;
    }

    if (Object.keys(profileSettings).length === 0) {
        return null;
    }

    return { profile_settings: profileSettings };
}

function normalizeWorksheetCellValue(value) {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString().slice(0, 10);

    if (typeof value === 'object') {
        if (Array.isArray(value.richText)) {
            return value.richText.map((part) => String(part.text || '')).join('');
        }
        if (Object.prototype.hasOwnProperty.call(value, 'text')) {
            return String(value.text || '');
        }
        if (Object.prototype.hasOwnProperty.call(value, 'hyperlink')) {
            return String(value.text || value.hyperlink || '');
        }
        if (Object.prototype.hasOwnProperty.call(value, 'result')) {
            return normalizeWorksheetCellValue(value.result);
        }
        if (Object.prototype.hasOwnProperty.call(value, 'formula')) {
            return '';
        }
    }

    return String(value);
}

function worksheetToMatrix(worksheet) {
    if (!worksheet) return [];

    const matrix = [];
    const maxColumns = Math.max(worksheet.columnCount || 0, worksheet.actualColumnCount || 0);

    for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber++) {
        const row = worksheet.getRow(rowNumber);
        if (!row.hasValues) continue;

        const values = [];
        let lastFilledColumn = 0;
        for (let columnNumber = 1; columnNumber <= maxColumns; columnNumber++) {
            const cellValue = normalizeWorksheetCellValue(row.getCell(columnNumber).value);
            values[columnNumber - 1] = cellValue;
            if (String(cellValue || '').trim() !== '') {
                lastFilledColumn = columnNumber;
            }
        }

        if (lastFilledColumn === 0) continue;
        matrix.push(values.slice(0, lastFilledColumn));
    }

    return matrix;
}

function matrixToObjectRows(matrix) {
    if (!Array.isArray(matrix) || matrix.length === 0) return [];

    const headers = (matrix[0] || []).map((value) => String(value || '').trim());
    const rows = [];

    for (let i = 1; i < matrix.length; i++) {
        const sourceRow = matrix[i] || [];
        const mapped = {};
        let hasValues = false;

        for (let column = 0; column < headers.length; column++) {
            const header = headers[column];
            if (!header) continue;

            const value = sourceRow[column] ?? '';
            mapped[header] = value;
            if (String(value || '').trim() !== '') {
                hasValues = true;
            }
        }

        if (hasValues) {
            rows.push(mapped);
        }
    }

    return rows;
}

async function loadWorkbookFirstWorksheet(buffer) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
        throw new Error('Workbook has no worksheets');
    }
    return worksheet;
}

function parseImportRows(worksheet, importType = 'student') {
    const matrix = worksheetToMatrix(worksheet);
    const normalizedMatrix = matrix.map((row) => row.map((cell) => normalizeHeader(cell)));
    const hasToken = (value, token) => String(value || '').includes(token);

    if (importType === 'teacher') {
        let headerIndex = -1;
        for (let i = 0; i < normalizedMatrix.length; i++) {
            const row = normalizedMatrix[i];
            const hasFio = row.some((cell) => hasToken(cell, 'фио'));
            const hasPosition = row.some((cell) => hasToken(cell, 'должность'));
            if (hasFio && hasPosition) {
                headerIndex = i;
                break;
            }
        }

        if (headerIndex >= 0) {
            const headers = normalizedMatrix[headerIndex] || [];
            const findColumn = (predicate) => headers.findIndex((cell) => predicate(cell));
            const fioIdx = findColumn((cell) => hasToken(cell, 'фио'));
            const positionIdx = findColumn((cell) => hasToken(cell, 'должность'));
            const classesIdx = findColumn((cell) => hasToken(cell, 'классы'));
            const phoneIdx = findColumn((cell) => hasToken(cell, 'телефон'));
            const emailIdx = findColumn((cell) => hasToken(cell, 'элпочта'));
            const genderIdx = findColumn((cell) => hasToken(cell, 'пол'));
            const dobIdx = findColumn((cell) => hasToken(cell, 'датарожд'));

            const rows = [];
            for (let i = headerIndex + 1; i < matrix.length; i++) {
                const rawRow = matrix[i] || [];
                const mapped = {
                    full_name: fioIdx >= 0 ? rawRow[fioIdx] : '',
                    position: positionIdx >= 0 ? rawRow[positionIdx] : '',
                    class_names: classesIdx >= 0 ? rawRow[classesIdx] : '',
                    phone: phoneIdx >= 0 ? rawRow[phoneIdx] : '',
                    email: emailIdx >= 0 ? rawRow[emailIdx] : '',
                    gender: genderIdx >= 0 ? rawRow[genderIdx] : '',
                    date_of_birth: dobIdx >= 0 ? rawRow[dobIdx] : ''
                };
                Object.keys(mapped).forEach((key) => {
                    if (typeof mapped[key] === 'string') {
                        mapped[key] = mapped[key].trim();
                    }
                });
                const hasValues = Object.values(mapped).some((val) => String(val || '').trim() !== '');
                if (!hasValues) continue;
                rows.push({ row: mapped, rowNumber: i + 1 });
            }
            if (rows.length > 0) return rows;
        }
    }

    let customHeaderIndex = -1;
    for (let i = 0; i < normalizedMatrix.length; i++) {
        const row = normalizedMatrix[i];
        const hasStudentHeader = row.some((cell) => hasToken(cell, 'ученик') || hasToken(cell, 'фио'));
        const hasClassHeader = row.some((cell) => hasToken(cell, 'класс'));
        if (hasStudentHeader && hasClassHeader) {
            customHeaderIndex = i;
            break;
        }
    }

    if (customHeaderIndex >= 0) {
        const topHeader = normalizedMatrix[customHeaderIndex] || [];
        const nextRow = normalizedMatrix[customHeaderIndex + 1] || [];
        const hasSecondHeaderRow =
            nextRow.some((cell) => hasToken(cell, 'телефон') || hasToken(cell, 'элпочта'));
        const bottomHeader = hasSecondHeaderRow ? nextRow : [];
        const maxColumns = Math.max(topHeader.length, bottomHeader.length, (matrix[customHeaderIndex] || []).length);
        const mergedHeaders = [];
        for (let i = 0; i < maxColumns; i++) {
            const top = topHeader[i] || '';
            const bottom = bottomHeader[i] || '';
            mergedHeaders[i] = `${top}${bottom}`;
        }

        const findColumn = (predicate) => mergedHeaders.findIndex((cell) => predicate(cell));
        const studentIdx = findColumn((cell) => hasToken(cell, 'ученик') || hasToken(cell, 'фио'));
        const classIdx = findColumn((cell) => hasToken(cell, 'класс'));
        const genderIdx = findColumn((cell) => hasToken(cell, 'пол'));
        const dobIdx = findColumn((cell) => hasToken(cell, 'датарожд'));

        if (studentIdx < 0 || classIdx < 0) {
            return matrixToObjectRows(matrix).map((row, index) => ({
                row,
                rowNumber: index + 2
            }));
        }

        const dataStart = customHeaderIndex + (hasSecondHeaderRow ? 2 : 1);
        const customRows = [];

        for (let i = dataStart; i < matrix.length; i++) {
            const row = matrix[i] || [];
            const mapped = {
                student_name: row[studentIdx],
                class_name: row[classIdx]
            };
            if (genderIdx >= 0) mapped.gender = row[genderIdx];
            if (dobIdx >= 0) mapped.date_of_birth = row[dobIdx];

            Object.keys(mapped).forEach((key) => {
                if (typeof mapped[key] === 'string') {
                    mapped[key] = mapped[key].trim();
                }
            });

            const hasValues = Object.values(mapped).some((val) => String(val || '').trim() !== '');
            if (!hasValues) {
                continue;
            }
            customRows.push({ row: mapped, rowNumber: i + 1 });
        }

        if (customRows.length > 0) {
            return customRows;
        }
    }

    const fallbackRows = matrixToObjectRows(matrix);
    return fallbackRows.map((row, index) => ({
        row,
        rowNumber: index + 2
    }));
}

function parseIsoDateString(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!year || !month || !day) return null;
    const date = new Date(Date.UTC(year, month - 1, day));
    return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeUzPhone(rawValue) {
    const raw = String(rawValue || '').trim();
    if (!raw) return '';

    const digits = raw.replace(/\D/g, '');
    if (!digits) return raw;

    let localPart = '';
    if (digits.length === 12 && digits.startsWith('998')) {
        localPart = digits.slice(3);
    } else if (digits.length === 10 && digits.startsWith('0')) {
        localPart = digits.slice(1);
    } else if (digits.length === 9) {
        localPart = digits;
    }

    if (/^\d{9}$/.test(localPart)) {
        return `+998${localPart}`;
    }

    return raw;
}

async function buildStyledWorkbookBuffer({
    sheetName,
    rows,
    headerRows = 1,
    merges = [],
    columnFormats = {},
    autoFilter = false,
    freezeHeader = true
}) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(sheetName);
    const maxCol = rows.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);

    const normalizedRows = rows.map((row, rowIdx) => {
        const normalized = Array.isArray(row) ? [...row] : [];
        if (rowIdx >= headerRows) {
            for (let c = 0; c < normalized.length; c++) {
                const fmt = columnFormats[c + 1];
                if (fmt && typeof normalized[c] === 'string' && /y{2,4}/i.test(fmt)) {
                    const parsed = parseIsoDateString(normalized[c]);
                    if (parsed) normalized[c] = parsed;
                }
            }
        }
        return normalized;
    });

    normalizedRows.forEach((row) => worksheet.addRow(row));
    merges.forEach((range) => worksheet.mergeCells(range));

    if (freezeHeader && headerRows > 0) {
        worksheet.views = [{ state: 'frozen', ySplit: headerRows }];
    }

    if (autoFilter && rows.length > 0 && maxCol > 0) {
        worksheet.autoFilter = {
            from: { row: 1, column: 1 },
            to: { row: 1, column: maxCol }
        };
    }

    const border = {
        top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
    };

    for (let r = 1; r <= rows.length; r++) {
        for (let c = 1; c <= maxCol; c++) {
            const cell = worksheet.getCell(r, c);
            const isHeader = r <= headerRows;
            cell.border = border;
            cell.alignment = { vertical: 'middle', horizontal: isHeader ? 'center' : 'left', wrapText: true };

            if (isHeader) {
                cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4A90E2' } };
            }
        }
    }

    for (let c = 1; c <= maxCol; c++) {
        const fmt = columnFormats[c];
        if (fmt) worksheet.getColumn(c).numFmt = fmt;

        let maxLen = 8;
        for (let r = 0; r < normalizedRows.length; r++) {
            const value = normalizedRows[r]?.[c - 1];
            const text = value instanceof Date
                ? value.toISOString().slice(0, 10)
                : String(value ?? '');
            maxLen = Math.max(maxLen, text.length);
        }
        worksheet.getColumn(c).width = Math.min(maxLen + 2, 48);
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
}

async function deleteAssignmentCascadeById(client, assignmentId) {
    await client.query('DELETE FROM test_attempts WHERE assignment_id = $1', [assignmentId]);
    await client.query('DELETE FROM test_assignments WHERE id = $1', [assignmentId]);
}

async function deleteAssignmentsByAssignedTeacher(client, teacherId) {
    const assignments = await client.query('SELECT id FROM test_assignments WHERE assigned_by = $1', [teacherId]);
    for (const row of assignments.rows) {
        await deleteAssignmentCascadeById(client, row.id);
    }
}

async function deleteTestCascadeById(client, testId) {
    const assignments = await client.query('SELECT id FROM test_assignments WHERE test_id = $1', [testId]);
    for (const row of assignments.rows) {
        await deleteAssignmentCascadeById(client, row.id);
    }
    await client.query('DELETE FROM test_attempts WHERE test_id = $1', [testId]);
    await client.query('DELETE FROM test_questions WHERE test_id = $1', [testId]);
    await client.query('DELETE FROM tests WHERE id = $1', [testId]);
}

async function deleteUserCascadeById(client, userId) {
    // Remove teacher-linked data
    const teacherTestRows = await client.query('SELECT id FROM tests WHERE teacher_id = $1', [userId]);
    for (const test of teacherTestRows.rows) {
        await deleteTestCascadeById(client, test.id);
    }

    await deleteAssignmentsByAssignedTeacher(client, userId);

    // Remove student-linked data
    await client.query('DELETE FROM test_attempts WHERE student_id = $1', [userId]);
    await client.query('DELETE FROM class_students WHERE student_id = $1', [userId]);

    // Remove class/subject links and references
    await client.query('DELETE FROM teacher_class_subjects WHERE teacher_id = $1', [userId]);
    await client.query('UPDATE classes SET homeroom_teacher_id = NULL WHERE homeroom_teacher_id = $1', [userId]);

    // Remove audit rows where user is the actor to satisfy FK
    await client.query('DELETE FROM audit_logs WHERE user_id = $1', [userId]);

    // Remove user
    await client.query('DELETE FROM users WHERE id = $1', [userId]);
}

function normalizeUsername(firstName, lastName) {
    const transliteratedFirst = transliterateToLatin(firstName || '');
    const transliteratedLast = transliterateToLatin(lastName || '');
    const base = `${transliteratedLast}.${transliteratedFirst}`
        .toLowerCase()
        .replace(/[^a-z0-9.]/g, '')
        .replace(/\.+/g, '.')
        .replace(/^\.|\.$/g, '');

    if (base) return base;
    return `user${Math.floor(Math.random() * 9000) + 1000}`;
}

function transliterateToLatin(value) {
    const map = {
        а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y',
        к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
        х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
        қ: 'q', ғ: 'g', ҳ: 'h', ў: 'o', ң: 'ng'
    };

    return String(value || '')
        .toLowerCase()
        .split('')
        .map((ch) => (map[ch] !== undefined ? map[ch] : ch))
        .join('')
        .replace(/[^a-z0-9\s.-]/g, '');
}

async function generateUniqueUsername(baseUsername) {
    let candidate = baseUsername;
    let counter = 1;

    while (true) {
        const exists = await query('SELECT id FROM users WHERE username = $1', [candidate]);
        if (exists.rows.length === 0) return candidate;

        candidate = `${baseUsername}${counter}`;
        counter += 1;

        if (counter > 9999) {
            candidate = `user${Date.now().toString().slice(-6)}`;
        }
    }
}

function deriveGradeLevelFromClassName(className) {
    const match = String(className || '').trim().match(/^(\d{1,2})/);
    const grade = match ? parseInt(match[1], 10) : NaN;
    if (Number.isInteger(grade) && grade >= 1 && grade <= 11) {
        return grade;
    }
    return 1;
}

function mapClassLetterToCyrillic(letterValue) {
    const letter = String(letterValue || '').trim().toUpperCase();
    const latinToCyr = {
        A: '\u0410',
        B: '\u0411',
        C: '\u0421',
        D: '\u0414',
        E: '\u0415',
        F: '\u0424',
        G: '\u0413',
        H: '\u0425',
        I: '\u0418',
        J: '\u0416',
        K: '\u041A',
        L: '\u041B',
        M: '\u041C',
        N: '\u041D',
        O: '\u041E',
        P: '\u041F',
        Q: '\u049A',
        R: '\u0420',
        S: '\u0421',
        T: '\u0422',
        U: '\u0423',
        V: '\u0412',
        W: '\u0428',
        X: '\u0425',
        Y: '\u0419',
        Z: '\u0417'
    };
    return latinToCyr[letter] || letter;
}

function normalizeClassName(rawClassName) {
    const value = String(rawClassName || '').trim();
    if (!value) return '';

    // Normalize separators and extra spaces.
    const cleaned = value
        .replace(/[???_]/g, '-')
        .replace(/\\s+/g, ' ')
        .trim();

    const match = cleaned.match(/^(\d{1,2})\s*[-\s]?\s*([A-Za-zА-Яа-яЁё])$/u);
    if (match) {
        const grade = String(parseInt(match[1], 10));
        const suffix = mapClassLetterToCyrillic(match[2]);
        return `${grade}-${suffix}`;
    }

    return cleaned.toUpperCase();
}

function deriveAcademicYear(rawAcademicYear) {
    const value = String(rawAcademicYear || '').trim();
    if (value) return value;

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const startYear = month >= 8 ? year : year - 1;
    const endYear = startYear + 1;
    return `${startYear}-${endYear}`;
}

function normalizeImportType(rawType) {
    const value = String(rawType || '').trim().toLowerCase();
    if (value === 'teacher' || value === 'teachers') {
        return 'teacher';
    }
    return 'student';
}

async function ensureActiveClassForImport(schoolId, className, academicYear) {
    if (!className) return null;
    const normalizedName = normalizeClassName(className);
    const normalizedYear = deriveAcademicYear(academicYear);

    const activeResult = await query(
        `SELECT id, name, grade_level, academic_year
         FROM classes
         WHERE school_id = $1 AND LOWER(name) = LOWER($2) AND academic_year = $3 AND is_active = true
         LIMIT 1`,
        [schoolId, normalizedName, normalizedYear]
    );
    if (activeResult.rows[0]) {
        return { ...activeResult.rows[0], autoCreated: false };
    }

    const inactiveResult = await query(
        `SELECT id, name, grade_level, academic_year
         FROM classes
         WHERE school_id = $1 AND LOWER(name) = LOWER($2) AND academic_year = $3 AND is_active = false
         LIMIT 1`,
        [schoolId, normalizedName, normalizedYear]
    );

    if (inactiveResult.rows[0]) {
        const reactivated = await query(
            `UPDATE classes
             SET is_active = true,
                 homeroom_teacher_id = NULL,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING id, name, grade_level, academic_year`,
            [inactiveResult.rows[0].id]
        );
        return { ...reactivated.rows[0], autoCreated: true };
    }

    const createdClass = await query(
        `INSERT INTO classes (school_id, name, grade_level, academic_year, homeroom_teacher_id, is_active)
         VALUES ($1, $2, $3, $4, NULL, true)
         RETURNING id, name, grade_level, academic_year`,
        [schoolId, normalizedName, deriveGradeLevelFromClassName(normalizedName), normalizedYear]
    );

    return { ...createdClass.rows[0], autoCreated: true };
}

async function ensureHomeroomTeacherForClass(schoolId, className, teacherId, academicYear) {
    if (!className) return null;
    const normalizedName = normalizeClassName(className);
    const normalizedYear = deriveAcademicYear(academicYear);

    const activeClass = await query(
        `SELECT id, homeroom_teacher_id
         FROM classes
         WHERE school_id = $1 AND LOWER(name) = LOWER($2) AND academic_year = $3 AND is_active = true
         ORDER BY created_at DESC
         LIMIT 1`,
        [schoolId, normalizedName, normalizedYear]
    );

    if (activeClass.rows[0]) {
        if (!activeClass.rows[0].homeroom_teacher_id) {
            await query(
                `UPDATE classes
                 SET homeroom_teacher_id = $2, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [activeClass.rows[0].id, teacherId]
            );
        }
        return activeClass.rows[0].id;
    }

    const inactiveClass = await query(
        `SELECT id, homeroom_teacher_id
         FROM classes
         WHERE school_id = $1 AND LOWER(name) = LOWER($2) AND academic_year = $3 AND is_active = false
         ORDER BY created_at DESC
         LIMIT 1`,
        [schoolId, normalizedName, normalizedYear]
    );

    if (inactiveClass.rows[0]) {
        const teacherToAssign = inactiveClass.rows[0].homeroom_teacher_id || teacherId;
        await query(
            `UPDATE classes
             SET is_active = true,
                 homeroom_teacher_id = $2,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [inactiveClass.rows[0].id, teacherToAssign]
        );
        return inactiveClass.rows[0].id;
    }

    const createdClass = await query(
        `INSERT INTO classes (school_id, name, grade_level, academic_year, homeroom_teacher_id, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         RETURNING id`,
        [schoolId, normalizedName, deriveGradeLevelFromClassName(normalizedName), normalizedYear, teacherId]
    );
    return createdClass.rows[0].id;
}

function parseTeachingCellValue(rawValue) {
    if (rawValue === null || rawValue === undefined) return 0;
    if (typeof rawValue === 'number') return Number.isFinite(rawValue) ? rawValue : 0;
    const normalized = String(rawValue)
        .trim()
        .replace(/\s+/g, '')
        .replace(',', '.');
    if (!normalized) return 0;
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
}

function parseTeachingAssignmentsMatrix(worksheet) {
    const matrix = worksheetToMatrix(worksheet);
    const normalizedMatrix = matrix.map((row) => row.map((cell) => normalizeHeader(cell)));

    const isTeacherHeader = (cell) => {
        const value = String(cell || '');
        return value.includes('учитель') || value.includes('teacher');
    };
    const isSubjectHeader = (cell) => {
        const value = String(cell || '');
        return value.includes('предмет') || value.includes('subject');
    };

    let headerRowIndex = -1;
    let teacherColIndex = -1;
    let subjectColIndex = -1;

    for (let r = 0; r < normalizedMatrix.length; r++) {
        const row = normalizedMatrix[r] || [];
        const teacherIdx = row.findIndex((cell) => isTeacherHeader(cell));
        const subjectIdx = row.findIndex((cell) => isSubjectHeader(cell));
        if (teacherIdx >= 0 && subjectIdx >= 0) {
            headerRowIndex = r;
            teacherColIndex = teacherIdx;
            subjectColIndex = subjectIdx;
            break;
        }
    }

    if (headerRowIndex < 0) {
        headerRowIndex = 0;
        teacherColIndex = 1;
        subjectColIndex = 2;
    }

    const headerRow = matrix[headerRowIndex] || [];
    const classColumns = [];
    for (let c = subjectColIndex + 1; c < headerRow.length; c++) {
        const className = normalizeClassName(headerRow[c]);
        if (!className) continue;
        classColumns.push({
            colIndex: c,
            className,
            classKey: normalizeHeader(className)
        });
    }

    const rows = [];
    let currentTeacher = '';
    for (let r = headerRowIndex + 1; r < matrix.length; r++) {
        const row = matrix[r] || [];
        const teacherCellRaw = row[teacherColIndex];
        const subjectCellRaw = row[subjectColIndex];

        const teacherCell = String(teacherCellRaw ?? '').trim();
        const subjectCell = String(subjectCellRaw ?? '').trim();

        if (teacherCell) {
            currentTeacher = teacherCell;
        }

        if (!currentTeacher || !subjectCell) {
            continue;
        }

        const values = classColumns.map((column) => ({
            className: column.className,
            classKey: column.classKey,
            value: row[column.colIndex]
        }));

        rows.push({
            rowNumber: r + 1,
            teacher: currentTeacher,
            subject: subjectCell,
            values
        });
    }

    return {
        totalRows: rows.length,
        rows
    };
}

function splitNameTokens(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[.,;:()[\]{}]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .filter(Boolean);
}

function buildTeacherLookup(teachers) {
    const exact = new Map();
    const byLastAndInitial = new Map();

    const pushKey = (map, key, teacher) => {
        if (!key) return;
        const bucket = map.get(key) || [];
        bucket.push(teacher);
        map.set(key, bucket);
    };

    teachers.forEach((teacher) => {
        const firstName = String(teacher.first_name || '').trim();
        const lastName = String(teacher.last_name || '').trim();
        const firstTokens = splitNameTokens(firstName);
        const lastTokens = splitNameTokens(lastName);
        const first = firstTokens[0] || '';
        const last = lastTokens[0] || '';
        const firstInitial = first ? first[0] : '';

        const keysExact = [
            splitNameTokens(`${lastName} ${firstName}`).join(' '),
            splitNameTokens(`${firstName} ${lastName}`).join(' ')
        ];
        keysExact.forEach((key) => pushKey(exact, key, teacher));

        if (last && firstInitial) {
            pushKey(byLastAndInitial, `${last} ${firstInitial}`, teacher);
        }
    });

    return { exact, byLastAndInitial };
}

function resolveUniqueFromMap(map, key) {
    const list = map.get(key) || [];
    if (list.length !== 1) return null;
    return list[0];
}

function resolveTeacherForImport(lookup, rawTeacherName) {
    const tokens = splitNameTokens(rawTeacherName);
    if (!tokens.length) return null;

    const exactKey = tokens.join(' ');
    let resolved = resolveUniqueFromMap(lookup.exact, exactKey);
    if (resolved) return resolved;

    if (tokens.length >= 2) {
        const last = tokens[0];
        const firstToken = tokens[1];
        const firstInitial = firstToken ? firstToken[0] : '';
        if (last && firstInitial) {
            resolved = resolveUniqueFromMap(lookup.byLastAndInitial, `${last} ${firstInitial}`);
            if (resolved) return resolved;
        }
    }

    return null;
}

function buildSubjectLookup(subjects) {
    const lookup = new Map();
    subjects.forEach((subject) => {
        const keys = [
            subject.name,
            subject.name_ru,
            subject.name_uz,
            subject.code
        ]
            .map((value) => normalizeHeader(value))
            .filter(Boolean);

        keys.forEach((key) => {
            if (!lookup.has(key)) {
                lookup.set(key, subject);
            }
        });
    });
    return lookup;
}

function resolveSubjectForImport(lookup, rawSubjectName) {
    const key = normalizeHeader(rawSubjectName);
    if (!key) return null;
    return lookup.get(key) || null;
}

function buildClassLookup(classes) {
    const lookup = new Map();
    classes.forEach((cls) => {
        const normalizedName = normalizeClassName(cls.name);
        const key = normalizeHeader(normalizedName);
        if (!key) return;
        if (!lookup.has(key)) {
            lookup.set(key, cls);
        }
    });
    return lookup;
}

const IMPORT_HEADER_MAP = {
    name: 'first_name',
    surname: 'last_name',
    fullname: 'student_name',
    fio: 'student_name',
    sex: 'gender',
    gender: 'gender',
    dob: 'date_of_birth',
    birthdate: 'date_of_birth',
    birthday: 'date_of_birth',
    dateofbirth: 'date_of_birth',
    phonenumber: 'phone',
    mobile: 'phone',
    class: 'class_name',
    classes: 'class_names',
    position: 'position',
    firstname: 'first_name',
    lastname: 'last_name',
    role: 'role',
    email: 'email',
    phone: 'phone',
    username: 'username',
    classname: 'class_name',
    academicyear: 'academic_year',
    rollnumber: 'roll_number',
    имя: 'first_name',
    фамилия: 'last_name',
    ученик: 'student_name',
    ученикфамилияимя: 'student_name',
    фио: 'student_name',
    роль: 'role',
    пол: 'gender',
    датарождения: 'date_of_birth',
    телефон: 'phone',
    логин: 'username',
    класс: 'class_name',
    учебныйгод: 'academic_year',
    номер: 'roll_number',
    номерпоклассу: 'roll_number'
};

const INTERNAL_IMPORT_FIELDS = new Set([
    'student_name',
    'full_name',
    'position',
    'class_names',
    'date_of_birth',
    'gender',
    'phone',
    'email',
    'class_name',
    'academic_year'
]);

/**
 * GET /api/admin/notification-defaults
 * Read-only role-based notification defaults for school admin.
 */
router.get('/notification-defaults', async (req, res) => {
    try {
        const defaults = await getRoleNotificationDefaultsMap();
        res.json({ defaults });
    } catch (error) {
        console.error('Get notification defaults (admin) error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch notification defaults'
        });
    }
});

/**
 * GET /api/admin/notifications/logs
 * Delivery logs for notifications scoped to school users.
 */
router.get('/notifications/logs', async (req, res) => {
    try {
        const schoolId = req.user.school_id;
        const parsedPage = parseInt(req.query.page, 10);
        const parsedLimit = parseInt(req.query.limit, 10);
        const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
        const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
            ? Math.min(parsedLimit, 100)
            : 20;
        const offset = (page - 1) * limit;

        const channel = String(req.query.channel || '').trim().toLowerCase();
        const eventKey = String(req.query.event_key || '').trim();
        const status = String(req.query.status || '').trim().toLowerCase();
        const from = String(req.query.from || '').trim();
        const to = String(req.query.to || '').trim();

        const where = ['u.school_id = $1'];
        const params = [schoolId];

        if (channel) {
            params.push(channel);
            where.push(`nl.channel = $${params.length}`);
        }
        if (eventKey) {
            params.push(eventKey);
            where.push(`nl.event_key = $${params.length}`);
        }
        if (status) {
            params.push(status);
            where.push(`nl.status = $${params.length}`);
        }
        if (from) {
            params.push(from);
            where.push(`nl.created_at >= $${params.length}::timestamptz`);
        }
        if (to) {
            params.push(to);
            where.push(`nl.created_at <= $${params.length}::timestamptz`);
        }

        const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

        const countResult = await query(
            `SELECT COUNT(*) AS total
             FROM notification_log nl
             JOIN users u ON u.id = nl.user_id
             ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0]?.total || 0, 10);

        const dataParams = params.slice();
        dataParams.push(limit, offset);
        const rowsResult = await query(
            `SELECT
                nl.id,
                nl.user_id,
                nl.channel,
                nl.event_key,
                nl.status,
                nl.recipient,
                nl.subject,
                nl.error_message,
                nl.metadata,
                nl.created_at,
                u.username,
                u.first_name,
                u.last_name,
                u.role
             FROM notification_log nl
             JOIN users u ON u.id = nl.user_id
             ${whereClause}
             ORDER BY nl.created_at DESC
             LIMIT $${dataParams.length - 1}
             OFFSET $${dataParams.length}`,
            dataParams
        );

        res.json({
            logs: rowsResult.rows,
            pagination: {
                total,
                page,
                limit,
                pages: Math.max(1, Math.ceil(total / limit))
            }
        });
    } catch (error) {
        console.error('Get school notification logs error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch notification logs'
        });
    }
});

module.exports = router;
