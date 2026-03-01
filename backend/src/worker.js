const { loadEnv } = require('../scripts/load-env');
loadEnv();
const { pool } = require('./config/database');

const WORKER_LOCK_ID = 9_743_210;
let lockClient = null;

async function acquireWorkerLock() {
    lockClient = await pool.connect();
    const result = await lockClient.query(
        'SELECT pg_try_advisory_lock($1) AS locked',
        [WORKER_LOCK_ID]
    );
    return !!result.rows[0]?.locked;
}

async function releaseWorkerLock() {
    if (!lockClient) return;
    try {
        await lockClient.query('SELECT pg_advisory_unlock($1)', [WORKER_LOCK_ID]);
    } catch (error) {
        console.error('[worker] Failed to release advisory lock:', error.message);
    } finally {
        lockClient.release();
        lockClient = null;
    }
}

async function startWorker() {
    const hasLock = await acquireWorkerLock();
    if (!hasLock) {
        console.error('[worker] Another worker instance already owns the advisory lock. Exiting.');
        process.exit(1);
        return;
    }

    console.log('[worker] Advisory lock acquired. Starting background jobs...');

    const { startDeadlineReminderJob } = require('./jobs/deadlineReminders');
    const { startNotificationDigestJob } = require('./jobs/notificationDigest');

    startDeadlineReminderJob();
    startNotificationDigestJob();

    console.log('[worker] Background jobs started.');
}

async function shutdown(signal) {
    console.log(`[worker] Received ${signal}. Shutting down...`);
    await releaseWorkerLock();
    await pool.end();
    process.exit(0);
}

process.on('SIGINT', () => {
    shutdown('SIGINT').catch((error) => {
        console.error('[worker] Shutdown error:', error);
        process.exit(1);
    });
});

process.on('SIGTERM', () => {
    shutdown('SIGTERM').catch((error) => {
        console.error('[worker] Shutdown error:', error);
        process.exit(1);
    });
});

process.on('uncaughtException', async (error) => {
    console.error('[worker] Uncaught exception:', error);
    await shutdown('uncaughtException');
});

process.on('unhandledRejection', async (reason) => {
    console.error('[worker] Unhandled rejection:', reason);
    await shutdown('unhandledRejection');
});

startWorker().catch(async (error) => {
    console.error('[worker] Failed to start:', error);
    await releaseWorkerLock();
    await pool.end();
    process.exit(1);
});
