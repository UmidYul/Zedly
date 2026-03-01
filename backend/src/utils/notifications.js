const nodemailer = require('nodemailer');
const TelegramClient = require('./telegram-client');
const { query } = require('../config/database');

function getAppUrl() {
    return process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:5000';
}

/**
 * Email Transporter Configuration
 * Настройте SMTP в .env файле
 */
function envValue(...keys) {
    for (const key of keys) {
        const value = process.env[key];
        if (value !== undefined && value !== null && String(value).trim() !== '') {
            return String(value).trim();
        }
    }
    return '';
}

function parseBoolean(value, fallback = false) {
    if (value === undefined || value === null || value === '') return fallback;
    return String(value).trim().toLowerCase() === 'true';
}

function getEmailConfig() {
    const host = envValue('SMTP_HOST', 'EMAIL_HOST') || 'smtp.gmail.com';
    const rawPort = envValue('SMTP_PORT', 'EMAIL_PORT') || '587';
    const port = Number.parseInt(rawPort, 10) || 587;
    const secureRaw = envValue('SMTP_SECURE', 'EMAIL_SECURE');
    const secure = secureRaw ? parseBoolean(secureRaw) : port === 465;
    const user = envValue('SMTP_USER', 'EMAIL_USER');
    const pass = envValue('SMTP_PASSWORD', 'SMTP_PASS', 'EMAIL_PASSWORD', 'EMAIL_PASS');
    const rejectUnauthorized = parseBoolean(envValue('SMTP_TLS_REJECT_UNAUTHORIZED', 'EMAIL_TLS_REJECT_UNAUTHORIZED'), true);
    const connectionTimeout = Number.parseInt(envValue('SMTP_CONNECTION_TIMEOUT_MS', 'EMAIL_CONNECTION_TIMEOUT_MS') || '15000', 10);
    const greetingTimeout = Number.parseInt(envValue('SMTP_GREETING_TIMEOUT_MS', 'EMAIL_GREETING_TIMEOUT_MS') || '10000', 10);
    const socketTimeout = Number.parseInt(envValue('SMTP_SOCKET_TIMEOUT_MS', 'EMAIL_SOCKET_TIMEOUT_MS') || '20000', 10);

    return {
        host,
        port,
        secure,
        user,
        pass,
        rejectUnauthorized,
        connectionTimeout,
        greetingTimeout,
        socketTimeout
    };
}

const emailConfig = getEmailConfig();
const emailTransporter = nodemailer.createTransport({
    host: emailConfig.host,
    port: emailConfig.port,
    secure: emailConfig.secure,
    auth: {
        user: emailConfig.user,
        pass: emailConfig.pass
    },
    tls: {
        servername: emailConfig.host,
        rejectUnauthorized: emailConfig.rejectUnauthorized
    },
    connectionTimeout: emailConfig.connectionTimeout,
    greetingTimeout: emailConfig.greetingTimeout,
    socketTimeout: emailConfig.socketTimeout
});

function isEmailConfigured() {
    return !!(emailConfig.user && emailConfig.pass);
}

function getEmailFrom() {
    return process.env.EMAIL_FROM || `"ZEDLY Platform" <${emailConfig.user}>`;
}

/**
 * Telegram Bot Configuration
 * Настройте TELEGRAM_BOT_TOKEN в .env файле
 */
let telegramBot = null;
if (process.env.TELEGRAM_BOT_TOKEN) {
    try {
        const useWebhook = process.env.TELEGRAM_USE_WEBHOOK === 'true';
        const envPolling = process.env.TELEGRAM_ENABLE_POLLING;
        const isTestEnv = process.env.NODE_ENV === 'test';
        const pm2Instance = process.env.NODE_APP_INSTANCE;
        const isPrimaryInstance = pm2Instance === undefined || pm2Instance === '0';

        // Polling strategy:
        // - disabled in tests
        // - disabled when webhook mode is enabled
        // - in PM2 cluster, default to primary instance only
        // - TELEGRAM_ENABLE_POLLING=true|false overrides defaults
        const shouldPoll = !isTestEnv
            && !useWebhook
            && (envPolling ? envPolling === 'true' : isPrimaryInstance);

        telegramBot = new TelegramClient(process.env.TELEGRAM_BOT_TOKEN, { polling: shouldPoll });

        if (!shouldPoll) {
            console.log('Telegram polling is disabled for this process.');
        }

        telegramBot.on('polling_error', async (error) => {
            const message = String(error?.message || '');
            const statusCode = Number(
                error?.response?.statusCode
                || error?.response?.body?.error_code
                || 0
            );
            const isConflict = statusCode === 409 || message.includes('409 Conflict');

            if (isConflict) {
                console.warn('Telegram polling conflict detected (409). Another instance is already polling updates.');
                if (typeof telegramBot.stopPolling === 'function') {
                    try {
                        await telegramBot.stopPolling();
                    } catch (stopError) {
                        console.warn('Failed to stop Telegram polling after conflict:', stopError.message);
                    }
                }
                return;
            }

            console.error('Telegram polling error:', error);
        });
    } catch (error) {
        console.error('Failed to initialize Telegram bot:', error.message);
    }
}

/**
 * Send email notification
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.text - Plain text body
 * @param {string} options.html - HTML body
 * @param {string} [options.replyTo] - Reply-To email
 * @returns {Promise<boolean>}
 */
async function sendEmail({ to, subject, text, html, replyTo }) {
    if (!isEmailConfigured()) {
        console.warn('Email not configured. Skipping email notification.');
        return false;
    }

    try {
        if (process.env.NODE_ENV !== 'production') {
            console.log('[email] transport config', {
                host: emailConfig.host,
                port: emailConfig.port,
                secure: emailConfig.secure,
                user: emailConfig.user
            });
        }

        await emailTransporter.sendMail({
            from: getEmailFrom(),
            to,
            replyTo: replyTo || undefined,
            subject,
            text,
            html: html || text
        });
        console.log(`Email sent to ${to}`);
        return true;
    } catch (error) {
        console.error('Email send error:', error);
        return false;
    }
}

async function sendVerificationCodeEmail({ to, code, firstName, expiresMinutes = 10 }) {
    const safeFirstName = firstName ? `, ${String(firstName).trim()}` : '';
    const subject = 'ZEDLY: Email verification code';
    const text = `Hello${safeFirstName}. Your verification code is: ${code}. It expires in ${expiresMinutes} minutes.`;
    const html = buildModernEmailTemplate({
        title: 'Email Verification',
        eyebrow: 'Security',
        bodyHtml: `
            <p style="margin: 0 0 12px; color: #334155; line-height: 1.7;">Hello${escapeHtmlEmail(safeFirstName)}.</p>
            <p style="margin: 0 0 14px; color: #334155; line-height: 1.7;">Use this code to confirm your email address:</p>
            <div style="display:inline-block;padding:12px 18px;border-radius:10px;background:#eff6ff;border:1px solid #bfdbfe;font-size:28px;font-weight:800;letter-spacing:4px;color:#1e3a8a;">
                ${escapeHtmlEmail(code)}
            </div>
            <p style="margin: 14px 0 0; color: #64748b;">Code expires in ${escapeHtmlEmail(expiresMinutes)} minutes.</p>
        `,
        footerNote: 'If you did not request this code, you can ignore this email.'
    });

    return sendEmail({ to, subject, text, html });
}

/**
 * Send Telegram notification
 * @param {string} chatId - Telegram chat ID or username
 * @param {string} message - Message text
 * @param {Object} options - Additional options
 * @returns {Promise<boolean|{ok:boolean,error:string|null}>}
 */
async function sendTelegram(chatId, message, options = {}) {
    const { returnDetails = false, ...telegramOptions } = options || {};

    if (!telegramBot) {
        console.warn('Telegram bot not configured. Skipping Telegram notification.');
        return returnDetails
            ? { ok: false, error: 'Telegram bot not configured' }
            : false;
    }

    if (process.env.ENABLE_TELEGRAM_NOTIFICATIONS === 'false') {
        return returnDetails
            ? { ok: false, error: 'Telegram notifications disabled by ENABLE_TELEGRAM_NOTIFICATIONS=false' }
            : false;
    }

    try {
        await telegramBot.sendMessage(chatId, message, {
            parse_mode: 'HTML',
            ...telegramOptions
        });
        console.log(`Telegram message sent to ${chatId}`);
        return returnDetails ? { ok: true, error: null } : true;
    } catch (error) {
        const tgError =
            error?.response?.body?.description
            || error?.response?.body?.error_code
            || error?.message
            || 'Unknown Telegram error';
        console.error('Telegram send error:', tgError);
        return returnDetails ? { ok: false, error: String(tgError) } : false;
    }
}

async function sendTelegramToTargets(userChatId, message, globalMessage, options = {}) {
    const results = {
        user: false,
        global: false
    };
    const userOptions = options.userOptions || {};
    const globalOptions = options.globalOptions || {};

    if (userChatId) {
        results.user = await sendTelegram(userChatId, message, userOptions);
    }

    const globalChatId = process.env.TELEGRAM_CHAT_ID;
    if (globalChatId) {
        const globalText = globalMessage || message;
        if (!userChatId || String(globalChatId) !== String(userChatId)) {
            results.global = await sendTelegram(globalChatId, globalText, globalOptions);
        }
    }

    return results;
}

function buildNewTestLink(test = {}) {
    const appUrl = getAppUrl().replace(/\/$/, '');
    const params = new URLSearchParams({ page: 'tests' });

    if (test.assignment_id !== undefined && test.assignment_id !== null) {
        params.set('assignment_id', String(test.assignment_id));
    }

    if (test.subject_id !== undefined && test.subject_id !== null) {
        params.set('subject_id', String(test.subject_id));
    }

    return `${appUrl}/dashboard?${params.toString()}`;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

async function logNotificationAttempt({
    userId,
    channel,
    eventKey,
    status,
    recipient,
    subject,
    errorMessage,
    metadata
}) {
    try {
        await query(
            `INSERT INTO notification_log (user_id, channel, event_key, status, recipient, subject, error_message, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                userId || null,
                String(channel || 'unknown'),
                String(eventKey || 'unknown'),
                String(status || 'unknown'),
                recipient ? String(recipient) : null,
                subject ? String(subject) : null,
                errorMessage ? String(errorMessage).slice(0, 1500) : null,
                metadata || null
            ]
        );
    } catch (error) {
        // Do not break notification flow if logging table is not ready yet.
        if (process.env.NODE_ENV !== 'production') {
            console.warn('Notification log insert skipped:', error.message);
        }
    }
}

function escapeHtmlEmail(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function plainTextToEmailHtml(text) {
    const safe = escapeHtmlEmail(text || '');
    return safe
        .split('\n\n')
        .map((chunk) => `<p style="margin: 0 0 12px; color: #334155; line-height: 1.7;">${chunk.replace(/\n/g, '<br>')}</p>`)
        .join('');
}

function getEmailTemplateTheme() {
    const theme = String(process.env.EMAIL_TEMPLATE_THEME || 'corporate').trim().toLowerCase();
    return theme || 'corporate';
}

function buildModernEmailTemplate({ title, eyebrow = 'ZEDLY', bodyHtml, ctaText, ctaUrl, footerNote }) {
    const theme = getEmailTemplateTheme();
    const safeTitle = escapeHtmlEmail(title || 'Notification');
    const safeEyebrow = escapeHtmlEmail(eyebrow || 'ZEDLY');
    const safeFooter = escapeHtmlEmail(footerNote || 'This is an automated message from ZEDLY.');
    const palette = theme === 'modern'
        ? {
            pageBg: '#f1f5f9',
            cardBg: '#ffffff',
            cardBorder: '#e2e8f0',
            headerBg: 'linear-gradient(135deg,#0f172a 0%,#1d4ed8 100%)',
            eyebrowColor: '#bfdbfe',
            titleColor: '#ffffff',
            buttonBg: '#0f172a',
            buttonColor: '#ffffff',
            footerColor: '#64748b'
        }
        : {
            pageBg: '#eef2f7',
            cardBg: '#ffffff',
            cardBorder: '#d5dce6',
            headerBg: 'linear-gradient(135deg,#0b1f3a 0%,#17406d 100%)',
            eyebrowColor: '#c8d8ee',
            titleColor: '#ffffff',
            buttonBg: '#17406d',
            buttonColor: '#ffffff',
            footerColor: '#5f6b7a'
        };

    const button = ctaText && ctaUrl
        ? `<div style="margin-top: 18px;"><a href="${escapeHtmlEmail(ctaUrl)}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:${palette.buttonBg};color:${palette.buttonColor};text-decoration:none;font-weight:600;">${escapeHtmlEmail(ctaText)}</a></div>`
        : '';

    return `
        <div style="margin:0;padding:28px 12px;background:${palette.pageBg};">
            <div style="max-width:640px;margin:0 auto;background:${palette.cardBg};border:1px solid ${palette.cardBorder};border-radius:12px;overflow:hidden;">
                <div style="padding:18px 24px;background:${palette.headerBg};">
                    <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${palette.eyebrowColor};margin-bottom:8px;">${safeEyebrow}</div>
                    <div style="font-size:24px;line-height:1.25;font-weight:800;color:${palette.titleColor};">${safeTitle}</div>
                </div>
                <div style="padding:24px;">
                    ${bodyHtml}
                    ${button}
                </div>
                <div style="padding:14px 24px;border-top:1px solid ${palette.cardBorder};font-size:12px;color:${palette.footerColor};">
                    ${safeFooter}
                </div>
            </div>
        </div>
    `;
}

function parseUserSettings(settings) {
    if (!settings) return {};
    if (typeof settings === 'object' && !Array.isArray(settings)) return settings;
    if (typeof settings === 'string') {
        try {
            const parsed = JSON.parse(settings);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed;
            }
        } catch (error) {
            return {};
        }
    }
    return {};
}

const STATIC_ROLE_NOTIFICATION_DEFAULTS = {
    student: {
        channels: { in_app: true, email: true, telegram: true },
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
    },
    teacher: {
        channels: { in_app: true, email: true, telegram: true },
        events: {
            new_test: false,
            test_results: false,
            assignment_deadline: true,
            password_reset: true,
            profile_updates: true,
            system_updates: true,
            welcome: true,
            digest_summary: true
        },
        frequency: 'instant'
    },
    psychologist: {
        channels: { in_app: true, email: true, telegram: true },
        events: {
            new_test: false,
            test_results: false,
            assignment_deadline: false,
            password_reset: true,
            profile_updates: true,
            system_updates: true,
            welcome: true,
            digest_summary: true
        },
        frequency: 'instant'
    },
    school_admin: {
        channels: { in_app: true, email: true, telegram: true },
        events: {
            new_test: false,
            test_results: false,
            assignment_deadline: true,
            password_reset: true,
            profile_updates: true,
            system_updates: true,
            welcome: true,
            digest_summary: true
        },
        frequency: 'instant'
    },
    superadmin: {
        channels: { in_app: true, email: true, telegram: true },
        events: {
            new_test: false,
            test_results: false,
            assignment_deadline: true,
            password_reset: true,
            profile_updates: true,
            system_updates: true,
            welcome: true,
            digest_summary: true
        },
        frequency: 'instant'
    }
};

const ROLE_DEFAULTS_CACHE_TTL_MS = 2 * 60 * 1000;
let roleDefaultsCache = {
    loadedAt: 0,
    value: null
};

function cloneDefaultsMap(map) {
    return JSON.parse(JSON.stringify(map || {}));
}

function buildMatrixFromChannelsEvents(channels, events) {
    const matrix = {};
    for (const channelKey of Object.keys(channels || {})) {
        matrix[channelKey] = {};
        for (const eventKey of Object.keys(events || {})) {
            matrix[channelKey][eventKey] = !!channels[channelKey] && !!events[eventKey];
        }
    }
    return matrix;
}

function computeChannelsEventsFromMatrix(baseChannels, baseEvents, matrix) {
    const channels = { ...(baseChannels || {}) };
    const events = { ...(baseEvents || {}) };

    for (const channelKey of Object.keys(channels)) {
        const row = matrix?.[channelKey] || {};
        channels[channelKey] = Object.values(row).some((value) => !!value);
    }

    for (const eventKey of Object.keys(events)) {
        let enabled = false;
        for (const channelKey of Object.keys(channels)) {
            if (matrix?.[channelKey]?.[eventKey]) {
                enabled = true;
                break;
            }
        }
        events[eventKey] = enabled;
    }

    return { channels, events };
}

async function getRoleNotificationDefaultsMap() {
    const now = Date.now();
    if (roleDefaultsCache.value && (now - roleDefaultsCache.loadedAt) < ROLE_DEFAULTS_CACHE_TTL_MS) {
        return roleDefaultsCache.value;
    }

    const merged = cloneDefaultsMap(STATIC_ROLE_NOTIFICATION_DEFAULTS);
    for (const role of Object.keys(merged)) {
        merged[role].matrix = buildMatrixFromChannelsEvents(merged[role].channels, merged[role].events);
    }

    try {
        // New normalized schema
        const defaultsResult = await query(
            `SELECT role, frequency
             FROM notification_role_defaults`
        );
        const matrixResult = await query(
            `SELECT role, channel, event_key, enabled
             FROM notification_role_matrix`
        );
        if (!Array.isArray(matrixResult.rows) || matrixResult.rows.length === 0) {
            throw new Error('notification_role_matrix is empty');
        }

        for (const row of defaultsResult.rows || []) {
            const role = String(row.role || '').trim();
            if (!role || !merged[role]) continue;
            merged[role].frequency = String(row.frequency || merged[role].frequency || 'instant');
        }

        for (const row of matrixResult.rows || []) {
            const role = String(row.role || '').trim();
            const channel = String(row.channel || '').trim();
            const eventKey = String(row.event_key || '').trim();
            if (!role || !channel || !eventKey || !merged[role]) continue;

            if (!merged[role].matrix[channel]) merged[role].matrix[channel] = {};
            merged[role].matrix[channel][eventKey] = !!row.enabled;
        }

        for (const role of Object.keys(merged)) {
            const reduced = computeChannelsEventsFromMatrix(
                merged[role].channels,
                merged[role].events,
                merged[role].matrix
            );
            merged[role].channels = reduced.channels;
            merged[role].events = reduced.events;
        }
    } catch (normalizedError) {
        try {
            // Legacy schema fallback (json columns in notification_role_defaults)
            const legacyResult = await query(
                `SELECT role, channels, events, frequency
                 FROM notification_role_defaults`
            );
            for (const row of legacyResult.rows || []) {
                const role = String(row.role || '').trim();
                if (!role || !merged[role]) continue;

                const channels = { ...merged[role].channels };
                const events = { ...merged[role].events };
                const rawChannels = row?.channels && typeof row.channels === 'object' ? row.channels : {};
                const rawEvents = row?.events && typeof row.events === 'object' ? row.events : {};

                for (const key of Object.keys(channels)) {
                    if (rawChannels[key] !== undefined) channels[key] = !!rawChannels[key];
                }
                for (const key of Object.keys(events)) {
                    if (rawEvents[key] !== undefined) events[key] = !!rawEvents[key];
                }

                merged[role].channels = channels;
                merged[role].events = events;
                merged[role].frequency = String(row?.frequency || merged[role].frequency || 'instant');
                merged[role].matrix = buildMatrixFromChannelsEvents(channels, events);
            }
        } catch (legacyError) {
            // Table may be absent before migration; fallback to static defaults.
        }
    }

    roleDefaultsCache = { loadedAt: now, value: merged };
    return merged;
}

function invalidateNotificationDefaultsCache() {
    roleDefaultsCache = { loadedAt: 0, value: null };
}

async function getDefaultNotificationPreferencesByRole(role) {
    const map = await getRoleNotificationDefaultsMap();
    return map[role] || map.teacher || STATIC_ROLE_NOTIFICATION_DEFAULTS.teacher;
}

async function isEventEnabledForChannel(user, channel, eventKey) {
    const safeChannel = String(channel || '').trim().toLowerCase();
    const safeEvent = String(eventKey || '').trim().toLowerCase();
    if (!safeChannel || !safeEvent) return false;

    const settings = parseUserSettings(user?.settings);
    const defaults = await getDefaultNotificationPreferencesByRole(user?.role);
    const profilePrefs = settings?.profile?.notification_preferences;
    const legacyTelegramPrefs = settings?.telegram_notifications;

    const matrixDefault = defaults.matrix?.[safeChannel]?.[safeEvent];
    let channelEnabled = defaults.channels?.[safeChannel] !== false;
    if (profilePrefs?.channels && profilePrefs.channels[safeChannel] !== undefined) {
        channelEnabled = !!profilePrefs.channels[safeChannel];
    }

    if (safeChannel === 'telegram' && legacyTelegramPrefs?.enabled === false) {
        channelEnabled = false;
    }

    if (!channelEnabled) {
        return false;
    }

    let eventEnabled = matrixDefault !== undefined
        ? !!matrixDefault
        : (defaults.events?.[safeEvent] !== false);
    if (profilePrefs?.events && profilePrefs.events[safeEvent] !== undefined) {
        eventEnabled = !!profilePrefs.events[safeEvent];
    }

    if (safeChannel === 'telegram' && legacyTelegramPrefs?.[safeEvent] !== undefined) {
        eventEnabled = !!legacyTelegramPrefs[safeEvent];
    }

    return eventEnabled;
}

async function isTelegramEventEnabled(user, eventKey) {
    return isEventEnabledForChannel(user, 'telegram', eventKey);
}

async function sendInAppNotification(userId, payload = {}) {
    if (!userId) return false;
    const action = String(payload.action || 'notification').slice(0, 64);
    const entityType = String(payload.entityType || 'notification').slice(0, 64);
    const entityId = payload.entityId || null;
    const details = payload.details && typeof payload.details === 'object'
        ? payload.details
        : {};

    await query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, action, entityType, entityId, details]
    );
    return true;
}

async function sendWithFallback({
    user,
    eventKey,
    emailPayload,
    telegramPayload,
    inAppPayload,
    metadata
}) {
    const result = {
        delivered: false,
        channel: null,
        email: false,
        telegram: false,
        in_app: false
    };

    const mergedMeta = metadata && typeof metadata === 'object' ? metadata : {};

    if (
        user?.telegram_id
        && telegramPayload?.message
        && await isEventEnabledForChannel(user, 'telegram', eventKey)
    ) {
        const telegramResult = await sendTelegram(
            user.telegram_id,
            telegramPayload.message,
            { ...(telegramPayload.options || {}), returnDetails: true }
        );
        const ok = !!telegramResult.ok;
        result.telegram = ok;

        await logNotificationAttempt({
            userId: user.id,
            channel: 'telegram',
            eventKey,
            status: ok ? 'sent' : 'failed',
            recipient: String(user.telegram_id),
            errorMessage: ok ? null : (telegramResult.error || 'Telegram delivery failed'),
            metadata: { scope: 'user', fallback_step: 1, ...mergedMeta }
        });

        if (ok) {
            result.delivered = true;
            result.channel = 'telegram';
            return result;
        }
    }

    if (
        user?.email
        && emailPayload?.subject
        && await isEventEnabledForChannel(user, 'email', eventKey)
    ) {
        const ok = await sendEmail({
            to: user.email,
            subject: emailPayload.subject,
            text: emailPayload.text,
            html: emailPayload.html
        });
        result.email = ok;

        await logNotificationAttempt({
            userId: user.id,
            channel: 'email',
            eventKey,
            status: ok ? 'sent' : 'failed',
            recipient: user.email,
            subject: emailPayload.subject,
            metadata: { fallback_step: 2, ...mergedMeta }
        });

        if (ok) {
            result.delivered = true;
            result.channel = 'email';
            return result;
        }
    }

    if (await isEventEnabledForChannel(user, 'in_app', eventKey)) {
        try {
            const ok = await sendInAppNotification(user.id, inAppPayload || {});
            result.in_app = ok;
            await logNotificationAttempt({
                userId: user.id,
                channel: 'in_app',
                eventKey,
                status: ok ? 'sent' : 'failed',
                recipient: String(user.id),
                subject: inAppPayload?.details?.title || null,
                metadata: { fallback_step: 3, ...mergedMeta }
            });

            if (ok) {
                result.delivered = true;
                result.channel = 'in_app';
                return result;
            }
        } catch (error) {
            await logNotificationAttempt({
                userId: user.id,
                channel: 'in_app',
                eventKey,
                status: 'failed',
                recipient: String(user.id),
                subject: inAppPayload?.details?.title || null,
                errorMessage: error.message || 'Failed to write in-app notification',
                metadata: { fallback_step: 3, ...mergedMeta }
            });
        }
    }

    return result;
}

/**
 * Send global Telegram notification about system changes
 * @param {Object} payload
 * @param {string} payload.actor - Who made the change
 * @param {string} payload.action - create/update/delete/reset_password/import
 * @param {string} payload.entityType - school/user/class/test/etc
 * @param {string} payload.entityName - human readable entity name
 * @param {string} payload.details - optional details line
 * @returns {Promise<boolean>}
 */
async function notifySystemChange({ actor, action, entityType, entityName, details }) {
    const securityActions = new Set(['delete', 'reset_password']);
    const isSecurityAction = securityActions.has(action);

    const securityChatId = process.env.TELEGRAM_SECURITY_CHAT_ID;
    const operationsChatId = process.env.TELEGRAM_OPERATIONS_CHAT_ID;
    const fallbackChatId = process.env.TELEGRAM_CHAT_ID;

    const targetChatId = isSecurityAction
        ? (securityChatId || fallbackChatId)
        : (operationsChatId || fallbackChatId);

    if (!targetChatId) {
        return false;
    }

    const actionLabels = {
        create: 'создание',
        update: 'изменение',
        delete: 'удаление',
        reset_password: 'сброс пароля',
        import: 'импорт'
    };

    const actionText = actionLabels[action] || action || 'изменение';
    const lines = [
        '🛠 <b>Изменение в системе</b>',
        `👤 <b>Кто:</b> ${escapeHtml(actor || 'system')}`,
        `⚙️ <b>Действие:</b> ${escapeHtml(actionText)}`,
        `📌 <b>Сущность:</b> ${escapeHtml(entityType || '-')}`,
        `🏷 <b>Объект:</b> ${escapeHtml(entityName || '-')}`
    ];

    if (details) {
        lines.push(`📝 <b>Детали:</b> ${escapeHtml(details)}`);
    }

    return sendTelegram(targetChatId, lines.join('\n'));
}

/**
 * Send notification about new test
 * @param {Object} user - User object with email and telegram_id
 * @param {Object} test - Test object
 * @param {string} language - Language code (ru/uz)
 */
async function notifyNewTest(user, test, language = 'ru') {
    const messages = {
        ru: {
            subject: 'Новый тест доступен',
            text: `Здравствуйте, ${user.first_name}!\n\nДля вас доступен новый тест: "${test.title}"\n\nВойдите в систему, чтобы пройти тест.\n\nС уважением,\nКоманда ZEDLY`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #3b82f6;">Новый тест доступен!</h2>
                    <p>Здравствуйте, <strong>${user.first_name}</strong>!</p>
                    <p>Для вас доступен новый тест:</p>
                    <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="margin: 0 0 10px 0; color: #1f2937;">${test.title}</h3>
                        <p style="margin: 5px 0; color: #6b7280;">Предмет: ${test.subject_name}</p>
                        ${test.time_limit ? `<p style="margin: 5px 0; color: #6b7280;">Время: ${test.time_limit} минут</p>` : ''}
                    </div>
                    <p>Войдите в систему, чтобы пройти тест.</p>
                      <a href="${getAppUrl()}/take-test.html?id=${test.id}" 
                       style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; 
                              text-decoration: none; border-radius: 6px; margin-top: 10px;">
                        Пройти тест
                    </a>
                    <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
                    <p style="color: #6b7280; font-size: 14px;">С уважением,<br>Команда ZEDLY</p>
                </div>
            `,
            telegram: `🆕 <b>Новый тест доступен!</b>\n\n📚 ${test.title}\n${test.subject_name ? `📖 Предмет: ${test.subject_name}` : ''}\n${test.time_limit ? `⏱ Время: ${test.time_limit} мин` : ''}\n\nВойдите в систему для прохождения теста.`
        },
        uz: {
            subject: 'Yangi test mavjud',
            text: `Assalomu alaykum, ${user.first_name}!\n\nSiz uchun yangi test mavjud: "${test.title}"\n\nTestni topshirish uchun tizimga kiring.\n\nHurmat bilan,\nZEDLY jamoasi`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #3b82f6;">Yangi test mavjud!</h2>
                    <p>Assalomu alaykum, <strong>${user.first_name}</strong>!</p>
                    <p>Siz uchun yangi test mavjud:</p>
                    <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="margin: 0 0 10px 0; color: #1f2937;">${test.title}</h3>
                        <p style="margin: 5px 0; color: #6b7280;">Fan: ${test.subject_name}</p>
                        ${test.time_limit ? `<p style="margin: 5px 0; color: #6b7280;">Vaqt: ${test.time_limit} daqiqa</p>` : ''}
                    </div>
                    <p>Testni topshirish uchun tizimga kiring.</p>
                      <a href="${getAppUrl()}/take-test.html?id=${test.id}" 
                       style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; 
                              text-decoration: none; border-radius: 6px; margin-top: 10px;">
                        Testni boshlash
                    </a>
                    <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
                    <p style="color: #6b7280; font-size: 14px;">Hurmat bilan,<br>ZEDLY jamoasi</p>
                </div>
            `,
            telegram: `🆕 <b>Yangi test mavjud!</b>\n\n📚 ${test.title}\n${test.subject_name ? `📖 Fan: ${test.subject_name}` : ''}\n${test.time_limit ? `⏱ Vaqt: ${test.time_limit} daq` : ''}\n\nTestni topshirish uchun tizimga kiring.`
        }
    };

    const msg = messages[language] || messages.ru;
    const results = { email: false, telegram: false, in_app: false, delivered: false };
    const testLink = buildNewTestLink(test);
    const openButtonText = language === 'uz' ? 'Testni ochish' : 'Open test';
    const emailHtml = buildModernEmailTemplate({
        title: msg.subject,
        eyebrow: language === 'uz' ? 'Yangi test' : 'New test',
        bodyHtml: plainTextToEmailHtml(msg.text),
        ctaText: openButtonText,
        ctaUrl: `${getAppUrl()}/take-test.html?id=${test.id}`,
        footerNote: language === 'uz'
            ? "Ushbu xabar avtomatik yuborildi."
            : 'This is an automated message.'
    });

    const fallbackResult = await sendWithFallback({
        user,
        eventKey: 'new_test',
        emailPayload: {
            subject: msg.subject,
            text: msg.text,
            html: emailHtml
        },
        telegramPayload: {
            message: msg.telegram,
            options: {
                reply_markup: {
                    inline_keyboard: [[
                        { text: openButtonText, url: testLink }
                    ]]
                }
            }
        },
        inAppPayload: {
            action: 'notification_new_test',
            entityType: 'test',
            entityId: test.id || null,
            details: {
                event_key: 'new_test',
                title: msg.subject,
                message: msg.text,
                test_id: test.id || null
            }
        },
        metadata: { test_id: test.id || null }
    });

    results.email = fallbackResult.email;
    results.telegram = fallbackResult.telegram;
    results.in_app = fallbackResult.in_app;
    results.delivered = fallbackResult.delivered;

    if (process.env.TELEGRAM_CHAT_ID) {
        const globalTelegram = await sendTelegram(
            process.env.TELEGRAM_CHAT_ID,
            `<b>New test assigned</b>\n\nUser: ${escapeHtml(user.first_name)} ${escapeHtml(user.last_name || '')}\nTest: ${escapeHtml(test.title)}`,
            { returnDetails: true }
        );
        const globalOk = !!globalTelegram.ok;
        results.telegram = results.telegram || globalOk;

        await logNotificationAttempt({
            userId: user.id,
            channel: 'telegram',
            eventKey: 'new_test',
            status: globalOk ? 'sent' : 'failed',
            recipient: process.env.TELEGRAM_CHAT_ID,
            errorMessage: globalOk ? null : (globalTelegram.error || 'Telegram delivery failed'),
            metadata: { scope: 'global', test_id: test.id || null }
        });
    }

    return results;
}

async function notifyTestResults(user, payload = {}, language = 'ru') {
    const normalizedPayload = payload && typeof payload === 'object' ? payload : {};
    const isCareer = normalizedPayload.type === 'career';
    const testTitle = String(
        normalizedPayload.test_title
        || normalizedPayload.title
        || (isCareer ? 'Профориентационный тест' : 'Тест')
    ).trim();
    const percentageRaw = Number(normalizedPayload.percentage);
    const percentage = Number.isFinite(percentageRaw) ? Math.round(percentageRaw * 100) / 100 : null;
    const score = Number(normalizedPayload.score);
    const maxScore = Number(normalizedPayload.max_score);
    const passed = normalizedPayload.passed === true;
    const topInterests = Array.isArray(normalizedPayload.top_interests)
        ? normalizedPayload.top_interests.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 3)
        : [];
    const recommendedSubjects = Array.isArray(normalizedPayload.recommended_subjects)
        ? normalizedPayload.recommended_subjects.map((item) => String(item || '').trim()).filter(Boolean)
        : [];

    const subjectLineRu = normalizedPayload.subject_name ? `\nПредмет: ${normalizedPayload.subject_name}` : '';
    const subjectLineUz = normalizedPayload.subject_name ? `\nFan: ${normalizedPayload.subject_name}` : '';
    const scoreLineRu = (Number.isFinite(score) && Number.isFinite(maxScore))
        ? `\nБаллы: ${score} / ${maxScore}`
        : '';
    const scoreLineUz = (Number.isFinite(score) && Number.isFinite(maxScore))
        ? `\nBall: ${score} / ${maxScore}`
        : '';
    const percentLineRu = percentage !== null ? `\nРезультат: ${percentage}%` : '';
    const percentLineUz = percentage !== null ? `\nNatija: ${percentage}%` : '';
    const passLineRu = normalizedPayload.passed === undefined
        ? ''
        : `\nСтатус: ${passed ? 'пройден' : 'не пройден'}`;
    const passLineUz = normalizedPayload.passed === undefined
        ? ''
        : `\nHolat: ${passed ? "o'tdi" : "o'tmadi"}`;

    const topInterestsRu = topInterests.length
        ? `\nТоп интересов: ${topInterests.join(', ')}`
        : '';
    const topInterestsUz = topInterests.length
        ? `\nTop qiziqishlar: ${topInterests.join(', ')}`
        : '';
    const recommendationsRu = recommendedSubjects.length
        ? `\nРекомендуемые предметы: ${recommendedSubjects.join(', ')}`
        : '';
    const recommendationsUz = recommendedSubjects.length
        ? `\nTavsiya etilgan fanlar: ${recommendedSubjects.join(', ')}`
        : '';

    const messages = {
        ru: {
            subject: isCareer ? 'Результаты профориентации готовы' : 'Результаты теста готовы',
            text: isCareer
                ? `Здравствуйте, ${user.first_name || 'ученик'}!\n\nВы завершили профориентационный тест.\nНазвание: ${testTitle}${topInterestsRu}${recommendationsRu}\n\nОткройте профиль, чтобы посмотреть детали.`
                : `Здравствуйте, ${user.first_name || 'ученик'}!\n\nВы завершили тест: "${testTitle}".${subjectLineRu}${scoreLineRu}${percentLineRu}${passLineRu}\n\nОткройте профиль, чтобы посмотреть детали.`,
            telegram: isCareer
                ? `✅ <b>Результаты профориентации готовы</b>\n\n<b>Тест:</b> ${escapeHtml(testTitle)}${topInterestsRu ? `\n<b>Топ интересов:</b> ${escapeHtml(topInterests.join(', '))}` : ''}${recommendationsRu ? `\n<b>Рекомендации:</b> ${escapeHtml(recommendedSubjects.join(', '))}` : ''}`
                : `✅ <b>Результаты теста готовы</b>\n\n<b>Тест:</b> ${escapeHtml(testTitle)}${subjectLineRu ? `\n<b>Предмет:</b> ${escapeHtml(String(normalizedPayload.subject_name))}` : ''}${scoreLineRu ? `\n<b>Баллы:</b> ${escapeHtml(String(score))} / ${escapeHtml(String(maxScore))}` : ''}${percentLineRu ? `\n<b>Результат:</b> ${escapeHtml(String(percentage))}%` : ''}${passLineRu ? `\n<b>Статус:</b> ${passed ? 'пройден' : 'не пройден'}` : ''}`
        },
        uz: {
            subject: isCareer ? 'Kasbiy yo‘naltirish natijalari tayyor' : 'Test natijalari tayyor',
            text: isCareer
                ? `Assalomu alaykum, ${user.first_name || "o'quvchi"}!\n\nSiz kasbiy yo‘naltirish testini yakunladingiz.\nNomi: ${testTitle}${topInterestsUz}${recommendationsUz}\n\nBatafsil natijalarni profil sahifasida ko‘ring.`
                : `Assalomu alaykum, ${user.first_name || "o'quvchi"}!\n\nSiz testni yakunladingiz: "${testTitle}".${subjectLineUz}${scoreLineUz}${percentLineUz}${passLineUz}\n\nBatafsil natijalarni profil sahifasida ko‘ring.`,
            telegram: isCareer
                ? `✅ <b>Kasbiy yo‘naltirish natijalari tayyor</b>\n\n<b>Test:</b> ${escapeHtml(testTitle)}${topInterests.length ? `\n<b>Top qiziqishlar:</b> ${escapeHtml(topInterests.join(', '))}` : ''}${recommendedSubjects.length ? `\n<b>Tavsiyalar:</b> ${escapeHtml(recommendedSubjects.join(', '))}` : ''}`
                : `✅ <b>Test natijalari tayyor</b>\n\n<b>Test:</b> ${escapeHtml(testTitle)}${subjectLineUz ? `\n<b>Fan:</b> ${escapeHtml(String(normalizedPayload.subject_name))}` : ''}${scoreLineUz ? `\n<b>Ball:</b> ${escapeHtml(String(score))} / ${escapeHtml(String(maxScore))}` : ''}${percentLineUz ? `\n<b>Natija:</b> ${escapeHtml(String(percentage))}%` : ''}${passLineUz ? `\n<b>Holat:</b> ${passed ? "o'tdi" : "o'tmadi"}` : ''}`
        }
    };

    const msg = messages[language] || messages.ru;
    const emailHtml = buildModernEmailTemplate({
        title: msg.subject,
        eyebrow: language === 'uz' ? 'Natijalar' : 'Results',
        bodyHtml: plainTextToEmailHtml(msg.text),
        ctaText: language === 'uz' ? 'Profilni ochish' : 'Open profile',
        ctaUrl: `${getAppUrl()}/dashboard.html#profile`,
        footerNote: language === 'uz'
            ? "Bu xabar avtomatik yuborildi."
            : 'This is an automated message.'
    });

    const results = {
        delivered: false,
        email: false,
        telegram: false,
        in_app: false
    };

    const metadata = {
        test_type: isCareer ? 'career' : 'subject',
        test_id: normalizedPayload.test_id || null
    };

    if (user?.telegram_id && await isEventEnabledForChannel(user, 'telegram', 'test_results')) {
        const telegramResult = await sendTelegram(user.telegram_id, msg.telegram, { returnDetails: true });
        const ok = !!telegramResult.ok;
        results.telegram = ok;

        await logNotificationAttempt({
            userId: user.id,
            channel: 'telegram',
            eventKey: 'test_results',
            status: ok ? 'sent' : 'failed',
            recipient: String(user.telegram_id),
            errorMessage: ok ? null : (telegramResult.error || 'Telegram delivery failed'),
            metadata
        });
    }

    if (user?.email && await isEventEnabledForChannel(user, 'email', 'test_results')) {
        const ok = await sendEmail({
            to: user.email,
            subject: msg.subject,
            text: msg.text,
            html: emailHtml
        });
        results.email = ok;

        await logNotificationAttempt({
            userId: user.id,
            channel: 'email',
            eventKey: 'test_results',
            status: ok ? 'sent' : 'failed',
            recipient: user.email,
            subject: msg.subject,
            metadata
        });
    }

    if (await isEventEnabledForChannel(user, 'in_app', 'test_results')) {
        try {
            const ok = await sendInAppNotification(user.id, {
                action: 'notification_test_results',
                entityType: isCareer ? 'career_test' : 'test_attempt',
                entityId: normalizedPayload.test_id || null,
                details: {
                    event_key: 'test_results',
                    title: msg.subject,
                    message: msg.text,
                    test_type: isCareer ? 'career' : 'subject',
                    test_title: testTitle,
                    percentage: percentage,
                    score: Number.isFinite(score) ? score : null,
                    max_score: Number.isFinite(maxScore) ? maxScore : null,
                    passed: normalizedPayload.passed === undefined ? null : !!normalizedPayload.passed,
                    top_interests: topInterests,
                    recommended_subjects: recommendedSubjects
                }
            });
            results.in_app = ok;

            await logNotificationAttempt({
                userId: user.id,
                channel: 'in_app',
                eventKey: 'test_results',
                status: ok ? 'sent' : 'failed',
                recipient: String(user.id),
                subject: msg.subject,
                metadata
            });
        } catch (error) {
            await logNotificationAttempt({
                userId: user.id,
                channel: 'in_app',
                eventKey: 'test_results',
                status: 'failed',
                recipient: String(user.id),
                subject: msg.subject,
                errorMessage: error.message || 'Failed to write in-app notification',
                metadata
            });
        }
    }

    results.delivered = results.telegram || results.email || results.in_app;
    return results;
}

/**
 * Send notification about password reset
 * @param {Object} user - User object
 * @param {string} newPassword - Temporary password
 * @param {string} language - Language code (ru/uz)
 */
async function notifyPasswordReset(user, newPassword, language = 'ru') {
    const messages = {
        ru: {
            subject: 'Пароль сброшен',
            text: `Здравствуйте, ${user.first_name}!\n\nВаш пароль был сброшен.\n\nВременный пароль: ${newPassword}\n\nПожалуйста, войдите в систему и измените пароль.\n\nС уважением,\nКоманда ZEDLY`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #3b82f6;">Пароль сброшен</h2>
                    <p>Здравствуйте, <strong>${user.first_name}</strong>!</p>
                    <p>Ваш пароль был сброшен администратором.</p>
                    <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
                        <p style="margin: 0;"><strong>Временный пароль:</strong></p>
                        <p style="font-size: 20px; font-family: monospace; margin: 10px 0; color: #92400e;">${newPassword}</p>
                    </div>
                    <p><strong>Внимание:</strong> Пожалуйста, войдите в систему и измените пароль на постоянный.</p>
                      <a href="${getAppUrl()}/login.html" 
                       style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; 
                              text-decoration: none; border-radius: 6px; margin-top: 10px;">
                        Войти в систему
                    </a>
                    <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
                    <p style="color: #6b7280; font-size: 14px;">С уважением,<br>Команда ZEDLY</p>
                </div>
            `,
            telegram: `🔐 <b>Parol tiklandi</b>\n\n👤 ${user.first_name} ${user.last_name}\n🔑 Vaqtinchalik parol: <code>${newPassword}</code>\n\n⚠️ Tizimga kirib, parolni o'zgartiring!`
        },
        uz: {
            subject: 'Parol tiklandi',
            text: `Assalomu alaykum, ${user.first_name}!\n\nParolingiz tiklandi.\n\nVaqtinchalik parol: ${newPassword}\n\nIltimos, tizimga kirib parolni o'zgartiring.\n\nHurmat bilan,\nZEDLY jamoasi`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #3b82f6;">Parol tiklandi</h2>
                    <p>Assalomu alaykum, <strong>${user.first_name}</strong>!</p>
                    <p>Parolingiz administrator tomonidan tiklandi.</p>
                    <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
                        <p style="margin: 0;"><strong>Vaqtinchalik parol:</strong></p>
                        <p style="font-size: 20px; font-family: monospace; margin: 10px 0; color: #92400e;">${newPassword}</p>
                    </div>
                    <p><strong>Diqqat:</strong> Iltimos, tizimga kirib parolni doimiy parolga o'zgartiring.</p>
                      <a href="${getAppUrl()}/login.html" 
                       style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; 
                              text-decoration: none; border-radius: 6px; margin-top: 10px;">
                        Tizimga kirish
                    </a>
                    <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
                    <p style="color: #6b7280; font-size: 14px;">Hurmat bilan,<br>ZEDLY jamoasi</p>
                </div>
            `,
            telegram: `🔐 <b>Parol tiklandi</b>\n\n👤 ${user.first_name} ${user.last_name}\n🔑 Vaqtinchalik parol: <code>${newPassword}</code>\n\n⚠️ Tizimga kirib, parolni o'zgartiring!`
        }
    };

    const msg = messages[language] || messages.ru;
    const results = { email: false, telegram: false, in_app: false, delivered: false };
    const emailHtml = buildModernEmailTemplate({
        title: msg.subject,
        eyebrow: language === 'uz' ? 'Xavfsizlik' : 'Security',
        bodyHtml: plainTextToEmailHtml(msg.text),
        ctaText: language === 'uz' ? 'Tizimga kirish' : 'Sign in',
        ctaUrl: `${getAppUrl()}/login.html`,
        footerNote: language === 'uz'
            ? "Parolni iloji boricha tezroq o'zgartiring."
            : 'Please change your password as soon as possible.'
    });

    const fallbackResult = await sendWithFallback({
        user,
        eventKey: 'password_reset',
        emailPayload: {
            subject: msg.subject,
            text: msg.text,
            html: emailHtml
        },
        telegramPayload: {
            message: msg.telegram
        },
        inAppPayload: {
            action: 'notification_password_reset',
            entityType: 'security',
            entityId: user.id || null,
            details: {
                event_key: 'password_reset',
                title: msg.subject,
                message: msg.text
            }
        }
    });

    results.email = fallbackResult.email;
    results.telegram = fallbackResult.telegram;
    results.in_app = fallbackResult.in_app;
    results.delivered = fallbackResult.delivered;

    if (process.env.TELEGRAM_CHAT_ID) {
        const globalTelegram = await sendTelegram(
            process.env.TELEGRAM_CHAT_ID,
            `<b>Password reset</b>\n\nUser: ${escapeHtml(user.first_name)} ${escapeHtml(user.last_name || '')}\nLogin: ${escapeHtml(user.username || '')}`,
            { returnDetails: true }
        );
        const globalOk = !!globalTelegram.ok;
        results.telegram = results.telegram || globalOk;

        await logNotificationAttempt({
            userId: user.id,
            channel: 'telegram',
            eventKey: 'password_reset',
            status: globalOk ? 'sent' : 'failed',
            recipient: process.env.TELEGRAM_CHAT_ID,
            errorMessage: globalOk ? null : (globalTelegram.error || 'Telegram delivery failed'),
            metadata: { scope: 'global' }
        });
    }

    return results;
}

/**
 * Send welcome notification to new user
 * @param {Object} user - User object
 * @param {string} password - Initial password
 * @param {string} language - Language code (ru/uz)
 */
async function notifyNewUser(user, password, language = 'ru') {
    const roleLabels = {
        ru: {
            student: 'ученик',
            teacher: 'учитель',
            psychologist: 'психолог',
            school_admin: 'школьный администратор',
            superadmin: 'супер администратор'
        },
        uz: {
            student: "o'quvchi",
            teacher: "o'qituvchi",
            psychologist: 'psixolog',
            school_admin: 'maktab administratori',
            superadmin: 'super administrator'
        }
    };
    const roleLabel = (roleLabels[language] || roleLabels.ru)[user.role] || user.role || (language === 'uz' ? 'foydalanuvchi' : 'пользователь');

    const messages = {
        ru: {
            subject: 'Добро пожаловать в ZEDLY',
            text: `Здравствуйте, ${user.first_name}!\n\nДля вас создан аккаунт на платформе ZEDLY.\nРоль: ${roleLabel}\n\nЛогин: ${user.username}\nВременный пароль: ${password}\n\nПожалуйста, войдите в систему и создайте постоянный пароль.\n\nС уважением,\nКоманда ZEDLY`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #3b82f6;">Добро пожаловать в ZEDLY!</h2>
                    <p>Здравствуйте, <strong>${user.first_name}</strong>!</p>
                    <p>Для вас создан аккаунт на образовательной платформе ZEDLY.</p>
                    <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <p style="margin: 5px 0;"><strong>Роль:</strong> ${roleLabel}</p>
                        <p style="margin: 5px 0;"><strong>Логин:</strong> ${user.username}</p>
                        <p style="margin: 5px 0;"><strong>Временный пароль:</strong> <code style="background: #e5e7eb; padding: 2px 6px; border-radius: 4px;">${password}</code></p>
                    </div>
                    <p><strong>Важно:</strong> При первом входе вам будет предложено создать постоянный пароль.</p>
                      <a href="${getAppUrl()}/login.html" 
                       style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; 
                              text-decoration: none; border-radius: 6px; margin-top: 10px;">
                        Войти в систему
                    </a>
                    <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
                    <p style="color: #6b7280; font-size: 14px;">С уважением,<br>Команда ZEDLY</p>
                </div>
            `,
            telegram: `👋 <b>Добро пожаловать в ZEDLY!</b>\n\n👤 Роль: <b>${roleLabel}</b>\n🆔 Логин: <code>${user.username}</code>\n🔑 Временный пароль: <code>${password}</code>\n\n⚠️ При первом входе создайте постоянный пароль!`
        },
        uz: {
            subject: 'ZEDLY platformasiga xush kelibsiz',
            text: `Assalomu alaykum, ${user.first_name}!\n\nSiz uchun ZEDLY platformasida akkount yaratildi.\nRol: ${roleLabel}\n\nLogin: ${user.username}\nVaqtinchalik parol: ${password}\n\nIltimos, tizimga kirib doimiy parol yarating.\n\nHurmat bilan,\nZEDLY jamoasi`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #3b82f6;">ZEDLY platformasiga xush kelibsiz!</h2>
                    <p>Assalomu alaykum, <strong>${user.first_name}</strong>!</p>
                    <p>Siz uchun ZEDLY ta'lim platformasida akkount yaratildi.</p>
                    <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <p style="margin: 5px 0;"><strong>Rol:</strong> ${roleLabel}</p>
                        <p style="margin: 5px 0;"><strong>Login:</strong> ${user.username}</p>
                        <p style="margin: 5px 0;"><strong>Vaqtinchalik parol:</strong> <code style="background: #e5e7eb; padding: 2px 6px; border-radius: 4px;">${password}</code></p>
                    </div>
                    <p><strong>Muhim:</strong> Birinchi kirganingizda sizdan doimiy parol yaratish so'raladi.</p>
                      <a href="${getAppUrl()}/login.html" 
                       style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; 
                              text-decoration: none; border-radius: 6px; margin-top: 10px;">
                        Tizimga kirish
                    </a>
                    <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
                    <p style="color: #6b7280; font-size: 14px;">Hurmat bilan,<br>ZEDLY jamoasi</p>
                </div>
            `,
            telegram: `👋 <b>ZEDLY platformasiga xush kelibsiz!</b>\n\n👤 Rol: <b>${roleLabel}</b>\n🆔 Login: <code>${user.username}</code>\n🔑 Vaqtinchalik parol: <code>${password}</code>\n\n⚠️ Birinchi kirishda doimiy parol yarating!`
        }
    };

    const msg = messages[language] || messages.ru;
    const results = { email: false, telegram: false, in_app: false, delivered: false };
    const emailHtml = buildModernEmailTemplate({
        title: msg.subject,
        eyebrow: 'Welcome',
        bodyHtml: plainTextToEmailHtml(msg.text),
        ctaText: language === 'uz' ? 'Tizimga kirish' : 'Sign in',
        ctaUrl: `${getAppUrl()}/login.html`,
        footerNote: language === 'uz'
            ? "Xavfsizlik uchun birinchi kirishda parolni almashtiring."
            : 'For security, change your password on first login.'
    });

    const fallbackResult = await sendWithFallback({
        user,
        eventKey: 'welcome',
        emailPayload: {
            subject: msg.subject,
            text: msg.text,
            html: emailHtml
        },
        telegramPayload: {
            message: msg.telegram
        },
        inAppPayload: {
            action: 'notification_welcome',
            entityType: 'user',
            entityId: user.id || null,
            details: {
                event_key: 'welcome',
                title: msg.subject,
                message: msg.text
            }
        }
    });

    results.email = fallbackResult.email;
    results.telegram = fallbackResult.telegram;
    results.in_app = fallbackResult.in_app;
    results.delivered = fallbackResult.delivered;

    if (process.env.TELEGRAM_CHAT_ID) {
        const globalTelegram = await sendTelegram(
            process.env.TELEGRAM_CHAT_ID,
            `<b>New user created</b>\n\nUser: ${escapeHtml(user.first_name)} ${escapeHtml(user.last_name || '')}\nLogin: ${escapeHtml(user.username || '')}`,
            { returnDetails: true }
        );
        const globalOk = !!globalTelegram.ok;
        results.telegram = results.telegram || globalOk;

        await logNotificationAttempt({
            userId: user.id,
            channel: 'telegram',
            eventKey: 'welcome',
            status: globalOk ? 'sent' : 'failed',
            recipient: process.env.TELEGRAM_CHAT_ID,
            errorMessage: globalOk ? null : (globalTelegram.error || 'Telegram delivery failed'),
            metadata: { scope: 'global' }
        });
    }

    return results;
}

module.exports = {
    isEmailConfigured,
    sendEmail,
    sendVerificationCodeEmail,
    sendTelegram,
    telegramBot,
    sendTelegramToTargets,
    isEventEnabledForChannel,
    getRoleNotificationDefaultsMap,
    invalidateNotificationDefaultsCache,
    notifySystemChange,
    notifyNewTest,
    notifyTestResults,
    notifyPasswordReset,
    notifyNewUser
};
