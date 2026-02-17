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

function verifyCsrfToken(req, res, next) {
    if (isSafeMethod(req.method)) {
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
