// Authentication + CSRF interceptor for cookie-based auth
(function () {
    'use strict';

    const originalFetch = window.fetch;
    const CSRF_COOKIE_NAME = 'zedly_csrf_token';
    const AUTH_CSRF_PATH = '/api/v1/auth/csrf-token';
    const AUTH_REFRESH_PATH = '/api/v1/auth/session/refresh';

    // Compatibility helper for legacy modules that still build Bearer headers.
    // Real auth is cookie-based; this placeholder is stripped in cleanupInvalidAuthorization().
    window.ZedlyAuth = window.ZedlyAuth || {};
    window.ZedlyAuth.getAuthToken = function () {
        return 'cookie-session';
    };

    let isRefreshing = false;
    let refreshPromise = null;
    let csrfPromise = null;

    function getApiBaseUrl() {
        const configured = String(
            window.__ZEDLY_CONFIG__?.API_BASE_URL
            || window.ZEDLY_API_BASE_URL
            || ''
        ).trim();

        if (!configured || configured === '/api' || configured === '/api/v1') {
            return '';
        }

        const normalized = configured.replace(/\/+$/, '');
        if (window.location.protocol === 'https:' && /^http:\/\//i.test(normalized)) {
            return normalized.replace(/^http:\/\//i, 'https://');
        }
        return normalized;
    }

    function normalizeApiUrl(rawUrl) {
        const value = String(rawUrl || '').trim();
        if (!value) return value;

        if (/^https?:\/\//i.test(value)) {
            return value;
        }

        if (!value.startsWith('/api/')) {
            return value;
        }

        const apiBase = getApiBaseUrl();
        if (!apiBase) return value;
        return `${apiBase}${value}`;
    }

    function getPathname(rawUrl) {
        try {
            const parsed = new URL(rawUrl, window.location.origin);
            return parsed.pathname || '';
        } catch (error) {
            return '';
        }
    }

    function isApiPath(rawUrl) {
        return getPathname(rawUrl).startsWith('/api/');
    }

    function clearLegacyAuthStorage() {
        localStorage.removeItem('access_token');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('temp_token');
        localStorage.removeItem('token');
    }

    function getCookie(name) {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
        return match ? decodeURIComponent(match[1]) : '';
    }

    function normalizeHeaders(headers) {
        if (headers instanceof Headers) {
            const normalized = {};
            headers.forEach((value, key) => {
                normalized[key] = value;
            });
            return normalized;
        }
        return { ...(headers || {}) };
    }

    function getHeader(headers, key) {
        const target = String(key).toLowerCase();
        for (const [headerKey, value] of Object.entries(headers || {})) {
            if (String(headerKey).toLowerCase() === target) {
                return value;
            }
        }
        return undefined;
    }

    function setHeader(headers, key, value) {
        const target = String(key).toLowerCase();
        for (const headerKey of Object.keys(headers)) {
            if (String(headerKey).toLowerCase() === target) {
                delete headers[headerKey];
            }
        }
        headers[key] = value;
    }

    function deleteHeader(headers, key) {
        const target = String(key).toLowerCase();
        for (const headerKey of Object.keys(headers)) {
            if (String(headerKey).toLowerCase() === target) {
                delete headers[headerKey];
            }
        }
    }

    function cleanupInvalidAuthorization(headers) {
        const authHeader = getHeader(headers, 'authorization');
        if (authHeader === undefined) return;

        // Browser auth is cookie-based; ignore legacy bearer headers from localStorage code.
        deleteHeader(headers, 'authorization');
    }

    function isSafeMethod(method) {
        const normalized = String(method || 'GET').toUpperCase();
        return normalized === 'GET' || normalized === 'HEAD' || normalized === 'OPTIONS';
    }

    function shouldSkipAutoRefresh(url) {
        const pathname = getPathname(url);
        return pathname.endsWith('/api/auth/login')
            || pathname.endsWith('/api/auth/refresh')
            || pathname.endsWith('/api/auth/csrf-token')
            || pathname.endsWith('/api/v1/auth/session/login')
            || pathname.endsWith('/api/v1/auth/session/refresh')
            || pathname.endsWith('/api/v1/auth/csrf-token')
            || pathname.endsWith('/api/v1/auth/token/login')
            || pathname.endsWith('/api/v1/auth/token/refresh');
    }

    async function ensureCsrfToken() {
        const existingToken = getCookie(CSRF_COOKIE_NAME);
        if (existingToken) return existingToken;

        if (!csrfPromise) {
            csrfPromise = (async () => {
                const response = await originalFetch(normalizeApiUrl(AUTH_CSRF_PATH), {
                    method: 'GET',
                    credentials: 'include'
                });

                if (!response.ok) {
                    throw new Error('Failed to fetch CSRF token');
                }

                const payload = await response.json().catch(() => ({}));
                return payload.csrf_token || getCookie(CSRF_COOKIE_NAME);
            })().finally(() => {
                csrfPromise = null;
            });
        }

        return csrfPromise;
    }

    async function refreshAccessToken() {
        const csrfToken = await ensureCsrfToken();
        const response = await originalFetch(normalizeApiUrl(AUTH_REFRESH_PATH), {
            method: 'POST',
            credentials: 'include',
            headers: {
                'X-CSRF-Token': csrfToken
            }
        });

        if (!response.ok) {
            clearLegacyAuthStorage();
            throw new Error('Token refresh failed');
        }
    }

    async function isCsrfValidationFailed(response) {
        if (!response || response.status !== 403) return false;
        try {
            const payload = await response.clone().json();
            return payload?.error === 'csrf_validation_failed';
        } catch (error) {
            return false;
        }
    }

    function withCredentials(options) {
        return {
            ...options,
            credentials: 'include'
        };
    }

    window.fetch = async function (...args) {
        const [input, init = {}] = args;
        const originalUrl = typeof input === 'string' ? input : String(input?.url || '');
        const requestUrl = normalizeApiUrl(originalUrl);

        if (!isApiPath(requestUrl)) {
            return originalFetch.apply(this, args);
        }

        const method = String(init.method || (typeof input !== 'string' ? input.method : 'GET') || 'GET').toUpperCase();
        const nextInit = withCredentials({ ...init });
        const headers = normalizeHeaders(nextInit.headers);

        cleanupInvalidAuthorization(headers);

        if (!isSafeMethod(method)) {
            const csrfToken = await ensureCsrfToken();
            if (csrfToken) {
                setHeader(headers, 'X-CSRF-Token', csrfToken);
            }
        }

        nextInit.headers = headers;

        let response = await originalFetch(requestUrl, nextInit);

        if (!isSafeMethod(method) && !shouldSkipAutoRefresh(requestUrl) && await isCsrfValidationFailed(response)) {
            const freshToken = getCookie(CSRF_COOKIE_NAME) || await ensureCsrfToken();
            if (freshToken) {
                setHeader(headers, 'X-CSRF-Token', freshToken);
                nextInit.headers = headers;
                response = await originalFetch(requestUrl, nextInit);
            }
        }

        if (response.status === 401 && !shouldSkipAutoRefresh(requestUrl)) {
            try {
                if (isRefreshing) {
                    await refreshPromise;
                } else {
                    isRefreshing = true;
                    refreshPromise = refreshAccessToken();
                    await refreshPromise;
                    isRefreshing = false;
                    refreshPromise = null;
                }

                response = await originalFetch(requestUrl, nextInit);
            } catch (error) {
                isRefreshing = false;
                refreshPromise = null;
                clearLegacyAuthStorage();

                if (!window.location.pathname.includes('/login') &&
                    !window.location.pathname.includes('/change-password')) {
                    window.location.href = '/login';
                }
            }
        }

        return response;
    };

    console.log('Auth interceptor initialized (cookie + CSRF) ✓');
})();
