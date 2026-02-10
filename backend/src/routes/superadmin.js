const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

// All routes require superadmin role
router.use(authenticate);
router.use(authorize('superadmin'));

/**
 * GET /api/superadmin/schools
 * Get all schools
 */
router.get('/schools', async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', status = 'all' } = req.query;
        const offset = (page - 1) * limit;

        // Build WHERE clause
        let whereClause = 'WHERE 1=1';
        const params = [];

        if (search) {
            params.push(`%${search}%`);
            whereClause += ` AND name ILIKE $${params.length}`;
        }

        if (status !== 'all') {
            params.push(status === 'active');
            whereClause += ` AND is_active = $${params.length}`;
        }

        // Get total count
        const countResult = await query(
            `SELECT COUNT(*) FROM schools ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0].count);

        // Get schools
        params.push(limit, offset);
        const result = await query(
            `SELECT
                id, name, address, phone, email,
                is_active, created_at, updated_at,
                (SELECT COUNT(*) FROM users WHERE school_id = schools.id) as user_count,
                (SELECT COUNT(*) FROM classes WHERE school_id = schools.id) as class_count
             FROM schools
             ${whereClause}
             ORDER BY created_at DESC
             LIMIT $${params.length - 1} OFFSET $${params.length}`,
            params
        );

        res.json({
            schools: result.rows,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Get schools error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch schools'
        });
    }
});

/**
 * GET /api/superadmin/schools/:id
 * Get single school by ID
 */
router.get('/schools/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const result = await query(
            `SELECT
                id, name, address, phone, email, settings,
                is_active, created_at, updated_at,
                (SELECT COUNT(*) FROM users WHERE school_id = schools.id) as user_count,
                (SELECT COUNT(*) FROM classes WHERE school_id = schools.id) as class_count,
                (SELECT COUNT(*) FROM subjects WHERE school_id = schools.id) as subject_count
             FROM schools
             WHERE id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'not_found',
                message: 'School not found'
            });
        }

        res.json({ school: result.rows[0] });
    } catch (error) {
        console.error('Get school error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch school'
        });
    }
});

/**
 * POST /api/superadmin/schools
 * Create new school
 */
router.post('/schools', async (req, res) => {
    try {
        const { name, address, phone, email, settings } = req.body;

        // Validation
        if (!name || name.trim().length === 0) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'School name is required'
            });
        }

        // Check if school with same name exists
        const existingSchool = await query(
            'SELECT id FROM schools WHERE name = $1',
            [name.trim()]
        );

        if (existingSchool.rows.length > 0) {
            return res.status(400).json({
                error: 'duplicate_error',
                message: 'School with this name already exists'
            });
        }

        // Create school
        const result = await query(
            `INSERT INTO schools (name, address, phone, email, settings, is_active)
             VALUES ($1, $2, $3, $4, $5, true)
             RETURNING id, name, address, phone, email, settings, is_active, created_at`,
            [
                name.trim(),
                address || null,
                phone || null,
                email || null,
                settings || {}
            ]
        );

        // Log action
        await query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [
                req.user.id,
                'create',
                'school',
                result.rows[0].id,
                { name: name.trim() }
            ]
        );

        res.status(201).json({
            message: 'School created successfully',
            school: result.rows[0]
        });
    } catch (error) {
        console.error('Create school error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to create school'
        });
    }
});

/**
 * PUT /api/superadmin/schools/:id
 * Update school
 */
router.put('/schools/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, address, phone, email, settings, is_active } = req.body;

        // Check if school exists
        const existingSchool = await query(
            'SELECT id FROM schools WHERE id = $1',
            [id]
        );

        if (existingSchool.rows.length === 0) {
            return res.status(404).json({
                error: 'not_found',
                message: 'School not found'
            });
        }

        // Validation
        if (name && name.trim().length === 0) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'School name cannot be empty'
            });
        }

        // Check duplicate name
        if (name) {
            const duplicateCheck = await query(
                'SELECT id FROM schools WHERE name = $1 AND id != $2',
                [name.trim(), id]
            );

            if (duplicateCheck.rows.length > 0) {
                return res.status(400).json({
                    error: 'duplicate_error',
                    message: 'School with this name already exists'
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
        if (address !== undefined) {
            params.push(address);
            updates.push(`address = $${paramCount++}`);
        }
        if (phone !== undefined) {
            params.push(phone);
            updates.push(`phone = $${paramCount++}`);
        }
        if (email !== undefined) {
            params.push(email);
            updates.push(`email = $${paramCount++}`);
        }
        if (settings !== undefined) {
            params.push(settings);
            updates.push(`settings = $${paramCount++}`);
        }
        if (is_active !== undefined) {
            params.push(is_active);
            updates.push(`is_active = $${paramCount++}`);
        }

        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        params.push(id);

        // Update school
        const result = await query(
            `UPDATE schools
             SET ${updates.join(', ')}
             WHERE id = $${paramCount}
             RETURNING id, name, address, phone, email, settings, is_active, updated_at`,
            params
        );

        // Log action
        await query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [req.user.id, 'update', 'school', id, req.body]
        );

        res.json({
            message: 'School updated successfully',
            school: result.rows[0]
        });
    } catch (error) {
        console.error('Update school error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to update school'
        });
    }
});

/**
 * DELETE /api/superadmin/schools/:id
 * Delete school (soft delete by setting is_active = false)
 */
router.delete('/schools/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { permanent = false } = req.query;

        // Check if school exists
        const existingSchool = await query(
            'SELECT id, name FROM schools WHERE id = $1',
            [id]
        );

        if (existingSchool.rows.length === 0) {
            return res.status(404).json({
                error: 'not_found',
                message: 'School not found'
            });
        }

        if (permanent === 'true') {
            // Permanent delete (CASCADE will delete related data)
            await query('DELETE FROM schools WHERE id = $1', [id]);

            // Log action
            await query(
                `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                    req.user.id,
                    'delete',
                    'school',
                    id,
                    { name: existingSchool.rows[0].name, permanent: true }
                ]
            );

            res.json({
                message: 'School permanently deleted'
            });
        } else {
            // Soft delete
            await query(
                'UPDATE schools SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
                [id]
            );

            // Log action
            await query(
                `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                    req.user.id,
                    'delete',
                    'school',
                    id,
                    { name: existingSchool.rows[0].name, soft: true }
                ]
            );

            res.json({
                message: 'School deactivated successfully'
            });
        }
    } catch (error) {
        console.error('Delete school error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to delete school'
        });
    }
});

/**
 * GET /api/superadmin/schools/:schoolId/admins
 * Get school administrators for a specific school
 */
router.get('/schools/:schoolId/admins', async (req, res) => {
    try {
        const { schoolId } = req.params;

        // Check if school exists
        const schoolCheck = await query(
            'SELECT id, name FROM schools WHERE id = $1',
            [schoolId]
        );

        if (schoolCheck.rows.length === 0) {
            return res.status(404).json({
                error: 'not_found',
                message: 'School not found'
            });
        }

        // Get school admins
        const result = await query(
            `SELECT
                id, username, first_name, last_name, email, phone,
                telegram_id, is_active, last_login, created_at
             FROM users
             WHERE school_id = $1 AND role = 'school_admin'
             ORDER BY created_at DESC`,
            [schoolId]
        );

        res.json({
            school: schoolCheck.rows[0],
            admins: result.rows
        });
    } catch (error) {
        console.error('Get school admins error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch school administrators'
        });
    }
});

/**
 * POST /api/superadmin/schools/:schoolId/admins
 * Create school administrator for a specific school
 */
router.post('/schools/:schoolId/admins', async (req, res) => {
    try {
        const { schoolId } = req.params;
        const { username, first_name, last_name, email, phone, telegram_id, password } = req.body;

        // Check if school exists
        const schoolCheck = await query(
            'SELECT id, name FROM schools WHERE id = $1',
            [schoolId]
        );

        if (schoolCheck.rows.length === 0) {
            return res.status(404).json({
                error: 'not_found',
                message: 'School not found'
            });
        }

        // Validation
        if (!username || !first_name || !last_name) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Username, first name, and last name are required'
            });
        }

        // Check if username already exists
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

        // Generate OTP password if not provided
        const bcrypt = require('bcrypt');
        let finalPassword = password;
        let otpPassword = null;

        if (!finalPassword) {
            // Generate 8-character OTP (A-Z0-9)
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            otpPassword = Array.from({ length: 8 }, () =>
                chars.charAt(Math.floor(Math.random() * chars.length))
            ).join('');
            finalPassword = otpPassword;
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(finalPassword, 10);

        // Create school admin
        const result = await query(
            `INSERT INTO users (
                school_id, username, password_hash, first_name, last_name,
                email, phone, telegram_id, role, is_active
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'school_admin', true)
             RETURNING id, username, first_name, last_name, email, phone, telegram_id, created_at`,
            [
                schoolId,
                username.trim(),
                hashedPassword,
                first_name.trim(),
                last_name.trim(),
                email?.trim() || null,
                phone?.trim() || null,
                telegram_id?.trim() || null
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
                {
                    username: username.trim(),
                    role: 'school_admin',
                    school_id: schoolId,
                    school_name: schoolCheck.rows[0].name
                }
            ]
        );

        const response = {
            message: 'School administrator created successfully',
            admin: result.rows[0]
        };

        // Include OTP password in response if generated
        if (otpPassword) {
            response.otp_password = otpPassword;
        }

        res.status(201).json(response);
    } catch (error) {
        console.error('Create school admin error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to create school administrator'
        });
    }
});

/**
 * DELETE /api/superadmin/schools/:schoolId/admins/:id
 * Delete (deactivate) a school administrator
 */
router.delete('/schools/:schoolId/admins/:id', async (req, res) => {
    try {
        const { schoolId, id } = req.params;

        // Check if admin exists in the school
        const existingAdmin = await query(
            'SELECT id, username FROM users WHERE id = $1 AND school_id = $2 AND role = $3',
            [id, schoolId, 'school_admin']
        );

        if (existingAdmin.rows.length === 0) {
            return res.status(404).json({
                error: 'not_found',
                message: 'School administrator not found'
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
                { username: existingAdmin.rows[0].username, role: 'school_admin' }
            ]
        );

        res.json({
            message: 'School administrator deactivated successfully'
        });
    } catch (error) {
        console.error('Delete school admin error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to delete school administrator'
        });
    }
});

/**
 * POST /api/superadmin/schools/:schoolId/admins/:id/reset-password
 * Reset password for a school administrator
 */
router.post('/schools/:schoolId/admins/:id/reset-password', async (req, res) => {
    try {
        const { schoolId, id } = req.params;

        // Check if admin exists in the school
        const existingAdmin = await query(
            'SELECT id, username, first_name, last_name, email FROM users WHERE id = $1 AND school_id = $2 AND role = $3',
            [id, schoolId, 'school_admin']
        );

        if (existingAdmin.rows.length === 0) {
            return res.status(404).json({
                error: 'not_found',
                message: 'School administrator not found'
            });
        }

        const admin = existingAdmin.rows[0];

        // Generate 8-character OTP (excluding similar looking characters)
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
        let otp = '';
        for (let i = 0; i < 8; i++) {
            otp += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        // Hash the OTP
        const bcrypt = require('bcrypt');
        const hashedPassword = await bcrypt.hash(otp, 10);

        // Update admin password and set must_change_password flag
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
                    username: admin.username,
                    role: 'school_admin',
                    reset_by: req.user.username
                }
            ]
        );

        res.json({
            message: 'Password reset successfully',
            tempPassword: otp,
            admin: {
                id: admin.id,
                username: admin.username,
                name: `${admin.first_name} ${admin.last_name}`
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
 * GET /api/superadmin/dashboard/stats
 * Get dashboard statistics for superadmin
 */
router.get('/dashboard/stats', async (req, res) => {
    try {
        const stats = {};

        // Total schools
        const schoolsResult = await query(
            'SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as active FROM schools'
        );
        stats.schools = {
            total: parseInt(schoolsResult.rows[0].total),
            active: parseInt(schoolsResult.rows[0].active)
        };

        // Total users by role
        const usersResult = await query(
            `SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE role = 'school_admin') as school_admins,
                COUNT(*) FILTER (WHERE role = 'teacher') as teachers,
                COUNT(*) FILTER (WHERE role = 'student') as students
             FROM users
             WHERE role != 'superadmin'`
        );
        stats.users = {
            total: parseInt(usersResult.rows[0].total),
            school_admins: parseInt(usersResult.rows[0].school_admins),
            teachers: parseInt(usersResult.rows[0].teachers),
            students: parseInt(usersResult.rows[0].students)
        };

        // Total tests
        const testsResult = await query('SELECT COUNT(*) as total FROM tests');
        stats.tests = {
            total: parseInt(testsResult.rows[0].total)
        };

        // Total test attempts
        const attemptsResult = await query(
            'SELECT COUNT(*) as total FROM test_attempts WHERE is_completed = true'
        );
        stats.attempts = {
            total: parseInt(attemptsResult.rows[0].total)
        };

        res.json({ stats });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch statistics'
        });
    }
});

module.exports = router;
