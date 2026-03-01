const cron = require('node-cron');
const { query } = require('../config/database');
const { sendEmail, sendTelegram, isEventEnabledForChannel } = require('../utils/notifications');

let started = false;

function parseSettings(settings) {
    if (!settings) return {};
    if (typeof settings === 'object' && !Array.isArray(settings)) return settings;
    if (typeof settings === 'string') {
        try {
            const parsed = JSON.parse(settings);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed;
            }
        } catch (_) {
            return {};
        }
    }
    return {};
}

function getUserFrequency(user) {
    const settings = parseSettings(user.settings);
    const frequency = String(settings?.profile?.notification_preferences?.frequency || 'instant')
        .trim()
        .toLowerCase();
    if (frequency === 'daily' || frequency === 'weekly') return frequency;
    return 'instant';
}

function getUserLanguage(user) {
    const settings = parseSettings(user.settings);
    const lang = String(settings.language || '').trim().toLowerCase();
    return lang === 'uz' ? 'uz' : 'ru';
}

function getPeriodStart(now, frequency) {
    const base = new Date(now);
    if (frequency === 'daily') {
        base.setHours(0, 0, 0, 0);
        return base;
    }

    // Weekly period starts on Monday.
    const day = base.getDay();
    const offset = day === 0 ? 6 : day - 1;
    base.setDate(base.getDate() - offset);
    base.setHours(0, 0, 0, 0);
    return base;
}

async function wasDigestSent(userId, frequency, periodStart) {
    const action = frequency === 'weekly' ? 'notification_digest_weekly' : 'notification_digest_daily';
    const result = await query(
        `SELECT 1
         FROM audit_logs
         WHERE user_id = $1
           AND action = $2
           AND created_at >= $3
         LIMIT 1`,
        [userId, action, periodStart]
    );
    return result.rows.length > 0;
}

async function getDigestStats(userId, sinceAt) {
    const result = await query(
        `SELECT
            event_key,
            channel,
            status,
            COUNT(*)::int AS count
         FROM notification_log
         WHERE user_id = $1
           AND created_at >= $2
           AND event_key NOT IN ('digest_daily', 'digest_weekly')
         GROUP BY event_key, channel, status`,
        [userId, sinceAt]
    );

    const rows = result.rows || [];
    const stats = {
        total: 0,
        sent: 0,
        failed: 0,
        byEvent: {},
        byChannel: {}
    };

    for (const row of rows) {
        const count = Number(row.count) || 0;
        stats.total += count;
        if (String(row.status) === 'sent') stats.sent += count;
        if (String(row.status) === 'failed') stats.failed += count;
        stats.byEvent[row.event_key] = (stats.byEvent[row.event_key] || 0) + count;
        stats.byChannel[row.channel] = (stats.byChannel[row.channel] || 0) + count;
    }

    return stats;
}

function renderDigest({ user, frequency, stats, language }) {
    const periodLabel = frequency === 'weekly'
        ? (language === 'uz' ? 'haftalik' : 'еженедельный')
        : (language === 'uz' ? 'kunlik' : 'ежедневный');

    if (stats.total === 0) {
        if (language === 'uz') {
            return {
                subject: `ZEDLY: ${periodLabel} bildirishnoma hisoboti`,
                text: `Salom, ${user.first_name || user.username || ''}!\n\nUshbu davrda yangi bildirishnoma hodisalari topilmadi.`,
                telegram: `<b>ZEDLY ${periodLabel} hisobot</b>\n\nYangi bildirishnomalar topilmadi.`
            };
        }

        return {
            subject: `ZEDLY: ${periodLabel} дайджест уведомлений`,
            text: `Здравствуйте, ${user.first_name || user.username || ''}!\n\nЗа выбранный период новых событий уведомлений не было.`,
            telegram: `<b>ZEDLY ${periodLabel} дайджест</b>\n\nНовых уведомлений за период не было.`
        };
    }

    const topEvents = Object.entries(stats.byEvent)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([key, count]) => `- ${key}: ${count}`)
        .join('\n');

    if (language === 'uz') {
        return {
            subject: `ZEDLY: ${periodLabel} bildirishnoma hisoboti`,
            text: [
                `Salom, ${user.first_name || user.username || ''}!`,
                '',
                `${periodLabel[0].toUpperCase()}${periodLabel.slice(1)} digest:`,
                `Jami: ${stats.total}`,
                `Yuborilgan: ${stats.sent}`,
                `Xatoliklar: ${stats.failed}`,
                '',
                'Top events:',
                topEvents || '-'
            ].join('\n'),
            telegram: [
                `<b>ZEDLY ${periodLabel} hisobot</b>`,
                '',
                `Jami: <b>${stats.total}</b>`,
                `Yuborilgan: <b>${stats.sent}</b>`,
                `Xatoliklar: <b>${stats.failed}</b>`,
                '',
                `Top events:\n${topEvents || '-'}`
            ].join('\n')
        };
    }

    return {
        subject: `ZEDLY: ${periodLabel} дайджест уведомлений`,
        text: [
            `Здравствуйте, ${user.first_name || user.username || ''}!`,
            '',
            `${periodLabel[0].toUpperCase()}${periodLabel.slice(1)} дайджест:`,
            `Всего: ${stats.total}`,
            `Успешно: ${stats.sent}`,
            `Ошибок: ${stats.failed}`,
            '',
            'Топ событий:',
            topEvents || '-'
        ].join('\n'),
        telegram: [
            `<b>ZEDLY ${periodLabel} дайджест</b>`,
            '',
            `Всего: <b>${stats.total}</b>`,
            `Успешно: <b>${stats.sent}</b>`,
            `Ошибок: <b>${stats.failed}</b>`,
            '',
            `Топ событий:\n${topEvents || '-'}`
        ].join('\n')
    };
}

async function logDigestAttempt({ user, channel, frequency, ok, recipient, errorMessage, stats }) {
    const eventKey = frequency === 'weekly' ? 'digest_weekly' : 'digest_daily';
    await query(
        `INSERT INTO notification_log (user_id, channel, event_key, status, recipient, subject, error_message, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
            user.id,
            channel,
            eventKey,
            ok ? 'sent' : 'failed',
            recipient || null,
            null,
            errorMessage || null,
            {
                scope: 'digest',
                frequency,
                total: stats.total,
                sent: stats.sent,
                failed: stats.failed
            }
        ]
    );
}

async function runNotificationDigestOnce(now = new Date()) {
    if (process.env.ENABLE_NOTIFICATION_DIGEST_JOB === 'false') {
        return { candidates: 0, sent: 0, skipped: 0, failed: 0 };
    }

    const usersResult = await query(
        `SELECT id, username, first_name, last_name, role, email, telegram_id, settings
         FROM users
         WHERE is_active = true
           AND (email IS NOT NULL OR telegram_id IS NOT NULL)`
    );

    const users = usersResult.rows || [];
    let sent = 0;
    let skipped = 0;
    let failed = 0;
    let candidates = 0;

    for (const user of users) {
        try {
            const frequency = getUserFrequency(user);
            if (frequency === 'instant') {
                continue;
            }

            const periodStart = getPeriodStart(now, frequency);
            const alreadySent = await wasDigestSent(user.id, frequency, periodStart);
            if (alreadySent) {
                skipped += 1;
                continue;
            }

            candidates += 1;
            const stats = await getDigestStats(user.id, periodStart);
            const language = getUserLanguage(user);
            const content = renderDigest({ user, frequency, stats, language });

            let delivered = false;

            if (user.email && await isEventEnabledForChannel(user, 'email', 'digest_summary')) {
                const emailOk = await sendEmail({
                    to: user.email,
                    subject: content.subject,
                    text: content.text,
                    html: `<pre style="font-family:inherit;white-space:pre-wrap;margin:0;">${content.text}</pre>`
                });
                await logDigestAttempt({
                    user,
                    channel: 'email',
                    frequency,
                    ok: emailOk,
                    recipient: user.email,
                    stats
                });
                delivered = delivered || emailOk;
            }

            if (user.telegram_id && await isEventEnabledForChannel(user, 'telegram', 'digest_summary')) {
                const telegramOk = await sendTelegram(user.telegram_id, content.telegram);
                await logDigestAttempt({
                    user,
                    channel: 'telegram',
                    frequency,
                    ok: telegramOk,
                    recipient: String(user.telegram_id),
                    stats
                });
                delivered = delivered || telegramOk;
            }

            if (delivered) {
                sent += 1;
                await query(
                    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [
                        user.id,
                        frequency === 'weekly' ? 'notification_digest_weekly' : 'notification_digest_daily',
                        'user',
                        user.id,
                        {
                            channels: {
                                email: !!user.email,
                                telegram: !!user.telegram_id
                            },
                            total: stats.total,
                            sent: stats.sent,
                            failed: stats.failed
                        }
                    ]
                );
            } else {
                skipped += 1;
            }
        } catch (error) {
            failed += 1;
            await query(
                `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                    user.id || null,
                    'notification_digest_failed',
                    'user',
                    user.id || null,
                    { error: error.message || 'Digest run failed' }
                ]
            );
        }
    }

    return { candidates, sent, skipped, failed };
}

function startNotificationDigestJob() {
    if (started) return;
    if (process.env.ENABLE_NOTIFICATION_DIGEST_JOB === 'false') return;

    const expression = process.env.NOTIFICATION_DIGEST_CRON || '15 * * * *';
    const timezone = process.env.TZ || 'Asia/Tashkent';

    cron.schedule(expression, async () => {
        try {
            const stats = await runNotificationDigestOnce(new Date());
            console.log('Notification digest job completed:', stats);
        } catch (error) {
            console.error('Notification digest job failed:', error);
        }
    }, { timezone });

    started = true;
    console.log(`Notification digest job started with cron "${expression}" (${timezone})`);

    if (process.env.NOTIFICATION_DIGEST_RUN_ON_START === 'true') {
        runNotificationDigestOnce(new Date())
            .then((stats) => console.log('Notification digest startup run completed:', stats))
            .catch((error) => console.error('Notification digest startup run failed:', error));
    }
}

module.exports = {
    startNotificationDigestJob,
    runNotificationDigestOnce
};
