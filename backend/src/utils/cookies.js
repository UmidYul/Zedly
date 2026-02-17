const ACCESS_COOKIE_NAME = 'zedly_access_token';
const REFRESH_COOKIE_NAME = 'zedly_refresh_token';
const TEMP_COOKIE_NAME = 'zedly_temp_token';
const CSRF_COOKIE_NAME = 'zedly_csrf_token';

const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes
const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const REFRESH_TOKEN_REMEMBER_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const TEMP_TOKEN_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes
const CSRF_TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

function normalizeSameSite(rawSameSite) {
    const value = String(rawSameSite || 'Strict').trim().toLowerCase();
    if (value === 'none') return 'None';
    if (value === 'lax') return 'Lax';
    return 'Strict';
}

function shouldUseSecureCookies(req) {
    const envValue = String(process.env.COOKIE_SECURE || '').trim().toLowerCase();
    if (envValue === 'true') return true;
    if (envValue === 'false') return false;

    if (req.secure) return true;
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
    if (forwardedProto.includes('https')) return true;

    return process.env.NODE_ENV === 'production';
}

function getCookieOptions(req, { httpOnly = true, maxAge } = {}) {
    const options = {
        httpOnly,
        secure: shouldUseSecureCookies(req),
        sameSite: normalizeSameSite(process.env.COOKIE_SAME_SITE),
        path: '/'
    };

    if (Number.isFinite(maxAge)) {
        options.maxAge = maxAge;
    }

    return options;
}

function parseCookies(req) {
    const raw = String(req.headers.cookie || '');
    if (!raw) return {};

    return raw.split(';').reduce((acc, pair) => {
        const index = pair.indexOf('=');
        if (index < 0) return acc;

        const key = pair.slice(0, index).trim();
        const value = pair.slice(index + 1).trim();
        if (!key) return acc;

        try {
            acc[key] = decodeURIComponent(value);
        } catch (error) {
            acc[key] = value;
        }
        return acc;
    }, {});
}

function getCookieValue(req, name) {
    const cookies = parseCookies(req);
    return cookies[name];
}

function setAuthCookies(req, res, { accessToken, refreshToken, remember }) {
    const refreshMaxAge = remember ? REFRESH_TOKEN_REMEMBER_MAX_AGE_MS : REFRESH_TOKEN_MAX_AGE_MS;

    res.cookie(
        ACCESS_COOKIE_NAME,
        accessToken,
        getCookieOptions(req, { httpOnly: true, maxAge: ACCESS_TOKEN_MAX_AGE_MS })
    );
    res.cookie(
        REFRESH_COOKIE_NAME,
        refreshToken,
        getCookieOptions(req, { httpOnly: true, maxAge: refreshMaxAge })
    );

    const clearTempOptions = getCookieOptions(req, { httpOnly: true, maxAge: 0 });
    clearTempOptions.expires = new Date(0);
    res.cookie(TEMP_COOKIE_NAME, '', clearTempOptions);
}

function setTempAuthCookie(req, res, tempToken) {
    res.cookie(
        TEMP_COOKIE_NAME,
        tempToken,
        getCookieOptions(req, { httpOnly: true, maxAge: TEMP_TOKEN_MAX_AGE_MS })
    );
}

function clearAuthCookies(req, res) {
    const clearOptions = getCookieOptions(req, { httpOnly: true, maxAge: 0 });
    clearOptions.expires = new Date(0);

    res.cookie(ACCESS_COOKIE_NAME, '', clearOptions);
    res.cookie(REFRESH_COOKIE_NAME, '', clearOptions);
    res.cookie(TEMP_COOKIE_NAME, '', clearOptions);
}

function setCsrfCookie(req, res, csrfToken) {
    res.cookie(
        CSRF_COOKIE_NAME,
        csrfToken,
        getCookieOptions(req, { httpOnly: false, maxAge: CSRF_TOKEN_MAX_AGE_MS })
    );
}

function clearCsrfCookie(req, res) {
    const clearOptions = getCookieOptions(req, { httpOnly: false, maxAge: 0 });
    clearOptions.expires = new Date(0);
    res.cookie(CSRF_COOKIE_NAME, '', clearOptions);
}

module.exports = {
    ACCESS_COOKIE_NAME,
    REFRESH_COOKIE_NAME,
    TEMP_COOKIE_NAME,
    CSRF_COOKIE_NAME,
    parseCookies,
    getCookieValue,
    setAuthCookies,
    setTempAuthCookie,
    clearAuthCookies,
    setCsrfCookie,
    clearCsrfCookie
};
