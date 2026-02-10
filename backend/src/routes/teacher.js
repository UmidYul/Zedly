const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

// All routes require teacher role
router.use(authenticate);
router.use(authorize('teacher'));

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

        // Build WHERE clause
        let whereClause = 'WHERE t.created_by = $1';
        const params = [teacherId];
        let paramCount = 2;

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
            const isActive = status === 'active';
            params.push(isActive);
            whereClause += ` AND t.is_active = $${paramCount}`;
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
                t.total_marks, t.passing_marks, t.is_active, t.created_at, t.updated_at,
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
 * GET /api/teacher/tests/:id
 * Get test details with questions
 */
router.get('/tests/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const teacherId = req.user.id;

        // Get test with validation
        const testResult = await query(
            `SELECT
                t.*, s.name as subject_name, s.color as subject_color,
                (SELECT COUNT(*) FROM test_attempts WHERE test_id = t.id) as attempt_count
             FROM tests t
             LEFT JOIN subjects s ON t.subject_id = s.id
             WHERE t.id = $1 AND t.created_by = $2`,
            [id, teacherId]
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
            total_marks, passing_marks, questions
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
                school_id, subject_id, created_by, title, description,
                duration_minutes, total_marks, passing_marks, is_active
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false)
             RETURNING id, title, created_at`,
            [
                schoolId, subject_id, teacherId, title.trim(),
                description?.trim() || null,
                duration_minutes || 60,
                total_marks || 0,
                passing_marks || 0
            ]
        );

        const testId = testResult.rows[0].id;

        // Add questions if provided
        if (questions && questions.length > 0) {
            for (let i = 0; i < questions.length; i++) {
                const q = questions[i];
                await query(
                    `INSERT INTO test_questions (
                        test_id, question_type, question_text, options,
                        correct_answer, marks, order_number, media_url
                     )
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [
                        testId,
                        q.question_type,
                        q.question_text,
                        JSON.stringify(q.options || []),
                        q.correct_answer,
                        q.marks || 1,
                        i + 1,
                        q.media_url || null
                    ]
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
            message: 'Failed to create test'
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
            total_marks, passing_marks, is_active, questions
        } = req.body;
        const teacherId = req.user.id;

        // Check ownership
        const testCheck = await query(
            'SELECT id FROM tests WHERE id = $1 AND created_by = $2',
            [id, teacherId]
        );

        if (testCheck.rows.length === 0) {
            return res.status(404).json({
                error: 'not_found',
                message: 'Test not found'
            });
        }

        // Update test
        await query(
            `UPDATE tests SET
                title = $1, description = $2, subject_id = $3,
                duration_minutes = $4, total_marks = $5, passing_marks = $6,
                is_active = $7, updated_at = CURRENT_TIMESTAMP
             WHERE id = $8`,
            [
                title.trim(), description?.trim() || null, subject_id,
                duration_minutes, total_marks, passing_marks, is_active, id
            ]
        );

        // Update questions if provided
        if (questions) {
            // Delete existing questions
            await query('DELETE FROM test_questions WHERE test_id = $1', [id]);

            // Add new questions
            for (let i = 0; i < questions.length; i++) {
                const q = questions[i];
                await query(
                    `INSERT INTO test_questions (
                        test_id, question_type, question_text, options,
                        correct_answer, marks, order_number, media_url
                     )
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [
                        id, q.question_type, q.question_text,
                        JSON.stringify(q.options || []),
                        q.correct_answer, q.marks || 1, i + 1,
                        q.media_url || null
                    ]
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
            message: 'Failed to update test'
        });
    }
});

/**
 * DELETE /api/teacher/tests/:id
 * Delete test (soft delete)
 */
router.delete('/tests/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const teacherId = req.user.id;

        // Check ownership
        const testCheck = await query(
            'SELECT id, title FROM tests WHERE id = $1 AND created_by = $2',
            [id, teacherId]
        );

        if (testCheck.rows.length === 0) {
            return res.status(404).json({
                error: 'not_found',
                message: 'Test not found'
            });
        }

        // Check if test has attempts
        const attemptsCheck = await query(
            'SELECT COUNT(*) FROM test_attempts WHERE test_id = $1',
            [id]
        );

        if (parseInt(attemptsCheck.rows[0].count) > 0) {
            // Soft delete if has attempts
            await query(
                'UPDATE tests SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
                [id]
            );
        } else {
            // Hard delete if no attempts
            await query('DELETE FROM tests WHERE id = $1', [id]);
        }

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

/**
 * GET /api/teacher/subjects
 * Get subjects for dropdowns
 */
router.get('/subjects', async (req, res) => {
    try {
        const schoolId = req.user.school_id;

        const result = await query(
            `SELECT id, name, code, color
             FROM subjects
             WHERE school_id = $1 AND is_active = true
             ORDER BY name ASC`,
            [schoolId]
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

module.exports = router;
