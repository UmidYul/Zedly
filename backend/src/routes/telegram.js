const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { telegramBot, sendTelegram } = require('../utils/notifications');

const ROLE_EVENT_MAP = {
    student: [
        { key: 'new_test', label: 'Новый тест', description: 'Когда учитель назначает вам новый тест' },
        { key: 'password_reset', label: 'Сброс пароля', description: 'Когда пароль был сброшен администратором' },
        { key: 'welcome', label: 'Приветственное сообщение', description: 'При создании аккаунта' }
    ],
    teacher: [
        { key: 'password_reset', label: 'Сброс пароля', description: 'Когда пароль был сброшен администратором' },
        { key: 'welcome', label: 'Приветственное сообщение', description: 'При создании аккаунта' }
    ],
    school_admin: [
        { key: 'password_reset', label: 'Сброс пароля', description: 'Когда пароль был сброшен superadmin' },
        { key: 'welcome', label: 'Приветственное сообщение', description: 'При создании аккаунта' }
    ],
    superadmin: [
        { key: 'password_reset', label: 'Сброс пароля', description: 'Когда пароль был сброшен вручную' },
        { key: 'welcome', label: 'Приветственное сообщение', description: 'При создании аккаунта' }
    ]
};

function getDefaultRolePreferences(role) {
    const events = ROLE_EVENT_MAP[role] || ROLE_EVENT_MAP.teacher;
    const defaults = { enabled: true };
    for (const event of events) {
        defaults[event.key] = true;
    }
    return defaults;
}

function normalizePreferences(role, incoming) {
    const defaults = getDefaultRolePreferences(role);
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
        return defaults;
    }

    const normalized = { ...defaults };
    if (incoming.enabled !== undefined) {
        normalized.enabled = !!incoming.enabled;
    }

    for (const key of Object.keys(defaults)) {
        if (key === 'enabled') continue;
        if (incoming[key] !== undefined) {
            normalized[key] = !!incoming[key];
        }
    }

    return normalized;
}

async function getCurrentUserTelegramState(userId) {
    const result = await query(
        `SELECT id, username, role, telegram_id, settings
         FROM users
         WHERE id = $1`,
        [userId]
    );

    if (result.rows.length === 0) {
        return null;
    }

    const user = result.rows[0];
    const rawSettings = user.settings && typeof user.settings === 'object' ? user.settings : {};
    const saved = rawSettings.telegram_notifications;
    const preferences = normalizePreferences(user.role, saved);

    return { user, rawSettings, preferences };
}

/**
 * GET /api/telegram/me/status
 * Self-service status for any authenticated user
 */
router.get('/me/status', authenticate, async (req, res) => {
    try {
        const state = await getCurrentUserTelegramState(req.user.id);
        if (!state) {
            return res.status(404).json({
                error: 'not_found',
                message: 'User not found'
            });
        }

        let botInfo = null;
        if (process.env.TELEGRAM_BOT_TOKEN && telegramBot) {
            try {
                botInfo = await telegramBot.getMe();
            } catch (error) {
                botInfo = null;
            }
        }

        const roleEvents = ROLE_EVENT_MAP[state.user.role] || ROLE_EVENT_MAP.teacher;

        res.json({
            configured: !!process.env.TELEGRAM_BOT_TOKEN && !!telegramBot,
            connected: !!state.user.telegram_id,
            role: state.user.role,
            telegram_id: state.user.telegram_id,
            bot: {
                username: botInfo?.username || null,
                first_name: botInfo?.first_name || null
            },
            preferences: state.preferences,
            events: roleEvents
        });
    } catch (error) {
        console.error('Telegram self status error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to load Telegram status'
        });
    }
});

/**
 * POST /api/telegram/me/connect
 * Connect current user Telegram and save role-based preferences
 */
router.post('/me/connect', authenticate, async (req, res) => {
    try {
        const { telegram_id, preferences } = req.body;
        if (!telegram_id || String(telegram_id).trim().length < 4) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'telegram_id is required'
            });
        }

        const state = await getCurrentUserTelegramState(req.user.id);
        if (!state) {
            return res.status(404).json({
                error: 'not_found',
                message: 'User not found'
            });
        }

        const normalizedPrefs = normalizePreferences(state.user.role, preferences);
        const updatedSettings = {
            ...(state.rawSettings || {}),
            telegram_notifications: normalizedPrefs
        };

        await query(
            `UPDATE users
             SET telegram_id = $1,
                 settings = $2,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $3`,
            [String(telegram_id).trim(), updatedSettings, req.user.id]
        );

        res.json({
            message: 'Telegram connected successfully',
            telegram_id: String(telegram_id).trim(),
            preferences: normalizedPrefs
        });
    } catch (error) {
        console.error('Telegram connect error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to connect Telegram'
        });
    }
});

/**
 * PUT /api/telegram/me/preferences
 * Update notification preferences by role for current user
 */
router.put('/me/preferences', authenticate, async (req, res) => {
    try {
        const { preferences } = req.body;
        const state = await getCurrentUserTelegramState(req.user.id);
        if (!state) {
            return res.status(404).json({
                error: 'not_found',
                message: 'User not found'
            });
        }

        const normalizedPrefs = normalizePreferences(state.user.role, preferences);
        const updatedSettings = {
            ...(state.rawSettings || {}),
            telegram_notifications: normalizedPrefs
        };

        await query(
            `UPDATE users
             SET settings = $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [updatedSettings, req.user.id]
        );

        res.json({
            message: 'Telegram preferences updated',
            preferences: normalizedPrefs
        });
    } catch (error) {
        console.error('Telegram preferences update error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to update Telegram preferences'
        });
    }
});

/**
 * DELETE /api/telegram/me/disconnect
 * Disconnect Telegram from current user
 */
router.delete('/me/disconnect', authenticate, async (req, res) => {
    try {
        await query(
            `UPDATE users
             SET telegram_id = NULL,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [req.user.id]
        );

        res.json({
            message: 'Telegram disconnected successfully'
        });
    } catch (error) {
        console.error('Telegram disconnect error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to disconnect Telegram'
        });
    }
});

/**
 * POST /api/telegram/me/test
 * Send test Telegram message to connected account
 */
router.post('/me/test', authenticate, async (req, res) => {
    try {
        const state = await getCurrentUserTelegramState(req.user.id);
        if (!state) {
            return res.status(404).json({
                error: 'not_found',
                message: 'User not found'
            });
        }

        if (!state.user.telegram_id) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Telegram is not connected'
            });
        }

        const testMessage = [
            '🤖 <b>ZEDLY Telegram подключен</b>',
            `✅ Роль: <b>${state.user.role}</b>`,
            `👤 Пользователь: <b>${state.user.username}</b>`,
            `📅 ${new Date().toLocaleString('ru-RU')}`
        ].join('\n');

        const success = await sendTelegram(state.user.telegram_id, testMessage);
        if (!success) {
            return res.status(500).json({
                error: 'server_error',
                message: 'Failed to send test message'
            });
        }

        res.json({
            success: true,
            message: 'Test message sent'
        });
    } catch (error) {
        console.error('Telegram self test error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to send test message'
        });
    }
});

/**
 * GET /api/telegram/status
 * Check Telegram bot connection status (admin-only diagnostics)
 */
router.get('/status', authenticate, authorize('superadmin', 'school_admin'), async (req, res) => {
    try {
        if (!process.env.TELEGRAM_BOT_TOKEN) {
            return res.json({
                configured: false,
                connected: false,
                message: 'Telegram bot token not configured in .env file',
                details: {
                    token: false,
                    bot: null
                }
            });
        }

        if (!telegramBot) {
            return res.json({
                configured: true,
                connected: false,
                message: 'Telegram bot failed to initialize',
                details: {
                    token: true,
                    bot: false
                }
            });
        }

        try {
            const botInfo = await telegramBot.getMe();
            return res.json({
                configured: true,
                connected: true,
                message: 'Telegram bot is connected and working',
                details: {
                    token: true,
                    bot: true,
                    info: {
                        username: botInfo.username,
                        first_name: botInfo.first_name,
                        id: botInfo.id,
                        can_join_groups: botInfo.can_join_groups,
                        can_read_all_group_messages: botInfo.can_read_all_group_messages,
                        supports_inline_queries: botInfo.supports_inline_queries
                    }
                }
            });
        } catch (botError) {
            return res.json({
                configured: true,
                connected: false,
                message: 'Failed to connect to Telegram API',
                error: botError.message,
                details: {
                    token: true,
                    bot: false,
                    error: botError.message
                }
            });
        }
    } catch (error) {
        console.error('Telegram status check error:', error);
        res.status(500).json({
            configured: false,
            connected: false,
            message: 'Error checking Telegram bot status',
            error: error.message
        });
    }
});

/**
 * POST /api/telegram/test
 * Send a test message to verify Telegram bot (admin-only diagnostics)
 */
router.post('/test', authenticate, authorize('superadmin', 'school_admin'), async (req, res) => {
    try {
        const { chat_id } = req.body;

        if (!chat_id) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'chat_id is required'
            });
        }

        const testMessage = `🤖 <b>ZEDLY Test Message</b>\n\n✅ Ваш Telegram бот работает!\n📅 ${new Date().toLocaleString('ru-RU')}`;
        const success = await sendTelegram(chat_id, testMessage);

        if (success) {
            res.json({
                success: true,
                message: 'Test message sent successfully',
                chat_id: chat_id
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Failed to send test message',
                chat_id: chat_id
            });
        }
    } catch (error) {
        console.error('Telegram test message error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to send test message',
            details: error.message
        });
    }
});

/**
 * GET /api/telegram/webhook
 * Get current webhook info (superadmin diagnostics)
 */
router.get('/webhook', authenticate, authorize('superadmin'), async (req, res) => {
    try {
        if (!telegramBot) {
            return res.status(400).json({
                error: 'not_configured',
                message: 'Telegram bot not configured'
            });
        }

        const webhookInfo = await telegramBot.getWebHookInfo();
        res.json({ webhook: webhookInfo });
    } catch (error) {
        console.error('Get webhook info error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to get webhook info',
            details: error.message
        });
    }
});

module.exports = router;
