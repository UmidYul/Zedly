
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const ExcelJS = require('exceljs');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const bcrypt = require('bcrypt');
const { notifyNewTest, notifyPasswordReset, notifyTestResults } = require('../utils/notifications');

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

function generateOtp() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let otp = '';
    for (let i = 0; i < 8; i++) {
        otp += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return otp;
}

const MAX_ASSIGNMENT_TEMPLATES = 30;

function sanitizeAssignmentTemplate(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const name = String(raw.name || '').trim();
    const testId = String(raw.test_id || '').trim();
    const classIds = Array.from(new Set(
        (Array.isArray(raw.class_ids) ? raw.class_ids : [])
            .map((id) => String(id || '').trim())
            .filter(Boolean)
    ));
    const startHour = String(raw.start_hour || '08:00').trim();
    const durationDays = parseInt(raw.duration_days, 10);

    const validHour = /^([01]\d|2[0-3]):([0-5]\d)$/.test(startHour) ? startHour : '08:00';
    const validDuration = Number.isFinite(durationDays)
        ? Math.min(Math.max(durationDays, 1), 180)
        : 7;

    if (!name || !testId || classIds.length === 0) {
        return null;
    }

    return {
        id: String(raw.id || `tpl_${Date.now()}_${Math.round(Math.random() * 1e6)}`),
        name: name.slice(0, 80),
        test_id: testId,
        class_ids: classIds,
        start_hour: validHour,
        duration_days: validDuration,
        updated_at: new Date().toISOString()
    };
}

async function loadTeacherAssignmentTemplates(teacherId) {
    const result = await query(
        'SELECT settings FROM users WHERE id = $1 AND role = $2 LIMIT 1',
        [teacherId, 'teacher']
    );
    const settings = result.rows[0]?.settings && typeof result.rows[0].settings === 'object'
        ? result.rows[0].settings
        : {};
    const templates = Array.isArray(settings.assignment_templates)
        ? settings.assignment_templates.map(sanitizeAssignmentTemplate).filter(Boolean)
        : [];
    return { settings, templates };
}

async function saveTeacherAssignmentTemplates(teacherId, settings, templates) {
    const nextSettings = {
        ...(settings && typeof settings === 'object' ? settings : {}),
        assignment_templates: templates.slice(0, MAX_ASSIGNMENT_TEMPLATES)
    };
    await query(
        'UPDATE users SET settings = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [nextSettings, teacherId]
    );
    return nextSettings.assignment_templates;
}

async function writeAuditSafe(userId, action, entityType, entityId, details) {
    try {
        await query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [userId, action, entityType, entityId, details]
        );
    } catch (auditError) {
        console.error('Audit log write error:', auditError);
    }
}


async function getAttemptOverviewExpressions(alias = 'att') {
    const result = await query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'test_attempts'
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
        scoreExpr = `CASE WHEN ${maxScore} IS NOT NULL AND ${maxScore} > 0 THEN (${score} / ${maxScore} * 100) ELSE ${score} END`;
    } else if (score) {
        scoreExpr = score;
    }

    const completedAt = col('submitted_at') || col('completed_at') || col('graded_at') || col('created_at') || 'NULL';
    const timeSpent = col('time_spent_seconds') || col('time_spent') || col('duration_seconds') || 'NULL';

    let completedFilter = 'TRUE';
    if (columns.has('status')) {
        completedFilter = `${alias}.status = 'completed'`;
    } else if (columns.has('is_completed')) {
        completedFilter = `${alias}.is_completed = true`;
    } else if (completedAt !== 'NULL') {
        completedFilter = `${completedAt} IS NOT NULL`;
    }

    return { score: scoreExpr, completedAt, completedFilter, timeSpent };
}

function startOfDay(date) {
    const value = new Date(date);
    value.setHours(0, 0, 0, 0);
    return value;
}

function addDays(date, days) {
    const value = new Date(date);
    value.setDate(value.getDate() + days);
    return value;
}

function startOfWeekMonday(date) {
    const value = startOfDay(date);
    const day = value.getDay();
    const diff = (day + 6) % 7;
    value.setDate(value.getDate() - diff);
    return value;
}

function getTeacherOverviewDateRanges(referenceDate = new Date()) {
    const now = new Date(referenceDate);
    const dayStart = startOfDay(now);
    const weekStart = startOfWeekMonday(now);
    const weekEndExclusive = addDays(weekStart, 7);
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const chartCurrentWeekStart = startOfWeekMonday(now);

    return {
        now,
        dayStart,
        weekStart,
        weekEndExclusive,
        twoDaysAhead: addDays(now, 2),
        fiveDaysAgo: addDays(dayStart, -5),
        twoWeeksAgo: addDays(dayStart, -14),
        fourWeeksAgo: addDays(dayStart, -28),
        thirtyDaysAgo: addDays(dayStart, -30),
        currentMonthStart,
        nextMonthStart,
        prevMonthStart,
        chartCurrentWeekStart,
        chartStart: addDays(chartCurrentWeekStart, -21),
        chartEndExclusive: addDays(chartCurrentWeekStart, 7)
    };
}

function getTeacherClassScopeCte(schoolParam = '$1', teacherParam = '$2') {
    return `
        WITH teacher_classes_scope AS (
            SELECT DISTINCT
                c.id,
                c.name,
                c.grade_level
            FROM classes c
            LEFT JOIN teacher_class_subjects tcs
                ON tcs.class_id = c.id
               AND tcs.teacher_id = ${teacherParam}
            WHERE c.school_id = ${schoolParam}
              AND c.is_active = true
              AND (c.homeroom_teacher_id = ${teacherParam} OR tcs.teacher_id = ${teacherParam})
        )
    `;
}

function computeTrend(deltaValue) {
    const delta = Number(deltaValue || 0);
    if (!Number.isFinite(delta) || Math.abs(delta) < 0.01) return 'stable';
    return delta > 0 ? 'up' : 'down';
}

function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function trimToFixedNumber(value, digits = 2) {
    const safe = toNumber(value, 0);
    return Number(safe.toFixed(digits));
}

function normalizeStudentName(row) {
    const fullName = `${row?.first_name || ''} ${row?.last_name || ''}`.trim();
    return fullName || String(row?.student_id || row?.id || '—');
}

function buildTeacherOverviewActivity(passRows, completedRows, createdRows) {
    const events = [];

    (Array.isArray(passRows) ? passRows : []).forEach((row) => {
        events.push({
            type: 'students_completed',
            occurred_at: row.event_at,
            test_title: row.test_title,
            class_name: row.class_name,
            students_count: Number(row.students_count || 0),
            avg_score: row.avg_score === null || row.avg_score === undefined
                ? null
                : trimToFixedNumber(row.avg_score, 2),
            text: `${Number(row.students_count || 0)} учеников прошли тест "${row.test_title || 'Тест'}"`
        });
    });

    (Array.isArray(completedRows) ? completedRows : []).forEach((row) => {
        const avgScore = row.avg_score === null || row.avg_score === undefined
            ? null
            : trimToFixedNumber(row.avg_score, 2);
        events.push({
            type: 'test_completed',
            occurred_at: row.event_at,
            test_title: row.test_title,
            class_name: row.class_name,
            avg_score: avgScore,
            text: avgScore === null
                ? `Тест "${row.test_title || 'Тест'}" завершён`
                : `Тест "${row.test_title || 'Тест'}" завершён — итоговый балл класса ${avgScore.toFixed(1)}%`
        });
    });

    (Array.isArray(createdRows) ? createdRows : []).forEach((row) => {
        events.push({
            type: 'test_created',
            occurred_at: row.created_at,
            test_title: row.title,
            class_name: null,
            avg_score: null,
            text: `Создан тест "${row.title || 'Без названия'}"`
        });
    });

    events.sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at));
    return events.slice(0, 10);
}

function buildTeacherRiskStudents(rows, now, inactivityThresholdDays = 5) {
    const safeRows = Array.isArray(rows) ? rows : [];

    const parsed = safeRows.map((row) => {
        const avgScore = toNumber(row.avg_score, 0);
        const recent14 = toNumber(row.avg_recent_14, 0);
        const prev14 = toNumber(row.avg_prev_14, 0);
        const scoreDrop = prev14 > 0 ? (prev14 - recent14) : 0;

        const lastAttemptDate = row.last_attempt_at ? new Date(row.last_attempt_at) : null;
        const createdAtDate = row.student_created_at ? new Date(row.student_created_at) : null;
        const baseDate = lastAttemptDate && !Number.isNaN(lastAttemptDate.getTime())
            ? lastAttemptDate
            : (createdAtDate && !Number.isNaN(createdAtDate.getTime()) ? createdAtDate : null);

        const inactiveDays = baseDate
            ? Math.max(0, Math.floor((now.getTime() - baseDate.getTime()) / 86400000))
            : null;

        const isLowScore = avgScore < 40;
        const isDrop = scoreDrop > 15;
        const isInactive = inactiveDays === null || inactiveDays > inactivityThresholdDays;

        const reasons = [];
        if (isLowScore) reasons.push('Средний балл ниже 40%');
        if (isDrop) reasons.push(`Падение результата на ${scoreDrop.toFixed(1)}% за 2 недели`);
        if (isInactive) {
            reasons.push(
                inactiveDays === null
                    ? 'Нет активности по тестам более 5 дней'
                    : `Не проходил тесты ${inactiveDays} дн.`
            );
        }

        const scoreRisk = isLowScore ? 60 + Math.max(0, (40 - avgScore)) : 0;
        const dropRisk = isDrop ? Math.min(100, scoreDrop * 2) : 0;
        const inactivityRisk = isInactive ? 20 + (inactiveDays === null ? 20 : Math.min(40, inactiveDays)) : 0;
        const riskScore = scoreRisk + dropRisk + inactivityRisk;

        return {
            student_id: row.student_id,
            student_name: normalizeStudentName(row),
            class_id: row.class_id,
            class_name: row.class_name || '—',
            avg_score: trimToFixedNumber(avgScore, 2),
            avg_recent_14: trimToFixedNumber(recent14, 2),
            avg_prev_14: trimToFixedNumber(prev14, 2),
            score_drop: trimToFixedNumber(scoreDrop, 2),
            inactive_days: inactiveDays,
            reasons,
            risk_score: trimToFixedNumber(riskScore, 2),
            flags: {
                low_score: isLowScore,
                score_drop: isDrop,
                inactive: isInactive
            }
        };
    });

    const inactiveStudentsCount = parsed.filter((row) => row.flags.inactive).length;

    const riskStudents = parsed
        .filter((row) => row.flags.low_score || row.flags.score_drop || row.flags.inactive)
        .sort((a, b) => {
            if (b.risk_score !== a.risk_score) return b.risk_score - a.risk_score;
            if (a.avg_score !== b.avg_score) return a.avg_score - b.avg_score;
            return a.student_name.localeCompare(b.student_name, 'ru');
        })
        .slice(0, 10);

    return { riskStudents, inactiveStudentsCount };
}

async function buildTeacherOverviewPayload(teacherId, schoolId, teacherInfo = null) {
    const ranges = getTeacherOverviewDateRanges();
    const attempt = await getAttemptOverviewExpressions('att');
    const classScopeCte = getTeacherClassScopeCte('$1', '$2');

    const summaryPromise = query(
        `${classScopeCte}
         SELECT
            (SELECT COUNT(*)::int FROM teacher_classes_scope) as classes_count,
            (
                SELECT COUNT(*)::int
                FROM test_assignments ta
                JOIN teacher_classes_scope tcs ON tcs.id = ta.class_id
                WHERE ta.assigned_by = $2
                  AND ta.is_active = true
                  AND ta.end_date >= $3
                  AND ta.end_date < $4
            ) as deadlines_this_week,
            (
                SELECT COUNT(*)::int
                FROM test_assignments ta
                JOIN teacher_classes_scope tcs ON tcs.id = ta.class_id
                WHERE ta.assigned_by = $2
                  AND ta.is_active = true
                  AND ta.end_date >= $3
            ) as active_tests_count,
            (
                SELECT COUNT(*)::int
                FROM tests t
                WHERE t.teacher_id = $2
                  AND t.school_id = $1
            ) as tests_created_total,
            (
                SELECT AVG(${attempt.score})::float
                FROM test_assignments ta
                JOIN teacher_classes_scope tcs ON tcs.id = ta.class_id
                JOIN test_attempts att ON att.assignment_id = ta.id
                WHERE ta.assigned_by = $2
                  AND ${attempt.completedFilter}
                  AND ${attempt.completedAt} >= $5
            ) as avg_score_30d
        `,
        [schoolId, teacherId, ranges.now, ranges.weekEndExclusive, ranges.thirtyDaysAgo]
    );

    const urgentTestsPromise = query(
        `${classScopeCte}
         SELECT
            ta.id as assignment_id,
            ta.test_id,
            t.title as test_title,
            tcs.id as class_id,
            tcs.name as class_name,
            ta.start_date,
            ta.end_date,
            COALESCE(st.total_students, 0)::int as total_students,
            COALESCE(att_stats.completed_students, 0)::int as completed_students,
            COALESCE(att_stats.avg_score, 0)::float as avg_score,
            CASE
                WHEN COALESCE(st.total_students, 0) = 0 THEN 0
                ELSE (COALESCE(att_stats.completed_students, 0)::float / st.total_students::float * 100)
            END::float as completion_percent,
            GREATEST(0, CEIL(EXTRACT(EPOCH FROM (ta.end_date - $3)) / 86400.0))::int as days_left
        FROM test_assignments ta
        JOIN teacher_classes_scope tcs ON tcs.id = ta.class_id
        JOIN tests t ON t.id = ta.test_id
        LEFT JOIN LATERAL (
            SELECT COUNT(*)::int as total_students
            FROM class_students cs
            WHERE cs.class_id = ta.class_id
              AND cs.is_active = true
        ) st ON true
        LEFT JOIN LATERAL (
            SELECT
                COUNT(DISTINCT att.student_id) FILTER (WHERE ${attempt.completedFilter})::int as completed_students,
                AVG(${attempt.score}) FILTER (WHERE ${attempt.completedFilter})::float as avg_score
            FROM test_attempts att
            WHERE att.assignment_id = ta.id
        ) att_stats ON true
        WHERE ta.assigned_by = $2
          AND ta.is_active = true
          AND ta.end_date >= $3
          AND ta.end_date <= $4
          AND (
            CASE
                WHEN COALESCE(st.total_students, 0) = 0 THEN 0
                ELSE (COALESCE(att_stats.completed_students, 0)::float / st.total_students::float * 100)
            END
          ) < 50
        ORDER BY ta.end_date ASC, t.title ASC
        LIMIT 10
        `,
        [schoolId, teacherId, ranges.now, ranges.twoDaysAhead]
    );

    const lowScoreClassesPromise = query(
        `${classScopeCte}
         , class_scores AS (
            SELECT
                tcs.id as class_id,
                tcs.name as class_name,
                AVG(${attempt.score}) FILTER (
                    WHERE ${attempt.completedFilter}
                      AND ${attempt.completedAt} >= $3
                      AND ${attempt.completedAt} < $4
                )::float as recent_avg,
                AVG(${attempt.score}) FILTER (
                    WHERE ${attempt.completedFilter}
                      AND ${attempt.completedAt} >= $5
                      AND ${attempt.completedAt} < $3
                )::float as prev_avg,
                COUNT(att.id) FILTER (
                    WHERE ${attempt.completedFilter}
                      AND ${attempt.completedAt} >= $3
                      AND ${attempt.completedAt} < $4
                )::int as attempts_recent
            FROM teacher_classes_scope tcs
            LEFT JOIN test_assignments ta ON ta.class_id = tcs.id AND ta.assigned_by = $2
            LEFT JOIN test_attempts att ON att.assignment_id = ta.id
            GROUP BY tcs.id, tcs.name
         )
         SELECT
            class_id,
            class_name,
            COALESCE(recent_avg, 0)::float as avg_score,
            COALESCE(prev_avg, 0)::float as prev_avg_score,
            COALESCE(attempts_recent, 0)::int as attempts
         FROM class_scores
         WHERE recent_avg IS NOT NULL
           AND recent_avg < 50
           AND prev_avg IS NOT NULL
           AND prev_avg >= 50
         ORDER BY avg_score ASC, class_name ASC
         LIMIT 10
        `,
        [schoolId, teacherId, ranges.twoWeeksAgo, ranges.now, ranges.fourWeeksAgo]
    );

    const improvedClassesPromise = query(
        `${classScopeCte}
         , class_scores AS (
            SELECT
                tcs.id as class_id,
                tcs.name as class_name,
                AVG(${attempt.score}) FILTER (
                    WHERE ${attempt.completedFilter}
                      AND ${attempt.completedAt} >= $3
                      AND ${attempt.completedAt} < $4
                )::float as recent_avg,
                AVG(${attempt.score}) FILTER (
                    WHERE ${attempt.completedFilter}
                      AND ${attempt.completedAt} >= $5
                      AND ${attempt.completedAt} < $3
                )::float as prev_avg
            FROM teacher_classes_scope tcs
            LEFT JOIN test_assignments ta ON ta.class_id = tcs.id AND ta.assigned_by = $2
            LEFT JOIN test_attempts att ON att.assignment_id = ta.id
            GROUP BY tcs.id, tcs.name
         )
         SELECT
            class_id,
            class_name,
            COALESCE(recent_avg, 0)::float as current_avg,
            COALESCE(prev_avg, 0)::float as previous_avg,
            (COALESCE(recent_avg, 0) - COALESCE(prev_avg, 0))::float as improvement
         FROM class_scores
         WHERE prev_avg IS NOT NULL
           AND (COALESCE(recent_avg, 0) - COALESCE(prev_avg, 0)) > 10
         ORDER BY improvement DESC, class_name ASC
         LIMIT 10
        `,
        [schoolId, teacherId, ranges.twoWeeksAgo, ranges.now, ranges.fourWeeksAgo]
    );

    const activeTestsPromise = query(
        `${classScopeCte}
         SELECT
            ta.id as assignment_id,
            ta.test_id,
            t.title as test_title,
            tcs.id as class_id,
            tcs.name as class_name,
            ta.start_date,
            ta.end_date,
            COALESCE(st.total_students, 0)::int as total_students,
            COALESCE(att_stats.completed_students, 0)::int as completed_students,
            COALESCE(att_stats.avg_score, 0)::float as avg_score,
            CASE
                WHEN COALESCE(st.total_students, 0) = 0 THEN 0
                ELSE (COALESCE(att_stats.completed_students, 0)::float / st.total_students::float * 100)
            END::float as completion_percent,
            GREATEST(0, CEIL(EXTRACT(EPOCH FROM (ta.end_date - $3)) / 86400.0))::int as days_left
        FROM test_assignments ta
        JOIN teacher_classes_scope tcs ON tcs.id = ta.class_id
        JOIN tests t ON t.id = ta.test_id
        LEFT JOIN LATERAL (
            SELECT COUNT(*)::int as total_students
            FROM class_students cs
            WHERE cs.class_id = ta.class_id
              AND cs.is_active = true
        ) st ON true
        LEFT JOIN LATERAL (
            SELECT
                COUNT(DISTINCT att.student_id) FILTER (WHERE ${attempt.completedFilter})::int as completed_students,
                AVG(${attempt.score}) FILTER (WHERE ${attempt.completedFilter})::float as avg_score
            FROM test_attempts att
            WHERE att.assignment_id = ta.id
        ) att_stats ON true
        WHERE ta.assigned_by = $2
          AND ta.is_active = true
          AND ta.end_date >= $3
        ORDER BY ta.end_date ASC, t.title ASC
        LIMIT 50
        `,
        [schoolId, teacherId, ranges.now]
    );

    const classRankingPromise = query(
        `${classScopeCte}
         , class_scores AS (
            SELECT
                tcs.id as class_id,
                tcs.name as class_name,
                AVG(${attempt.score}) FILTER (
                    WHERE ${attempt.completedFilter}
                      AND ${attempt.completedAt} >= $3
                      AND ${attempt.completedAt} < $4
                )::float as current_avg,
                AVG(${attempt.score}) FILTER (
                    WHERE ${attempt.completedFilter}
                      AND ${attempt.completedAt} >= $5
                      AND ${attempt.completedAt} < $3
                )::float as prev_avg,
                COUNT(att.id) FILTER (
                    WHERE ${attempt.completedFilter}
                      AND ${attempt.completedAt} >= $3
                      AND ${attempt.completedAt} < $4
                )::int as attempts_current_month
            FROM teacher_classes_scope tcs
            LEFT JOIN test_assignments ta ON ta.class_id = tcs.id AND ta.assigned_by = $2
            LEFT JOIN test_attempts att ON att.assignment_id = ta.id
            GROUP BY tcs.id, tcs.name
         )
         SELECT
            class_id,
            class_name,
            COALESCE(current_avg, 0)::float as avg_score,
            COALESCE(prev_avg, 0)::float as prev_avg_score,
            (COALESCE(current_avg, 0) - COALESCE(prev_avg, 0))::float as trend_delta,
            COALESCE(attempts_current_month, 0)::int as attempts_current_month
         FROM class_scores
         ORDER BY avg_score DESC, class_name ASC
        `,
        [schoolId, teacherId, ranges.currentMonthStart, ranges.nextMonthStart, ranges.prevMonthStart]
    );

    const studentMetricsPromise = query(
        `${classScopeCte}
         , student_scope AS (
            SELECT DISTINCT
                u.id as student_id,
                u.first_name,
                u.last_name,
                u.created_at as student_created_at
            FROM teacher_classes_scope tcs
            JOIN class_students cs ON cs.class_id = tcs.id AND cs.is_active = true
            JOIN users u ON u.id = cs.student_id
            WHERE u.school_id = $1
              AND u.role = 'student'
              AND u.is_active = true
         ),
         student_primary_class AS (
            SELECT DISTINCT ON (ss.student_id)
                ss.student_id,
                tcs.id as class_id,
                tcs.name as class_name
            FROM student_scope ss
            JOIN class_students cs ON cs.student_id = ss.student_id AND cs.is_active = true
            JOIN teacher_classes_scope tcs ON tcs.id = cs.class_id
            ORDER BY ss.student_id, tcs.name ASC, tcs.id ASC
         ),
         student_stats AS (
            SELECT
                ss.student_id,
                AVG(${attempt.score}) FILTER (
                    WHERE ta.id IS NOT NULL
                      AND ${attempt.completedFilter}
                      AND ${attempt.completedAt} >= $3
                      AND ${attempt.completedAt} < $4
                )::float as avg_recent_14,
                AVG(${attempt.score}) FILTER (
                    WHERE ta.id IS NOT NULL
                      AND ${attempt.completedFilter}
                      AND ${attempt.completedAt} >= $5
                      AND ${attempt.completedAt} < $3
                )::float as avg_prev_14,
                AVG(${attempt.score}) FILTER (
                    WHERE ta.id IS NOT NULL
                      AND ${attempt.completedFilter}
                      AND ${attempt.completedAt} >= $6
                )::float as avg_30,
                AVG(${attempt.score}) FILTER (
                    WHERE ta.id IS NOT NULL
                      AND ${attempt.completedFilter}
                )::float as avg_all,
                MAX(${attempt.completedAt}) FILTER (
                    WHERE ta.id IS NOT NULL
                      AND ${attempt.completedFilter}
                ) as last_attempt_at
            FROM student_scope ss
            LEFT JOIN test_attempts att ON att.student_id = ss.student_id
            LEFT JOIN test_assignments ta
                ON ta.id = att.assignment_id
               AND ta.assigned_by = $2
            GROUP BY ss.student_id
         )
         SELECT
            ss.student_id,
            ss.first_name,
            ss.last_name,
            ss.student_created_at,
            spc.class_id,
            spc.class_name,
            COALESCE(st.avg_recent_14, st.avg_30, st.avg_all, 0)::float as avg_score,
            COALESCE(st.avg_recent_14, 0)::float as avg_recent_14,
            COALESCE(st.avg_prev_14, 0)::float as avg_prev_14,
            COALESCE(st.avg_30, 0)::float as avg_30,
            st.last_attempt_at
         FROM student_scope ss
         LEFT JOIN student_primary_class spc ON spc.student_id = ss.student_id
         LEFT JOIN student_stats st ON st.student_id = ss.student_id
         ORDER BY ss.last_name ASC, ss.first_name ASC
        `,
        [schoolId, teacherId, ranges.twoWeeksAgo, ranges.now, ranges.fourWeeksAgo, ranges.thirtyDaysAgo]
    );

    const passActivityPromise = query(
        `${classScopeCte}
         SELECT
            MAX(${attempt.completedAt}) as event_at,
            ta.id as assignment_id,
            t.title as test_title,
            tcs.name as class_name,
            COUNT(DISTINCT att.student_id)::int as students_count,
            AVG(${attempt.score})::float as avg_score
         FROM test_assignments ta
         JOIN teacher_classes_scope tcs ON tcs.id = ta.class_id
         JOIN tests t ON t.id = ta.test_id
         JOIN test_attempts att ON att.assignment_id = ta.id
         WHERE ta.assigned_by = $2
           AND ${attempt.completedFilter}
           AND ${attempt.completedAt} >= $3
         GROUP BY ta.id, t.title, tcs.name
         ORDER BY event_at DESC
         LIMIT 20
        `,
        [schoolId, teacherId, ranges.thirtyDaysAgo]
    );

    const completedActivityPromise = query(
        `${classScopeCte}
         SELECT
            ta.end_date as event_at,
            ta.id as assignment_id,
            t.title as test_title,
            tcs.name as class_name,
            AVG(${attempt.score}) FILTER (WHERE ${attempt.completedFilter})::float as avg_score
         FROM test_assignments ta
         JOIN teacher_classes_scope tcs ON tcs.id = ta.class_id
         JOIN tests t ON t.id = ta.test_id
         LEFT JOIN test_attempts att ON att.assignment_id = ta.id
         WHERE ta.assigned_by = $2
           AND ta.end_date < $3
           AND ta.end_date >= $4
         GROUP BY ta.id, ta.end_date, t.title, tcs.name
         ORDER BY ta.end_date DESC
         LIMIT 20
        `,
        [schoolId, teacherId, ranges.now, ranges.thirtyDaysAgo]
    );

    const createdActivityPromise = query(
        `SELECT id, title, created_at
         FROM tests
         WHERE teacher_id = $1
           AND school_id = $2
           AND created_at >= $3
         ORDER BY created_at DESC
         LIMIT 20
        `,
        [teacherId, schoolId, ranges.thirtyDaysAgo]
    );

    const [
        summaryResult,
        urgentTestsResult,
        lowScoreClassesResult,
        improvedClassesResult,
        activeTestsResult,
        classRankingResult,
        studentMetricsResult,
        passActivityResult,
        completedActivityResult,
        createdActivityResult
    ] = await Promise.all([
        summaryPromise,
        urgentTestsPromise,
        lowScoreClassesPromise,
        improvedClassesPromise,
        activeTestsPromise,
        classRankingPromise,
        studentMetricsPromise,
        passActivityPromise,
        completedActivityPromise,
        createdActivityPromise
    ]);

    const summary = summaryResult.rows[0] || {};

    const urgentTests = urgentTestsResult.rows.map((row) => ({
        assignment_id: row.assignment_id,
        test_id: row.test_id,
        test_title: row.test_title,
        class_id: row.class_id,
        class_name: row.class_name,
        start_date: row.start_date,
        end_date: row.end_date,
        total_students: Number(row.total_students || 0),
        completed_students: Number(row.completed_students || 0),
        avg_score: trimToFixedNumber(row.avg_score, 2),
        completion_percent: trimToFixedNumber(row.completion_percent, 2),
        days_left: Number(row.days_left || 0)
    }));

    const lowScoreClasses = lowScoreClassesResult.rows.map((row) => ({
        class_id: row.class_id,
        class_name: row.class_name,
        avg_score: trimToFixedNumber(row.avg_score, 2),
        attempts: Number(row.attempts || 0)
    }));

    const improvedClasses = improvedClassesResult.rows.map((row) => ({
        class_id: row.class_id,
        class_name: row.class_name,
        current_avg: trimToFixedNumber(row.current_avg, 2),
        previous_avg: trimToFixedNumber(row.previous_avg, 2),
        improvement: trimToFixedNumber(row.improvement, 2),
        trend: computeTrend(row.improvement)
    }));

    const activeTests = activeTestsResult.rows.map((row) => ({
        assignment_id: row.assignment_id,
        test_id: row.test_id,
        test_title: row.test_title,
        class_id: row.class_id,
        class_name: row.class_name,
        start_date: row.start_date,
        end_date: row.end_date,
        total_students: Number(row.total_students || 0),
        completed_students: Number(row.completed_students || 0),
        avg_score: trimToFixedNumber(row.avg_score, 2),
        completion_percent: trimToFixedNumber(row.completion_percent, 2),
        days_left: Number(row.days_left || 0)
    }));

    const classRanking = classRankingResult.rows.map((row) => {
        const trendDelta = trimToFixedNumber(row.trend_delta, 2);
        return {
            class_id: row.class_id,
            class_name: row.class_name,
            avg_score: trimToFixedNumber(row.avg_score, 2),
            prev_avg_score: trimToFixedNumber(row.prev_avg_score, 2),
            trend_delta: trendDelta,
            trend: computeTrend(trendDelta),
            attempts_current_month: Number(row.attempts_current_month || 0)
        };
    });

    const { riskStudents, inactiveStudentsCount } = buildTeacherRiskStudents(
        studentMetricsResult.rows,
        ranges.now,
        5
    );

    const lastActivity = buildTeacherOverviewActivity(
        passActivityResult.rows,
        completedActivityResult.rows,
        createdActivityResult.rows
    );

    const alerts = {
        show: Boolean(
            urgentTests.length
            || lowScoreClasses.length
            || inactiveStudentsCount > 0
            || improvedClasses.length
        ),
        urgent_tests: urgentTests,
        low_score_classes: lowScoreClasses,
        inactive_students_count: inactiveStudentsCount,
        improved_classes: improvedClasses
    };

    return {
        generated_at: ranges.now.toISOString(),
        teacher: {
            id: teacherId,
            full_name: `${teacherInfo?.first_name || ''} ${teacherInfo?.last_name || ''}`.trim() || null
        },
        greeting_meta: {
            classes_count: Number(summary.classes_count || 0),
            tests_deadline_this_week: Number(summary.deadlines_this_week || 0)
        },
        mini_stats: {
            classes_count: Number(summary.classes_count || 0),
            active_tests_count: Number(summary.active_tests_count || 0),
            avg_score_30d: trimToFixedNumber(summary.avg_score_30d, 2),
            tests_created_total: Number(summary.tests_created_total || 0)
        },
        alerts,
        active_tests: activeTests,
        class_ranking: classRanking,
        risk_students: riskStudents,
        last_activity: lastActivity
    };
}

const TEACHER_OVERVIEW_CHART_COLORS = [
    '#2563eb', '#16a34a', '#f59e0b', '#dc2626',
    '#7c3aed', '#0891b2', '#ea580c', '#14b8a6',
    '#9333ea', '#4f46e5', '#65a30d', '#0f766e'
];

async function buildTeacherPerformanceChartPayload(teacherId, schoolId, classId = 'all') {
    const ranges = getTeacherOverviewDateRanges();
    const attempt = await getAttemptOverviewExpressions('att');
    const classScopeCte = getTeacherClassScopeCte('$1', '$2');

    const classOptionsResult = await query(
        `${classScopeCte}
         SELECT id, name
         FROM teacher_classes_scope
         ORDER BY name ASC
        `,
        [schoolId, teacherId]
    );

    const classOptions = classOptionsResult.rows.map((row) => ({
        id: row.id,
        name: row.name
    }));

    const requestedClassId = String(classId || 'all').trim();
    const hasRequestedClass = classOptions.some((item) => String(item.id) === requestedClassId);
    const selectedClassId = requestedClassId !== 'all' && hasRequestedClass
        ? requestedClassId
        : 'all';

    const weekStarts = [];
    for (let i = 3; i >= 0; i--) {
        weekStarts.push(addDays(ranges.chartCurrentWeekStart, -7 * i));
    }
    const weekKeys = weekStarts.map((weekStart) => weekStart.toISOString().slice(0, 10));

    const classFilter = selectedClassId === 'all' ? '' : 'AND ta.class_id = $5';
    const classFilterParams = selectedClassId === 'all' ? [] : [selectedClassId];

    const chartRowsResult = await query(
        `${classScopeCte}
         SELECT
            DATE_TRUNC('week', ${attempt.completedAt})::date as week_start,
            ta.class_id,
            tcs.name as class_name,
            AVG(${attempt.score}) FILTER (WHERE ${attempt.completedFilter})::float as avg_score,
            COUNT(att.id) FILTER (WHERE ${attempt.completedFilter})::int as attempts
         FROM test_assignments ta
         JOIN teacher_classes_scope tcs ON tcs.id = ta.class_id
         LEFT JOIN test_attempts att ON att.assignment_id = ta.id
         WHERE ta.assigned_by = $2
           AND ${attempt.completedFilter}
           AND ${attempt.completedAt} >= $3
           AND ${attempt.completedAt} < $4
           ${classFilter}
         GROUP BY DATE_TRUNC('week', ${attempt.completedAt}), ta.class_id, tcs.name
         ORDER BY week_start ASC, class_name ASC
        `,
        [schoolId, teacherId, ranges.chartStart, ranges.chartEndExclusive, ...classFilterParams]
    );

    const pointMap = new Map();
    chartRowsResult.rows.forEach((row) => {
        const weekKey = row.week_start ? new Date(row.week_start).toISOString().slice(0, 10) : '';
        if (!weekKey) return;
        pointMap.set(`${row.class_id}:${weekKey}`, {
            avg_score: row.avg_score === null || row.avg_score === undefined
                ? null
                : trimToFixedNumber(row.avg_score, 2),
            attempts: Number(row.attempts || 0)
        });
    });

    const selectedClasses = selectedClassId === 'all'
        ? classOptions
        : classOptions.filter((item) => String(item.id) === selectedClassId);

    const classSeries = selectedClasses.map((classItem, index) => {
        const points = weekKeys.map((weekKey) => {
            const found = pointMap.get(`${classItem.id}:${weekKey}`);
            return {
                week_start: `${weekKey}T00:00:00.000Z`,
                avg_score: found ? found.avg_score : null,
                attempts: found ? found.attempts : 0
            };
        });

        return {
            class_id: classItem.id,
            class_name: classItem.name,
            color: TEACHER_OVERVIEW_CHART_COLORS[index % TEACHER_OVERVIEW_CHART_COLORS.length],
            points
        };
    });

    return {
        generated_at: ranges.now.toISOString(),
        selected_class_id: selectedClassId,
        class_options: classOptions,
        weekly_labels: weekStarts.map((weekStart) => weekStart.toISOString()),
        class_series: classSeries
    };
}

let TEACHER_SUBJECT_COLUMN_CACHE = null;
const TEACHER_ADVANCED_CACHE_TTL_MS = 5 * 60 * 1000;
const TEACHER_ADVANCED_RESPONSE_CACHE = new Map();

function stableSerializeForCache(value) {
    if (value === null || value === undefined) return String(value);
    if (typeof value !== 'object') return String(value);
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableSerializeForCache(item)).join(',')}]`;
    }
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${key}:${stableSerializeForCache(value[key])}`).join(',')}}`;
}

function buildTeacherAdvancedRequestCacheKey(req) {
    const queryEntries = Object.entries(req.query || {})
        .map(([key, value]) => [key, Array.isArray(value) ? value.map((item) => String(item)).join(',') : String(value)])
        .sort(([left], [right]) => String(left).localeCompare(String(right)));

    return stableSerializeForCache({
        teacher_id: String(req.user?.id || ''),
        school_id: String(req.user?.school_id || ''),
        path: String(req.path || ''),
        query: queryEntries
    });
}

function pruneTeacherAdvancedResponseCache(limit = 400) {
    const now = Date.now();
    for (const [key, entry] of TEACHER_ADVANCED_RESPONSE_CACHE.entries()) {
        if (!entry || entry.expires_at <= now) {
            TEACHER_ADVANCED_RESPONSE_CACHE.delete(key);
        }
    }
    if (TEACHER_ADVANCED_RESPONSE_CACHE.size <= limit) return;

    const ordered = Array.from(TEACHER_ADVANCED_RESPONSE_CACHE.entries())
        .sort((left, right) => left[1].created_at - right[1].created_at);
    const removeCount = TEACHER_ADVANCED_RESPONSE_CACHE.size - limit;
    for (let index = 0; index < removeCount; index += 1) {
        TEACHER_ADVANCED_RESPONSE_CACHE.delete(ordered[index][0]);
    }
}

function teacherAdvancedResponseCacheMiddleware(req, res, next) {
    if (req.method !== 'GET') return next();
    if (!String(req.path || '').startsWith('/advanced/')) return next();

    const cacheKey = buildTeacherAdvancedRequestCacheKey(req);
    const now = Date.now();
    const cached = TEACHER_ADVANCED_RESPONSE_CACHE.get(cacheKey);

    if (cached && cached.expires_at > now) {
        if (cached.headers?.content_type) {
            res.setHeader('Content-Type', String(cached.headers.content_type));
        }
        if (cached.headers?.content_disposition) {
            res.setHeader('Content-Disposition', String(cached.headers.content_disposition));
        }
        res.setHeader('X-Teacher-Advanced-Cache', 'HIT');
        if (cached.is_json) {
            return res.status(cached.status_code || 200).json(cached.body);
        }
        return res.status(cached.status_code || 200).send(cached.body);
    }

    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    res.json = (payload) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
            TEACHER_ADVANCED_RESPONSE_CACHE.set(cacheKey, {
                created_at: Date.now(),
                expires_at: Date.now() + TEACHER_ADVANCED_CACHE_TTL_MS,
                status_code: res.statusCode,
                is_json: true,
                body: payload,
                headers: {
                    content_type: res.getHeader('Content-Type'),
                    content_disposition: res.getHeader('Content-Disposition')
                }
            });
            pruneTeacherAdvancedResponseCache();
        }
        res.setHeader('X-Teacher-Advanced-Cache', 'MISS');
        return originalJson(payload);
    };

    res.send = (payload) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
            TEACHER_ADVANCED_RESPONSE_CACHE.set(cacheKey, {
                created_at: Date.now(),
                expires_at: Date.now() + TEACHER_ADVANCED_CACHE_TTL_MS,
                status_code: res.statusCode,
                is_json: false,
                body: Buffer.isBuffer(payload) ? Buffer.from(payload) : payload,
                headers: {
                    content_type: res.getHeader('Content-Type'),
                    content_disposition: res.getHeader('Content-Disposition')
                }
            });
            pruneTeacherAdvancedResponseCache();
        }
        res.setHeader('X-Teacher-Advanced-Cache', 'MISS');
        return originalSend(payload);
    };

    return next();
}

function normalizeAdvancedFilterValue(rawValue) {
    const value = String(rawValue || '').trim();
    if (!value || value.toLowerCase() === 'all') {
        return null;
    }
    return value;
}

function parseAdvancedDateOnly(rawValue) {
    const value = String(rawValue || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return null;
    }
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }
    return parsed;
}

function resolveTeacherAdvancedDateRange(query, now = new Date()) {
    const periodRaw = String(query?.period_key || query?.period || 'this_month').trim().toLowerCase();
    const nowDay = startOfDay(now);
    const tomorrow = addDays(nowDay, 1);

    const thisWeekStart = startOfWeekMonday(now);
    const thisWeekEnd = addDays(thisWeekStart, 7);

    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    const quarterStart = new Date(now.getFullYear(), quarterStartMonth, 1);
    const quarterEnd = new Date(now.getFullYear(), quarterStartMonth + 3, 1);

    const academicYearStartYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    const academicYearStart = new Date(academicYearStartYear, 8, 1);
    const academicYearEnd = new Date(academicYearStartYear + 1, 8, 1);

    let periodKey = periodRaw;
    let startDate = thisMonthStart;
    let endDateExclusive = thisMonthEnd;

    if (periodKey === 'this_week') {
        startDate = thisWeekStart;
        endDateExclusive = thisWeekEnd;
    } else if (periodKey === 'this_month') {
        startDate = thisMonthStart;
        endDateExclusive = thisMonthEnd;
    } else if (periodKey === 'current_quarter') {
        startDate = quarterStart;
        endDateExclusive = quarterEnd;
    } else if (periodKey === 'academic_year') {
        startDate = academicYearStart;
        endDateExclusive = academicYearEnd;
    } else if (periodKey === 'custom') {
        const dateFrom = parseAdvancedDateOnly(query?.date_from);
        const dateTo = parseAdvancedDateOnly(query?.date_to);
        if (dateFrom && dateTo && dateFrom.getTime() <= dateTo.getTime()) {
            startDate = startOfDay(dateFrom);
            endDateExclusive = addDays(startOfDay(dateTo), 1);
        } else {
            periodKey = 'this_month';
            startDate = thisMonthStart;
            endDateExclusive = thisMonthEnd;
        }
    } else {
        const periodDays = Number.parseInt(periodKey, 10);
        if (Number.isFinite(periodDays) && periodDays > 0) {
            startDate = addDays(nowDay, -periodDays + 1);
            endDateExclusive = tomorrow;
            periodKey = 'custom';
        } else {
            periodKey = 'this_month';
            startDate = thisMonthStart;
            endDateExclusive = thisMonthEnd;
        }
    }

    const durationMs = Math.max(86400000, endDateExclusive.getTime() - startDate.getTime());
    const previousStartDate = new Date(startDate.getTime() - durationMs);
    const previousEndDateExclusive = new Date(startDate.getTime());

    return {
        periodKey,
        startDate,
        endDateExclusive,
        previousStartDate,
        previousEndDateExclusive
    };
}

function buildTeacherAdvancedScope(req) {
    const teacherId = String(req.user.id || '').trim();
    const schoolId = String(req.user.school_id || '').trim();
    if (!teacherId || !schoolId) {
        return null;
    }
    const dateRange = resolveTeacherAdvancedDateRange(req.query);

    return {
        teacherId,
        schoolId,
        classId: normalizeAdvancedFilterValue(req.query.class_id),
        subjectId: normalizeAdvancedFilterValue(req.query.subject_id),
        dateRange
    };
}

function getTeacherAdvancedClassScopeCte(schoolRef = '$1', teacherRef = '$2', classRef = null) {
    return `
        WITH teacher_classes_scope AS (
            SELECT DISTINCT
                c.id,
                c.name,
                c.grade_level
            FROM classes c
            LEFT JOIN teacher_class_subjects tcs
                ON tcs.class_id = c.id
               AND tcs.teacher_id = ${teacherRef}
            WHERE c.school_id = ${schoolRef}
              AND c.is_active = true
              AND (c.homeroom_teacher_id = ${teacherRef} OR tcs.teacher_id = ${teacherRef})
              ${classRef ? `AND c.id = ${classRef}` : ''}
        )
    `;
}

async function getTeacherSubjectNameExpressions(alias = 's') {
    if (!TEACHER_SUBJECT_COLUMN_CACHE) {
        const result = await query(
            `SELECT column_name
             FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name = 'subjects'`
        );
        const columns = new Set(result.rows.map((row) => row.column_name));
        TEACHER_SUBJECT_COLUMN_CACHE = {
            hasNameRu: columns.has('name_ru'),
            hasNameUz: columns.has('name_uz'),
            hasName: columns.has('name')
        };
    }

    const parts = [];
    if (TEACHER_SUBJECT_COLUMN_CACHE.hasNameRu) parts.push(`NULLIF(${alias}.name_ru, '')`);
    if (TEACHER_SUBJECT_COLUMN_CACHE.hasNameUz) parts.push(`NULLIF(${alias}.name_uz, '')`);
    if (TEACHER_SUBJECT_COLUMN_CACHE.hasName) parts.push(`NULLIF(${alias}.name, '')`);
    const display = parts.length > 0 ? `COALESCE(${parts.join(', ')}, '—')` : "'—'";

    return { display };
}

function buildRegressionLine(points) {
    const safePoints = Array.isArray(points) ? points : [];
    const nonNull = safePoints
        .map((value, index) => ({ x: index, y: value }))
        .filter((item) => Number.isFinite(item.y));

    if (nonNull.length < 2) {
        return safePoints.map(() => null);
    }

    const n = nonNull.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;
    nonNull.forEach((item) => {
        sumX += item.x;
        sumY += item.y;
        sumXY += item.x * item.y;
        sumXX += item.x * item.x;
    });

    const denominator = (n * sumXX) - (sumX * sumX);
    if (denominator === 0) {
        return safePoints.map(() => null);
    }

    const slope = ((n * sumXY) - (sumX * sumY)) / denominator;
    const intercept = (sumY - (slope * sumX)) / n;

    return safePoints.map((value, index) => {
        if (!Number.isFinite(value)) return null;
        return Number((intercept + (slope * index)).toFixed(2));
    });
}

function getWeekKey(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const start = startOfWeekMonday(date);
    return start.toISOString().slice(0, 10);
}

function getWeeksBetween(startDate, endDateExclusive) {
    const weeks = [];
    let cursor = startOfWeekMonday(startDate);
    while (cursor.getTime() < endDateExclusive.getTime()) {
        weeks.push(new Date(cursor));
        cursor = addDays(cursor, 7);
    }
    return weeks;
}

function formatSubjectSafe(value) {
    const text = String(value || '').trim();
    return text || '—';
}

function parseAnswersObject(rawAnswers) {
    if (!rawAnswers) return {};
    if (typeof rawAnswers === 'object' && !Array.isArray(rawAnswers)) return rawAnswers;
    if (typeof rawAnswers === 'string') {
        try {
            const parsed = JSON.parse(rawAnswers);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
        } catch (error) {
            return {};
        }
    }
    return {};
}

function buildQuestionAnalysisFromAttempts(attemptRows) {
    const map = new Map();

    (Array.isArray(attemptRows) ? attemptRows : []).forEach((row) => {
        const answers = parseAnswersObject(row.answers);
        Object.entries(answers).forEach(([questionId, meta]) => {
            if (!meta || typeof meta !== 'object') return;
            if (!Object.prototype.hasOwnProperty.call(meta, 'is_correct')) return;

            const snapshot = meta.question_snapshot && typeof meta.question_snapshot === 'object'
                ? meta.question_snapshot
                : {};
            const questionText = String(
                snapshot.question_text
                || meta.question_text
                || `Вопрос ${questionId}`
            ).trim();
            const isCorrect = String(meta.is_correct).toLowerCase() === 'true' || meta.is_correct === true;

            if (!map.has(questionId)) {
                map.set(questionId, {
                    question_id: questionId,
                    question_text: questionText,
                    correct_count: 0,
                    wrong_count: 0,
                    total: 0
                });
            }
            const item = map.get(questionId);
            item.total += 1;
            if (isCorrect) item.correct_count += 1;
            else item.wrong_count += 1;
        });
    });

    return Array.from(map.values())
        .map((item) => {
            const correctPercent = item.total > 0 ? (item.correct_count / item.total) * 100 : 0;
            const wrongPercent = item.total > 0 ? (item.wrong_count / item.total) * 100 : 0;
            return {
                ...item,
                correct_percent: Number(correctPercent.toFixed(2)),
                wrong_percent: Number(wrongPercent.toFixed(2))
            };
        })
        .sort((a, b) => {
            if (a.correct_percent !== b.correct_percent) return a.correct_percent - b.correct_percent;
            return b.total - a.total;
        });
}

function buildWeakTopicsFromAttempts(attemptRows, limit = 3) {
    const map = new Map();

    (Array.isArray(attemptRows) ? attemptRows : []).forEach((row) => {
        const answers = parseAnswersObject(row.answers);
        Object.values(answers).forEach((meta) => {
            if (!meta || typeof meta !== 'object' || !Object.prototype.hasOwnProperty.call(meta, 'is_correct')) {
                return;
            }
            const snapshot = meta.question_snapshot && typeof meta.question_snapshot === 'object'
                ? meta.question_snapshot
                : {};

            let topic = '';
            if (Array.isArray(snapshot.tags) && snapshot.tags.length) {
                topic = String(snapshot.tags[0] || '').trim();
            }
            if (!topic) {
                topic = String(snapshot.topic || meta.topic || '').trim();
            }
            if (!topic) {
                topic = String(snapshot.question_text || meta.question_text || 'Без темы').slice(0, 80).trim();
            }
            if (!topic) topic = 'Без темы';

            const isCorrect = String(meta.is_correct).toLowerCase() === 'true' || meta.is_correct === true;
            if (!map.has(topic)) {
                map.set(topic, {
                    topic,
                    total: 0,
                    wrong: 0
                });
            }
            const item = map.get(topic);
            item.total += 1;
            if (!isCorrect) item.wrong += 1;
        });
    });

    return Array.from(map.values())
        .map((item) => ({
            topic: item.topic,
            wrong_count: item.wrong,
            total_answers: item.total,
            wrong_percent: item.total > 0
                ? Number(((item.wrong / item.total) * 100).toFixed(2))
                : 0
        }))
        .sort((a, b) => {
            if (b.wrong_percent !== a.wrong_percent) return b.wrong_percent - a.wrong_percent;
            return b.wrong_count - a.wrong_count;
        })
        .slice(0, limit);
}

function computeStudentStatus(avgScore, trendDelta, inactiveDays) {
    if (avgScore < 40 || trendDelta <= -15 || inactiveDays > 5) {
        return 'risk';
    }
    if (avgScore < 60) {
        return 'help';
    }
    return 'normal';
}

async function loadTeacherAdvancedStudentsDataset(scope) {
    const attempt = await getAttemptOverviewExpressions('att');
    const completedDateExpr = attempt.completedAt === 'NULL' ? 'att.started_at' : attempt.completedAt;
    const { display: subjectNameExpr } = await getTeacherSubjectNameExpressions('s');

    const studentsParams = [scope.schoolId, scope.teacherId];
    const studentClassRef = scope.classId ? `$${studentsParams.push(scope.classId)}` : null;
    const studentsResult = await query(
        `${getTeacherAdvancedClassScopeCte('$1', '$2', studentClassRef)}
         , student_rows AS (
            SELECT
                u.id as student_id,
                u.first_name,
                u.last_name,
                tcs.id as class_id,
                tcs.name as class_name,
                ROW_NUMBER() OVER (PARTITION BY u.id ORDER BY tcs.name ASC) as row_num
            FROM teacher_classes_scope tcs
            JOIN class_students cs ON cs.class_id = tcs.id AND cs.is_active = true
            JOIN users u ON u.id = cs.student_id
            WHERE u.school_id = $1
              AND u.role = 'student'
              AND u.is_active = true
         )
         SELECT
            student_id,
            first_name,
            last_name,
            class_id,
            class_name
         FROM student_rows
         WHERE row_num = 1
         ORDER BY last_name ASC, first_name ASC
        `,
        studentsParams
    );

    const assignmentsParams = [scope.schoolId, scope.teacherId];
    const assignmentsClassRef = scope.classId ? `$${assignmentsParams.push(scope.classId)}` : null;
    const assignedStartRef = `$${assignmentsParams.push(scope.dateRange.startDate)}`;
    const assignedEndRef = `$${assignmentsParams.push(scope.dateRange.endDateExclusive)}`;
    const assignedSubjectFilter = scope.subjectId
        ? `AND t.subject_id = $${assignmentsParams.push(scope.subjectId)}`
        : '';

    const assignmentsResult = await query(
        `${getTeacherAdvancedClassScopeCte('$1', '$2', assignmentsClassRef)}
         SELECT
            ta.class_id,
            COUNT(DISTINCT ta.id)::int as assigned_tests
         FROM test_assignments ta
         JOIN tests t ON t.id = ta.test_id
         JOIN teacher_classes_scope tcs ON tcs.id = ta.class_id
         WHERE ta.assigned_by = $2
           AND t.teacher_id = $2
           AND ta.start_date < ${assignedEndRef}
           AND ta.end_date >= ${assignedStartRef}
           ${assignedSubjectFilter}
         GROUP BY ta.class_id
        `,
        assignmentsParams
    );

    const attemptsParams = [scope.schoolId, scope.teacherId];
    const attemptsClassRef = scope.classId ? `$${attemptsParams.push(scope.classId)}` : null;
    const attemptsPrevStartRef = `$${attemptsParams.push(scope.dateRange.previousStartDate)}`;
    const attemptsEndRef = `$${attemptsParams.push(scope.dateRange.endDateExclusive)}`;
    const attemptsSubjectFilter = scope.subjectId
        ? `AND t.subject_id = $${attemptsParams.push(scope.subjectId)}`
        : '';

    const attemptsResult = await query(
        `${getTeacherAdvancedClassScopeCte('$1', '$2', attemptsClassRef)}
         SELECT
            att.student_id,
            att.assignment_id,
            t.id as test_id,
            t.title as test_title,
            t.subject_id,
            ${subjectNameExpr} as subject_name,
            ta.class_id,
            tcs.name as class_name,
            ${attempt.score}::float as score,
            ${completedDateExpr} as completed_at,
            ${attempt.timeSpent} as time_spent_seconds
         FROM test_attempts att
         JOIN test_assignments ta ON ta.id = att.assignment_id
         JOIN tests t ON t.id = ta.test_id
         LEFT JOIN subjects s ON s.id = t.subject_id
         JOIN teacher_classes_scope tcs ON tcs.id = ta.class_id
         WHERE ta.assigned_by = $2
           AND t.teacher_id = $2
           AND ${attempt.completedFilter}
           AND ${completedDateExpr} >= ${attemptsPrevStartRef}
           AND ${completedDateExpr} < ${attemptsEndRef}
           ${attemptsSubjectFilter}
         ORDER BY ${completedDateExpr} ASC
        `,
        attemptsParams
    );

    const assignedByClass = new Map(
        assignmentsResult.rows.map((row) => [String(row.class_id), Number(row.assigned_tests || 0)])
    );

    const studentsMap = new Map();
    studentsResult.rows.forEach((row) => {
        studentsMap.set(String(row.student_id), {
            id: row.student_id,
            first_name: row.first_name || '',
            last_name: row.last_name || '',
            student_name: normalizeStudentName(row),
            class_id: row.class_id,
            class_name: row.class_name || '—',
            current_attempts: [],
            previous_attempts: [],
            subject_scores_current: new Map(),
            last_activity_at: null
        });
    });

    attemptsResult.rows.forEach((row) => {
        const studentId = String(row.student_id);
        const student = studentsMap.get(studentId);
        if (!student) return;

        const completedAt = row.completed_at ? new Date(row.completed_at) : null;
        if (!completedAt || Number.isNaN(completedAt.getTime())) return;

        const score = toNumber(row.score, 0);
        const item = {
            assignment_id: row.assignment_id,
            test_id: row.test_id,
            test_title: row.test_title || '—',
            subject_id: row.subject_id,
            subject_name: formatSubjectSafe(row.subject_name),
            class_id: row.class_id,
            class_name: row.class_name || '—',
            score,
            completed_at: completedAt,
            time_spent_seconds: toNumber(row.time_spent_seconds, 0)
        };

        if (
            completedAt.getTime() >= scope.dateRange.startDate.getTime()
            && completedAt.getTime() < scope.dateRange.endDateExclusive.getTime()
        ) {
            student.current_attempts.push(item);
            const subjectKey = String(item.subject_id || 'no-subject');
            if (!student.subject_scores_current.has(subjectKey)) {
                student.subject_scores_current.set(subjectKey, {
                    subject_id: item.subject_id,
                    subject_name: item.subject_name,
                    sum: 0,
                    count: 0
                });
            }
            const subjectStats = student.subject_scores_current.get(subjectKey);
            subjectStats.sum += score;
            subjectStats.count += 1;
        } else {
            student.previous_attempts.push(item);
        }

        if (!student.last_activity_at || completedAt.getTime() > student.last_activity_at.getTime()) {
            student.last_activity_at = completedAt;
        }
    });

    const now = new Date();
    const students = Array.from(studentsMap.values()).map((student) => {
        const currentScores = student.current_attempts.map((item) => item.score);
        const previousScores = student.previous_attempts.map((item) => item.score);

        const avgCurrent = currentScores.length
            ? currentScores.reduce((sum, value) => sum + value, 0) / currentScores.length
            : 0;
        const avgPrevious = previousScores.length
            ? previousScores.reduce((sum, value) => sum + value, 0) / previousScores.length
            : 0;

        const trendDelta = avgCurrent - avgPrevious;
        const completedTests = new Set(student.current_attempts.map((item) => String(item.assignment_id))).size;
        const assignedTests = assignedByClass.get(String(student.class_id)) || 0;
        const inactiveDays = student.last_activity_at
            ? Math.max(0, Math.floor((now.getTime() - student.last_activity_at.getTime()) / 86400000))
            : 999;

        const subjectAverages = Array.from(student.subject_scores_current.values())
            .map((item) => ({
                subject_id: item.subject_id,
                subject_name: item.subject_name,
                avg_score: item.count > 0 ? item.sum / item.count : 0
            }))
            .sort((a, b) => b.avg_score - a.avg_score);

        const bestSubject = subjectAverages.length ? subjectAverages[0].subject_name : '—';
        const weakSubject = subjectAverages.length ? subjectAverages[subjectAverages.length - 1].subject_name : '—';
        const status = computeStudentStatus(avgCurrent, trendDelta, inactiveDays);

        const reasons = [];
        if (avgCurrent < 40) reasons.push('Средний балл ниже 40%');
        if (trendDelta <= -15) reasons.push('Падение более чем на 15%');
        if (inactiveDays > 5) reasons.push(`Неактивен ${inactiveDays} дн.`);

        const riskScore = (
            (avgCurrent < 40 ? (40 - avgCurrent) * 2 + 50 : 0)
            + (trendDelta <= -15 ? Math.abs(trendDelta) * 2 : 0)
            + (inactiveDays > 5 ? Math.min(80, inactiveDays * 1.5) : 0)
        );

        return {
            id: student.id,
            first_name: student.first_name,
            last_name: student.last_name,
            student_name: student.student_name,
            class_id: student.class_id,
            class_name: student.class_name,
            avg_score: Number(avgCurrent.toFixed(2)),
            prev_avg_score: Number(avgPrevious.toFixed(2)),
            trend_delta: Number(trendDelta.toFixed(2)),
            completed_tests: completedTests,
            assigned_tests: assignedTests,
            best_subject: bestSubject,
            weak_subject: weakSubject,
            last_activity_at: student.last_activity_at ? student.last_activity_at.toISOString() : null,
            inactive_days: inactiveDays,
            status,
            reasons,
            risk_score: Number(riskScore.toFixed(2)),
            current_attempts_count: student.current_attempts.length
        };
    });

    return { students };
}

// All routes require teacher role only
router.use(authenticate);
router.use(authorize('teacher'));
router.use(teacherAdvancedResponseCacheMiddleware);

const questionUploadsDir = path.join(__dirname, '..', '..', 'public', 'uploads', 'questions');
if (!fs.existsSync(questionUploadsDir)) {
    fs.mkdirSync(questionUploadsDir, { recursive: true });
}

const ALLOWED_QUESTION_IMAGE_TYPES = new Map([
    ['image/png', '.png'],
    ['image/jpeg', '.jpg'],
    ['image/webp', '.webp'],
    ['image/gif', '.gif']
]);

const questionImageUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, questionUploadsDir),
        filename: (req, file, cb) => {
            const ext = ALLOWED_QUESTION_IMAGE_TYPES.get(String(file.mimetype || '').toLowerCase()) || '.png';
            cb(null, `question_${Date.now()}_${Math.round(Math.random() * 1e9)}${ext}`);
        }
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const mimeType = String(file.mimetype || '').toLowerCase();
        if (!ALLOWED_QUESTION_IMAGE_TYPES.has(mimeType)) {
            return cb(new Error('Only PNG, JPG, WEBP, GIF images are allowed'));
        }
        cb(null, true);
    }
});

/**
 * POST /api/teacher/upload/question-image
 * Upload image for image-based question
 */
router.post('/upload/question-image', questionImageUpload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'No image uploaded'
            });
        }

        res.status(201).json({
            message: 'Image uploaded successfully',
            url: `/uploads/questions/${req.file.filename}`
        });
    } catch (error) {
        console.error('Question image upload error:', error);
        res.status(400).json({
            error: 'upload_error',
            message: error.message || 'Failed to upload image'
        });
    }
});

/**
 * ========================================
 * TESTS MANAGEMENT
 * ========================================
 */

/**
 * GET /api/teacher/tests
 * Get all tests created by teacher
 */
router.get('/tests', async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', subject = 'all', status = 'all' } = req.query;
        const offset = (page - 1) * limit;
        const teacherId = req.user.id;
        const schoolId = req.user.school_id;

        // Build WHERE clause
        let whereClause = 'WHERE t.teacher_id = $1 AND t.school_id = $2';
        const params = [teacherId, schoolId];
        let paramCount = 3;

        if (search) {
            params.push(`%${search}%`);
            whereClause += ` AND (t.title ILIKE $${paramCount} OR t.description ILIKE $${paramCount})`;
            paramCount++;
        }

        if (subject !== 'all') {
            params.push(subject);
            whereClause += ` AND t.subject_id = $${paramCount}`;
            paramCount++;
        }

        if (status !== 'all') {
            const isPublished = status === 'active';
            params.push(isPublished);
            whereClause += ` AND t.is_published = $${paramCount}`;
            paramCount++;
        }

        // Get total count
        const countResult = await query(
            `SELECT COUNT(*) FROM tests t ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0].count);

        // Get tests with subject name and stats
        params.push(limit, offset);
        const result = await query(
            `SELECT
                t.id, t.title, t.description, t.subject_id, t.duration_minutes,
                t.passing_score, t.max_attempts, t.is_published as is_active, t.created_at, t.updated_at,
                s.name as subject_name, s.color as subject_color,
                (SELECT COUNT(*) FROM test_questions WHERE test_id = t.id) as question_count,
                (SELECT COUNT(*) FROM test_attempts WHERE test_id = t.id) as attempt_count,
                (SELECT COUNT(*) FROM test_assignments WHERE test_id = t.id) as assignment_count
             FROM tests t
             LEFT JOIN subjects s ON t.subject_id = s.id
             ${whereClause}
             ORDER BY t.created_at DESC
             LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
            params
        );

        res.json({
            tests: result.rows,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Get tests error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch tests'
        });
    }
});

/**
 * GET /api/teacher/dashboard/overview
 * Get teacher dashboard overview analytics
 */
router.get('/dashboard/overview', async (req, res) => {
    try {
        const teacherId = req.user.id;
        const schoolId = req.user.school_id;
        const attempt = await getAttemptOverviewExpressions();

        const testsResult = await query(
            'SELECT COUNT(*) as total FROM tests WHERE teacher_id = $1 AND school_id = $2',
            [teacherId, schoolId]
        );

        const assignmentsResult = await query(
            `SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE ta.is_active = true AND ta.end_date > CURRENT_TIMESTAMP) as active
             FROM test_assignments ta
             JOIN classes c ON c.id = ta.class_id
             WHERE ta.assigned_by = $1
               AND c.school_id = $2`,
            [teacherId, schoolId]
        );

        const studentsResult = await query(
            `SELECT COUNT(DISTINCT cs.student_id) as total
             FROM classes c
             LEFT JOIN teacher_class_subjects tcs ON c.id = tcs.class_id
             LEFT JOIN class_students cs ON cs.class_id = c.id AND cs.is_active = true
             WHERE c.school_id = $1
               AND c.is_active = true
               AND (c.homeroom_teacher_id = $2 OR tcs.teacher_id = $2)`,
            [schoolId, teacherId]
        );

        const avgScoreResult = await query(
            `SELECT AVG(${attempt.score}) as avg_percentage
             FROM test_assignments ta
             JOIN classes c ON c.id = ta.class_id
             LEFT JOIN test_attempts att ON att.assignment_id = ta.id
             WHERE ta.assigned_by = $1
               AND c.school_id = $2
               AND ${attempt.completedFilter}`,
            [teacherId, schoolId]
        );

        const recentAssignments = await query(
            `SELECT
                ta.id,
                ta.end_date,
                t.title as test_title,
                c.name as class_name,
                COUNT(att.id) FILTER (WHERE ${attempt.completedFilter}) as completed_attempts,
                AVG(${attempt.score}) FILTER (WHERE ${attempt.completedFilter}) as avg_percentage
             FROM test_assignments ta
             JOIN tests t ON ta.test_id = t.id
             JOIN classes c ON ta.class_id = c.id
             LEFT JOIN test_attempts att ON att.assignment_id = ta.id
             WHERE ta.assigned_by = $1
               AND c.school_id = $2
             GROUP BY ta.id, t.title, c.name
             ORDER BY ta.created_at DESC
             LIMIT 5`,
            [teacherId, schoolId]
        );

        const recentAttempts = await query(
            `SELECT
                att.id,
                ${attempt.completedAt} as completed_at,
                t.title as test_title,
                c.name as class_name,
                CONCAT(u.first_name, ' ', u.last_name) as student_name,
                ${attempt.score}::float as percentage
             FROM test_attempts att
             JOIN test_assignments ta ON ta.id = att.assignment_id
             JOIN tests t ON t.id = ta.test_id
             JOIN classes c ON c.id = ta.class_id
             JOIN users u ON u.id = att.student_id
             WHERE ta.assigned_by = $1
               AND c.school_id = $2
               AND ${attempt.completedFilter}
             ORDER BY ${attempt.completedAt} DESC
             LIMIT 5`,
            [teacherId, schoolId]
        );

        const activity = [];
        recentAssignments.rows.forEach(row => {
            activity.push({
                type: 'assignment',
                title: row.test_title,
                subtitle: row.class_name,
                percentage: row.avg_percentage,
                date: row.end_date
            });
        });
        recentAttempts.rows.forEach(row => {
            activity.push({
                type: 'attempt',
                title: row.test_title,
                subtitle: `${row.student_name} · ${row.class_name}`,
                percentage: row.percentage,
                date: row.completed_at
            });
        });
        activity.sort((a, b) => new Date(b.date) - new Date(a.date));

        res.json({
            stats: {
                tests_created: parseInt(testsResult.rows[0].total || 0),
                assignments_total: parseInt(assignmentsResult.rows[0].total || 0),
                active_assignments: parseInt(assignmentsResult.rows[0].active || 0),
                student_count: parseInt(studentsResult.rows[0].total || 0),
                avg_percentage: avgScoreResult.rows[0]?.avg_percentage
            },
            recent_assignments: recentAssignments.rows,
            recent_activity: activity.slice(0, 8)
        });
    } catch (error) {
        console.error('Teacher dashboard overview error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch dashboard overview'
        });
    }
});

/**
 * GET /api/teacher/dashboard/teacher-overview
 * Main teacher overview payload
 */
router.get('/dashboard/teacher-overview', async (req, res) => {
    try {
        const teacherId = req.user.id;
        const schoolId = req.user.school_id;
        const payload = await buildTeacherOverviewPayload(teacherId, schoolId, req.user);
        res.json(payload);
    } catch (error) {
        console.error('Teacher overview payload error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch teacher overview'
        });
    }
});

/**
 * GET /api/teacher/dashboard/teacher-overview/performance
 * Teacher overview performance chart (last 4 weeks)
 */
router.get('/dashboard/teacher-overview/performance', async (req, res) => {
    try {
        const teacherId = req.user.id;
        const schoolId = req.user.school_id;
        const classId = String(req.query.class_id || 'all').trim();
        const payload = await buildTeacherPerformanceChartPayload(teacherId, schoolId, classId);
        res.json(payload);
    } catch (error) {
        console.error('Teacher overview performance chart error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch performance chart'
        });
    }
});

/**
 * GET /api/teacher/dashboard/teacher-overview/report.pdf
 * Download summary PDF for teacher classes
 */
router.get('/dashboard/teacher-overview/report.pdf', async (req, res) => {
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

        const teacherId = req.user.id;
        const schoolId = req.user.school_id;
        const payload = await buildTeacherOverviewPayload(teacherId, schoolId, req.user);
        const now = new Date();
        const filename = `teacher_classes_summary_${now.toISOString().slice(0, 10)}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        const doc = new PDFDocument({ margin: 44, size: 'A4' });
        doc.pipe(res);

        doc.fontSize(18).text('ZEDLY: Обзор учителя');
        doc.moveDown(0.3);
        doc.fontSize(10).fillColor('#4b5563').text(`Дата формирования: ${now.toLocaleString('ru-RU')}`);
        doc.fillColor('#111827');
        doc.moveDown(0.8);

        doc.fontSize(13).text('Краткая сводка', { underline: true });
        doc.fontSize(10)
            .text(`Классов: ${Number(payload.greeting_meta?.classes_count || 0)}`)
            .text(`Тестов с дедлайном на этой неделе: ${Number(payload.greeting_meta?.tests_deadline_this_week || 0)}`)
            .text(`Активных тестов: ${Number(payload.mini_stats?.active_tests_count || 0)}`)
            .text(`Средний балл за 30 дней: ${Number(payload.mini_stats?.avg_score_30d || 0).toFixed(1)}%`)
            .text(`Всего создано тестов: ${Number(payload.mini_stats?.tests_created_total || 0)}`);
        doc.moveDown(0.8);

        doc.fontSize(13).text('Требуют внимания', { underline: true });
        if (!payload.alerts?.show) {
            doc.fontSize(10).text('Алертов нет.');
        } else {
            doc.fontSize(10)
                .text(`Срочные тесты (< 2 дней и < 50% прогресса): ${Number(payload.alerts?.urgent_tests?.length || 0)}`)
                .text(`Классы ниже 50% (2 недели): ${Number(payload.alerts?.low_score_classes?.length || 0)}`)
                .text(`Неактивные ученики (> 5 дней): ${Number(payload.alerts?.inactive_students_count || 0)}`)
                .text(`Классы с улучшением > 10%: ${Number(payload.alerts?.improved_classes?.length || 0)}`);
        }
        doc.moveDown(0.8);

        doc.fontSize(13).text('Активные тесты (топ-10)', { underline: true });
        if (!payload.active_tests?.length) {
            doc.fontSize(10).text('Нет активных тестов.');
        } else {
            payload.active_tests.slice(0, 10).forEach((item, index) => {
                doc.fontSize(10).text(
                    `${index + 1}. ${item.test_title} · ${item.class_name} · ` +
                    `${item.completed_students}/${item.total_students} · ` +
                    `${Number(item.avg_score || 0).toFixed(1)}% · ${item.days_left} дн.`
                );
            });
        }
        doc.moveDown(0.8);

        doc.fontSize(13).text('Рейтинг классов (топ-10)', { underline: true });
        if (!payload.class_ranking?.length) {
            doc.fontSize(10).text('Нет данных по классам.');
        } else {
            payload.class_ranking.slice(0, 10).forEach((item, index) => {
                const trendIcon = item.trend === 'up' ? '↑' : (item.trend === 'down' ? '↓' : '→');
                doc.fontSize(10).text(
                    `${index + 1}. ${item.class_name}: ${Number(item.avg_score || 0).toFixed(1)}% ` +
                    `(${trendIcon} ${Number(item.trend_delta || 0).toFixed(1)}%)`
                );
            });
        }
        doc.moveDown(0.8);

        doc.fontSize(13).text('Ученики в зоне риска (топ-10)', { underline: true });
        if (!payload.risk_students?.length) {
            doc.fontSize(10).text('Учеников в зоне риска не найдено.');
        } else {
            payload.risk_students.slice(0, 10).forEach((item, index) => {
                const reason = Array.isArray(item.reasons) ? item.reasons[0] : '';
                const inactivePart = item.inactive_days === null || item.inactive_days === undefined
                    ? 'нет данных'
                    : `${item.inactive_days} дн.`;
                doc.fontSize(10).text(
                    `${index + 1}. ${item.student_name} (${item.class_name}) · ` +
                    `${Number(item.avg_score || 0).toFixed(1)}% · ${inactivePart} · ${reason}`
                );
            });
        }

        doc.end();
        return undefined;
    } catch (error) {
        console.error('Teacher overview PDF report error:', error);
        if (!res.headersSent) {
            return res.status(500).json({
                error: 'server_error',
                message: 'Failed to generate teacher report PDF'
            });
        }
        return undefined;
    }
});

/**
 * ========================================
 * TEACHER ADVANCED ANALYTICS
 * ========================================
 */

router.get('/advanced/filter-options', async (req, res) => {
    try {
        const scope = buildTeacherAdvancedScope(req);
        if (!scope) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Failed to resolve teacher scope'
            });
        }

        const classParams = [scope.schoolId, scope.teacherId];
        const classRef = scope.classId ? `$${classParams.push(scope.classId)}` : null;
        const classesResult = await query(
            `${getTeacherAdvancedClassScopeCte('$1', '$2', classRef)}
             SELECT
                id,
                name,
                grade_level
             FROM teacher_classes_scope
             ORDER BY grade_level NULLS LAST, name ASC
            `,
            classParams
        );

        const { display: subjectNameExpr } = await getTeacherSubjectNameExpressions('s');
        const subjectParams = [scope.schoolId, scope.teacherId];
        const subjectClassRef = scope.classId ? `$${subjectParams.push(scope.classId)}` : null;
        const subjectsResult = await query(
            `${getTeacherAdvancedClassScopeCte('$1', '$2', subjectClassRef)}
             SELECT DISTINCT
                s.id,
                ${subjectNameExpr} as name
             FROM teacher_classes_scope tcs
             JOIN teacher_class_subjects tcs_map
                ON tcs_map.class_id = tcs.id
               AND tcs_map.teacher_id = $2
             JOIN subjects s ON s.id = tcs_map.subject_id
             WHERE s.school_id = $1
               AND s.is_active = true
             ORDER BY name ASC
            `,
            subjectParams
        );

        return res.json({
            period_options: [
                { key: 'this_week', label: 'Эта неделя' },
                { key: 'this_month', label: 'Этот месяц' },
                { key: 'current_quarter', label: 'Текущая четверть' },
                { key: 'academic_year', label: 'Учебный год' },
                { key: 'custom', label: 'Произвольный диапазон' }
            ],
            classes: classesResult.rows,
            subjects: subjectsResult.rows
        });
    } catch (error) {
        console.error('Teacher advanced filter options error:', error);
        return res.status(500).json({
            error: 'server_error',
            message: 'Failed to load advanced filter options'
        });
    }
});

router.get('/advanced/overview', async (req, res) => {
    try {
        const scope = buildTeacherAdvancedScope(req);
        if (!scope) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Failed to resolve teacher scope'
            });
        }

        const classParams = [scope.schoolId, scope.teacherId];
        const classRef = scope.classId ? `$${classParams.push(scope.classId)}` : null;
        const studentsResult = await query(
            `${getTeacherAdvancedClassScopeCte('$1', '$2', classRef)}
             SELECT COUNT(DISTINCT cs.student_id)::int as total_students
             FROM teacher_classes_scope tcs
             JOIN class_students cs ON cs.class_id = tcs.id AND cs.is_active = true
            `,
            classParams
        );

        const attempt = await getAttemptOverviewExpressions('att');
        const completedDateExpr = attempt.completedAt === 'NULL' ? 'att.started_at' : attempt.completedAt;
        const attemptDateExpr = attempt.completedAt === 'NULL'
            ? 'att.started_at'
            : `COALESCE(${attempt.completedAt}, att.started_at)`;

        const metricParams = [scope.schoolId, scope.teacherId];
        const metricClassRef = scope.classId ? `$${metricParams.push(scope.classId)}` : null;
        const startRef = `$${metricParams.push(scope.dateRange.startDate)}`;
        const endRef = `$${metricParams.push(scope.dateRange.endDateExclusive)}`;
        const subjectFilter = scope.subjectId
            ? `AND t.subject_id = $${metricParams.push(scope.subjectId)}`
            : '';

        const metricsResult = await query(
            `${getTeacherAdvancedClassScopeCte('$1', '$2', metricClassRef)}
             SELECT
                COUNT(att.id) FILTER (
                    WHERE ${attempt.completedFilter}
                      AND ${completedDateExpr} >= ${startRef}
                      AND ${completedDateExpr} < ${endRef}
                )::int as total_tests_completed,
                COUNT(att.id) FILTER (
                    WHERE ${attemptDateExpr} >= ${startRef}
                      AND ${attemptDateExpr} < ${endRef}
                )::int as total_attempts,
                AVG(${attempt.score}) FILTER (
                    WHERE ${attempt.completedFilter}
                      AND ${completedDateExpr} >= ${startRef}
                      AND ${completedDateExpr} < ${endRef}
                )::float as average_score
             FROM test_assignments ta
             JOIN tests t ON t.id = ta.test_id
             JOIN teacher_classes_scope tcs ON tcs.id = ta.class_id
             LEFT JOIN test_attempts att ON att.assignment_id = ta.id
             WHERE ta.assigned_by = $2
               AND t.teacher_id = $2
               ${subjectFilter}
            `,
            metricParams
        );

        return res.json({
            period_key: scope.dateRange.periodKey,
            date_from: scope.dateRange.startDate.toISOString(),
            date_to_exclusive: scope.dateRange.endDateExclusive.toISOString(),
            metrics: {
                total_students: Number(studentsResult.rows[0]?.total_students || 0),
                average_score: trimToFixedNumber(metricsResult.rows[0]?.average_score, 2),
                total_tests_completed: Number(metricsResult.rows[0]?.total_tests_completed || 0),
                total_attempts: Number(metricsResult.rows[0]?.total_attempts || 0)
            }
        });
    } catch (error) {
        console.error('Teacher advanced overview error:', error);
        return res.status(500).json({
            error: 'server_error',
            message: 'Failed to load advanced overview'
        });
    }
});

router.get('/advanced/heatmap', async (req, res) => {
    try {
        const scope = buildTeacherAdvancedScope(req);
        if (!scope) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Failed to resolve teacher scope'
            });
        }

        const dimension = String(req.query.dimension || 'subjects').trim().toLowerCase() === 'classes'
            ? 'classes'
            : 'subjects';

        const attempt = await getAttemptOverviewExpressions('att');
        const completedDateExpr = attempt.completedAt === 'NULL' ? 'att.started_at' : attempt.completedAt;
        const { display: subjectNameExpr } = await getTeacherSubjectNameExpressions('s');

        const params = [scope.schoolId, scope.teacherId];
        const classRef = scope.classId ? `$${params.push(scope.classId)}` : null;
        const startRef = `$${params.push(scope.dateRange.startDate)}`;
        const endRef = `$${params.push(scope.dateRange.endDateExclusive)}`;

        let entityIdExpr = 's.id';
        let entityNameExpr = `${subjectNameExpr}`;
        let groupByExpr = `s.id, ${subjectNameExpr}`;
        let subjectJoin = 'JOIN subjects s ON s.id = t.subject_id';
        let scopeSubjectFilter = scope.subjectId
            ? `AND t.subject_id = $${params.push(scope.subjectId)}`
            : '';

        if (dimension === 'classes') {
            entityIdExpr = 'tcs.id';
            entityNameExpr = 'tcs.name';
            groupByExpr = 'tcs.id, tcs.name';
            subjectJoin = '';
            scopeSubjectFilter = scope.subjectId
                ? `AND t.subject_id = $${params.push(scope.subjectId)}`
                : '';
        }

        const heatmapResult = await query(
            `${getTeacherAdvancedClassScopeCte('$1', '$2', classRef)}
             SELECT
                ${entityIdExpr} as entity_id,
                ${entityNameExpr} as entity_name,
                DATE_TRUNC('week', ${completedDateExpr})::date as week_start,
                AVG(${attempt.score})::float as avg_score,
                COUNT(att.id)::int as attempts
             FROM test_attempts att
             JOIN test_assignments ta ON ta.id = att.assignment_id
             JOIN tests t ON t.id = ta.test_id
             JOIN teacher_classes_scope tcs ON tcs.id = ta.class_id
             ${subjectJoin}
             WHERE ta.assigned_by = $2
               AND t.teacher_id = $2
               AND ${attempt.completedFilter}
               AND ${completedDateExpr} >= ${startRef}
               AND ${completedDateExpr} < ${endRef}
               ${scopeSubjectFilter}
             GROUP BY ${groupByExpr}, DATE_TRUNC('week', ${completedDateExpr})
             ORDER BY entity_name ASC, week_start ASC
            `,
            params
        );

        const weeks = getWeeksBetween(scope.dateRange.startDate, scope.dateRange.endDateExclusive)
            .map((weekStart) => weekStart.toISOString().slice(0, 10));

        const entities = [];
        const entitySet = new Set();
        heatmapResult.rows.forEach((row) => {
            const key = String(row.entity_id);
            if (!entitySet.has(key)) {
                entitySet.add(key);
                entities.push({
                    id: row.entity_id,
                    name: row.entity_name || '—'
                });
            }
        });

        return res.json({
            dimension,
            weeks,
            entities,
            heatmap: heatmapResult.rows.map((row) => ({
                entity_id: row.entity_id,
                entity_name: row.entity_name || '—',
                week_start: row.week_start,
                avg_score: trimToFixedNumber(row.avg_score, 2),
                attempts: Number(row.attempts || 0)
            }))
        });
    } catch (error) {
        console.error('Teacher advanced heatmap error:', error);
        return res.status(500).json({
            error: 'server_error',
            message: 'Failed to load heatmap data'
        });
    }
});

router.get('/advanced/heatmap/cell-students', async (req, res) => {
    try {
        const scope = buildTeacherAdvancedScope(req);
        if (!scope) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Failed to resolve teacher scope'
            });
        }

        const dimension = String(req.query.dimension || 'subjects').trim().toLowerCase() === 'classes'
            ? 'classes'
            : 'subjects';
        const entityId = normalizeAdvancedFilterValue(req.query.entity_id);
        const weekStartRaw = parseAdvancedDateOnly(req.query.week_start);
        if (!entityId || !weekStartRaw) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'entity_id and week_start are required'
            });
        }

        const weekStart = startOfWeekMonday(weekStartRaw);
        const weekEnd = addDays(weekStart, 7);

        const attempt = await getAttemptOverviewExpressions('att');
        const completedDateExpr = attempt.completedAt === 'NULL' ? 'att.started_at' : attempt.completedAt;

        const params = [scope.schoolId, scope.teacherId];
        const classRef = scope.classId ? `$${params.push(scope.classId)}` : null;
        const weekStartRef = `$${params.push(weekStart)}`;
        const weekEndRef = `$${params.push(weekEnd)}`;
        const entityRef = `$${params.push(entityId)}`;

        const dimensionFilter = dimension === 'classes'
            ? `AND ta.class_id = ${entityRef}`
            : `AND t.subject_id = ${entityRef}`;
        const scopeSubjectFilter = (scope.subjectId && dimension === 'classes')
            ? `AND t.subject_id = $${params.push(scope.subjectId)}`
            : '';

        const studentsResult = await query(
            `${getTeacherAdvancedClassScopeCte('$1', '$2', classRef)}
             SELECT
                u.id,
                u.first_name,
                u.last_name,
                c.id as class_id,
                c.name as class_name,
                AVG(${attempt.score})::float as avg_score,
                COUNT(att.id)::int as attempts
             FROM test_attempts att
             JOIN test_assignments ta ON ta.id = att.assignment_id
             JOIN tests t ON t.id = ta.test_id
             JOIN teacher_classes_scope tcs ON tcs.id = ta.class_id
             JOIN users u ON u.id = att.student_id
             JOIN classes c ON c.id = ta.class_id
             WHERE ta.assigned_by = $2
               AND t.teacher_id = $2
               AND ${attempt.completedFilter}
               AND ${completedDateExpr} >= ${weekStartRef}
               AND ${completedDateExpr} < ${weekEndRef}
               ${dimensionFilter}
               ${scopeSubjectFilter}
             GROUP BY u.id, u.first_name, u.last_name, c.id, c.name
             ORDER BY avg_score DESC, u.last_name ASC, u.first_name ASC
            `,
            params
        );

        return res.json({
            dimension,
            entity_id: entityId,
            week_start: weekStart.toISOString(),
            students: studentsResult.rows.map((row) => ({
                id: row.id,
                first_name: row.first_name,
                last_name: row.last_name,
                class_id: row.class_id,
                class_name: row.class_name || '—',
                avg_score: trimToFixedNumber(row.avg_score, 2),
                attempts: Number(row.attempts || 0)
            }))
        });
    } catch (error) {
        console.error('Teacher advanced heatmap cell students error:', error);
        return res.status(500).json({
            error: 'server_error',
            message: 'Failed to load students for heatmap cell'
        });
    }
});

router.get('/advanced/students', async (req, res) => {
    try {
        const scope = buildTeacherAdvancedScope(req);
        if (!scope) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Failed to resolve teacher scope'
            });
        }

        const statusFilter = String(req.query.status || 'all').trim().toLowerCase();
        const dataset = await loadTeacherAdvancedStudentsDataset(scope);
        const rows = dataset.students
            .filter((item) => {
                if (statusFilter === 'risk') return item.status === 'risk';
                if (statusFilter === 'normal') return item.status === 'normal';
                if (statusFilter === 'help') return item.status === 'help';
                return true;
            })
            .sort((a, b) => a.student_name.localeCompare(b.student_name, 'ru'));

        return res.json({
            students: rows
        });
    } catch (error) {
        console.error('Teacher advanced students table error:', error);
        return res.status(500).json({
            error: 'server_error',
            message: 'Failed to load students analytics'
        });
    }
});

router.get('/advanced/students/:id/details', async (req, res) => {
    try {
        const scope = buildTeacherAdvancedScope(req);
        if (!scope) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Failed to resolve teacher scope'
            });
        }

        const studentId = String(req.params.id || '').trim();
        if (!studentId) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Student id is required'
            });
        }

        const attempt = await getAttemptOverviewExpressions('att');
        const completedDateExpr = attempt.completedAt === 'NULL' ? 'att.started_at' : attempt.completedAt;
        const { display: subjectNameExpr } = await getTeacherSubjectNameExpressions('s');

        const accessParams = [scope.schoolId, scope.teacherId];
        const accessClassRef = scope.classId ? `$${accessParams.push(scope.classId)}` : null;
        const accessStudentRef = `$${accessParams.push(studentId)}`;
        const studentAccessResult = await query(
            `${getTeacherAdvancedClassScopeCte('$1', '$2', accessClassRef)}
             SELECT
                u.id as student_id,
                u.first_name,
                u.last_name,
                tcs.id as class_id,
                tcs.name as class_name
             FROM teacher_classes_scope tcs
             JOIN class_students cs ON cs.class_id = tcs.id AND cs.is_active = true
             JOIN users u ON u.id = cs.student_id
             WHERE u.id = ${accessStudentRef}
               AND u.school_id = $1
               AND u.role = 'student'
             LIMIT 1
            `,
            accessParams
        );

        if (!studentAccessResult.rows.length) {
            return res.status(404).json({
                error: 'not_found',
                message: 'Student not found in your classes'
            });
        }

        const studentInfo = studentAccessResult.rows[0];

        const attemptsParams = [scope.schoolId, scope.teacherId];
        const attemptsClassRef = scope.classId ? `$${attemptsParams.push(scope.classId)}` : null;
        const attemptsStudentRef = `$${attemptsParams.push(studentId)}`;
        const attemptsStartRef = `$${attemptsParams.push(scope.dateRange.startDate)}`;
        const attemptsEndRef = `$${attemptsParams.push(scope.dateRange.endDateExclusive)}`;
        const attemptsSubjectFilter = scope.subjectId
            ? `AND t.subject_id = $${attemptsParams.push(scope.subjectId)}`
            : '';

        const attemptsResult = await query(
            `${getTeacherAdvancedClassScopeCte('$1', '$2', attemptsClassRef)}
             SELECT
                att.id as attempt_id,
                att.assignment_id,
                t.id as test_id,
                t.title as test_title,
                t.subject_id,
                ${subjectNameExpr} as subject_name,
                ta.class_id,
                tcs.name as class_name,
                ${attempt.score}::float as score,
                ${completedDateExpr} as completed_at,
                ${attempt.timeSpent} as time_spent_seconds,
                att.answers
             FROM test_attempts att
             JOIN test_assignments ta ON ta.id = att.assignment_id
             JOIN tests t ON t.id = ta.test_id
             JOIN teacher_classes_scope tcs ON tcs.id = ta.class_id
             LEFT JOIN subjects s ON s.id = t.subject_id
             WHERE ta.assigned_by = $2
               AND t.teacher_id = $2
               AND att.student_id = ${attemptsStudentRef}
               AND ${attempt.completedFilter}
               AND ${completedDateExpr} >= ${attemptsStartRef}
               AND ${completedDateExpr} < ${attemptsEndRef}
               ${attemptsSubjectFilter}
             ORDER BY ${completedDateExpr} ASC
            `,
            attemptsParams
        );

        const attempts = attemptsResult.rows.map((row) => ({
            attempt_id: row.attempt_id,
            assignment_id: row.assignment_id,
            test_id: row.test_id,
            test_title: row.test_title || '—',
            subject_id: row.subject_id,
            subject_name: formatSubjectSafe(row.subject_name),
            class_id: row.class_id,
            class_name: row.class_name || '—',
            score: trimToFixedNumber(row.score, 2),
            completed_at: row.completed_at,
            time_spent_seconds: toNumber(row.time_spent_seconds, 0),
            answers: row.answers
        }));

        const weekStarts = getWeeksBetween(scope.dateRange.startDate, scope.dateRange.endDateExclusive);
        const weekMap = new Map(weekStarts.map((weekStart) => [weekStart.toISOString().slice(0, 10), []]));
        attempts.forEach((item) => {
            const weekKey = getWeekKey(item.completed_at);
            if (!weekMap.has(weekKey)) return;
            weekMap.get(weekKey).push(item.score);
        });
        const progress = weekStarts.map((weekStart) => {
            const key = weekStart.toISOString().slice(0, 10);
            const values = weekMap.get(key) || [];
            const avg = values.length
                ? values.reduce((sum, value) => sum + value, 0) / values.length
                : null;
            return {
                week_start: weekStart.toISOString(),
                avg_score: avg === null ? null : Number(avg.toFixed(2))
            };
        });

        const classAvgParams = [scope.schoolId, scope.teacherId];
        const classAvgClassRef = scope.classId ? `$${classAvgParams.push(scope.classId)}` : null;
        const classAvgStudentClassRef = `$${classAvgParams.push(studentInfo.class_id)}`;
        const classAvgStartRef = `$${classAvgParams.push(scope.dateRange.startDate)}`;
        const classAvgEndRef = `$${classAvgParams.push(scope.dateRange.endDateExclusive)}`;
        const classAvgSubjectFilter = scope.subjectId
            ? `AND t.subject_id = $${classAvgParams.push(scope.subjectId)}`
            : '';

        const classAvgResult = await query(
            `${getTeacherAdvancedClassScopeCte('$1', '$2', classAvgClassRef)}
             SELECT AVG(${attempt.score})::float as class_avg_score
             FROM test_attempts att
             JOIN test_assignments ta ON ta.id = att.assignment_id
             JOIN tests t ON t.id = ta.test_id
             JOIN teacher_classes_scope tcs ON tcs.id = ta.class_id
             WHERE ta.assigned_by = $2
               AND t.teacher_id = $2
               AND ta.class_id = ${classAvgStudentClassRef}
               AND ${attempt.completedFilter}
               AND ${completedDateExpr} >= ${classAvgStartRef}
               AND ${completedDateExpr} < ${classAvgEndRef}
               ${classAvgSubjectFilter}
            `,
            classAvgParams
        );

        const studentAverage = attempts.length
            ? attempts.reduce((sum, item) => sum + item.score, 0) / attempts.length
            : 0;
        const classAverage = trimToFixedNumber(classAvgResult.rows[0]?.class_avg_score, 2);

        return res.json({
            student: {
                id: studentInfo.student_id,
                first_name: studentInfo.first_name,
                last_name: studentInfo.last_name,
                class_id: studentInfo.class_id,
                class_name: studentInfo.class_name || '—'
            },
            progress,
            test_results: attempts.map((item) => ({
                attempt_id: item.attempt_id,
                test_id: item.test_id,
                test_title: item.test_title,
                subject_name: item.subject_name,
                class_name: item.class_name,
                score: item.score,
                completed_at: item.completed_at,
                time_spent_seconds: item.time_spent_seconds
            })),
            weak_topics: buildWeakTopicsFromAttempts(attempts, 3),
            class_comparison: {
                student_avg_score: Number(studentAverage.toFixed(2)),
                class_avg_score: classAverage,
                delta: Number((studentAverage - classAverage).toFixed(2))
            }
        });
    } catch (error) {
        console.error('Teacher advanced student details error:', error);
        return res.status(500).json({
            error: 'server_error',
            message: 'Failed to load student details'
        });
    }
});

async function buildTeacherAdvancedTestDetailsPayload(scope, testId) {
    const attempt = await getAttemptOverviewExpressions('att');
    const completedDateExpr = attempt.completedAt === 'NULL' ? 'att.started_at' : attempt.completedAt;
    const { display: subjectNameExpr } = await getTeacherSubjectNameExpressions('s');

    const testParams = [scope.schoolId, scope.teacherId, testId];
    const testResult = await query(
        `SELECT
            t.id,
            t.title,
            t.description,
            t.subject_id,
            ${subjectNameExpr} as subject_name,
            t.created_at
         FROM tests t
         LEFT JOIN subjects s ON s.id = t.subject_id
         WHERE t.id = $3
           AND t.teacher_id = $2
           AND t.school_id = $1
         LIMIT 1`,
        testParams
    );
    if (!testResult.rows.length) {
        return null;
    }

    const testInfo = testResult.rows[0];
    if (scope.subjectId && String(testInfo.subject_id) !== String(scope.subjectId)) {
        return null;
    }

    const assignmentsParams = [scope.schoolId, scope.teacherId, testId];
    const classFilter = scope.classId
        ? `AND ta.class_id = $${assignmentsParams.push(scope.classId)}`
        : '';
    const assignmentsResult = await query(
        `SELECT
            ta.id,
            ta.class_id,
            c.name as class_name,
            ta.start_date,
            ta.end_date,
            ta.is_active
         FROM test_assignments ta
         JOIN classes c ON c.id = ta.class_id
         WHERE ta.test_id = $3
           AND ta.assigned_by = $2
           AND c.school_id = $1
           ${classFilter}
         ORDER BY ta.end_date ASC, c.name ASC`,
        assignmentsParams
    );

    const attemptsParams = [scope.schoolId, scope.teacherId, testId];
    const attemptsClassFilter = scope.classId
        ? `AND ta.class_id = $${attemptsParams.push(scope.classId)}`
        : '';
    const attemptsStartRef = `$${attemptsParams.push(scope.dateRange.startDate)}`;
    const attemptsEndRef = `$${attemptsParams.push(scope.dateRange.endDateExclusive)}`;

    const attemptsResult = await query(
        `SELECT
            att.id as attempt_id,
            att.student_id,
            att.assignment_id,
            ${attempt.score}::float as score,
            ${attempt.timeSpent} as time_spent_seconds,
            ${completedDateExpr} as completed_at,
            att.answers,
            u.first_name,
            u.last_name,
            ta.class_id,
            c.name as class_name
         FROM test_attempts att
         JOIN test_assignments ta ON ta.id = att.assignment_id
         JOIN tests t ON t.id = ta.test_id
         JOIN users u ON u.id = att.student_id
         JOIN classes c ON c.id = ta.class_id
         WHERE t.school_id = $1
           AND t.teacher_id = $2
           AND t.id = $3
           AND ta.assigned_by = $2
           AND ${attempt.completedFilter}
           AND ${completedDateExpr} >= ${attemptsStartRef}
           AND ${completedDateExpr} < ${attemptsEndRef}
           ${attemptsClassFilter}
         ORDER BY ${completedDateExpr} ASC`,
        attemptsParams
    );

    const assignedStudentsParams = [scope.schoolId, scope.teacherId, testId];
    const assignedStudentsClassFilter = scope.classId
        ? `AND ta.class_id = $${assignedStudentsParams.push(scope.classId)}`
        : '';
    const assignedStudentsResult = await query(
        `SELECT
            ta.id as assignment_id,
            ta.end_date,
            ta.class_id,
            c.name as class_name,
            u.id as student_id,
            u.first_name,
            u.last_name
         FROM test_assignments ta
         JOIN classes c ON c.id = ta.class_id
         JOIN class_students cs ON cs.class_id = ta.class_id AND cs.is_active = true
         JOIN users u ON u.id = cs.student_id
         WHERE ta.test_id = $3
           AND ta.assigned_by = $2
           AND c.school_id = $1
           ${assignedStudentsClassFilter}
         ORDER BY c.name ASC, u.last_name ASC, u.first_name ASC`,
        assignedStudentsParams
    );

    const attempts = attemptsResult.rows.map((row) => ({
        attempt_id: row.attempt_id,
        student_id: row.student_id,
        student_name: normalizeStudentName(row),
        assignment_id: row.assignment_id,
        class_id: row.class_id,
        class_name: row.class_name || '—',
        score: trimToFixedNumber(row.score, 2),
        completed_at: row.completed_at,
        time_spent_seconds: toNumber(row.time_spent_seconds, 0),
        answers: row.answers
    }));

    const completedStudentKeys = new Set(
        attempts.map((item) => `${item.assignment_id}:${item.student_id}`)
    );
    const now = new Date();
    const notCompleted = assignedStudentsResult.rows
        .filter((row) => !completedStudentKeys.has(`${row.assignment_id}:${row.student_id}`))
        .map((row) => {
            const deadline = row.end_date ? new Date(row.end_date) : null;
            const daysLeft = deadline && !Number.isNaN(deadline.getTime())
                ? Math.ceil((deadline.getTime() - now.getTime()) / 86400000)
                : null;
            return {
                assignment_id: row.assignment_id,
                student_id: row.student_id,
                first_name: row.first_name || '',
                last_name: row.last_name || '',
                student_name: normalizeStudentName(row),
                class_id: row.class_id,
                class_name: row.class_name || '—',
                end_date: row.end_date,
                days_left: daysLeft
            };
        });

    const scores = attempts.map((item) => item.score);
    const avgScore = scores.length
        ? scores.reduce((sum, value) => sum + value, 0) / scores.length
        : 0;
    const minScore = scores.length ? Math.min(...scores) : 0;
    const maxScore = scores.length ? Math.max(...scores) : 0;
    const avgTimeMinutes = attempts.length
        ? attempts.reduce((sum, item) => sum + toNumber(item.time_spent_seconds, 0), 0) / attempts.length / 60
        : 0;

    const histogram = [0, 0, 0, 0, 0];
    scores.forEach((score) => {
        const bounded = Math.min(100, Math.max(0, score));
        const bucket = bounded >= 100 ? 4 : Math.floor(bounded / 20);
        histogram[Math.max(0, Math.min(4, bucket))] += 1;
    });

    const studentResultMap = new Map();
    attempts.forEach((item) => {
        const key = String(item.student_id);
        if (!studentResultMap.has(key)) {
            studentResultMap.set(key, {
                student_id: item.student_id,
                student_name: item.student_name,
                class_name: item.class_name,
                score: item.score,
                time_spent_seconds: item.time_spent_seconds,
                completed_at: item.completed_at,
                attempts_count: 1
            });
            return;
        }
        const target = studentResultMap.get(key);
        target.attempts_count += 1;
        if (item.score > target.score) {
            target.score = item.score;
        }
        const previousDate = target.completed_at ? new Date(target.completed_at) : null;
        const currentDate = item.completed_at ? new Date(item.completed_at) : null;
        if (currentDate && !Number.isNaN(currentDate.getTime())) {
            if (!previousDate || Number.isNaN(previousDate.getTime()) || currentDate.getTime() > previousDate.getTime()) {
                target.completed_at = item.completed_at;
                target.time_spent_seconds = item.time_spent_seconds;
            }
        }
    });

    const resultsByStudents = Array.from(studentResultMap.values())
        .map((item) => ({
            ...item,
            score: trimToFixedNumber(item.score, 2),
            below_50: toNumber(item.score, 0) < 50
        }))
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.student_name.localeCompare(b.student_name, 'ru');
        });

    const questionAnalysis = buildQuestionAnalysisFromAttempts(attempts);

    return {
        test: {
            id: testInfo.id,
            title: testInfo.title || '—',
            description: testInfo.description || '',
            subject_id: testInfo.subject_id,
            subject_name: formatSubjectSafe(testInfo.subject_name),
            created_at: testInfo.created_at
        },
        assignments: assignmentsResult.rows.map((row) => ({
            id: row.id,
            class_id: row.class_id,
            class_name: row.class_name || '—',
            start_date: row.start_date,
            end_date: row.end_date,
            is_active: Boolean(row.is_active)
        })),
        summary: {
            total_completed: attempts.length,
            avg_score: Number(avgScore.toFixed(2)),
            min_score: Number(minScore.toFixed(2)),
            max_score: Number(maxScore.toFixed(2)),
            avg_time_minutes: Number(avgTimeMinutes.toFixed(2)),
            histogram: {
                '0_20': histogram[0],
                '20_40': histogram[1],
                '40_60': histogram[2],
                '60_80': histogram[3],
                '80_100': histogram[4]
            }
        },
        results_by_students: resultsByStudents,
        question_analysis: questionAnalysis,
        not_completed: notCompleted.sort((a, b) => {
            const left = Number.isFinite(a.days_left) ? a.days_left : Number.MAX_SAFE_INTEGER;
            const right = Number.isFinite(b.days_left) ? b.days_left : Number.MAX_SAFE_INTEGER;
            return left - right;
        })
    };
}

function formatTeacherAdvancedPeriodLabel(dateRange) {
    const key = String(dateRange?.periodKey || 'this_month');
    const labels = {
        this_week: 'Эта неделя',
        this_month: 'Этот месяц',
        current_quarter: 'Текущая четверть',
        academic_year: 'Учебный год',
        custom: 'Произвольный диапазон'
    };
    if (key === 'custom') {
        const start = dateRange?.startDate ? new Date(dateRange.startDate).toLocaleDateString('ru-RU') : '—';
        const endRaw = dateRange?.endDateExclusive ? addDays(dateRange.endDateExclusive, -1) : null;
        const end = endRaw ? new Date(endRaw).toLocaleDateString('ru-RU') : '—';
        return `${labels.custom}: ${start} - ${end}`;
    }
    return labels[key] || key;
}

async function resolveTeacherAdvancedFilterMeta(scope) {
    const result = {
        class_name: 'Все мои классы',
        subject_name: 'Все предметы'
    };

    if (scope.classId) {
        const classResult = await query(
            `${getTeacherAdvancedClassScopeCte('$1', '$2', '$3')}
             SELECT id, name
             FROM teacher_classes_scope
             LIMIT 1`,
            [scope.schoolId, scope.teacherId, scope.classId]
        );
        if (classResult.rows.length) {
            result.class_name = classResult.rows[0].name || result.class_name;
        }
    }

    if (scope.subjectId) {
        const { display: subjectNameExpr } = await getTeacherSubjectNameExpressions('s');
        const subjectResult = await query(
            `${getTeacherAdvancedClassScopeCte('$1', '$2', scope.classId ? '$4' : null)}
             SELECT DISTINCT ${subjectNameExpr} as subject_name
             FROM teacher_classes_scope tcs
             JOIN teacher_class_subjects map
               ON map.class_id = tcs.id
              AND map.teacher_id = $2
             JOIN subjects s ON s.id = map.subject_id
             WHERE s.school_id = $1
               AND s.is_active = true
               AND s.id = $3
             LIMIT 1`,
            scope.classId
                ? [scope.schoolId, scope.teacherId, scope.subjectId, scope.classId]
                : [scope.schoolId, scope.teacherId, scope.subjectId]
        );
        if (subjectResult.rows.length) {
            result.subject_name = formatSubjectSafe(subjectResult.rows[0].subject_name);
        }
    }

    return result;
}

async function loadTeacherAdvancedTestsTable(scope) {
    const attempt = await getAttemptOverviewExpressions('att');
    const completedDateExpr = attempt.completedAt === 'NULL' ? 'att.started_at' : attempt.completedAt;
    const { display: subjectNameExpr } = await getTeacherSubjectNameExpressions('s');

    const params = [scope.schoolId, scope.teacherId];
    const classRef = scope.classId ? `$${params.push(scope.classId)}` : null;
    const startRef = `$${params.push(scope.dateRange.startDate)}`;
    const endRef = `$${params.push(scope.dateRange.endDateExclusive)}`;
    const subjectFilter = scope.subjectId
        ? `AND t.subject_id = $${params.push(scope.subjectId)}`
        : '';

    const testsResult = await query(
        `${getTeacherAdvancedClassScopeCte('$1', '$2', classRef)}
         SELECT
            t.id,
            t.title,
            ${subjectNameExpr} as subject_name,
            t.created_at,
            COUNT(DISTINCT ta_assign.id)::int as assignments_count,
            COUNT(DISTINCT cs.student_id)::int as assigned_students,
            COUNT(DISTINCT att.student_id) FILTER (
                WHERE ${attempt.completedFilter}
                  AND ${completedDateExpr} >= ${startRef}
                  AND ${completedDateExpr} < ${endRef}
            )::int as completed_students,
            AVG(${attempt.score}) FILTER (
                WHERE ${attempt.completedFilter}
                  AND ${completedDateExpr} >= ${startRef}
                  AND ${completedDateExpr} < ${endRef}
            )::float as avg_score,
            AVG(${attempt.timeSpent}) FILTER (
                WHERE ${attempt.completedFilter}
                  AND ${completedDateExpr} >= ${startRef}
                  AND ${completedDateExpr} < ${endRef}
            )::float as avg_time_seconds,
            MAX(ta_assign.end_date) as deadline_at,
            BOOL_OR(ta_assign.is_active = true AND ta_assign.end_date >= NOW()) as has_active,
            COALESCE(string_agg(DISTINCT c_assign.name, ', '), '—') as assigned_classes
         FROM tests t
         LEFT JOIN subjects s ON s.id = t.subject_id
         LEFT JOIN test_assignments ta_assign
            ON ta_assign.test_id = t.id
           AND ta_assign.assigned_by = $2
         LEFT JOIN teacher_classes_scope tcs ON tcs.id = ta_assign.class_id
         LEFT JOIN classes c_assign ON c_assign.id = ta_assign.class_id
         LEFT JOIN class_students cs ON cs.class_id = ta_assign.class_id AND cs.is_active = true
         LEFT JOIN test_attempts att ON att.assignment_id = ta_assign.id
         WHERE t.school_id = $1
           AND t.teacher_id = $2
           ${subjectFilter}
           ${scope.classId ? 'AND (ta_assign.class_id = tcs.id OR ta_assign.id IS NULL)' : ''}
         GROUP BY t.id, t.title, ${subjectNameExpr}, t.created_at
         ORDER BY t.created_at DESC
        `,
        params
    );

    return testsResult.rows.map((row) => {
        let status = 'not_assigned';
        if (Number(row.assignments_count || 0) > 0) {
            status = row.has_active ? 'active' : 'completed';
        }
        return {
            id: row.id,
            title: row.title || '—',
            subject_name: formatSubjectSafe(row.subject_name),
            assigned_classes: row.assigned_classes || '—',
            status,
            completed_students: Number(row.completed_students || 0),
            assigned_students: Number(row.assigned_students || 0),
            avg_score: trimToFixedNumber(row.avg_score, 2),
            avg_time_minutes: trimToFixedNumber(toNumber(row.avg_time_seconds, 0) / 60, 2),
            created_at: row.created_at,
            deadline_at: row.deadline_at,
            assignments_count: Number(row.assignments_count || 0)
        };
    });
}

async function loadTeacherAdvancedQuestionAnalysis(scope) {
    const attempt = await getAttemptOverviewExpressions('att');
    const completedDateExpr = attempt.completedAt === 'NULL' ? 'att.started_at' : attempt.completedAt;

    const params = [scope.schoolId, scope.teacherId];
    const classRef = scope.classId ? `$${params.push(scope.classId)}` : null;
    const startRef = `$${params.push(scope.dateRange.startDate)}`;
    const endRef = `$${params.push(scope.dateRange.endDateExclusive)}`;
    const subjectFilter = scope.subjectId
        ? `AND t.subject_id = $${params.push(scope.subjectId)}`
        : '';

    const attemptsResult = await query(
        `${getTeacherAdvancedClassScopeCte('$1', '$2', classRef)}
         SELECT att.answers
         FROM test_attempts att
         JOIN test_assignments ta ON ta.id = att.assignment_id
         JOIN tests t ON t.id = ta.test_id
         JOIN teacher_classes_scope tcs ON tcs.id = ta.class_id
         WHERE ta.assigned_by = $2
           AND t.teacher_id = $2
           AND ${attempt.completedFilter}
           AND ${completedDateExpr} >= ${startRef}
           AND ${completedDateExpr} < ${endRef}
           ${subjectFilter}
         ORDER BY ${completedDateExpr} ASC
        `,
        params
    );

    return buildQuestionAnalysisFromAttempts(attemptsResult.rows);
}

async function loadTeacherAdvancedClassAverages(scope) {
    const attempt = await getAttemptOverviewExpressions('att');
    const completedDateExpr = attempt.completedAt === 'NULL' ? 'att.started_at' : attempt.completedAt;

    const params = [scope.schoolId, scope.teacherId];
    const classRef = scope.classId ? `$${params.push(scope.classId)}` : null;
    const startRef = `$${params.push(scope.dateRange.startDate)}`;
    const endRef = `$${params.push(scope.dateRange.endDateExclusive)}`;
    const subjectFilter = scope.subjectId
        ? `AND t.subject_id = $${params.push(scope.subjectId)}`
        : '';

    const result = await query(
        `${getTeacherAdvancedClassScopeCte('$1', '$2', classRef)}
         SELECT
            tcs.id as class_id,
            tcs.name as class_name,
            AVG(${attempt.score})::float as avg_score,
            COUNT(att.id)::int as attempts
         FROM test_attempts att
         JOIN test_assignments ta ON ta.id = att.assignment_id
         JOIN tests t ON t.id = ta.test_id
         JOIN teacher_classes_scope tcs ON tcs.id = ta.class_id
         WHERE ta.assigned_by = $2
           AND t.teacher_id = $2
           AND ${attempt.completedFilter}
           AND ${completedDateExpr} >= ${startRef}
           AND ${completedDateExpr} < ${endRef}
           ${subjectFilter}
         GROUP BY tcs.id, tcs.name
         ORDER BY avg_score DESC, class_name ASC
        `,
        params
    );

    return result.rows.map((row) => ({
        class_id: row.class_id,
        class_name: row.class_name || '—',
        avg_score: trimToFixedNumber(row.avg_score, 2),
        attempts: Number(row.attempts || 0)
    }));
}

async function loadTeacherAdvancedRiskZonePayload(scope) {
    const dataset = await loadTeacherAdvancedStudentsDataset(scope);
    const students = Array.isArray(dataset.students) ? dataset.students : [];

    const lowScore = [...students]
        .filter((item) => toNumber(item.avg_score, 0) < 40)
        .sort((a, b) => toNumber(a.avg_score, 0) - toNumber(b.avg_score, 0))
        .slice(0, 100)
        .map((item) => ({
            id: item.id,
            student_name: item.student_name,
            class_name: item.class_name,
            avg_score: trimToFixedNumber(item.avg_score, 2),
            trend_delta: trimToFixedNumber(item.trend_delta, 2)
        }));

    const scoreDrop = [...students]
        .filter((item) => toNumber(item.trend_delta, 0) <= -15)
        .sort((a, b) => toNumber(a.trend_delta, 0) - toNumber(b.trend_delta, 0))
        .slice(0, 100)
        .map((item) => ({
            id: item.id,
            student_name: item.student_name,
            class_name: item.class_name,
            prev_avg_score: trimToFixedNumber(item.prev_avg_score, 2),
            current_avg_score: trimToFixedNumber(item.avg_score, 2),
            delta: trimToFixedNumber(item.trend_delta, 2)
        }));

    const inactive = [...students]
        .filter((item) => toNumber(item.inactive_days, 0) > 7)
        .sort((a, b) => {
            if (toNumber(b.inactive_days, 0) !== toNumber(a.inactive_days, 0)) {
                return toNumber(b.inactive_days, 0) - toNumber(a.inactive_days, 0);
            }
            return (Math.max(0, toNumber(b.assigned_tests, 0) - toNumber(b.completed_tests, 0)))
                - (Math.max(0, toNumber(a.assigned_tests, 0) - toNumber(a.completed_tests, 0)));
        })
        .slice(0, 100)
        .map((item) => ({
            id: item.id,
            student_name: item.student_name,
            class_name: item.class_name,
            last_activity_at: item.last_activity_at,
            inactive_days: Number(item.inactive_days || 0),
            missed_tests: Math.max(0, Number(item.assigned_tests || 0) - Number(item.completed_tests || 0))
        }));

    const topRisk = [...students]
        .filter((item) => item.status === 'risk')
        .sort((a, b) => toNumber(b.risk_score, 0) - toNumber(a.risk_score, 0))
        .slice(0, 20);

    return {
        summary: {
            total_unique: new Set([
                ...lowScore.map((item) => String(item.id)),
                ...scoreDrop.map((item) => String(item.id)),
                ...inactive.map((item) => String(item.id))
            ]).size,
            low_score_count: lowScore.length,
            score_drop_count: scoreDrop.length,
            inactive_count: inactive.length
        },
        blocks: {
            low_score: lowScore,
            score_drop: scoreDrop,
            inactive
        },
        top_risk: topRisk
    };
}

router.get('/advanced/tests', async (req, res) => {
    try {
        const scope = buildTeacherAdvancedScope(req);
        if (!scope) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Failed to resolve teacher scope'
            });
        }

        const rows = await loadTeacherAdvancedTestsTable(scope);

        return res.json({ tests: rows });
    } catch (error) {
        console.error('Teacher advanced tests table error:', error);
        return res.status(500).json({
            error: 'server_error',
            message: 'Failed to load tests analytics'
        });
    }
});

router.get('/advanced/tests/:id/details', async (req, res) => {
    try {
        const scope = buildTeacherAdvancedScope(req);
        if (!scope) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Failed to resolve teacher scope'
            });
        }

        const testId = String(req.params.id || '').trim();
        if (!testId) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Test id is required'
            });
        }

        const payload = await buildTeacherAdvancedTestDetailsPayload(scope, testId);
        if (!payload) {
            return res.status(404).json({
                error: 'not_found',
                message: 'Test not found'
            });
        }

        return res.json(payload);
    } catch (error) {
        console.error('Teacher advanced test details error:', error);
        return res.status(500).json({
            error: 'server_error',
            message: 'Failed to load test details'
        });
    }
});

router.get('/advanced/tests/:id/results.xlsx', async (req, res) => {
    try {
        const scope = buildTeacherAdvancedScope(req);
        if (!scope) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Failed to resolve teacher scope'
            });
        }

        const testId = String(req.params.id || '').trim();
        if (!testId) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Test id is required'
            });
        }

        const payload = await buildTeacherAdvancedTestDetailsPayload(scope, testId);
        if (!payload) {
            return res.status(404).json({
                error: 'not_found',
                message: 'Test not found'
            });
        }

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Results');
        worksheet.columns = [
            { header: 'Ученик', key: 'student_name', width: 28 },
            { header: 'Класс', key: 'class_name', width: 16 },
            { header: 'Балл (%)', key: 'score', width: 12 },
            { header: 'Время (мин)', key: 'time_minutes', width: 14 },
            { header: 'Дата прохождения', key: 'completed_at', width: 20 },
            { header: 'Попыток', key: 'attempts_count', width: 12 }
        ];

        payload.results_by_students.forEach((row) => {
            worksheet.addRow({
                student_name: row.student_name,
                class_name: row.class_name,
                score: Number(row.score || 0),
                time_minutes: Number((toNumber(row.time_spent_seconds, 0) / 60).toFixed(2)),
                completed_at: row.completed_at ? new Date(row.completed_at).toLocaleString('ru-RU') : '',
                attempts_count: Number(row.attempts_count || 0)
            });
        });

        worksheet.getRow(1).font = { bold: true };
        worksheet.views = [{ state: 'frozen', ySplit: 1 }];

        const bufferLike = await workbook.xlsx.writeBuffer();
        const buffer = Buffer.isBuffer(bufferLike) ? bufferLike : Buffer.from(bufferLike);

        const safeTitle = String(payload.test?.title || 'test')
            .replace(/[^\w\d-_]+/g, '_')
            .slice(0, 60);
        res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}_results.xlsx"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        return res.send(buffer);
    } catch (error) {
        console.error('Teacher advanced test results export error:', error);
        return res.status(500).json({
            error: 'server_error',
            message: 'Failed to export test results'
        });
    }
});

router.get('/advanced/comparison', async (req, res) => {
    try {
        const scope = buildTeacherAdvancedScope(req);
        if (!scope) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Failed to resolve teacher scope'
            });
        }

        const chartMode = String(req.query.chart_mode || 'subjects').trim().toLowerCase() === 'weeks'
            ? 'weeks'
            : 'subjects';

        const attempt = await getAttemptOverviewExpressions('att');
        const completedDateExpr = attempt.completedAt === 'NULL' ? 'att.started_at' : attempt.completedAt;
        const { display: subjectNameExpr } = await getTeacherSubjectNameExpressions('s');

        const classesParams = [scope.schoolId, scope.teacherId];
        const classRef = scope.classId ? `$${classesParams.push(scope.classId)}` : null;
        const classOptionsResult = await query(
            `${getTeacherAdvancedClassScopeCte('$1', '$2', classRef)}
             SELECT id, name
             FROM teacher_classes_scope
             ORDER BY name ASC
            `,
            classesParams
        );
        const classOptions = classOptionsResult.rows.map((row) => ({
            id: row.id,
            name: row.name
        }));

        if (classOptions.length <= 1) {
            return res.json({
                enabled: false,
                classes: classOptions,
                matrix: [],
                chart: {
                    mode: chartMode,
                    labels: [],
                    datasets: []
                }
            });
        }

        const matrixParams = [scope.schoolId, scope.teacherId];
        const matrixClassRef = scope.classId ? `$${matrixParams.push(scope.classId)}` : null;
        const matrixStartRef = `$${matrixParams.push(scope.dateRange.startDate)}`;
        const matrixEndRef = `$${matrixParams.push(scope.dateRange.endDateExclusive)}`;
        const matrixSubjectFilter = scope.subjectId
            ? `AND t.subject_id = $${matrixParams.push(scope.subjectId)}`
            : '';

        const matrixRowsResult = await query(
            `${getTeacherAdvancedClassScopeCte('$1', '$2', matrixClassRef)}
             SELECT
                t.subject_id,
                ${subjectNameExpr} as subject_name,
                ta.class_id,
                tcs.name as class_name,
                AVG(${attempt.score})::float as avg_score
             FROM test_attempts att
             JOIN test_assignments ta ON ta.id = att.assignment_id
             JOIN tests t ON t.id = ta.test_id
             JOIN teacher_classes_scope tcs ON tcs.id = ta.class_id
             LEFT JOIN subjects s ON s.id = t.subject_id
             WHERE ta.assigned_by = $2
               AND t.teacher_id = $2
               AND ${attempt.completedFilter}
               AND ${completedDateExpr} >= ${matrixStartRef}
               AND ${completedDateExpr} < ${matrixEndRef}
               ${matrixSubjectFilter}
             GROUP BY t.subject_id, ${subjectNameExpr}, ta.class_id, tcs.name
             ORDER BY subject_name ASC, class_name ASC
            `,
            matrixParams
        );

        const matrixMap = new Map();
        matrixRowsResult.rows.forEach((row) => {
            const key = String(row.subject_id);
            if (!matrixMap.has(key)) {
                matrixMap.set(key, {
                    subject_id: row.subject_id,
                    subject_name: formatSubjectSafe(row.subject_name),
                    scores: {}
                });
            }
            matrixMap.get(key).scores[String(row.class_id)] = trimToFixedNumber(row.avg_score, 2);
        });

        const matrix = Array.from(matrixMap.values()).map((item) => {
            let bestClassId = null;
            let bestScore = -1;
            classOptions.forEach((classItem) => {
                const score = item.scores[String(classItem.id)];
                if (Number.isFinite(score) && score > bestScore) {
                    bestScore = score;
                    bestClassId = classItem.id;
                }
            });
            return {
                ...item,
                best_class_id: bestClassId,
                best_score: bestScore < 0 ? null : Number(bestScore.toFixed(2))
            };
        });

        const chart = {
            mode: chartMode,
            labels: [],
            datasets: []
        };

        if (chartMode === 'subjects') {
            chart.labels = matrix.map((row) => row.subject_name);
            chart.datasets = classOptions.map((classItem, index) => ({
                id: classItem.id,
                label: classItem.name,
                color: TEACHER_OVERVIEW_CHART_COLORS[index % TEACHER_OVERVIEW_CHART_COLORS.length],
                data: matrix.map((row) => {
                    const value = row.scores[String(classItem.id)];
                    return Number.isFinite(value) ? value : null;
                })
            }));
        } else {
            const weekRowsParams = [scope.schoolId, scope.teacherId];
            const weekRowsClassRef = scope.classId ? `$${weekRowsParams.push(scope.classId)}` : null;
            const weekRowsStartRef = `$${weekRowsParams.push(scope.dateRange.startDate)}`;
            const weekRowsEndRef = `$${weekRowsParams.push(scope.dateRange.endDateExclusive)}`;
            const weekRowsSubjectFilter = scope.subjectId
                ? `AND t.subject_id = $${weekRowsParams.push(scope.subjectId)}`
                : '';

            const weeklyRowsResult = await query(
                `${getTeacherAdvancedClassScopeCte('$1', '$2', weekRowsClassRef)}
                 SELECT
                    ta.class_id,
                    tcs.name as class_name,
                    DATE_TRUNC('week', ${completedDateExpr})::date as week_start,
                    AVG(${attempt.score})::float as avg_score
                 FROM test_attempts att
                 JOIN test_assignments ta ON ta.id = att.assignment_id
                 JOIN tests t ON t.id = ta.test_id
                 JOIN teacher_classes_scope tcs ON tcs.id = ta.class_id
                 WHERE ta.assigned_by = $2
                   AND t.teacher_id = $2
                   AND ${attempt.completedFilter}
                   AND ${completedDateExpr} >= ${weekRowsStartRef}
                   AND ${completedDateExpr} < ${weekRowsEndRef}
                   ${weekRowsSubjectFilter}
                 GROUP BY ta.class_id, tcs.name, DATE_TRUNC('week', ${completedDateExpr})
                 ORDER BY week_start ASC, class_name ASC
                `,
                weekRowsParams
            );

            const weekStarts = getWeeksBetween(scope.dateRange.startDate, scope.dateRange.endDateExclusive);
            const weekKeys = weekStarts.map((weekStart) => weekStart.toISOString().slice(0, 10));
            chart.labels = weekKeys;

            const rowMap = new Map();
            weeklyRowsResult.rows.forEach((row) => {
                const key = `${row.class_id}:${getWeekKey(row.week_start)}`;
                rowMap.set(key, trimToFixedNumber(row.avg_score, 2));
            });

            chart.datasets = classOptions.map((classItem, index) => ({
                id: classItem.id,
                label: classItem.name,
                color: TEACHER_OVERVIEW_CHART_COLORS[index % TEACHER_OVERVIEW_CHART_COLORS.length],
                data: weekKeys.map((weekKey) => {
                    const value = rowMap.get(`${classItem.id}:${weekKey}`);
                    return Number.isFinite(value) ? value : null;
                })
            }));
        }

        return res.json({
            enabled: true,
            classes: classOptions,
            matrix,
            chart
        });
    } catch (error) {
        console.error('Teacher advanced comparison error:', error);
        return res.status(500).json({
            error: 'server_error',
            message: 'Failed to load classes comparison'
        });
    }
});

router.get('/advanced/trends', async (req, res) => {
    try {
        const scope = buildTeacherAdvancedScope(req);
        if (!scope) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Failed to resolve teacher scope'
            });
        }

        const groupBy = String(req.query.group_by || 'classes').trim().toLowerCase() === 'subjects'
            ? 'subjects'
            : 'classes';

        const attempt = await getAttemptOverviewExpressions('att');
        const completedDateExpr = attempt.completedAt === 'NULL' ? 'att.started_at' : attempt.completedAt;
        const { display: subjectNameExpr } = await getTeacherSubjectNameExpressions('s');

        const params = [scope.schoolId, scope.teacherId];
        const classRef = scope.classId ? `$${params.push(scope.classId)}` : null;
        const startRef = `$${params.push(scope.dateRange.startDate)}`;
        const endRef = `$${params.push(scope.dateRange.endDateExclusive)}`;

        let entityIdExpr = 'ta.class_id';
        let entityNameExpr = 'tcs.name';
        let groupByExpr = 'ta.class_id, tcs.name';
        let optionalJoin = '';
        let optionalFilter = '';

        if (groupBy === 'subjects') {
            entityIdExpr = 't.subject_id';
            entityNameExpr = `${subjectNameExpr}`;
            groupByExpr = `t.subject_id, ${subjectNameExpr}`;
            optionalJoin = 'LEFT JOIN subjects s ON s.id = t.subject_id';
            optionalFilter = scope.subjectId
                ? `AND t.subject_id = $${params.push(scope.subjectId)}`
                : '';
        } else if (scope.subjectId) {
            optionalFilter = `AND t.subject_id = $${params.push(scope.subjectId)}`;
        }

        const rowsResult = await query(
            `${getTeacherAdvancedClassScopeCte('$1', '$2', classRef)}
             SELECT
                ${entityIdExpr} as entity_id,
                ${entityNameExpr} as entity_name,
                DATE_TRUNC('week', ${completedDateExpr})::date as week_start,
                AVG(${attempt.score})::float as avg_score,
                COUNT(att.id)::int as attempts
             FROM test_attempts att
             JOIN test_assignments ta ON ta.id = att.assignment_id
             JOIN tests t ON t.id = ta.test_id
             JOIN teacher_classes_scope tcs ON tcs.id = ta.class_id
             ${optionalJoin}
             WHERE ta.assigned_by = $2
               AND t.teacher_id = $2
               AND ${attempt.completedFilter}
               AND ${completedDateExpr} >= ${startRef}
               AND ${completedDateExpr} < ${endRef}
               ${optionalFilter}
             GROUP BY ${groupByExpr}, DATE_TRUNC('week', ${completedDateExpr})
             ORDER BY entity_name ASC, week_start ASC
            `,
            params
        );

        const weekStarts = getWeeksBetween(scope.dateRange.startDate, scope.dateRange.endDateExclusive);
        const weekKeys = weekStarts.map((weekStart) => weekStart.toISOString().slice(0, 10));

        const seriesMap = new Map();
        rowsResult.rows.forEach((row) => {
            const entityId = String(row.entity_id);
            if (!seriesMap.has(entityId)) {
                seriesMap.set(entityId, {
                    id: row.entity_id,
                    name: row.entity_name || '—',
                    pointsMap: new Map()
                });
            }
            seriesMap.get(entityId).pointsMap.set(getWeekKey(row.week_start), {
                avg_score: trimToFixedNumber(row.avg_score, 2),
                attempts: Number(row.attempts || 0)
            });
        });

        const anomalies = [];
        const series = Array.from(seriesMap.values())
            .sort((a, b) => String(a.name).localeCompare(String(b.name), 'ru'))
            .map((item, index) => {
                const values = [];
                const points = weekKeys.map((weekKey) => {
                    const found = item.pointsMap.get(weekKey);
                    const value = found ? toNumber(found.avg_score, null) : null;
                    values.push(value);
                    return {
                        week_start: weekKey,
                        avg_score: value,
                        attempts: found ? Number(found.attempts || 0) : 0
                    };
                });

                for (let i = 1; i < points.length; i += 1) {
                    const prev = points[i - 1];
                    const current = points[i];
                    if (!Number.isFinite(prev.avg_score) || !Number.isFinite(current.avg_score)) {
                        continue;
                    }
                    const delta = current.avg_score - prev.avg_score;
                    if (Math.abs(delta) >= 10) {
                        anomalies.push({
                            entity_id: item.id,
                            entity_name: item.name,
                            week_start: current.week_start,
                            delta: Number(delta.toFixed(2)),
                            label: delta > 0 ? 'резкий рост' : 'резкое падение',
                            type: delta > 0 ? 'up' : 'down'
                        });
                    }
                }

                return {
                    id: item.id,
                    name: item.name,
                    color: TEACHER_OVERVIEW_CHART_COLORS[index % TEACHER_OVERVIEW_CHART_COLORS.length],
                    points,
                    trend_line: buildRegressionLine(values)
                };
            });

        return res.json({
            group_by: groupBy,
            labels: weekKeys,
            series,
            anomalies
        });
    } catch (error) {
        console.error('Teacher advanced trends error:', error);
        return res.status(500).json({
            error: 'server_error',
            message: 'Failed to load trends'
        });
    }
});

router.get('/advanced/risk-zone', async (req, res) => {
    try {
        const scope = buildTeacherAdvancedScope(req);
        if (!scope) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Failed to resolve teacher scope'
            });
        }

        const payload = await loadTeacherAdvancedRiskZonePayload(scope);
        return res.json(payload);
    } catch (error) {
        console.error('Teacher advanced risk zone error:', error);
        return res.status(500).json({
            error: 'server_error',
            message: 'Failed to load risk zone'
        });
    }
});

router.get('/advanced/export/classes-summary.pdf', async (req, res) => {
    try {
        const scope = buildTeacherAdvancedScope(req);
        if (!scope) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Failed to resolve teacher scope'
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

        const [filtersMeta, classAverages, dataset, riskPayload, testsRows] = await Promise.all([
            resolveTeacherAdvancedFilterMeta(scope),
            loadTeacherAdvancedClassAverages(scope),
            loadTeacherAdvancedStudentsDataset(scope),
            loadTeacherAdvancedRiskZonePayload(scope),
            loadTeacherAdvancedTestsTable(scope)
        ]);

        const topStudents = [...(dataset.students || [])]
            .sort((a, b) => toNumber(b.avg_score, 0) - toNumber(a.avg_score, 0))
            .slice(0, 10);
        const testsTop = [...testsRows]
            .sort((a, b) => toNumber(b.avg_score, 0) - toNumber(a.avg_score, 0))
            .slice(0, 10);

        const now = new Date();
        const fileName = `teacher_advanced_summary_${now.toISOString().slice(0, 10)}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

        const doc = new PDFDocument({ margin: 44, size: 'A4' });
        doc.pipe(res);

        const ensureSpace = (minHeight = 48) => {
            const bottomY = doc.page.height - doc.page.margins.bottom;
            if (doc.y + minHeight > bottomY) {
                doc.addPage();
            }
        };

        const logoPath = path.join(__dirname, '..', '..', 'public', 'images', 'zedly_logo_bg.png');
        if (fs.existsSync(logoPath)) {
            try {
                doc.image(logoPath, 44, 36, { fit: [22, 22] });
            } catch (error) {
                // Ignore logo read errors.
            }
        }
        doc.fontSize(18).text('ZEDLY · Сводный отчёт по классам', 74, 36);
        doc.moveDown(1.2);

        doc.fontSize(10).fillColor('#4b5563');
        doc.text(`Сформировано: ${now.toLocaleString('ru-RU')}`);
        doc.text(`Период: ${formatTeacherAdvancedPeriodLabel(scope.dateRange)}`);
        doc.text(`Класс: ${filtersMeta.class_name}`);
        doc.text(`Предмет: ${filtersMeta.subject_name}`);
        doc.moveDown(0.7);
        doc.fillColor('#111827');

        doc.fontSize(13).text('Средние баллы по классам', { underline: true });
        if (!classAverages.length) {
            doc.fontSize(10).text('Нет данных за выбранный период.');
        } else {
            classAverages.forEach((item, index) => {
                ensureSpace(20);
                doc.fontSize(10).text(
                    `${index + 1}. ${item.class_name}: ${Number(item.avg_score || 0).toFixed(1)}% · попыток: ${Number(item.attempts || 0)}`
                );
            });
        }
        doc.moveDown(0.6);

        doc.fontSize(13).text('Топ учеников', { underline: true });
        if (!topStudents.length) {
            doc.fontSize(10).text('Нет данных по ученикам.');
        } else {
            topStudents.forEach((item, index) => {
                ensureSpace(20);
                doc.fontSize(10).text(
                    `${index + 1}. ${item.student_name} (${item.class_name}) · ${Number(item.avg_score || 0).toFixed(1)}%`
                );
            });
        }
        doc.moveDown(0.6);

        doc.fontSize(13).text('Зона риска', { underline: true });
        doc.fontSize(10)
            .text(`Низкий балл (<40%): ${Number(riskPayload.summary?.low_score_count || 0)}`)
            .text(`Резкое падение (>15%): ${Number(riskPayload.summary?.score_drop_count || 0)}`)
            .text(`Неактивные (>7 дней): ${Number(riskPayload.summary?.inactive_count || 0)}`);
        doc.moveDown(0.6);

        doc.fontSize(13).text('Анализ тестов', { underline: true });
        if (!testsTop.length) {
            doc.fontSize(10).text('Тесты не найдены.');
        } else {
            testsTop.forEach((item, index) => {
                ensureSpace(20);
                doc.fontSize(10).text(
                    `${index + 1}. ${item.title} · ${item.subject_name} · ${item.completed_students}/${item.assigned_students} · ${Number(item.avg_score || 0).toFixed(1)}%`
                );
            });
        }

        doc.end();
        return undefined;
    } catch (error) {
        console.error('Teacher advanced summary PDF export error:', error);
        return res.status(500).json({
            error: 'server_error',
            message: 'Failed to export classes summary PDF'
        });
    }
});

router.get('/advanced/export/students-results.xlsx', async (req, res) => {
    try {
        const scope = buildTeacherAdvancedScope(req);
        if (!scope) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Failed to resolve teacher scope'
            });
        }

        const [dataset, testsRows, questionAnalysis] = await Promise.all([
            loadTeacherAdvancedStudentsDataset(scope),
            loadTeacherAdvancedTestsTable(scope),
            loadTeacherAdvancedQuestionAnalysis(scope)
        ]);

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'ZEDLY';
        workbook.created = new Date();

        const studentsSheet = workbook.addWorksheet('Ученики');
        studentsSheet.columns = [
            { header: 'Имя ученика', key: 'student_name', width: 30 },
            { header: 'Класс', key: 'class_name', width: 14 },
            { header: 'Средний балл (%)', key: 'avg_score', width: 16 },
            { header: 'Динамика (%)', key: 'trend_delta', width: 14 },
            { header: 'Пройдено тестов', key: 'completed_tests', width: 16 },
            { header: 'Назначено тестов', key: 'assigned_tests', width: 16 },
            { header: 'Статус', key: 'status', width: 16 },
            { header: 'Последняя активность', key: 'last_activity_at', width: 22 },
            { header: 'Неактивен (дней)', key: 'inactive_days', width: 16 }
        ];
        (dataset.students || []).forEach((row) => {
            studentsSheet.addRow({
                student_name: row.student_name || '—',
                class_name: row.class_name || '—',
                avg_score: Number(row.avg_score || 0),
                trend_delta: Number(row.trend_delta || 0),
                completed_tests: Number(row.completed_tests || 0),
                assigned_tests: Number(row.assigned_tests || 0),
                status: row.status || 'normal',
                last_activity_at: row.last_activity_at
                    ? new Date(row.last_activity_at).toLocaleString('ru-RU')
                    : '—',
                inactive_days: Number(row.inactive_days || 0)
            });
        });
        studentsSheet.getRow(1).font = { bold: true };
        studentsSheet.views = [{ state: 'frozen', ySplit: 1 }];

        const testsSheet = workbook.addWorksheet('Тесты');
        testsSheet.columns = [
            { header: 'Название теста', key: 'title', width: 36 },
            { header: 'Предмет', key: 'subject_name', width: 20 },
            { header: 'Классы', key: 'assigned_classes', width: 30 },
            { header: 'Статус', key: 'status', width: 14 },
            { header: 'Прошли', key: 'completed_students', width: 12 },
            { header: 'Назначено', key: 'assigned_students', width: 12 },
            { header: 'Средний балл (%)', key: 'avg_score', width: 16 },
            { header: 'Среднее время (мин)', key: 'avg_time_minutes', width: 18 },
            { header: 'Создан', key: 'created_at', width: 16 },
            { header: 'Дедлайн', key: 'deadline_at', width: 16 }
        ];
        testsRows.forEach((row) => {
            testsSheet.addRow({
                title: row.title || '—',
                subject_name: row.subject_name || '—',
                assigned_classes: row.assigned_classes || '—',
                status: row.status || 'not_assigned',
                completed_students: Number(row.completed_students || 0),
                assigned_students: Number(row.assigned_students || 0),
                avg_score: Number(row.avg_score || 0),
                avg_time_minutes: Number(row.avg_time_minutes || 0),
                created_at: row.created_at ? new Date(row.created_at).toLocaleDateString('ru-RU') : '—',
                deadline_at: row.deadline_at ? new Date(row.deadline_at).toLocaleDateString('ru-RU') : '—'
            });
        });
        testsSheet.getRow(1).font = { bold: true };
        testsSheet.views = [{ state: 'frozen', ySplit: 1 }];

        const questionsSheet = workbook.addWorksheet('Анализ вопросов');
        questionsSheet.columns = [
            { header: '#', key: 'index', width: 6 },
            { header: 'Вопрос', key: 'question_text', width: 56 },
            { header: '% правильных', key: 'correct_percent', width: 14 },
            { header: '% неправильных', key: 'wrong_percent', width: 16 },
            { header: 'Верных', key: 'correct_count', width: 10 },
            { header: 'Неверных', key: 'wrong_count', width: 10 },
            { header: 'Всего ответов', key: 'total', width: 12 }
        ];
        questionAnalysis.forEach((row, index) => {
            questionsSheet.addRow({
                index: index + 1,
                question_text: row.question_text || '—',
                correct_percent: Number(row.correct_percent || 0),
                wrong_percent: Number(row.wrong_percent || 0),
                correct_count: Number(row.correct_count || 0),
                wrong_count: Number(row.wrong_count || 0),
                total: Number(row.total || 0)
            });
        });
        questionsSheet.getRow(1).font = { bold: true };
        questionsSheet.views = [{ state: 'frozen', ySplit: 1 }];

        const bufferLike = await workbook.xlsx.writeBuffer();
        const buffer = Buffer.isBuffer(bufferLike) ? bufferLike : Buffer.from(bufferLike);

        const fileName = `teacher_students_results_${new Date().toISOString().slice(0, 10)}.xlsx`;
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        return res.send(buffer);
    } catch (error) {
        console.error('Teacher advanced students Excel export error:', error);
        return res.status(500).json({
            error: 'server_error',
            message: 'Failed to export students results Excel'
        });
    }
});

router.get('/advanced/export/tests/:id/report.pdf', async (req, res) => {
    try {
        const scope = buildTeacherAdvancedScope(req);
        if (!scope) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Failed to resolve teacher scope'
            });
        }

        const testId = String(req.params.id || '').trim();
        if (!testId) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Test id is required'
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

        const [payload, filtersMeta] = await Promise.all([
            buildTeacherAdvancedTestDetailsPayload(scope, testId),
            resolveTeacherAdvancedFilterMeta(scope)
        ]);
        if (!payload) {
            return res.status(404).json({
                error: 'not_found',
                message: 'Test not found'
            });
        }

        const fileName = `test_report_${String(payload.test?.title || 'test').replace(/[^\w\d-_]+/g, '_').slice(0, 60)}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

        const doc = new PDFDocument({ margin: 44, size: 'A4' });
        doc.pipe(res);

        const ensureSpace = (minHeight = 48) => {
            const bottomY = doc.page.height - doc.page.margins.bottom;
            if (doc.y + minHeight > bottomY) {
                doc.addPage();
            }
        };

        const logoPath = path.join(__dirname, '..', '..', 'public', 'images', 'zedly_logo_bg.png');
        if (fs.existsSync(logoPath)) {
            try {
                doc.image(logoPath, 44, 36, { fit: [22, 22] });
            } catch (error) {
                // Ignore logo read errors.
            }
        }

        doc.fontSize(18).text('ZEDLY · Отчёт по тесту', 74, 36);
        doc.moveDown(1.2);
        doc.fontSize(10).fillColor('#4b5563');
        doc.text(`Тест: ${payload.test?.title || '—'}`);
        doc.text(`Предмет: ${payload.test?.subject_name || '—'}`);
        doc.text(`Период: ${formatTeacherAdvancedPeriodLabel(scope.dateRange)}`);
        doc.text(`Класс: ${filtersMeta.class_name}`);
        doc.text(`Предмет (фильтр): ${filtersMeta.subject_name}`);
        doc.moveDown(0.6);
        doc.fillColor('#111827');

        doc.fontSize(13).text('Общая статистика', { underline: true });
        doc.fontSize(10)
            .text(`Всего прошли: ${Number(payload.summary?.total_completed || 0)}`)
            .text(`Средний балл: ${Number(payload.summary?.avg_score || 0).toFixed(1)}%`)
            .text(`Мин / Макс: ${Number(payload.summary?.min_score || 0).toFixed(1)}% / ${Number(payload.summary?.max_score || 0).toFixed(1)}%`)
            .text(`Среднее время: ${Number(payload.summary?.avg_time_minutes || 0).toFixed(1)} мин`);
        doc.moveDown(0.6);

        doc.fontSize(13).text('Результаты по ученикам', { underline: true });
        const students = Array.isArray(payload.results_by_students) ? payload.results_by_students : [];
        if (!students.length) {
            doc.fontSize(10).text('Нет результатов.');
        } else {
            students.slice(0, 50).forEach((row, index) => {
                ensureSpace(20);
                doc.fontSize(10).text(
                    `${index + 1}. ${row.student_name} (${row.class_name}) · ${Number(row.score || 0).toFixed(1)}% · ` +
                    `${Number((toNumber(row.time_spent_seconds, 0) / 60).toFixed(1))} мин · попыток: ${Number(row.attempts_count || 0)}`
                );
            });
            if (students.length > 50) {
                doc.fontSize(9).fillColor('#6b7280').text(`... и ещё ${students.length - 50} записей`);
                doc.fillColor('#111827');
            }
        }
        doc.moveDown(0.6);

        doc.fontSize(13).text('Анализ вопросов', { underline: true });
        const questions = Array.isArray(payload.question_analysis) ? payload.question_analysis : [];
        if (!questions.length) {
            doc.fontSize(10).text('Нет данных по вопросам.');
        } else {
            questions.slice(0, 50).forEach((row, index) => {
                ensureSpace(24);
                doc.fontSize(10).text(
                    `${index + 1}. ${row.question_text} · ${Number(row.correct_percent || 0).toFixed(1)}% верно / ` +
                    `${Number(row.wrong_percent || 0).toFixed(1)}% неверно`
                );
            });
            if (questions.length > 50) {
                doc.fontSize(9).fillColor('#6b7280').text(`... и ещё ${questions.length - 50} вопросов`);
                doc.fillColor('#111827');
            }
        }
        doc.moveDown(0.6);

        doc.fontSize(13).text('Кто не прошёл', { underline: true });
        const notCompleted = Array.isArray(payload.not_completed) ? payload.not_completed : [];
        if (!notCompleted.length) {
            doc.fontSize(10).text('Все ученики завершили тест.');
        } else {
            notCompleted.slice(0, 50).forEach((row, index) => {
                ensureSpace(20);
                const daysLabel = Number.isFinite(Number(row.days_left))
                    ? (Number(row.days_left) < 0
                        ? `просрочен ${Math.abs(Number(row.days_left))} дн.`
                        : `${Number(row.days_left)} дн. до дедлайна`)
                    : 'без дедлайна';
                doc.fontSize(10).text(`${index + 1}. ${row.student_name} (${row.class_name}) · ${daysLabel}`);
            });
            if (notCompleted.length > 50) {
                doc.fontSize(9).fillColor('#6b7280').text(`... и ещё ${notCompleted.length - 50} записей`);
                doc.fillColor('#111827');
            }
        }

        doc.end();
        return undefined;
    } catch (error) {
        console.error('Teacher advanced specific test PDF export error:', error);
        return res.status(500).json({
            error: 'server_error',
            message: 'Failed to export test PDF report'
        });
    }
});

/**
 * GET /api/teacher/tests/:id
 * Get test details with questions
 */
router.get('/tests/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const teacherId = req.user.id;
        const schoolId = req.user.school_id;

        // Get test with validation
        const testResult = await query(
            `SELECT
                t.*, s.name as subject_name, s.color as subject_color,
                (SELECT COUNT(*) FROM test_attempts WHERE test_id = t.id) as attempt_count
             FROM tests t
             LEFT JOIN subjects s ON t.subject_id = s.id
             WHERE t.id = $1 AND t.teacher_id = $2 AND t.school_id = $3`,
            [id, teacherId, schoolId]
        );

        if (testResult.rows.length === 0) {
            return res.status(404).json({
                error: 'not_found',
                message: 'Test not found'
            });
        }

        // Get questions
        const questionsResult = await query(
            `SELECT * FROM test_questions
             WHERE test_id = $1
             ORDER BY order_number ASC`,
            [id]
        );

        res.json({
            test: testResult.rows[0],
            questions: questionsResult.rows
        });
    } catch (error) {
        console.error('Get test error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch test'
        });
    }
});

/**
 * POST /api/teacher/tests
 * Create new test
 */
router.post('/tests', async (req, res) => {
    try {
        const {
            title, description, subject_id, duration_minutes,
            passing_score, max_attempts, shuffle_questions,
            block_copy_paste, track_tab_switches, fullscreen_required,
            is_published, questions
        } = req.body;
        const teacherId = req.user.id;
        const schoolId = req.user.school_id;

        // Validation
        if (!title || !subject_id) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Title and subject are required'
            });
        }

        // Verify subject belongs to school
        const subjectCheck = await query(
            'SELECT id FROM subjects WHERE id = $1 AND school_id = $2',
            [subject_id, schoolId]
        );

        if (subjectCheck.rows.length === 0) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Invalid subject'
            });
        }

        // Create test
        const testResult = await query(
            `INSERT INTO tests (
                school_id, teacher_id, subject_id, title, description,
                duration_minutes, passing_score, max_attempts,
                shuffle_questions, block_copy_paste, track_tab_switches, fullscreen_required,
                is_published
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             RETURNING id, title, created_at`,
            [
                schoolId, teacherId, subject_id, title.trim(),
                description?.trim() || null,
                duration_minutes || 60,
                passing_score || 60,
                max_attempts || 1,
                shuffle_questions === true,
                block_copy_paste !== false,
                track_tab_switches !== false,
                fullscreen_required === true,
                is_published === true
            ]
        );

        const testId = testResult.rows[0].id;

        // Add questions if provided
        if (questions && questions.length > 0) {
            const questionColumns = await getTableColumns('test_questions');
            const hasManualReview = questionColumns.has('requires_manual_review');
            for (let i = 0; i < questions.length; i++) {
                const q = questions[i];
                const columns = ['test_id', 'question_type', 'question_text', 'options', 'correct_answer', 'marks', 'order_number', 'media_url'];
                const values = [
                    testId,
                    q.question_type,
                    q.question_text,
                    JSON.stringify(q.options || []),
                    JSON.stringify(q.correct_answer),
                    q.marks || 1,
                    i + 1,
                    q.media_url || null
                ];
                if (hasManualReview) {
                    columns.push('requires_manual_review');
                    values.push(q.requires_manual_review === true || String(q.question_type || '').toLowerCase() === 'essay');
                }
                const placeholders = values.map((_, idx) => `$${idx + 1}`).join(', ');
                await query(
                    `INSERT INTO test_questions (${columns.join(', ')}) VALUES (${placeholders})`,
                    values
                );
            }
        }

        // Log action
        await query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [teacherId, 'create', 'test', testId, { title: title.trim() }]
        );

        res.status(201).json({
            message: 'Test created successfully',
            test: testResult.rows[0]
        });
    } catch (error) {
        console.error('Create test error:', error);
        res.status(500).json({
            error: 'server_error',
            message: error.message || 'Failed to create test'
        });
    }
});

/**
 * PUT /api/teacher/tests/:id
 * Update test
 */
router.put('/tests/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            title, description, subject_id, duration_minutes,
            passing_score, max_attempts, shuffle_questions,
            block_copy_paste, track_tab_switches, fullscreen_required,
            is_published, questions
        } = req.body;
        const teacherId = req.user.id;
        const schoolId = req.user.school_id;

        // Check ownership
        const testCheck = await query(
            'SELECT id FROM tests WHERE id = $1 AND teacher_id = $2 AND school_id = $3',
            [id, teacherId, schoolId]
        );

        if (testCheck.rows.length === 0) {
            return res.status(404).json({
                error: 'not_found',
                message: 'Test not found'
            });
        }

        const subjectCheck = await query(
            'SELECT id FROM subjects WHERE id = $1 AND school_id = $2 AND is_active = true',
            [subject_id, schoolId]
        );

        if (subjectCheck.rows.length === 0) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Invalid subject'
            });
        }

        // Update test
        await query(
            `UPDATE tests SET
                title = $1, description = $2, subject_id = $3,
                duration_minutes = $4, passing_score = $5, max_attempts = $6,
                shuffle_questions = $7, block_copy_paste = $8,
                track_tab_switches = $9, fullscreen_required = $10,
                is_published = $11, updated_at = CURRENT_TIMESTAMP
             WHERE id = $12`,
            [
                title.trim(), description?.trim() || null, subject_id,
                duration_minutes, passing_score, max_attempts,
                shuffle_questions === true, block_copy_paste !== false,
                track_tab_switches !== false, fullscreen_required === true,
                is_published, id
            ]
        );

        // Update questions if provided
        if (questions) {
            const questionColumns = await getTableColumns('test_questions');
            const hasManualReview = questionColumns.has('requires_manual_review');
            // Delete existing questions
            await query('DELETE FROM test_questions WHERE test_id = $1', [id]);

            // Add new questions
            for (let i = 0; i < questions.length; i++) {
                const q = questions[i];
                const columns = ['test_id', 'question_type', 'question_text', 'options', 'correct_answer', 'marks', 'order_number', 'media_url'];
                const values = [
                    id,
                    q.question_type,
                    q.question_text,
                    JSON.stringify(q.options || []),
                    JSON.stringify(q.correct_answer),
                    q.marks || 1,
                    i + 1,
                    q.media_url || null
                ];
                if (hasManualReview) {
                    columns.push('requires_manual_review');
                    values.push(q.requires_manual_review === true || String(q.question_type || '').toLowerCase() === 'essay');
                }
                const placeholders = values.map((_, idx) => `$${idx + 1}`).join(', ');
                await query(
                    `INSERT INTO test_questions (${columns.join(', ')}) VALUES (${placeholders})`,
                    values
                );
            }
        }

        // Log action
        await query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [teacherId, 'update', 'test', id, { title: title.trim() }]
        );

        res.json({ message: 'Test updated successfully' });
    } catch (error) {
        console.error('Update test error:', error);
        res.status(500).json({
            error: 'server_error',
            message: error.message || 'Failed to update test'
        });
    }
});

/**
 * DELETE /api/teacher/tests/:id
 * Delete test (hard delete)
 */
router.delete('/tests/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const teacherId = req.user.id;
        const schoolId = req.user.school_id;

        // Check ownership
        const testCheck = await query(
            'SELECT id, title FROM tests WHERE id = $1 AND teacher_id = $2 AND school_id = $3',
            [id, teacherId, schoolId]
        );

        if (testCheck.rows.length === 0) {
            return res.status(404).json({
                error: 'not_found',
                message: 'Test not found'
            });
        }

        const assignmentRows = await query('SELECT id FROM test_assignments WHERE test_id = $1', [id]);
        for (const row of assignmentRows.rows) {
            await query('DELETE FROM test_attempts WHERE assignment_id = $1', [row.id]);
            await query('DELETE FROM test_assignments WHERE id = $1', [row.id]);
        }

        await query('DELETE FROM test_attempts WHERE test_id = $1', [id]);
        await query('DELETE FROM test_questions WHERE test_id = $1', [id]);
        await query('DELETE FROM tests WHERE id = $1', [id]);

        // Log action
        await query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [teacherId, 'delete', 'test', id, { title: testCheck.rows[0].title }]
        );

        res.json({ message: 'Test deleted successfully' });
    } catch (error) {
        console.error('Delete test error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to delete test'
        });
    }
});

const questionExcelUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const fileName = String(file.originalname || '').toLowerCase();
        const mime = String(file.mimetype || '').toLowerCase();
        const allowedMime = new Set([
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ]);
        const hasAllowedExt = fileName.endsWith('.xlsx');
        if (!hasAllowedExt && !allowedMime.has(mime)) {
            return cb(new Error('Only .xlsx files are allowed'));
        }
        cb(null, true);
    }
});

const SHEET_TO_TYPE = {
    singlechoice: 'singlechoice',
    single_choice: 'singlechoice',
    single: 'singlechoice',
    singlechoicequestions: 'singlechoice',
    multiplechoice: 'multiplechoice',
    multiple_choice: 'multiplechoice',
    multiple: 'multiplechoice',
    truefalse: 'truefalse',
    true_false: 'truefalse',
    boolean: 'truefalse',
    shortanswer: 'shortanswer',
    short_answer: 'shortanswer',
    text: 'shortanswer',
    matching: 'matching',
    pairs: 'matching',
    ordering: 'ordering',
    order: 'ordering',
    sequence: 'ordering',
    fillblanks: 'fillblanks',
    fill_blanks: 'fillblanks',
    blanks: 'fillblanks',
    imagebased: 'imagebased',
    image_based: 'imagebased',
    image: 'imagebased',
    photo: 'imagebased'
};

function isZipSignature(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 4) return false;
    if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) return false; // PK

    return (
        (buffer[2] === 0x03 && buffer[3] === 0x04) ||
        (buffer[2] === 0x05 && buffer[3] === 0x06) ||
        (buffer[2] === 0x07 && buffer[3] === 0x08)
    );
}

function normalizeImportKey(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[.\s\-]+/g, '_')
        .replace(/[^a-z0-9_]/g, '')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function buildRowMap(row) {
    const map = {};
    Object.keys(row || {}).forEach((key) => {
        const value = row[key];
        const normalized = normalizeImportKey(key);
        if (normalized) {
            map[normalized] = value;

            // Support headers like "Вариант 1 (option1)" -> "option1"
            const noLeadingIndex = normalized.replace(/^\d+_/, '');
            if (noLeadingIndex && noLeadingIndex !== normalized) {
                map[noLeadingIndex] = value;
            }
        }

        const keyText = String(key || '');
        const bracketMatch = keyText.match(/\(([^)]+)\)/);
        if (bracketMatch?.[1]) {
            const alias = normalizeImportKey(bracketMatch[1]);
            if (alias) map[alias] = value;
        }

        const squareMatch = keyText.match(/\[([^\]]+)\]/);
        if (squareMatch?.[1]) {
            const alias = normalizeImportKey(squareMatch[1]);
            if (alias) map[alias] = value;
        }
    });
    return map;
}

function readAliases(rowMap, aliases) {
    for (const alias of aliases) {
        const key = normalizeImportKey(alias);
        if (Object.prototype.hasOwnProperty.call(rowMap, key)) {
            const value = rowMap[key];
            if (value !== null && value !== undefined && String(value).trim() !== '') {
                return value;
            }
        }
    }
    return '';
}

function parseMarks(raw) {
    const marks = parseInt(raw, 10);
    return Number.isFinite(marks) && marks > 0 ? marks : 1;
}

function parseDelimited(value) {
    return String(value || '')
        .split('|')
        .map((part) => part.trim())
        .filter(Boolean);
}

function parseOptions(rowMap) {
    const inline = readAliases(rowMap, ['options', 'answers', 'variants']);
    if (inline) return parseDelimited(inline);

    const options = [];
    for (let i = 1; i <= 12; i++) {
        const value = readAliases(rowMap, [`option_${i}`, `option${i}`, `answer_${i}`, `answer${i}`]);
        if (!value) break;
        options.push(String(value).trim());
    }
    return options;
}

function parseCorrectIndices(raw, optionCount) {
    if (raw === null || raw === undefined) return [];
    const text = String(raw).trim();
    if (!text) return [];
    const parts = text.split(/[;,|]/).map((x) => x.trim()).filter(Boolean);
    const source = parts.length ? parts : [text];
    const indices = source
        .map((part) => parseInt(part, 10))
        .filter((n) => Number.isFinite(n))
        .map((n) => n - 1)
        .filter((idx) => idx >= 0 && idx < optionCount);
    return Array.from(new Set(indices));
}

function parseTrueFalse(raw) {
    const value = String(raw || '').trim().toLowerCase();
    if (!value) return null;
    if (['true', '1', 'yes', 'y', 'верно', 'истина'].includes(value)) return 'true';
    if (['false', '0', 'no', 'n', 'неверно', 'ложь'].includes(value)) return 'false';
    return null;
}

function parseMatchingPairs(rowMap) {
    const normalizePairValue = (value) => String(value || '').trim().toLowerCase();

    const packed = readAliases(rowMap, ['pairs', 'matching_pairs']);
    if (packed) {
        const pairs = parseDelimited(packed)
            .map((chunk) => chunk.split('=>'))
            .map(([left, right]) => ({ left: String(left || '').trim(), right: String(right || '').trim() }))
            .filter((pair) => pair.left && pair.right)
            .filter((pair) => normalizePairValue(pair.left) !== normalizePairValue(pair.right));
        if (pairs.length) return pairs;
    }

    const pairs = [];
    for (let i = 1; i <= 12; i++) {
        const left = readAliases(rowMap, [`left_${i}`, `left${i}`]);
        const right = readAliases(rowMap, [`right_${i}`, `right${i}`]);
        if (!left && !right) break;
        if (left && right) {
            const leftValue = String(left).trim();
            const rightValue = String(right).trim();
            if (normalizePairValue(leftValue) !== normalizePairValue(rightValue)) {
                pairs.push({ left: leftValue, right: rightValue });
            }
        }
    }
    return pairs;
}

function parseOrderingItems(rowMap) {
    const packed = readAliases(rowMap, ['items', 'ordering_items', 'sequence']);
    if (packed) return parseDelimited(packed);

    const items = [];
    for (let i = 1; i <= 12; i++) {
        const value = readAliases(rowMap, [`item_${i}`, `item${i}`]);
        if (!value) break;
        items.push(String(value).trim());
    }
    return items;
}

function parseBlankAnswers(rowMap) {
    const packed = readAliases(rowMap, ['blank_answers', 'answers', 'correct_answers']);
    if (packed) return parseDelimited(packed);

    const answers = [];
    for (let i = 1; i <= 12; i++) {
        const value = readAliases(rowMap, [`blank_${i}`, `blank${i}`, `answer_${i}`, `answer${i}`]);
        if (!value) break;
        answers.push(String(value).trim());
    }
    return answers;
}

function parseQuestionRow(questionType, rowMap) {
    const questionText = String(readAliases(rowMap, ['question_text', 'question', 'text'])).trim();
    const marks = parseMarks(readAliases(rowMap, ['marks', 'points', 'score']));
    const mediaUrl = String(readAliases(rowMap, ['media_url', 'image_url', 'url'])).trim() || null;

    if (!questionText) return null;

    if (questionType === 'singlechoice' || questionType === 'multiplechoice' || questionType === 'imagebased') {
        const options = parseOptions(rowMap);
        if (options.length < 2) return null;

        const rawCorrect = readAliases(rowMap, ['correct_answer', 'correct', 'correct_index', 'correct_indices']);
        const correct = parseCorrectIndices(rawCorrect, options.length);
        if (!correct.length) return null;

        const payload = {
            question_type: questionType,
            question_text: questionText,
            options,
            correct_answer: questionType === 'multiplechoice' ? correct : correct[0],
            marks,
            media_url: questionType === 'imagebased' ? mediaUrl : null
        };
        if (questionType === 'imagebased' && !payload.media_url) return null;
        return payload;
    }

    if (questionType === 'truefalse') {
        const value = parseTrueFalse(readAliases(rowMap, ['correct_answer', 'correct', 'answer']));
        if (!value) return null;
        return {
            question_type: questionType,
            question_text: questionText,
            options: [],
            correct_answer: value,
            marks,
            media_url: mediaUrl
        };
    }

    if (questionType === 'shortanswer') {
        const answers = parseDelimited(readAliases(rowMap, ['correct_answer', 'answers', 'correct_answers']));
        if (!answers.length) return null;
        return {
            question_type: questionType,
            question_text: questionText,
            options: [],
            correct_answer: answers.length === 1 ? answers[0] : answers,
            marks,
            media_url: mediaUrl
        };
    }

    if (questionType === 'matching') {
        const pairs = parseMatchingPairs(rowMap);
        if (pairs.length < 2) return null;
        return {
            question_type: questionType,
            question_text: questionText,
            options: pairs,
            correct_answer: pairs.map((_, i) => i),
            marks,
            media_url: mediaUrl
        };
    }

    if (questionType === 'ordering') {
        const items = parseOrderingItems(rowMap);
        if (items.length < 2) return null;
        return {
            question_type: questionType,
            question_text: questionText,
            options: items,
            correct_answer: items.map((_, i) => i),
            marks,
            media_url: mediaUrl
        };
    }

    if (questionType === 'fillblanks') {
        const blanks = parseBlankAnswers(rowMap);
        if (!blanks.length) return null;
        return {
            question_type: questionType,
            question_text: questionText,
            options: [],
            correct_answer: blanks,
            marks,
            media_url: mediaUrl
        };
    }

    return null;
}

function normalizeWorksheetCellValue(value) {
    if (value === null || value === undefined) return '';

    if (value instanceof Date) {
        return value.toISOString();
    }

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

function worksheetToImportRows(worksheet) {
    const headerRow = worksheet.getRow(1);
    const headers = [];
    let maxColumn = 0;

    headerRow.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
        const header = String(normalizeWorksheetCellValue(cell.value)).trim();
        headers[columnNumber] = header;
        if (header) {
            maxColumn = Math.max(maxColumn, columnNumber);
        }
    });

    if (maxColumn === 0) {
        return [];
    }

    const rows = [];
    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
        const row = worksheet.getRow(rowNumber);
        if (!row.hasValues) continue;

        const item = {};
        let hasAnyValue = false;

        for (let columnNumber = 1; columnNumber <= maxColumn; columnNumber++) {
            const header = headers[columnNumber];
            if (!header) continue;

            const normalized = normalizeWorksheetCellValue(row.getCell(columnNumber).value);
            item[header] = normalized;
            if (String(normalized || '').trim() !== '') {
                hasAnyValue = true;
            }
        }

        if (hasAnyValue) {
            rows.push(item);
        }
    }

    return rows;
}

async function parseQuestionsFromWorkbookBuffer(buffer) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const questions = [];
    const stats = { imported: 0, skipped: 0, sheets: [] };

    workbook.worksheets.forEach((worksheet) => {
        const sheetName = worksheet.name;
        const normalizedSheet = normalizeImportKey(sheetName).replace(/_/g, '');
        const questionType = SHEET_TO_TYPE[normalizedSheet] || SHEET_TO_TYPE[normalizeImportKey(sheetName)];
        if (!questionType) return;

        const rows = worksheetToImportRows(worksheet);
        let imported = 0;
        let skipped = 0;

        rows.forEach((row) => {
            const rowMap = buildRowMap(row);
            const hasAnyValue = Object.values(rowMap).some((value) => String(value || '').trim() !== '');
            if (!hasAnyValue) return;

            const parsed = parseQuestionRow(questionType, rowMap);
            if (!parsed) {
                skipped += 1;
                return;
            }

            questions.push(parsed);
            imported += 1;
        });

        stats.imported += imported;
        stats.skipped += skipped;
        stats.sheets.push({ sheet: sheetName, type: questionType, imported, skipped });
    });

    return { questions, stats };
}

function autosizeWorksheetColumns(worksheet, minWidth = 10, maxWidth = 56) {
    worksheet.columns.forEach((column) => {
        let maxLength = minWidth;
        column.eachCell({ includeEmpty: true }, (cell) => {
            const value = cell.value;
            const text = value === null || value === undefined ? '' : String(value);
            maxLength = Math.max(maxLength, text.length + 2);
        });
        column.width = Math.min(maxLength, maxWidth);
    });
}

function styleTemplateWorksheet(worksheet, rowCount, colCount) {
    const border = {
        top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
    };

    for (let rowIndex = 1; rowIndex <= rowCount; rowIndex++) {
        for (let colIndex = 1; colIndex <= colCount; colIndex++) {
            const cell = worksheet.getCell(rowIndex, colIndex);
            cell.border = border;
            cell.alignment = {
                vertical: 'middle',
                horizontal: rowIndex === 1 ? 'center' : 'left',
                wrapText: true
            };

            if (rowIndex === 1) {
                cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4A90E2' } };
            } else if (rowIndex === 2) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
            }
        }
    }

    worksheet.getRow(1).height = 28;
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: colCount }
    };
}

function buildTemplateColumns(keys) {
    const headerMap = {
        question_text: 'Текст вопроса',
        marks: 'Баллы',
        option1: 'Вариант 1',
        option2: 'Вариант 2',
        option3: 'Вариант 3',
        option4: 'Вариант 4',
        correct: 'Правильный ответ',
        correct_answers: 'Правильные ответы',
        left1: 'Левая часть 1',
        right1: 'Правая часть 1',
        left2: 'Левая часть 2',
        right2: 'Правая часть 2',
        item1: 'Элемент 1',
        item2: 'Элемент 2',
        item3: 'Элемент 3',
        blank1: 'Ответ для пропуска 1',
        media_url: 'Ссылка на изображение'
    };

    return keys.map((key) => `${headerMap[key] || key} (${key})`);
}

async function buildQuestionImportTemplateBuffer() {
    const workbook = new ExcelJS.Workbook();

    const sheets = [
        {
            name: 'singlechoice',
            keys: ['question_text', 'marks', 'option1', 'option2', 'option3', 'option4', 'correct'],
            row: {
                question_text: 'Столица Франции?',
                marks: 1,
                option1: 'Париж',
                option2: 'Лондон',
                option3: 'Берлин',
                option4: 'Рим',
                correct: '1'
            }
        },
        {
            name: 'multiplechoice',
            keys: ['question_text', 'marks', 'option1', 'option2', 'option3', 'option4', 'correct'],
            row: {
                question_text: 'Выберите простые числа',
                marks: 1,
                option1: '2',
                option2: '3',
                option3: '4',
                option4: '5',
                correct: '1,2,4'
            }
        },
        {
            name: 'truefalse',
            keys: ['question_text', 'marks', 'correct'],
            row: {
                question_text: 'Солнце — это звезда',
                marks: 1,
                correct: 'true'
            }
        },
        {
            name: 'shortanswer',
            keys: ['question_text', 'marks', 'correct_answers'],
            row: {
                question_text: 'Химическая формула воды',
                marks: 1,
                correct_answers: 'H2O|h2o'
            }
        },
        {
            name: 'matching',
            keys: ['question_text', 'marks', 'left1', 'right1', 'left2', 'right2'],
            row: {
                question_text: 'Соотнесите страну и столицу',
                marks: 2,
                left1: 'Франция',
                right1: 'Париж',
                left2: 'Германия',
                right2: 'Берлин'
            }
        },
        {
            name: 'ordering',
            keys: ['question_text', 'marks', 'item1', 'item2', 'item3'],
            row: {
                question_text: 'Расположите планеты от Солнца',
                marks: 2,
                item1: 'Меркурий',
                item2: 'Венера',
                item3: 'Земля'
            }
        },
        {
            name: 'fillblanks',
            keys: ['question_text', 'marks', 'blank1'],
            row: {
                question_text: '___ — самая большая планета Солнечной системы',
                marks: 1,
                blank1: 'Юпитер'
            }
        },
        {
            name: 'imagebased',
            keys: ['question_text', 'marks', 'media_url', 'option1', 'option2', 'option3', 'option4', 'correct'],
            row: {
                question_text: 'Что изображено на картинке?',
                marks: 1,
                media_url: 'https://example.com/image.jpg',
                option1: 'Кот',
                option2: 'Собака',
                option3: 'Птица',
                option4: 'Рыба',
                correct: '2'
            }
        }
    ];

    sheets.forEach((sheetDef) => {
        const worksheet = workbook.addWorksheet(sheetDef.name);
        const headers = buildTemplateColumns(sheetDef.keys);
        const dataRow = sheetDef.keys.map((key) => sheetDef.row[key] ?? '');

        worksheet.addRow(headers);
        worksheet.addRow(dataRow);

        styleTemplateWorksheet(worksheet, 2, headers.length);
        autosizeWorksheetColumns(worksheet);
    });

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
}

/**
 * GET /api/teacher/subjects
 * Get subjects for dropdowns
 */
router.get('/subjects', async (req, res) => {
    try {
        const teacherId = req.user.id;
        const schoolId = req.user.school_id;

        // Only return subjects this teacher is assigned to teach
        const result = await query(
            `SELECT s.id, s.name, s.code, s.color
             FROM teacher_class_subjects tcs
             JOIN subjects s ON tcs.subject_id = s.id
             WHERE tcs.teacher_id = $1 AND s.school_id = $2 AND s.is_active = true
             GROUP BY s.id, s.name, s.code, s.color
             ORDER BY s.name ASC`,
            [teacherId, schoolId]
        );

        res.json({ subjects: result.rows });
    } catch (error) {
        console.error('Get subjects error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch subjects'
        });
    }
});

/**
 * GET /api/teacher/classes-by-subject
 * Get classes taught by teacher for a specific subject
 */
router.get('/classes-by-subject', async (req, res) => {
    try {
        const { subject_id } = req.query;
        const teacherId = req.user.id;
        const schoolId = req.user.school_id;

        if (!subject_id) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'subject_id is required'
            });
        }

        const result = await query(
            `SELECT DISTINCT c.id, c.name, c.grade_level, c.academic_year
             FROM classes c
             JOIN teacher_class_subjects tcs ON c.id = tcs.class_id
             WHERE c.school_id = $1
               AND c.is_active = true
               AND tcs.teacher_id = $2
               AND tcs.subject_id = $3
             ORDER BY c.grade_level ASC, c.name ASC`,
            [schoolId, teacherId, subject_id]
        );

        res.json({ classes: result.rows });
    } catch (error) {
        console.error('Get classes by subject error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch classes'
        });
    }
});

/**
 * ========================================
 * CLASSES MANAGEMENT
 * ========================================
 */

/**
 * GET /api/teacher/classes
 * Get classes where teacher teaches
 */
router.get('/classes', async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', grade = 'all' } = req.query;
        const safePage = Math.max(1, parseInt(page, 10) || 1);
        const safeLimit = Math.max(1, parseInt(limit, 10) || 10);
        const offset = (safePage - 1) * safeLimit;
        const teacherId = req.user.id;
        const schoolId = req.user.school_id;

        // Build WHERE clause
        let whereClause = `WHERE c.school_id = $1
            AND c.is_active = true
            AND EXISTS (
                SELECT 1
                FROM teacher_class_subjects tcs_scope
                WHERE tcs_scope.class_id = c.id
                  AND tcs_scope.teacher_id = $2
            )`;
        const params = [schoolId, teacherId];
        let paramCount = 3;

        if (search) {
            params.push(`%${search}%`);
            whereClause += ` AND c.name ILIKE $${paramCount}`;
            paramCount++;
        }

        if (grade !== 'all') {
            params.push(grade);
            whereClause += ` AND c.grade_level = $${paramCount}`;
            paramCount++;
        }

        // Get total count
        const countResult = await query(
            `SELECT COUNT(*)
             FROM classes c
             ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0].count);

        // Get classes where teacher teaches and include taught subjects
        params.push(safeLimit, offset);
        const result = await query(
            `SELECT
                c.id, c.name, c.grade_level,
                c.academic_year, c.is_active,
                CONCAT(ht.first_name, ' ', ht.last_name) as homeroom_teacher_name,
                (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id = c.id AND cs.is_active = true) as student_count,
                COUNT(DISTINCT tcs.subject_id)::int as subject_count,
                COALESCE(
                    STRING_AGG(DISTINCT s.name, ', ' ORDER BY s.name),
                    ''
                ) as taught_subjects
             FROM classes c
             LEFT JOIN users ht ON c.homeroom_teacher_id = ht.id
             LEFT JOIN teacher_class_subjects tcs ON c.id = tcs.class_id AND tcs.teacher_id = $2
             LEFT JOIN subjects s ON s.id = tcs.subject_id
             ${whereClause}
             GROUP BY c.id, c.name, c.grade_level, c.academic_year, c.is_active, ht.first_name, ht.last_name
             ORDER BY c.grade_level DESC, c.name ASC
             LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
            params
        );

        res.json({
            classes: result.rows,
            pagination: {
                total,
                page: safePage,
                limit: safeLimit,
                pages: Math.ceil(total / safeLimit)
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
 * GET /api/teacher/homeroom-class
 * Get homeroom class for current teacher
 */
router.get('/homeroom-class', async (req, res) => {
    try {
        const teacherId = req.user.id;
        const schoolId = req.user.school_id;

        const result = await query(
            `SELECT
                c.id, c.name, c.grade_level, c.academic_year, c.is_active,
                c.homeroom_teacher_id,
                CONCAT(ht.first_name, ' ', ht.last_name) as homeroom_teacher_name,
                (SELECT COUNT(*) FROM class_students WHERE class_id = c.id AND is_active = true) as student_count
             FROM classes c
             LEFT JOIN users ht ON c.homeroom_teacher_id = ht.id
             WHERE c.school_id = $1
               AND c.is_active = true
               AND c.homeroom_teacher_id = $2
             ORDER BY c.grade_level DESC, c.name ASC
             LIMIT 1`,
            [schoolId, teacherId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'not_found',
                message: 'Homeroom class not found'
            });
        }

        res.json({ class: result.rows[0] });
    } catch (error) {
        console.error('Get homeroom class error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch homeroom class'
        });
    }
});

/**
 * GET /api/teacher/homeroom-classes
 * Get all homeroom classes for current teacher
 */
router.get('/homeroom-classes', async (req, res) => {
    try {
        const teacherId = req.user.id;
        const schoolId = req.user.school_id;

        const result = await query(
            `SELECT
                c.id, c.name, c.grade_level, c.academic_year, c.is_active,
                (SELECT COUNT(*) FROM class_students WHERE class_id = c.id AND is_active = true) as student_count
             FROM classes c
             WHERE c.school_id = $1
               AND c.is_active = true
               AND c.homeroom_teacher_id = $2
             ORDER BY c.grade_level DESC, c.name ASC`,
            [schoolId, teacherId]
        );

        res.json({ classes: result.rows });
    } catch (error) {
        console.error('Get homeroom classes error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch homeroom classes'
        });
    }
});

/**
 * GET /api/teacher/classes/:id
 * Get class details with students
 */
router.get('/classes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const teacherId = req.user.id;
        const schoolId = req.user.school_id;

        // Verify teacher has access to this class
        const accessCheck = await query(
            `SELECT 1 FROM classes c
             LEFT JOIN teacher_class_subjects tcs ON c.id = tcs.class_id
             WHERE c.id = $1
               AND c.school_id = $2
               AND (c.homeroom_teacher_id = $3 OR tcs.teacher_id = $3)
             LIMIT 1`,
            [id, schoolId, teacherId]
        );

        if (accessCheck.rows.length === 0) {
            return res.status(403).json({
                error: 'forbidden',
                message: 'You do not have access to this class'
            });
        }

        // Get class details
        const classResult = await query(
            `SELECT
                c.id, c.name, c.grade_level,
                c.academic_year, c.is_active,
                c.homeroom_teacher_id,
                CONCAT(ht.first_name, ' ', ht.last_name) as homeroom_teacher_name,
                (SELECT COUNT(*) FROM class_students WHERE class_id = c.id AND is_active = true) as student_count
             FROM classes c
             LEFT JOIN users ht ON c.homeroom_teacher_id = ht.id
             WHERE c.id = $1`,
            [id]
        );

        const classRow = classResult.rows[0];
        const canViewStudentLogin = classRow && String(classRow.homeroom_teacher_id || '') === String(teacherId);

        // Get subjects taught by this teacher in this class
        const subjectsResult = await query(
            `SELECT
                s.id,
                s.name,
                s.code,
                s.color,
                CONCAT(u.first_name, ' ', u.last_name) as teacher_name
             FROM teacher_class_subjects tcs
             JOIN subjects s ON tcs.subject_id = s.id
             JOIN users u ON u.id = tcs.teacher_id
             WHERE tcs.class_id = $1 AND tcs.teacher_id = $2
             ORDER BY s.name ASC`,
            [id, teacherId]
        );

        // Get students in the class
        const studentsResult = await query(
            `SELECT
                u.id,
                CONCAT(u.first_name, ' ', u.last_name) as full_name,
                ${canViewStudentLogin ? 'u.username' : 'NULL::text'} as login,
                u.email,
                cs.roll_number
             FROM class_students cs
             JOIN users u ON cs.student_id = u.id
             WHERE cs.class_id = $1 AND cs.is_active = true
             ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC`,
            [id]
        );

        res.json({
            class: classResult.rows[0],
            subjects: subjectsResult.rows,
            students: studentsResult.rows
        });
    } catch (error) {
        console.error('Get class details error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch class details'
        });
    }
});

/**
 * GET /api/teacher/classes/:id/analytics
 * Get analytics overview for a class
 */
router.get('/classes/:id/analytics', async (req, res) => {
    try {
        const { id } = req.params;
        const { subject_id } = req.query;
        const teacherId = req.user.id;
        const schoolId = req.user.school_id;
        const attempt = await getAttemptOverviewExpressions();

        // Verify teacher has access to this class
        const accessCheck = await query(
            `SELECT 1 FROM classes c
             LEFT JOIN teacher_class_subjects tcs ON c.id = tcs.class_id
             WHERE c.id = $1
               AND c.school_id = $2
               AND (c.homeroom_teacher_id = $3 OR tcs.teacher_id = $3)
             LIMIT 1`,
            [id, schoolId, teacherId]
        );

        if (accessCheck.rows.length === 0) {
            return res.status(403).json({
                error: 'forbidden',
                message: 'You do not have access to this class'
            });
        }

        const classResult = await query(
            `SELECT id, name, grade_level, academic_year
             FROM classes
             WHERE id = $1`,
            [id]
        );

        const studentCountResult = await query(
            `SELECT COUNT(*) as total_students
             FROM class_students
             WHERE class_id = $1 AND is_active = true`,
            [id]
        );

        const statsResult = await query(
            `SELECT
                COUNT(DISTINCT ta.id) as assignments_total,
                COUNT(DISTINCT ta.id) FILTER (WHERE ta.is_active = true AND ta.end_date > CURRENT_TIMESTAMP) as active_assignments,
                COUNT(att.id) FILTER (WHERE ${attempt.completedFilter}) as completed_attempts,
                AVG(${attempt.score}) FILTER (WHERE ${attempt.completedFilter}) as avg_percentage
             FROM test_assignments ta
             LEFT JOIN test_attempts att ON att.assignment_id = ta.id
             WHERE ta.class_id = $1 AND ta.assigned_by = $2`,
            [id, teacherId]
        );

        const assignmentFilter = subject_id ? 'AND t.subject_id = $3' : '';
        const assignmentParams = subject_id ? [id, teacherId, subject_id] : [id, teacherId];

        const assignmentsResult = await query(
            `SELECT
                ta.id,
                ta.start_date,
                ta.end_date,
                ta.is_active,
                ta.created_at,
                t.title as test_title,
                t.passing_score,
                COUNT(att.id) as total_attempts,
                COUNT(att.id) FILTER (WHERE ${attempt.completedFilter}) as completed_attempts,
                AVG(${attempt.score}) FILTER (WHERE ${attempt.completedFilter}) as avg_percentage
             FROM test_assignments ta
             JOIN tests t ON ta.test_id = t.id
             LEFT JOIN test_attempts att ON att.assignment_id = ta.id
             WHERE ta.class_id = $1 AND ta.assigned_by = $2
             ${assignmentFilter}
             GROUP BY ta.id, t.title, t.passing_score
             ORDER BY ta.created_at DESC
             LIMIT 20`,
            assignmentParams
        );

        const studentsResult = await query(
            `SELECT
                u.id,
                u.first_name,
                u.last_name,
                u.username,
                cs.roll_number,
                cs.is_active as enrollment_active,
                u.is_active as user_active,
                COUNT(att.id) FILTER (WHERE ${attempt.completedFilter}) as tests_completed,
                AVG(${attempt.score}) FILTER (WHERE ${attempt.completedFilter}) as avg_score,
                MAX(att.submitted_at) FILTER (WHERE ${attempt.completedFilter}) as last_attempt_at
             FROM class_students cs
             JOIN users u ON u.id = cs.student_id
             LEFT JOIN test_assignments ta ON ta.class_id = cs.class_id AND ta.assigned_by = $2
             LEFT JOIN test_attempts att ON att.assignment_id = ta.id AND att.student_id = u.id
             WHERE cs.class_id = $1
             GROUP BY u.id, cs.roll_number, cs.is_active, u.is_active
             ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC`,
            [id, teacherId]
        );

        const subjectPerformanceResult = await query(
            `SELECT
                s.id,
                s.name as subject_name,
                s.color as subject_color,
                COUNT(att.id) FILTER (WHERE ${attempt.completedFilter}) as attempts,
                AVG(${attempt.score}) FILTER (WHERE ${attempt.completedFilter}) as avg_score
             FROM test_assignments ta
             JOIN tests t ON t.id = ta.test_id
             JOIN subjects s ON s.id = t.subject_id
             LEFT JOIN test_attempts att ON att.assignment_id = ta.id
             WHERE ta.class_id = $1 AND ta.assigned_by = $2
             GROUP BY s.id, s.name, s.color
             ORDER BY avg_score DESC NULLS LAST`,
            [id, teacherId]
        );

        const statsRow = statsResult.rows[0] || {};

        res.json({
            class: classResult.rows[0],
            stats: {
                student_count: parseInt(studentCountResult.rows[0].total_students),
                assignments_total: parseInt(statsRow.assignments_total || 0),
                active_assignments: parseInt(statsRow.active_assignments || 0),
                completed_attempts: parseInt(statsRow.completed_attempts || 0),
                avg_percentage: statsRow.avg_percentage
            },
            assignments: assignmentsResult.rows,
            students: studentsResult.rows,
            subject_performance: subjectPerformanceResult.rows
        });
    } catch (error) {
        console.error('Get class analytics error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch class analytics'
        });
    }
});

/**
 * POST /api/teacher/students/:id/reset-password
 * Reset password for a student in teacher's homeroom class
 */
router.post('/students/:id/reset-password', async (req, res) => {
    let teacherId = null;
    let schoolId = null;
    let studentId = null;
    try {
        const { id } = req.params;
        const sourceClassId = req.query.class_id ? String(req.query.class_id) : '';
        studentId = id;
        teacherId = req.user.id;
        schoolId = req.user.school_id;

        if (!sourceClassId) {
            return res.status(403).json({
                error: 'forbidden',
                message: 'Reset is allowed only from your homeroom class context'
            });
        }

        const studentResult = await query(
            `SELECT
                u.id, u.username, u.first_name, u.last_name, u.email, u.telegram_id, u.role, u.settings
             FROM class_students cs
             JOIN classes c ON c.id = cs.class_id
             JOIN users u ON u.id = cs.student_id
             WHERE cs.student_id = $1
               AND cs.is_active = true
               AND c.school_id = $2
               AND c.homeroom_teacher_id = $3
               AND c.id = $4
               AND u.role = 'student'
               AND u.is_active = true
             LIMIT 1`,
            [id, schoolId, teacherId, sourceClassId]
        );

        if (studentResult.rows.length === 0) {
            return res.status(403).json({
                error: 'forbidden',
                message: 'You can reset passwords only for your homeroom students'
            });
        }

        const student = studentResult.rows[0];
        const otp = generateOtp();
        const hashedPassword = await bcrypt.hash(otp, 10);

        await query(
            `UPDATE users
             SET password_hash = $1,
                 must_change_password = true,
                 token_version = token_version + 1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [hashedPassword, student.id]
        );

        await query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [
                teacherId,
                'update',
                'user',
                student.id,
                {
                    action_type: 'password_reset',
                    username: student.username,
                    reset_by: req.user.username
                }
            ]
        );

        if (student.email || student.telegram_id) {
            try {
                await notifyPasswordReset(student, otp, req.query.lang || 'ru');
            } catch (notifyError) {
                console.error('Notification error:', notifyError);
            }
        }

        res.json({
            message: 'Password reset successfully',
            tempPassword: otp,
            user: {
                id: student.id,
                username: student.username,
                name: `${student.first_name} ${student.last_name}`.trim()
            }
        });
    } catch (error) {
        console.error('Reset student password error:', error);
        await writeAuditSafe(
            teacherId || req.user?.id || null,
            'update_failed',
            'user',
            studentId || null,
            {
                action_type: 'password_reset',
                school_id: schoolId || req.user?.school_id || null,
                error: error.message || 'Failed to reset password'
            }
        );
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to reset password'
        });
    }
});

/**
 * GET /api/teacher/tests/questions/import-template
 * Download Excel template for question import.
 */
router.get('/tests/questions/import-template', async (req, res) => {
    try {
        const buffer = await buildQuestionImportTemplateBuffer();

        res.setHeader('Content-Disposition', 'attachment; filename=\"test_questions_import_template.xlsx\"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (error) {
        console.error('Questions import template error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to generate import template'
        });
    }
});

/**
 * POST /api/teacher/tests/questions/import-excel
 * Parse questions from uploaded excel where each sheet = question type.
 */
router.post('/tests/questions/import-excel', questionExcelUpload.single('file'), async (req, res) => {
    try {
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Excel file is required'
            });
        }

        if (!isZipSignature(req.file.buffer)) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Invalid XLSX file format'
            });
        }

        const { questions, stats } = await parseQuestionsFromWorkbookBuffer(req.file.buffer);
        if (!questions.length) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'No valid questions found in workbook',
                stats
            });
        }

        res.json({
            message: 'Questions imported successfully',
            questions,
            stats
        });
    } catch (error) {
        console.error('Import questions excel error:', error);
        res.status(400).json({
            error: 'validation_error',
            message: 'Failed to parse Excel file'
        });
    }
});

/**
 * ========================================
 * ASSIGNMENT TEMPLATES
 * ========================================
 */

/**
 * GET /api/teacher/assignment-templates
 * Get teacher assignment templates
 */
router.get('/assignment-templates', async (req, res) => {
    try {
        const teacherId = req.user.id;
        const { templates } = await loadTeacherAssignmentTemplates(teacherId);
        res.json({ templates });
    } catch (error) {
        console.error('Get assignment templates error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch assignment templates'
        });
    }
});

/**
 * POST /api/teacher/assignment-templates
 * Create/update teacher assignment template
 */
router.post('/assignment-templates', async (req, res) => {
    try {
        const teacherId = req.user.id;
        const schoolId = req.user.school_id;
        const template = sanitizeAssignmentTemplate(req.body);

        if (!template) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Template name, test and classes are required'
            });
        }

        const testCheck = await query(
            'SELECT id FROM tests WHERE id = $1 AND teacher_id = $2 AND school_id = $3',
            [template.test_id, teacherId, schoolId]
        );
        if (testCheck.rows.length === 0) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Invalid test for template'
            });
        }

        const classAccessResult = await query(
            `SELECT DISTINCT c.id
             FROM classes c
             LEFT JOIN teacher_class_subjects tcs ON c.id = tcs.class_id
             WHERE c.school_id = $1
               AND c.id = ANY($2::uuid[])
               AND (c.homeroom_teacher_id = $3 OR tcs.teacher_id = $3)`,
            [schoolId, template.class_ids, teacherId]
        );
        const accessibleIds = new Set(classAccessResult.rows.map((row) => String(row.id)));
        const inaccessibleIds = template.class_ids.filter((id) => !accessibleIds.has(String(id)));
        if (inaccessibleIds.length > 0) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'You do not have access to one or more classes in template'
            });
        }

        const { settings, templates } = await loadTeacherAssignmentTemplates(teacherId);
        const idx = templates.findIndex((item) => String(item.id) === String(template.id));
        if (idx >= 0) {
            templates[idx] = template;
        } else {
            templates.unshift(template);
        }

        const saved = await saveTeacherAssignmentTemplates(teacherId, settings, templates);
        await writeAuditSafe(teacherId, 'update', 'assignment_template', template.id, {
            template_name: template.name,
            test_id: template.test_id,
            class_count: template.class_ids.length
        });

        res.status(idx >= 0 ? 200 : 201).json({
            message: idx >= 0 ? 'Template updated successfully' : 'Template created successfully',
            template,
            templates: saved
        });
    } catch (error) {
        console.error('Save assignment template error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to save assignment template'
        });
    }
});

/**
 * DELETE /api/teacher/assignment-templates/:id
 * Delete teacher assignment template
 */
router.delete('/assignment-templates/:id', async (req, res) => {
    try {
        const teacherId = req.user.id;
        const templateId = String(req.params.id || '').trim();

        if (!templateId) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Template ID is required'
            });
        }

        const { settings, templates } = await loadTeacherAssignmentTemplates(teacherId);
        const nextTemplates = templates.filter((item) => String(item.id) !== templateId);
        if (nextTemplates.length === templates.length) {
            return res.status(404).json({
                error: 'not_found',
                message: 'Template not found'
            });
        }

        await saveTeacherAssignmentTemplates(teacherId, settings, nextTemplates);
        await writeAuditSafe(teacherId, 'delete', 'assignment_template', templateId, {});

        res.json({
            message: 'Template deleted successfully',
            templates: nextTemplates
        });
    } catch (error) {
        console.error('Delete assignment template error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to delete assignment template'
        });
    }
});

/**
 * ========================================
 * TEST ASSIGNMENTS MANAGEMENT
 * ========================================
 */

/**
 * GET /api/teacher/assignments
 * Get all test assignments created by teacher
 */
router.get('/assignments', async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', class_id = 'all', status = 'all' } = req.query;
        const offset = (page - 1) * limit;
        const teacherId = req.user.id;
        const schoolId = req.user.school_id;
        const attempt = await getAttemptOverviewExpressions('att');
        const assignmentColumns = await getTableColumns('test_assignments');
        const assignmentTypeSelect = assignmentColumns.has('assignment_type')
            ? 'COALESCE(ta.assignment_type, \'test\')'
            : '\'test\'';
        const revealAnswersSelect = assignmentColumns.has('reveal_answers_after_deadline')
            ? 'COALESCE(ta.reveal_answers_after_deadline, false)'
            : 'false';

        // Build WHERE clause
        let whereClause = `WHERE ta.assigned_by = $1
            AND EXISTS (
                SELECT 1
                FROM classes c_scope
                WHERE c_scope.id = ta.class_id
                  AND c_scope.school_id = $2
            )`;
        const params = [teacherId, schoolId];
        let paramCount = 3;

        if (search) {
            params.push(`%${search}%`);
            whereClause += ` AND (t.title ILIKE $${paramCount} OR c.name ILIKE $${paramCount})`;
            paramCount++;
        }

        if (class_id !== 'all') {
            params.push(class_id);
            whereClause += ` AND ta.class_id = $${paramCount}`;
            paramCount++;
        }

        if (status === 'active') {
            whereClause += ` AND ta.is_active = true AND ta.end_date > CURRENT_TIMESTAMP`;
        } else if (status === 'completed') {
            whereClause += ` AND ta.end_date < CURRENT_TIMESTAMP`;
        } else if (status === 'inactive') {
            whereClause += ` AND ta.is_active = false`;
        }

        // Get total count
        const countResult = await query(
            `SELECT COUNT(*) FROM test_assignments ta ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0].count);

        // Get assignments with test and class info
        params.push(limit, offset);
        const result = await query(
            `SELECT
                ta.id, ta.test_id, ta.class_id, ta.start_date, ta.end_date, ta.is_active, ta.created_at,
                ${assignmentTypeSelect} as assignment_type,
                ${revealAnswersSelect} as reveal_answers_after_deadline,
                t.title as test_title, t.duration_minutes, t.passing_score,
                c.name as class_name, c.grade_level,
                s.name as subject_name, s.color as subject_color,
                (SELECT COUNT(DISTINCT att.student_id)
                 FROM test_attempts att
                 WHERE att.assignment_id = ta.id
                   AND ${attempt.completedFilter}) as attempt_count,
                (SELECT COUNT(*) FROM class_students WHERE class_id = ta.class_id AND is_active = true) as student_count
             FROM test_assignments ta
             JOIN tests t ON ta.test_id = t.id
             JOIN classes c ON ta.class_id = c.id
             LEFT JOIN subjects s ON t.subject_id = s.id
             ${whereClause}
             ORDER BY ta.created_at DESC
             LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
            params
        );

        res.json({
            assignments: result.rows,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Get assignments error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch assignments'
        });
    }
});

/**
 * GET /api/teacher/assignments/:id
 * Get assignment details with student progress
 */
router.get('/assignments/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const teacherId = req.user.id;
        const schoolId = req.user.school_id;

        // Get assignment with validation
        const assignmentResult = await query(
            `SELECT
                ta.*, t.title as test_title, t.description as test_description,
                t.duration_minutes, t.passing_score, t.max_attempts,
                c.name as class_name, c.grade_level,
                s.name as subject_name, s.color as subject_color,
                (SELECT COUNT(*) FROM test_questions WHERE test_id = t.id) as question_count
             FROM test_assignments ta
             JOIN tests t ON ta.test_id = t.id
             JOIN classes c ON ta.class_id = c.id
             LEFT JOIN subjects s ON t.subject_id = s.id
             WHERE ta.id = $1 AND ta.assigned_by = $2 AND c.school_id = $3`,
            [id, teacherId, schoolId]
        );

        if (assignmentResult.rows.length === 0) {
            return res.status(404).json({
                error: 'not_found',
                message: 'Assignment not found'
            });
        }

        // Get students and their progress
        const progressResult = await query(
            `SELECT
                u.id as student_id,
                CONCAT(u.first_name, ' ', u.last_name) as student_name,
                COALESCE(cs.roll_number::text, ROW_NUMBER() OVER (ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC)::text) as roll_number,
                (SELECT COUNT(*) FROM test_attempts WHERE assignment_id = $1 AND student_id = u.id) as attempts_made,
                (SELECT MAX(percentage) FROM test_attempts WHERE assignment_id = $1 AND student_id = u.id AND is_completed = true) as best_score,
                (SELECT submitted_at FROM test_attempts WHERE assignment_id = $1 AND student_id = u.id AND is_completed = true ORDER BY submitted_at DESC LIMIT 1) as last_attempt_date
             FROM class_students cs
             JOIN users u ON cs.student_id = u.id
             WHERE cs.class_id = $2 AND cs.is_active = true
             ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC`,
            [id, assignmentResult.rows[0].class_id]
        );

        res.json({
            assignment: assignmentResult.rows[0],
            students: progressResult.rows
        });
    } catch (error) {
        console.error('Get assignment error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch assignment'
        });
    }
});

/**
 * POST /api/teacher/assignments
 * Create new test assignment
 */
router.post('/assignments', async (req, res) => {
    let teacherId = null;
    let schoolId = null;
    let testId = null;
    let classIdsContext = [];
    try {
        const { test_id, class_id, class_ids, start_date, end_date, assignment_type, reveal_answers_after_deadline } = req.body;
        testId = test_id;
        teacherId = req.user.id;
        schoolId = req.user.school_id;
        const normalizedAssignmentType = String(assignment_type || 'test').trim().toLowerCase() === 'control'
            ? 'control'
            : 'test';
        const normalizedRevealAnswers = typeof reveal_answers_after_deadline === 'boolean'
            ? reveal_answers_after_deadline
            : normalizedAssignmentType === 'control';
        const normalizedClassIds = Array.from(new Set(
            (Array.isArray(class_ids) && class_ids.length > 0 ? class_ids : [class_id])
                .map((id) => String(id || '').trim())
                .filter(Boolean)
        ));
        classIdsContext = normalizedClassIds;

        // Validation
        if (!test_id || normalizedClassIds.length === 0 || !start_date || !end_date) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Test, classes, start date and end date are required'
            });
        }

        // Verify test belongs to teacher
        const testCheck = await query(
            'SELECT id FROM tests WHERE id = $1 AND teacher_id = $2 AND school_id = $3',
            [test_id, teacherId, schoolId]
        );

        if (testCheck.rows.length === 0) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Invalid test'
            });
        }

        // Verify teacher has access to all selected classes
        const classAccessResult = await query(
            `SELECT DISTINCT c.id
             FROM classes c
             LEFT JOIN teacher_class_subjects tcs ON c.id = tcs.class_id
             WHERE c.school_id = $1
               AND c.id = ANY($2::uuid[])
               AND (c.homeroom_teacher_id = $3 OR tcs.teacher_id = $3)`,
            [schoolId, normalizedClassIds, teacherId]
        );

        const accessibleIds = new Set(classAccessResult.rows.map((row) => String(row.id)));
        const inaccessibleIds = normalizedClassIds.filter((id) => !accessibleIds.has(String(id)));
        if (inaccessibleIds.length > 0) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'You do not have access to one or more selected classes'
            });
        }

        // Check already active assignments for the selected classes
        const existingCheck = await query(
            `SELECT class_id
             FROM test_assignments
             WHERE test_id = $1
               AND class_id = ANY($2::uuid[])
               AND is_active = true`,
            [test_id, normalizedClassIds]
        );
        const existingClassIds = new Set(existingCheck.rows.map((row) => String(row.class_id)));
        const classIdsToCreate = normalizedClassIds.filter((id) => !existingClassIds.has(String(id)));

        if (classIdsToCreate.length === 0) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'This test is already assigned to selected classes'
            });
        }

        const createdAssignments = [];
        const assignmentColumns = await getTableColumns('test_assignments');
        const hasAssignmentTypeColumn = assignmentColumns.has('assignment_type');
        const hasRevealAnswersColumn = assignmentColumns.has('reveal_answers_after_deadline');

        for (const targetClassId of classIdsToCreate) {
            const insertColumns = ['test_id', 'class_id', 'assigned_by', 'start_date', 'end_date', 'is_active'];
            const insertValues = [test_id, targetClassId, teacherId, start_date, end_date, true];

            if (hasAssignmentTypeColumn) {
                insertColumns.push('assignment_type');
                insertValues.push(normalizedAssignmentType);
            }
            if (hasRevealAnswersColumn) {
                insertColumns.push('reveal_answers_after_deadline');
                insertValues.push(normalizedRevealAnswers);
            }

            const placeholders = insertValues.map((_, idx) => `$${idx + 1}`).join(', ');
            const result = await query(
                `INSERT INTO test_assignments (${insertColumns.join(', ')})
                 VALUES (${placeholders})
                 RETURNING id, class_id, created_at`,
                insertValues
            );
            const assignment = result.rows[0];
            createdAssignments.push(assignment);

            await query(
                `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
                 VALUES ($1, $2, $3, $4, $5)`,
                [teacherId, 'create', 'test_assignment', assignment.id, { test_id, class_id: targetClassId, assignment_type: normalizedAssignmentType }]
            );
        }

        // Send notifications to students in created classes
        try {
            const testInfo = await query(
                `SELECT t.id, t.title, t.duration_minutes as time_limit, t.subject_id, s.name as subject_name
                 FROM tests t
                 JOIN subjects s ON s.id = t.subject_id
                 WHERE t.id = $1`,
                [test_id]
            );

            const baseTest = testInfo.rows[0] || {};
            const language = req.query.lang || 'ru';

            for (const assignment of createdAssignments) {
                const studentsResult = await query(
                    `SELECT u.id, u.role, u.first_name, u.last_name, u.email, u.telegram_id, u.settings
                     FROM users u
                     JOIN class_students cs ON cs.student_id = u.id
                     WHERE cs.class_id = $1
                       AND u.school_id = $2
                       AND cs.is_active = true
                       AND u.is_active = true`,
                    [assignment.class_id, schoolId]
                );

                const testPayload = {
                    ...baseTest,
                    assignment_id: assignment.id
                };

                for (const student of studentsResult.rows) {
                    if (student.email || student.telegram_id) {
                        const studentLang = (student.settings && student.settings.language) || language;
                        notifyNewTest(student, testPayload, studentLang).catch(err => {
                            console.error('Notification error for student:', student.id, err);
                        });
                    }
                }
            }
        } catch (notifyError) {
            console.error('Notification error:', notifyError);
            // Don't fail the request if notifications fail
        }

        res.status(201).json({
            message: createdAssignments.length === normalizedClassIds.length
                ? 'Assignments created successfully'
                : `Assignments created: ${createdAssignments.length}, skipped: ${normalizedClassIds.length - createdAssignments.length}`,
            assignments: createdAssignments
        });
    } catch (error) {
        console.error('Create assignment error:', error);
        await writeAuditSafe(
            teacherId || req.user?.id || null,
            'create_failed',
            'test_assignment',
            testId || null,
            {
                school_id: schoolId || req.user?.school_id || null,
                class_ids: classIdsContext,
                error: error.message || 'Failed to create assignment'
            }
        );
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to create assignment'
        });
    }
});

/**
 * PUT /api/teacher/assignments/:id
 * Update test assignment
 */
router.put('/assignments/:id', async (req, res) => {
    let teacherId = null;
    let assignmentId = null;
    try {
        const { id } = req.params;
        assignmentId = id;
        const { start_date, end_date, is_active, assignment_type, reveal_answers_after_deadline } = req.body;
        teacherId = req.user.id;
        const schoolId = req.user.school_id;
        const normalizedAssignmentType = assignment_type === undefined || assignment_type === null
            ? null
            : (String(assignment_type).trim().toLowerCase() === 'control' ? 'control' : 'test');
        const normalizedRevealAnswers = typeof reveal_answers_after_deadline === 'boolean'
            ? reveal_answers_after_deadline
            : null;

        // Check ownership
        const assignmentCheck = await query(
            `SELECT ta.id
             FROM test_assignments ta
             JOIN classes c ON c.id = ta.class_id
             WHERE ta.id = $1
               AND ta.assigned_by = $2
               AND c.school_id = $3`,
            [id, teacherId, schoolId]
        );

        if (assignmentCheck.rows.length === 0) {
            return res.status(404).json({
                error: 'not_found',
                message: 'Assignment not found'
            });
        }

        const assignmentColumns = await getTableColumns('test_assignments');
        const sets = ['start_date = $1', 'end_date = $2', 'is_active = $3'];
        const values = [start_date, end_date, is_active];
        let idx = 4;

        if (assignmentColumns.has('assignment_type')) {
            sets.push(`assignment_type = COALESCE($${idx}, assignment_type)`);
            values.push(normalizedAssignmentType);
            idx += 1;
        }

        if (assignmentColumns.has('reveal_answers_after_deadline')) {
            sets.push(`reveal_answers_after_deadline = COALESCE($${idx}, reveal_answers_after_deadline)`);
            values.push(normalizedRevealAnswers);
            idx += 1;
        }

        values.push(id);

        await query(
            `UPDATE test_assignments SET ${sets.join(', ')} WHERE id = $${idx}`,
            values
        );

        // Log action
        await query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [teacherId, 'update', 'test_assignment', id, { start_date, end_date, is_active, assignment_type: normalizedAssignmentType, reveal_answers_after_deadline: normalizedRevealAnswers }]
        );

        res.json({ message: 'Assignment updated successfully' });
    } catch (error) {
        console.error('Update assignment error:', error);
        await writeAuditSafe(
            teacherId || req.user?.id || null,
            'update_failed',
            'test_assignment',
            assignmentId || null,
            { error: error.message || 'Failed to update assignment' }
        );
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to update assignment'
        });
    }
});

/**
 * DELETE /api/teacher/assignments/:id
 * Delete test assignment (hard delete with related attempts)
 */
router.delete('/assignments/:id', async (req, res) => {
    let teacherId = null;
    let assignmentId = null;
    try {
        const { id } = req.params;
        assignmentId = id;
        teacherId = req.user.id;
        const schoolId = req.user.school_id;

        // Check ownership
        const assignmentCheck = await query(
            `SELECT ta.id
             FROM test_assignments ta
             JOIN classes c ON c.id = ta.class_id
             WHERE ta.id = $1
               AND ta.assigned_by = $2
               AND c.school_id = $3`,
            [id, teacherId, schoolId]
        );

        if (assignmentCheck.rows.length === 0) {
            return res.status(404).json({
                error: 'not_found',
                message: 'Assignment not found'
            });
        }

        // Hard delete assignment and all related attempts.
        await query('DELETE FROM test_attempts WHERE assignment_id = $1', [id]);
        await query('DELETE FROM test_assignments WHERE id = $1', [id]);

        // Log action
        await query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [teacherId, 'delete', 'test_assignment', id, {}]
        );

        res.json({ message: 'Assignment deleted successfully' });
    } catch (error) {
        console.error('Delete assignment error:', error);
        await writeAuditSafe(
            teacherId || req.user?.id || null,
            'delete_failed',
            'test_assignment',
            assignmentId || null,
            { error: error.message || 'Failed to delete assignment' }
        );
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to delete assignment'
        });
    }
});

/**
 * ========================================
 * RESULTS & ANALYTICS
 * ========================================
 */

/**
 * GET /api/teacher/assignments/:id/results
 * Get detailed results for all students in an assignment
 */
router.get('/assignments/:id/results', async (req, res) => {
    try {
        const { id } = req.params;
        const teacherId = req.user.id;
        const schoolId = req.user.school_id;

        // Verify teacher owns this assignment
        const assignmentCheck = await query(
            `SELECT ta.*, t.title as test_title, t.passing_score, c.name as class_name
             FROM test_assignments ta
             JOIN tests t ON ta.test_id = t.id
             JOIN classes c ON ta.class_id = c.id
             WHERE ta.id = $1 AND ta.assigned_by = $2 AND c.school_id = $3`,
            [id, teacherId, schoolId]
        );

        if (assignmentCheck.rows.length === 0) {
            return res.status(404).json({
                error: 'not_found',
                message: 'Assignment not found'
            });
        }

        const assignment = assignmentCheck.rows[0];

        // Get all attempts for this assignment
        const attemptsResult = await query(
            `SELECT
                att.id as attempt_id,
                att.student_id,
                CONCAT(u.first_name, ' ', u.last_name) as student_name,
                u.username,
                cs.roll_number,
                att.started_at,
                att.submitted_at,
                att.time_spent_seconds,
                att.score,
                att.max_score,
                att.percentage,
                att.is_completed,
                EXISTS (
                    SELECT 1
                    FROM jsonb_each(att.answers) AS answer_entry
                    WHERE answer_entry.value->'is_correct' = 'null'::jsonb
                ) as has_pending_grading
             FROM test_attempts att
             JOIN users u ON att.student_id = u.id
             LEFT JOIN class_students cs ON cs.student_id = u.id AND cs.class_id = $2
             WHERE att.assignment_id = $1 AND att.is_completed = true
             ORDER BY u.last_name ASC, u.first_name ASC, att.submitted_at DESC`,
            [id, assignment.class_id]
        );

        // Get total student count in the class
        const studentCountResult = await query(
            `SELECT COUNT(*) as total_students
             FROM class_students
             WHERE class_id = $1`,
            [assignment.class_id]
        );

        assignment.total_students = parseInt(studentCountResult.rows[0].total_students);

        res.json({
            assignment: assignment,
            attempts: attemptsResult.rows
        });

    } catch (error) {
        console.error('Get assignment results error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch assignment results'
        });
    }
});

/**
 * GET /api/teacher/attempts/:id
 * Get detailed view of a specific student attempt
 */
router.get('/attempts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const teacherId = req.user.id;
        const schoolId = req.user.school_id;

        // Get attempt with validation
        const attemptResult = await query(
            `SELECT
                att.*,
                t.title as test_title,
                t.passing_score,
                u.username,
                CONCAT(u.first_name, ' ', u.last_name) as student_name,
                c.name as class_name,
                s.name as subject_name,
                s.color as subject_color,
                ta.start_date,
                ta.end_date
             FROM test_attempts att
             JOIN tests t ON att.test_id = t.id
             JOIN users u ON att.student_id = u.id
             JOIN test_assignments ta ON att.assignment_id = ta.id
             JOIN classes c ON ta.class_id = c.id
             LEFT JOIN subjects s ON t.subject_id = s.id
             WHERE att.id = $1 AND ta.assigned_by = $2 AND c.school_id = $3`,
            [id, teacherId, schoolId]
        );

        if (attemptResult.rows.length === 0) {
            return res.status(404).json({
                error: 'not_found',
                message: 'Attempt not found'
            });
        }

        const attempt = attemptResult.rows[0];

        const rawAnswers = attempt.answers;
        let answersMap = {};
        if (rawAnswers && typeof rawAnswers === 'object' && !Array.isArray(rawAnswers)) {
            answersMap = rawAnswers;
        } else if (typeof rawAnswers === 'string') {
            try {
                const parsed = JSON.parse(rawAnswers);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    answersMap = parsed;
                }
            } catch (error) {
                answersMap = {};
            }
        }

        const answeredQuestionIds = Object.keys(answersMap);
        let questions = [];

        // Return questions in the same order as saved answer keys for this attempt.
        if (answeredQuestionIds.length > 0) {
            const answeredQuestionsResult = await query(
                `SELECT * FROM test_questions WHERE id::text = ANY($1::text[])`,
                [answeredQuestionIds]
            );

            const byId = new Map(answeredQuestionsResult.rows.map((q) => [String(q.id), q]));
            questions = answeredQuestionIds
                .map((qid) => {
                    const found = byId.get(String(qid));
                    if (found) return found;

                    const answerMeta = answersMap[String(qid)] || {};
                    const snapshot = answerMeta.question_snapshot;
                    if (snapshot && typeof snapshot === 'object') {
                        return {
                            id: snapshot.id || qid,
                            question_type: snapshot.question_type || 'unknown',
                            question_text: snapshot.question_text || 'Question snapshot unavailable.',
                            marks: Number(snapshot.marks) || 0,
                            options: Array.isArray(snapshot.options) ? snapshot.options : [],
                            correct_answer: snapshot.correct_answer ?? null,
                            media_url: snapshot.media_url || null
                        };
                    }

                    return {
                        id: qid,
                        question_type: 'unknown',
                        question_text: 'Question was removed from test after this attempt.',
                        marks: Number(answerMeta.earned_marks) > 0 ? Number(answerMeta.earned_marks) : 0,
                        options: [],
                        correct_answer: null,
                        media_url: null
                    };
                });
        }

        if (questions.length === 0) {
            const questionsResult = await query(
                `SELECT * FROM test_questions WHERE test_id = $1 ORDER BY order_number ASC`,
                [attempt.test_id]
            );
            questions = questionsResult.rows;
        }

        res.json({
            attempt: attempt,
            questions: questions
        });

    } catch (error) {
        console.error('Get attempt error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch attempt details'
        });
    }
});

/**
 * PUT /api/teacher/attempts/:id/grade
 * Manual grading for attempts (control works / short answers / essays)
 *
 * Body:
 *  {
 *    "grades": {
 *      "<question_id>": { "earned_marks": 1.5, "is_correct": true },
 *      "<question_id2>": 0
 *    }
 *  }
 */
router.put('/attempts/:id/grade', async (req, res) => {
    try {
        const { id } = req.params;
        const teacherId = req.user.id;
        const schoolId = req.user.school_id;
        const grades = req.body?.grades;

        if (!grades || typeof grades !== 'object' || Array.isArray(grades)) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Grades payload is required'
            });
        }

        const attemptResult = await query(
            `SELECT att.*, ta.assigned_by, c.school_id
             FROM test_attempts att
             JOIN test_assignments ta ON att.assignment_id = ta.id
             JOIN classes c ON ta.class_id = c.id
             WHERE att.id = $1 AND ta.assigned_by = $2 AND c.school_id = $3`,
            [id, teacherId, schoolId]
        );

        if (attemptResult.rows.length === 0) {
            return res.status(404).json({
                error: 'not_found',
                message: 'Attempt not found'
            });
        }

        const attempt = attemptResult.rows[0];

        // Normalize answers map
        const rawAnswers = attempt.answers;
        let answersMap = {};
        if (rawAnswers && typeof rawAnswers === 'object' && !Array.isArray(rawAnswers)) {
            answersMap = rawAnswers;
        } else if (typeof rawAnswers === 'string') {
            try {
                const parsed = JSON.parse(rawAnswers);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    answersMap = parsed;
                }
            } catch (_) {
                answersMap = {};
            }
        }

        const answeredQuestionIds = Object.keys(answersMap);
        if (answeredQuestionIds.length === 0) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Attempt has no answers to grade'
            });
        }

        // Load question meta (marks + manual flag) for answered questions.
        const questionsResult = await query(
            `SELECT id, question_type, marks, requires_manual_review
             FROM test_questions
             WHERE id::text = ANY($1::text[])`,
            [answeredQuestionIds]
        );
        const byId = new Map(questionsResult.rows.map((q) => [String(q.id), q]));

        const clampNumber = (value, min, max) => {
            const num = Number(value);
            if (!Number.isFinite(num)) return min;
            return Math.max(min, Math.min(max, num));
        };

        const normalizeBool = (value) => {
            if (value === true || value === false) return value;
            if (value === null || value === undefined) return null;
            if (typeof value === 'string') {
                const v = value.trim().toLowerCase();
                if (['true', '1', 'yes'].includes(v)) return true;
                if (['false', '0', 'no'].includes(v)) return false;
            }
            return null;
        };

        // Apply grades
        for (const [questionIdRaw, gradeValue] of Object.entries(grades)) {
            const questionId = String(questionIdRaw);
            const question = byId.get(questionId);

            // If question was removed, allow grading using snapshot marks.
            const snapshotMarks = Number(answersMap[questionId]?.question_snapshot?.marks);
            const maxMarks = Number.isFinite(Number(question?.marks))
                ? Number(question.marks)
                : (Number.isFinite(snapshotMarks) ? snapshotMarks : 0);

            const questionType = String(question?.question_type || answersMap[questionId]?.question_snapshot?.question_type || '').toLowerCase();
            const requiresManual = (question?.requires_manual_review === true) || questionType === 'essay';

            if (!requiresManual) {
                return res.status(400).json({
                    error: 'validation_error',
                    message: `Question ${questionId} does not require manual grading`
                });
            }

            const earned = (gradeValue && typeof gradeValue === 'object' && !Array.isArray(gradeValue))
                ? gradeValue.earned_marks
                : gradeValue;
            const isCorrectRaw = (gradeValue && typeof gradeValue === 'object' && !Array.isArray(gradeValue))
                ? gradeValue.is_correct
                : undefined;

            const earnedMarks = clampNumber(earned, 0, maxMarks);
            const isCorrect = normalizeBool(isCorrectRaw);

            const existing = answersMap[questionId] && typeof answersMap[questionId] === 'object'
                ? answersMap[questionId]
                : {};

            answersMap[questionId] = {
                ...existing,
                earned_marks: earnedMarks,
                // Ensure pending-grading flag is cleared.
                is_correct: isCorrect !== null ? isCorrect : (earnedMarks > 0)
            };
        }

        // Recalculate total score from stored earned_marks (auto + manual).
        let totalScore = 0;
        for (const entry of Object.values(answersMap)) {
            const earned = Number(entry?.earned_marks);
            if (Number.isFinite(earned)) totalScore += earned;
        }

        const maxScore = Number(attempt.max_score) || 0;
        const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;
        const stillPending = Object.values(answersMap).some((entry) => entry && typeof entry === 'object' && entry.is_correct === null);

        await query(
            `UPDATE test_attempts SET
                answers = $1,
                score = $2,
                percentage = $3,
                graded_at = CURRENT_TIMESTAMP,
                graded_by = $4
             WHERE id = $5`,
            [JSON.stringify(answersMap), totalScore, percentage, teacherId, id]
        );

        // Notify student about final results when manual grading is complete.
        if (!stillPending) {
            try {
                const studentResult = await query(
                    `SELECT id, first_name, last_name, email, telegram_id, settings
                     FROM users
                     WHERE id = $1
                     LIMIT 1`,
                    [attempt.student_id]
                );

                const testMetaResult = await query(
                    `SELECT t.id, t.title, t.passing_score, s.name as subject_name
                     FROM tests t
                     LEFT JOIN subjects s ON s.id = t.subject_id
                     WHERE t.id = $1
                     LIMIT 1`,
                    [attempt.test_id]
                );

                const recipient = studentResult.rows[0] || null;
                const testMeta = testMetaResult.rows[0] || null;

                const parseSettings = (raw) => {
                    if (!raw) return {};
                    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
                    if (typeof raw === 'string') {
                        try {
                            const parsed = JSON.parse(raw);
                            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
                        } catch (_) {
                            return {};
                        }
                    }
                    return {};
                };

                const resolveLang = (rawSettings) => {
                    const settings = parseSettings(rawSettings);
                    const profileLanguage = String(settings?.profile?.language || '').trim().toLowerCase();
                    const rootLanguage = String(settings?.language || '').trim().toLowerCase();
                    return profileLanguage === 'uz' || rootLanguage === 'uz' ? 'uz' : 'ru';
                };

                if (recipient && (recipient.email || recipient.telegram_id)) {
                    const passing = Number(testMeta?.passing_score);
                    const passingScore = Number.isFinite(passing) ? passing : 0;
                    const passed = passingScore > 0 ? (percentage >= passingScore) : undefined;
                    const language = resolveLang(recipient.settings);

                    await notifyTestResults(
                        recipient,
                        {
                            type: 'subject',
                            test_id: attempt.test_id,
                            test_title: testMeta?.title || 'Тест',
                            subject_name: testMeta?.subject_name || null,
                            score: totalScore,
                            max_score: maxScore,
                            percentage,
                            passed
                        },
                        language
                    );
                }
            } catch (notifyError) {
                console.error('Manual grading notification error:', notifyError);
            }
        }

        res.json({
            message: 'Attempt graded successfully',
            score: totalScore,
            max_score: maxScore,
            percentage: percentage.toFixed(2)
        });
    } catch (error) {
        console.error('Grade attempt error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to grade attempt'
        });
    }
});

module.exports = router;
