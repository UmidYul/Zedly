const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const multer = require('multer');
const XLSX = require('xlsx');
const ExcelJS = require('exceljs');
const { query, getClient } = require('../config/database');
const { authenticate, authorize, enforceSchoolIsolation } = require('../middleware/auth');
const { notifyNewUser, notifySystemChange } = require('../utils/notifications');

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

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        const fileName = String(file.originalname || '').toLowerCase();
        const allowedMimeTypes = new Set([
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            'text/csv',
            'application/csv',
            'text/plain'
        ]);
        const hasAllowedExtension = fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv');

        if (allowedMimeTypes.has(file.mimetype) || hasAllowedExtension) {
            cb(null, true);
        } else {
            cb(new Error('Only Excel/CSV files are allowed'));
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
 * GET /api/admin/users
 * Get all users in school
 */
router.get('/users', async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', role = 'all' } = req.query;
        const offset = (page - 1) * limit;
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
                is_active, created_at, last_login,
                (SELECT COUNT(*) FROM class_students WHERE student_id = users.id) as class_count
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
                page: parseInt(page),
                limit: parseInt(limit),
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
                telegram_id, is_active, created_at, last_login
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

        if (user.role === 'teacher') {
            const assignmentsResult = await query(
                `SELECT subject_id, array_agg(class_id) as class_ids
                 FROM teacher_class_subjects
                 WHERE teacher_id = $1
                 GROUP BY subject_id`,
                [id]
            );
            user.teacher_assignments = assignmentsResult.rows || [];
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
            telegram_id
        } = req.body;
        const schoolId = req.user.school_id;
        const normalizedPhone = phone ? normalizeUzPhone(phone) : null;

        // Validation
        if (!username || !role || !first_name || !last_name) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Username, role, first name and last name are required'
            });
        }

        // Valid roles for school admin
        const validRoles = ['school_admin', 'teacher', 'student'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Invalid role'
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
                is_active, must_change_password
            )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10)
             RETURNING id, username, role, first_name, last_name, email, phone, telegram_id, created_at`,
            [
                schoolId,
                role,
                username.trim(),
                passwordHash,
                first_name.trim(),
                last_name.trim(),
                email || null,
                normalizedPhone,
                telegram_id || null,
                isTemporaryPassword
            ]
        );

        const userId = result.rows[0].id;

        // If teacher, save teacher assignments
        if (role === 'teacher' && req.body.teacher_assignments && Array.isArray(req.body.teacher_assignments)) {
            for (const assignment of req.body.teacher_assignments) {
                const { subject_id, class_ids } = assignment;
                if (subject_id && Array.isArray(class_ids)) {
                    for (const classId of class_ids) {
                        // fetch academic_year for this classId
                        const classResult = await query(
                            'SELECT academic_year FROM classes WHERE id = $1',
                            [classId]
                        );
                        const academicYear = classResult.rows[0]?.academic_year;
                        if (!academicYear) {
                            throw new Error(`Class with id ${classId} not found or missing academic_year`);
                        }
                        await query(
                            `INSERT INTO teacher_class_subjects (teacher_id, class_id, subject_id, academic_year)
                             VALUES ($1, $2, $3, $4)
                             ON CONFLICT (teacher_id, class_id, subject_id, academic_year) DO NOTHING`,
                            [userId, classId, subject_id, academicYear]
                        );
                    }
                }
            }
        }
        // If student, save class assignment
        if (role === 'student' && req.body.student_class_id) {
            await query(
                `INSERT INTO class_students (class_id, student_id, is_active)
                 VALUES ($1, $2, true)
                 ON CONFLICT (class_id, student_id) DO NOTHING`,
                [req.body.student_class_id, userId]
            );
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
                { username: username.trim(), role }
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
            is_active
        } = req.body;
        const schoolId = req.user.school_id;
        const normalizedPhone = phone === undefined
            ? undefined
            : (phone ? normalizeUzPhone(phone) : null);

        // Check if user exists in same school
        const existingUser = await query(
            'SELECT id FROM users WHERE id = $1 AND school_id = $2',
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
            const validRoles = ['school_admin', 'teacher', 'student'];
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

        // Update teacher assignments if provided
        if (role === 'teacher' && Array.isArray(req.body.teacher_assignments)) {
            // Remove previous assignments for this teacher
            await query('DELETE FROM teacher_class_subjects WHERE teacher_id = $1', [id]);

            for (const assignment of req.body.teacher_assignments) {
                const { subject_id, class_ids } = assignment;
                if (subject_id && Array.isArray(class_ids)) {
                    for (const classId of class_ids) {
                        const classResult = await query(
                            'SELECT academic_year FROM classes WHERE id = $1',
                            [classId]
                        );
                        const academicYear = classResult.rows[0]?.academic_year;
                        if (!academicYear) {
                            throw new Error(`Class with id ${classId} not found or missing academic_year`);
                        }
                        await query(
                            `INSERT INTO teacher_class_subjects (teacher_id, class_id, subject_id, academic_year)
                             VALUES ($1, $2, $3, $4)
                             ON CONFLICT (teacher_id, class_id, subject_id, academic_year) DO NOTHING`,
                            [id, classId, subject_id, academicYear]
                        );
                    }
                }
            }
        }

        // Log action
        await query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [req.user.id, 'update', 'user', id, req.body]
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

        const schoolId = req.user.school_id;
        const importType = normalizeImportType(req.body.import_type);
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const parsedRows = parseImportRows(sheet, importType);

        const results = {
            imported: 0,
            created: [],
            errors: [],
            auto_created_classes: [],
            skipped: 0
        };

        for (let i = 0; i < parsedRows.length; i++) {
            const { row, rowNumber } = parsedRows[i];
            const mapped = mapImportRow(row);

            if (!mapped) {
                continue;
            }

            try {
                if (importType === 'teacher') {
                    hydrateTeacherNameFields(mapped);
                    if (!isTeacherPosition(mapped.position)) {
                        results.skipped += 1;
                        continue;
                    }
                } else {
                    hydrateStudentNameFields(mapped);
                }

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
                    }
                }

                if (role === 'teacher' && mapped.class_names) {
                    const classesList = parseTeacherClassList(mapped.class_names);
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
                    otp_password: otpPassword
                });
            } catch (rowError) {
                console.error('Import row error:', rowError);
                results.errors.push({ row: rowNumber, message: 'Failed to import row' });
            }
        }

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
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to import users'
        });
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
            ['№', 'Логин', 'OTP пароль', 'Роль'],
            ...users.map((user, index) => ([
                index + 1,
                String(user.username || '').trim(),
                String(user.otp_password || '').trim(),
                String(user.role || '').trim()
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
             WHERE u.school_id = $1
             GROUP BY u.id
             ORDER BY u.last_name ASC, u.first_name ASC`,
            [schoolId]
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
        const { page = 1, limit = 10, search = '', grade = 'all' } = req.query;
        const offset = (page - 1) * limit;

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
        const { page = 1, limit = 10, search = '' } = req.query;
        const offset = (page - 1) * limit;
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
            `SELECT id, name_ru, name_uz, name, code, color, description, is_active, created_at
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
                page: parseInt(page),
                limit: parseInt(limit),
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
            `SELECT id, name, code, color, description, is_active, created_at
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
        const { name, code, color, description } = req.body;
        const schoolId = req.user.school_id;

        // Validation
        if (!name || !code) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Name and code are required'
            });
        }

        // Check duplicate subject code in same school
        const duplicateCheck = await query(
            'SELECT id FROM subjects WHERE school_id = $1 AND code = $2',
            [schoolId, code.trim().toUpperCase()]
        );

        if (duplicateCheck.rows.length > 0) {
            return res.status(400).json({
                error: 'duplicate_error',
                message: 'Subject with this code already exists'
            });
        }

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
            `INSERT INTO subjects (school_id, name, code, color, description, is_active)
             VALUES ($1, $2, $3, $4, $5, true)
             RETURNING id, name, code, color, description, is_active, created_at`,
            [
                schoolId,
                name.trim(),
                code.trim().toUpperCase(),
                finalColor,
                description?.trim() || null
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
                        { name: name.trim(), code: code.trim() }
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
        const { name, code, color, description, is_active } = req.body;
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

        // Check duplicate code
        if (code) {
            const duplicateCheck = await query(
                'SELECT id FROM subjects WHERE school_id = $1 AND code = $2 AND id != $3',
                [schoolId, code.trim().toUpperCase(), id]
            );

            if (duplicateCheck.rows.length > 0) {
                return res.status(400).json({
                    error: 'duplicate_error',
                    message: 'Subject with this code already exists'
                });
            }
        }

        // Build update query
        const updates = [];
        const params = [];
        let paramCount = 1;

        if (name !== undefined) {
            params.push(name.trim());
            updates.push(`name = $${paramCount++}`);
        }

        if (code !== undefined) {
            params.push(code.trim().toUpperCase());
            updates.push(`code = $${paramCount++}`);
        }

        if (color !== undefined) {
            params.push(color);
            updates.push(`color = $${paramCount++}`);
        }

        if (description !== undefined) {
            params.push(description?.trim() || null);
            updates.push(`description = $${paramCount++}`);
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
             RETURNING id, name, code, color, description, is_active, updated_at`,
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
        администраторшколы: 'school_admin'
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

function parseImportRows(sheet, importType = 'student') {
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
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
            return XLSX.utils.sheet_to_json(sheet, { defval: '' }).map((row, index) => ({
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

    const fallbackRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
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

module.exports = router;



