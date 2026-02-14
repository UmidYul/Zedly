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
const PHONE_REQUEST_TTL_MS = 10 * 60 * 1000;
const PHONE_REQUEST_RESULT_TTL_MS = 5 * 60 * 1000;
const consumedLinkTokens = new Map();
const phoneRequests = new Map();
const activePhoneRequestByUser = new Map();
let telegramStartListenerInitialized = false;

function getAppUrl() {
    const raw = process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:5000';
    return raw.replace(/\/+$/, '').replace(/\/api$/i, '');
}

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
    const payload = {
        user_id: String(userId),
        expires_at: expiresAt
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const secret = process.env.TELEGRAM_LINK_SECRET || process.env.JWT_SECRET || 'zedly-telegram-link-secret';
    const signature = crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
    const token = `${encodedPayload}.${signature}`;

    return {
        token,
        expiresAt
    };
}

function createLinkTokenWithPayload(userId, payload = {}) {
    const expiresAt = Date.now() + TELEGRAM_LINK_TTL_MS;
    const safePayload = payload && typeof payload === 'object' ? payload : {};
    const tokenPayload = {
        user_id: String(userId),
        expires_at: expiresAt,
        payload: safePayload
    };
    const encodedPayload = Buffer.from(JSON.stringify(tokenPayload), 'utf8').toString('base64url');
    const secret = process.env.TELEGRAM_LINK_SECRET || process.env.JWT_SECRET || 'zedly-telegram-link-secret';
    const signature = crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
    const token = `${encodedPayload}.${signature}`;
    return { token, expiresAt };
}

function verifyLinkToken(token) {
    if (!token || typeof token !== 'string') {
        return { valid: false, reason: 'invalid' };
    }

    const cleanToken = token.trim();
    if (consumedLinkTokens.has(cleanToken)) {
        return { valid: false, reason: 'used' };
    }
    const tokenParts = cleanToken.split('.');
    if (tokenParts.length !== 2) {
        return { valid: false, reason: 'invalid' };
    }

    const [encodedPayload, receivedSignature] = tokenParts;
    const secret = process.env.TELEGRAM_LINK_SECRET || process.env.JWT_SECRET || 'zedly-telegram-link-secret';
    const expectedSignature = crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
    if (!expectedSignature || !receivedSignature) {
        return { valid: false, reason: 'invalid' };
    }
    const expectedBuf = Buffer.from(expectedSignature);
    const receivedBuf = Buffer.from(receivedSignature);
    if (expectedBuf.length !== receivedBuf.length || !crypto.timingSafeEqual(expectedBuf, receivedBuf)) {
        return { valid: false, reason: 'invalid' };
    }

    let tokenData = null;
    try {
        tokenData = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    } catch (error) {
        return { valid: false, reason: 'invalid' };
    }

    const expiresAt = Number(tokenData?.expires_at);
    if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
        return { valid: false, reason: 'expired' };
    }
    const userId = String(tokenData?.user_id || '').trim();
    if (!userId) {
        return { valid: false, reason: 'invalid' };
    }
    const payload = tokenData.payload && typeof tokenData.payload === 'object' ? tokenData.payload : {};
    return { valid: true, userId, expiresAt, payload };
}

function markTokenConsumed(token, expiresAt) {
    consumedLinkTokens.set(token, expiresAt);
    const now = Date.now();
    for (const [savedToken, savedExp] of consumedLinkTokens.entries()) {
        if (savedExp < now - TELEGRAM_LINK_TTL_MS) {
            consumedLinkTokens.delete(savedToken);
        }
    }
}

function cleanupPhoneRequests() {
    const now = Date.now();
    for (const [requestId, requestState] of phoneRequests.entries()) {
        if (!requestState || Number(requestState.expiresAt) <= now) {
            phoneRequests.delete(requestId);
        }
    }
    for (const [userId, requestId] of activePhoneRequestByUser.entries()) {
        const requestState = phoneRequests.get(requestId);
        if (!requestState || requestState.status !== 'pending') {
            activePhoneRequestByUser.delete(userId);
        }
    }
}

function createPhoneRequest(userId, chatId) {
    cleanupPhoneRequests();
    const normalizedUserId = String(userId);
    const existingRequestId = activePhoneRequestByUser.get(normalizedUserId);
    if (existingRequestId) {
        const existingState = phoneRequests.get(existingRequestId);
        if (existingState) {
            existingState.status = 'cancelled';
            existingState.reason = 'superseded';
            existingState.completedAt = new Date().toISOString();
            existingState.expiresAt = Date.now() + PHONE_REQUEST_RESULT_TTL_MS;
            phoneRequests.set(existingRequestId, existingState);
        }
    }

    const requestId = crypto.randomBytes(16).toString('hex');
    const expiresAt = Date.now() + PHONE_REQUEST_TTL_MS;
    const requestState = {
        requestId,
        userId: normalizedUserId,
        chatId: String(chatId),
        status: 'pending',
        reason: null,
        phone: null,
        createdAt: new Date().toISOString(),
        completedAt: null,
        expiresAt
    };

    phoneRequests.set(requestId, requestState);
    activePhoneRequestByUser.set(normalizedUserId, requestId);
    return requestState;
}

function getPhoneRequestForUser(userId, requestId) {
    cleanupPhoneRequests();
    const normalizedUserId = String(userId);
    const candidateRequestId = String(requestId || '').trim() || activePhoneRequestByUser.get(normalizedUserId);
    if (!candidateRequestId) {
        return null;
    }
    const requestState = phoneRequests.get(candidateRequestId);
    if (!requestState) {
        return null;
    }
    if (String(requestState.userId) !== normalizedUserId) {
        return null;
    }
    return requestState;
}

function finalizePhoneRequest(userId, updates = {}) {
    cleanupPhoneRequests();
    const normalizedUserId = String(userId);
    const activeRequestId = activePhoneRequestByUser.get(normalizedUserId);
    if (!activeRequestId) {
        return null;
    }

    const requestState = phoneRequests.get(activeRequestId);
    if (!requestState) {
        activePhoneRequestByUser.delete(normalizedUserId);
        return null;
    }

    const nextStatus = String(updates.status || '').trim() || 'failed';
    requestState.status = nextStatus;
    requestState.reason = updates.reason || null;
    requestState.phone = updates.phone || null;
    requestState.completedAt = new Date().toISOString();
    requestState.expiresAt = Date.now() + PHONE_REQUEST_RESULT_TTL_MS;

    phoneRequests.set(activeRequestId, requestState);
    activePhoneRequestByUser.delete(normalizedUserId);
    return requestState;
}

function normalizeTelegramPhone(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const prefixed = raw.startsWith('+') ? raw : `+${raw}`;
    const normalized = prefixed.replace(/[^\d+]/g, '');
    return normalized.length >= 7 ? normalized : '';
}

async function sendPhoneRequestToTelegram(userId, chatId) {
    const requestState = createPhoneRequest(userId, chatId);
    const sent = await sendTelegram(
        chatId,
        'Подтвердите номер телефона аккаунта. Нажмите кнопку ниже и отправьте контакт.',
        {
            reply_markup: {
                keyboard: [[{ text: 'Отправить номер телефона', request_contact: true }]],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        }
    );

    if (!sent) {
        finalizePhoneRequest(userId, { status: 'failed', reason: 'send_failed' });
        return { ok: false };
    }

    return {
        ok: true,
        requestId: requestState.requestId,
        expiresAt: requestState.expiresAt
    };
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
    return {
        ok: true,
        username: state.user.username,
        role: state.user.role,
        userId: state.user.id,
        payload: verification.payload || {}
    };
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
            const shouldRequestPhone = !!result.payload?.request_phone;
            if (shouldRequestPhone) {
                const phoneRequest = await sendPhoneRequestToTelegram(result.userId, chatId);
                if (!phoneRequest.ok) {
                    await sendTelegram(chatId, 'Telegram connected, but failed to request phone. Please try again from dashboard.');
                    return;
                }
                await sendTelegram(
                    chatId,
                    `✅ <b>Telegram подключен</b>\n\n👤 Пользователь: <b>${result.username}</b>\n🎓 Роль: <b>${result.role}</b>\n\nТеперь отправьте ваш контакт кнопкой ниже.`
                );
                return;
            }

            await sendTelegram(
                chatId,
                `✅ <b>Telegram подключен</b>\n\n👤 Пользователь: <b>${result.username}</b>\n🎓 Роль: <b>${result.role}</b>\n\nТеперь вы будете получать уведомления в Telegram.`,
                {
                    reply_markup: {
                        inline_keyboard: [[
                            { text: 'Открыть кабинет', url: `${getAppUrl().replace(/\/$/, '')}/dashboard` }
                        ]]
                    }
                }
            );
        } catch (error) {
            console.error('Telegram /start link error:', error);
            await sendTelegram(chatId, 'Произошла ошибка при привязке. Попробуйте снова позже.');
        }
    });

    telegramBot.on('message', async (msg) => {
        try {
            const contact = msg?.contact;
            if (!contact?.phone_number) {
                return;
            }

            const chatId = String(msg.chat?.id || '');
            if (!chatId) {
                return;
            }

            const userResult = await query(
                `SELECT id, username, settings
                 FROM users
                 WHERE telegram_id = $1
                 LIMIT 1`,
                [chatId]
            );

            if (!userResult.rows.length) {
                await sendTelegram(chatId, 'Сначала привяжите аккаунт через кабинет ZEDLY.');
                return;
            }

            const user = userResult.rows[0];
            const requestState = getPhoneRequestForUser(user.id);
            if (!requestState || requestState.status !== 'pending') {
                return;
            }

            const fromId = String(msg.from?.id || '');
            const contactUserId = String(contact.user_id || '');
            if (!fromId || !contactUserId || fromId !== contactUserId) {
                finalizePhoneRequest(user.id, { status: 'failed', reason: 'contact_mismatch' });
                await sendTelegram(chatId, 'Отправьте ваш собственный контакт из Telegram-аккаунта.');
                return;
            }

            const normalizedPhone = normalizeTelegramPhone(contact.phone_number);
            if (!normalizedPhone) {
                finalizePhoneRequest(user.id, { status: 'failed', reason: 'invalid_phone' });
                await sendTelegram(chatId, 'Не удалось распознать номер телефона. Повторите попытку.');
                return;
            }

            const duplicateCheck = await query(
                `SELECT id
                 FROM users
                 WHERE phone = $1 AND id != $2
                 LIMIT 1`,
                [normalizedPhone, user.id]
            );

            if (duplicateCheck.rows.length > 0) {
                finalizePhoneRequest(user.id, { status: 'failed', reason: 'duplicate_phone' });
                await sendTelegram(chatId, 'Этот номер уже используется в другом аккаунте.');
                return;
            }

            const rawSettings = user.settings && typeof user.settings === 'object' ? user.settings : {};
            const profileSettings = rawSettings.profile && typeof rawSettings.profile === 'object' ? rawSettings.profile : {};
            const verification = profileSettings.contact_verification && typeof profileSettings.contact_verification === 'object'
                ? profileSettings.contact_verification
                : {};
            const pendingVerification = verification.pending && typeof verification.pending === 'object'
                ? verification.pending
                : {};
            const nextSettings = {
                ...rawSettings,
                profile: {
                    ...profileSettings,
                    contact_verification: {
                        ...verification,
                        pending: {
                            ...pendingVerification,
                            phone: null
                        },
                        phone_verified: true
                    }
                }
            };

            const columns = await loadUsersColumns();
            if (columns.hasSettings && columns.hasUpdatedAt) {
                await query(
                    `UPDATE users
                     SET phone = $1,
                         settings = $2,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE id = $3`,
                    [normalizedPhone, nextSettings, user.id]
                );
            } else if (columns.hasSettings) {
                await query(
                    `UPDATE users
                     SET phone = $1,
                         settings = $2
                     WHERE id = $3`,
                    [normalizedPhone, nextSettings, user.id]
                );
            } else if (columns.hasUpdatedAt) {
                await query(
                    `UPDATE users
                     SET phone = $1,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE id = $2`,
                    [normalizedPhone, user.id]
                );
            } else {
                await query(
                    `UPDATE users
                     SET phone = $1
                     WHERE id = $2`,
                    [normalizedPhone, user.id]
                );
            }

            await query(
                `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                    user.id,
                    'update',
                    'user',
                    user.id,
                    { action_type: 'phone_verified_via_telegram' }
                ]
            );

            finalizePhoneRequest(user.id, { status: 'completed', phone: normalizedPhone });
            await sendTelegram(
                chatId,
                `Номер телефона успешно обновлен: <b>${normalizedPhone}</b>`,
                {
                    reply_markup: {
                        remove_keyboard: true
                    }
                }
            );
        } catch (error) {
            console.error('Telegram contact handling error:', error);
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
 * POST /api/telegram/me/phone/request
 * Request phone number from Telegram account contact share
 */
router.post('/me/phone/request', authenticate, async (req, res) => {
    try {
        if (!telegramBot) {
            return res.status(400).json({
                error: 'not_configured',
                message: 'Telegram bot is not configured'
            });
        }

        const state = await getCurrentUserTelegramState(req.user.id);
        if (!state) {
            return res.status(404).json({
                error: 'not_found',
                message: 'User not found'
            });
        }

        const botInfo = await telegramBot.getMe();
        if (!botInfo?.username) {
            return res.status(500).json({
                error: 'server_error',
                message: 'Telegram bot username is unavailable'
            });
        }

        if (!state.user.telegram_id) {
            const { token, expiresAt } = createLinkTokenWithPayload(state.user.id, { request_phone: true });
            const link = `https://t.me/${botInfo.username}?start=${encodeURIComponent(token)}`;
            return res.json({
                message: 'Telegram link flow started',
                needs_link: true,
                link,
                token_expires_at: new Date(expiresAt).toISOString()
            });
        }

        const phoneRequest = await sendPhoneRequestToTelegram(state.user.id, state.user.telegram_id);
        if (!phoneRequest.ok) {
            return res.status(500).json({
                error: 'server_error',
                message: 'Failed to send phone request to Telegram'
            });
        }

        const link = `https://t.me/${botInfo.username}`;

        res.json({
            message: 'Phone request sent to Telegram bot',
            needs_link: false,
            link,
            request_id: phoneRequest.requestId,
            expires_at: new Date(phoneRequest.expiresAt).toISOString()
        });
    } catch (error) {
        console.error('Telegram phone request start error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to start phone request flow'
        });
    }
});

/**
 * GET /api/telegram/me/phone/status
 * Get current phone request status
 */
router.get('/me/phone/status', authenticate, async (req, res) => {
    try {
        const requestId = String(req.query.request_id || '').trim();
        const requestState = getPhoneRequestForUser(req.user.id, requestId);
        if (!requestState) {
            return res.json({
                found: false,
                status: 'not_found'
            });
        }

        res.json({
            found: true,
            request_id: requestState.requestId,
            status: requestState.status,
            reason: requestState.reason,
            phone: requestState.phone,
            created_at: requestState.createdAt,
            completed_at: requestState.completedAt,
            expires_at: new Date(requestState.expiresAt).toISOString()
        });
    } catch (error) {
        console.error('Telegram phone request status error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to get phone request status'
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
