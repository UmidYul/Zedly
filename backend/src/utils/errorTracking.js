let sentry = null;
let isInitialized = false;

function loadSentry() {
    if (sentry) return sentry;
    try {
        // Optional dependency: service keeps working if package is not installed.
        // eslint-disable-next-line global-require, import/no-extraneous-dependencies
        sentry = require('@sentry/node');
        return sentry;
    } catch (_) {
        return null;
    }
}

function initErrorTracking() {
    if (isInitialized) return { enabled: true, provider: 'sentry' };

    const dsn = process.env.SENTRY_DSN;
    if (!dsn) return { enabled: false, reason: 'SENTRY_DSN is not set' };

    const sdk = loadSentry();
    if (!sdk) return { enabled: false, reason: '@sentry/node is not installed' };

    try {
        sdk.init({
            dsn,
            environment: process.env.NODE_ENV || 'development',
            release: process.env.APP_VERSION || process.env.npm_package_version || undefined,
            tracesSampleRate: Number.parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0') || 0
        });
        isInitialized = true;
        return { enabled: true, provider: 'sentry' };
    } catch (error) {
        return { enabled: false, reason: error.message || 'Sentry init failed' };
    }
}

function captureException(error, context = {}) {
    const sdk = loadSentry();
    if (!sdk || !isInitialized) return false;
    try {
        sdk.withScope((scope) => {
            if (context.tags && typeof context.tags === 'object') {
                Object.entries(context.tags).forEach(([key, value]) => {
                    if (value !== undefined && value !== null) scope.setTag(String(key), String(value));
                });
            }
            if (context.extra && typeof context.extra === 'object') {
                scope.setExtras(context.extra);
            }
            if (context.user && typeof context.user === 'object') {
                scope.setUser(context.user);
            }
            sdk.captureException(error);
        });
        return true;
    } catch (_) {
        return false;
    }
}

function captureMessage(message, level = 'info', context = {}) {
    const sdk = loadSentry();
    if (!sdk || !isInitialized) return false;
    try {
        sdk.withScope((scope) => {
            if (context.tags && typeof context.tags === 'object') {
                Object.entries(context.tags).forEach(([key, value]) => {
                    if (value !== undefined && value !== null) scope.setTag(String(key), String(value));
                });
            }
            if (context.extra && typeof context.extra === 'object') {
                scope.setExtras(context.extra);
            }
            sdk.captureMessage(message, level);
        });
        return true;
    } catch (_) {
        return false;
    }
}

module.exports = {
    initErrorTracking,
    captureException,
    captureMessage
};
