
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const bcrypt = require('bcrypt');
const { notifyNewTest, notifyPasswordReset } = require('../utils/notifications');

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

    let completedFilter = 'TRUE';
    if (columns.has('status')) {
        completedFilter = `${alias}.status = 'completed'`;
    } else if (columns.has('is_completed')) {
        completedFilter = `${alias}.is_completed = true`;
    } else if (completedAt !== 'NULL') {
        completedFilter = `${completedAt} IS NOT NULL`;
    }

    return { score: scoreExpr, completedAt, completedFilter };
}

// All routes require teacher role only
router.use(authenticate);
router.use(authorize('teacher'));

const questionUploadsDir = path.join(__dirname, '..', '..', 'public', 'uploads', 'questions');
if (!fs.existsSync(questionUploadsDir)) {
    fs.mkdirSync(questionUploadsDir, { recursive: true });
}

const questionImageUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, questionUploadsDir),
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname || '').toLowerCase() || '.png';
            cb(null, `question_${Date.now()}_${Math.round(Math.random() * 1e9)}${ext}`);
        }
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (!file.mimetype || !file.mimetype.startsWith('image/')) {
            return cb(new Error('Only image files are allowed'));
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
                COUNT(att.id) FILTER (WHERE ${attempt.completedFilter}) as tests_completed,
                AVG(${attempt.score}) FILTER (WHERE ${attempt.completedFilter}) as avg_score
             FROM class_students cs
             JOIN users u ON u.id = cs.student_id
             LEFT JOIN test_assignments ta ON ta.class_id = cs.class_id AND ta.assigned_by = $2
             LEFT JOIN test_attempts att ON att.assignment_id = ta.id AND att.student_id = u.id
             WHERE cs.class_id = $1 AND cs.is_active = true
             GROUP BY u.id, cs.roll_number
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
        studentId = id;
        teacherId = req.user.id;
        schoolId = req.user.school_id;

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
               AND u.role = 'student'
               AND u.is_active = true
             LIMIT 1`,
            [id, schoolId, teacherId]
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
                t.title as test_title, t.duration_minutes, t.passing_score,
                c.name as class_name, c.grade_level,
                s.name as subject_name, s.color as subject_color,
                (SELECT COUNT(*) FROM test_attempts WHERE assignment_id = ta.id) as attempt_count,
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
                cs.roll_number,
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
        const { test_id, class_id, class_ids, start_date, end_date } = req.body;
        testId = test_id;
        teacherId = req.user.id;
        schoolId = req.user.school_id;
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

        for (const targetClassId of classIdsToCreate) {
            const result = await query(
                `INSERT INTO test_assignments (test_id, class_id, assigned_by, start_date, end_date, is_active)
                 VALUES ($1, $2, $3, $4, $5, true)
                 RETURNING id, class_id, created_at`,
                [test_id, targetClassId, teacherId, start_date, end_date]
            );
            const assignment = result.rows[0];
            createdAssignments.push(assignment);

            await query(
                `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
                 VALUES ($1, $2, $3, $4, $5)`,
                [teacherId, 'create', 'test_assignment', assignment.id, { test_id, class_id: targetClassId }]
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
        const { start_date, end_date, is_active } = req.body;
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
 * Delete test assignment (soft delete by setting is_active to false)
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

module.exports = router;
