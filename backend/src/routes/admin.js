const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const multer = require('multer');
const XLSX = require('xlsx');
const { query } = require('../config/database');
const { authenticate, authorize, enforceSchoolIsolation } = require('../middleware/auth');
const { notifyNewUser } = require('../utils/notifications');

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
        // Accept only Excel files
        if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
            file.mimetype === 'application/vnd.ms-excel') {
            cb(null, true);
        } else {
            cb(new Error('Only Excel files are allowed'));
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

        res.json({
            users: result.rows,
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

        res.json({ user: result.rows[0] });
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
        const finalPassword = password || generateOTP();
        const passwordHash = await bcrypt.hash(finalPassword, 10);

        // Create user
        const result = await query(
            `INSERT INTO users (
                school_id, role, username, password_hash,
                first_name, last_name, email, phone, telegram_id,
                is_active
            )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
             RETURNING id, username, role, first_name, last_name, email, phone, created_at`,
            [
                schoolId,
                role,
                username.trim(),
                passwordHash,
                first_name.trim(),
                last_name.trim(),
                email || null,
                phone || null,
                telegram_id || null
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

        res.status(201).json({
            message: 'User created successfully',
            user: result.rows[0],
            ...(password ? {} : { otp_password: finalPassword })
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
            params.push(phone);
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

        // Log action
        await query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [req.user.id, 'update', 'user', id, req.body]
        );

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
 * Delete user (soft delete)
 */
router.delete('/users/:id', enforceSchoolIsolation, async (req, res) => {
    try {
        const { id } = req.params;
        const schoolId = req.user.school_id;

        // Check if user exists in same school
        const existingUser = await query(
            'SELECT id, username FROM users WHERE id = $1 AND school_id = $2',
            [id, schoolId]
        );

        if (existingUser.rows.length === 0) {
            return res.status(404).json({
                error: 'not_found',
                message: 'User not found'
            });
        }



        // Remove all class_students links for this user (if student)
        await query(
            'DELETE FROM class_students WHERE student_id = $1',
            [id]
        );

        // Remove all teacher_class_subjects links for this user (if teacher)
        await query(
            'DELETE FROM teacher_class_subjects WHERE teacher_id = $1',
            [id]
        );

        // Remove audit logs for this user (optional, comment if you want to keep logs)
        // await query('DELETE FROM audit_logs WHERE user_id = $1', [id]);

        // Remove user
        await query(
            'DELETE FROM users WHERE id = $1',
            [id]
        );

        // Log action
        await query(
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

        res.json({
            message: 'User deactivated successfully'
        });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to delete user'
        });
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
        const templateRows = [
            {
                first_name: 'Иван',
                last_name: 'Иванов',
                role: 'student',
                email: 'ivan@example.com',
                phone: '+998901234567',
                username: '',
                class_name: '9A',
                academic_year: '2024-2025',
                roll_number: '1'
            }
        ];

        const sheet = XLSX.utils.json_to_sheet(templateRows, {
            header: ['first_name', 'last_name', 'role', 'email', 'phone', 'username', 'class_name', 'academic_year', 'roll_number']
        });
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, sheet, 'users');

        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

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
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        const results = {
            imported: 0,
            created: [],
            errors: []
        };

        for (let i = 0; i < rows.length; i++) {
            const rowNumber = i + 2; // header row + 1
            const mapped = mapImportRow(rows[i]);

            if (!mapped) {
                continue;
            }

            try {
                const validationError = validateImportRow(mapped);
                if (validationError) {
                    results.errors.push({ row: rowNumber, message: validationError });
                    continue;
                }

                const role = normalizeRole(mapped.role);
                if (!role) {
                    results.errors.push({ row: rowNumber, message: 'Invalid role' });
                    continue;
                }

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

                const userResult = await query(
                    `INSERT INTO users (
                        school_id, role, username, password_hash,
                        first_name, last_name, email, phone,
                        is_active
                    )
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
                     RETURNING id, username, role, first_name, last_name, email`,
                    [
                        schoolId,
                        role,
                        username,
                        passwordHash,
                        mapped.first_name.trim(),
                        mapped.last_name.trim(),
                        mapped.email || null,
                        mapped.phone || null
                    ]
                );

                const userId = userResult.rows[0].id;

                if (role === 'student' && mapped.class_name) {
                    const classResult = await findClassByName(
                        schoolId,
                        mapped.class_name,
                        mapped.academic_year
                    );

                    if (!classResult) {
                        results.errors.push({ row: rowNumber, message: `Class not found: ${mapped.class_name}` });
                    } else {
                        await query(
                            `INSERT INTO class_students (class_id, student_id, roll_number, is_active)
                             VALUES ($1, $2, $3, true)
                             ON CONFLICT (class_id, student_id) DO NOTHING`,
                            [classResult.id, userId, mapped.roll_number || null]
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
    } catch (error) {
        console.error('Import users error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to import users'
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

        const sheet = XLSX.utils.json_to_sheet(exportRows, {
            header: ['username', 'role', 'first_name', 'last_name', 'email', 'phone', 'class_name', 'academic_year', 'roll_number']
        });
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, sheet, 'users');

        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

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
            'SELECT id, username, first_name, last_name, email FROM users WHERE id = $1 AND school_id = $2',
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
             ORDER BY cs.roll_number ASC`,
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

        // Validation
        if (!name || !grade_level || !academic_year) {
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
            [schoolId, name.trim(), academic_year.trim()]
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
            [schoolId, name.trim(), grade_level, academic_year.trim(), homeroom_teacher_id || null]
        );

        // Log action
        await query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [req.user.id, 'create', 'class', result.rows[0].id, { name: name.trim(), grade_level }]
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
        if (name) {
            const duplicateCheck = await query(
                'SELECT id FROM classes WHERE school_id = $1 AND name = $2 AND academic_year = $3 AND id != $4',
                [schoolId, name.trim(), academic_year, id]
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

        if (name !== undefined) {
            params.push(name.trim());
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
 * Delete class (soft delete)
 */
router.delete('/classes/:id', enforceSchoolIsolation, async (req, res) => {
    try {
        const { id } = req.params;
        const schoolId = req.user.school_id;

        // Check if class exists in same school
        const existingClass = await query(
            'SELECT id, name FROM classes WHERE id = $1 AND school_id = $2',
            [id, schoolId]
        );

        if (existingClass.rows.length === 0) {
            return res.status(404).json({
                error: 'not_found',
                message: 'Class not found'
            });
        }

        // Soft delete
        await query(
            'UPDATE classes SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
            [id]
        );

        // Log action
        await query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [req.user.id, 'delete', 'class', id, { name: existingClass.rows[0].name }]
        );

        res.json({
            message: 'Class deactivated successfully'
        });
    } catch (error) {
        console.error('Delete class error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to delete class'
        });
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

        // Log action
        await query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [req.user.id, 'create', 'subject', result.rows[0].id, { name: name.trim(), code: code.trim() }]
        );

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
 * Delete subject (soft delete)
 */
router.delete('/subjects/:id', enforceSchoolIsolation, async (req, res) => {
    try {
        const { id } = req.params;
        const schoolId = req.user.school_id;

        // Check if subject exists in same school
        const existingSubject = await query(
            'SELECT id, name FROM subjects WHERE id = $1 AND school_id = $2',
            [id, schoolId]
        );

        if (existingSubject.rows.length === 0) {
            return res.status(404).json({
                error: 'not_found',
                message: 'Subject not found'
            });
        }

        // Soft delete
        await query(
            'UPDATE subjects SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
            [id]
        );

        // Log action
        await query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [req.user.id, 'delete', 'subject', id, { name: existingSubject.rows[0].name }]
        );

        res.json({
            message: 'Subject deactivated successfully'
        });
    } catch (error) {
        console.error('Delete subject error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to delete subject'
        });
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
        const normalized = normalizeHeader(key);
        const field = IMPORT_HEADER_MAP[normalized];
        if (field) {
            mapped[field] = typeof value === 'string' ? value.trim() : value;
        }
    });

    const hasValues = Object.values(mapped).some(val => String(val || '').trim() !== '');
    return hasValues ? mapped : null;
}

function validateImportRow(row) {
    if (!row.first_name || !row.last_name || !row.role) {
        return 'Missing required fields (first_name, last_name, role)';
    }
    return null;
}

function normalizeHeader(header) {
    return String(header)
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, '');
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

function normalizeUsername(firstName, lastName) {
    const base = `${firstName || ''}.${lastName || ''}`
        .toLowerCase()
        .replace(/[^a-z0-9.]/g, '')
        .replace(/\.+/g, '.')
        .replace(/^\.|\.$/g, '');

    if (base) return base;
    return `user${Math.floor(Math.random() * 9000) + 1000}`;
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

async function findClassByName(schoolId, className, academicYear) {
    if (!className) return null;

    if (academicYear) {
        const result = await query(
            `SELECT id FROM classes
             WHERE school_id = $1 AND LOWER(name) = LOWER($2) AND academic_year = $3
             LIMIT 1`,
            [schoolId, className.trim(), academicYear.trim()]
        );
        return result.rows[0] || null;
    }

    const result = await query(
        `SELECT id FROM classes
         WHERE school_id = $1 AND LOWER(name) = LOWER($2)
         ORDER BY academic_year DESC
         LIMIT 1`,
        [schoolId, className.trim()]
    );
    return result.rows[0] || null;
}

const IMPORT_HEADER_MAP = {
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
    роль: 'role',
    телефон: 'phone',
    логин: 'username',
    класс: 'class_name',
    учебныйгод: 'academic_year',
    номер: 'roll_number',
    номерпоклассу: 'roll_number'
};

module.exports = router;
