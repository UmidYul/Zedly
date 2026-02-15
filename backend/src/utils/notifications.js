const nodemailer = require('nodemailer');
const TelegramBot = require('node-telegram-bot-api');
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

        telegramBot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: shouldPoll });

        if (!shouldPoll) {
            console.log('Telegram polling is disabled for this process.');
        }

        telegramBot.on('polling_error', async (error) => {
            const message = String(error?.message || '');
            const isConflict = error?.code === 'ETELEGRAM' || message.includes('409 Conflict');

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
 * @returns {Promise<boolean>}
 */
async function sendEmail({ to, subject, text, html }) {
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
 * @returns {Promise<boolean>}
 */
async function sendTelegram(chatId, message, options = {}) {
    if (!telegramBot) {
        console.warn('Telegram bot not configured. Skipping Telegram notification.');
        return false;
    }

    if (process.env.ENABLE_TELEGRAM_NOTIFICATIONS === 'false') {
        return false;
    }

    try {
        await telegramBot.sendMessage(chatId, message, {
            parse_mode: 'HTML',
            ...options
        });
        console.log(`Telegram message sent to ${chatId}`);
        return true;
    } catch (error) {
        console.error('Telegram send error:', error);
        return false;
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

function getDefaultNotificationPreferencesByRole(role) {
    const defaults = {
        student: {
            channels: { email: true, telegram: true },
            events: {
                new_test: true,
                assignment_deadline: true,
                password_reset: true,
                profile_updates: true,
                system_updates: false,
                welcome: true
            }
        },
        teacher: {
            channels: { email: true, telegram: true },
            events: {
                new_test: false,
                assignment_deadline: true,
                password_reset: true,
                profile_updates: true,
                system_updates: true,
                welcome: true
            }
        },
        school_admin: {
            channels: { email: true, telegram: true },
            events: {
                new_test: false,
                assignment_deadline: true,
                password_reset: true,
                profile_updates: true,
                system_updates: true,
                welcome: true
            }
        },
        superadmin: {
            channels: { email: true, telegram: true },
            events: {
                new_test: false,
                assignment_deadline: true,
                password_reset: true,
                profile_updates: true,
                system_updates: true,
                welcome: true
            }
        }
    };

    return defaults[role] || defaults.teacher;
}

function isEventEnabledForChannel(user, channel, eventKey) {
    const safeChannel = String(channel || '').trim().toLowerCase();
    const safeEvent = String(eventKey || '').trim().toLowerCase();
    if (!safeChannel || !safeEvent) return false;

    const settings = parseUserSettings(user?.settings);
    const defaults = getDefaultNotificationPreferencesByRole(user?.role);
    const profilePrefs = settings?.profile?.notification_preferences;
    const legacyTelegramPrefs = settings?.telegram_notifications;

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

    let eventEnabled = defaults.events?.[safeEvent] !== false;
    if (profilePrefs?.events && profilePrefs.events[safeEvent] !== undefined) {
        eventEnabled = !!profilePrefs.events[safeEvent];
    }

    if (safeChannel === 'telegram' && legacyTelegramPrefs?.[safeEvent] !== undefined) {
        eventEnabled = !!legacyTelegramPrefs[safeEvent];
    }

    return eventEnabled;
}

function isTelegramEventEnabled(user, eventKey) {
    return isEventEnabledForChannel(user, 'telegram', eventKey);
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
    const results = { email: false, telegram: false };
    const testLink = buildNewTestLink(test);

    // Send email
    if (user.email && isEventEnabledForChannel(user, 'email', 'new_test')) {
        const emailHtml = buildModernEmailTemplate({
            title: msg.subject,
            eyebrow: language === 'uz' ? 'Yangi test' : 'Новый тест',
            bodyHtml: plainTextToEmailHtml(msg.text),
            ctaText: language === 'uz' ? 'Testni ochish' : 'Открыть тест',
            ctaUrl: `${getAppUrl()}/take-test.html?id=${test.id}`,
            footerNote: language === 'uz'
                ? "Ushbu xabar avtomatik yuborildi."
                : 'Это автоматическое сообщение.'
        });

        results.email = await sendEmail({
            to: user.email,
            subject: msg.subject,
            text: msg.text,
            html: emailHtml
        });

        await logNotificationAttempt({
            userId: user.id,
            channel: 'email',
            eventKey: 'new_test',
            status: results.email ? 'sent' : 'failed',
            recipient: user.email,
            subject: msg.subject,
            metadata: { test_id: test.id || null }
        });
    }

    // Send Telegram (role-aware preferences)
    const userChatId = isEventEnabledForChannel(user, 'telegram', 'new_test') ? user.telegram_id : null;
    const openButtonText = language === 'uz' ? 'Testni ochish' : 'Открыть тест';
    const telegramResults = await sendTelegramToTargets(
        userChatId,
        msg.telegram,
        `🆕 <b>Новый тест назначен</b>\n\n👤 ${user.first_name} ${user.last_name || ''}\n📚 ${test.title}`,
        {
            userOptions: {
                reply_markup: {
                    inline_keyboard: [[
                        { text: openButtonText, url: testLink }
                    ]]
                }
            }
        }
    );
    results.telegram = telegramResults.user || telegramResults.global;
    if (userChatId) {
        await logNotificationAttempt({
            userId: user.id,
            channel: 'telegram',
            eventKey: 'new_test',
            status: telegramResults.user ? 'sent' : 'failed',
            recipient: userChatId,
            metadata: { scope: 'user', test_id: test.id || null }
        });
    }
    if (process.env.TELEGRAM_CHAT_ID) {
        await logNotificationAttempt({
            userId: user.id,
            channel: 'telegram',
            eventKey: 'new_test',
            status: telegramResults.global ? 'sent' : 'failed',
            recipient: process.env.TELEGRAM_CHAT_ID,
            metadata: { scope: 'global', test_id: test.id || null }
        });
    }

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
    const results = { email: false, telegram: false };

    // Send email
    if (user.email && isEventEnabledForChannel(user, 'email', 'password_reset')) {
        const emailHtml = buildModernEmailTemplate({
            title: msg.subject,
            eyebrow: language === 'uz' ? 'Xavfsizlik' : 'Безопасность',
            bodyHtml: plainTextToEmailHtml(msg.text),
            ctaText: language === 'uz' ? 'Tizimga kirish' : 'Войти в систему',
            ctaUrl: `${getAppUrl()}/login.html`,
            footerNote: language === 'uz'
                ? "Parolni iloji boricha tezroq o'zgartiring."
                : 'Пожалуйста, смените пароль как можно скорее.'
        });

        results.email = await sendEmail({
            to: user.email,
            subject: msg.subject,
            text: msg.text,
            html: emailHtml
        });

        await logNotificationAttempt({
            userId: user.id,
            channel: 'email',
            eventKey: 'password_reset',
            status: results.email ? 'sent' : 'failed',
            recipient: user.email,
            subject: msg.subject
        });
    }

    // Send Telegram (role-aware preferences)
    const userChatId = isEventEnabledForChannel(user, 'telegram', 'password_reset') ? user.telegram_id : null;
    const telegramResults = await sendTelegramToTargets(
        userChatId,
        msg.telegram,
        `🔐 <b>Пароль сброшен</b>\n\n👤 ${user.first_name} ${user.last_name || ''}\n🆔 ${user.username || ''}`
    );
    results.telegram = telegramResults.user || telegramResults.global;
    if (userChatId) {
        await logNotificationAttempt({
            userId: user.id,
            channel: 'telegram',
            eventKey: 'password_reset',
            status: telegramResults.user ? 'sent' : 'failed',
            recipient: userChatId,
            metadata: { scope: 'user' }
        });
    }
    if (process.env.TELEGRAM_CHAT_ID) {
        await logNotificationAttempt({
            userId: user.id,
            channel: 'telegram',
            eventKey: 'password_reset',
            status: telegramResults.global ? 'sent' : 'failed',
            recipient: process.env.TELEGRAM_CHAT_ID,
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
            school_admin: 'школьный администратор',
            superadmin: 'супер администратор'
        },
        uz: {
            student: "o'quvchi",
            teacher: "o'qituvchi",
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
    const results = { email: false, telegram: false };

    // Send email
    if (user.email && isEventEnabledForChannel(user, 'email', 'welcome')) {
        const emailHtml = buildModernEmailTemplate({
            title: msg.subject,
            eyebrow: 'Welcome',
            bodyHtml: plainTextToEmailHtml(msg.text),
            ctaText: language === 'uz' ? 'Tizimga kirish' : 'Войти в систему',
            ctaUrl: `${getAppUrl()}/login.html`,
            footerNote: language === 'uz'
                ? "Xavfsizlik uchun birinchi kirishda parolni almashtiring."
                : 'Для безопасности смените пароль при первом входе.'
        });

        results.email = await sendEmail({
            to: user.email,
            subject: msg.subject,
            text: msg.text,
            html: emailHtml
        });

        await logNotificationAttempt({
            userId: user.id,
            channel: 'email',
            eventKey: 'welcome',
            status: results.email ? 'sent' : 'failed',
            recipient: user.email,
            subject: msg.subject
        });
    }

    // Send Telegram (role-aware preferences)
    const userChatId = isEventEnabledForChannel(user, 'telegram', 'welcome') ? user.telegram_id : null;
    const telegramResults = await sendTelegramToTargets(
        userChatId,
        msg.telegram,
        `👋 <b>Новый пользователь</b>\n\n👤 ${user.first_name} ${user.last_name || ''}\n🆔 ${user.username || ''}`
    );
    results.telegram = telegramResults.user || telegramResults.global;
    if (userChatId) {
        await logNotificationAttempt({
            userId: user.id,
            channel: 'telegram',
            eventKey: 'welcome',
            status: telegramResults.user ? 'sent' : 'failed',
            recipient: userChatId,
            metadata: { scope: 'user' }
        });
    }
    if (process.env.TELEGRAM_CHAT_ID) {
        await logNotificationAttempt({
            userId: user.id,
            channel: 'telegram',
            eventKey: 'welcome',
            status: telegramResults.global ? 'sent' : 'failed',
            recipient: process.env.TELEGRAM_CHAT_ID,
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
    notifySystemChange,
    notifyNewTest,
    notifyPasswordReset,
    notifyNewUser
};
