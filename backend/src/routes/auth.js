const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const { query } = require('../config/database');
const { generateTokens, verifyRefreshToken, generateAccessToken } = require('../utils/jwt');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

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

        // Validation
        if (!username || !password) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Username and password are required'
            });
        }

        if (username.length < 3) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Username must be at least 3 characters'
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Password must be at least 6 characters'
            });
        }

        // Find user
        const result = await query(
            `SELECT id, username, password_hash, role, school_id, is_active, first_name, last_name
             FROM users
             WHERE username = $1`,
            [username]
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

        // Verify password
        const passwordMatch = await bcrypt.compare(password, user.password_hash);

        if (!passwordMatch) {
            return res.status(401).json({
                error: 'invalid_credentials',
                message: 'Invalid username or password'
            });
        }

        // Generate tokens
        const tokens = generateTokens({
            id: user.id,
            username: user.username,
            role: user.role,
            school_id: user.school_id
        });

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
        res.json({
            message: 'Login successful',
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                school_id: user.school_id,
                full_name: `${user.first_name || ''} ${user.last_name || ''}`.trim()
            },
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token // Always send refresh token
        });
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
        const { refresh_token } = req.body;

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
            'SELECT id, username, role, school_id, is_active FROM users WHERE id = $1',
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

        // Generate new access token
        const access_token = generateAccessToken({
            id: user.id,
            username: user.username,
            role: user.role,
            school_id: user.school_id
        });

        res.json({
            access_token
        });
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
        // Log logout event
        await query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id)
             VALUES ($1, $2, $3, $4)`,
            [req.user.id, 'logout', 'user', req.user.id]
        );

        res.json({
            message: 'Logout successful'
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
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', authenticate, async (req, res) => {
    try {
        const result = await query(
            `SELECT id, username, role, school_id, first_name, last_name, email, created_at, last_login
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

        res.json({
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                school_id: user.school_id,
                first_name: user.first_name,
                last_name: user.last_name,
                email: user.email,
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

module.exports = router;
