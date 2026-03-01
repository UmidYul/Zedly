const cron = require('node-cron');
const { query } = require('../config/database');
const { sendTelegram } = require('../utils/notifications');

const COLUMN_CACHE = new Map();
let started = false;

async function getTableColumns(tableName) {
    if (COLUMN_CACHE.has(tableName)) {
        return COLUMN_CACHE.get(tableName);
    }

    const result = await query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1`,
        [tableName]
    );

    const columns = new Set(result.rows.map((row) => row.column_name));
    COLUMN_CACHE.set(tableName, columns);
    return columns;
}

function pickColumn(columns, candidates) {
    for (const candidate of candidates) {
        if (columns.has(candidate)) return candidate;
    }
    return null;
}

function parseSettings(settings) {
    if (!settings) return {};
    if (typeof settings === 'object' && !Array.isArray(settings)) return settings;
    if (typeof settings === 'string') {
        try {
            const parsed = JSON.parse(settings);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
        } catch (_) {
            return {};
        }
    }
    return {};
}

function isDeadlineReminderEnabled(settings) {
    const parsed = parseSettings(settings);
    const prefs = parsed.telegram_notifications;
    if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) return true;
    if (prefs.enabled === false) return false;
    if (prefs.deadline_reminder !== undefined) return !!prefs.deadline_reminder;
    if (prefs.new_test !== undefined) return !!prefs.new_test;
    return true;
}

function getPreferredLanguage(settings) {
    const parsed = parseSettings(settings);
    const lang = String(parsed.language || '').trim().toLowerCase();
    return lang === 'uz' ? 'uz' : 'ru';
}

function formatDeadline(dateValue, lang) {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return String(dateValue || '');

    const locale = lang === 'uz' ? 'uz-UZ' : 'ru-RU';
    return date.toLocaleString(locale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function buildDeadlineMessage(item, lang) {
    const deadline = formatDeadline(item.end_at, lang);
    const className = item.class_name || '-';
    const testTitle = item.test_title || 'Test';

    if (lang === 'uz') {
        return [
            '<b>Eslatma: test muddati yaqin</b>',
            '',
            `Fan/Test: ${testTitle}`,
            `Sinf: ${className}`,
            `Muddat: ${deadline}`
        ].join('\n');
    }

    return [
        '<b>Напоминание: дедлайн теста скоро</b>',
        '',
        `Тест: ${testTitle}`,
        `Класс: ${className}`,
        `Дедлайн: ${deadline}`
    ].join('\n');
}

async function wasReminderSentToday(userId, assignmentId) {
    const result = await query(
        `SELECT 1
         FROM audit_logs
         WHERE user_id = $1
           AND action = 'deadline_reminder'
           AND entity_type = 'test_assignment'
           AND entity_id = $2
           AND created_at >= CURRENT_DATE
         LIMIT 1`,
        [userId, assignmentId]
    );
    return result.rows.length > 0;
}

async function fetchUpcomingDeadlineRows(hoursAhead = 24) {
    const assignmentColumns = await getTableColumns('test_assignments');
    const testColumns = await getTableColumns('tests');
    const classStudentColumns = await getTableColumns('class_students');

    const endColumn = pickColumn(assignmentColumns, ['end_date', 'end_at', 'ends_at']);
    const activeColumn = pickColumn(assignmentColumns, ['is_active', 'active']);
    const titleColumn = pickColumn(testColumns, ['title', 'title_ru', 'title_uz']) || 'title';
    const classStudentActiveClause = classStudentColumns.has('is_active')
        ? 'AND cs.is_active = true'
        : '';

    if (!endColumn) {
        return [];
    }

    const activeClause = activeColumn ? `AND ta.${activeColumn} = true` : '';

    const result = await query(
        `SELECT
            ta.id as assignment_id,
            ta.${endColumn} as end_at,
            t.${titleColumn} as test_title,
            c.name as class_name,
            u.id as user_id,
            u.first_name,
            u.last_name,
            u.telegram_id,
            u.settings
         FROM test_assignments ta
         JOIN tests t ON t.id = ta.test_id
         JOIN classes c ON c.id = ta.class_id
         JOIN class_students cs ON cs.class_id = ta.class_id ${classStudentActiveClause}
         JOIN users u ON u.id = cs.student_id
         WHERE u.role = 'student'
           AND u.is_active = true
           AND u.telegram_id IS NOT NULL
           AND ta.${endColumn} IS NOT NULL
           ${activeClause}
           AND ta.${endColumn} > NOW()
           AND ta.${endColumn} <= NOW() + ($1 * INTERVAL '1 hour')`,
        [hoursAhead]
    );

    return result.rows || [];
}

async function runDeadlineReminderOnce() {
    if (process.env.ENABLE_TELEGRAM_NOTIFICATIONS === 'false') {
        return { sent: 0, skipped: 0, failed: 0 };
    }

    const hoursAhead = Math.max(1, parseInt(process.env.DEADLINE_REMINDER_HOURS || '24', 10));
    const rows = await fetchUpcomingDeadlineRows(hoursAhead);

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of rows) {
        try {
            if (!isDeadlineReminderEnabled(row.settings)) {
                skipped += 1;
                continue;
            }

            const alreadySent = await wasReminderSentToday(row.user_id, row.assignment_id);
            if (alreadySent) {
                skipped += 1;
                continue;
            }

            const lang = getPreferredLanguage(row.settings);
            const message = buildDeadlineMessage(row, lang);
            const ok = await sendTelegram(row.telegram_id, message);

            if (ok) {
                sent += 1;
                await query(
                    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [
                        row.user_id,
                        'deadline_reminder',
                        'test_assignment',
                        row.assignment_id,
                        {
                            channel: 'telegram',
                            hours_ahead: hoursAhead,
                            class_name: row.class_name,
                            test_title: row.test_title
                        }
                    ]
                );
            } else {
                failed += 1;
            }
        } catch (error) {
            failed += 1;
            await query(
                `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                    row.user_id || null,
                    'deadline_reminder_failed',
                    'test_assignment',
                    row.assignment_id || null,
                    { error: error.message || 'Failed to send deadline reminder' }
                ]
            );
        }
    }

    return { sent, skipped, failed };
}

function startDeadlineReminderJob() {
    if (started) return;
    if (process.env.ENABLE_DEADLINE_REMINDER_JOB === 'false') return;

    const expression = process.env.DEADLINE_REMINDER_CRON || '0 * * * *';
    const timezone = process.env.TZ || 'Asia/Tashkent';

    cron.schedule(expression, async () => {
        try {
            const stats = await runDeadlineReminderOnce();
            console.log('Deadline reminder job completed:', stats);
        } catch (error) {
            console.error('Deadline reminder job failed:', error);
        }
    }, { timezone });

    started = true;
    console.log(`Deadline reminder job started with cron "${expression}" (${timezone})`);

    if (process.env.DEADLINE_REMINDER_RUN_ON_START === 'true') {
        runDeadlineReminderOnce()
            .then((stats) => console.log('Deadline reminder startup run completed:', stats))
            .catch((error) => console.error('Deadline reminder startup run failed:', error));
    }
}

module.exports = {
    startDeadlineReminderJob,
    runDeadlineReminderOnce
};

