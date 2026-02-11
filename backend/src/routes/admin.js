const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const multer = require('multer');
const XLSX = require('xlsx');
const { query } = require('../config/database');
const { authenticate, authorize, enforceSchoolIsolation } = require('../middleware/auth');
const { notifyNewUser } = require('../utils/notifications');

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
                        await query(
                            `INSERT INTO teacher_class_subjects (teacher_id, class_id, subject_id)
                             VALUES ($1, $2, $3)
                             ON CONFLICT (teacher_id, class_id, subject_id) DO NOTHING`,
                            [userId, classId, subject_id]
                        );
                    }
                }
            }
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

        // Soft delete
        await query(
            'UPDATE users SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
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
                 is_otp = true,
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
                'reset_password',
                'user',
                id,
                {
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
            whereClause += ` AND (name ILIKE $${paramCount} OR code ILIKE $${paramCount})`;
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
            `SELECT id, name, code, color, description, is_active, created_at
             FROM subjects
             ${whereClause}
             ORDER BY name ASC
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

        // Create subject
        const result = await query(
            `INSERT INTO subjects (school_id, name, code, color, description, is_active)
             VALUES ($1, $2, $3, $4, $5, true)
             RETURNING id, name, code, color, description, is_active, created_at`,
            [
                schoolId,
                name.trim(),
                code.trim().toUpperCase(),
                color || '#4A90E2',
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

/**
 * POST /api/admin/users/import
 * Import users from Excel file
 * 
 * Excel format:
 * | role | first_name | last_name | email | phone | telegram_id | class_name |
 * 
 * role: student, teacher, school_admin
 * class_name: только для студентов (необязательно)
 */
router.post('/users/import', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'No file uploaded'
            });
        }

        const schoolId = req.user.school_id;
        const workbook = XLSX.read(req.file.buffer);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);

        if (data.length === 0) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Excel file is empty'
            });
        }

        const results = {
            success: [],
            errors: [],
            total: data.length
        };

        // Process each row
        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            const rowNumber = i + 2; // Excel row number (1 = header)

            try {
                // Validate required fields
                if (!row.role || !row.first_name || !row.last_name) {
                    results.errors.push({
                        row: rowNumber,
                        error: 'Missing required fields (role, first_name, last_name)'
                    });
                    continue;
                }

                // Validate role
                const validRoles = ['student', 'teacher', 'school_admin'];
                if (!validRoles.includes(row.role)) {
                    results.errors.push({
                        row: rowNumber,
                        error: `Invalid role: ${row.role}`
                    });
                    continue;
                }

                // Generate username from first and last name
                const baseUsername = `${row.first_name.toLowerCase().trim()}${row.last_name.toLowerCase().trim()[0]}`;
                let username = baseUsername;
                let counter = 1;

                // Check if username exists and increment
                while (true) {
                    const existing = await query(
                        'SELECT id FROM users WHERE username = $1',
                        [username]
                    );

                    if (existing.rows.length === 0) break;
                    username = `${baseUsername}${counter++}`;
                }

                // Generate OTP password
                const password = generateOTP();
                const passwordHash = await bcrypt.hash(password, 10);

                // Insert user
                const userResult = await query(
                    `INSERT INTO users (
                        school_id, role, username, password_hash,
                        first_name, last_name, email, phone, telegram_id,
                        is_active, must_change_password
                    )
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, true)
                     RETURNING id, username, role, first_name, last_name, email`,
                    [
                        schoolId,
                        row.role,
                        username,
                        passwordHash,
                        row.first_name.trim(),
                        row.last_name.trim(),
                        row.email || null,
                        row.phone || null,
                        row.telegram_id || null
                    ]
                );

                const user = userResult.rows[0];
                const userId = user.id;

                // If student and class_name provided, add to class
                if (row.role === 'student' && row.class_name) {
                    const classResult = await query(
                        'SELECT id FROM classes WHERE school_id = $1 AND name = $2',
                        [schoolId, row.class_name.trim()]
                    );

                    if (classResult.rows.length > 0) {
                        await query(
                            `INSERT INTO class_students (class_id, student_id)
                             VALUES ($1, $2)
                             ON CONFLICT (class_id, student_id) DO NOTHING`,
                            [classResult.rows[0].id, userId]
                        );
                    }
                }

                // Send notification
                if (user.email || user.telegram_id) {
                    try {
                        await notifyNewUser(user, password, req.query.lang || 'ru');
                    } catch (notifyError) {
                        console.error('Notification error:', notifyError);
                    }
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
                        { username, role: row.role, source: 'excel_import' }
                    ]
                );

                results.success.push({
                    row: rowNumber,
                    username,
                    password,
                    name: `${row.first_name} ${row.last_name}`
                });

            } catch (error) {
                console.error(`Error processing row ${rowNumber}:`, error);
                results.errors.push({
                    row: rowNumber,
                    error: error.message
                });
            }
        }

        res.json({
            message: 'Import completed',
            results: {
                total: results.total,
                success: results.success.length,
                errors: results.errors.length,
                details: results
            }
        });

    } catch (error) {
        console.error('Import error:', error);
        res.status(500).json({
            error: 'server_error',
            message: error.message || 'Failed to import users'
        });
    }
});

/**
 * GET /api/admin/users/export
 * Export users to Excel
 */
router.get('/users/export', async (req, res) => {
    try {
        const schoolId = req.user.school_id;
        const { role = 'all' } = req.query;

        // Build WHERE clause
        let whereClause = 'WHERE school_id = $1';
        const params = [schoolId];

        if (role !== 'all') {
            params.push(role);
            whereClause += ` AND role = $2`;
        }

        // Get users
        const result = await query(
            `SELECT
                role, username, first_name, last_name, email, phone,
                telegram_id, is_active, created_at, last_login,
                (SELECT string_agg(c.name, ', ')
                 FROM class_students cs
                 JOIN classes c ON c.id = cs.class_id
                 WHERE cs.student_id = users.id) as classes
             FROM users
             ${whereClause}
             ORDER BY role, last_name, first_name`,
            params
        );

        // Create workbook
        const worksheet = XLSX.utils.json_to_sheet(result.rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Users');

        // Generate buffer
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        // Set headers
        res.setHeader('Content-Disposition', `attachment; filename=users_export_${Date.now()}.xlsx`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        res.send(buffer);

    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to export users'
        });
    }
});

/**
 * GET /api/admin/users/template
 * Download Excel template for import
 */
router.get('/users/template', (req, res) => {
    try {
        // Create template data
        const templateData = [
            {
                role: 'student',
                first_name: 'Иван',
                last_name: 'Иванов',
                email: 'ivan@example.com',
                phone: '+998901234567',
                telegram_id: '@ivanov',
                class_name: '9A'
            },
            {
                role: 'teacher',
                first_name: 'Мария',
                last_name: 'Петрова',
                email: 'maria@example.com',
                phone: '+998901234568',
                telegram_id: '@petrova',
                class_name: ''
            }
        ];

        // Create workbook
        const worksheet = XLSX.utils.json_to_sheet(templateData);

        // Set column widths
        worksheet['!cols'] = [
            { wch: 15 },  // role
            { wch: 20 },  // first_name
            { wch: 20 },  // last_name
            { wch: 30 },  // email
            { wch: 20 },  // phone
            { wch: 20 },  // telegram_id
            { wch: 15 }   // class_name
        ];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');

        // Add instructions sheet
        const instructions = [
            { field: 'role', required: 'Yes', description: 'student, teacher, или school_admin' },
            { field: 'first_name', required: 'Yes', description: 'Имя пользователя' },
            { field: 'last_name', required: 'Yes', description: 'Фамилия пользователя' },
            { field: 'email', required: 'No', description: 'Email для уведомлений' },
            { field: 'phone', required: 'No', description: 'Номер телефона' },
            { field: 'telegram_id', required: 'No', description: 'Telegram ID (@username или chat_id)' },
            { field: 'class_name', required: 'No', description: 'Название класса (только для студентов)' }
        ];
        const instructionsSheet = XLSX.utils.json_to_sheet(instructions);
        XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'Instructions');

        // Generate buffer
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        // Set headers
        res.setHeader('Content-Disposition', 'attachment; filename=users_import_template.xlsx');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        res.send(buffer);

    } catch (error) {
        console.error('Template error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to generate template'
        });
    }
});

// School Admin Dashboard Overview
router.get('/dashboard/overview', async (req, res) => {
    try {
        const schoolId = req.user.school_id;

        // Count users by role in school
        const usersResult = await query(`
            SELECT role, COUNT(*) as count
            FROM users
            WHERE school_id = $1
            GROUP BY role
        `, [schoolId]);

        const userCounts = {};
        usersResult.rows.forEach(row => {
            userCounts[row.role] = parseInt(row.count);
        });

        // Count classes
        const classesResult = await query(`
            SELECT COUNT(*) as count
            FROM class
            WHERE school_id = $1
        `, [schoolId]);
        const classCount = parseInt(classesResult.rows[0]?.count || 0);

        // Count students
        const studentsResult = await query(`
            SELECT COUNT(DISTINCT u.id) as count
            FROM users u
            WHERE u.school_id = $1 AND u.role = 'student'
        `, [schoolId]);
        const studentCount = parseInt(studentsResult.rows[0]?.count || 0);

        // Count tests
        const testsResult = await query(`
            SELECT COUNT(DISTINCT t.id) as count
            FROM test t
            INNER JOIN users u ON u.id = t.created_by
            WHERE u.school_id = $1
        `, [schoolId]);
        const testCount = parseInt(testsResult.rows[0]?.count || 0);

        // Get average score across all test attempts
        const columnsResult = await query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'test_attempts'
        `);
        const columns = new Set(columnsResult.rows.map(row => row.column_name));

        let scoreExpr = columns.has('percentage') ? 'tatt.percentage'
            : columns.has('score') && columns.has('max_score') ? '(tatt.score::float / NULLIF(tatt.max_score, 0) * 100)'
                : 'NULL';

        let completedFilter = 'false';
        if (columns.has('status')) completedFilter = "tatt.status = 'completed'";
        else if (columns.has('is_completed')) completedFilter = 'tatt.is_completed = true';
        else if (columns.has('submitted_at')) completedFilter = 'tatt.submitted_at IS NOT NULL';

        let avgScoreResult = { rows: [{ avg: null }] };
        if (scoreExpr !== 'NULL') {
            avgScoreResult = await query(`
                SELECT AVG(${scoreExpr})::int as avg
                FROM test_attempts tatt
                INNER JOIN test_assignments ta ON ta.id = tatt.assignment_id
                INNER JOIN test t ON t.id = ta.test_id
                INNER JOIN users u ON u.id = t.created_by
                WHERE u.school_id = $1 AND ${completedFilter}
            `, [schoolId]);
        }
        const avgScore = avgScoreResult.rows[0]?.avg || 0;

        // Count active assignments
        const activeAssignmentsResult = await query(`
            SELECT COUNT(DISTINCT ta.id) as count
            FROM test_assignments ta
            INNER JOIN test t ON t.id = ta.test_id
            INNER JOIN users u ON u.id = t.created_by
            WHERE u.school_id = $1 AND (ta.end_date IS NULL OR ta.end_date > NOW())
        `, [schoolId]);
        const activeAssignments = parseInt(activeAssignmentsResult.rows[0]?.count || 0);

        res.json({
            stats: {
                students: studentCount,
                teachers: userCounts.teacher || 0,
                classes: classCount,
                tests: testCount,
                active_assignments: activeAssignments,
                avg_score: Math.round(avgScore)
            }
        });
    } catch (error) {
        console.error('Admin dashboard overview error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch dashboard overview'
        });
    }
});

module.exports = router;
