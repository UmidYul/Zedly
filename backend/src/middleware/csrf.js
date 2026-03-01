const crypto = require('crypto');
const { CSRF_COOKIE_NAME, getCookieValue, setCsrfCookie } = require('../utils/cookies');

function isSafeMethod(method) {
    const normalized = String(method || '').toUpperCase();
    return normalized === 'GET' || normalized === 'HEAD' || normalized === 'OPTIONS';
}

function issueCsrfToken(req, res) {
    const csrfToken = crypto.randomBytes(32).toString('hex');
    setCsrfCookie(req, res, csrfToken);
    return csrfToken;
}

function ensureCsrfCookie(req, res, next) {
    const existingToken = getCookieValue(req, CSRF_COOKIE_NAME);
    req.csrfToken = existingToken || issueCsrfToken(req, res);
    next();
}

function isCsrfExemptAuthRoute(path) {
    const normalized = String(path || '').toLowerCase();
    return normalized === '/auth/login'
        || normalized === '/auth/refresh'
        || normalized === '/v1/auth/session/login'
        || normalized === '/v1/auth/session/refresh'
        || normalized === '/auth/session/login'
        || normalized === '/auth/session/refresh'
        || normalized === '/v1/auth/token/login'
        || normalized === '/v1/auth/token/refresh'
        || normalized === '/auth/token/login'
        || normalized === '/auth/token/refresh';
}

function verifyCsrfToken(req, res, next) {
    if (isSafeMethod(req.method)) {
        return next();
    }

    const path = String(req.path || '');
    if (isCsrfExemptAuthRoute(path)) {
        return next();
    }

    // Backward compatibility for legacy Bearer-token frontend:
    // custom Authorization header is not CSRFable in normal browser requests.
    const authHeader = String(req.headers.authorization || '');
    if (authHeader.startsWith('Bearer ')) {
        return next();
    }

    const cookieToken = getCookieValue(req, CSRF_COOKIE_NAME);
    const headerToken = String(req.headers['x-csrf-token'] || '').trim();

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
        return res.status(403).json({
            error: 'csrf_validation_failed',
            message: 'CSRF token is missing or invalid'
        });
    }

    return next();
}

module.exports = {
    issueCsrfToken,
    ensureCsrfCookie,
    verifyCsrfToken
};
