const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

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

    return {
        nameRu,
        nameUz,
        descriptionRu,
        descriptionUz,
        icon,
        color
    };
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

    const completedAt = col('submitted_at') || col('completed_at') || col('graded_at') || col('created_at') || 'NULL';

    let completedFilter = 'false';
    if (columns.has('status')) completedFilter = `${alias}.status = 'completed'`;
    else if (columns.has('is_completed')) completedFilter = `${alias}.is_completed = true`;
    else if (completedAt !== 'NULL') completedFilter = `${completedAt} IS NOT NULL`;

    return { scoreExpr, completedFilter, completedAt };
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

function buildCareerRecommendations(topInterests) {
    const mapping = {
        'точные науки': {
            ru: ['Математика', 'Физика', 'Информатика'],
            uz: ['Matematika', 'Fizika', 'Informatika']
        },
        'естественные науки': {
            ru: ['Биология', 'Химия', 'География'],
            uz: ['Biologiya', 'Kimyo', 'Geografiya']
        },
        'гуманитарные науки': {
            ru: ['История', 'Литература', 'Языки'],
            uz: ['Tarix', 'Adabiyot', 'Tillar']
        },
        'искусство': {
            ru: ['Музыка', 'ИЗО', 'Театр'],
            uz: ['Musiqa', "Tasviriy san'at", 'Teatr']
        },
        'технологии': {
            ru: ['Информатика', 'Технология', 'Робототехника'],
            uz: ['Informatika', 'Texnologiya', 'Robototexnika']
        },
        'социальные науки': {
            ru: ['Психология', 'Обществознание', 'Экономика'],
            uz: ['Psixologiya', 'Jamiyatshunoslik', 'Iqtisodiyot']
        },
        "aniq fanlar": {
            ru: ['Математика', 'Физика', 'Информатика'],
            uz: ['Matematika', 'Fizika', 'Informatika']
        },
        "tabiiy fanlar": {
            ru: ['Биология', 'Химия', 'География'],
            uz: ['Biologiya', 'Kimyo', 'Geografiya']
        },
        "gumanitar fanlar": {
            ru: ['История', 'Литература', 'Языки'],
            uz: ['Tarix', 'Adabiyot', 'Tillar']
        },
        "san'at": {
            ru: ['Музыка', 'ИЗО', 'Театр'],
            uz: ['Musiqa', "Tasviriy san'at", 'Teatr']
        },
        "texnologiya": {
            ru: ['Информатика', 'Технология', 'Робототехника'],
            uz: ['Informatika', 'Texnologiya', 'Robototexnika']
        },
        "ijtimoiy fanlar": {
            ru: ['Психология', 'Обществознание', 'Экономика'],
            uz: ['Psixologiya', 'Jamiyatshunoslik', 'Iqtisodiyot']
        }
    };

    const recommendations = { ru: [], uz: [] };
    const addUnique = (target, values) => {
        values.forEach((value) => {
            if (!target.includes(value)) {
                target.push(value);
            }
        });
    };

    topInterests.forEach((interest) => {
        const key = (interest.name_ru || interest.name_uz || '').toLowerCase();
        const match = mapping[key];
        if (match) {
            addUnique(recommendations.ru, match.ru);
            addUnique(recommendations.uz, match.uz);
        }
    });

    return recommendations;
}

/**
 * ========================================
 * STUDENT ASSIGNMENTS & TESTS
 * ========================================
 */

/**
 * GET /api/student/subjects
 * Get all subjects in student's school
 */
router.get('/subjects', async (req, res) => {
    try {
        const schoolId = req.user.school_id;
        const subjectColumns = await getTableColumns('subjects');
        const nameColumn = pickColumn(subjectColumns, ['name', 'name_ru', 'name_uz'], 'name');
        const colorColumn = pickColumn(subjectColumns, ['color'], null);

        const result = await query(
            `SELECT
                id,
                ${nameColumn} as name,
                ${colorColumn ? colorColumn : 'NULL'} as color
             FROM subjects
             WHERE school_id = $1
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

        // Get questions (hide correct answers if not completed)
        const questionsQuery = attempt.is_completed
            ? `SELECT * FROM test_questions WHERE test_id = $1 ORDER BY order_number ASC`
            : `SELECT id, question_type, question_text, options, marks, order_number, media_url
               FROM test_questions WHERE test_id = $1 ORDER BY order_number ASC`;

        const questionsResult = await query(questionsQuery, [attempt.test_id]);
        const questions = attempt.shuffle_questions && !attempt.is_completed
            ? shuffleQuestions(questionsResult.rows, attempt.id)
            : questionsResult.rows;

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

        // Get questions with correct answers
        const questionsResult = await query(
            `SELECT id, question_type, correct_answer, marks
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
                earned_marks: earnedMarks
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
 * GET /api/student/subjects
 * Get subjects from student's assigned tests
 */
router.get('/subjects', async (req, res) => {
    try {
        const studentId = req.user.id;
        const subjectColumns = await getTableColumns('subjects');
        const classStudentColumns = await getTableColumns('class_students');
        const subjectNameColumn = pickColumn(subjectColumns, ['name', 'name_ru', 'name_uz'], 'name');
        const classStudentActiveFilter = classStudentColumns.has('is_active')
            ? 'AND cs.is_active = true'
            : '';

        const result = await query(
            `SELECT DISTINCT s.id,
                s.${subjectNameColumn} as name,
                s.color
             FROM test_assignments ta
             JOIN tests t ON t.id = ta.test_id
             JOIN class_students cs ON cs.class_id = ta.class_id
             JOIN subjects s ON s.id = t.subject_id
             WHERE cs.student_id = $1 ${classStudentActiveFilter}
             ORDER BY s.${subjectNameColumn} ASC`,
            [studentId]
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
        const classStudentColumns = await getTableColumns('class_students');
        const classStudentActiveFilter = classStudentColumns.has('is_active')
            ? 'AND cs.is_active = true'
            : '';
        const subjectColumns = await getTableColumns('subjects');
        const subjectNameColumn = pickColumn(subjectColumns, ['name', 'name_ru', 'name_uz'], 'name');
        const attempt = await getAttemptStatsExpressions();

        const testsAssignedResult = await query(`
            SELECT COUNT(DISTINCT ta.id) as count
            FROM test_assignments ta
            INNER JOIN class_students cs ON cs.class_id = ta.class_id
            WHERE cs.student_id = $1 ${classStudentActiveFilter}
        `, [studentId]);
        const testsAssigned = parseInt(testsAssignedResult.rows[0]?.count || 0);

        const testsCompletedResult = await query(`
            SELECT COUNT(DISTINCT att.id) as count
            FROM test_attempts att
            INNER JOIN test_assignments ta ON ta.id = att.assignment_id
            INNER JOIN class_students cs ON cs.class_id = ta.class_id
            WHERE cs.student_id = $1 ${classStudentActiveFilter} AND ${attempt.completedFilter}
        `, [studentId]);
        const testsCompleted = parseInt(testsCompletedResult.rows[0]?.count || 0);

        let avgScore = 0;
        if (attempt.scoreExpr !== 'NULL') {
            const avgScoreResult = await query(`
                SELECT AVG(${attempt.scoreExpr})::float as avg
                FROM test_attempts att
                WHERE att.student_id = $1 AND ${attempt.completedFilter}
            `, [studentId]);
            avgScore = parseFloat(avgScoreResult.rows[0]?.avg || 0);
        }

        const trendResult = await query(`
            SELECT
                DATE_TRUNC('week', ${attempt.completedAt}) as period,
                COUNT(*) as attempts,
                AVG(${attempt.scoreExpr})::float as avg_score
            FROM test_attempts att
            WHERE att.student_id = $1 AND ${attempt.completedFilter}
              AND ${attempt.completedAt} > CURRENT_DATE - INTERVAL '56 days'
            GROUP BY DATE_TRUNC('week', ${attempt.completedAt})
            ORDER BY period ASC
        `, [studentId]);

        const subjectResult = await query(`
            SELECT
                s.id,
                s.${subjectNameColumn} as subject_name,
                s.color as subject_color,
                COUNT(att.id) as attempts,
                AVG(${attempt.scoreExpr})::float as avg_score
            FROM test_attempts att
            JOIN tests t ON t.id = att.test_id
            LEFT JOIN subjects s ON s.id = t.subject_id
            WHERE att.student_id = $1 AND ${attempt.completedFilter}
            GROUP BY s.id, s.${subjectNameColumn}, s.color
            ORDER BY avg_score DESC NULLS LAST
        `, [studentId]);

        const completionRate = testsAssigned > 0
            ? Math.round((testsCompleted / testsAssigned) * 100)
            : 0;

        res.json({
            stats: {
                tests_assigned: testsAssigned,
                tests_completed: testsCompleted,
                completion_rate: completionRate,
                avg_score: avgScore
            },
            trend: trendResult.rows.map(row => ({
                period: row.period,
                attempts: parseInt(row.attempts || 0),
                avg_score: parseFloat(row.avg_score || 0)
            })),
            subjects: subjectResult.rows.map(row => ({
                subject_id: row.id,
                subject_name: row.subject_name,
                subject_color: row.subject_color,
                attempts: parseInt(row.attempts || 0),
                avg_score: parseFloat(row.avg_score || 0)
            }))
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
        const { nameRu, nameUz, descriptionRu, descriptionUz, icon, color } = await getCareerInterestExpressions();
        const interestsResult = await query(`
            SELECT
                ci.id,
                ${nameRu} as name_ru,
                ${nameUz} as name_uz,
                COALESCE(${descriptionRu}, '') as description_ru,
                COALESCE(${descriptionUz}, '') as description_uz,
                ${icon} as icon,
                COALESCE(${color}, '#4A90E2') as color
            FROM career_interests ci
            ORDER BY ci.id
        `);

        res.json({ interests: interestsResult.rows });
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
        const { nameRu, nameUz, descriptionRu, descriptionUz, icon, color } = await getCareerInterestExpressions();
        const interestsResult = await query(`
            SELECT
                ci.id,
                ${nameRu} as name_ru,
                ${nameUz} as name_uz,
                COALESCE(${descriptionRu}, '') as description_ru,
                COALESCE(${descriptionUz}, '') as description_uz,
                ${icon} as icon,
                COALESCE(${color}, '#4A90E2') as color
            FROM career_interests ci
            ORDER BY ci.id
        `);

        const interests = interestsResult.rows;
        const questions = buildCareerQuestions(interests);

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
        const answers = req.body?.answers;

        if (!answers || typeof answers !== 'object') {
            return res.status(400).json({
                error: 'invalid_request',
                message: 'Answers are required'
            });
        }

        const { nameRu, nameUz, descriptionRu, descriptionUz, icon, color } = await getCareerInterestExpressions();
        const interestsResult = await query(`
            SELECT
                ci.id,
                ${nameRu} as name_ru,
                ${nameUz} as name_uz,
                COALESCE(${descriptionRu}, '') as description_ru,
                COALESCE(${descriptionUz}, '') as description_uz,
                ${icon} as icon,
                COALESCE(${color}, '#4A90E2') as color
            FROM career_interests ci
            ORDER BY ci.id
        `);
        const interests = interestsResult.rows;

        if (interests.length === 0) {
            return res.status(400).json({
                error: 'no_interests',
                message: 'Career interests not configured'
            });
        }

        const questions = buildCareerQuestions(interests);

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

        const recommendedSubjects = buildCareerRecommendations(topInterests);

        const resultsSchema = await getCareerResultsColumns();
        const insertColumns = ['student_id'];
        const values = [studentId];
        const placeholders = ['$1'];
        let index = 2;

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
            values.push(JSON.stringify({ scores: interestsScores, recommended_subjects: recommendedSubjects }));
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

        await query(
            `INSERT INTO student_career_results (${insertColumns.join(', ')}) VALUES (${placeholders.join(', ')})`,
            values
        );

        res.json({
            result: {
                interests: scoredInterests,
                recommended_subjects: recommendedSubjects,
                top_interests: topInterests
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
        const { nameRu, nameUz, descriptionRu, descriptionUz, icon, color } = await getCareerInterestExpressions();
        const interestsResult = await query(`
            SELECT
                ci.id,
                ${nameRu} as name_ru,
                ${nameUz} as name_uz,
                COALESCE(${descriptionRu}, '') as description_ru,
                COALESCE(${descriptionUz}, '') as description_uz,
                ${icon} as icon,
                COALESCE(${color}, '#4A90E2') as color
            FROM career_interests ci
            ORDER BY ci.id
        `);
        const interests = interestsResult.rows;

        const resultsSchema = await getCareerResultsColumns();
        let resultRow = null;

        if (resultsSchema.interestsScores || resultsSchema.recommendedSubjects) {
            const orderColumn = resultsSchema.completedAt ? 'completed_at' : 'id';
            const result = await query(
                `SELECT interests_scores, recommended_subjects, completed_at
                 FROM student_career_results
                 WHERE student_id = $1
                 ORDER BY ${orderColumn} DESC NULLS LAST
                 LIMIT 1`,
                [studentId]
            );
            resultRow = result.rows[0] || null;
        } else if (resultsSchema.results) {
            const orderColumn = resultsSchema.takenAt ? 'taken_at' : 'id';
            const result = await query(
                `SELECT results, top_interests, recommendations, taken_at
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
                completed_at: completedAt
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

        const testColumns = await getTableColumns('tests');
        const testTitleColumn = pickColumn(testColumns, ['title', 'title_ru', 'title_uz'], 'title');
        const subjectColumns = await getTableColumns('subjects');
        const subjectNameColumn = pickColumn(subjectColumns, ['name', 'name_ru', 'name_uz'], 'name');
        const subjectCodeColumn = pickColumn(subjectColumns, ['code'], null);
        const subjectIsActiveFilter = subjectColumns.has('is_active')
            ? 'AND s.is_active = true'
            : '';
        const assignmentColumns = await getTableColumns('test_assignments');
        const startDateColumn = pickColumn(assignmentColumns, ['start_date', 'start_at', 'starts_at'], null);
        const endDateColumn = pickColumn(assignmentColumns, ['end_date', 'end_at', 'ends_at'], null);
        const classStudentColumns = await getTableColumns('class_students');
        const classStudentActiveFilter = classStudentColumns.has('is_active')
            ? 'AND cs.is_active = true'
            : '';

        // Get tests assigned to student's classes
        const testsAssignedResult = await query(`
            SELECT COUNT(DISTINCT ta.id) as count
            FROM test_assignments ta
            INNER JOIN class_students cs ON cs.class_id = ta.class_id
            WHERE cs.student_id = $1 ${classStudentActiveFilter}
        `, [studentId]);
        const testsAssigned = parseInt(testsAssignedResult.rows[0]?.count || 0);

        // Get tests completed by student
        const columnsResult = await query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'test_attempts'
        `);
        const columns = new Set(columnsResult.rows.map(row => row.column_name));

        let completedFilter = 'false';
        if (columns.has('status')) completedFilter = "tatt.status = 'completed'";
        else if (columns.has('is_completed')) completedFilter = 'tatt.is_completed = true';
        else if (columns.has('submitted_at')) completedFilter = 'tatt.submitted_at IS NOT NULL';

        const testsCompletedResult = await query(`
            SELECT COUNT(DISTINCT tatt.assignment_id) as count
            FROM test_attempts tatt
            INNER JOIN test_assignments ta ON ta.id = tatt.assignment_id
            INNER JOIN class_students cs ON cs.class_id = ta.class_id
            WHERE cs.student_id = $1 ${classStudentActiveFilter}
              AND tatt.student_id = $1
              AND ${completedFilter}
        `, [studentId]);
        const testsCompleted = parseInt(testsCompletedResult.rows[0]?.count || 0);

        // Get average score
        let scoreExpr = columns.has('percentage') ? 'tatt.percentage'
            : columns.has('score') && columns.has('max_score') ? '(tatt.score::float / NULLIF(tatt.max_score, 0) * 100)'
                : 'NULL';

        let avgScoreResult = { rows: [{ avg: null }] };
        if (scoreExpr !== 'NULL') {
            avgScoreResult = await query(`
                SELECT AVG(${scoreExpr})::int as avg
                FROM test_attempts tatt
                INNER JOIN test_assignments ta ON ta.id = tatt.assignment_id
                INNER JOIN class_students cs ON cs.class_id = ta.class_id
                WHERE cs.student_id = $1 ${classStudentActiveFilter}
                  AND tatt.student_id = $1
                  AND ${completedFilter}
            `, [studentId]);
        }
        const avgScore = avgScoreResult.rows[0]?.avg || 0;

        let classRank = null;
        const classResult = await query(
            `SELECT class_id
             FROM class_students cs
             WHERE cs.student_id = $1 ${classStudentActiveFilter}
             ORDER BY cs.class_id ASC
             LIMIT 1`,
            [studentId]
        );
        const classId = classResult.rows[0]?.class_id || null;
        if (classId && scoreExpr !== 'NULL') {
            const rankResult = await query(
                `WITH ranked AS (
                    SELECT
                        cs.student_id,
                        COUNT(tatt.id) as attempts,
                        AVG(${scoreExpr})::float as avg_score
                    FROM class_students cs
                    LEFT JOIN test_attempts tatt
                        ON tatt.student_id = cs.student_id
                        AND ${completedFilter}
                    WHERE cs.class_id = $1 ${classStudentActiveFilter}
                    GROUP BY cs.student_id
                    HAVING COUNT(tatt.id) > 0
                )
                SELECT rank
                FROM (
                    SELECT student_id, RANK() OVER (ORDER BY avg_score DESC NULLS LAST, attempts DESC) as rank
                    FROM ranked
                ) r
                WHERE student_id = $2
                LIMIT 1`,
                [classId, studentId]
            );
            classRank = rankResult.rows[0]?.rank || null;
        }

        const subjectPerformanceResult = await query(
            `SELECT
                s.id,
                s.${subjectNameColumn} as subject_name,
                s.color as subject_color,
                COUNT(tatt.id) as attempts,
                COALESCE(AVG(${scoreExpr}), 0)::float as avg_score
             FROM subjects s
             LEFT JOIN tests t
                ON t.subject_id = s.id
                AND t.school_id = s.school_id
             LEFT JOIN test_assignments ta
                ON ta.test_id = t.id
             LEFT JOIN class_students cs
                ON cs.class_id = ta.class_id
                AND cs.student_id = $2
                ${classStudentColumns.has('is_active') ? 'AND cs.is_active = true' : ''}
             LEFT JOIN test_attempts tatt
                ON tatt.assignment_id = ta.id
                AND tatt.student_id = $2
                AND ${completedFilter}
             WHERE s.school_id = $1 ${subjectIsActiveFilter}
             GROUP BY s.id, s.${subjectNameColumn}, s.color${subjectCodeColumn ? `, s.${subjectCodeColumn}` : ''}
             ORDER BY ${subjectCodeColumn ? `s.${subjectCodeColumn} ASC NULLS LAST,` : ''} s.${subjectNameColumn} ASC`,
            [req.user.school_id, studentId]
        );

        // Get career test completion
        let careerTestCompleted = false;
        if (await tableExists('student_career_results')) {
            const careerResult = await query(`
                SELECT COUNT(*) as count
                FROM student_career_results
                WHERE student_id = $1
            `, [studentId]);
            careerTestCompleted = parseInt(careerResult.rows[0]?.count || 0) > 0;
        }

        // Get recent test attempts (last 5)
        const recentResult = await query(`
            SELECT 
                t.id,
                t.${testTitleColumn} as title,
                c.name as class_name,
                ${columns.has('percentage') ? 'tatt.percentage'
                : columns.has('score') && columns.has('max_score') ? '(tatt.score::float / NULLIF(tatt.max_score, 0) * 100)::int'
                    : '0'}::int as percentage,
                ${columns.has('submitted_at') ? 'tatt.submitted_at'
                : columns.has('completed_at') ? 'tatt.completed_at'
                    : 'NULL'}::timestamp as submitted_at
            FROM test_attempts tatt
            INNER JOIN test_assignments ta ON ta.id = tatt.assignment_id
            INNER JOIN tests t ON t.id = ta.test_id
            INNER JOIN classes c ON c.id = ta.class_id
            INNER JOIN class_students cs ON cs.class_id = ta.class_id
            WHERE cs.student_id = $1 ${classStudentActiveFilter}
              AND tatt.student_id = $1
              AND ${completedFilter}
            ORDER BY ${columns.has('submitted_at') ? 'tatt.submitted_at'
                : columns.has('completed_at') ? 'tatt.completed_at'
                    : 'tatt.id'} DESC
            LIMIT 5
        `, [studentId]);
        const recentAttempts = recentResult.rows || [];

        const assignmentResult = await query(`
            SELECT
                ta.id,
                t.${testTitleColumn} as test_title,
                c.name as class_name,
                ${startDateColumn ? `ta.${startDateColumn}` : 'NULL'} as start_date,
                ${endDateColumn ? `ta.${endDateColumn}` : 'NULL'} as end_date,
                ta.created_at
            FROM test_assignments ta
            JOIN tests t ON t.id = ta.test_id
            JOIN classes c ON c.id = ta.class_id
            JOIN class_students cs ON cs.class_id = ta.class_id
            WHERE cs.student_id = $1 ${classStudentActiveFilter}
            ORDER BY ta.created_at DESC
            LIMIT 5
        `, [studentId]);

        const recentAssignments = assignmentResult.rows || [];

        const activity = [];
        recentAttempts.forEach(row => {
            activity.push({
                type: 'attempt',
                title: row.title,
                subtitle: row.class_name,
                percentage: row.percentage || 0,
                date: row.submitted_at
            });
        });
        recentAssignments.forEach(row => {
            activity.push({
                type: 'assignment',
                title: row.test_title,
                subtitle: row.class_name,
                date: row.created_at
            });
        });
        activity.sort((a, b) => new Date(b.date) - new Date(a.date));

        res.json({
            stats: {
                tests_assigned: testsAssigned,
                tests_completed: testsCompleted,
                avg_score: Math.round(avgScore),
                class_rank: classRank,
                career_test_completed: careerTestCompleted
            },
            subjects: subjectPerformanceResult.rows.map(row => ({
                subject_id: row.id,
                subject_name: row.subject_name,
                subject_color: row.subject_color,
                attempts: parseInt(row.attempts || 0),
                avg_score: parseFloat(row.avg_score || 0)
            })),
            recent_attempts: recentAttempts.map(row => ({
                test_title: row.title,
                class_name: row.class_name,
                percentage: row.percentage || 0,
                submitted_at: row.submitted_at
            })),
            recent_activity: activity.slice(0, 8)
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
