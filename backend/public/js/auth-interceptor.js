// Authentication + CSRF interceptor for cookie-based auth
(function () {
    'use strict';

    const originalFetch = window.fetch;
    const CSRF_COOKIE_NAME = 'zedly_csrf_token';

    let isRefreshing = false;
    let refreshPromise = null;
    let csrfPromise = null;

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
        return url.includes('/api/auth/login') ||
            url.includes('/api/auth/refresh') ||
            url.includes('/api/auth/csrf-token');
    }

    async function ensureCsrfToken() {
        const existingToken = getCookie(CSRF_COOKIE_NAME);
        if (existingToken) return existingToken;

        if (!csrfPromise) {
            csrfPromise = (async () => {
                const response = await originalFetch('/api/auth/csrf-token', {
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
        const response = await originalFetch('/api/auth/refresh', {
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
        const requestUrl = typeof input === 'string' ? input : String(input?.url || '');

        if (!requestUrl.includes('/api/')) {
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

        let response = await originalFetch(input, nextInit);

        if (!isSafeMethod(method) && !shouldSkipAutoRefresh(requestUrl) && await isCsrfValidationFailed(response)) {
            const freshToken = getCookie(CSRF_COOKIE_NAME) || await ensureCsrfToken();
            if (freshToken) {
                setHeader(headers, 'X-CSRF-Token', freshToken);
                nextInit.headers = headers;
                response = await originalFetch(input, nextInit);
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

                response = await originalFetch(input, nextInit);
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
