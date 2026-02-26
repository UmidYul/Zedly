(function () {
    'use strict';

    const nativeFetch = window.fetch.bind(window);

    function getConfiguredApiBase() {
        const raw = String(
            window.__ZEDLY_CONFIG__?.API_BASE_URL
            || window.ZEDLY_API_BASE_URL
            || ''
        ).trim();

        if (!raw || raw === '/api' || raw === '/api/v1') {
            return '';
        }

        return raw.replace(/\/+$/, '');
    }

    function toUrl(path) {
        const value = String(path || '').trim();
        if (!value) return value;

        if (/^https?:\/\//i.test(value)) {
            return value;
        }

        const normalizedPath = value.startsWith('/') ? value : `/${value}`;
        if (!normalizedPath.startsWith('/api/')) {
            return normalizedPath;
        }

        const base = getConfiguredApiBase();
        return base ? `${base}${normalizedPath}` : normalizedPath;
    }

    async function apiFetch(path, init) {
        return fetch(toUrl(path), init);
    }

    window.fetch = function (input, init) {
        if (typeof input === 'string') {
            return nativeFetch(toUrl(input), init);
        }
        return nativeFetch(input, init);
    };

    window.ZedlyApi = {
        getBaseUrl: getConfiguredApiBase,
        toUrl,
        fetch: apiFetch
    };
})();
