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
                <div style="text-align:center; padding: 24px;">
                    <div class="spinner" style="display:inline-block;"></div>
                    <p style="margin-top:10px; color:var(--text-secondary);">${safe || t('common.loading', 'Loading...')}</p>
                </div>
            `;
        }
        if (kind === 'empty') {
            return `<p class="text-secondary" style="padding: 10px 0;">${safe || t('common.empty', 'No data')}</p>`;
        }
        return `<div class="error-message"><p>${safe || t('common.error', 'Unexpected error')}</p></div>`;
    }

    function renderIntegrationBadge(mode, endpoint) {
        const isMock = mode === 'mock';
        const label = isMock ? 'Mock mode' : 'API mode';
        const color = isMock ? 'var(--warning, #f59e0b)' : 'var(--success, #16a34a)';
        const safeEndpoint = escapeHtml(endpoint || '');

        return `
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
                <span style="display:inline-block; font-size:12px; font-weight:600; color:${color}; border:1px solid ${color}; border-radius:999px; padding:3px 10px;">
                    ${label}
                </span>
                ${safeEndpoint ? `<code style="font-size:12px; color: var(--text-secondary);">${safeEndpoint}</code>` : ''}
            </div>
        `;
    }

    async function fetchWithFallback(endpoint, mockFactory, init) {
        try {
            const response = await fetch(endpoint, init);
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
        fetchWithFallback
    };
})();
