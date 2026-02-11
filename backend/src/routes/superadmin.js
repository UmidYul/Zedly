const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { notifyNewUser, notifyPasswordReset } = require('../utils/notifications');

// All routes require superadmin role
router.use(authenticate);
router.use(authorize('superadmin'));

const COLUMN_CACHE = {};

async function getTableColumns(tableName) {
    if (COLUMN_CACHE[tableName]) {
        return COLUMN_CACHE[tableName];
    }

    const result = await query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
    `, [tableName]);
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

async function getCareerInterestSchema() {
    const result = await query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'career_interests'
    `);
    const columns = new Set(result.rows.map((row) => row.column_name));

    return {
        columns,
        nameRu: columns.has('name_ru') ? 'ci.name_ru' : 'ci.name',
        nameUz: columns.has('name_uz') ? 'ci.name_uz' : 'ci.name',
        descriptionRu: columns.has('description_ru')
            ? 'ci.description_ru'
            : (columns.has('description') ? 'ci.description' : 'NULL'),
        descriptionUz: columns.has('description_uz')
            ? 'ci.description_uz'
            : (columns.has('description') ? 'ci.description' : 'NULL'),
        icon: columns.has('icon') ? 'ci.icon' : 'NULL',
        color: columns.has('color') ? 'ci.color' : "'#4A90E2'",
        subjects: columns.has('subjects') ? 'ci.subjects' : 'NULL'
    };
}

async function getSchoolNameExpr() {
    const result = await query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'schools'
    `);
    const columns = new Set(result.rows.map(row => row.column_name));
    if (columns.has('name')) {
        return 's.name';
    }
    if (columns.has('name_ru')) {
        return 's.name_ru';
    }
    if (columns.has('name_uz')) {
        return 's.name_uz';
    }
    return 's.id::text';
}

function buildCareerInterestPayload(body, columns) {
    const nameRu = body.name_ru || body.name_uz || body.name || '';
    const nameUz = body.name_uz || body.name_ru || body.name || '';
    const descriptionRu = body.description_ru || body.description_uz || body.description || null;
    const descriptionUz = body.description_uz || body.description_ru || body.description || null;
    const icon = body.icon || null;
    const color = body.color || null;
    const subjects = Array.isArray(body.subjects) ? body.subjects : null;

    if (!nameRu && !nameUz) {
        return { error: 'Название интереса обязательно' };
    }

    const updates = [];
    const columnsList = [];
    const params = [];
    let index = 1;

    if (columns.has('name_ru')) {
        params.push(nameRu);
        updates.push(`name_ru = $${index++}`);
        columnsList.push('name_ru');
    }

    if (columns.has('name_uz')) {
        params.push(nameUz);
        updates.push(`name_uz = $${index++}`);
        columnsList.push('name_uz');
    }

    if (columns.has('name')) {
        params.push(nameRu || nameUz);
        updates.push(`name = $${index++}`);
        columnsList.push('name');
    }

    if (columns.has('description_ru')) {
        params.push(descriptionRu);
        updates.push(`description_ru = $${index++}`);
        columnsList.push('description_ru');
    }

    if (columns.has('description_uz')) {
        params.push(descriptionUz);
        updates.push(`description_uz = $${index++}`);
        columnsList.push('description_uz');
    }

    if (columns.has('description')) {
        params.push(descriptionRu || descriptionUz);
        updates.push(`description = $${index++}`);
        columnsList.push('description');
    }

    if (columns.has('icon')) {
        params.push(icon);
        updates.push(`icon = $${index++}`);
        columnsList.push('icon');
    }

    if (columns.has('color')) {
        params.push(color);
        updates.push(`color = $${index++}`);
        columnsList.push('color');
    }

    if (columns.has('subjects')) {
        params.push(subjects);
        updates.push(`subjects = $${index++}`);
        columnsList.push('subjects');
    }

    return { updates, params, columnsList };
}

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
 * GET /api/superadmin/admins
 * Get all school administrators across all schools
 */
router.get('/admins', async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', school_id = 'all' } = req.query;
        const offset = (page - 1) * limit;

        // Build WHERE clause
        let whereClause = "WHERE u.role = 'school_admin'";
        const params = [];
        let paramCount = 1;

        if (search) {
            params.push(`%${search}%`);
            whereClause += ` AND (u.username ILIKE $${paramCount} OR u.first_name ILIKE $${paramCount} OR u.last_name ILIKE $${paramCount} OR u.email ILIKE $${paramCount})`;
            paramCount++;
        }

        if (school_id !== 'all') {
            params.push(school_id);
            whereClause += ` AND u.school_id = $${paramCount}`;
            paramCount++;
        }

        // Get total count
        const countResult = await query(
            `SELECT COUNT(*) FROM users u ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0].count);

        // Get admins with school info
        params.push(limit, offset);
        const result = await query(
            `SELECT
                u.id, u.username, u.first_name, u.last_name, u.email, u.phone,
                u.telegram_id, u.is_active, u.last_login, u.created_at,
                u.school_id, s.name as school_name
             FROM users u
             LEFT JOIN schools s ON u.school_id = s.id
             ${whereClause}
             ORDER BY u.created_at DESC
             LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
            params
        );

        res.json({
            admins: result.rows,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Get all admins error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch school administrators'
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

        // Send notification to new admin
        const newAdmin = result.rows[0];
        if (newAdmin.email || newAdmin.telegram_id) {
            try {
                await notifyNewUser(newAdmin, finalPassword, req.query.lang || 'ru');
            } catch (notifyError) {
                console.error('Notification error:', notifyError);
            }
        }

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

        // Send notification about password reset
        if (admin.email || admin.telegram_id) {
            try {
                await notifyPasswordReset({ ...admin, telegram_id: admin.telegram_id }, otp, req.query.lang || 'ru');
            } catch (notifyError) {
                console.error('Notification error:', notifyError);
            }
        }

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
/**
 * GET /api/superadmin/career/interests
 * Get career interests
 */
router.get('/career/interests', async (req, res) => {
    try {
        const { search = '' } = req.query;
        const schema = await getCareerInterestSchema();

        let whereClause = 'WHERE 1=1';
        const params = [];

        if (search) {
            params.push(`%${search}%`);
            whereClause += ` AND (${schema.nameRu} ILIKE $1 OR ${schema.nameUz} ILIKE $1)`;
        }

        const result = await query(`
            SELECT
                ci.id,
                ${schema.nameRu} as name_ru,
                ${schema.nameUz} as name_uz,
                COALESCE(${schema.descriptionRu}, '') as description_ru,
                COALESCE(${schema.descriptionUz}, '') as description_uz,
                ${schema.icon} as icon,
                COALESCE(${schema.color}, '#4A90E2') as color,
                ${schema.subjects} as subjects
            FROM career_interests ci
            ${whereClause}
            ORDER BY ci.id
        `, params);

        res.json({ interests: result.rows });
    } catch (error) {
        console.error('Get career interests error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch career interests'
        });
    }
});

/**
 * POST /api/superadmin/career/interests
 * Create career interest
 */
router.post('/career/interests', async (req, res) => {
    try {
        const schema = await getCareerInterestSchema();
        const payload = buildCareerInterestPayload(req.body, schema.columns);

        if (payload.error) {
            return res.status(400).json({
                error: 'validation_error',
                message: payload.error
            });
        }

        const columns = payload.columnsList;
        if (!columns.length) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'No valid fields provided'
            });
        }

        const placeholders = columns.map((_, index) => `$${index + 1}`);
        const insertResult = await query(
            `INSERT INTO career_interests (${columns.join(', ')})
             VALUES (${placeholders.join(', ')})
             RETURNING id`,
            payload.params
        );

        await query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [req.user.id, 'create', 'career_interest', insertResult.rows[0].id, { name: req.body.name_ru || req.body.name_uz }]
        );

        res.status(201).json({ message: 'Career interest created' });
    } catch (error) {
        console.error('Create career interest error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to create career interest'
        });
    }
});

/**
 * PUT /api/superadmin/career/interests/:id
 * Update career interest
 */
router.put('/career/interests/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const schema = await getCareerInterestSchema();
        const payload = buildCareerInterestPayload(req.body, schema.columns);

        if (payload.error) {
            return res.status(400).json({
                error: 'validation_error',
                message: payload.error
            });
        }

        if (!payload.updates.length) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'No fields to update'
            });
        }

        payload.params.push(id);
        await query(
            `UPDATE career_interests
             SET ${payload.updates.join(', ')}
             WHERE id = $${payload.params.length}`,
            payload.params
        );

        await query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [req.user.id, 'update', 'career_interest', id, { name: req.body.name_ru || req.body.name_uz }]
        );

        res.json({ message: 'Career interest updated' });
    } catch (error) {
        console.error('Update career interest error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to update career interest'
        });
    }
});

/**
 * DELETE /api/superadmin/career/interests/:id
 * Delete career interest
 */
router.delete('/career/interests/:id', async (req, res) => {
    try {
        const { id } = req.params;

        await query('DELETE FROM career_interests WHERE id = $1', [id]);

        await query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [req.user.id, 'delete', 'career_interest', id, {}]
        );

        res.json({ message: 'Career interest deleted' });
    } catch (error) {
        console.error('Delete career interest error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to delete career interest'
        });
    }
});

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

// SuperAdmin Dashboard Overview
router.get('/dashboard/overview', async (req, res) => {
    try {
        // Count schools
        const schoolsResult = await query('SELECT COUNT(*) as count FROM schools');
        const schoolCount = parseInt(schoolsResult.rows[0]?.count || 0);

        // Count users by role
        const usersResult = await query(`
            SELECT role, COUNT(*) as count
            FROM users
            GROUP BY role
        `);
        const userCounts = {};
        usersResult.rows.forEach(row => {
            userCounts[row.role] = parseInt(row.count);
        });

        // Count total tests
        const testsResult = await query('SELECT COUNT(*) as count FROM tests');
        const testCount = parseInt(testsResult.rows[0]?.count || 0);

        // Get average score across all attempts
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
                WHERE ${completedFilter}
            `);
        }
        const avgScore = avgScoreResult.rows[0]?.avg || 0;

        // Count career tests completed
        const careerResult = await query(`
            SELECT COUNT(DISTINCT student_id) as count
            FROM student_career_results
        `);
        const careerTestsCompleted = parseInt(careerResult.rows[0]?.count || 0);

        const testColumns = await getTableColumns('tests');
        const testTitleColumn = pickColumn(testColumns, ['title', 'title_ru', 'title_uz'], 'title');
        const testTeacherColumn = pickColumn(testColumns, ['teacher_id', 'created_by', 'creator_id'], null);

        // Get top schools by average test score
        const schoolNameExpr = await getSchoolNameExpr();
        const topSchoolsResult = await query(`
            SELECT 
                s.id,
                ${schoolNameExpr} as school_name,
                COUNT(DISTINCT tatt.id) as attempts,
                ${scoreExpr !== 'NULL' ? `AVG(${scoreExpr})::int` : '0'}::int as avg_score
            FROM test_attempts tatt
            INNER JOIN test_assignments ta ON ta.id = tatt.assignment_id
            INNER JOIN tests t ON t.id = ta.test_id
            INNER JOIN schools s ON s.id = t.school_id
            ${completedFilter !== 'false' ? `WHERE ${completedFilter}` : ''}
            GROUP BY s.id, ${schoolNameExpr}
            ORDER BY avg_score DESC
            LIMIT 5
        `);
        const topSchools = topSchoolsResult.rows || [];

        const recentAttemptsResult = await query(`
            SELECT
                tatt.id,
                ${completedFilter !== 'false' ? 'tatt.submitted_at' : 'tatt.created_at'} as completed_at,
                t.${testTitleColumn} as test_title,
                CONCAT(u.first_name, ' ', u.last_name) as student_name,
                ${scoreExpr !== 'NULL' ? `${scoreExpr}::float` : 'NULL'} as percentage
            FROM test_attempts tatt
            JOIN tests t ON t.id = tatt.test_id
            JOIN users u ON u.id = tatt.student_id
            WHERE ${completedFilter}
            ORDER BY ${completedFilter !== 'false' ? 'tatt.submitted_at' : 'tatt.created_at'} DESC
            LIMIT 5
        `);

        const recentTestsResult = await query(`
            SELECT
                t.id,
                t.${testTitleColumn} as test_title,
                t.created_at,
                ${testTeacherColumn ? `CONCAT(u.first_name, ' ', u.last_name) as teacher_name` : "'' as teacher_name"}
            FROM tests t
            ${testTeacherColumn ? `LEFT JOIN users u ON u.id = t.${testTeacherColumn}` : ''}
            ORDER BY t.created_at DESC
            LIMIT 5
        `);

        const activity = [];
        recentAttemptsResult.rows.forEach(row => {
            activity.push({
                type: 'attempt',
                title: row.test_title,
                subtitle: row.student_name,
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
                schools: schoolCount,
                students: userCounts.student || 0,
                teachers: userCounts.teacher || 0,
                tests: testCount,
                avg_score: Math.round(avgScore),
                career_tests_completed: careerTestsCompleted
            },
            recent_activity: activity.slice(0, 8),
            top_schools: topSchools.map(row => ({
                school_name: row.school_name,
                attempts: parseInt(row.attempts),
                avg_score: row.avg_score || 0
            }))
        });
    } catch (error) {
        console.error('SuperAdmin dashboard overview error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch dashboard overview'
        });
    }
});

/**
 * GET /api/superadmin/comparison
 * Get school comparison data
 */
router.get('/comparison', async (req, res) => {
    try {
        const { metric = 'avg_score', period = 'month' } = req.query;

        // Calculate date range based on period
        let dateFilter = '';
        const now = new Date();
        let startDate;
        switch (period) {
            case 'week':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case 'month':
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
            case 'quarter':
                startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
                break;
            case 'year':
                startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
                break;
            default:
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }

        const schoolNameExpr = await getSchoolNameExpr();
        const testColumns = await getTableColumns('tests');
        const attemptColumns = await getTableColumns('test_attempts');

        // Determine score expression
        let scoreExpr = attemptColumns.has('percentage') ? 'ta.percentage'
            : attemptColumns.has('score') && attemptColumns.has('max_score')
                ? '(ta.score::float / NULLIF(ta.max_score, 0) * 100)'
                : 'NULL';

        // Determine completion filter
        let completedFilter = 'true';
        if (attemptColumns.has('status')) completedFilter = "ta.status = 'completed'";
        else if (attemptColumns.has('is_completed')) completedFilter = 'ta.is_completed = true';
        else if (attemptColumns.has('submitted_at')) completedFilter = 'ta.submitted_at IS NOT NULL';

        // Date column for filtering
        let dateColumn = attemptColumns.has('submitted_at') ? 'ta.submitted_at'
            : attemptColumns.has('completed_at') ? 'ta.completed_at'
                : 'ta.created_at';

        let schools = [];
        let summary = {};

        if (metric === 'avg_score') {
            // Average score comparison - only if we have score data
            if (scoreExpr !== 'NULL') {
                const result = await query(`
                    SELECT 
                        s.id,
                        ${schoolNameExpr} as name,
                        COUNT(DISTINCT ta.id) as total_attempts,
                        COUNT(DISTINCT CASE WHEN ${completedFilter} THEN ta.id END) as completed_attempts,
                        AVG(CASE WHEN ${completedFilter} THEN ${scoreExpr} END)::numeric(5,2) as avg_score
                    FROM schools s
                    LEFT JOIN tests t ON t.school_id = s.id
                    LEFT JOIN test_assignments tass ON tass.test_id = t.id
                    LEFT JOIN test_attempts ta ON ta.assignment_id = tass.id
                        AND ${dateColumn} >= $1
                    WHERE s.is_active = true
                    GROUP BY s.id, ${schoolNameExpr}
                    ORDER BY avg_score DESC NULLS LAST
                `, [startDate]);

                schools = result.rows.map(row => ({
                    id: row.id,
                    name: row.name,
                    value: parseFloat(row.avg_score) || 0,
                    attempts: parseInt(row.completed_attempts) || 0
                }));

                const totalScore = schools.reduce((sum, s) => sum + s.value, 0);
                summary = {
                    top_performer: schools[0]?.name || 'N/A',
                    average: schools.length > 0 ? (totalScore / schools.length).toFixed(2) : 0,
                    total_attempts: schools.reduce((sum, s) => sum + s.attempts, 0)
                };
            }
        } else if (metric === 'test_completion') {
            // Test completion rate
            const result = await query(`
                SELECT 
                    s.id,
                    ${schoolNameExpr} as name,
                    COUNT(DISTINCT ta.id) as total_attempts,
                    COUNT(DISTINCT CASE WHEN ${completedFilter} THEN ta.id END) as completed_attempts,
                    CASE 
                        WHEN COUNT(DISTINCT ta.id) > 0 
                        THEN (COUNT(DISTINCT CASE WHEN ${completedFilter} THEN ta.id END)::float / COUNT(DISTINCT ta.id) * 100)
                        ELSE 0 
                    END::numeric(5,2) as completion_rate
                FROM schools s
                LEFT JOIN tests t ON t.school_id = s.id
                LEFT JOIN test_assignments tass ON tass.test_id = t.id
                LEFT JOIN test_attempts ta ON ta.assignment_id = tass.id
                    AND ${dateColumn} >= $1
                WHERE s.is_active = true
                GROUP BY s.id, ${schoolNameExpr}
                ORDER BY completion_rate DESC
            `, [startDate]);

            schools = result.rows.map(row => ({
                id: row.id,
                name: row.name,
                value: parseFloat(row.completion_rate) || 0,
                total: parseInt(row.total_attempts) || 0,
                completed: parseInt(row.completed_attempts) || 0
            }));

            const totalRate = schools.reduce((sum, s) => sum + s.value, 0);
            summary = {
                top_performer: schools[0]?.name || 'N/A',
                average: schools.length > 0 ? (totalRate / schools.length).toFixed(2) : 0,
                total_tests: schools.reduce((sum, s) => sum + s.total, 0)
            };
        } else if (metric === 'student_count') {
            // Student count
            const result = await query(`
                SELECT 
                    s.id,
                    ${schoolNameExpr} as name,
                    COUNT(DISTINCT u.id) as student_count
                FROM schools s
                LEFT JOIN users u ON u.school_id = s.id AND u.role = 'student'
                WHERE s.is_active = true
                GROUP BY s.id, ${schoolNameExpr}
                ORDER BY student_count DESC
            `);

            schools = result.rows.map(row => ({
                id: row.id,
                name: row.name,
                value: parseInt(row.student_count) || 0
            }));

            summary = {
                top_performer: schools[0]?.name || 'N/A',
                total: schools.reduce((sum, s) => sum + s.value, 0),
                average: schools.length > 0 ? Math.round(schools.reduce((sum, s) => sum + s.value, 0) / schools.length) : 0
            };
        } else if (metric === 'teacher_count') {
            // Teacher count
            const result = await query(`
                SELECT 
                    s.id,
                    ${schoolNameExpr} as name,
                    COUNT(DISTINCT u.id) as teacher_count
                FROM schools s
                LEFT JOIN users u ON u.school_id = s.id AND u.role = 'teacher'
                WHERE s.is_active = true
                GROUP BY s.id, ${schoolNameExpr}
                ORDER BY teacher_count DESC
            `);

            schools = result.rows.map(row => ({
                id: row.id,
                name: row.name,
                value: parseInt(row.teacher_count) || 0
            }));

            summary = {
                top_performer: schools[0]?.name || 'N/A',
                total: schools.reduce((sum, s) => sum + s.value, 0),
                average: schools.length > 0 ? Math.round(schools.reduce((sum, s) => sum + s.value, 0) / schools.length) : 0
            };
        }

        res.json({
            metric,
            period,
            schools,
            summary
        });
    } catch (error) {
        console.error('School comparison error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch school comparison data'
        });
    }
});

module.exports = router;
