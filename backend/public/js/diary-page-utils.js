// Shared helpers for diary pages (Phase 1)
(function () {
    'use strict';

    function t(key, fallback) {
        return window.ZedlyI18n?.translate?.(key) || fallback || key;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function renderState(kind, message) {
        const safe = escapeHtml(message || '');
        if (kind === 'loading') {
            return `
                <div class="diary-state diary-state-loading">
                    <div class="spinner" style="display:inline-block;"></div>
                    <p>${safe || t('common.loading', 'Loading...')}</p>
                </div>
            `;
        }
        if (kind === 'empty') {
            return `<div class="diary-state diary-state-empty"><p>${safe || t('common.empty', 'No data')}</p></div>`;
        }
        return `<div class="diary-state diary-state-error"><p>${safe || t('common.error', 'Unexpected error')}</p></div>`;
    }

    function renderIntegrationBadge(mode, endpoint) {
        const isMock = mode === 'mock';
        const label = isMock ? 'Mock mode' : 'API mode';
        const safeEndpoint = escapeHtml(endpoint || '');

        return `
            <div class="diary-integration-row">
                <span class="diary-badge ${isMock ? 'diary-badge-warning' : 'diary-badge-success'}">
                    ${escapeHtml(label)}
                </span>
                ${safeEndpoint ? `<code>${safeEndpoint}</code>` : ''}
            </div>
        `;
    }

    function getRole() {
        try {
            const raw = localStorage.getItem('user');
            if (!raw) return null;
            const user = JSON.parse(raw);
            return user?.role || null;
        } catch (error) {
            return null;
        }
    }

    function getAuthToken() {
        return window.ZedlyAuth?.getAuthToken?.() || 'cookie-session';
    }

    function withAuthHeaders(init) {
        const headers = { ...(init?.headers || {}) };
        if (!headers.Authorization && !headers.authorization) {
            headers.Authorization = `Bearer ${getAuthToken()}`;
        }
        return { ...(init || {}), headers, credentials: 'include' };
    }

    async function fetchWithFallback(endpoint, mockFactory, init) {
        try {
            const response = await fetch(endpoint, withAuthHeaders(init));
            if (response.ok) {
                const data = await response.json().catch(() => ({}));
                return { integrationStatus: 'api', data, endpoint };
            }

            if (response.status === 404 || response.status === 501) {
                return { integrationStatus: 'mock', data: mockFactory(), endpoint };
            }

            throw new Error(`HTTP ${response.status}`);
        } catch (error) {
            return { integrationStatus: 'mock', data: mockFactory(), endpoint, error };
        }
    }

    window.ZedlyDiaryUtils = {
        t,
        escapeHtml,
        renderState,
        renderIntegrationBadge,
        fetchWithFallback,
        getRole
    };
})();
