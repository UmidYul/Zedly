const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { query } = require('../config/database');
const { generateTokens, verifyRefreshToken, generateAccessToken } = require('../utils/jwt');
const { authenticate } = require('../middleware/auth');
const { issueCsrfToken } = require('../middleware/csrf');
const {
    CSRF_COOKIE_NAME,
    REFRESH_COOKIE_NAME,
    setAuthCookies,
    setTempAuthCookie,
    clearAuthCookies,
    clearCsrfCookie,
    getCookieValue
} = require('../utils/cookies');
const { sendVerificationCodeEmail, isEmailConfigured, sendEmail } = require('../utils/notifications');

const router = express.Router();

function isTokenAuthFlow(req) {
    const base = String(req.baseUrl || '').toLowerCase();
    return base.includes('/auth/token');
}

function isSessionAuthFlow(req) {
    return !isTokenAuthFlow(req);
}

router.get('/csrf-token', (req, res) => {
    const existingToken = getCookieValue(req, CSRF_COOKIE_NAME);
    const csrfToken = existingToken || issueCsrfToken(req, res);
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.json({ csrf_token: csrfToken });
});

function getUserSettings(rawSettings) {
    if (!rawSettings) return {};
    if (typeof rawSettings === 'object' && !Array.isArray(rawSettings)) {
        return rawSettings;
    }
    if (typeof rawSettings === 'string') {
        try {
            const parsed = JSON.parse(rawSettings);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed;
            }
        } catch (error) {
            return {};
        }
    }
    return {};
}

function normalizeNotificationPreferences(prefs) {
    const defaults = {
        channels: {
            in_app: true,
            email: true,
            telegram: true
        },
        events: {
            new_test: true,
            test_results: true,
            assignment_deadline: true,
            password_reset: true,
            profile_updates: true,
            system_updates: false,
            welcome: true,
            digest_summary: true
        },
        frequency: 'instant'
    };

    if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) {
        return defaults;
    }

    const normalized = JSON.parse(JSON.stringify(defaults));
    const channels = prefs.channels || {};
    const events = prefs.events || {};

    for (const key of Object.keys(normalized.channels)) {
        if (channels[key] !== undefined) {
            normalized.channels[key] = !!channels[key];
        }
    }

    for (const key of Object.keys(normalized.events)) {
        if (events[key] !== undefined) {
            normalized.events[key] = !!events[key];
        }
    }

    const allowedFrequency = new Set(['instant', 'daily', 'weekly']);
    if (allowedFrequency.has(String(prefs.frequency || '').toLowerCase())) {
        normalized.frequency = String(prefs.frequency).toLowerCase();
    }

    return normalized;
}

function normalizePersonalInfo(info) {
    if (!info || typeof info !== 'object' || Array.isArray(info)) {
        return {};
    }

    const normalized = {};

    if (info.date_of_birth !== undefined) {
        const rawDate = String(info.date_of_birth || '').trim();
        if (!rawDate) {
            normalized.date_of_birth = null;
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
            normalized.date_of_birth = rawDate;
        }
    }

    if (info.gender !== undefined) {
        const rawGender = String(info.gender || '').trim().toLowerCase();
        const allowed = new Set(['male', 'female', 'other', '']);
        if (allowed.has(rawGender)) {
            normalized.gender = rawGender || null;
        }
    }

    return normalized;
}

function generateVerificationCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

function hashVerificationCode(code) {
    return crypto.createHash('sha256').update(String(code)).digest('hex');
}

// Rate limiting for login attempts
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: {
        error: 'too_many_attempts',
        message: 'Too many login attempts. Please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

/**
 * POST /api/auth/login
 * Login endpoint
 */
router.post('/login', loginLimiter, async (req, res) => {
    try {
        const { username, password, remember } = req.body;
        const normalizedUsername = String(username || '').trim();
        const rawPassword = String(password || '');
        const trimmedPassword = rawPassword.trim();
        const tokenFlow = isTokenAuthFlow(req);

        // Validation
        if (!normalizedUsername || !rawPassword) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Username and password are required'
            });
        }

        if (normalizedUsername.length < 3) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Username must be at least 3 characters'
            });
        }

        if (trimmedPassword.length < 6) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Password must be at least 6 characters'
            });
        }

        // Find user
        const result = await query(
            `SELECT id, username, password_hash, role, school_id, is_active, first_name, last_name, must_change_password, token_version
             FROM users
             WHERE username = $1`,
            [normalizedUsername]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                error: 'invalid_credentials',
                message: 'Invalid username or password'
            });
        }

        const user = result.rows[0];

        // Check if account is active
        if (!user.is_active) {
            return res.status(403).json({
                error: 'account_disabled',
                message: 'Your account has been disabled. Please contact an administrator.'
            });
        }

        // Verify password as-is first; if user pasted with extra spaces, retry trimmed value.
        let passwordMatch = await bcrypt.compare(rawPassword, user.password_hash);
        if (!passwordMatch && trimmedPassword !== rawPassword) {
            passwordMatch = await bcrypt.compare(trimmedPassword, user.password_hash);
        }

        if (!passwordMatch) {
            return res.status(401).json({
                error: 'invalid_credentials',
                message: 'Invalid username or password'
            });
        }

        // Check if user must change password
        if (user.must_change_password) {
            // Generate a temporary token for password change only
            const tempToken = generateAccessToken({
                id: user.id,
                username: user.username,
                role: user.role,
                school_id: user.school_id,
                temp: true
            });

            if (isSessionAuthFlow(req)) {
                clearAuthCookies(req, res);
                setTempAuthCookie(req, res, tempToken);
            }

            const payload = {
                must_change_password: true,
                user: {
                    id: user.id,
                    username: user.username,
                    role: user.role,
                    full_name: `${user.first_name || ''} ${user.last_name || ''}`.trim()
                }
            };

            if (tokenFlow) {
                payload.temp_access_token = tempToken;
                payload.token_type = 'Bearer';
            }

            return res.status(200).json(payload);
        }

        // Generate tokens
        const tokens = generateTokens({
            id: user.id,
            username: user.username,
            role: user.role,
            school_id: user.school_id,
            token_version: user.token_version
        });
        if (isSessionAuthFlow(req)) {
            setAuthCookies(req, res, {
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                remember: !!remember
            });
        }

        // Update last login
        await query(
            'UPDATE users SET last_login = NOW() WHERE id = $1',
            [user.id]
        );

        // Log successful login
        await query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [
                user.id,
                'login',
                'user',
                user.id,
                JSON.stringify({ ip: req.ip, user_agent: req.headers['user-agent'] })
            ]
        );

        // Return user info and tokens
        const payload = {
            message: 'Login successful',
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                school_id: user.school_id,
                full_name: `${user.first_name || ''} ${user.last_name || ''}`.trim()
            }
        };

        if (tokenFlow) {
            payload.access_token = tokens.access_token;
            payload.refresh_token = tokens.refresh_token;
            payload.token_type = 'Bearer';
        }

        res.json(payload);
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'An error occurred during login'
        });
    }
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', async (req, res) => {
    try {
        const tokenFlow = isTokenAuthFlow(req);
        const refresh_token = tokenFlow
            ? req.body?.refresh_token
            : (req.body?.refresh_token || getCookieValue(req, REFRESH_COOKIE_NAME));

        if (!refresh_token) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Refresh token is required'
            });
        }

        // Verify refresh token
        let decoded;
        try {
            decoded = verifyRefreshToken(refresh_token);
        } catch (error) {
            return res.status(401).json({
                error: 'invalid_token',
                message: error.message
            });
        }

        // Verify user still exists and is active
        const result = await query(
            `SELECT id, username, role, school_id, is_active, must_change_password, token_version
             FROM users
             WHERE id = $1`,
            [decoded.id]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                error: 'user_not_found',
                message: 'User no longer exists'
            });
        }

        const user = result.rows[0];

        if (!user.is_active) {
            return res.status(403).json({
                error: 'account_disabled',
                message: 'Your account has been disabled'
            });
        }

        if (user.must_change_password) {
            return res.status(403).json({
                error: 'password_change_required',
                message: 'You must change your password before requesting a new access token'
            });
        }

        if ((decoded.token_version ?? 0) !== (user.token_version ?? 0)) {
            return res.status(401).json({
                error: 'invalid_token',
                message: 'Refresh token is no longer valid'
            });
        }

        // Generate new access token
        const access_token = generateAccessToken({
            id: user.id,
            username: user.username,
            role: user.role,
            school_id: user.school_id,
            token_version: user.token_version
        });

        if (isSessionAuthFlow(req)) {
            setAuthCookies(req, res, {
                accessToken: access_token,
                refreshToken: refresh_token,
                remember: true
            });
        }

        const payload = { access_token };
        if (tokenFlow) {
            payload.refresh_token = refresh_token;
            payload.token_type = 'Bearer';
        }

        res.json(payload);
    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'An error occurred while refreshing token'
        });
    }
});

/**
 * POST /api/auth/logout
 * Logout endpoint (client should delete tokens)
 */
router.post('/logout', authenticate, async (req, res) => {
    try {
        const tokenFlow = isTokenAuthFlow(req);
        await query(
            `UPDATE users
             SET token_version = token_version + 1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [req.user.id]
        );

        // Log logout event
        await query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id)
             VALUES ($1, $2, $3, $4)`,
            [req.user.id, 'logout', 'user', req.user.id]
        );

        if (isSessionAuthFlow(req)) {
            clearAuthCookies(req, res);
            clearCsrfCookie(req, res);
        }

        res.json({
            message: tokenFlow ? 'Token logout successful' : 'Logout successful'
        });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'An error occurred during logout'
        });
    }
});

/**
 * POST /api/auth/change-password
 * Change password (for users with must_change_password flag)
 */
router.post('/change-password', authenticate, async (req, res) => {
    try {
        const { old_password, new_password } = req.body;

        // Validation
        if (!old_password || !new_password) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Old password and new password are required'
            });
        }

        if (new_password.length < 8) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'New password must be at least 8 characters'
            });
        }

        // Password strength validation
        const hasUpperCase = /[A-Z]/.test(new_password);
        const hasLowerCase = /[a-z]/.test(new_password);
        const hasNumber = /[0-9]/.test(new_password);

        if (!hasUpperCase || !hasLowerCase || !hasNumber) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number'
            });
        }

        // Get user's current password
        const result = await query(
            'SELECT id, username, role, school_id, password_hash, must_change_password, token_version FROM users WHERE id = $1',
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'user_not_found',
                message: 'User not found'
            });
        }

        const user = result.rows[0];

        // Verify old password
        const passwordMatch = await bcrypt.compare(old_password, user.password_hash);

        if (!passwordMatch) {
            return res.status(401).json({
                error: 'invalid_password',
                message: 'Current password is incorrect'
            });
        }

        // Check if new password is same as old
        const samePassword = await bcrypt.compare(new_password, user.password_hash);

        if (samePassword) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'New password must be different from current password'
            });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(new_password, 10);

        // Update password, revoke old refresh tokens, and remove must_change_password flag
        const updateResult = await query(
            `UPDATE users 
             SET password_hash = $1, 
                 must_change_password = false, 
                 token_version = token_version + 1,
                 updated_at = CURRENT_TIMESTAMP 
             WHERE id = $2
             RETURNING id, username, role, school_id, token_version`,
            [hashedPassword, req.user.id]
        );

        // Log action
        await query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [
                req.user.id,
                'update',
                'user',
                req.user.id,
                { action_type: 'password_change', changed_by: 'self' }
            ]
        );

        // Generate new tokens
        const tokens = generateTokens({
            id: updateResult.rows[0].id,
            username: updateResult.rows[0].username,
            role: updateResult.rows[0].role,
            school_id: updateResult.rows[0].school_id,
            token_version: updateResult.rows[0].token_version
        });
        setAuthCookies(req, res, {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            remember: true
        });

        res.json({
            message: 'Password changed successfully'
        });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to change password'
        });
    }
});

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', authenticate, async (req, res) => {
    try {
        const result = await query(
            `SELECT id, username, role, school_id, first_name, last_name, email, phone, telegram_id, settings, created_at, last_login
             FROM users
             WHERE id = $1`,
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'user_not_found',
                message: 'User not found'
            });
        }

        const user = result.rows[0];
        const settings = getUserSettings(user.settings);
        const profileSettings = settings.profile || {};
        const contactVerification = profileSettings.contact_verification || {};

        res.json({
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                school_id: user.school_id,
                first_name: user.first_name,
                last_name: user.last_name,
                email: user.email,
                phone: user.phone,
                telegram_id: user.telegram_id,
                settings: settings,
                date_of_birth: profileSettings?.personal_info?.date_of_birth || null,
                gender: profileSettings?.personal_info?.gender || null,
                email_verified: !!contactVerification.email_verified,
                phone_verified: !!contactVerification.phone_verified,
                created_at: user.created_at,
                last_login: user.last_login
            }
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'An error occurred while fetching user info'
        });
    }
});

/**
 * GET /api/auth/profile/activity
 * Get own activity history (logins, profile/security actions)
 */
router.get('/profile/activity', authenticate, async (req, res) => {
    try {
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

        const result = await query(
            `SELECT id, action, entity_type, entity_id, details, created_at
             FROM audit_logs
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT $2`,
            [req.user.id, limit]
        );

        res.json({ activity: result.rows });
    } catch (error) {
        console.error('Get profile activity error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to fetch activity history'
        });
    }
});

/**
 * PUT /api/auth/profile/settings
 * Update own profile settings (notification preferences + personal info)
 */
router.put('/profile/settings', authenticate, async (req, res) => {
    try {
        const { notification_preferences, personal_info } = req.body;

        const userResult = await query(
            'SELECT id, settings FROM users WHERE id = $1',
            [req.user.id]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({
                error: 'user_not_found',
                message: 'User not found'
            });
        }

        const settings = getUserSettings(userResult.rows[0].settings);
        const profileSettings = settings.profile || {};

        const nextProfileSettings = {
            ...profileSettings,
            updated_at: new Date().toISOString()
        };

        if (notification_preferences !== undefined) {
            nextProfileSettings.notification_preferences = normalizeNotificationPreferences(notification_preferences);
        }

        if (personal_info !== undefined) {
            nextProfileSettings.personal_info = {
                ...(profileSettings.personal_info || {}),
                ...normalizePersonalInfo(personal_info)
            };
        }

        const nextSettings = {
            ...settings,
            profile: nextProfileSettings
        };

        await query(
            `UPDATE users
             SET settings = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [nextSettings, req.user.id]
        );

        await query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [
                req.user.id,
                'update',
                'user',
                req.user.id,
                { action_type: 'profile_settings_update' }
            ]
        );

        res.json({
            message: 'Profile settings updated successfully',
            profile: nextProfileSettings
        });
    } catch (error) {
        console.error('Update profile settings error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to update profile settings'
        });
    }
});

/**
 * POST /api/auth/profile/contact/request-change
 * Request email change with verification code
 */
router.post('/profile/contact/request-change', authenticate, async (req, res) => {
    try {
        const { type, value } = req.body;
        const contactType = String(type || '').trim().toLowerCase();
        const rawValue = String(value || '').trim();

        if (contactType !== 'email') {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Only email verification is supported'
            });
        }

        if (!rawValue) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Contact value is required'
            });
        }

        if (contactType === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawValue)) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Invalid email format'
            });
        }

        const duplicateResult = await query(
            `SELECT id
             FROM users
             WHERE email = $1 AND id != $2
             LIMIT 1`,
            [rawValue, req.user.id]
        );

        if (duplicateResult.rows.length > 0) {
            return res.status(409).json({
                error: 'duplicate_error',
                message: 'Email is already in use'
            });
        }

        const userResult = await query(
            'SELECT id, first_name, email, phone, settings FROM users WHERE id = $1',
            [req.user.id]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({
                error: 'user_not_found',
                message: 'User not found'
            });
        }

        const user = userResult.rows[0];
        const settings = getUserSettings(user.settings);
        const profileSettings = settings.profile || {};
        const verification = profileSettings.contact_verification || {};
        const pending = verification.pending || {};
        const verifiedFlag = !!verification.email_verified;
        const currentValue = String(user.email || '').trim();
        const normalizedCurrent = currentValue.toLowerCase();
        const normalizedInput = rawValue.toLowerCase();

        if (normalizedCurrent && normalizedCurrent === normalizedInput && verifiedFlag) {
            return res.status(409).json({
                error: 'already_connected',
                message: 'Email is already connected to your account'
            });
        }

        if (!isEmailConfigured()) {
            return res.status(503).json({
                error: 'email_not_configured',
                message: 'SMTP is not configured on server'
            });
        }

        const code = generateVerificationCode();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

        let emailSent = false;
        try {
            emailSent = await sendVerificationCodeEmail({
                to: rawValue,
                code,
                firstName: user.first_name,
                expiresMinutes: 10
            });
        } catch (emailError) {
            console.error('Email verification send error:', emailError);
            emailSent = false;
        }

        if (!emailSent) {
            return res.status(502).json({
                error: 'email_send_failed',
                message: 'Failed to send verification code email'
            });
        }

        const nextVerification = {
            ...verification,
            pending: {
                ...pending,
                email: {
                    value: rawValue,
                    code_hash: hashVerificationCode(code),
                    expires_at: expiresAt
                }
            }
        };

        const nextSettings = {
            ...settings,
            profile: {
                ...profileSettings,
                contact_verification: nextVerification
            }
        };

        await query(
            `UPDATE users
             SET settings = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [nextSettings, req.user.id]
        );

        await query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [
                req.user.id,
                'update',
                'user',
                req.user.id,
                { action_type: 'email_change_requested' }
            ]
        );

        res.json({
            message: 'Email verification code sent',
            expires_at: expiresAt
        });
    } catch (error) {
        console.error('Request contact change error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to request contact change'
        });
    }
});

/**
 * POST /api/auth/profile/contact/verify
 * Verify email change code and apply new email value
 */
router.post('/profile/contact/verify', authenticate, async (req, res) => {
    try {
        const { type, code } = req.body;
        const contactType = String(type || '').trim().toLowerCase();
        const codeValue = String(code || '').trim();

        if (contactType !== 'email' || !codeValue) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Email type and verification code are required'
            });
        }

        const userResult = await query(
            'SELECT id, settings FROM users WHERE id = $1',
            [req.user.id]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({
                error: 'user_not_found',
                message: 'User not found'
            });
        }

        const settings = getUserSettings(userResult.rows[0].settings);
        const profileSettings = settings.profile || {};
        const verification = profileSettings.contact_verification || {};
        const pending = verification.pending || {};
        const pendingEntry = pending.email;

        if (!pendingEntry || !pendingEntry.value || !pendingEntry.code_hash || !pendingEntry.expires_at) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'No pending verification found'
            });
        }

        if (Date.now() > new Date(pendingEntry.expires_at).getTime()) {
            return res.status(400).json({
                error: 'verification_expired',
                message: 'Verification code has expired'
            });
        }

        if (hashVerificationCode(codeValue) !== pendingEntry.code_hash) {
            return res.status(400).json({
                error: 'invalid_code',
                message: 'Invalid verification code'
            });
        }

        const nextVerification = {
            ...verification,
            pending: {
                ...pending,
                email: null
            },
            email_verified: true
        };

        const nextSettings = {
            ...settings,
            profile: {
                ...profileSettings,
                contact_verification: nextVerification
            }
        };

        await query(
            `UPDATE users
             SET email = $1,
                 settings = $2,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $3`,
            [pendingEntry.value, nextSettings, req.user.id]
        );

        await query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [
                req.user.id,
                'update',
                'user',
                req.user.id,
                { action_type: 'email_verified_and_updated' }
            ]
        );

        res.json({
            message: 'Email updated successfully',
            email: pendingEntry.value
        });
    } catch (error) {
        console.error('Verify contact change error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to verify contact change'
        });
    }
});

/**
 * POST /api/auth/profile/contact/test-email
 * Send a test email (or test verification code) to current user's email
 */
router.post('/profile/contact/test-email', authenticate, async (req, res) => {
    try {
        if (!isEmailConfigured()) {
            return res.status(503).json({
                error: 'email_not_configured',
                message: 'SMTP is not configured on server'
            });
        }

        const userResult = await query(
            'SELECT id, email, first_name FROM users WHERE id = $1',
            [req.user.id]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({
                error: 'user_not_found',
                message: 'User not found'
            });
        }

        const user = userResult.rows[0];
        const bodyTo = String(req.body?.to || '').trim();
        const recipient = bodyTo || String(user.email || '').trim();

        if (!recipient) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'User email is not set'
            });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Invalid email format'
            });
        }

        if (process.env.NODE_ENV === 'production' && bodyTo && bodyTo !== user.email) {
            return res.status(403).json({
                error: 'forbidden',
                message: 'In production, test email can only be sent to your own email'
            });
        }

        const sendCode = req.body?.mode === 'code';
        const sent = sendCode
            ? await sendVerificationCodeEmail({
                to: recipient,
                code: generateVerificationCode(),
                firstName: user.first_name,
                expiresMinutes: 10
            })
            : await sendEmail({
                to: recipient,
                subject: 'ZEDLY: test email',
                text: 'This is a test email from ZEDLY. SMTP is configured and working.',
                html: '<p>This is a test email from <strong>ZEDLY</strong>. SMTP is configured and working.</p>'
            });

        if (!sent) {
            return res.status(502).json({
                error: 'email_send_failed',
                message: 'Failed to send email'
            });
        }

        res.json({
            message: 'Email sent successfully',
            to: recipient,
            mode: sendCode ? 'code' : 'plain'
        });
    } catch (error) {
        console.error('Test email send error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to send test email'
        });
    }
});

module.exports = router;
