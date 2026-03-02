const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { notifyTestResults } = require('../utils/notifications');

// All routes require student role
router.use(authenticate);
router.use(authorize('student'));

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

async function tableExists(tableName) {
    const result = await query(
        `SELECT 1
         FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = $1
         LIMIT 1`,
        [tableName]
    );
    return result.rows.length > 0;
}

async function getQuestionCountExpr() {
    if (await tableExists('test_questions')) {
        return '(SELECT COUNT(*) FROM test_questions WHERE test_id = t.id)';
    }

    if (await tableExists('questions')) {
        const questionColumns = await getTableColumns('questions');
        if (questionColumns.has('test_id')) {
            return '(SELECT COUNT(*) FROM questions WHERE test_id = t.id)';
        }
    }

    return '0';
}

async function getCareerInterestExpressions() {
    const columnsResult = await query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'career_interests'
    `);
    const columns = new Set(columnsResult.rows.map((row) => row.column_name));

    const col = (name) => (columns.has(name) ? `ci.${name}` : null);
    const nameRu = col('name_ru') || col('name');
    const nameUz = col('name_uz') || col('name');
    const descriptionRu = col('description_ru') || col('description');
    const descriptionUz = col('description_uz') || col('description');
    const icon = col('icon') || 'NULL';
    const color = col('color') || 'NULL';
    const subjects = col('subjects') || 'NULL';
    const schoolId = col('school_id') || null;
    const subjectKeywords = col('subject_keywords') || 'NULL';

    return {
        nameRu,
        nameUz,
        descriptionRu,
        descriptionUz,
        icon,
        color,
        subjects,
        schoolId,
        subjectKeywords
    };
}

function normalizeToken(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function parseSubjects(raw) {
    if (Array.isArray(raw)) {
        return raw.map((item) => String(item || '').trim()).filter(Boolean);
    }
    if (typeof raw === 'string') {
        return raw.split(',').map((item) => item.trim()).filter(Boolean);
    }
    return [];
}

function parseSettings(rawSettings) {
    if (!rawSettings) return {};
    if (typeof rawSettings === 'object' && !Array.isArray(rawSettings)) return rawSettings;
    if (typeof rawSettings === 'string') {
        try {
            const parsed = JSON.parse(rawSettings);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed;
            }
        } catch (error) {
            return {};
        }
    }
    return {};
}

function resolveLanguageFromSettings(rawSettings) {
    const settings = parseSettings(rawSettings);
    const profileLanguage = String(settings?.profile?.language || '').trim().toLowerCase();
    const rootLanguage = String(settings?.language || '').trim().toLowerCase();
    return profileLanguage === 'uz' || rootLanguage === 'uz' ? 'uz' : 'ru';
}

async function getStudentNotificationRecipient(userId) {
    const result = await query(
        `SELECT id, first_name, last_name, email, telegram_id, role, settings
         FROM users
         WHERE id = $1
         LIMIT 1`,
        [userId]
    );
    if (result.rows.length === 0) return null;
    return result.rows[0];
}

async function getTestMetaForNotification(testId) {
    if (!testId) return null;

    const testResult = await query(
        `SELECT id, title, subject_id
         FROM tests
         WHERE id = $1
         LIMIT 1`,
        [testId]
    );
    if (testResult.rows.length === 0) return null;

    const test = testResult.rows[0];
    let subjectName = null;

    if (test.subject_id && await tableExists('subjects')) {
        const subjectColumns = await getTableColumns('subjects');
        const subjectNameColumn = pickColumn(subjectColumns, ['name_ru', 'name', 'name_uz'], null);
        if (subjectNameColumn) {
            const subjectResult = await query(
                `SELECT ${subjectNameColumn} AS name
                 FROM subjects
                 WHERE id = $1
                 LIMIT 1`,
                [test.subject_id]
            );
            subjectName = subjectResult.rows[0]?.name || null;
        }
    }

    return {
        id: test.id,
        title: test.title || 'Тест',
        subject_name: subjectName
    };
}

async function getCareerInterestsBySchool(schoolId) {
    const { nameRu, nameUz, descriptionRu, descriptionUz, icon, color, subjects, schoolId: schoolColumn, subjectKeywords } = await getCareerInterestExpressions();

    const where = schoolColumn
        ? `WHERE ci.school_id = $1 OR ci.school_id IS NULL`
        : '';
    const params = schoolColumn ? [schoolId] : [];

    const interestsResult = await query(`
        SELECT
            ci.id,
            ${nameRu} as name_ru,
            ${nameUz} as name_uz,
            COALESCE(${descriptionRu}, '') as description_ru,
            COALESCE(${descriptionUz}, '') as description_uz,
            ${icon} as icon,
            COALESCE(${color}, '#4A90E2') as color,
            COALESCE(${subjects}, ARRAY[]::text[]) as subjects,
            COALESCE(${subjectKeywords}, '[]'::jsonb) as subject_keywords
        FROM career_interests ci
        ${where}
        ORDER BY ci.id
    `, params);

    return interestsResult.rows;
}

async function getSchoolSubjectsForRecommendations(schoolId) {
    const subjectColumns = await getTableColumns('subjects');
    const nameRuColumn = pickColumn(subjectColumns, ['name_ru', 'name'], 'name');
    const nameUzColumn = pickColumn(subjectColumns, ['name_uz', 'name'], 'name');

    const result = await query(
        `SELECT
            id,
            ${nameRuColumn} AS name_ru,
            ${nameUzColumn} AS name_uz
         FROM subjects
         WHERE school_id = $1
           ${subjectColumns.has('is_active') ? 'AND is_active = true' : ''}
         ORDER BY ${nameRuColumn} NULLS LAST, ${nameUzColumn} NULLS LAST`,
        [schoolId]
    );
    return result.rows;
}

async function getCareerResultsColumns() {
    const columnsResult = await query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'student_career_results'
    `);
    const columns = new Set(columnsResult.rows.map((row) => row.column_name));

    return {
        interestsScores: columns.has('interests_scores'),
        recommendedSubjects: columns.has('recommended_subjects'),
        results: columns.has('results'),
        topInterests: columns.has('top_interests'),
        recommendations: columns.has('recommendations'),
        reliability: columns.has('reliability'),
        attemptNo: columns.has('attempt_no'),
        completedAt: columns.has('completed_at'),
        takenAt: columns.has('taken_at')
    };
}

async function getAttemptStatsExpressions(alias = 'att') {
    const columnsResult = await query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'test_attempts'
    `);
    const columns = new Set(columnsResult.rows.map(row => row.column_name));

    const col = (name) => (columns.has(name) ? `${alias}.${name}` : null);
    const scorePercent = col('percentage') || col('score_percentage');
    const score = col('score');
    const maxScore = col('max_score');
    let scoreExpr = 'NULL';
    if (scorePercent) {
        scoreExpr = scorePercent;
    } else if (score && maxScore) {
        scoreExpr = `(${score}::float / NULLIF(${maxScore}, 0) * 100)`;
    } else if (score) {
        scoreExpr = score;
    }

    const startedAt = col('started_at') || col('created_at') || 'NULL';
    const completedAt = col('submitted_at') || col('completed_at') || col('graded_at') || col('created_at') || 'NULL';
    const persistedTimeSpent = col('time_spent_seconds') || col('time_spent') || col('duration_seconds');
    const timeSpentExpr = persistedTimeSpent
        ? persistedTimeSpent
        : (startedAt !== 'NULL' && completedAt !== 'NULL'
            ? `GREATEST(0, EXTRACT(EPOCH FROM (${completedAt} - ${startedAt})))`
            : 'NULL');

    let completedFilter = 'false';
    if (columns.has('status')) completedFilter = `${alias}.status = 'completed'`;
    else if (columns.has('is_completed')) completedFilter = `${alias}.is_completed = true`;
    else if (completedAt !== 'NULL') completedFilter = `${completedAt} IS NOT NULL`;

    return { scoreExpr, completedFilter, completedAt, startedAt, timeSpentExpr };
}

function normalizeProgressPeriod(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'year' || raw === '365') return 365;
    if (raw === '90') return 90;
    if (raw === '30') return 30;
    return 56; // 8 weeks by default
}

function toDateOnly(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date;
}

function computeCurrentStreakDays(days) {
    const uniqueDays = [...new Set((Array.isArray(days) ? days : [])
        .map(toDateOnly)
        .filter(Boolean)
        .map((day) => day.getTime()))]
        .sort((a, b) => b - a)
        .map((ts) => new Date(ts));

    if (!uniqueDays.length) return 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const first = uniqueDays[0].getTime();
    if (first !== today.getTime() && first !== yesterday.getTime()) {
        return 0;
    }

    let streak = 1;
    for (let i = 1; i < uniqueDays.length; i++) {
        const diffDays = Math.round((uniqueDays[i - 1].getTime() - uniqueDays[i].getTime()) / 86400000);
        if (diffDays === 1) {
            streak += 1;
        } else {
            break;
        }
    }

    return streak;
}

function computeLongestHighScoreStreak(scores, threshold = 80) {
    let current = 0;
    let best = 0;

    (Array.isArray(scores) ? scores : []).forEach((score) => {
        const safeScore = Number(score);
        if (Number.isFinite(safeScore) && safeScore > threshold) {
            current += 1;
            if (current > best) best = current;
        } else {
            current = 0;
        }
    });

    return best;
}

function normalizeTopicKey(value) {
    return String(value || '').trim().toLowerCase();
}

function computeStreakUnlockDate(days, targetStreak = 7) {
    const uniqueDays = [...new Set((Array.isArray(days) ? days : [])
        .map(toDateOnly)
        .filter(Boolean)
        .map((day) => day.getTime()))]
        .sort((a, b) => a - b)
        .map((ts) => new Date(ts));

    if (!uniqueDays.length) return null;

    let streak = 1;
    if (targetStreak <= 1) return uniqueDays[0];
    for (let i = 1; i < uniqueDays.length; i++) {
        const diffDays = Math.round((uniqueDays[i].getTime() - uniqueDays[i - 1].getTime()) / 86400000);
        if (diffDays === 1) {
            streak += 1;
        } else {
            streak = 1;
        }

        if (streak >= targetStreak) {
            return uniqueDays[i];
        }
    }

    return null;
}

function computeRecentAchievement(rows) {
    const safeRows = Array.isArray(rows) ? rows
        .map((row) => ({
            completedAt: row?.completed_at ? new Date(row.completed_at) : null,
            score: Number(row?.score_percent) || 0,
            timeSpent: Number(row?.time_spent_seconds) || 0
        }))
        .filter((row) => row.completedAt && !Number.isNaN(row.completedAt.getTime()))
        .sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime())
        : [];

    if (!safeRows.length) return null;

    let sniperAt = null;
    let lightningAt = null;
    let marathonAt = null;
    let diamondAt = null;

    let above80Streak = 0;
    safeRows.forEach((row, index) => {
        if (!sniperAt && row.score >= 100) {
            sniperAt = row.completedAt;
        }

        if (!lightningAt && row.timeSpent > 0 && row.timeSpent < 300) {
            lightningAt = row.completedAt;
        }

        if (!marathonAt && index + 1 >= 50) {
            marathonAt = row.completedAt;
        }

        if (row.score > 80) {
            above80Streak += 1;
            if (!diamondAt && above80Streak >= 5) {
                diamondAt = row.completedAt;
            }
        } else {
            above80Streak = 0;
        }
    });

    const fireAt = computeStreakUnlockDate(safeRows.map((row) => row.completedAt), 7);

    const unlocks = [
        fireAt ? { id: 'fire', icon: '🔥', title: 'Огонь', unlocked_at: fireAt } : null,
        sniperAt ? { id: 'sniper', icon: '🎯', title: 'Снайпер', unlocked_at: sniperAt } : null,
        diamondAt ? { id: 'diamond', icon: '💎', title: 'Алмаз', unlocked_at: diamondAt } : null,
        lightningAt ? { id: 'lightning', icon: '⚡️', title: 'Молния', unlocked_at: lightningAt } : null,
        marathonAt ? { id: 'marathon', icon: '📚', title: 'Марафонец', unlocked_at: marathonAt } : null
    ].filter(Boolean);

    if (!unlocks.length) return null;

    const threshold = Date.now() - (3 * 86400000);
    const recent = unlocks
        .filter((item) => item.unlocked_at.getTime() >= threshold)
        .sort((a, b) => b.unlocked_at.getTime() - a.unlocked_at.getTime())[0];

    if (!recent) return null;
    return {
        id: recent.id,
        icon: recent.icon,
        title: recent.title,
        unlocked_at: recent.unlocked_at
    };
}

function buildCareerQuestions(interests) {
    const questions = [];

    interests.forEach((interest) => {
        const baseId = `interest-${interest.id}`;
        questions.push({
            id: `${baseId}-1`,
            interest_id: interest.id,
            text_ru: `Мне интересно направление: ${interest.name_ru}`,
            text_uz: `Menga yoqadi: ${interest.name_uz}`
        });
        questions.push({
            id: `${baseId}-2`,
            interest_id: interest.id,
            text_ru: `Я хотел(а) бы больше изучать тему: ${interest.name_ru}`,
            text_uz: `Men ko'proq o'rganmoqchiman: ${interest.name_uz}`
        });
    });

    return questions;
}

async function getSchoolCareerQuestions(schoolId, interests) {
    if (await tableExists('career_question_bank')) {
        const cols = await getTableColumns('career_question_bank');
        const hasIsActive = cols.has('is_active');
        const hasOrderNo = cols.has('order_no');
        const hasTextRu = cols.has('text_ru');
        const hasTextUz = cols.has('text_uz');

        const rows = await query(
            `SELECT
                id,
                interest_id,
                ${hasTextRu ? 'text_ru' : "''::text"} AS text_ru,
                ${hasTextUz ? 'text_uz' : "''::text"} AS text_uz
             FROM career_question_bank
             WHERE school_id = $1
               ${hasIsActive ? 'AND is_active = true' : ''}
             ORDER BY ${hasOrderNo ? 'order_no' : 'id'} ASC, id ASC`,
            [schoolId]
        );

        const mapped = rows.rows
            .filter((row) => row.interest_id && (row.text_ru || row.text_uz))
            .map((row) => ({
                id: String(row.id),
                interest_id: row.interest_id,
                text_ru: String(row.text_ru || '').trim(),
                text_uz: String(row.text_uz || '').trim()
            }));

        if (mapped.length) {
            return mapped;
        }
    }

    return buildCareerQuestions(interests);
}

function computeCareerReliability(answers, scoredInterests) {
    const values = Object.values(answers || {}).map((value) => Number(value)).filter(Number.isFinite);
    const neutralCount = values.filter((value) => value === 3).length;
    const neutralRatio = values.length ? (neutralCount / values.length) : 1;

    const scores = (scoredInterests || []).map((interest) => Number(interest.score) || 0);
    const maxScore = scores.length ? Math.max(...scores) : 0;
    const minScore = scores.length ? Math.min(...scores) : 0;
    const spread = maxScore - minScore;

    let level = 'high';
    if (neutralRatio >= 0.6 || spread < 15) level = 'low';
    else if (neutralRatio >= 0.4 || spread < 25) level = 'medium';

    return {
        level,
        neutral_ratio: Number(neutralRatio.toFixed(4)),
        spread,
        low_confidence: level === 'low'
    };
}

function buildCareerRecommendations(topInterests, schoolSubjects) {
    const schoolRows = Array.isArray(schoolSubjects) ? schoolSubjects : [];
    const byInterest = [];

    const normSubjects = schoolRows.map((subject) => ({
        id: subject.id,
        name_ru: String(subject.name_ru || '').trim(),
        name_uz: String(subject.name_uz || '').trim(),
        ruNorm: normalizeToken(subject.name_ru),
        uzNorm: normalizeToken(subject.name_uz)
    }));

    const uniqRu = [];
    const uniqUz = [];
    const pushUnique = (target, value) => {
        if (!value) return;
        if (!target.includes(value)) target.push(value);
    };

    for (const interest of topInterests || []) {
        const tokens = new Set();
        [interest.name_ru, interest.name_uz].forEach((name) => {
            const norm = normalizeToken(name);
            if (norm) {
                norm.split(' ').forEach((part) => part && tokens.add(part));
                tokens.add(norm);
            }
        });

        for (const subject of parseSubjects(interest.subjects || [])) {
            const norm = normalizeToken(subject);
            if (norm) {
                norm.split(' ').forEach((part) => part && tokens.add(part));
                tokens.add(norm);
            }
        }

        for (const keyword of (Array.isArray(interest.subject_keywords) ? interest.subject_keywords : [])) {
            const norm = normalizeToken(keyword);
            if (norm) {
                norm.split(' ').forEach((part) => part && tokens.add(part));
                tokens.add(norm);
            }
        }

        const matches = normSubjects.filter((subject) => {
            for (const token of tokens) {
                if (!token || token.length < 3) continue;
                if (subject.ruNorm.includes(token) || subject.uzNorm.includes(token)) return true;
            }
            return false;
        }).slice(0, 5);

        const fallback = matches.length ? matches : normSubjects.slice(0, 3);
        const mapped = fallback.map((subject) => ({
            id: subject.id,
            name_ru: subject.name_ru,
            name_uz: subject.name_uz
        }));

        mapped.forEach((subject) => {
            pushUnique(uniqRu, subject.name_ru || subject.name_uz);
            pushUnique(uniqUz, subject.name_uz || subject.name_ru);
        });

        byInterest.push({
            interest_id: interest.id,
            interest_name_ru: interest.name_ru,
            interest_name_uz: interest.name_uz,
            subjects: mapped
        });
    }

    return {
        ru: uniqRu,
        uz: uniqUz,
        by_interest: byInterest,
        fallback_used: byInterest.some((row) => !row.subjects.length)
    };
}

/**
 * ========================================
 * STUDENT ASSIGNMENTS & TESTS
 * ========================================
 */

/**
 * GET /api/student/subjects/all
 * Get all active subjects in student's school
 */
router.get('/subjects/all', async (req, res) => {
    try {
        const schoolId = req.user.school_id;
        const subjectColumns = await getTableColumns('subjects');
        const nameColumn = pickColumn(subjectColumns, ['name', 'name_ru', 'name_uz'], 'name');
        const colorColumn = pickColumn(subjectColumns, ['color'], null);
        const activeFilter = subjectColumns.has('is_active') ? 'AND is_active = true' : '';

        const result = await query(
            `SELECT
                id,
                ${nameColumn} as name,
                ${colorColumn ? colorColumn : 'NULL'} as color
             FROM subjects
             WHERE school_id = $1
               ${activeFilter}
             ORDER BY ${nameColumn} ASC`,
            [schoolId]
        );

        res.json({ subjects: result.rows });
    } catch (error) {
        console.error('Get student subjects error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch subjects'
        });
    }
});

/**
 * GET /api/student/assignments
 * Get all test assignments available to student
 */
router.get('/assignments', async (req, res) => {
    try {
        const { status = 'all' } = req.query;
        const studentId = req.user.id;

        const testColumns = await getTableColumns('tests');
        const subjectColumns = await getTableColumns('subjects');
        const assignmentColumns = await getTableColumns('test_assignments');
        const attemptColumns = await getTableColumns('test_attempts');
        const classStudentColumns = await getTableColumns('class_students');
        const testTitleColumn = pickColumn(testColumns, ['title', 'title_ru', 'title_uz'], 'title');
        const testDescriptionColumn = pickColumn(testColumns, ['description', 'description_ru', 'description_uz'], null);
        const subjectNameColumn = pickColumn(subjectColumns, ['name', 'name_ru', 'name_uz'], 'name');
        const subjectColorColumn = pickColumn(subjectColumns, ['color'], null);
        const durationColumn = pickColumn(testColumns, ['duration_minutes', 'duration', 'time_limit'], null);
        const passingScoreColumn = pickColumn(testColumns, ['passing_score', 'pass_score', 'min_score'], null);
        const maxAttemptsColumn = pickColumn(testColumns, ['max_attempts', 'attempts_limit'], null);
        const startDateColumn = pickColumn(assignmentColumns, ['start_date', 'start_at', 'starts_at'], null);
        const endDateColumn = pickColumn(assignmentColumns, ['end_date', 'end_at', 'ends_at'], null);
        const isActiveColumn = pickColumn(assignmentColumns, ['is_active', 'active'], null);
        const classStudentActiveFilter = classStudentColumns.has('is_active')
            ? 'AND class_students.is_active = true'
            : '';
        const questionCountExpr = await getQuestionCountExpr();

        const completedFilter = attemptColumns.has('status')
            ? "status = 'completed'"
            : attemptColumns.has('is_completed')
                ? 'is_completed = true'
                : attemptColumns.has('submitted_at')
                    ? 'submitted_at IS NOT NULL'
                    : 'false';

        const incompleteFilter = attemptColumns.has('status')
            ? "status != 'completed'"
            : attemptColumns.has('is_completed')
                ? 'is_completed = false'
                : attemptColumns.has('submitted_at')
                    ? 'submitted_at IS NULL'
                    : 'true';

        const bestScoreExpr = attemptColumns.has('percentage')
            ? 'percentage'
            : attemptColumns.has('score') && attemptColumns.has('max_score')
                ? '(score::float / NULLIF(max_score, 0) * 100)'
                : 'NULL';

        // Get student's classes
        const classesResult = await query(
            `SELECT class_id FROM class_students WHERE student_id = $1 ${classStudentActiveFilter}`,
            [studentId]
        );

        if (classesResult.rows.length === 0) {
            return res.json({ assignments: [] });
        }

        const classIds = classesResult.rows.map(row => row.class_id);

        // Build WHERE clause
        let whereClause = `WHERE ta.class_id = ANY($1)`;
        const params = [classIds];

        if (isActiveColumn) {
            whereClause += ` AND ta.${isActiveColumn} = true`;
        }

        if (status === 'active' && startDateColumn && endDateColumn) {
            whereClause += ` AND ta.${startDateColumn} <= CURRENT_TIMESTAMP AND ta.${endDateColumn} > CURRENT_TIMESTAMP`;
        } else if (status === 'upcoming' && startDateColumn) {
            whereClause += ` AND ta.${startDateColumn} > CURRENT_TIMESTAMP`;
        } else if (status === 'completed' && endDateColumn) {
            whereClause += ` AND ta.${endDateColumn} < CURRENT_TIMESTAMP`;
        }

        // Get assignments with test info and student's attempts
        const result = await query(
            `SELECT
                ta.id,
                ta.test_id,
                ta.class_id,
                t.subject_id,
                ${startDateColumn ? `ta.${startDateColumn}` : 'NULL'} as start_date,
                ${endDateColumn ? `ta.${endDateColumn}` : 'NULL'} as end_date,
                t.${testTitleColumn} as test_title,
                ${testDescriptionColumn ? `t.${testDescriptionColumn}` : 'NULL'} as test_description,
                ${durationColumn ? `t.${durationColumn}` : 'NULL'} as duration_minutes,
                ${passingScoreColumn ? `t.${passingScoreColumn}` : 'NULL'} as passing_score,
                ${maxAttemptsColumn ? `t.${maxAttemptsColumn}` : 'NULL'} as max_attempts,
                c.name as class_name,
                s.${subjectNameColumn} as subject_name,
                ${subjectColorColumn ? `s.${subjectColorColumn}` : 'NULL'} as subject_color,
                ${questionCountExpr} as question_count,
                (SELECT COUNT(*) FROM test_attempts WHERE assignment_id = ta.id AND student_id = $2) as attempts_made,
                (SELECT MAX(${bestScoreExpr}) FROM test_attempts WHERE assignment_id = ta.id AND student_id = $2 AND ${completedFilter}) as best_score,
                (SELECT id FROM test_attempts WHERE assignment_id = ta.id AND student_id = $2 AND ${incompleteFilter} ORDER BY started_at DESC LIMIT 1) as ongoing_attempt_id,
                (
                    SELECT CASE WHEN EXISTS (
                        SELECT 1 FROM test_attempts att
                        WHERE att.assignment_id = ta.id
                        AND att.student_id = $2
                        AND ${completedFilter}
                        AND EXISTS (
                            SELECT 1 FROM jsonb_each(att.answers) AS answer_entry
                            WHERE (answer_entry.value->>'is_correct')::text = 'null'
                        )
                    ) THEN true ELSE false END
                ) as has_pending_grading
             FROM test_assignments ta
             JOIN tests t ON ta.test_id = t.id
             JOIN classes c ON ta.class_id = c.id
             LEFT JOIN subjects s ON t.subject_id = s.id
             ${whereClause}
             ORDER BY ${endDateColumn ? `ta.${endDateColumn}` : 'ta.id'} ASC`,
            [...params, studentId]
        );

        res.json({ assignments: result.rows });
    } catch (error) {
        console.error('Get student assignments error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch assignments'
        });
    }
});

/**
 * GET /api/student/assignments/:id
 * Get assignment details
 */
router.get('/assignments/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const studentId = req.user.id;

        const testColumns = await getTableColumns('tests');
        const subjectColumns = await getTableColumns('subjects');
        const assignmentColumns = await getTableColumns('test_assignments');
        const classStudentColumns = await getTableColumns('class_students');
        const testTitleColumn = pickColumn(testColumns, ['title', 'title_ru', 'title_uz'], 'title');
        const testDescriptionColumn = pickColumn(testColumns, ['description', 'description_ru', 'description_uz'], null);
        const subjectNameColumn = pickColumn(subjectColumns, ['name', 'name_ru', 'name_uz'], 'name');
        const subjectColorColumn = pickColumn(subjectColumns, ['color'], null);
        const durationColumn = pickColumn(testColumns, ['duration_minutes', 'duration', 'time_limit'], null);
        const passingScoreColumn = pickColumn(testColumns, ['passing_score', 'pass_score', 'min_score'], null);
        const maxAttemptsColumn = pickColumn(testColumns, ['max_attempts', 'attempts_limit'], null);
        const startDateColumn = pickColumn(assignmentColumns, ['start_date', 'start_at', 'starts_at'], null);
        const endDateColumn = pickColumn(assignmentColumns, ['end_date', 'end_at', 'ends_at'], null);
        const classStudentActiveFilter = classStudentColumns.has('is_active')
            ? 'AND cs.is_active = true'
            : '';
        const questionCountExpr = await getQuestionCountExpr();

        // Verify student has access to this assignment
        const accessCheck = await query(
            `SELECT 1 FROM test_assignments ta
             JOIN class_students cs ON ta.class_id = cs.class_id
             WHERE ta.id = $1 AND cs.student_id = $2 ${classStudentActiveFilter}`,
            [id, studentId]
        );

        if (accessCheck.rows.length === 0) {
            return res.status(403).json({
                error: 'forbidden',
                message: 'You do not have access to this assignment'
            });
        }

        // Get assignment details
        const assignmentResult = await query(
            `SELECT
                ta.*,
                ${startDateColumn ? `ta.${startDateColumn}` : 'NULL'} as start_date,
                ${endDateColumn ? `ta.${endDateColumn}` : 'NULL'} as end_date,
                t.${testTitleColumn} as test_title,
                ${testDescriptionColumn ? `t.${testDescriptionColumn}` : 'NULL'} as test_description,
                ${durationColumn ? `t.${durationColumn}` : 'NULL'} as duration_minutes,
                ${passingScoreColumn ? `t.${passingScoreColumn}` : 'NULL'} as passing_score,
                ${maxAttemptsColumn ? `t.${maxAttemptsColumn}` : 'NULL'} as max_attempts,
                c.name as class_name,
                s.${subjectNameColumn} as subject_name,
                ${subjectColorColumn ? `s.${subjectColorColumn}` : 'NULL'} as subject_color,
                ${questionCountExpr} as question_count
             FROM test_assignments ta
             JOIN tests t ON ta.test_id = t.id
             JOIN classes c ON ta.class_id = c.id
             LEFT JOIN subjects s ON t.subject_id = s.id
             WHERE ta.id = $1`,
            [id]
        );

        // Get student's attempts for this assignment
        const attemptsResult = await query(
            `SELECT id, started_at, submitted_at, score, percentage, is_completed
             FROM test_attempts
             WHERE assignment_id = $1 AND student_id = $2
             ORDER BY started_at DESC`,
            [id, studentId]
        );

        res.json({
            assignment: assignmentResult.rows[0],
            attempts: attemptsResult.rows
        });
    } catch (error) {
        console.error('Get assignment details error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch assignment details'
        });
    }
});

/**
 * POST /api/student/attempts
 * Start a new test attempt
 */
router.post('/attempts', async (req, res) => {
    try {
        const { assignment_id } = req.body;
        const studentId = req.user.id;

        if (!assignment_id) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Assignment ID is required'
            });
        }

        // Get assignment details
        const assignmentResult = await query(
            `SELECT ta.*, t.max_attempts, t.duration_minutes,
                t.shuffle_questions, t.block_copy_paste, t.track_tab_switches, t.fullscreen_required
             FROM test_assignments ta
             JOIN tests t ON ta.test_id = t.id
             JOIN class_students cs ON ta.class_id = cs.class_id
             WHERE ta.id = $1 AND cs.student_id = $2 AND cs.is_active = true`,
            [assignment_id, studentId]
        );

        if (assignmentResult.rows.length === 0) {
            return res.status(403).json({
                error: 'forbidden',
                message: 'You do not have access to this assignment'
            });
        }

        const assignment = assignmentResult.rows[0];

        // Check if assignment is active
        const now = new Date();
        const startDate = new Date(assignment.start_date);
        const endDate = new Date(assignment.end_date);

        if (now < startDate) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'This test has not started yet'
            });
        }

        if (now > endDate) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'This test has ended'
            });
        }

        // Check if student has ongoing attempt
        const ongoingCheck = await query(
            'SELECT id FROM test_attempts WHERE assignment_id = $1 AND student_id = $2 AND is_completed = false',
            [assignment_id, studentId]
        );

        if (ongoingCheck.rows.length > 0) {
            return res.json({
                message: 'You have an ongoing attempt',
                attempt_id: ongoingCheck.rows[0].id
            });
        }

        // Check if student has reached max attempts
        const attemptsCount = await query(
            'SELECT COUNT(*) FROM test_attempts WHERE assignment_id = $1 AND student_id = $2',
            [assignment_id, studentId]
        );

        if (parseInt(attemptsCount.rows[0].count) >= assignment.max_attempts) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'You have reached the maximum number of attempts'
            });
        }

        // Get test questions
        const questionsResult = await query(
            `SELECT id, question_type, question_text, options, marks, order_number, media_url
             FROM test_questions
             WHERE test_id = $1
             ORDER BY order_number ASC`,
            [assignment.test_id]
        );

        const baseQuestions = questionsResult.rows;

        // Calculate max score
        const maxScore = baseQuestions.reduce((sum, q) => sum + parseFloat(q.marks), 0);

        // Create new attempt
        const attemptResult = await query(
            `INSERT INTO test_attempts (
                test_id, student_id, assignment_id, started_at,
                max_score, is_completed, answers
             )
             VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, false, '{}'::jsonb)
             RETURNING id, started_at`,
            [assignment.test_id, studentId, assignment_id, maxScore]
        );

        const attemptId = attemptResult.rows[0].id;
        const questions = assignment.shuffle_questions
            ? shuffleQuestions(baseQuestions, attemptId)
            : baseQuestions;

        res.status(201).json({
            message: 'Test attempt started',
            attempt_id: attemptId,
            started_at: attemptResult.rows[0].started_at,
            duration_minutes: assignment.duration_minutes,
            questions: questions
        });
    } catch (error) {
        console.error('Start attempt error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to start test attempt'
        });
    }
});

/**
 * GET /api/student/attempts/:id
 * Get attempt details (for ongoing or completed attempts)
 */
router.get('/attempts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const studentId = req.user.id;

        // Get attempt with validation
        const attemptResult = await query(
            `SELECT
            ta.*, t.title as test_title, t.duration_minutes, t.passing_score,
            t.shuffle_questions, t.block_copy_paste, t.track_tab_switches, t.fullscreen_required,
                tass.start_date, tass.end_date,
                s.name as subject_name, s.color as subject_color
             FROM test_attempts ta
             JOIN tests t ON ta.test_id = t.id
             JOIN test_assignments tass ON ta.assignment_id = tass.id
             LEFT JOIN subjects s ON t.subject_id = s.id
             WHERE ta.id = $1 AND ta.student_id = $2`,
            [id, studentId]
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

        // For completed attempts, return questions matching saved answers first.
        if (attempt.is_completed && answeredQuestionIds.length > 0) {
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

        // Fallback for ongoing attempts or when there are no saved answers.
        if (questions.length === 0) {
            const questionsQuery = attempt.is_completed
                ? `SELECT * FROM test_questions WHERE test_id = $1 ORDER BY order_number ASC`
                : `SELECT id, question_type, question_text, options, marks, order_number, media_url
                   FROM test_questions WHERE test_id = $1 ORDER BY order_number ASC`;

            const questionsResult = await query(questionsQuery, [attempt.test_id]);
            questions = attempt.shuffle_questions && !attempt.is_completed
                ? shuffleQuestions(questionsResult.rows, attempt.id)
                : questionsResult.rows;
        }

        res.json({
            attempt: attempt,
            questions: questions
        });
    } catch (error) {
        console.error('Get attempt error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch attempt'
        });
    }
});

/**
 * PUT /api/student/attempts/:id/submit
 * Submit test answers and complete attempt
 */
router.put('/attempts/:id/submit', async (req, res) => {
    try {
        const { id } = req.params;
        const { answers, tab_switches, copy_attempts, suspicious_activity } = req.body;
        const studentId = req.user.id;
        const submittedAnswers = answers && typeof answers === 'object' ? answers : {};

        const normalizeString = (value) => String(value ?? '').trim().toLowerCase();
        const normalizeNumber = (value) => {
            const numberValue = Number(value);
            return Number.isFinite(numberValue) ? numberValue : null;
        };
        const normalizeBoolean = (value) => {
            if (typeof value === 'boolean') return value;
            const stringValue = normalizeString(value);
            if (['true', '1', 'yes'].includes(stringValue)) return true;
            if (['false', '0', 'no'].includes(stringValue)) return false;
            return null;
        };
        const normalizeArray = (value) => Array.isArray(value) ? value : [];
        const compareOrderedArrays = (a, b) => {
            if (a.length !== b.length) return false;
            for (let i = 0; i < a.length; i++) {
                if (normalizeString(a[i]) !== normalizeString(b[i])) return false;
            }
            return true;
        };
        const compareUnorderedArrays = (a, b) => {
            if (a.length !== b.length) return false;
            const left = a.map(item => normalizeString(item)).sort();
            const right = b.map(item => normalizeString(item)).sort();
            return left.every((value, index) => value === right[index]);
        };

        // Get attempt with validation
        const attemptResult = await query(
            `SELECT ta.*, t.passing_score
             FROM test_attempts ta
             JOIN tests t ON ta.test_id = t.id
             WHERE ta.id = $1 AND ta.student_id = $2 AND ta.is_completed = false`,
            [id, studentId]
        );

        if (attemptResult.rows.length === 0) {
            return res.status(404).json({
                error: 'not_found',
                message: 'Active attempt not found'
            });
        }

        const attempt = attemptResult.rows[0];

        // Get questions with full data to store immutable snapshot in attempt answers
        const questionsResult = await query(
            `SELECT id, question_type, question_text, options, correct_answer, marks, media_url
             FROM test_questions
             WHERE test_id = $1
             ORDER BY order_number ASC`,
            [attempt.test_id]
        );

        // Grade the test
        let totalScore = 0;
        const gradedAnswers = {};

        questionsResult.rows.forEach(question => {
            const studentAnswer = submittedAnswers[question.id];
            const correctAnswer = question.correct_answer;
            let isCorrect = false;
            let earnedMarks = 0;

            if (studentAnswer !== undefined && studentAnswer !== null) {
                switch (question.question_type) {
                    case 'singlechoice':
                    case 'imagebased': {
                        const studentNumber = normalizeNumber(studentAnswer);
                        const correctNumber = normalizeNumber(correctAnswer);
                        if (studentNumber !== null && correctNumber !== null) {
                            isCorrect = studentNumber === correctNumber;
                        } else {
                            isCorrect = normalizeString(studentAnswer) === normalizeString(correctAnswer);
                        }
                        break;
                    }

                    case 'truefalse': {
                        const studentBoolean = normalizeBoolean(studentAnswer);
                        const correctBoolean = normalizeBoolean(correctAnswer);
                        if (studentBoolean !== null && correctBoolean !== null) {
                            isCorrect = studentBoolean === correctBoolean;
                        } else {
                            isCorrect = normalizeString(studentAnswer) === normalizeString(correctAnswer);
                        }
                        break;
                    }

                    case 'multiplechoice': {
                        const correctArray = normalizeArray(correctAnswer);
                        const studentArray = normalizeArray(studentAnswer);
                        isCorrect = compareUnorderedArrays(correctArray, studentArray);
                        break;
                    }

                    case 'shortanswer': {
                        const acceptableAnswers = Array.isArray(correctAnswer) ? correctAnswer : [correctAnswer];
                        isCorrect = acceptableAnswers.some(ans =>
                            normalizeString(ans) === normalizeString(studentAnswer)
                        );
                        break;
                    }

                    case 'ordering':
                    case 'matching': {
                        const correctOrder = normalizeArray(correctAnswer);
                        const studentOrder = normalizeArray(studentAnswer);
                        isCorrect = compareOrderedArrays(correctOrder, studentOrder);
                        break;
                    }

                    case 'fillblanks':
                    case 'fill_blanks':
                    case 'fill_in_blank':
                    case 'fill_in_blanks': {
                        const correctBlanks = normalizeArray(correctAnswer);
                        const studentBlanks = normalizeArray(studentAnswer);
                        isCorrect = correctBlanks.length === studentBlanks.length &&
                            correctBlanks.every((ans, idx) =>
                                normalizeString(ans) === normalizeString(studentBlanks[idx])
                            );
                        break;
                    }

                }

                if (isCorrect === true) {
                    earnedMarks = parseFloat(question.marks);
                    totalScore += earnedMarks;
                }
            }

            gradedAnswers[question.id] = {
                student_answer: studentAnswer,
                is_correct: isCorrect,
                earned_marks: earnedMarks,
                question_snapshot: {
                    id: question.id,
                    question_type: question.question_type,
                    question_text: question.question_text,
                    options: Array.isArray(question.options) ? question.options : [],
                    correct_answer: question.correct_answer,
                    marks: Number(question.marks) || 0,
                    media_url: question.media_url || null
                }
            };
        });

        // Calculate time spent
        const startedAt = new Date(attempt.started_at);
        const submittedAt = new Date();
        const timeSpentSeconds = Math.floor((submittedAt - startedAt) / 1000);

        // Calculate percentage
        const percentage = attempt.max_score > 0 ? (totalScore / attempt.max_score) * 100 : 0;

        // Update attempt
        await query(
            `UPDATE test_attempts SET
                submitted_at = CURRENT_TIMESTAMP,
                time_spent_seconds = $1,
                score = $2,
                percentage = $3,
                answers = $4,
                tab_switches = $5,
                copy_attempts = $6,
                suspicious_activity = $7,
                is_completed = true
             WHERE id = $8`,
            [
                timeSpentSeconds,
                totalScore,
                percentage,
                JSON.stringify(gradedAnswers),
                Number.isInteger(tab_switches) ? tab_switches : 0,
                Number.isInteger(copy_attempts) ? copy_attempts : 0,
                JSON.stringify(Array.isArray(suspicious_activity) ? suspicious_activity : []),
                id
            ]
        );

        try {
            const recipient = await getStudentNotificationRecipient(studentId);
            if (recipient) {
                const language = resolveLanguageFromSettings(recipient.settings);
                const testMeta = await getTestMetaForNotification(attempt.test_id);
                await notifyTestResults(
                    recipient,
                    {
                        type: 'subject',
                        test_id: attempt.test_id,
                        test_title: testMeta?.title || 'Тест',
                        subject_name: testMeta?.subject_name || null,
                        score: totalScore,
                        max_score: attempt.max_score,
                        percentage,
                        passed: percentage >= attempt.passing_score
                    },
                    language
                );
            }
        } catch (notifyError) {
            console.error('Subject test results notification error:', notifyError);
        }

        res.json({
            message: 'Test submitted successfully',
            score: totalScore,
            max_score: attempt.max_score,
            percentage: percentage.toFixed(2),
            passed: percentage >= attempt.passing_score,
            time_spent_seconds: timeSpentSeconds
        });
    } catch (error) {
        console.error('Submit attempt error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to submit test'
        });
    }
});

/**
 * PUT /api/student/attempts/:id/save
 * Save progress without submitting
 */
router.put('/attempts/:id/save', async (req, res) => {
    try {
        const { id } = req.params;
        const { answers, tab_switches, copy_attempts, suspicious_activity } = req.body;
        const studentId = req.user.id;

        // Verify attempt belongs to student and is not completed
        const attemptCheck = await query(
            'SELECT id FROM test_attempts WHERE id = $1 AND student_id = $2 AND is_completed = false',
            [id, studentId]
        );

        if (attemptCheck.rows.length === 0) {
            return res.status(404).json({
                error: 'not_found',
                message: 'Active attempt not found'
            });
        }

        // Save answers without grading
        await query(
            `UPDATE test_attempts SET
                answers = $1,
                tab_switches = $2,
                copy_attempts = $3,
                suspicious_activity = $4
             WHERE id = $5`,
            [
                JSON.stringify(answers),
                Number.isInteger(tab_switches) ? tab_switches : 0,
                Number.isInteger(copy_attempts) ? copy_attempts : 0,
                JSON.stringify(Array.isArray(suspicious_activity) ? suspicious_activity : []),
                id
            ]
        );

        res.json({ message: 'Progress saved' });
    } catch (error) {
        console.error('Save progress error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to save progress'
        });
    }
});

/**
 * GET /api/student/results
 * Get student's test results/history
 */
router.get('/results', async (req, res) => {
    try {
        const studentId = req.user.id;

        const result = await query(
            `SELECT
                ta.id as attempt_id, ta.started_at, ta.submitted_at,
                ta.score, ta.max_score, ta.percentage, ta.is_completed,
                t.title as test_title, t.passing_score,
                s.name as subject_name, s.color as subject_color,
                tass.id as assignment_id,
                c.name as class_name
             FROM test_attempts ta
             JOIN tests t ON ta.test_id = t.id
             JOIN test_assignments tass ON ta.assignment_id = tass.id
             JOIN classes c ON tass.class_id = c.id
             LEFT JOIN subjects s ON t.subject_id = s.id
             WHERE ta.student_id = $1 AND ta.is_completed = true
             ORDER BY ta.submitted_at DESC
             LIMIT 50`,
            [studentId]
        );

        res.json({ results: result.rows });
    } catch (error) {
        console.error('Get results error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch results'
        });
    }
});

/**
 * GET /api/student/classes
 * Get student's active classes for filtering
 */
router.get('/classes', async (req, res) => {
    try {
        const studentId = req.user.id;
        const classStudentColumns = await getTableColumns('class_students');
        const classColumns = await getTableColumns('classes');
        const gradeColumn = pickColumn(classColumns, ['grade_level', 'grade'], null);
        const academicYearColumn = pickColumn(classColumns, ['academic_year'], null);
        const classStudentActiveFilter = classStudentColumns.has('is_active')
            ? 'AND cs.is_active = true'
            : '';

        const result = await query(
            `SELECT c.id,
                c.name,
                ${gradeColumn ? `c.${gradeColumn}` : 'NULL'} as grade_level,
                ${academicYearColumn ? `c.${academicYearColumn}` : 'NULL'} as academic_year
             FROM classes c
             JOIN class_students cs ON cs.class_id = c.id
             WHERE cs.student_id = $1 ${classStudentActiveFilter}
             ORDER BY c.name ASC`,
            [studentId]
        );

        res.json({ classes: result.rows });
    } catch (error) {
        console.error('Get student classes error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch classes'
        });
    }
});

/**
 * GET /api/student/my-class/overview
 * Get student's class overview, classmates and active assignments
 */
router.get('/my-class/overview', async (req, res) => {
    try {
        const studentId = req.user.id;
        const classStudentColumns = await getTableColumns('class_students');
        const classStudentActiveFilter = classStudentColumns.has('is_active')
            ? 'AND cs.is_active = true'
            : '';

        const classResult = await query(
            `SELECT
                c.id,
                c.name,
                c.grade_level,
                c.academic_year,
                c.homeroom_teacher_id,
                CONCAT(ht.first_name, ' ', ht.last_name) as homeroom_teacher_name
             FROM class_students cs
             JOIN classes c ON c.id = cs.class_id
             LEFT JOIN users ht ON ht.id = c.homeroom_teacher_id
             WHERE cs.student_id = $1 ${classStudentActiveFilter}
             ORDER BY c.name ASC
             LIMIT 1`,
            [studentId]
        );

        if (!classResult.rows.length) {
            return res.json({
                has_class: false,
                class: null,
                me: null,
                classmates: [],
                assignments: [],
                subjects: []
            });
        }

        const activeClass = classResult.rows[0];

        const classStatsResult = await query(
            `SELECT COUNT(*)::int as student_count
             FROM class_students cs
             WHERE cs.class_id = $1 ${classStudentActiveFilter}`,
            [activeClass.id]
        );

        const myStatsResult = await query(
            `SELECT
                COUNT(att.id) FILTER (WHERE att.is_completed = true)::int as tests_completed,
                AVG(att.percentage) FILTER (WHERE att.is_completed = true)::float as avg_score
             FROM test_assignments ta
             LEFT JOIN test_attempts att ON att.assignment_id = ta.id AND att.student_id = $2
             WHERE ta.class_id = $1`,
            [activeClass.id, studentId]
        );

        const activeAssignmentsResult = await query(
            `SELECT
                ta.id,
                t.title as test_title,
                s.name as subject_name,
                ta.end_date,
                (
                    SELECT CASE
                        WHEN EXISTS (
                            SELECT 1 FROM test_attempts att
                            WHERE att.assignment_id = ta.id
                              AND att.student_id = $2
                              AND att.is_completed = true
                        ) THEN 'completed'
                        WHEN EXISTS (
                            SELECT 1 FROM test_attempts att
                            WHERE att.assignment_id = ta.id
                              AND att.student_id = $2
                              AND att.is_completed = false
                        ) THEN 'in_progress'
                        ELSE 'not_started'
                    END
                ) as my_status
             FROM test_assignments ta
             JOIN tests t ON t.id = ta.test_id
             LEFT JOIN subjects s ON s.id = t.subject_id
             WHERE ta.class_id = $1
               AND ta.is_active = true
               AND ta.end_date >= CURRENT_TIMESTAMP
             ORDER BY ta.end_date ASC`,
            [activeClass.id, studentId]
        );

        const classmatesResult = await query(
            `SELECT
                u.id,
                cs.roll_number::text as roll_number,
                CONCAT(u.first_name, ' ', u.last_name) as full_name,
                COUNT(att.id) FILTER (WHERE att.is_completed = true)::int as tests_completed,
                AVG(att.percentage) FILTER (WHERE att.is_completed = true)::float as avg_score
             FROM class_students cs
             JOIN users u ON u.id = cs.student_id
             LEFT JOIN test_assignments ta ON ta.class_id = cs.class_id
             LEFT JOIN test_attempts att ON att.assignment_id = ta.id AND att.student_id = u.id
             WHERE cs.class_id = $1 ${classStudentActiveFilter}
             GROUP BY u.id, cs.roll_number
             ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC`,
            [activeClass.id]
        );

        const rankResult = await query(
            `WITH class_scores AS (
                SELECT
                    u.id as student_id,
                    AVG(att.percentage) FILTER (WHERE att.is_completed = true)::float as avg_score
                FROM class_students cs
                JOIN users u ON u.id = cs.student_id
                LEFT JOIN test_assignments ta ON ta.class_id = cs.class_id
                LEFT JOIN test_attempts att ON att.assignment_id = ta.id AND att.student_id = u.id
                WHERE cs.class_id = $1 ${classStudentActiveFilter}
                GROUP BY u.id
            )
            SELECT
                ranked.student_id,
                ranked.avg_score,
                ranked.rank,
                total.total_students
            FROM (
                SELECT
                    student_id,
                    avg_score,
                    DENSE_RANK() OVER (ORDER BY COALESCE(avg_score, 0) DESC) as rank
                FROM class_scores
            ) ranked
            CROSS JOIN (SELECT COUNT(*)::int as total_students FROM class_scores) total
            WHERE ranked.student_id = $2
            LIMIT 1`,
            [activeClass.id, studentId]
        );

        const subjectsResult = await query(
            `SELECT
                s.id as subject_id,
                s.name as subject_name,
                AVG(att.percentage) FILTER (WHERE att.is_completed = true)::float as class_avg_score,
                AVG(att_me.percentage) FILTER (WHERE att_me.is_completed = true)::float as my_avg_score
             FROM test_assignments ta
             JOIN tests t ON t.id = ta.test_id
             LEFT JOIN subjects s ON s.id = t.subject_id
             LEFT JOIN test_attempts att ON att.assignment_id = ta.id
             LEFT JOIN test_attempts att_me ON att_me.assignment_id = ta.id AND att_me.student_id = $2
             WHERE ta.class_id = $1
             GROUP BY s.id, s.name
             ORDER BY class_avg_score DESC NULLS LAST`,
            [activeClass.id, studentId]
        );

        const myStats = myStatsResult.rows[0] || {};
        const rankRow = rankResult.rows[0] || {};

        res.json({
            has_class: true,
            class: {
                ...activeClass,
                student_count: classStatsResult.rows[0]?.student_count || 0
            },
            me: {
                rank: rankRow.rank || null,
                total_students: rankRow.total_students || (classStatsResult.rows[0]?.student_count || 0),
                avg_score: myStats.avg_score || 0,
                tests_completed: myStats.tests_completed || 0,
                active_assignments: activeAssignmentsResult.rows.length
            },
            classmates: classmatesResult.rows,
            assignments: activeAssignmentsResult.rows,
            subjects: subjectsResult.rows
        });
    } catch (error) {
        console.error('Get student my-class overview error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch class overview'
        });
    }
});

/**
 * GET /api/student/subjects
 * Get subjects taught to student (including subjects without assignments)
 */
router.get('/subjects', async (req, res) => {
    try {
        const studentId = req.user.id;
        const schoolId = req.user.school_id;
        const subjectColumns = await getTableColumns('subjects');
        const classStudentColumns = await getTableColumns('class_students');
        const hasTeacherClassSubjects = await tableExists('teacher_class_subjects');
        const teacherClassSubjectColumns = hasTeacherClassSubjects
            ? await getTableColumns('teacher_class_subjects')
            : new Set();
        const subjectNameColumn = pickColumn(subjectColumns, ['name', 'name_ru', 'name_uz'], 'name');
        const classStudentActiveFilter = classStudentColumns.has('is_active')
            ? 'AND cs.is_active = true'
            : '';
        const subjectActiveFilter = subjectColumns.has('is_active')
            ? 'AND s.is_active = true'
            : '';
        const teacherClassSubjectActiveFilter = teacherClassSubjectColumns.has('is_active')
            ? 'AND tcs.is_active = true'
            : '';

        const taughtSubjectsSource = hasTeacherClassSubjects
            ? `SELECT DISTINCT tcs.subject_id
               FROM class_students cs
               INNER JOIN teacher_class_subjects tcs ON tcs.class_id = cs.class_id
               WHERE cs.student_id = $1 ${classStudentActiveFilter} ${teacherClassSubjectActiveFilter}`
            : `SELECT DISTINCT t.subject_id
               FROM class_students cs
               INNER JOIN test_assignments ta ON ta.class_id = cs.class_id
               INNER JOIN tests t ON t.id = ta.test_id
               WHERE cs.student_id = $1 ${classStudentActiveFilter}`;

        const result = await query(
            `WITH student_subjects AS (
                ${taughtSubjectsSource}
            )
            SELECT DISTINCT s.id,
                s.${subjectNameColumn} as name,
                s.color
             FROM student_subjects ss
             JOIN subjects s ON s.id = ss.subject_id
             WHERE s.school_id = $2
               ${subjectActiveFilter}
               AND s.id IS NOT NULL
             ORDER BY s.${subjectNameColumn} ASC`,
            [studentId, schoolId]
        );

        res.json({ subjects: result.rows });
    } catch (error) {
        console.error('Get student subjects error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch subjects'
        });
    }
});

/**
 * GET /api/student/progress/overview
 * Progress overview for student dashboard
 */
router.get('/progress/overview', async (req, res) => {
    try {
        const studentId = req.user.id;
        const periodDays = normalizeProgressPeriod(req.query.period);
        const selectedSubjectIdRaw = String(req.query.subject_id || '').trim();
        const selectedSubjectId = selectedSubjectIdRaw && selectedSubjectIdRaw !== 'all'
            ? selectedSubjectIdRaw
            : null;
        const classStudentColumns = await getTableColumns('class_students');
        const classStudentActiveFilter = classStudentColumns.has('is_active')
            ? 'AND cs.is_active = true'
            : '';
        const subjectColumns = await getTableColumns('subjects');
        const subjectNameColumn = pickColumn(subjectColumns, ['name', 'name_ru', 'name_uz'], 'name');
        const subjectActiveFilter = subjectColumns.has('is_active')
            ? 'AND s.is_active = true'
            : '';
        const attempt = await getAttemptStatsExpressions();

        const testsAssignedResult = await query(`
            SELECT COUNT(DISTINCT ta.id) as count
            FROM test_assignments ta
            INNER JOIN class_students cs ON cs.class_id = ta.class_id
            WHERE cs.student_id = $1 ${classStudentActiveFilter}
        `, [studentId]);
        const testsAssigned = parseInt(testsAssignedResult.rows[0]?.count || 0);

        const testsCompletedResult = await query(`
            SELECT COUNT(DISTINCT COALESCE(att.assignment_id::text, att.test_id::text)) as count
            FROM test_attempts att
            WHERE att.student_id = $1 AND ${attempt.completedFilter}
        `, [studentId]);
        const testsCompleted = parseInt(testsCompletedResult.rows[0]?.count || 0);

        const statsResult = await query(`
            SELECT
                AVG(${attempt.scoreExpr})::float as avg_score,
                AVG(${attempt.scoreExpr}) FILTER (
                    WHERE ${attempt.completedAt} >= CURRENT_DATE - INTERVAL '30 days'
                )::float as avg_score_30,
                AVG(${attempt.scoreExpr}) FILTER (
                    WHERE ${attempt.completedAt} < CURRENT_DATE - INTERVAL '30 days'
                      AND ${attempt.completedAt} >= CURRENT_DATE - INTERVAL '60 days'
                )::float as avg_score_prev_30,
                COALESCE(SUM(${attempt.timeSpentExpr})::bigint, 0) as total_time_spent_seconds
            FROM test_attempts att
            WHERE att.student_id = $1
              AND ${attempt.completedFilter}
        `, [studentId]);

        const trendParams = [studentId, periodDays];
        let trendSubjectFilter = '';
        if (selectedSubjectId) {
            trendParams.push(selectedSubjectId);
            trendSubjectFilter = `AND t.subject_id = $${trendParams.length}`;
        }

        const trendResult = await query(`
            SELECT
                DATE_TRUNC('week', ${attempt.completedAt}) as period,
                COUNT(att.id)::int as attempts,
                AVG(${attempt.scoreExpr})::float as avg_score
            FROM test_attempts att
            JOIN tests t ON t.id = att.test_id
            WHERE att.student_id = $1
              AND ${attempt.completedFilter}
              AND ${attempt.completedAt} >= CURRENT_DATE - ($2::text || ' days')::interval
              ${trendSubjectFilter}
            GROUP BY DATE_TRUNC('week', ${attempt.completedAt})
            ORDER BY period ASC
        `, trendParams);

        const subjectResult = await query(`
            WITH subject_pool AS (
                SELECT DISTINCT s.id, s.${subjectNameColumn} as subject_name, s.color as subject_color
                FROM class_students cs
                JOIN test_assignments ta ON ta.class_id = cs.class_id
                JOIN tests t ON t.id = ta.test_id
                JOIN subjects s ON s.id = t.subject_id
                WHERE cs.student_id = $1 ${classStudentActiveFilter} ${subjectActiveFilter}
                UNION
                SELECT DISTINCT s.id, s.${subjectNameColumn} as subject_name, s.color as subject_color
                FROM test_attempts att
                JOIN tests t ON t.id = att.test_id
                JOIN subjects s ON s.id = t.subject_id
                WHERE att.student_id = $1 ${subjectActiveFilter}
            ),
            attempts_by_subject AS (
                SELECT
                    t.subject_id,
                    COUNT(att.id)::int as attempts,
                    AVG(${attempt.scoreExpr})::float as avg_score
                FROM test_attempts att
                JOIN tests t ON t.id = att.test_id
                WHERE att.student_id = $1
                  AND ${attempt.completedFilter}
                  AND t.subject_id IS NOT NULL
                GROUP BY t.subject_id
            )
            SELECT
                sp.id,
                sp.subject_name,
                sp.subject_color,
                COALESCE(abs.attempts, 0)::int as attempts,
                COALESCE(abs.avg_score, 0)::float as avg_score
            FROM subject_pool sp
            LEFT JOIN attempts_by_subject abs ON abs.subject_id = sp.id
            ORDER BY sp.subject_name ASC
        `, [studentId]);

        const topicsResult = await query(`
            SELECT
                t.subject_id,
                COALESCE(NULLIF(TRIM(t.title), ''), 'Тема без названия') as topic_name,
                COUNT(att.id)::int as attempts,
                AVG(${attempt.scoreExpr})::float as avg_score
            FROM test_attempts att
            JOIN tests t ON t.id = att.test_id
            WHERE att.student_id = $1
              AND ${attempt.completedFilter}
              AND t.subject_id IS NOT NULL
            GROUP BY t.subject_id, COALESCE(NULLIF(TRIM(t.title), ''), 'Тема без названия')
            ORDER BY t.subject_id ASC, attempts DESC, topic_name ASC
        `, [studentId]);

        const weakTopicsResult = await query(`
            SELECT
                COALESCE(NULLIF(TRIM(t.title), ''), 'Тема без названия') as topic_name,
                COUNT(att.id)::int as error_tests
            FROM test_attempts att
            JOIN tests t ON t.id = att.test_id
            WHERE att.student_id = $1
              AND ${attempt.completedFilter}
              AND COALESCE(${attempt.scoreExpr}, 0) < 100
            GROUP BY COALESCE(NULLIF(TRIM(t.title), ''), 'Тема без названия')
            ORDER BY error_tests DESC, topic_name ASC
            LIMIT 3
        `, [studentId]);

        const streakDaysResult = await query(`
            SELECT DISTINCT DATE(${attempt.completedAt}) as day
            FROM test_attempts att
            WHERE att.student_id = $1
              AND ${attempt.completedFilter}
            ORDER BY day DESC
            LIMIT 180
        `, [studentId]);

        const achievementsInputResult = await query(`
            SELECT
                ${attempt.completedAt} as completed_at,
                DATE(${attempt.completedAt}) as day,
                (${attempt.scoreExpr})::float as score_percent,
                (${attempt.timeSpentExpr})::float as time_spent_seconds
            FROM test_attempts att
            WHERE att.student_id = $1
              AND ${attempt.completedFilter}
            ORDER BY ${attempt.completedAt} ASC
        `, [studentId]);

        const completionRate = testsAssigned > 0
            ? Math.min(100, Math.round((testsCompleted / testsAssigned) * 100))
            : 0;

        const statsRow = statsResult.rows[0] || {};
        const avgScore = parseFloat(statsRow.avg_score || 0);
        const avgScore30 = parseFloat(statsRow.avg_score_30 || 0);
        const avgScorePrev30 = parseFloat(statsRow.avg_score_prev_30 || 0);
        const avgTrendDelta = avgScore30 - avgScorePrev30;
        const totalTimeSpentSeconds = parseInt(statsRow.total_time_spent_seconds || 0, 10);

        const streakDays = computeCurrentStreakDays(streakDaysResult.rows.map((row) => row.day));
        const achievementRows = achievementsInputResult.rows || [];
        const achievementScores = achievementRows.map((row) => Number(row.score_percent) || 0);
        const highScoreStreak = computeLongestHighScoreStreak(achievementScores, 80);
        const totalCompletedAttempts = achievementRows.length;
        const hasSniper = achievementRows.some((row) => Number(row.score_percent) >= 100);
        const hasLightning = achievementRows.some((row) => {
            const seconds = Number(row.time_spent_seconds);
            return Number.isFinite(seconds) && seconds > 0 && seconds < 300;
        });

        const topicsBySubject = new Map();
        topicsResult.rows.forEach((row) => {
            const key = String(row.subject_id || '');
            if (!key) return;
            if (!topicsBySubject.has(key)) {
                topicsBySubject.set(key, []);
            }
            topicsBySubject.get(key).push({
                topic_name: row.topic_name,
                attempts: parseInt(row.attempts || 0, 10),
                avg_score: parseFloat(row.avg_score || 0)
            });
        });

        const subjects = subjectResult.rows.map((row) => {
            const key = String(row.id || '');
            const topics = (topicsBySubject.get(key) || []).slice(0, 6);
            return {
                subject_id: row.id,
                subject_name: row.subject_name,
                subject_color: row.subject_color,
                attempts: parseInt(row.attempts || 0, 10),
                avg_score: parseFloat(row.avg_score || 0),
                topics
            };
        });

        const weakTopics = weakTopicsResult.rows.map((row) => ({
            topic_name: row.topic_name,
            error_tests: parseInt(row.error_tests || 0, 10)
        }));

        const achievements = [
            {
                id: 'fire',
                icon: '🔥',
                title: 'Огонь',
                description: '7 дней подряд',
                obtained: streakDays >= 7,
                locked: streakDays < 7
            },
            {
                id: 'sniper',
                icon: '🎯',
                title: 'Снайпер',
                description: '100% в тесте',
                obtained: hasSniper,
                locked: !hasSniper
            },
            {
                id: 'diamond',
                icon: '💎',
                title: 'Алмаз',
                description: '5 тестов подряд >80%',
                obtained: highScoreStreak >= 5,
                locked: highScoreStreak < 5
            },
            {
                id: 'lightning',
                icon: '⚡️',
                title: 'Молния',
                description: 'Тест за <5 мин',
                obtained: hasLightning,
                locked: !hasLightning
            },
            {
                id: 'marathon',
                icon: '📚',
                title: 'Марафонец',
                description: '50 тестов',
                obtained: totalCompletedAttempts >= 50,
                locked: totalCompletedAttempts < 50
            }
        ];

        res.json({
            stats: {
                tests_assigned: testsAssigned,
                tests_completed: testsCompleted,
                completion_rate: completionRate,
                avg_score: avgScore,
                avg_score_30: avgScore30,
                avg_score_prev_30: avgScorePrev30,
                avg_score_trend: avgTrendDelta,
                streak_days: streakDays,
                total_time_spent_seconds: Number.isFinite(totalTimeSpentSeconds) ? totalTimeSpentSeconds : 0
            },
            trend: trendResult.rows.map(row => ({
                period: row.period,
                attempts: parseInt(row.attempts || 0),
                avg_score: parseFloat(row.avg_score || 0)
            })),
            subjects,
            weak_topics: weakTopics,
            achievements,
            filters: {
                period_days: periodDays,
                selected_subject_id: selectedSubjectId,
                subjects: subjects.map((item) => ({
                    subject_id: item.subject_id,
                    subject_name: item.subject_name,
                    subject_color: item.subject_color
                }))
            }
        });
    } catch (error) {
        console.error('Get student progress overview error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch progress overview'
        });
    }
});

/**
 * GET /api/student/leaderboard
 * Get leaderboard for class, school, or subject
 */
router.get('/leaderboard', async (req, res) => {
    try {
        const studentId = req.user.id;
        const { scope = 'class', subject_id, class_id } = req.query;
        const attempt = await getAttemptStatsExpressions();

        let joinClause = '';
        let whereClause = "u.role = 'student' AND u.is_active = true";
        const params = [];

        if (scope === 'class') {
            const classStudentColumns = await getTableColumns('class_students');
            const classStudentActiveFilter = classStudentColumns.has('is_active')
                ? 'AND cs.is_active = true'
                : '';

            let classId = class_id;
            if (!classId) {
                const classResult = await query(
                    `SELECT class_id FROM class_students cs
                     WHERE cs.student_id = $1 ${classStudentActiveFilter}
                     ORDER BY cs.class_id ASC
                     LIMIT 1`,
                    [studentId]
                );
                classId = classResult.rows[0]?.class_id;
            }

            if (!classId) {
                return res.json({ scope, leaderboard: [], user_rank: null });
            }

            // Prevent access to foreign classes via arbitrary class_id in query.
            const classAccessCheck = await query(
                `SELECT 1
                 FROM class_students cs
                 WHERE cs.student_id = $1
                   AND cs.class_id = $2
                   ${classStudentColumns.has('is_active') ? 'AND cs.is_active = true' : ''}
                 LIMIT 1`,
                [studentId, classId]
            );

            if (classAccessCheck.rows.length === 0) {
                return res.status(403).json({
                    error: 'forbidden',
                    message: 'You do not have access to this class leaderboard'
                });
            }

            params.push(classId, req.user.school_id);
            joinClause = `JOIN class_students cs ON cs.student_id = u.id AND cs.class_id = $1 ${classStudentActiveFilter}`;
            whereClause += ' AND u.school_id = $2';
        } else if (scope === 'school') {
            params.push(req.user.school_id);
            whereClause += ' AND u.school_id = $1';
        } else if (scope === 'subject') {
            if (!subject_id) {
                return res.status(400).json({
                    error: 'validation_error',
                    message: 'subject_id is required for subject leaderboard'
                });
            }
            params.push(req.user.school_id, subject_id);
            joinClause = `JOIN tests t ON t.id = att.test_id AND t.subject_id = $2`;
            whereClause += ' AND u.school_id = $1';
        } else {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Invalid leaderboard scope'
            });
        }

        const leaderboardQuery = `
            WITH leaderboard AS (
                SELECT
                    u.id,
                    u.first_name,
                    u.last_name,
                    u.username,
                    COUNT(att.id) as attempts,
                    AVG(${attempt.scoreExpr})::float as avg_score
                FROM users u
                LEFT JOIN test_attempts att ON att.student_id = u.id AND ${attempt.completedFilter}
                ${joinClause}
                WHERE ${whereClause}
                GROUP BY u.id, u.first_name, u.last_name, u.username
                HAVING COUNT(att.id) > 0
            )
            SELECT
                *,
                RANK() OVER (ORDER BY avg_score DESC NULLS LAST, attempts DESC) as rank
            FROM leaderboard
            ORDER BY rank
            LIMIT 50
        `;

        const leaderboardResult = await query(leaderboardQuery, params);

        const rankResult = await query(
            `WITH leaderboard AS (
                SELECT
                    u.id,
                    COUNT(att.id) as attempts,
                    AVG(${attempt.scoreExpr})::float as avg_score
                FROM users u
                LEFT JOIN test_attempts att ON att.student_id = u.id AND ${attempt.completedFilter}
                ${joinClause}
                WHERE ${whereClause}
                GROUP BY u.id
                HAVING COUNT(att.id) > 0
            )
            SELECT rank
            FROM (
                SELECT id, RANK() OVER (ORDER BY avg_score DESC NULLS LAST, attempts DESC) as rank
                FROM leaderboard
            ) ranked
            WHERE id = $${params.length + 1}
            LIMIT 1`,
            [...params, studentId]
        );

        res.json({
            scope,
            leaderboard: leaderboardResult.rows.map(row => ({
                id: row.id,
                name: `${row.first_name} ${row.last_name}`.trim(),
                username: row.username,
                attempts: parseInt(row.attempts || 0),
                avg_score: parseFloat(row.avg_score || 0),
                rank: parseInt(row.rank || 0)
            })),
            user_rank: rankResult.rows[0]?.rank || null
        });
    } catch (error) {
        console.error('Get student leaderboard error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch leaderboard'
        });
    }
});

/**
 * GET /api/student/career/interests
 * Get career interests list
 */
router.get('/career/interests', async (req, res) => {
    try {
        const interests = await getCareerInterestsBySchool(req.user.school_id);
        res.json({ interests });
    } catch (error) {
        console.error('Get career interests error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch career interests'
        });
    }
});

/**
 * GET /api/student/career/questions
 * Get career test questions
 */
router.get('/career/questions', async (req, res) => {
    try {
        const interests = await getCareerInterestsBySchool(req.user.school_id);
        const questions = await getSchoolCareerQuestions(req.user.school_id, interests);

        res.json({ questions, interests });
    } catch (error) {
        console.error('Get career questions error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch career questions'
        });
    }
});

/**
 * POST /api/student/career/submit
 * Submit career test answers
 */
router.post('/career/submit', async (req, res) => {
    try {
        const studentId = req.user.id;
        const schoolId = req.user.school_id;
        const answers = req.body?.answers;

        if (!answers || typeof answers !== 'object') {
            return res.status(400).json({
                error: 'invalid_request',
                message: 'Answers are required'
            });
        }

        const interests = await getCareerInterestsBySchool(schoolId);

        if (interests.length === 0) {
            return res.status(400).json({
                error: 'no_interests',
                message: 'Career interests not configured'
            });
        }

        const questions = await getSchoolCareerQuestions(schoolId, interests);

        const totals = new Map();
        for (const question of questions) {
            if (!(question.id in answers)) {
                return res.status(400).json({
                    error: 'incomplete',
                    message: 'All questions must be answered'
                });
            }

            const value = Number(answers[question.id]);
            if (!Number.isFinite(value) || value < 1 || value > 5) {
                return res.status(400).json({
                    error: 'invalid_answer',
                    message: 'Answer values must be between 1 and 5'
                });
            }

            const current = totals.get(question.interest_id) || { sum: 0, count: 0 };
            totals.set(question.interest_id, {
                sum: current.sum + value,
                count: current.count + 1
            });
        }

        const interestsScores = {};
        const scoredInterests = interests.map((interest) => {
            const total = totals.get(interest.id) || { sum: 0, count: 0 };
            const avg = total.count ? total.sum / total.count : 0;
            const score = Math.round(avg * 20);
            interestsScores[interest.id] = score;

            return {
                id: interest.id,
                name_ru: interest.name_ru,
                name_uz: interest.name_uz,
                color: interest.color,
                score
            };
        });

        const topInterests = [...scoredInterests]
            .sort((a, b) => b.score - a.score)
            .slice(0, 3);
        const schoolSubjects = await getSchoolSubjectsForRecommendations(schoolId);
        const recommendedSubjects = buildCareerRecommendations(topInterests, schoolSubjects);
        const reliability = computeCareerReliability(answers, scoredInterests);

        const resultsSchema = await getCareerResultsColumns();
        const insertColumns = ['student_id'];
        const values = [studentId];
        const placeholders = ['$1'];
        let index = 2;

        let attemptNo = null;
        if (resultsSchema.attemptNo) {
            const attemptResult = await query(
                `SELECT COALESCE(MAX(attempt_no), 0) + 1 AS next_attempt
                 FROM student_career_results
                 WHERE student_id = $1`,
                [studentId]
            );
            attemptNo = Number(attemptResult.rows[0]?.next_attempt || 1);
            insertColumns.push('attempt_no');
            values.push(attemptNo);
            placeholders.push(`$${index}`);
            index += 1;
        }

        if (resultsSchema.completedAt) {
            insertColumns.push('completed_at');
            values.push(new Date());
            placeholders.push(`$${index}`);
            index += 1;
        }

        if (resultsSchema.interestsScores) {
            insertColumns.push('interests_scores');
            values.push(JSON.stringify(interestsScores));
            placeholders.push(`$${index}`);
            index += 1;
        }

        if (resultsSchema.recommendedSubjects) {
            insertColumns.push('recommended_subjects');
            values.push(JSON.stringify(recommendedSubjects));
            placeholders.push(`$${index}`);
            index += 1;
        }

        if (resultsSchema.results) {
            insertColumns.push('results');
            values.push(JSON.stringify({
                scores: interestsScores,
                recommended_subjects: recommendedSubjects,
                reliability
            }));
            placeholders.push(`$${index}`);
            index += 1;
        }

        if (resultsSchema.topInterests) {
            insertColumns.push('top_interests');
            values.push(topInterests.map((interest) => interest.name_ru || interest.name_uz));
            placeholders.push(`$${index}`);
            index += 1;
        }

        if (resultsSchema.recommendations) {
            insertColumns.push('recommendations');
            values.push(recommendedSubjects.ru.join(', '));
            placeholders.push(`$${index}`);
            index += 1;
        }

        if (resultsSchema.reliability) {
            insertColumns.push('reliability');
            values.push(JSON.stringify(reliability));
            placeholders.push(`$${index}`);
            index += 1;
        }

        await query(
            `INSERT INTO student_career_results (${insertColumns.join(', ')}) VALUES (${placeholders.join(', ')})`,
            values
        );

        try {
            const recipient = await getStudentNotificationRecipient(studentId);
            if (recipient) {
                const language = resolveLanguageFromSettings(recipient.settings);
                const topNames = topInterests.map((interest) => interest.name_ru || interest.name_uz).filter(Boolean);
                const recommendationPool = language === 'uz'
                    ? (Array.isArray(recommendedSubjects.uz) ? recommendedSubjects.uz : [])
                    : (Array.isArray(recommendedSubjects.ru) ? recommendedSubjects.ru : []);

                await notifyTestResults(
                    recipient,
                    {
                        type: 'career',
                        test_id: null,
                        test_title: 'Профориентация',
                        top_interests: topNames,
                        recommended_subjects: recommendationPool,
                        attempt_no: attemptNo
                    },
                    language
                );
            }
        } catch (notifyError) {
            console.error('Career test results notification error:', notifyError);
        }

        res.json({
            result: {
                interests: scoredInterests,
                recommended_subjects: recommendedSubjects,
                top_interests: topInterests,
                reliability,
                attempt_no: attemptNo
            }
        });
    } catch (error) {
        console.error('Submit career test error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to submit career test'
        });
    }
});

/**
 * GET /api/student/career/results
 * Get latest career test results for student
 */
router.get('/career/results', async (req, res) => {
    try {
        const studentId = req.user.id;
        const interests = await getCareerInterestsBySchool(req.user.school_id);

        const resultsSchema = await getCareerResultsColumns();
        let resultRow = null;
        const selectReliability = resultsSchema.reliability ? 'reliability' : 'NULL::jsonb AS reliability';
        const selectAttemptNo = resultsSchema.attemptNo ? 'attempt_no' : 'NULL::integer AS attempt_no';
        const selectCompletedAt = resultsSchema.completedAt ? 'completed_at' : 'NULL::timestamp AS completed_at';
        const selectTakenAt = resultsSchema.takenAt ? 'taken_at' : 'NULL::timestamp AS taken_at';

        if (resultsSchema.interestsScores || resultsSchema.recommendedSubjects) {
            const orderColumn = resultsSchema.completedAt ? 'completed_at' : (resultsSchema.takenAt ? 'taken_at' : 'id');
            const selectInterestsScores = resultsSchema.interestsScores ? 'interests_scores' : 'NULL::jsonb AS interests_scores';
            const selectRecommendedSubjects = resultsSchema.recommendedSubjects ? 'recommended_subjects' : 'NULL::jsonb AS recommended_subjects';
            const result = await query(
                `SELECT
                    ${selectInterestsScores},
                    ${selectRecommendedSubjects},
                    ${selectReliability},
                    ${selectAttemptNo},
                    ${selectCompletedAt},
                    ${selectTakenAt}
                 FROM student_career_results
                 WHERE student_id = $1
                 ORDER BY ${orderColumn} DESC NULLS LAST
                 LIMIT 1`,
                [studentId]
            );
            resultRow = result.rows[0] || null;
        } else if (resultsSchema.results) {
            const orderColumn = resultsSchema.completedAt ? 'completed_at' : (resultsSchema.takenAt ? 'taken_at' : 'id');
            const selectResults = resultsSchema.results ? 'results' : 'NULL::jsonb AS results';
            const selectTopInterests = resultsSchema.topInterests ? 'top_interests' : 'NULL::text[] AS top_interests';
            const selectRecommendations = resultsSchema.recommendations ? 'recommendations' : 'NULL::text AS recommendations';
            const result = await query(
                `SELECT
                    ${selectResults},
                    ${selectTopInterests},
                    ${selectRecommendations},
                    ${selectReliability},
                    ${selectAttemptNo},
                    ${selectCompletedAt},
                    ${selectTakenAt}
                 FROM student_career_results
                 WHERE student_id = $1
                 ORDER BY ${orderColumn} DESC NULLS LAST
                 LIMIT 1`,
                [studentId]
            );
            resultRow = result.rows[0] || null;
        }

        if (!resultRow) {
            return res.json({ result: null });
        }

        let scores = {};
        let recommendedSubjects = { ru: [], uz: [] };
        let completedAt = resultRow.completed_at || resultRow.taken_at || null;
        let reliability = resultRow.reliability || null;

        if (resultRow.interests_scores) {
            scores = resultRow.interests_scores || {};
            if (resultRow.recommended_subjects) {
                recommendedSubjects = resultRow.recommended_subjects;
            }
        } else if (resultRow.results) {
            scores = resultRow.results.scores || {};
            if (resultRow.results.recommended_subjects) {
                recommendedSubjects = resultRow.results.recommended_subjects;
            }
            reliability = reliability || resultRow.results.reliability || null;
        }

        const scoredInterests = interests.map((interest) => ({
            id: interest.id,
            name_ru: interest.name_ru,
            name_uz: interest.name_uz,
            color: interest.color,
            score: Number(scores[interest.id]) || 0
        }));

        res.json({
            result: {
                interests: scoredInterests,
                recommended_subjects: recommendedSubjects,
                completed_at: completedAt,
                attempt_no: resultRow.attempt_no || null,
                reliability
            }
        });
    } catch (error) {
        console.error('Get career results error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch career results'
        });
    }
});

/**
 * GET /api/student/career/history
 * Get full history of career attempts
 */
router.get('/career/history', async (req, res) => {
    try {
        const studentId = req.user.id;
        const interests = await getCareerInterestsBySchool(req.user.school_id);
        const byId = new Map(interests.map((interest) => [String(interest.id), interest]));
        const resultsSchema = await getCareerResultsColumns();
        const orderColumn = resultsSchema.completedAt ? 'completed_at' : (resultsSchema.takenAt ? 'taken_at' : 'id');
        const selectAttemptNo = resultsSchema.attemptNo ? 'attempt_no' : 'NULL::integer AS attempt_no';
        const selectInterestsScores = resultsSchema.interestsScores ? 'interests_scores' : 'NULL::jsonb AS interests_scores';
        const selectRecommendedSubjects = resultsSchema.recommendedSubjects ? 'recommended_subjects' : 'NULL::jsonb AS recommended_subjects';
        const selectResults = resultsSchema.results ? 'results' : 'NULL::jsonb AS results';
        const selectReliability = resultsSchema.reliability ? 'reliability' : 'NULL::jsonb AS reliability';
        const selectTopInterests = resultsSchema.topInterests ? 'top_interests' : 'NULL::text[] AS top_interests';
        const selectRecommendations = resultsSchema.recommendations ? 'recommendations' : 'NULL::text AS recommendations';
        const selectCompletedAt = resultsSchema.completedAt ? 'completed_at' : 'NULL::timestamp AS completed_at';
        const selectTakenAt = resultsSchema.takenAt ? 'taken_at' : 'NULL::timestamp AS taken_at';
        const rowsResult = await query(
            `SELECT
                id,
                ${selectAttemptNo},
                ${selectInterestsScores},
                ${selectRecommendedSubjects},
                ${selectResults},
                ${selectReliability},
                ${selectTopInterests},
                ${selectRecommendations},
                ${selectCompletedAt},
                ${selectTakenAt}
             FROM student_career_results
             WHERE student_id = $1
             ORDER BY ${orderColumn} DESC NULLS LAST, id DESC`,
            [studentId]
        );

        const history = rowsResult.rows.map((row, index) => {
            const scores = row.interests_scores
                || (row.results && typeof row.results === 'object' ? row.results.scores : null)
                || {};
            const recommendedSubjects = row.recommended_subjects
                || (row.results && typeof row.results === 'object' ? row.results.recommended_subjects : null)
                || { ru: [], uz: [] };
            const reliability = row.reliability
                || (row.results && typeof row.results === 'object' ? row.results.reliability : null)
                || null;

            return {
                id: row.id,
                attempt_no: row.attempt_no || (rowsResult.rows.length - index),
                completed_at: row.completed_at || row.taken_at || null,
                reliability,
                top_interests: Array.isArray(row.top_interests) ? row.top_interests : [],
                recommended_subjects: recommendedSubjects,
                interests: Object.entries(scores).map(([interestId, score]) => {
                    const interest = byId.get(String(interestId)) || {};
                    return {
                        id: interestId,
                        name_ru: interest.name_ru || interestId,
                        name_uz: interest.name_uz || interest.name_ru || interestId,
                        color: interest.color || '#4A90E2',
                        score: Number(score) || 0
                    };
                })
            };
        });

        res.json({ history });
    } catch (error) {
        console.error('Get career history error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch career history'
        });
    }
});

/**
 * GET /api/student/career/report.pdf
 * Export career report as PDF for current student
 */
router.get('/career/report.pdf', async (req, res) => {
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

        const studentId = req.user.id;
        const resultsSchema = await getCareerResultsColumns();
        const reportOrderExpr = resultsSchema.completedAt && resultsSchema.takenAt
            ? 'COALESCE(completed_at, taken_at)'
            : (resultsSchema.completedAt ? 'completed_at' : (resultsSchema.takenAt ? 'taken_at' : 'id'));
        const selectAttemptNo = resultsSchema.attemptNo ? 'attempt_no' : 'NULL::integer AS attempt_no';
        const selectInterestsScores = resultsSchema.interestsScores ? 'interests_scores' : 'NULL::jsonb AS interests_scores';
        const selectRecommendedSubjects = resultsSchema.recommendedSubjects ? 'recommended_subjects' : 'NULL::jsonb AS recommended_subjects';
        const selectResults = resultsSchema.results ? 'results' : 'NULL::jsonb AS results';
        const selectReliability = resultsSchema.reliability ? 'reliability' : 'NULL::jsonb AS reliability';
        const selectTopInterests = resultsSchema.topInterests ? 'top_interests' : 'NULL::text[] AS top_interests';
        const selectCompletedAt = resultsSchema.completedAt && resultsSchema.takenAt
            ? 'COALESCE(completed_at, taken_at) AS completed_at'
            : (resultsSchema.completedAt ? 'completed_at' : (resultsSchema.takenAt ? 'taken_at AS completed_at' : 'NULL::timestamp AS completed_at'));
        const profileResult = await query(
            `SELECT first_name, last_name, username
             FROM users
             WHERE id = $1
             LIMIT 1`,
            [studentId]
        );
        const student = profileResult.rows[0] || {};

        const historyResult = await query(
            `SELECT
                ${selectAttemptNo},
                ${selectInterestsScores},
                ${selectRecommendedSubjects},
                ${selectResults},
                ${selectReliability},
                ${selectTopInterests},
                ${selectCompletedAt}
             FROM student_career_results
             WHERE student_id = $1
             ORDER BY ${reportOrderExpr} DESC NULLS LAST, id DESC
             LIMIT 20`,
            [studentId]
        );

        const latest = historyResult.rows[0] || null;
        const fullName = `${student.first_name || ''} ${student.last_name || ''}`.trim() || student.username || 'Student';
        const filename = `career-report-${String(student.username || studentId).replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        const doc = new PDFDocument({ margin: 48, size: 'A4' });
        doc.pipe(res);

        doc.fontSize(18).text('ZEDLY Career Orientation Report', { align: 'left' });
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
        if (top.length) {
            top.slice(0, 5).forEach((interest, idx) => doc.text(`${idx + 1}. ${String(interest)}`));
        } else {
            doc.text('No data');
        }

        doc.moveDown(0.5);
        doc.fontSize(11).text('Recommended subjects (school-scoped):');
        const recRu = Array.isArray(recommended.ru) ? recommended.ru : [];
        if (recRu.length) {
            recRu.slice(0, 12).forEach((subject, idx) => doc.text(`${idx + 1}. ${String(subject)}`));
        } else {
            doc.text('No recommendations');
        }

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
        console.error('Career PDF export error:', error);
        if (!res.headersSent) {
            res.status(500).json({
                error: 'server_error',
                message: 'Failed to export career PDF'
            });
        }
    }
});

function hashSeed(value) {
    const str = String(value ?? '');
    let hash = 0;
    for (let i = 0; i < str.length; i += 1) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash) + 1;
}

function seededRandom(seed) {
    let x = seed || 1;
    return function next() {
        x = (x * 1664525 + 1013904223) % 4294967296;
        return x / 4294967296;
    };
}

function shuffleQuestions(questions, seedValue) {
    const shuffled = [...questions];
    const random = seededRandom(hashSeed(seedValue));
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// Student Dashboard Overview
router.get('/dashboard/overview', async (req, res) => {
    try {
        const studentId = req.user.id;
        const schoolId = req.user.school_id;

        const testColumns = await getTableColumns('tests');
        const testTitleColumn = pickColumn(testColumns, ['title', 'title_ru', 'title_uz'], 'title');
        const subjectColumns = await getTableColumns('subjects');
        const subjectNameColumn = pickColumn(subjectColumns, ['name', 'name_ru', 'name_uz'], 'name');
        const assignmentColumns = await getTableColumns('test_assignments');
        const classStudentColumns = await getTableColumns('class_students');

        const startDateColumn = pickColumn(assignmentColumns, ['start_date', 'start_at', 'starts_at'], null);
        const endDateColumn = pickColumn(assignmentColumns, ['end_date', 'end_at', 'ends_at'], null);
        const assignmentIsActiveColumn = pickColumn(assignmentColumns, ['is_active', 'active'], null);

        const classStudentFilter = (alias = 'cs') => classStudentColumns.has('is_active')
            ? `AND ${alias}.is_active = true`
            : '';
        const subjectActiveFilter = (alias = 's') => subjectColumns.has('is_active')
            ? `AND ${alias}.is_active = true`
            : '';
        const assignmentActiveFilter = (alias = 'ta') => assignmentIsActiveColumn
            ? `AND ${alias}.${assignmentIsActiveColumn} = true`
            : '';
        const startDateExpr = (alias = 'ta') => startDateColumn ? `${alias}.${startDateColumn}` : 'NULL';
        const endDateExpr = (alias = 'ta') => endDateColumn ? `${alias}.${endDateColumn}` : 'NULL';

        const attemptBase = await getAttemptStatsExpressions('att');
        const withAttemptAlias = (alias) => {
            const replaceAlias = (value) => String(value || '').replace(/\batt\./g, `${alias}.`);
            return {
                scoreExpr: replaceAlias(attemptBase.scoreExpr),
                completedFilter: replaceAlias(attemptBase.completedFilter),
                completedAt: replaceAlias(attemptBase.completedAt),
                startedAt: replaceAlias(attemptBase.startedAt),
                timeSpentExpr: replaceAlias(attemptBase.timeSpentExpr)
            };
        };

        const attemptStats = withAttemptAlias('att');
        const attemptUrgent = withAttemptAlias('attu');
        const attemptRank = withAttemptAlias('attr');
        const attemptWeak = withAttemptAlias('attw');
        const attemptRecommendation = withAttemptAlias('attp');
        const attemptActivity = withAttemptAlias('atta');
        const attemptAchievement = withAttemptAlias('atth');

        const classIdsResult = await query(
            `SELECT cs.class_id
             FROM class_students cs
             WHERE cs.student_id = $1 ${classStudentFilter('cs')}
             ORDER BY cs.class_id ASC`,
            [studentId]
        );
        const classIds = classIdsResult.rows.map((row) => row.class_id).filter(Boolean);
        const primaryClassId = classIds[0] || null;

        let testsAssigned = 0;
        if (classIds.length) {
            const testsAssignedResult = await query(
                `SELECT COUNT(DISTINCT ta.id)::int as count
                 FROM test_assignments ta
                 WHERE ta.class_id = ANY($1) ${assignmentActiveFilter('ta')}`,
                [classIds]
            );
            testsAssigned = parseInt(testsAssignedResult.rows[0]?.count || 0, 10);
        }

        const testsCompletedResult = await query(
            `SELECT COUNT(DISTINCT COALESCE(att.assignment_id::text, att.test_id::text))::int as count
             FROM test_attempts att
             WHERE att.student_id = $1
               AND ${attemptStats.completedFilter}`,
            [studentId]
        );
        const testsCompleted = parseInt(testsCompletedResult.rows[0]?.count || 0, 10);

        const avgScoreResult = await query(
            `SELECT AVG(${attemptStats.scoreExpr})::float as avg_score
             FROM test_attempts att
             WHERE att.student_id = $1
               AND ${attemptStats.completedFilter}`,
            [studentId]
        );
        const avgScore = parseFloat(avgScoreResult.rows[0]?.avg_score || 0);

        const streakDaysResult = await query(
            `SELECT DISTINCT DATE(${attemptStats.completedAt}) as day
             FROM test_attempts att
             WHERE att.student_id = $1
               AND ${attemptStats.completedFilter}
             ORDER BY day DESC
             LIMIT 180`,
            [studentId]
        );
        const streakDays = computeCurrentStreakDays(streakDaysResult.rows.map((row) => row.day));

        const subjectPerformanceResult = classIds.length
            ? await query(
                `WITH assigned_subjects AS (
                    SELECT DISTINCT t.subject_id
                    FROM test_assignments ta
                    JOIN tests t ON t.id = ta.test_id
                    WHERE ta.class_id = ANY($1)
                      ${assignmentActiveFilter('ta')}
                      AND t.subject_id IS NOT NULL
                    UNION
                    SELECT DISTINCT t.subject_id
                    FROM test_attempts att
                    JOIN tests t ON t.id = att.test_id
                    WHERE att.student_id = $2
                      AND t.subject_id IS NOT NULL
                ),
                subject_scores AS (
                    SELECT
                        t.subject_id,
                        COUNT(atts.id)::int as attempts,
                        AVG(${withAttemptAlias('atts').scoreExpr})::float as avg_score
                    FROM test_attempts atts
                    JOIN tests t ON t.id = atts.test_id
                    WHERE atts.student_id = $2
                      AND ${withAttemptAlias('atts').completedFilter}
                      AND t.subject_id IS NOT NULL
                    GROUP BY t.subject_id
                )
                SELECT
                    s.id,
                    s.${subjectNameColumn} as subject_name,
                    s.color as subject_color,
                    COALESCE(ss.attempts, 0)::int as attempts,
                    COALESCE(ss.avg_score, 0)::float as avg_score
                FROM assigned_subjects ads
                JOIN subjects s ON s.id = ads.subject_id
                LEFT JOIN subject_scores ss ON ss.subject_id = s.id
                WHERE s.school_id = $3
                  ${subjectActiveFilter('s')}
                ORDER BY s.${subjectNameColumn} ASC`,
                [classIds, studentId, schoolId]
            )
            : await query(
                `WITH assigned_subjects AS (
                    SELECT DISTINCT t.subject_id
                    FROM test_attempts att
                    JOIN tests t ON t.id = att.test_id
                    WHERE att.student_id = $1
                      AND t.subject_id IS NOT NULL
                ),
                subject_scores AS (
                    SELECT
                        t.subject_id,
                        COUNT(atts.id)::int as attempts,
                        AVG(${withAttemptAlias('atts').scoreExpr})::float as avg_score
                    FROM test_attempts atts
                    JOIN tests t ON t.id = atts.test_id
                    WHERE atts.student_id = $1
                      AND ${withAttemptAlias('atts').completedFilter}
                      AND t.subject_id IS NOT NULL
                    GROUP BY t.subject_id
                )
                SELECT
                    s.id,
                    s.${subjectNameColumn} as subject_name,
                    s.color as subject_color,
                    COALESCE(ss.attempts, 0)::int as attempts,
                    COALESCE(ss.avg_score, 0)::float as avg_score
                FROM assigned_subjects ads
                JOIN subjects s ON s.id = ads.subject_id
                LEFT JOIN subject_scores ss ON ss.subject_id = s.id
                WHERE s.school_id = $2
                  ${subjectActiveFilter('s')}
                ORDER BY s.${subjectNameColumn} ASC`,
                [studentId, schoolId]
            );

        const subjects = subjectPerformanceResult.rows.map((row) => ({
            subject_id: row.id,
            subject_name: row.subject_name,
            subject_color: row.subject_color,
            attempts: parseInt(row.attempts || 0, 10),
            avg_score: parseFloat(row.avg_score || 0)
        }));

        const bestSubject = subjects
            .filter((subject) => subject.attempts > 0)
            .sort((a, b) => {
                if (b.avg_score !== a.avg_score) return b.avg_score - a.avg_score;
                return b.attempts - a.attempts;
            })[0] || null;

        const urgentTestsResult = classIds.length
            ? await query(
                `SELECT
                    ta.id as assignment_id,
                    t.id as test_id,
                    COALESCE(NULLIF(TRIM(t.${testTitleColumn}), ''), 'Тест без названия') as test_title,
                    s.id as subject_id,
                    s.${subjectNameColumn} as subject_name,
                    ${startDateExpr('ta')} as start_date,
                    ${endDateExpr('ta')} as end_date,
                    CASE
                        WHEN ${endDateExpr('ta')} IS NULL THEN NULL
                        ELSE CEIL(EXTRACT(EPOCH FROM (${endDateExpr('ta')} - CURRENT_TIMESTAMP)) / 86400.0)::int
                    END as days_left
                FROM test_assignments ta
                JOIN tests t ON t.id = ta.test_id
                LEFT JOIN subjects s ON s.id = t.subject_id
                WHERE ta.class_id = ANY($1)
                  ${assignmentActiveFilter('ta')}
                  AND NOT EXISTS (
                        SELECT 1
                        FROM test_attempts attu
                        WHERE attu.assignment_id = ta.id
                          AND attu.student_id = $2
                          AND ${attemptUrgent.completedFilter}
                  )
                ORDER BY (${endDateExpr('ta')} IS NULL) ASC, ${endDateExpr('ta')} ASC NULLS LAST, ta.created_at ASC
                LIMIT 10`,
                [classIds, studentId]
            )
            : { rows: [] };
        const urgentTests = (urgentTestsResult.rows || []).map((row) => ({
            assignment_id: row.assignment_id,
            test_id: row.test_id,
            test_title: row.test_title,
            subject_id: row.subject_id,
            subject_name: row.subject_name,
            start_date: row.start_date,
            end_date: row.end_date,
            days_left: row.days_left !== null ? parseInt(row.days_left, 10) : null
        }));

        let classRankThisMonth = null;
        let classTotalStudents = 0;
        if (primaryClassId) {
            const rankResult = await query(
                `WITH class_members AS (
                    SELECT cs.student_id
                    FROM class_students cs
                    WHERE cs.class_id = $1 ${classStudentFilter('cs')}
                ),
                monthly_scores AS (
                    SELECT
                        cm.student_id,
                        AVG(${attemptRank.scoreExpr})::float as avg_score,
                        COUNT(attr.id)::int as attempts
                    FROM class_members cm
                    LEFT JOIN test_attempts attr
                        ON attr.student_id = cm.student_id
                        AND ${attemptRank.completedFilter}
                        AND ${attemptRank.completedAt} >= DATE_TRUNC('month', CURRENT_DATE)
                        AND ${attemptRank.completedAt} < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
                    GROUP BY cm.student_id
                )
                SELECT ranked.rank, ranked.total_students
                FROM (
                    SELECT
                        ms.student_id,
                        RANK() OVER (
                            ORDER BY COALESCE(ms.avg_score, 0) DESC, ms.attempts DESC, ms.student_id
                        ) as rank,
                        COUNT(*) OVER ()::int as total_students
                    FROM monthly_scores ms
                ) ranked
                WHERE ranked.student_id = $2
                LIMIT 1`,
                [primaryClassId, studentId]
            );
            classRankThisMonth = rankResult.rows[0]?.rank ? parseInt(rankResult.rows[0].rank, 10) : null;
            classTotalStudents = rankResult.rows[0]?.total_students
                ? parseInt(rankResult.rows[0].total_students, 10)
                : 0;
        }

        const weakTopicResult = await query(
            `SELECT
                COALESCE(NULLIF(TRIM(t.${testTitleColumn}), ''), 'Тема без названия') as topic_name,
                LOWER(COALESCE(NULLIF(TRIM(t.${testTitleColumn}), ''), 'тема без названия')) as topic_key,
                t.subject_id,
                s.${subjectNameColumn} as subject_name,
                COUNT(attw.id)::int as errors_count
            FROM test_attempts attw
            JOIN tests t ON t.id = attw.test_id
            LEFT JOIN subjects s ON s.id = t.subject_id
            WHERE attw.student_id = $1
              AND ${attemptWeak.completedFilter}
              AND COALESCE(${attemptWeak.scoreExpr}, 0) < 100
            GROUP BY topic_name, topic_key, t.subject_id, s.${subjectNameColumn}
            ORDER BY errors_count DESC, topic_name ASC
            LIMIT 1`,
            [studentId]
        );

        const weakTopic = weakTopicResult.rows[0] || null;
        let recommendedTest = null;
        if (weakTopic && classIds.length) {
            const exactRecommendationResult = await query(
                `SELECT
                    ta.id as assignment_id,
                    t.id as test_id,
                    COALESCE(NULLIF(TRIM(t.${testTitleColumn}), ''), 'Тест без названия') as test_title,
                    s.id as subject_id,
                    s.${subjectNameColumn} as subject_name,
                    ${endDateExpr('ta')} as end_date,
                    CASE
                        WHEN ${endDateExpr('ta')} IS NULL THEN NULL
                        ELSE CEIL(EXTRACT(EPOCH FROM (${endDateExpr('ta')} - CURRENT_TIMESTAMP)) / 86400.0)::int
                    END as days_left
                FROM test_assignments ta
                JOIN tests t ON t.id = ta.test_id
                LEFT JOIN subjects s ON s.id = t.subject_id
                WHERE ta.class_id = ANY($1)
                  ${assignmentActiveFilter('ta')}
                  AND LOWER(COALESCE(NULLIF(TRIM(t.${testTitleColumn}), ''), '')) = $3
                  AND NOT EXISTS (
                        SELECT 1
                        FROM test_attempts attp
                        WHERE attp.assignment_id = ta.id
                          AND attp.student_id = $2
                          AND ${attemptRecommendation.completedFilter}
                  )
                ORDER BY (${endDateExpr('ta')} IS NULL) ASC, ${endDateExpr('ta')} ASC NULLS LAST, ta.created_at ASC
                LIMIT 1`,
                [classIds, studentId, normalizeTopicKey(weakTopic.topic_key)]
            );

            let recommendationRow = exactRecommendationResult.rows[0] || null;
            if (!recommendationRow && weakTopic.subject_id) {
                const subjectRecommendationResult = await query(
                    `SELECT
                        ta.id as assignment_id,
                        t.id as test_id,
                        COALESCE(NULLIF(TRIM(t.${testTitleColumn}), ''), 'Тест без названия') as test_title,
                        s.id as subject_id,
                        s.${subjectNameColumn} as subject_name,
                        ${endDateExpr('ta')} as end_date,
                        CASE
                            WHEN ${endDateExpr('ta')} IS NULL THEN NULL
                            ELSE CEIL(EXTRACT(EPOCH FROM (${endDateExpr('ta')} - CURRENT_TIMESTAMP)) / 86400.0)::int
                        END as days_left
                    FROM test_assignments ta
                    JOIN tests t ON t.id = ta.test_id
                    LEFT JOIN subjects s ON s.id = t.subject_id
                    WHERE ta.class_id = ANY($1)
                      ${assignmentActiveFilter('ta')}
                      AND t.subject_id = $3
                      AND NOT EXISTS (
                            SELECT 1
                            FROM test_attempts attp
                            WHERE attp.assignment_id = ta.id
                              AND attp.student_id = $2
                              AND ${attemptRecommendation.completedFilter}
                      )
                    ORDER BY (${endDateExpr('ta')} IS NULL) ASC, ${endDateExpr('ta')} ASC NULLS LAST, ta.created_at ASC
                    LIMIT 1`,
                    [classIds, studentId, weakTopic.subject_id]
                );
                recommendationRow = subjectRecommendationResult.rows[0] || null;
            }

            if (recommendationRow) {
                const errorsCount = parseInt(weakTopic.errors_count || 0, 10);
                recommendedTest = {
                    topic_name: weakTopic.topic_name,
                    topic_errors_count: errorsCount,
                    assignment_id: recommendationRow.assignment_id,
                    test_id: recommendationRow.test_id,
                    test_title: recommendationRow.test_title,
                    subject_id: recommendationRow.subject_id,
                    subject_name: recommendationRow.subject_name,
                    end_date: recommendationRow.end_date,
                    days_left: recommendationRow.days_left !== null
                        ? parseInt(recommendationRow.days_left, 10)
                        : null,
                    reason: `Ты ошибся в этой теме ${errorsCount} раз`
                };
            }
        }

        const lastActivityResult = await query(
            `SELECT
                COALESCE(NULLIF(TRIM(t.${testTitleColumn}), ''), 'Тест без названия') as test_title,
                s.${subjectNameColumn} as subject_name,
                COALESCE(${attemptActivity.scoreExpr}, 0)::float as percentage,
                ${attemptActivity.completedAt} as completed_at
            FROM test_attempts atta
            JOIN tests t ON t.id = atta.test_id
            LEFT JOIN subjects s ON s.id = t.subject_id
            WHERE atta.student_id = $1
              AND ${attemptActivity.completedFilter}
            ORDER BY ${attemptActivity.completedAt} DESC
            LIMIT 5`,
            [studentId]
        );
        const lastActivity = lastActivityResult.rows.map((row) => ({
            test_title: row.test_title,
            subject_name: row.subject_name,
            percentage: parseFloat(row.percentage || 0),
            completed_at: row.completed_at
        }));

        const achievementRowsResult = await query(
            `SELECT
                ${attemptAchievement.completedAt} as completed_at,
                (${attemptAchievement.scoreExpr})::float as score_percent,
                (${attemptAchievement.timeSpentExpr})::float as time_spent_seconds
            FROM test_attempts atth
            WHERE atth.student_id = $1
              AND ${attemptAchievement.completedFilter}
            ORDER BY ${attemptAchievement.completedAt} ASC`,
            [studentId]
        );
        const recentBadge = computeRecentAchievement(achievementRowsResult.rows || []);

        let careerTestCompleted = false;
        if (await tableExists('student_career_results')) {
            const careerResult = await query(
                `SELECT COUNT(*)::int as count
                 FROM student_career_results
                 WHERE student_id = $1`,
                [studentId]
            );
            careerTestCompleted = parseInt(careerResult.rows[0]?.count || 0, 10) > 0;
        }

        const classRank = classRankThisMonth;
        const subjectProgressTop = [...subjects]
            .sort((a, b) => {
                if (b.attempts !== a.attempts) return b.attempts - a.attempts;
                if (b.avg_score !== a.avg_score) return b.avg_score - a.avg_score;
                return String(a.subject_name || '').localeCompare(String(b.subject_name || ''), 'ru');
            })
            .slice(0, 4);

        const recentActivity = [
            ...lastActivity.map((item) => ({
                type: 'attempt',
                title: item.test_title,
                subtitle: item.subject_name || '-',
                percentage: item.percentage,
                date: item.completed_at
            })),
            ...urgentTests.slice(0, 3).map((item) => ({
                type: 'assignment',
                title: item.test_title,
                subtitle: item.subject_name || '-',
                percentage: null,
                date: item.end_date || item.start_date || null
            }))
        ].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

        res.json({
            stats: {
                tests_assigned: testsAssigned,
                tests_completed: testsCompleted,
                avg_score: Math.round(avgScore * 10) / 10,
                class_rank: classRank,
                career_test_completed: careerTestCompleted
            },
            mini_stats: {
                avg_score: Math.round(avgScore * 10) / 10,
                tests_assigned: testsAssigned,
                tests_completed: testsCompleted,
                best_subject: bestSubject
                    ? {
                        subject_id: bestSubject.subject_id,
                        subject_name: bestSubject.subject_name,
                        avg_score: Math.round(bestSubject.avg_score * 10) / 10
                    }
                    : null
            },
            streak: {
                days: streakDays,
                motivation: streakDays > 0
                    ? (streakDays >= 7
                        ? 'Сильная серия, так держать!'
                        : 'Отличное начало, продолжай в том же ритме!')
                    : null
            },
            class_position: {
                rank: classRankThisMonth,
                total_students: classTotalStudents,
                period: 'current_month'
            },
            urgent_tests: urgentTests,
            subject_progress: subjectProgressTop,
            recommended_test: recommendedTest,
            last_activity: lastActivity,
            recent_badge: recentBadge
                ? {
                    id: recentBadge.id,
                    icon: recentBadge.icon,
                    title: recentBadge.title,
                    unlocked_at: recentBadge.unlocked_at
                }
                : null,
            subjects,
            recent_attempts: lastActivity.map((row) => ({
                test_title: row.test_title,
                class_name: row.subject_name || '-',
                percentage: row.percentage,
                submitted_at: row.completed_at
            })),
            recent_activity: recentActivity.slice(0, 8)
        });
    } catch (error) {
        console.error('Student dashboard overview error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch dashboard overview'
        });
    }
});

module.exports = router;
