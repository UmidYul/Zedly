const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { query } = require('../config/database');
const { authenticate, authorize, enforceSchoolIsolation } = require('../middleware/auth');

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

        // Log action
        await query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [
                req.user.id,
                'create',
                'user',
                result.rows[0].id,
                { username: username.trim(), role }
            ]
        );

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

// Generate OTP password
function generateOTP() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let otp = '';
    for (let i = 0; i < 8; i++) {
        otp += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return otp;
}

module.exports = router;
