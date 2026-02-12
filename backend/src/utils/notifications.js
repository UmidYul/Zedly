const nodemailer = require('nodemailer');
const TelegramBot = require('node-telegram-bot-api');

function getAppUrl() {
    return process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:5000';
}

/**
 * Email Transporter Configuration
 * Настройте SMTP в .env файле
 */
const emailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD || process.env.SMTP_PASS
    }
});

/**
 * Telegram Bot Configuration
 * Настройте TELEGRAM_BOT_TOKEN в .env файле
 */
let telegramBot = null;
if (process.env.TELEGRAM_BOT_TOKEN) {
    try {
        const useWebhook = process.env.TELEGRAM_USE_WEBHOOK === 'true';
        telegramBot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: !useWebhook });
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
    if (!process.env.SMTP_USER || !(process.env.SMTP_PASSWORD || process.env.SMTP_PASS)) {
        console.warn('Email not configured. Skipping email notification.');
        return false;
    }

    try {
        await emailTransporter.sendMail({
            from: `"ZEDLY Platform" <${process.env.SMTP_USER}>`,
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

function getDefaultTelegramPreferencesByRole(role) {
    const defaults = {
        student: { enabled: true, new_test: true, password_reset: true, welcome: true },
        teacher: { enabled: true, password_reset: true, welcome: true },
        school_admin: { enabled: true, password_reset: true, welcome: true },
        superadmin: { enabled: true, password_reset: true, welcome: true }
    };

    return defaults[role] || { enabled: true, password_reset: true, welcome: true };
}

function isTelegramEventEnabled(user, eventKey) {
    const settings = parseUserSettings(user?.settings);
    const defaults = getDefaultTelegramPreferencesByRole(user?.role);
    const prefs = settings.telegram_notifications;

    if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) {
        return defaults[eventKey] !== false;
    }

    if (prefs.enabled === false) {
        return false;
    }

    if (prefs[eventKey] !== undefined) {
        return !!prefs[eventKey];
    }

    return defaults[eventKey] !== false;
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
    if (user.email) {
        results.email = await sendEmail({
            to: user.email,
            subject: msg.subject,
            text: msg.text,
            html: msg.html
        });
    }

    // Send Telegram (role-aware preferences)
    const userChatId = isTelegramEventEnabled(user, 'new_test') ? user.telegram_id : null;
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
    if (user.email) {
        results.email = await sendEmail({
            to: user.email,
            subject: msg.subject,
            text: msg.text,
            html: msg.html
        });
    }

    // Send Telegram (role-aware preferences)
    const userChatId = isTelegramEventEnabled(user, 'password_reset') ? user.telegram_id : null;
    const telegramResults = await sendTelegramToTargets(
        userChatId,
        msg.telegram,
        `🔐 <b>Пароль сброшен</b>\n\n👤 ${user.first_name} ${user.last_name || ''}\n🆔 ${user.username || ''}`
    );
    results.telegram = telegramResults.user || telegramResults.global;

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
    if (user.email) {
        results.email = await sendEmail({
            to: user.email,
            subject: msg.subject,
            text: msg.text,
            html: msg.html
        });
    }

    // Send Telegram (role-aware preferences)
    const userChatId = isTelegramEventEnabled(user, 'welcome') ? user.telegram_id : null;
    const telegramResults = await sendTelegramToTargets(
        userChatId,
        msg.telegram,
        `👋 <b>Новый пользователь</b>\n\n👤 ${user.first_name} ${user.last_name || ''}\n🆔 ${user.username || ''}`
    );
    results.telegram = telegramResults.user || telegramResults.global;

    return results;
}

module.exports = {
    sendEmail,
    sendTelegram,
    telegramBot,
    sendTelegramToTargets,
    notifySystemChange,
    notifyNewTest,
    notifyPasswordReset,
    notifyNewUser
};
