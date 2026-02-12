const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { telegramBot, sendTelegram } = require('../utils/notifications');

const USERS_COLUMNS_CACHE = {
    loaded: false,
    hasSettings: false,
    hasUpdatedAt: false
};
const TELEGRAM_LINK_TTL_MS = 15 * 60 * 1000;
const pendingLinkTokens = new Map();
const consumedLinkTokens = new Map();
let telegramStartListenerInitialized = false;

async function loadUsersColumns() {
    if (USERS_COLUMNS_CACHE.loaded) {
        return USERS_COLUMNS_CACHE;
    }

    const columnsResult = await query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'users'`
    );

    const columns = new Set(columnsResult.rows.map((row) => row.column_name));
    USERS_COLUMNS_CACHE.loaded = true;
    USERS_COLUMNS_CACHE.hasSettings = columns.has('settings');
    USERS_COLUMNS_CACHE.hasUpdatedAt = columns.has('updated_at');
    return USERS_COLUMNS_CACHE;
}

function createLinkToken(userId) {
    const expiresAt = Date.now() + TELEGRAM_LINK_TTL_MS;
    // 32-char URL-safe token (fits Telegram deep-link limit).
    const token = crypto.randomBytes(24).toString('base64url');
    pendingLinkTokens.set(token, { userId: String(userId), expiresAt });

    return {
        token,
        expiresAt
    };
}

function verifyLinkToken(token) {
    if (!token || typeof token !== 'string') {
        return { valid: false, reason: 'invalid' };
    }

    const cleanToken = token.trim();
    if (consumedLinkTokens.has(cleanToken)) {
        return { valid: false, reason: 'used' };
    }

    const tokenData = pendingLinkTokens.get(cleanToken);
    if (!tokenData) {
        return { valid: false, reason: 'invalid' };
    }

    const expiresAt = Number(tokenData.expiresAt);
    if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
        pendingLinkTokens.delete(cleanToken);
        return { valid: false, reason: 'expired' };
    }

    return { valid: true, userId: tokenData.userId, expiresAt };
}

function markTokenConsumed(token, expiresAt) {
    pendingLinkTokens.delete(token);
    consumedLinkTokens.set(token, expiresAt);
    const now = Date.now();
    for (const [savedToken, tokenData] of pendingLinkTokens.entries()) {
        if (Number(tokenData.expiresAt) < now) {
            pendingLinkTokens.delete(savedToken);
        }
    }
    for (const [savedToken, savedExp] of consumedLinkTokens.entries()) {
        if (savedExp < now - TELEGRAM_LINK_TTL_MS) {
            consumedLinkTokens.delete(savedToken);
        }
    }
}

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

async function connectTelegramByToken(chatId, token) {
    const verification = verifyLinkToken(token);
    if (!verification.valid) {
        return { ok: false, reason: verification.reason };
    }

    const userId = verification.userId;
    const state = await getCurrentUserTelegramState(userId);
    if (!state) {
        return { ok: false, reason: 'not_found' };
    }

    const duplicateCheck = await query(
        `SELECT id
         FROM users
         WHERE telegram_id = $1 AND id != $2
         LIMIT 1`,
        [String(chatId), userId]
    );

    if (duplicateCheck.rows.length > 0) {
        return { ok: false, reason: 'already_used' };
    }

    const normalizedPrefs = normalizePreferences(state.user.role, state.rawSettings?.telegram_notifications);
    const updatedSettings = {
        ...(state.rawSettings || {}),
        telegram_notifications: normalizedPrefs
    };
    const columns = await loadUsersColumns();

    if (columns.hasSettings && columns.hasUpdatedAt) {
        await query(
            `UPDATE users
             SET telegram_id = $1,
                 settings = $2,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $3`,
            [String(chatId), updatedSettings, userId]
        );
    } else if (columns.hasSettings) {
        await query(
            `UPDATE users
             SET telegram_id = $1,
                 settings = $2
             WHERE id = $3`,
            [String(chatId), updatedSettings, userId]
        );
    } else if (columns.hasUpdatedAt) {
        await query(
            `UPDATE users
             SET telegram_id = $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [String(chatId), userId]
        );
    } else {
        await query(
            `UPDATE users
             SET telegram_id = $1
             WHERE id = $2`,
            [String(chatId), userId]
        );
    }

    markTokenConsumed(token, verification.expiresAt);
    return { ok: true, username: state.user.username, role: state.user.role };
}

function initTelegramStartListener() {
    if (!telegramBot || telegramStartListenerInitialized) {
        return;
    }

    function extractStartTokenFromMessage(msg) {
        const rawText = (msg?.text || '').trim();
        if (!rawText) {
            return '';
        }

        // Handles "/start token", "/start@BotName token" and additional spaces/newlines
        const commandMatch = rawText.match(/^\/start(?:@\w+)?(?:\s+(.+))?$/i);
        if (commandMatch && commandMatch[1]) {
            return commandMatch[1].trim();
        }

        // Fallback using entities offsets (Telegram bot_command metadata)
        const commandEntity = Array.isArray(msg?.entities)
            ? msg.entities.find((entity) => entity.type === 'bot_command' && entity.offset === 0)
            : null;

        if (commandEntity && rawText.toLowerCase().startsWith('/start')) {
            const payload = rawText.slice(commandEntity.length).trim();
            return payload;
        }

        return '';
    }

    telegramStartListenerInitialized = true;
    telegramBot.onText(/^\/start(?:@\w+)?(?:\s+.*)?$/i, async (msg) => {
        const startToken = extractStartTokenFromMessage(msg);
        const chatId = msg.chat.id;
        console.log('Telegram /start received', {
            chat_id: chatId,
            text: msg.text,
            token_present: !!startToken,
            token_length: startToken ? startToken.length : 0
        });

        try {
            if (!startToken) {
                await sendTelegram(
                    chatId,
                    'Привет! Для привязки аккаунта вернитесь в кабинет ZEDLY и нажмите кнопку подключения Telegram еще раз, затем нажмите кнопку START по открывшейся ссылке.'
                );
                return;
            }

            const result = await connectTelegramByToken(chatId, startToken);
            if (!result.ok) {
                console.log('Telegram link connect failed', { chat_id: chatId, reason: result.reason });
                const reasonMessage = {
                    expired: 'Ссылка для подключения устарела. Вернитесь в кабинет и нажмите кнопку подключения заново.',
                    invalid: 'Неверная ссылка подключения. Запустите привязку заново из кабинета.',
                    used: 'Эта ссылка уже была использована. Запустите привязку заново из кабинета.',
                    not_found: 'Пользователь не найден. Попробуйте снова из кабинета.',
                    already_used: 'Этот Telegram уже привязан к другому аккаунту.'
                };
                await sendTelegram(chatId, reasonMessage[result.reason] || 'Не удалось завершить привязку. Попробуйте снова из кабинета.');
                return;
            }

            console.log('Telegram link connected', { chat_id: chatId, username: result.username, role: result.role });

            await sendTelegram(
                chatId,
                `✅ <b>Telegram подключен</b>\n\n👤 Пользователь: <b>${result.username}</b>\n🎓 Роль: <b>${result.role}</b>\n\nТеперь вы будете получать уведомления в Telegram.`
            );
        } catch (error) {
            console.error('Telegram /start link error:', error);
            await sendTelegram(chatId, 'Произошла ошибка при привязке. Попробуйте снова позже.');
        }
    });
}

initTelegramStartListener();

async function getCurrentUserTelegramState(userId) {
    const columns = await loadUsersColumns();
    const result = await query(
        `SELECT id, username, role, telegram_id, ${columns.hasSettings ? 'settings' : 'NULL::jsonb AS settings'}
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
            link_flow_supported: !!telegramBot && !!botInfo?.username,
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
 * POST /api/telegram/me/link/start
 * Start one-click Telegram link flow via bot deep-link
 */
router.post('/me/link/start', authenticate, async (req, res) => {
    try {
        console.log('Telegram link start requested', { user_id: req.user.id });
        if (!telegramBot) {
            return res.status(400).json({
                error: 'not_configured',
                message: 'Telegram bot is not configured'
            });
        }

        const botInfo = await telegramBot.getMe();
        if (!botInfo?.username) {
            return res.status(500).json({
                error: 'server_error',
                message: 'Telegram bot username is unavailable'
            });
        }

        const { token, expiresAt } = createLinkToken(req.user.id);
        const link = `https://t.me/${botInfo.username}?start=${encodeURIComponent(token)}`;

        res.json({
            link,
            token_expires_at: new Date(expiresAt).toISOString(),
            bot: {
                username: botInfo.username,
                first_name: botInfo.first_name || null
            }
        });
    } catch (error) {
        console.error('Telegram link start error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to start Telegram link flow'
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

        const columns = await loadUsersColumns();
        const trimmedTelegramId = String(telegram_id).trim();

        if (columns.hasSettings && columns.hasUpdatedAt) {
            await query(
                `UPDATE users
                 SET telegram_id = $1,
                     settings = $2,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $3`,
                [trimmedTelegramId, updatedSettings, req.user.id]
            );
        } else if (columns.hasSettings) {
            await query(
                `UPDATE users
                 SET telegram_id = $1,
                     settings = $2
                 WHERE id = $3`,
                [trimmedTelegramId, updatedSettings, req.user.id]
            );
        } else if (columns.hasUpdatedAt) {
            await query(
                `UPDATE users
                 SET telegram_id = $1,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $2`,
                [trimmedTelegramId, req.user.id]
            );
        } else {
            await query(
                `UPDATE users
                 SET telegram_id = $1
                 WHERE id = $2`,
                [trimmedTelegramId, req.user.id]
            );
        }

        res.json({
            message: 'Telegram connected successfully',
            telegram_id: trimmedTelegramId,
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

        const columns = await loadUsersColumns();
        if (!columns.hasSettings) {
            return res.status(501).json({
                error: 'schema_error',
                message: 'User settings column is not available in this database schema'
            });
        }

        if (columns.hasUpdatedAt) {
            await query(
                `UPDATE users
                 SET settings = $1,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $2`,
                [updatedSettings, req.user.id]
            );
        } else {
            await query(
                `UPDATE users
                 SET settings = $1
                 WHERE id = $2`,
                [updatedSettings, req.user.id]
            );
        }

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
        const columns = await loadUsersColumns();
        if (columns.hasUpdatedAt) {
            await query(
                `UPDATE users
                 SET telegram_id = NULL,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [req.user.id]
            );
        } else {
            await query(
                `UPDATE users
                 SET telegram_id = NULL
                 WHERE id = $1`,
                [req.user.id]
            );
        }

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
