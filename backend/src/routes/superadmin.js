const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const {
    notifyNewUser,
    notifyPasswordReset,
    notifySystemChange,
    getRoleNotificationDefaultsMap,
    invalidateNotificationDefaultsCache
} = require('../utils/notifications');
const { getTableColumns, pickColumn, getSchoolNameExpr } = require('../utils/db');
const {
    UNKNOWN_CODE,
    getLocationsReference,
    normalizeAndValidateSchoolProfile,
    enrichSchoolLocationNames,
    resolveDimensionName,
    normalizeGeoCode
} = require('../utils/school-profile');
const { getGlobalCareerStats } = require('./careerHandlers');

// All routes require superadmin role

/**
 * GET /api/superadmin/career/analytics
 * Global career analytics for SuperAdmin
 */
router.get('/career/analytics', authenticate, authorize('superadmin'), async (req, res) => {
    // Optionally, you can add more advanced analytics here later
    return getGlobalCareerStats(req, res);
});
router.use(authenticate);
router.use(authorize('superadmin'));

const NOTIFICATION_DEFAULT_ROLES = ['student', 'teacher', 'psychologist', 'school_admin', 'superadmin'];
const NOTIFICATION_CHANNEL_KEYS = ['in_app', 'email', 'telegram'];
const NOTIFICATION_EVENT_KEYS = [
    'new_test',
    'test_results',
    'assignment_deadline',
    'password_reset',
    'profile_updates',
    'system_updates',
    'welcome',
    'digest_summary'
];

function normalizeBooleanMap(input, allowedKeys, fallback = {}) {
    const next = {};
    for (const key of allowedKeys) {
        if (input && typeof input === 'object' && input[key] !== undefined) {
            next[key] = !!input[key];
        } else if (fallback[key] !== undefined) {
            next[key] = !!fallback[key];
        } else {
            next[key] = false;
        }
    }
    return next;
}

function parsePositiveInt(value, fallback, min = 1, max = 100) {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(parsed, min), max);
}

function parsePeriodToStartDate(period = 'month') {
    const normalized = String(period || 'month').trim().toLowerCase();
    const now = Date.now();
    const windowsMs = {
        week: 7 * 24 * 60 * 60 * 1000,
        month: 30 * 24 * 60 * 60 * 1000,
        quarter: 90 * 24 * 60 * 60 * 1000,
        year: 365 * 24 * 60 * 60 * 1000
    };
    const key = windowsMs[normalized] ? normalized : 'month';
    return {
        key,
        startDate: new Date(now - windowsMs[key])
    };
}

function parseGeoPeriodDays(value, fallback = 30) {
    const parsed = parseInt(value, 10);
    if (![7, 30, 90, 365].includes(parsed)) return fallback;
    return parsed;
}

function toNullableCode(value) {
    const normalized = normalizeGeoCode(value);
    return normalized || null;
}

async function buildSchoolSelectFragments({ includeSettings = false, alias = 'schools' } = {}) {
    const schoolColumns = await getTableColumns('schools');
    const fragments = [
        `${alias}.id`,
        `${alias}.name`,
        `${alias}.address`,
        `${alias}.phone`,
        `${alias}.email`
    ];

    if (includeSettings && schoolColumns.has('settings')) {
        fragments.push(`${alias}.settings`);
    }

    [
        'region_code',
        'city_code',
        'school_type',
        'ownership',
        'language_model',
        'study_shift',
        'capacity',
        'opened_year'
    ].forEach((columnName) => {
        if (schoolColumns.has(columnName)) {
            fragments.push(`${alias}.${columnName}`);
        }
    });

    fragments.push(`${alias}.is_active`, `${alias}.created_at`, `${alias}.updated_at`);
    return fragments;
}

async function getAttemptSqlMeta(alias = 'ta') {
    const attemptColumns = await getTableColumns('test_attempts');

    const scoreExpr = attemptColumns.has('percentage')
        ? `${alias}.percentage`
        : attemptColumns.has('score') && attemptColumns.has('max_score')
            ? `(${alias}.score::float / NULLIF(${alias}.max_score, 0) * 100)`
            : 'NULL';

    const completedFilter = attemptColumns.has('status')
        ? `${alias}.status = 'completed'`
        : attemptColumns.has('is_completed')
            ? `${alias}.is_completed = true`
            : attemptColumns.has('submitted_at')
                ? `${alias}.submitted_at IS NOT NULL`
                : 'true';

    const dateColumn = attemptColumns.has('submitted_at')
        ? `${alias}.submitted_at`
        : attemptColumns.has('completed_at')
            ? `${alias}.completed_at`
            : `${alias}.created_at`;

    return {
        scoreExpr,
        completedFilter,
        dateColumn,
        hasScore: scoreExpr !== 'NULL'
    };
}

function getDimensionSqlConfig(dimension, schoolNameExpr, schoolColumns = new Set()) {
    const normalized = String(dimension || 'school').trim().toLowerCase();
    const hasColumn = (columnName) => schoolColumns && typeof schoolColumns.has === 'function' && schoolColumns.has(columnName);
    const fallback = {
        dimension: 'school',
        keyExpr: 's.id::text',
        nameExpr: `${schoolNameExpr}`,
        codeField: 'school_id'
    };

    const configs = {
        school: fallback,
        region: {
            dimension: 'region',
            keyExpr: hasColumn('region_code')
                ? `COALESCE(NULLIF(s.region_code, ''), '${UNKNOWN_CODE}')`
                : `'${UNKNOWN_CODE}'`,
            nameExpr: hasColumn('region_code')
                ? `COALESCE(NULLIF(s.region_code, ''), '${UNKNOWN_CODE}')`
                : `'${UNKNOWN_CODE}'`,
            codeField: 'region_code'
        },
        city: {
            dimension: 'city',
            keyExpr: hasColumn('city_code')
                ? `COALESCE(NULLIF(s.city_code, ''), '${UNKNOWN_CODE}')`
                : `'${UNKNOWN_CODE}'`,
            nameExpr: hasColumn('city_code')
                ? `COALESCE(NULLIF(s.city_code, ''), '${UNKNOWN_CODE}')`
                : `'${UNKNOWN_CODE}'`,
            codeField: 'city_code'
        },
        school_type: {
            dimension: 'school_type',
            keyExpr: hasColumn('school_type')
                ? `COALESCE(NULLIF(s.school_type, ''), '${UNKNOWN_CODE}')`
                : `'${UNKNOWN_CODE}'`,
            nameExpr: hasColumn('school_type')
                ? `COALESCE(NULLIF(s.school_type, ''), '${UNKNOWN_CODE}')`
                : `'${UNKNOWN_CODE}'`,
            codeField: 'school_type'
        },
        ownership: {
            dimension: 'ownership',
            keyExpr: hasColumn('ownership')
                ? `COALESCE(NULLIF(s.ownership, ''), '${UNKNOWN_CODE}')`
                : `'${UNKNOWN_CODE}'`,
            nameExpr: hasColumn('ownership')
                ? `COALESCE(NULLIF(s.ownership, ''), '${UNKNOWN_CODE}')`
                : `'${UNKNOWN_CODE}'`,
            codeField: 'ownership'
        },
        language_model: {
            dimension: 'language_model',
            keyExpr: hasColumn('language_model')
                ? `COALESCE(NULLIF(s.language_model, ''), '${UNKNOWN_CODE}')`
                : `'${UNKNOWN_CODE}'`,
            nameExpr: hasColumn('language_model')
                ? `COALESCE(NULLIF(s.language_model, ''), '${UNKNOWN_CODE}')`
                : `'${UNKNOWN_CODE}'`,
            codeField: 'language_model'
        },
        study_shift: {
            dimension: 'study_shift',
            keyExpr: hasColumn('study_shift')
                ? `COALESCE(NULLIF(s.study_shift, ''), '${UNKNOWN_CODE}')`
                : `'${UNKNOWN_CODE}'`,
            nameExpr: hasColumn('study_shift')
                ? `COALESCE(NULLIF(s.study_shift, ''), '${UNKNOWN_CODE}')`
                : `'${UNKNOWN_CODE}'`,
            codeField: 'study_shift'
        }
    };

    return configs[normalized] || fallback;
}

function buildAuditFilters(queryInput = {}) {
    const where = [];
    const params = [];

    const search = String(queryInput.search || '').trim();
    const action = String(queryInput.action || '').trim();
    const entityType = String(queryInput.entity_type || '').trim();
    const actorRole = String(queryInput.actor_role || '').trim();
    const status = String(queryInput.status || '').trim().toLowerCase();
    const from = String(queryInput.from || '').trim();
    const to = String(queryInput.to || '').trim();
    const actorId = String(queryInput.actor_id || '').trim();

    if (search) {
        params.push(`%${search}%`);
        const p = `$${params.length}`;
        where.push(`(
            al.action::text ILIKE ${p}
            OR al.entity_type::text ILIKE ${p}
            OR COALESCE(al.entity_id::text, '') ILIKE ${p}
            OR COALESCE(u.username, '') ILIKE ${p}
            OR COALESCE(u.first_name, '') ILIKE ${p}
            OR COALESCE(u.last_name, '') ILIKE ${p}
            OR COALESCE(al.details::text, '') ILIKE ${p}
        )`);
    }
    if (action) {
        params.push(action);
        where.push(`al.action = $${params.length}`);
    }
    if (entityType) {
        params.push(entityType);
        where.push(`al.entity_type = $${params.length}`);
    }
    if (actorRole) {
        params.push(actorRole);
        where.push(`u.role = $${params.length}`);
    }
    if (actorId) {
        params.push(actorId);
        where.push(`al.user_id = $${params.length}::uuid`);
    }
    if (status === 'failed') {
        where.push(`(al.action::text ILIKE '%failed%' OR COALESCE(al.details::text, '') ILIKE '%error%')`);
    } else if (status === 'success') {
        where.push(`NOT (al.action::text ILIKE '%failed%' OR COALESCE(al.details::text, '') ILIKE '%error%')`);
    }
    if (from) {
        params.push(from);
        where.push(`al.created_at >= $${params.length}::timestamptz`);
    }
    if (to) {
        params.push(to);
        where.push(`al.created_at <= $${params.length}::timestamptz`);
    }

    return {
        whereClause: where.length ? `WHERE ${where.join(' AND ')}` : '',
        params
    };
}


/**
 * GET /api/superadmin/schools
 * Get all schools
 */
router.get('/schools', async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', status = 'all' } = req.query;
        const pageNumber = parsePositiveInt(page, 1, 1, 10000);
        const limitNumber = parsePositiveInt(limit, 10, 1, 200);
        const offset = (pageNumber - 1) * limitNumber;
        const selectFragments = await buildSchoolSelectFragments({ includeSettings: false, alias: 'schools' });

        // Build WHERE clause
        let whereClause = 'WHERE 1=1';
        const params = [];

        if (search) {
            params.push(`%${search}%`);
            whereClause += ` AND schools.name ILIKE $${params.length}`;
        }

        if (status !== 'all') {
            params.push(status === 'active');
            whereClause += ` AND schools.is_active = $${params.length}`;
        }

        // Get total count
        const countResult = await query(
            `SELECT COUNT(*) FROM schools ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0].count, 10);

        // Get schools
        params.push(limitNumber, offset);
        const result = await query(
            `SELECT
                ${selectFragments.join(',\n                ')},
                (SELECT COUNT(*) FROM users WHERE school_id = schools.id) as user_count,
                (SELECT COUNT(*) FROM classes WHERE school_id = schools.id) as class_count
             FROM schools
             ${whereClause}
             ORDER BY schools.created_at DESC
             LIMIT $${params.length - 1} OFFSET $${params.length}`,
            params
        );

        const schools = result.rows.map((row) => enrichSchoolLocationNames(row));
        res.json({
            schools,
            pagination: {
                total,
                page: pageNumber,
                limit: limitNumber,
                pages: Math.ceil(total / limitNumber)
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
        const selectFragments = await buildSchoolSelectFragments({ includeSettings: true, alias: 'schools' });

        const result = await query(
            `SELECT
                ${selectFragments.join(',\n                ')},
                (SELECT COUNT(*) FROM users WHERE school_id = schools.id) as user_count,
                (SELECT COUNT(*) FROM classes WHERE school_id = schools.id) as class_count,
                (SELECT COUNT(*) FROM subjects WHERE school_id = schools.id) as subject_count
             FROM schools
             WHERE schools.id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'not_found',
                message: 'School not found'
            });
        }

        res.json({ school: enrichSchoolLocationNames(result.rows[0]) });
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
        const schoolColumns = await getTableColumns('schools');
        if (!schoolColumns.has('region_code') || !schoolColumns.has('city_code')) {
            return res.status(400).json({
                error: 'migration_required',
                message: 'School geo columns are missing. Run migration: npm run db:migrate:school-geo'
            });
        }

        const validation = normalizeAndValidateSchoolProfile(req.body || {}, { mode: 'create' });
        if (validation.errors.length > 0) {
            return res.status(400).json({
                error: 'validation_error',
                message: validation.errors[0].message,
                details: validation.errors
            });
        }

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
        const insertColumns = ['name', 'address', 'phone', 'email', 'is_active'];
        const insertValues = [
            name.trim(),
            address || null,
            phone || null,
            email || null,
            true
        ];

        if (schoolColumns.has('settings')) {
            insertColumns.push('settings');
            insertValues.push(settings || {});
        }

        [
            'region_code',
            'city_code',
            'school_type',
            'ownership',
            'language_model',
            'study_shift',
            'capacity',
            'opened_year'
        ].forEach((field) => {
            if (schoolColumns.has(field)) {
                insertColumns.push(field);
                insertValues.push(validation.values[field] ?? null);
            }
        });

        const returningFragments = (await buildSchoolSelectFragments({ includeSettings: true, alias: 'schools' }))
            .map((fragment) => fragment.replace(/^schools\./, ''));
        const placeholders = insertValues.map((_, index) => `$${index + 1}`).join(', ');

        const result = await query(
            `INSERT INTO schools (${insertColumns.join(', ')})
             VALUES (${placeholders})
             RETURNING ${returningFragments.join(', ')}`,
            insertValues
        );
        const createdSchool = enrichSchoolLocationNames(result.rows[0]);

        // Log action
        await query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [
                req.user.id,
                'create',
                'school',
                createdSchool.id,
                {
                    name: name.trim(),
                    region_code: createdSchool.region_code,
                    city_code: createdSchool.city_code
                }
            ]
        );

        res.status(201).json({
            message: 'School created successfully',
            school: createdSchool
        });

        try {
            await notifySystemChange({
                actor: req.user.username,
                action: 'create',
                entityType: 'school',
                entityName: createdSchool.name,
                details: `id=${createdSchool.id}`
            });
        } catch (notifyError) {
            console.error('System telegram notification error:', notifyError);
        }
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
        const schoolColumns = await getTableColumns('schools');

        // Check if school exists
        const existingSchool = await query(
            `SELECT id
             FROM schools
             WHERE id = $1`,
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

        const hasSchoolProfileInput = [
            'region_code',
            'city_code',
            'school_type',
            'ownership',
            'language_model',
            'study_shift',
            'capacity',
            'opened_year'
        ].some((field) => Object.prototype.hasOwnProperty.call(req.body, field));

        if (hasSchoolProfileInput && (!schoolColumns.has('region_code') || !schoolColumns.has('city_code'))) {
            return res.status(400).json({
                error: 'migration_required',
                message: 'School geo columns are missing. Run migration: npm run db:migrate:school-geo'
            });
        }

        const profileValidation = hasSchoolProfileInput
            ? normalizeAndValidateSchoolProfile(req.body || {}, { mode: 'update' })
            : { errors: [], values: {} };

        if (profileValidation.errors.length > 0) {
            return res.status(400).json({
                error: 'validation_error',
                message: profileValidation.errors[0].message,
                details: profileValidation.errors
            });
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
        if (settings !== undefined && schoolColumns.has('settings')) {
            params.push(settings);
            updates.push(`settings = $${paramCount++}`);
        }
        if (is_active !== undefined) {
            params.push(is_active);
            updates.push(`is_active = $${paramCount++}`);
        }

        [
            'region_code',
            'city_code',
            'school_type',
            'ownership',
            'language_model',
            'study_shift',
            'capacity',
            'opened_year'
        ].forEach((field) => {
            if (!schoolColumns.has(field)) return;
            if (!Object.prototype.hasOwnProperty.call(req.body, field)) return;

            params.push(profileValidation.values[field] ?? null);
            updates.push(`${field} = $${paramCount++}`);
        });

        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        params.push(id);

        // Update school
        const returningFragments = (await buildSchoolSelectFragments({ includeSettings: true, alias: 'schools' }))
            .map((fragment) => fragment.replace(/^schools\./, ''));
        const result = await query(
            `UPDATE schools
             SET ${updates.join(', ')}
             WHERE id = $${paramCount}
             RETURNING ${returningFragments.join(', ')}`,
            params
        );
        const updatedSchool = enrichSchoolLocationNames(result.rows[0]);

        // Log action
        await query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [req.user.id, 'update', 'school', id, req.body]
        );

        res.json({
            message: 'School updated successfully',
            school: updatedSchool
        });

        try {
            await notifySystemChange({
                actor: req.user.username,
                action: 'update',
                entityType: 'school',
                entityName: updatedSchool.name,
                details: `id=${id}`
            });
        } catch (notifyError) {
            console.error('System telegram notification error:', notifyError);
        }
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

            try {
                await notifySystemChange({
                    actor: req.user.username,
                    action: 'delete',
                    entityType: 'school',
                    entityName: existingSchool.rows[0].name,
                    details: `id=${id}, permanent=true`
                });
            } catch (notifyError) {
                console.error('System telegram notification error:', notifyError);
            }
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

            try {
                await notifySystemChange({
                    actor: req.user.username,
                    action: 'delete',
                    entityType: 'school',
                    entityName: existingSchool.rows[0].name,
                    details: `id=${id}, soft=true`
                });
            } catch (notifyError) {
                console.error('System telegram notification error:', notifyError);
            }
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
 * GET /api/superadmin/reference/locations
 * Reference list for region/city selectors
 */
router.get('/reference/locations', async (req, res) => {
    try {
        res.json(getLocationsReference());
    } catch (error) {
        console.error('Get locations reference error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch locations reference'
        });
    }
});

/**
 * GET /api/superadmin/analytics/geo/overview
 * Geo-first analytics overview
 */
router.get('/analytics/geo/overview', async (req, res) => {
    try {
        const schoolColumns = await getTableColumns('schools');
        const hasRegionCode = schoolColumns.has('region_code');
        const hasCityCode = schoolColumns.has('city_code');
        const geoSchemaApplied = hasRegionCode && hasCityCode;

        const geoWhereByParams12 = geoSchemaApplied
            ? '($1::text IS NULL OR s.region_code = $1) AND ($2::text IS NULL OR s.city_code = $2)'
            : `($1::text IS NULL OR $1 = '${UNKNOWN_CODE}') AND ($2::text IS NULL OR $2 = '${UNKNOWN_CODE}')`;
        const geoWhereByParams23 = geoSchemaApplied
            ? '($2::text IS NULL OR s.region_code = $2) AND ($3::text IS NULL OR s.city_code = $3)'
            : `($2::text IS NULL OR $2 = '${UNKNOWN_CODE}') AND ($3::text IS NULL OR $3 = '${UNKNOWN_CODE}')`;

        const regionValueExpr = geoSchemaApplied
            ? `COALESCE(NULLIF(s.region_code, ''), '${UNKNOWN_CODE}')`
            : `'${UNKNOWN_CODE}'`;
        const cityValueExpr = geoSchemaApplied
            ? `COALESCE(NULLIF(s.city_code, ''), '${UNKNOWN_CODE}')`
            : `'${UNKNOWN_CODE}'`;

        const period = parseGeoPeriodDays(req.query.period, 30);
        const regionCode = toNullableCode(req.query.region_code);
        const cityCode = toNullableCode(req.query.city_code);
        const startDate = new Date(Date.now() - (period * 24 * 60 * 60 * 1000));
        const attemptMeta = await getAttemptSqlMeta('ta');

        const profileCoverageExpr = [
            'school_type',
            'ownership',
            'language_model',
            'study_shift'
        ].every((columnName) => schoolColumns.has(columnName))
            ? `COUNT(*) FILTER (
                    WHERE NULLIF(s.school_type, '') IS NOT NULL
                      AND NULLIF(s.ownership, '') IS NOT NULL
                      AND NULLIF(s.language_model, '') IS NOT NULL
                      AND NULLIF(s.study_shift, '') IS NOT NULL
                )::int`
            : '0::int';
        const geoFilledExpr = geoSchemaApplied
            ? `COUNT(*) FILTER (
                    WHERE NULLIF(s.region_code, '') IS NOT NULL
                      AND NULLIF(s.city_code, '') IS NOT NULL
                )::int`
            : '0::int';
        const geoUnknownExpr = geoSchemaApplied
            ? `COUNT(*) FILTER (
                    WHERE NULLIF(s.region_code, '') IS NULL
                       OR NULLIF(s.city_code, '') IS NULL
                )::int`
            : 'COUNT(*)::int';

        const coverageResult = await query(
            `SELECT
                COUNT(*)::int AS total_schools,
                ${geoFilledExpr} AS geo_filled,
                ${geoUnknownExpr} AS geo_unknown,
                ${profileCoverageExpr} AS profile_filled
             FROM schools s
             WHERE ${geoWhereByParams12}`,
            [regionCode, cityCode]
        );

        const kpiResult = await query(
            `WITH filtered_schools AS (
                SELECT s.id
                FROM schools s
                WHERE ${geoWhereByParams23}
            ),
            attempts AS (
                SELECT
                    COUNT(ta.id) FILTER (WHERE ${attemptMeta.dateColumn} >= $1)::int AS total_attempts,
                    COUNT(ta.id) FILTER (WHERE ${attemptMeta.dateColumn} >= $1 AND ${attemptMeta.completedFilter})::int AS completed_attempts,
                    ${attemptMeta.hasScore
                ? `AVG(CASE WHEN ${attemptMeta.dateColumn} >= $1 AND ${attemptMeta.completedFilter} THEN ${attemptMeta.scoreExpr} END)`
                : 'NULL'} AS avg_score
                FROM filtered_schools fs
                LEFT JOIN tests t ON t.school_id = fs.id
                LEFT JOIN test_assignments tas ON tas.test_id = t.id
                LEFT JOIN test_attempts ta ON ta.assignment_id = tas.id
            )
            SELECT
                (SELECT COUNT(*)::int FROM filtered_schools) AS schools,
                (SELECT COUNT(*)::int FROM users u JOIN filtered_schools fs ON fs.id = u.school_id WHERE u.role != 'superadmin') AS users,
                (SELECT COUNT(*)::int FROM tests t JOIN filtered_schools fs ON fs.id = t.school_id) AS tests,
                COALESCE(attempts.total_attempts, 0)::int AS attempts,
                COALESCE(attempts.completed_attempts, 0)::int AS completed_attempts,
                COALESCE(ROUND(attempts.avg_score::numeric, 2), 0) AS avg_score,
                COALESCE(
                    CASE
                        WHEN attempts.total_attempts > 0
                            THEN ROUND((attempts.completed_attempts::numeric / attempts.total_attempts::numeric) * 100, 2)
                        ELSE 0
                    END,
                    0
                ) AS completion_rate
            FROM attempts`,
            [startDate, regionCode, cityCode]
        );

        const byRegionResult = await query(
            `WITH filtered_schools AS (
                SELECT
                    s.id,
                    ${regionValueExpr} AS region_code
                FROM schools s
                WHERE ${geoWhereByParams23}
            ),
            school_stats AS (
                SELECT region_code, COUNT(*)::int AS schools_count
                FROM filtered_schools
                GROUP BY region_code
            ),
            user_stats AS (
                SELECT
                    fs.region_code,
                    COUNT(*) FILTER (WHERE u.role != 'superadmin')::int AS users_total,
                    COUNT(*) FILTER (WHERE u.role = 'student')::int AS students_total,
                    COUNT(*) FILTER (WHERE u.role = 'teacher')::int AS teachers_total
                FROM filtered_schools fs
                LEFT JOIN users u ON u.school_id = fs.id
                GROUP BY fs.region_code
            ),
            attempt_stats AS (
                SELECT
                    fs.region_code,
                    COUNT(ta.id) FILTER (WHERE ${attemptMeta.dateColumn} >= $1)::int AS attempts_total,
                    COUNT(ta.id) FILTER (WHERE ${attemptMeta.dateColumn} >= $1 AND ${attemptMeta.completedFilter})::int AS completed_attempts,
                    COUNT(DISTINCT CASE WHEN ${attemptMeta.dateColumn} >= $1 AND ${attemptMeta.completedFilter} THEN fs.id END)::int AS active_schools,
                    ${attemptMeta.hasScore
                ? `AVG(CASE WHEN ${attemptMeta.dateColumn} >= $1 AND ${attemptMeta.completedFilter} THEN ${attemptMeta.scoreExpr} END)`
                : 'NULL'} AS avg_score
                FROM filtered_schools fs
                LEFT JOIN tests t ON t.school_id = fs.id
                LEFT JOIN test_assignments tas ON tas.test_id = t.id
                LEFT JOIN test_attempts ta ON ta.assignment_id = tas.id
                GROUP BY fs.region_code
            )
            SELECT
                s.region_code,
                s.schools_count,
                COALESCE(u.users_total, 0)::int AS users_total,
                COALESCE(u.students_total, 0)::int AS students_total,
                COALESCE(u.teachers_total, 0)::int AS teachers_total,
                COALESCE(a.active_schools, 0)::int AS active_schools,
                COALESCE(a.attempts_total, 0)::int AS attempts_total,
                COALESCE(a.completed_attempts, 0)::int AS completed_attempts,
                COALESCE(ROUND(a.avg_score::numeric, 2), 0) AS avg_score
            FROM school_stats s
            LEFT JOIN user_stats u ON u.region_code = s.region_code
            LEFT JOIN attempt_stats a ON a.region_code = s.region_code
            ORDER BY s.schools_count DESC, s.region_code ASC`,
            [startDate, regionCode, cityCode]
        );

        const byCityResult = await query(
            `WITH filtered_schools AS (
                SELECT
                    s.id,
                    ${regionValueExpr} AS region_code,
                    ${cityValueExpr} AS city_code
                FROM schools s
                WHERE ${geoWhereByParams23}
            ),
            school_stats AS (
                SELECT region_code, city_code, COUNT(*)::int AS schools_count
                FROM filtered_schools
                GROUP BY region_code, city_code
            ),
            user_stats AS (
                SELECT
                    fs.region_code,
                    fs.city_code,
                    COUNT(*) FILTER (WHERE u.role != 'superadmin')::int AS users_total
                FROM filtered_schools fs
                LEFT JOIN users u ON u.school_id = fs.id
                GROUP BY fs.region_code, fs.city_code
            ),
            attempt_stats AS (
                SELECT
                    fs.region_code,
                    fs.city_code,
                    COUNT(ta.id) FILTER (WHERE ${attemptMeta.dateColumn} >= $1)::int AS attempts_total,
                    COUNT(ta.id) FILTER (WHERE ${attemptMeta.dateColumn} >= $1 AND ${attemptMeta.completedFilter})::int AS completed_attempts,
                    ${attemptMeta.hasScore
                ? `AVG(CASE WHEN ${attemptMeta.dateColumn} >= $1 AND ${attemptMeta.completedFilter} THEN ${attemptMeta.scoreExpr} END)`
                : 'NULL'} AS avg_score
                FROM filtered_schools fs
                LEFT JOIN tests t ON t.school_id = fs.id
                LEFT JOIN test_assignments tas ON tas.test_id = t.id
                LEFT JOIN test_attempts ta ON ta.assignment_id = tas.id
                GROUP BY fs.region_code, fs.city_code
            )
            SELECT
                s.region_code,
                s.city_code,
                s.schools_count,
                COALESCE(u.users_total, 0)::int AS users_total,
                COALESCE(a.attempts_total, 0)::int AS attempts_total,
                COALESCE(a.completed_attempts, 0)::int AS completed_attempts,
                COALESCE(ROUND(a.avg_score::numeric, 2), 0) AS avg_score
            FROM school_stats s
            LEFT JOIN user_stats u ON u.region_code = s.region_code AND u.city_code = s.city_code
            LEFT JOIN attempt_stats a ON a.region_code = s.region_code AND a.city_code = s.city_code
            ORDER BY s.schools_count DESC, s.city_code ASC`,
            [startDate, regionCode, cityCode]
        );

        const distributionFields = ['school_type', 'ownership', 'language_model', 'study_shift']
            .filter((field) => schoolColumns.has(field));
        const distributions = {};
        const geoWhereByParams12ForDist = geoSchemaApplied
            ? '($1::text IS NULL OR s.region_code = $1) AND ($2::text IS NULL OR s.city_code = $2)'
            : `($1::text IS NULL OR $1 = '${UNKNOWN_CODE}') AND ($2::text IS NULL OR $2 = '${UNKNOWN_CODE}')`;

        for (const field of distributionFields) {
            const distResult = await query(
                `SELECT
                    COALESCE(NULLIF(s.${field}, ''), '${UNKNOWN_CODE}') AS value_code,
                    COUNT(*)::int AS schools_count
                 FROM schools s
                 WHERE ${geoWhereByParams12ForDist}
                 GROUP BY value_code
                 ORDER BY schools_count DESC, value_code ASC`,
                [regionCode, cityCode]
            );

            distributions[field] = distResult.rows.map((row) => ({
                value_code: row.value_code,
                value_name_ru: resolveDimensionName(field, row.value_code, 'ru'),
                value_name_uz: resolveDimensionName(field, row.value_code, 'uz'),
                schools_count: parseInt(row.schools_count, 10) || 0
            }));
        }

        const coverageRow = coverageResult.rows[0] || {};
        const kpisRow = kpiResult.rows[0] || {};

        const totalSchools = parseInt(coverageRow.total_schools, 10) || 0;
        const geoFilled = parseInt(coverageRow.geo_filled, 10) || 0;
        const geoUnknown = parseInt(coverageRow.geo_unknown, 10) || 0;
        const profileFilled = parseInt(coverageRow.profile_filled, 10) || 0;

        const byRegion = byRegionResult.rows.map((row) => {
            const attemptsTotal = parseInt(row.attempts_total, 10) || 0;
            const completedAttempts = parseInt(row.completed_attempts, 10) || 0;
            return {
                region_code: row.region_code,
                region_name_ru: resolveDimensionName('region', row.region_code, 'ru'),
                region_name_uz: resolveDimensionName('region', row.region_code, 'uz'),
                schools_count: parseInt(row.schools_count, 10) || 0,
                active_schools: parseInt(row.active_schools, 10) || 0,
                users_total: parseInt(row.users_total, 10) || 0,
                students_total: parseInt(row.students_total, 10) || 0,
                teachers_total: parseInt(row.teachers_total, 10) || 0,
                attempts_total: attemptsTotal,
                completed_attempts: completedAttempts,
                avg_score: Number(row.avg_score) || 0,
                completion_rate: attemptsTotal > 0
                    ? Number(((completedAttempts / attemptsTotal) * 100).toFixed(2))
                    : 0
            };
        });

        const byCity = byCityResult.rows.map((row) => {
            const attemptsTotal = parseInt(row.attempts_total, 10) || 0;
            const completedAttempts = parseInt(row.completed_attempts, 10) || 0;
            return {
                region_code: row.region_code,
                region_name_ru: resolveDimensionName('region', row.region_code, 'ru'),
                region_name_uz: resolveDimensionName('region', row.region_code, 'uz'),
                city_code: row.city_code,
                city_name_ru: resolveDimensionName('city', row.city_code, 'ru'),
                city_name_uz: resolveDimensionName('city', row.city_code, 'uz'),
                schools_count: parseInt(row.schools_count, 10) || 0,
                users_total: parseInt(row.users_total, 10) || 0,
                attempts_total: attemptsTotal,
                completed_attempts: completedAttempts,
                avg_score: Number(row.avg_score) || 0,
                completion_rate: attemptsTotal > 0
                    ? Number(((completedAttempts / attemptsTotal) * 100).toFixed(2))
                    : 0
            };
        });

        res.json({
            period,
            geo_schema_applied: geoSchemaApplied,
            filters: {
                region_code: regionCode,
                city_code: cityCode
            },
            coverage: {
                total_schools: totalSchools,
                geo_filled: geoFilled,
                geo_unknown: geoUnknown,
                geo_fill_rate: totalSchools > 0 ? Number(((geoFilled / totalSchools) * 100).toFixed(2)) : 0,
                profile_filled: profileFilled,
                profile_fill_rate: totalSchools > 0 ? Number(((profileFilled / totalSchools) * 100).toFixed(2)) : 0
            },
            kpis: {
                schools: parseInt(kpisRow.schools, 10) || 0,
                users: parseInt(kpisRow.users, 10) || 0,
                tests: parseInt(kpisRow.tests, 10) || 0,
                attempts: parseInt(kpisRow.attempts, 10) || 0,
                completed_attempts: parseInt(kpisRow.completed_attempts, 10) || 0,
                avg_score: Number(kpisRow.avg_score) || 0,
                completion_rate: Number(kpisRow.completion_rate) || 0
            },
            by_region: byRegion,
            by_city: byCity,
            distributions
        });
    } catch (error) {
        console.error('Geo overview analytics error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch geo analytics overview'
        });
    }
});

/**
 * GET /api/superadmin/analytics/geo/trends
 * Geo trends time-series
 */
router.get('/analytics/geo/trends', async (req, res) => {
    try {
        const schoolColumns = await getTableColumns('schools');
        const hasRegionCode = schoolColumns.has('region_code');
        const hasCityCode = schoolColumns.has('city_code');
        const geoSchemaApplied = hasRegionCode && hasCityCode;

        const period = parseGeoPeriodDays(req.query.period, 90);
        const metric = ['avg_score', 'attempts', 'new_schools'].includes(String(req.query.metric || 'avg_score'))
            ? String(req.query.metric || 'avg_score')
            : 'avg_score';
        const groupBy = String(req.query.group_by || 'region').trim().toLowerCase() === 'city'
            ? 'city'
            : 'region';
        const regionCode = toNullableCode(req.query.region_code);
        const cityCode = toNullableCode(req.query.city_code);
        const startDate = new Date(Date.now() - (period * 24 * 60 * 60 * 1000));

        const regionExpr = hasRegionCode
            ? `COALESCE(NULLIF(s.region_code, ''), '${UNKNOWN_CODE}')`
            : `'${UNKNOWN_CODE}'`;
        const cityExpr = hasCityCode
            ? `COALESCE(NULLIF(s.city_code, ''), '${UNKNOWN_CODE}')`
            : `'${UNKNOWN_CODE}'`;
        const groupExpr = groupBy === 'city' ? cityExpr : regionExpr;
        const geoWhereByParams23 = geoSchemaApplied
            ? '($2::text IS NULL OR s.region_code = $2) AND ($3::text IS NULL OR s.city_code = $3)'
            : `($2::text IS NULL OR $2 = '${UNKNOWN_CODE}') AND ($3::text IS NULL OR $3 = '${UNKNOWN_CODE}')`;

        let rows = [];
        if (metric === 'new_schools') {
            const result = await query(
                `SELECT
                    DATE_TRUNC('day', s.created_at)::date AS bucket_date,
                    ${groupExpr} AS group_code,
                    COUNT(*)::int AS metric_value
                 FROM schools s
                 WHERE s.created_at >= $1
                   AND ${geoWhereByParams23}
                 GROUP BY bucket_date, group_code
                 ORDER BY bucket_date ASC, group_code ASC`,
                [startDate, regionCode, cityCode]
            );
            rows = result.rows;
        } else {
            const attemptMeta = await getAttemptSqlMeta('ta');
            const result = await query(
                `SELECT
                    DATE_TRUNC('day', ${attemptMeta.dateColumn})::date AS bucket_date,
                    ${groupExpr} AS group_code,
                    COUNT(ta.id) FILTER (WHERE ${attemptMeta.dateColumn} >= $1)::int AS attempts_total,
                    COUNT(ta.id) FILTER (WHERE ${attemptMeta.dateColumn} >= $1 AND ${attemptMeta.completedFilter})::int AS completed_attempts,
                    ${attemptMeta.hasScore
                ? `AVG(CASE WHEN ${attemptMeta.dateColumn} >= $1 AND ${attemptMeta.completedFilter} THEN ${attemptMeta.scoreExpr} END)`
                : 'NULL'} AS avg_score
                 FROM schools s
                 LEFT JOIN tests t ON t.school_id = s.id
                 LEFT JOIN test_assignments tas ON tas.test_id = t.id
                 LEFT JOIN test_attempts ta ON ta.assignment_id = tas.id
                 WHERE ${attemptMeta.dateColumn} >= $1
                   AND ${geoWhereByParams23}
                 GROUP BY bucket_date, group_code
                 ORDER BY bucket_date ASC, group_code ASC`,
                [startDate, regionCode, cityCode]
            );
            rows = result.rows.map((row) => {
                const attemptsTotal = parseInt(row.attempts_total, 10) || 0;
                const completedAttempts = parseInt(row.completed_attempts, 10) || 0;
                return {
                    bucket_date: row.bucket_date,
                    group_code: row.group_code,
                    attempts_total: attemptsTotal,
                    completed_attempts: completedAttempts,
                    avg_score: Number(row.avg_score) || 0,
                    metric_value: metric === 'avg_score'
                        ? Number(row.avg_score) || 0
                        : completedAttempts
                };
            });
        }

        const seriesMap = new Map();
        rows.forEach((row) => {
            const code = row.group_code || UNKNOWN_CODE;
            if (!seriesMap.has(code)) {
                seriesMap.set(code, {
                    group_code: code,
                    group_name_ru: resolveDimensionName(groupBy, code, 'ru'),
                    group_name_uz: resolveDimensionName(groupBy, code, 'uz'),
                    points: []
                });
            }

            seriesMap.get(code).points.push({
                date: row.bucket_date,
                value: Number(row.metric_value) || 0,
                attempts_total: parseInt(row.attempts_total, 10) || 0,
                completed_attempts: parseInt(row.completed_attempts, 10) || 0,
                avg_score: Number(row.avg_score) || 0
            });
        });

        const series = Array.from(seriesMap.values())
            .map((item) => ({
                ...item,
                points: item.points.sort((a, b) => new Date(a.date) - new Date(b.date))
            }))
            .sort((a, b) => {
                const sumA = a.points.reduce((sum, point) => sum + (Number(point.value) || 0), 0);
                const sumB = b.points.reduce((sum, point) => sum + (Number(point.value) || 0), 0);
                return sumB - sumA;
            });

        res.json({
            period,
            metric,
            group_by: groupBy,
            geo_schema_applied: geoSchemaApplied,
            filters: {
                region_code: regionCode,
                city_code: cityCode
            },
            series
        });
    } catch (error) {
        console.error('Geo trends analytics error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch geo analytics trends'
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
                email, phone, telegram_id, role, is_active, must_change_password
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'school_admin', true, $9)
             RETURNING id, username, role, first_name, last_name, email, phone, telegram_id, created_at`,
            [
                schoolId,
                username.trim(),
                hashedPassword,
                first_name.trim(),
                last_name.trim(),
                email?.trim() || null,
                phone?.trim() || null,
                telegram_id?.trim() || null,
                !!otpPassword
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

        try {
            await notifySystemChange({
                actor: req.user.username,
                action: 'create',
                entityType: 'school_admin',
                entityName: newAdmin.username,
                details: `school_id=${schoolId}`
            });
        } catch (notifyError) {
            console.error('System telegram notification error:', notifyError);
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

        try {
            await notifySystemChange({
                actor: req.user.username,
                action: 'delete',
                entityType: 'school_admin',
                entityName: existingAdmin.rows[0].username,
                details: `school_id=${schoolId}`
            });
        } catch (notifyError) {
            console.error('System telegram notification error:', notifyError);
        }
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
            'SELECT id, username, first_name, last_name, email, telegram_id, role, settings FROM users WHERE id = $1 AND school_id = $2 AND role = $3',
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
                 token_version = token_version + 1,
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

        try {
            await notifySystemChange({
                actor: req.user.username,
                action: 'reset_password',
                entityType: 'school_admin',
                entityName: admin.username,
                details: `school_id=${schoolId}`
            });
        } catch (notifyError) {
            console.error('System telegram notification error:', notifyError);
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
 * PUT /api/superadmin/career/interests/:id
 * Update career interest
 */
router.put('/career/interests/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const columns = await getTableColumns('career_interests');
        const payload = buildCareerInterestPayload(req.body, columns);

        if (payload.error) {
            return res.status(400).json({ error: 'validation_error', message: payload.error });
        }

        if (!payload.updates || payload.updates.length === 0) {
            return res.status(400).json({ error: 'no_fields', message: 'No fields to update' });
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
        const schoolColumns = await getTableColumns('schools');
        const hasRegionCode = schoolColumns.has('region_code');
        const hasCityCode = schoolColumns.has('city_code');
        const geoSchemaApplied = hasRegionCode && hasCityCode;

        const metric = ['avg_score', 'test_completion', 'student_count', 'teacher_count']
            .includes(String(req.query.metric || 'avg_score'))
            ? String(req.query.metric || 'avg_score')
            : 'avg_score';
        const { key: period, startDate } = parsePeriodToStartDate(req.query.period || 'month');
        const schoolNameExpr = await getSchoolNameExpr();
        const dimensionCfg = getDimensionSqlConfig(req.query.dimension, schoolNameExpr, schoolColumns);
        const regionCode = toNullableCode(req.query.region_code);
        const cityCode = toNullableCode(req.query.city_code);
        const attemptMeta = await getAttemptSqlMeta('ta');
        const geoWhereByParams23 = geoSchemaApplied
            ? '($2::text IS NULL OR s.region_code = $2) AND ($3::text IS NULL OR s.city_code = $3)'
            : `($2::text IS NULL OR $2 = '${UNKNOWN_CODE}') AND ($3::text IS NULL OR $3 = '${UNKNOWN_CODE}')`;
        const regionValueExpr = hasRegionCode
            ? `COALESCE(NULLIF(s.region_code, ''), '${UNKNOWN_CODE}')`
            : `'${UNKNOWN_CODE}'`;
        const cityValueExpr = hasCityCode
            ? `COALESCE(NULLIF(s.city_code, ''), '${UNKNOWN_CODE}')`
            : `'${UNKNOWN_CODE}'`;

        let rows = [];
        let summary = {};

        if (metric === 'avg_score') {
            if (attemptMeta.hasScore) {
                const result = await query(
                    `SELECT
                        ${dimensionCfg.keyExpr} AS dimension_code,
                        ${dimensionCfg.nameExpr} AS raw_name,
                        MIN(${regionValueExpr}) AS region_code,
                        MIN(${cityValueExpr}) AS city_code,
                        COUNT(ta.id) FILTER (WHERE ${attemptMeta.dateColumn} >= $1)::int AS total_attempts,
                        COUNT(ta.id) FILTER (WHERE ${attemptMeta.dateColumn} >= $1 AND ${attemptMeta.completedFilter})::int AS completed_attempts,
                        AVG(CASE WHEN ${attemptMeta.dateColumn} >= $1 AND ${attemptMeta.completedFilter} THEN ${attemptMeta.scoreExpr} END)::numeric(8,2) AS avg_score
                     FROM schools s
                     LEFT JOIN tests t ON t.school_id = s.id
                     LEFT JOIN test_assignments tas ON tas.test_id = t.id
                     LEFT JOIN test_attempts ta ON ta.assignment_id = tas.id
                     WHERE s.is_active = true
                       AND ${geoWhereByParams23}
                     GROUP BY ${dimensionCfg.keyExpr}, ${dimensionCfg.nameExpr}
                     ORDER BY avg_score DESC NULLS LAST, raw_name ASC`,
                    [startDate, regionCode, cityCode]
                );

                rows = result.rows.map((row) => {
                    const dimensionCode = row.dimension_code || UNKNOWN_CODE;
                    const displayName = dimensionCfg.dimension === 'school'
                        ? row.raw_name
                        : resolveDimensionName(dimensionCfg.dimension, dimensionCode, 'ru');

                    return {
                        id: dimensionCode,
                        name: displayName || 'N/A',
                        dimension: dimensionCfg.dimension,
                        dimension_code: dimensionCode,
                        dimension_name_ru: resolveDimensionName(dimensionCfg.dimension, dimensionCode, 'ru'),
                        dimension_name_uz: resolveDimensionName(dimensionCfg.dimension, dimensionCode, 'uz'),
                        region_code: row.region_code || UNKNOWN_CODE,
                        city_code: row.city_code || UNKNOWN_CODE,
                        value: parseFloat(row.avg_score) || 0,
                        attempts: parseInt(row.completed_attempts, 10) || 0,
                        total_attempts: parseInt(row.total_attempts, 10) || 0
                    };
                });

                const totalScore = rows.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
                summary = {
                    top_performer: rows[0]?.name || 'N/A',
                    average: rows.length > 0 ? (totalScore / rows.length).toFixed(2) : 0,
                    total_attempts: rows.reduce((sum, item) => sum + (Number(item.attempts) || 0), 0)
                };
            }
        } else if (metric === 'test_completion') {
            const result = await query(
                `SELECT
                    ${dimensionCfg.keyExpr} AS dimension_code,
                    ${dimensionCfg.nameExpr} AS raw_name,
                    MIN(${regionValueExpr}) AS region_code,
                    MIN(${cityValueExpr}) AS city_code,
                    COUNT(ta.id) FILTER (WHERE ${attemptMeta.dateColumn} >= $1)::int AS total_attempts,
                    COUNT(ta.id) FILTER (WHERE ${attemptMeta.dateColumn} >= $1 AND ${attemptMeta.completedFilter})::int AS completed_attempts
                 FROM schools s
                 LEFT JOIN tests t ON t.school_id = s.id
                 LEFT JOIN test_assignments tas ON tas.test_id = t.id
                 LEFT JOIN test_attempts ta ON ta.assignment_id = tas.id
                 WHERE s.is_active = true
                   AND ${geoWhereByParams23}
                 GROUP BY ${dimensionCfg.keyExpr}, ${dimensionCfg.nameExpr}
                 ORDER BY
                    CASE
                        WHEN COUNT(ta.id) FILTER (WHERE ${attemptMeta.dateColumn} >= $1) > 0
                            THEN (COUNT(ta.id) FILTER (WHERE ${attemptMeta.dateColumn} >= $1 AND ${attemptMeta.completedFilter})::numeric
                                / NULLIF(COUNT(ta.id) FILTER (WHERE ${attemptMeta.dateColumn} >= $1), 0)::numeric) * 100
                        ELSE 0
                    END DESC,
                    raw_name ASC`,
                [startDate, regionCode, cityCode]
            );

            rows = result.rows.map((row) => {
                const totalAttempts = parseInt(row.total_attempts, 10) || 0;
                const completedAttempts = parseInt(row.completed_attempts, 10) || 0;
                const completionRate = totalAttempts > 0
                    ? Number(((completedAttempts / totalAttempts) * 100).toFixed(2))
                    : 0;
                const dimensionCode = row.dimension_code || UNKNOWN_CODE;
                const displayName = dimensionCfg.dimension === 'school'
                    ? row.raw_name
                    : resolveDimensionName(dimensionCfg.dimension, dimensionCode, 'ru');

                return {
                    id: dimensionCode,
                    name: displayName || 'N/A',
                    dimension: dimensionCfg.dimension,
                    dimension_code: dimensionCode,
                    dimension_name_ru: resolveDimensionName(dimensionCfg.dimension, dimensionCode, 'ru'),
                    dimension_name_uz: resolveDimensionName(dimensionCfg.dimension, dimensionCode, 'uz'),
                    region_code: row.region_code || UNKNOWN_CODE,
                    city_code: row.city_code || UNKNOWN_CODE,
                    value: completionRate,
                    total: totalAttempts,
                    completed: completedAttempts
                };
            });

            const totalRate = rows.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
            summary = {
                top_performer: rows[0]?.name || 'N/A',
                average: rows.length > 0 ? (totalRate / rows.length).toFixed(2) : 0,
                total_tests: rows.reduce((sum, item) => sum + (Number(item.total) || 0), 0)
            };
        } else {
            const roleFilter = metric === 'student_count' ? 'student' : 'teacher';
            const result = await query(
                `SELECT
                    ${dimensionCfg.keyExpr} AS dimension_code,
                    ${dimensionCfg.nameExpr} AS raw_name,
                    MIN(${regionValueExpr}) AS region_code,
                    MIN(${cityValueExpr}) AS city_code,
                    COUNT(DISTINCT u.id)::int AS role_count
                 FROM schools s
                 LEFT JOIN users u ON u.school_id = s.id AND u.role = $1
                 WHERE s.is_active = true
                   AND ${geoWhereByParams23}
                 GROUP BY ${dimensionCfg.keyExpr}, ${dimensionCfg.nameExpr}
                 ORDER BY role_count DESC, raw_name ASC`,
                [roleFilter, regionCode, cityCode]
            );

            rows = result.rows.map((row) => {
                const dimensionCode = row.dimension_code || UNKNOWN_CODE;
                const displayName = dimensionCfg.dimension === 'school'
                    ? row.raw_name
                    : resolveDimensionName(dimensionCfg.dimension, dimensionCode, 'ru');

                return {
                    id: dimensionCode,
                    name: displayName || 'N/A',
                    dimension: dimensionCfg.dimension,
                    dimension_code: dimensionCode,
                    dimension_name_ru: resolveDimensionName(dimensionCfg.dimension, dimensionCode, 'ru'),
                    dimension_name_uz: resolveDimensionName(dimensionCfg.dimension, dimensionCode, 'uz'),
                    region_code: row.region_code || UNKNOWN_CODE,
                    city_code: row.city_code || UNKNOWN_CODE,
                    value: parseInt(row.role_count, 10) || 0
                };
            });

            const totalValue = rows.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
            summary = {
                top_performer: rows[0]?.name || 'N/A',
                total: totalValue,
                average: rows.length > 0 ? Math.round(totalValue / rows.length) : 0
            };
        }

        res.json({
            metric,
            period,
            dimension: dimensionCfg.dimension,
            filters: {
                region_code: regionCode,
                city_code: cityCode
            },
            schools: rows,
            data: rows,
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

/**
 * GET /api/superadmin/notification-defaults
 * Get role-based default notification matrix.
 */
router.get('/notification-defaults', async (req, res) => {
    try {
        const defaults = await getRoleNotificationDefaultsMap();
        res.json({ defaults });
    } catch (error) {
        console.error('Get notification defaults error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch notification defaults'
        });
    }
});

/**
 * GET /api/superadmin/audit/logs
 * Paginated audit log list with filters and sorting.
 */
router.get('/audit/logs', async (req, res) => {
    try {
        const page = parsePositiveInt(req.query.page, 1, 1, 100000);
        const limit = parsePositiveInt(req.query.limit, 25, 1, 200);
        const offset = (page - 1) * limit;

        const sort = String(req.query.sort || 'created_at').trim();
        const order = String(req.query.order || 'desc').trim().toLowerCase() === 'asc' ? 'ASC' : 'DESC';
        const sortMap = {
            created_at: 'al.created_at',
            action: 'al.action',
            entity_type: 'al.entity_type',
            actor: "COALESCE(u.username, '')"
        };
        const sortExpr = sortMap[sort] || sortMap.created_at;

        const filters = buildAuditFilters(req.query);

        const countResult = await query(
            `SELECT COUNT(*) AS total
             FROM audit_logs al
             LEFT JOIN users u ON u.id = al.user_id
             ${filters.whereClause}`,
            filters.params
        );
        const total = parseInt(countResult.rows[0]?.total || 0, 10);

        const schoolNameExpr = await getSchoolNameExpr();
        const dataParams = [...filters.params, limit, offset];
        const rowsResult = await query(
            `SELECT
                al.id,
                al.user_id,
                al.action,
                al.entity_type,
                al.entity_id,
                al.details,
                al.created_at,
                u.username,
                u.first_name,
                u.last_name,
                u.role AS actor_role,
                s.id AS school_id,
                ${schoolNameExpr} AS school_name,
                (al.action::text ILIKE '%failed%' OR COALESCE(al.details::text, '') ILIKE '%error%') AS is_failed
             FROM audit_logs al
             LEFT JOIN users u ON u.id = al.user_id
             LEFT JOIN schools s ON s.id = u.school_id
             ${filters.whereClause}
             ORDER BY ${sortExpr} ${order}
             LIMIT $${dataParams.length - 1}
             OFFSET $${dataParams.length}`,
            dataParams
        );

        res.json({
            logs: rowsResult.rows,
            pagination: {
                total,
                page,
                limit,
                pages: Math.max(1, Math.ceil(total / limit))
            }
        });
    } catch (error) {
        console.error('Get audit logs error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch audit logs'
        });
    }
});

/**
 * GET /api/superadmin/audit/summary
 * KPI + activity aggregates for audit center.
 */
router.get('/audit/summary', async (req, res) => {
    try {
        const filters = buildAuditFilters(req.query);

        const baseParams = filters.params;
        const kpiResult = await query(
            `WITH filtered AS (
                SELECT al.user_id, al.action, al.details, al.created_at
                FROM audit_logs al
                LEFT JOIN users u ON u.id = al.user_id
                ${filters.whereClause}
            )
            SELECT
                COUNT(*)::int AS total_events,
                COUNT(DISTINCT user_id)::int AS unique_actors,
                COUNT(*) FILTER (WHERE action::text ILIKE '%failed%' OR COALESCE(details::text, '') ILIKE '%error%')::int AS failed_events
            FROM filtered`,
            baseParams
        );

        const topActionsResult = await query(
            `WITH filtered AS (
                SELECT al.action
                FROM audit_logs al
                LEFT JOIN users u ON u.id = al.user_id
                ${filters.whereClause}
            )
            SELECT action, COUNT(*)::int AS count
            FROM filtered
            GROUP BY action
            ORDER BY count DESC, action ASC
            LIMIT 8`,
            baseParams
        );

        const activityResult = await query(
            `WITH filtered AS (
                SELECT al.created_at
                FROM audit_logs al
                LEFT JOIN users u ON u.id = al.user_id
                ${filters.whereClause}
            )
            SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
            FROM filtered
            GROUP BY date_trunc('day', created_at)
            ORDER BY date_trunc('day', created_at) DESC
            LIMIT 31`,
            baseParams
        );

        const topActorsResult = await query(
            `WITH filtered AS (
                SELECT al.user_id
                FROM audit_logs al
                LEFT JOIN users u ON u.id = al.user_id
                ${filters.whereClause}
            )
            SELECT
                f.user_id,
                COALESCE(u.username, 'system') AS username,
                u.role,
                COUNT(*)::int AS count
            FROM filtered f
            LEFT JOIN users u ON u.id = f.user_id
            GROUP BY f.user_id, u.username, u.role
            ORDER BY count DESC, username ASC
            LIMIT 8`,
            baseParams
        );

        res.json({
            kpi: kpiResult.rows[0] || { total_events: 0, unique_actors: 0, failed_events: 0 },
            top_actions: topActionsResult.rows || [],
            activity_by_day: (activityResult.rows || []).reverse(),
            top_actors: topActorsResult.rows || []
        });
    } catch (error) {
        console.error('Get audit summary error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch audit summary'
        });
    }
});

/**
 * GET /api/superadmin/audit/facets
 * Distinct values for filter controls.
 */
router.get('/audit/facets', async (req, res) => {
    try {
        const actionsResult = await query(
            `SELECT action, COUNT(*)::int AS count
             FROM audit_logs
             GROUP BY action
             ORDER BY count DESC, action ASC
             LIMIT 80`
        );
        const entityTypesResult = await query(
            `SELECT entity_type, COUNT(*)::int AS count
             FROM audit_logs
             GROUP BY entity_type
             ORDER BY count DESC, entity_type ASC
             LIMIT 80`
        );
        const actorRolesResult = await query(
            `SELECT role, COUNT(*)::int AS count
             FROM users
             GROUP BY role
             ORDER BY count DESC, role ASC`
        );

        res.json({
            actions: actionsResult.rows || [],
            entity_types: entityTypesResult.rows || [],
            actor_roles: actorRolesResult.rows || []
        });
    } catch (error) {
        console.error('Get audit facets error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch audit facets'
        });
    }
});

/**
 * GET /api/superadmin/audit/export.csv
 * Export filtered audit logs to CSV.
 */
router.get('/audit/export.csv', async (req, res) => {
    try {
        const limit = parsePositiveInt(req.query.limit, 5000, 1, 20000);
        const filters = buildAuditFilters(req.query);
        const schoolNameExpr = await getSchoolNameExpr();

        const params = [...filters.params, limit];
        const rowsResult = await query(
            `SELECT
                al.id,
                al.created_at,
                COALESCE(u.username, '') AS actor_username,
                COALESCE(u.role, '') AS actor_role,
                al.action,
                al.entity_type,
                COALESCE(al.entity_id::text, '') AS entity_id,
                ${schoolNameExpr} AS school_name,
                COALESCE(al.details::text, '') AS details
             FROM audit_logs al
             LEFT JOIN users u ON u.id = al.user_id
             LEFT JOIN schools s ON s.id = u.school_id
             ${filters.whereClause}
             ORDER BY al.created_at DESC
             LIMIT $${params.length}`,
            params
        );

        const escapeCsv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
        const header = [
            'id',
            'created_at',
            'actor_username',
            'actor_role',
            'action',
            'entity_type',
            'entity_id',
            'school_name',
            'details'
        ];
        const lines = [header.join(',')];
        for (const row of rowsResult.rows || []) {
            lines.push([
                row.id,
                row.created_at,
                row.actor_username,
                row.actor_role,
                row.action,
                row.entity_type,
                row.entity_id,
                row.school_name,
                row.details
            ].map(escapeCsv).join(','));
        }

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="audit_export_${Date.now()}.csv"`);
        res.send(lines.join('\n'));
    } catch (error) {
        console.error('Export audit csv error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to export audit logs'
        });
    }
});

/**
 * PUT /api/superadmin/notification-defaults
 * Update role-based default notification matrix.
 */
router.put('/notification-defaults', async (req, res) => {
    try {
        const payload = req.body?.defaults;
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'defaults object is required'
            });
        }

        const current = await getRoleNotificationDefaultsMap();
        for (const role of NOTIFICATION_DEFAULT_ROLES) {
            if (!payload[role]) continue;
            const nextRole = payload[role];
            const fallbackRole = current[role] || {};
            const channels = normalizeBooleanMap(nextRole.channels, NOTIFICATION_CHANNEL_KEYS, fallbackRole.channels || {});
            const events = normalizeBooleanMap(nextRole.events, NOTIFICATION_EVENT_KEYS, fallbackRole.events || {});
            const rawMatrix = nextRole.matrix && typeof nextRole.matrix === 'object' ? nextRole.matrix : null;
            const frequencyRaw = String(nextRole.frequency || fallbackRole.frequency || 'instant').toLowerCase();
            const frequency = ['instant', 'daily', 'weekly'].includes(frequencyRaw) ? frequencyRaw : 'instant';

            await query(
                `INSERT INTO notification_role_defaults (role, frequency, updated_by, updated_at)
                 VALUES ($1, $2, $3, NOW())
                 ON CONFLICT (role)
                 DO UPDATE SET
                    frequency = EXCLUDED.frequency,
                    updated_by = EXCLUDED.updated_by,
                    updated_at = NOW()`,
                [role, frequency, req.user.id]
            );

            for (const channelKey of NOTIFICATION_CHANNEL_KEYS) {
                for (const eventKey of NOTIFICATION_EVENT_KEYS) {
                    const enabled = rawMatrix && rawMatrix[channelKey] && rawMatrix[channelKey][eventKey] !== undefined
                        ? !!rawMatrix[channelKey][eventKey]
                        : (!!channels[channelKey] && !!events[eventKey]);
                    await query(
                        `INSERT INTO notification_role_matrix (role, channel, event_key, enabled, updated_by, updated_at)
                         VALUES ($1, $2, $3, $4, $5, NOW())
                         ON CONFLICT (role, channel, event_key)
                         DO UPDATE SET
                            enabled = EXCLUDED.enabled,
                            updated_by = EXCLUDED.updated_by,
                            updated_at = NOW()`,
                        [role, channelKey, eventKey, enabled, req.user.id]
                    );
                }
            }
        }

        invalidateNotificationDefaultsCache();
        const defaults = await getRoleNotificationDefaultsMap();
        res.json({
            message: 'Notification defaults updated successfully',
            defaults
        });
    } catch (error) {
        console.error('Update notification defaults error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to update notification defaults'
        });
    }
});

/**
 * GET /api/superadmin/notifications/logs
 * Global delivery logs for notifications.
 */
router.get('/notifications/logs', async (req, res) => {
    try {
        const parsedPage = parseInt(req.query.page, 10);
        const parsedLimit = parseInt(req.query.limit, 10);
        const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
        const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
            ? Math.min(parsedLimit, 100)
            : 20;
        const offset = (page - 1) * limit;

        const channel = String(req.query.channel || '').trim().toLowerCase();
        const eventKey = String(req.query.event_key || '').trim();
        const status = String(req.query.status || '').trim().toLowerCase();
        const from = String(req.query.from || '').trim();
        const to = String(req.query.to || '').trim();

        const where = [];
        const params = [];

        if (channel) {
            params.push(channel);
            where.push(`nl.channel = $${params.length}`);
        }
        if (eventKey) {
            params.push(eventKey);
            where.push(`nl.event_key = $${params.length}`);
        }
        if (status) {
            params.push(status);
            where.push(`nl.status = $${params.length}`);
        }
        if (from) {
            params.push(from);
            where.push(`nl.created_at >= $${params.length}::timestamptz`);
        }
        if (to) {
            params.push(to);
            where.push(`nl.created_at <= $${params.length}::timestamptz`);
        }

        const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

        const countResult = await query(
            `SELECT COUNT(*) AS total
             FROM notification_log nl
             ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0]?.total || 0, 10);

        const dataParams = params.slice();
        dataParams.push(limit, offset);
        const rowsResult = await query(
            `SELECT
                nl.id,
                nl.user_id,
                nl.channel,
                nl.event_key,
                nl.status,
                nl.recipient,
                nl.subject,
                nl.error_message,
                nl.metadata,
                nl.created_at,
                u.username,
                u.first_name,
                u.last_name,
                u.role,
                s.id AS school_id,
                ${await getSchoolNameExpr()} AS school_name
             FROM notification_log nl
             LEFT JOIN users u ON u.id = nl.user_id
             LEFT JOIN schools s ON s.id = u.school_id
             ${whereClause}
             ORDER BY nl.created_at DESC
             LIMIT $${dataParams.length - 1}
             OFFSET $${dataParams.length}`,
            dataParams
        );

        res.json({
            logs: rowsResult.rows,
            pagination: {
                total,
                page,
                limit,
                pages: Math.max(1, Math.ceil(total / limit))
            }
        });
    } catch (error) {
        console.error('Get global notification logs error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch notification logs'
        });
    }
});

module.exports = router;
