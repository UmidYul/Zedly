const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

// All routes require student role
router.use(authenticate);
router.use(authorize('student'));

/**
 * ========================================
 * STUDENT ASSIGNMENTS & TESTS
 * ========================================
 */

/**
 * GET /api/student/assignments
 * Get all test assignments available to student
 */
router.get('/assignments', async (req, res) => {
    try {
        const { status = 'all' } = req.query;
        const studentId = req.user.id;

        // Get student's classes
        const classesResult = await query(
            'SELECT class_id FROM class_students WHERE student_id = $1 AND is_active = true',
            [studentId]
        );

        if (classesResult.rows.length === 0) {
            return res.json({ assignments: [] });
        }

        const classIds = classesResult.rows.map(row => row.class_id);

        // Build WHERE clause
        let whereClause = `WHERE ta.class_id = ANY($1) AND ta.is_active = true`;
        const params = [classIds];

        if (status === 'active') {
            whereClause += ` AND ta.start_date <= CURRENT_TIMESTAMP AND ta.end_date > CURRENT_TIMESTAMP`;
        } else if (status === 'upcoming') {
            whereClause += ` AND ta.start_date > CURRENT_TIMESTAMP`;
        } else if (status === 'completed') {
            whereClause += ` AND ta.end_date < CURRENT_TIMESTAMP`;
        }

        // Get assignments with test info and student's attempts
        const result = await query(
            `SELECT
                ta.id, ta.test_id, ta.class_id, ta.start_date, ta.end_date,
                t.title as test_title, t.description as test_description,
                t.duration_minutes, t.passing_score, t.max_attempts,
                c.name as class_name,
                s.name as subject_name, s.color as subject_color,
                (SELECT COUNT(*) FROM test_questions WHERE test_id = t.id) as question_count,
                (SELECT COUNT(*) FROM test_attempts WHERE assignment_id = ta.id AND student_id = $2) as attempts_made,
                (SELECT MAX(percentage) FROM test_attempts WHERE assignment_id = ta.id AND student_id = $2 AND is_completed = true) as best_score,
                (SELECT id FROM test_attempts WHERE assignment_id = ta.id AND student_id = $2 AND is_completed = false ORDER BY started_at DESC LIMIT 1) as ongoing_attempt_id,
                (
                    SELECT CASE WHEN EXISTS (
                        SELECT 1 FROM test_attempts att
                        WHERE att.assignment_id = ta.id
                        AND att.student_id = $2
                        AND att.is_completed = true
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
             ORDER BY ta.end_date ASC`,
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

        // Verify student has access to this assignment
        const accessCheck = await query(
            `SELECT 1 FROM test_assignments ta
             JOIN class_students cs ON ta.class_id = cs.class_id
             WHERE ta.id = $1 AND cs.student_id = $2 AND cs.is_active = true`,
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
                ta.*, t.title as test_title, t.description as test_description,
                t.duration_minutes, t.passing_score, t.max_attempts,
                c.name as class_name,
                s.name as subject_name, s.color as subject_color,
                (SELECT COUNT(*) FROM test_questions WHERE test_id = t.id) as question_count
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
            `SELECT ta.*, t.max_attempts, t.duration_minutes
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

        // Calculate max score
        const maxScore = questionsResult.rows.reduce((sum, q) => sum + parseFloat(q.marks), 0);

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

        res.status(201).json({
            message: 'Test attempt started',
            attempt_id: attemptResult.rows[0].id,
            started_at: attemptResult.rows[0].started_at,
            duration_minutes: assignment.duration_minutes,
            questions: questionsResult.rows
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

        res.json({
            attempt: attempt,
            questions: questionsResult.rows
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
        const { answers } = req.body;
        const studentId = req.user.id;

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
            const studentAnswer = answers[question.id];
            const correctAnswer = question.correct_answer;
            let isCorrect = false;
            let earnedMarks = 0;

            if (studentAnswer !== undefined && studentAnswer !== null) {
                switch (question.question_type) {
                    case 'singlechoice':
                    case 'truefalse':
                        isCorrect = String(studentAnswer) === String(correctAnswer);
                        break;

                    case 'multiplechoice':
                        const correctArray = Array.isArray(correctAnswer) ? correctAnswer : [];
                        const studentArray = Array.isArray(studentAnswer) ? studentAnswer : [];
                        isCorrect = correctArray.length === studentArray.length &&
                            correctArray.every(val => studentArray.includes(val));
                        break;

                    case 'shortanswer':
                        const acceptableAnswers = Array.isArray(correctAnswer) ? correctAnswer : [correctAnswer];
                        isCorrect = acceptableAnswers.some(ans =>
                            String(ans).toLowerCase().trim() === String(studentAnswer).toLowerCase().trim()
                        );
                        break;

                    case 'ordering':
                    case 'matching':
                        const correctOrder = Array.isArray(correctAnswer) ? correctAnswer : [];
                        const studentOrder = Array.isArray(studentAnswer) ? studentAnswer : [];
                        isCorrect = JSON.stringify(correctOrder) === JSON.stringify(studentOrder);
                        break;

                    case 'fillblanks':
                        const correctBlanks = Array.isArray(correctAnswer) ? correctAnswer : [];
                        const studentBlanks = Array.isArray(studentAnswer) ? studentAnswer : [];
                        isCorrect = correctBlanks.length === studentBlanks.length &&
                            correctBlanks.every((ans, idx) =>
                                String(ans).toLowerCase().trim() === String(studentBlanks[idx] || '').toLowerCase().trim()
                            );
                        break;

                    case 'imagebased':
                        isCorrect = String(studentAnswer) === String(correctAnswer);
                        break;

                    case 'essay':
                        // Essays need manual grading
                        isCorrect = null;
                        break;
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
                is_completed = true
             WHERE id = $5`,
            [timeSpentSeconds, totalScore, percentage, JSON.stringify(gradedAnswers), id]
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
        const { answers } = req.body;
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
            'UPDATE test_attempts SET answers = $1 WHERE id = $2',
            [JSON.stringify(answers), id]
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

module.exports = router;
