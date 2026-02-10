const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

// All routes require teacher or school_admin role
router.use(authenticate);
router.use(authorize('teacher', 'school_admin'));

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
        let whereClause = 'WHERE t.teacher_id = $1';
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
                t.passing_score, t.is_published as is_active, t.created_at, t.updated_at,
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
             WHERE t.id = $1 AND t.teacher_id = $2`,
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
            passing_score, max_attempts, shuffle_questions,
            block_copy_paste, track_tab_switches, fullscreen_required,
            questions
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
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, false)
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
                fullscreen_required === true
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
                        JSON.stringify(q.correct_answer),
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
            passing_score, max_attempts, shuffle_questions,
            block_copy_paste, track_tab_switches, fullscreen_required,
            is_published, questions
        } = req.body;
        const teacherId = req.user.id;

        // Check ownership
        const testCheck = await query(
            'SELECT id FROM tests WHERE id = $1 AND teacher_id = $2',
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
                        JSON.stringify(q.correct_answer), q.marks || 1, i + 1,
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
            'SELECT id, title FROM tests WHERE id = $1 AND teacher_id = $2',
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
                'UPDATE tests SET is_published = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
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
        const offset = (page - 1) * limit;
        const teacherId = req.user.id;
        const schoolId = req.user.school_id;

        // Build WHERE clause
        let whereClause = `WHERE c.school_id = $1
            AND c.is_active = true
            AND (c.homeroom_teacher_id = $2 OR tcs.teacher_id = $2)`;
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
            `SELECT COUNT(DISTINCT c.id)
             FROM classes c
             LEFT JOIN teacher_class_subjects tcs ON c.id = tcs.class_id
             ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0].count);

        // Get classes where teacher teaches or is homeroom teacher
        params.push(limit, offset);
        const result = await query(
            `SELECT DISTINCT
                c.id, c.name, c.grade_level,
                c.academic_year, c.is_active,
                CONCAT(ht.first_name, ' ', ht.last_name) as homeroom_teacher_name,
                (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id = c.id) as student_count,
                (SELECT COUNT(DISTINCT tcs.subject_id)
                 FROM teacher_class_subjects tcs
                 WHERE tcs.class_id = c.id AND tcs.teacher_id = $2) as subject_count
             FROM classes c
             LEFT JOIN users ht ON c.homeroom_teacher_id = ht.id
             LEFT JOIN teacher_class_subjects tcs ON c.id = tcs.class_id
             ${whereClause}
             ORDER BY c.grade_level DESC, c.name ASC
             LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
            params
        );

        res.json({
            classes: result.rows,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
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
                (SELECT COUNT(*) FROM class_students WHERE class_id = c.id) as student_count
             FROM classes c
             LEFT JOIN users ht ON c.homeroom_teacher_id = ht.id
             WHERE c.id = $1`,
            [id]
        );

        // Get subjects taught by this teacher in this class
        const subjectsResult = await query(
            `SELECT s.id, s.name, s.code, s.color
             FROM teacher_class_subjects tcs
             JOIN subjects s ON tcs.subject_id = s.id
             WHERE tcs.class_id = $1 AND tcs.teacher_id = $2
             ORDER BY s.name ASC`,
            [id, teacherId]
        );

        // Get students in the class
        const studentsResult = await query(
            `SELECT
                u.id,
                CONCAT(u.first_name, ' ', u.last_name) as full_name,
                u.email,
                cs.roll_number
             FROM class_students cs
             JOIN users u ON cs.student_id = u.id
             WHERE cs.class_id = $1 AND cs.is_active = true
             ORDER BY cs.roll_number ASC`,
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
                COUNT(att.id) FILTER (WHERE att.is_completed = true) as completed_attempts,
                AVG(att.percentage) FILTER (WHERE att.is_completed = true) as avg_percentage
             FROM test_assignments ta
             LEFT JOIN test_attempts att ON att.assignment_id = ta.id
             WHERE ta.class_id = $1 AND ta.assigned_by = $2`,
            [id, teacherId]
        );

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
                COUNT(att.id) FILTER (WHERE att.is_completed = true) as completed_attempts,
                AVG(att.percentage) FILTER (WHERE att.is_completed = true) as avg_percentage
             FROM test_assignments ta
             JOIN tests t ON ta.test_id = t.id
             LEFT JOIN test_attempts att ON att.assignment_id = ta.id
             WHERE ta.class_id = $1 AND ta.assigned_by = $2
             GROUP BY ta.id, t.title, t.passing_score
             ORDER BY ta.created_at DESC
             LIMIT 20`,
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
            assignments: assignmentsResult.rows
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

        // Build WHERE clause
        let whereClause = 'WHERE ta.assigned_by = $1';
        const params = [teacherId];
        let paramCount = 2;

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
                t.title as test_title, t.duration_minutes, t.passing_score,
                c.name as class_name, c.grade_level,
                s.name as subject_name, s.color as subject_color,
                (SELECT COUNT(*) FROM test_attempts WHERE assignment_id = ta.id) as attempt_count,
                (SELECT COUNT(*) FROM class_students WHERE class_id = ta.class_id) as student_count
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
             WHERE ta.id = $1 AND ta.assigned_by = $2`,
            [id, teacherId]
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
                cs.roll_number,
                (SELECT COUNT(*) FROM test_attempts WHERE assignment_id = $1 AND student_id = u.id) as attempts_made,
                (SELECT MAX(percentage) FROM test_attempts WHERE assignment_id = $1 AND student_id = u.id AND is_completed = true) as best_score,
                (SELECT submitted_at FROM test_attempts WHERE assignment_id = $1 AND student_id = u.id AND is_completed = true ORDER BY submitted_at DESC LIMIT 1) as last_attempt_date
             FROM class_students cs
             JOIN users u ON cs.student_id = u.id
             WHERE cs.class_id = $2 AND cs.is_active = true
             ORDER BY cs.roll_number ASC`,
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
    try {
        const { test_id, class_id, start_date, end_date } = req.body;
        const teacherId = req.user.id;

        // Validation
        if (!test_id || !class_id || !start_date || !end_date) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Test, class, start date and end date are required'
            });
        }

        // Verify test belongs to teacher
        const testCheck = await query(
            'SELECT id FROM tests WHERE id = $1 AND teacher_id = $2',
            [test_id, teacherId]
        );

        if (testCheck.rows.length === 0) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Invalid test'
            });
        }

        // Verify teacher has access to class
        const schoolId = req.user.school_id;
        const classCheck = await query(
            `SELECT 1 FROM classes c
             LEFT JOIN teacher_class_subjects tcs ON c.id = tcs.class_id
             WHERE c.id = $1
               AND c.school_id = $2
               AND (c.homeroom_teacher_id = $3 OR tcs.teacher_id = $3)
             LIMIT 1`,
            [class_id, schoolId, teacherId]
        );

        if (classCheck.rows.length === 0) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'You do not have access to this class'
            });
        }

        // Check if assignment already exists
        const existingCheck = await query(
            'SELECT id FROM test_assignments WHERE test_id = $1 AND class_id = $2 AND is_active = true',
            [test_id, class_id]
        );

        if (existingCheck.rows.length > 0) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'This test is already assigned to this class'
            });
        }

        // Create assignment
        const result = await query(
            `INSERT INTO test_assignments (test_id, class_id, assigned_by, start_date, end_date, is_active)
             VALUES ($1, $2, $3, $4, $5, true)
             RETURNING id, created_at`,
            [test_id, class_id, teacherId, start_date, end_date]
        );

        // Log action
        await query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [teacherId, 'create', 'test_assignment', result.rows[0].id, { test_id, class_id }]
        );

        res.status(201).json({
            message: 'Assignment created successfully',
            assignment: result.rows[0]
        });
    } catch (error) {
        console.error('Create assignment error:', error);
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
    try {
        const { id } = req.params;
        const { start_date, end_date, is_active } = req.body;
        const teacherId = req.user.id;

        // Check ownership
        const assignmentCheck = await query(
            'SELECT id FROM test_assignments WHERE id = $1 AND assigned_by = $2',
            [id, teacherId]
        );

        if (assignmentCheck.rows.length === 0) {
            return res.status(404).json({
                error: 'not_found',
                message: 'Assignment not found'
            });
        }

        // Update assignment
        await query(
            `UPDATE test_assignments SET
                start_date = $1, end_date = $2, is_active = $3
             WHERE id = $4`,
            [start_date, end_date, is_active, id]
        );

        // Log action
        await query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [teacherId, 'update', 'test_assignment', id, { start_date, end_date, is_active }]
        );

        res.json({ message: 'Assignment updated successfully' });
    } catch (error) {
        console.error('Update assignment error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to update assignment'
        });
    }
});

/**
 * DELETE /api/teacher/assignments/:id
 * Delete test assignment (soft delete by setting is_active to false)
 */
router.delete('/assignments/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const teacherId = req.user.id;

        // Check ownership
        const assignmentCheck = await query(
            'SELECT id FROM test_assignments WHERE id = $1 AND assigned_by = $2',
            [id, teacherId]
        );

        if (assignmentCheck.rows.length === 0) {
            return res.status(404).json({
                error: 'not_found',
                message: 'Assignment not found'
            });
        }

        // Check if there are attempts
        const attemptsCheck = await query(
            'SELECT COUNT(*) FROM test_attempts WHERE assignment_id = $1',
            [id]
        );

        if (parseInt(attemptsCheck.rows[0].count) > 0) {
            // Soft delete if has attempts
            await query(
                'UPDATE test_assignments SET is_active = false WHERE id = $1',
                [id]
            );
        } else {
            // Hard delete if no attempts
            await query('DELETE FROM test_assignments WHERE id = $1', [id]);
        }

        // Log action
        await query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [teacherId, 'delete', 'test_assignment', id, {}]
        );

        res.json({ message: 'Assignment deleted successfully' });
    } catch (error) {
        console.error('Delete assignment error:', error);
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

        // Verify teacher owns this assignment
        const assignmentCheck = await query(
            `SELECT ta.*, t.title as test_title, t.passing_score, c.name as class_name
             FROM test_assignments ta
             JOIN tests t ON ta.test_id = t.id
             JOIN classes c ON ta.class_id = c.id
             WHERE ta.id = $1 AND ta.assigned_by = $2`,
            [id, teacherId]
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
                att.is_completed
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
             WHERE att.id = $1 AND ta.assigned_by = $2`,
            [id, teacherId]
        );

        if (attemptResult.rows.length === 0) {
            return res.status(404).json({
                error: 'not_found',
                message: 'Attempt not found'
            });
        }

        const attempt = attemptResult.rows[0];

        // Get questions with answers
        const questionsResult = await query(
            `SELECT * FROM test_questions WHERE test_id = $1 ORDER BY order_number ASC`,
            [attempt.test_id]
        );

        res.json({
            attempt: attempt,
            questions: questionsResult.rows
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
 * ========================================
 * MANUAL GRADING
 * ========================================
 */

/**
 * GET /api/teacher/grading/pending
 * Get all attempts that need manual grading
 */
router.get('/grading/pending', async (req, res) => {
    try {
        const teacherId = req.user.id;

        // Get all attempts that have essay questions needing grading
        const attemptsResult = await query(
            `SELECT DISTINCT
                att.id as attempt_id,
                att.student_id,
                att.test_id,
                att.assignment_id,
                att.submitted_at,
                att.is_completed,
                CONCAT(u.first_name, ' ', u.last_name) as student_name,
                t.title as test_title,
                c.name as class_name,
                ta.start_date,
                ta.end_date
             FROM test_attempts att
             JOIN users u ON att.student_id = u.id
             JOIN tests t ON att.test_id = t.id
             JOIN test_assignments ta ON att.assignment_id = ta.id
             JOIN classes c ON ta.class_id = c.id
             WHERE ta.assigned_by = $1
             AND att.is_completed = true
             AND EXISTS (
                 SELECT 1 FROM test_questions tq
                 WHERE tq.test_id = att.test_id
                 AND tq.question_type = 'essay'
             )
             AND EXISTS (
                 SELECT 1 FROM jsonb_each(att.answers) AS answer_entry
                 WHERE (answer_entry.value->>'is_correct')::text = 'null'
             )
             ORDER BY att.submitted_at ASC`,
            [teacherId]
        );

        res.json({
            attempts: attemptsResult.rows
        });

    } catch (error) {
        console.error('Get pending grading error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch pending grading attempts'
        });
    }
});

/**
 * PUT /api/teacher/grading/:attemptId/question/:questionId
 * Grade a specific question in an attempt
 */
router.put('/grading/:attemptId/question/:questionId', async (req, res) => {
    try {
        const { attemptId, questionId } = req.params;
        const { earned_marks, feedback } = req.body;
        const teacherId = req.user.id;

        // Validate earned_marks
        if (earned_marks === undefined || earned_marks === null) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Earned marks is required'
            });
        }

        // Get attempt and verify teacher owns it
        const attemptResult = await query(
            `SELECT att.*, t.id as test_id, ta.assigned_by
             FROM test_attempts att
             JOIN test_assignments ta ON att.assignment_id = ta.id
             JOIN tests t ON att.test_id = t.id
             WHERE att.id = $1 AND ta.assigned_by = $2`,
            [attemptId, teacherId]
        );

        if (attemptResult.rows.length === 0) {
            return res.status(404).json({
                error: 'not_found',
                message: 'Attempt not found'
            });
        }

        const attempt = attemptResult.rows[0];

        // Get question to verify marks
        const questionResult = await query(
            `SELECT * FROM test_questions
             WHERE id = $1 AND test_id = $2`,
            [questionId, attempt.test_id]
        );

        if (questionResult.rows.length === 0) {
            return res.status(404).json({
                error: 'not_found',
                message: 'Question not found'
            });
        }

        const question = questionResult.rows[0];
        const maxMarks = question.marks;

        // Validate earned marks is not greater than max
        if (parseFloat(earned_marks) > parseFloat(maxMarks)) {
            return res.status(400).json({
                error: 'validation_error',
                message: `Earned marks cannot exceed ${maxMarks}`
            });
        }

        // Update the answer in the JSONB answers field
        const answers = attempt.answers || {};

        if (!answers[questionId]) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Question answer not found in attempt'
            });
        }

        // Update the specific answer
        answers[questionId].earned_marks = parseFloat(earned_marks);
        answers[questionId].is_correct = parseFloat(earned_marks) === parseFloat(maxMarks);
        answers[questionId].feedback = feedback || null;
        answers[questionId].graded_at = new Date().toISOString();
        answers[questionId].graded_by = teacherId;

        // Recalculate total score
        let totalScore = 0;
        Object.keys(answers).forEach(qId => {
            const ans = answers[qId];
            if (ans.earned_marks !== undefined && ans.earned_marks !== null) {
                totalScore += parseFloat(ans.earned_marks);
            }
        });

        // Get max score from all questions
        const maxScoreResult = await query(
            `SELECT SUM(marks) as max_score FROM test_questions WHERE test_id = $1`,
            [attempt.test_id]
        );
        const maxScore = parseFloat(maxScoreResult.rows[0].max_score);
        const percentage = (totalScore / maxScore) * 100;

        // Update attempt
        await query(
            `UPDATE test_attempts
             SET answers = $1, score = $2, percentage = $3
             WHERE id = $4`,
            [JSON.stringify(answers), totalScore, percentage, attemptId]
        );

        res.json({
            message: 'Question graded successfully',
            score: totalScore,
            max_score: maxScore,
            percentage: percentage.toFixed(2)
        });

    } catch (error) {
        console.error('Grade question error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to grade question'
        });
    }
});

module.exports = router;
