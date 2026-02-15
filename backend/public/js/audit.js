// SuperAdmin Audit Center
(function () {
    'use strict';

    const API = '/api/superadmin/audit';
    const state = {
        filters: {
            search: '',
            action: '',
            entity_type: '',
            actor_role: '',
            status: '',
            from: '',
            to: ''
        },
        logs: [],
        pagination: { page: 1, limit: 25, total: 0, pages: 1 },
        summary: null,
        autoRefresh: false,
        autoTimer: null,
        selected: null
    };

    function token() {
        return localStorage.getItem('access_token') || '';
    }

    async function apiGet(url) {
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${token()}` }
        });
        if (!response.ok) throw new Error(`Request failed: ${response.status}`);
        return response.json();
    }

    function esc(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function fmtInt(value) {
        const n = Number(value);
        return Number.isFinite(n) ? n.toLocaleString('ru-RU') : '0';
    }

    function readFiltersFromUi() {
        const v = (id) => document.getElementById(id)?.value || '';
        state.filters.search = String(v('auditSearch')).trim();
        state.filters.action = String(v('auditActionFilter')).trim();
        state.filters.entity_type = String(v('auditEntityFilter')).trim();
        state.filters.actor_role = String(v('auditRoleFilter')).trim();
        state.filters.status = String(v('auditStatusFilter')).trim();
        state.filters.from = String(v('auditFromFilter')).trim();
        state.filters.to = String(v('auditToFilter')).trim();
        state.pagination.limit = Number.parseInt(String(v('auditPageSize') || '25'), 10) || 25;
    }

    function buildQuery(extra = {}) {
        const params = new URLSearchParams();
        const payload = {
            ...state.filters,
            page: state.pagination.page,
            limit: state.pagination.limit,
            ...extra
        };
        for (const [k, v] of Object.entries(payload)) {
            if (v !== undefined && v !== null && String(v) !== '') {
                params.set(k, String(v));
            }
        }
        return params.toString();
    }

    async function loadFacets() {
        const data = await apiGet(`${API}/facets`);
        const fill = (id, rows, field) => {
            const el = document.getElementById(id);
            if (!el) return;
            const current = el.value;
            const options = [`<option value="">All</option>`].concat(
                (rows || []).map((row) => `<option value="${esc(row[field])}">${esc(row[field])} (${fmtInt(row.count)})</option>`)
            );
            el.innerHTML = options.join('');
            el.value = current;
        };
        fill('auditActionFilter', data.actions, 'action');
        fill('auditEntityFilter', data.entity_types, 'entity_type');
        fill('auditRoleFilter', data.actor_roles, 'role');
    }

    function renderKpi() {
        const wrap = document.getElementById('auditKpiGrid');
        if (!wrap) return;
        const kpi = state.summary?.kpi || {};
        const topAction = state.summary?.top_actions?.[0]?.action || '-';
        wrap.innerHTML = `
            <div class="report-kpi tone-blue"><span>Total Events</span><strong>${fmtInt(kpi.total_events)}</strong></div>
            <div class="report-kpi tone-cyan"><span>Unique Actors</span><strong>${fmtInt(kpi.unique_actors)}</strong></div>
            <div class="report-kpi tone-rose"><span>Failed Events</span><strong>${fmtInt(kpi.failed_events)}</strong></div>
            <div class="report-kpi tone-violet"><span>Top Action</span><strong>${esc(topAction)}</strong></div>
        `;
    }

    function renderTopActions() {
        const el = document.getElementById('auditTopActions');
        if (!el) return;
        const rows = state.summary?.top_actions || [];
        if (!rows.length) {
            el.innerHTML = '<p class="text-secondary">No data</p>';
            return;
        }
        const max = Math.max(...rows.map((r) => Number(r.count) || 0), 1);
        el.innerHTML = rows.map((row) => {
            const pct = Math.round(((Number(row.count) || 0) / max) * 100);
            return `
                <div class="audit-bar-row">
                    <div class="audit-bar-label">${esc(row.action || '-')}</div>
                    <div class="audit-bar-track"><div class="audit-bar-fill" style="width:${pct}%"></div></div>
                    <div class="audit-bar-value">${fmtInt(row.count)}</div>
                </div>
            `;
        }).join('');
    }

    function renderTopActors() {
        const el = document.getElementById('auditTopActors');
        if (!el) return;
        const rows = state.summary?.top_actors || [];
        if (!rows.length) {
            el.innerHTML = '<p class="text-secondary">No data</p>';
            return;
        }
        el.innerHTML = `
            <div class="table-responsive">
                <table class="data-table">
                    <thead><tr><th>Actor</th><th>Role</th><th>Events</th></tr></thead>
                    <tbody>
                        ${rows.map((row) => `
                            <tr>
                                <td>${esc(row.username || 'system')}</td>
                                <td>${esc(row.role || '-')}</td>
                                <td>${fmtInt(row.count)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    function renderTimeline() {
        const el = document.getElementById('auditTimeline');
        if (!el) return;
        const rows = state.summary?.activity_by_day || [];
        if (!rows.length) {
            el.innerHTML = '<p class="text-secondary">No data</p>';
            return;
        }
        const max = Math.max(...rows.map((r) => Number(r.count) || 0), 1);
        el.innerHTML = `
            <div class="audit-timeline-grid">
                ${rows.map((row) => {
                    const h = Math.max(8, Math.round(((Number(row.count) || 0) / max) * 120));
                    return `
                        <div class="audit-timeline-item" title="${esc(row.day)}: ${fmtInt(row.count)}">
                            <div class="audit-timeline-bar" style="height:${h}px;"></div>
                            <span>${esc(String(row.day || '').slice(5))}</span>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    function statusBadge(isFailed) {
        return isFailed
            ? '<span class="reports-notification-status failed">failed</span>'
            : '<span class="reports-notification-status sent">ok</span>';
    }

    function renderLogs() {
        const el = document.getElementById('auditLogsTable');
        if (!el) return;
        const rows = state.logs || [];
        if (!rows.length) {
            el.innerHTML = '<p class="text-secondary">No logs found</p>';
            return;
        }
        el.innerHTML = `
            <div class="table-responsive">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Date</th><th>Actor</th><th>Role</th><th>Action</th><th>Entity</th><th>ID</th><th>Status</th><th>School</th><th>Details</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map((row) => `
                            <tr data-audit-id="${esc(row.id)}" class="audit-log-row">
                                <td>${row.created_at ? new Date(row.created_at).toLocaleString('ru-RU') : '-'}</td>
                                <td>${esc(`${row.first_name || ''} ${row.last_name || ''}`.trim() || row.username || 'system')}</td>
                                <td>${esc(row.actor_role || '-')}</td>
                                <td>${esc(row.action || '-')}</td>
                                <td>${esc(row.entity_type || '-')}</td>
                                <td>${esc(row.entity_id || '-')}</td>
                                <td>${statusBadge(row.is_failed)}</td>
                                <td>${esc(row.school_name || '-')}</td>
                                <td>${esc(row.details ? JSON.stringify(row.details).slice(0, 90) : '-')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div class="reports-notification-footer">
                <span class="text-secondary">Page ${fmtInt(state.pagination.page)} / ${fmtInt(state.pagination.pages)} · Total: ${fmtInt(state.pagination.total)}</span>
                <div class="pagination" id="auditPagination"></div>
            </div>
        `;

        renderPagination();
        bindRowClicks();
    }

    function renderPagination() {
        const wrap = document.getElementById('auditPagination');
        if (!wrap) return;
        const total = Math.max(1, Number(state.pagination.pages) || 1);
        const current = Math.min(Math.max(1, Number(state.pagination.page) || 1), total);
        let html = '';
        if (current > 1) html += `<button class="pagination-btn" data-page="${current - 1}">Previous</button>`;
        const start = Math.max(1, current - 2);
        const end = Math.min(total, current + 2);
        for (let i = start; i <= end; i++) {
            html += `<button class="pagination-btn ${i === current ? 'active' : ''}" data-page="${i}">${i}</button>`;
        }
        if (current < total) html += `<button class="pagination-btn" data-page="${current + 1}">Next</button>`;
        wrap.innerHTML = html;
        wrap.querySelectorAll('button[data-page]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const page = Number.parseInt(btn.dataset.page || '1', 10);
                if (!Number.isFinite(page) || page < 1) return;
                state.pagination.page = page;
                await refresh(false);
            });
        });
    }

    function renderDetails() {
        const card = document.getElementById('auditDetailsCard');
        const view = document.getElementById('auditDetailsView');
        if (!card || !view) return;
        if (!state.selected) {
            card.style.display = 'none';
            view.innerHTML = '';
            return;
        }
        card.style.display = '';
        const row = state.selected;
        let detailsText = '';
        try {
            detailsText = row.details ? JSON.stringify(row.details, null, 2) : '{}';
        } catch (_) {
            detailsText = String(row.details || '{}');
        }

        view.innerHTML = `
            <div class="audit-details-grid">
                <div><strong>ID:</strong> ${esc(row.id)}</div>
                <div><strong>Date:</strong> ${row.created_at ? new Date(row.created_at).toLocaleString('ru-RU') : '-'}</div>
                <div><strong>Actor:</strong> ${esc(`${row.first_name || ''} ${row.last_name || ''}`.trim() || row.username || 'system')}</div>
                <div><strong>Role:</strong> ${esc(row.actor_role || '-')}</div>
                <div><strong>Action:</strong> ${esc(row.action || '-')}</div>
                <div><strong>Entity:</strong> ${esc(row.entity_type || '-')}</div>
                <div><strong>Entity ID:</strong> ${esc(row.entity_id || '-')}</div>
                <div><strong>School:</strong> ${esc(row.school_name || '-')}</div>
                <div><strong>Status:</strong> ${row.is_failed ? 'failed' : 'ok'}</div>
            </div>
            <pre class="audit-details-json">${esc(detailsText)}</pre>
        `;
    }

    function bindRowClicks() {
        document.querySelectorAll('.audit-log-row').forEach((rowEl) => {
            rowEl.addEventListener('click', () => {
                const id = String(rowEl.dataset.auditId || '');
                state.selected = state.logs.find((row) => String(row.id) === id) || null;
                renderDetails();
            });
        });
    }

    async function refresh(resetPage = false) {
        readFiltersFromUi();
        if (resetPage) state.pagination.page = 1;

        const logsUrl = `${API}/logs?${buildQuery()}`;
        const summaryUrl = `${API}/summary?${buildQuery({ page: undefined, limit: undefined })}`;

        const [logsData, summaryData] = await Promise.all([
            apiGet(logsUrl),
            apiGet(summaryUrl)
        ]);

        state.logs = logsData.logs || [];
        state.pagination = logsData.pagination || state.pagination;
        state.summary = summaryData || null;
        if (state.selected) {
            state.selected = state.logs.find((row) => String(row.id) === String(state.selected.id)) || null;
        }
        renderKpi();
        renderTopActions();
        renderTopActors();
        renderTimeline();
        renderLogs();
        renderDetails();
    }

    function setPreset(days) {
        const to = new Date();
        const from = new Date(to.getTime() - (days * 24 * 60 * 60 * 1000));
        const toInput = document.getElementById('auditToFilter');
        const fromInput = document.getElementById('auditFromFilter');
        if (fromInput) fromInput.value = from.toISOString().slice(0, 16);
        if (toInput) toInput.value = to.toISOString().slice(0, 16);
    }

    function toggleAutoRefresh() {
        state.autoRefresh = !state.autoRefresh;
        const btn = document.getElementById('auditAutoRefreshBtn');
        if (btn) btn.textContent = `Auto: ${state.autoRefresh ? 'On' : 'Off'}`;

        if (state.autoTimer) {
            clearInterval(state.autoTimer);
            state.autoTimer = null;
        }
        if (state.autoRefresh) {
            state.autoTimer = setInterval(() => {
                refresh(false).catch((error) => console.error('Auto refresh audit error:', error));
            }, 30000);
        }
    }

    function bindEvents() {
        const byId = (id) => document.getElementById(id);

        const runRefresh = () => refresh(true).catch((error) => console.error('Audit refresh error:', error));
        byId('auditRefreshBtn')?.addEventListener('click', runRefresh);
        byId('auditSearch')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') runRefresh();
        });
        ['auditActionFilter', 'auditEntityFilter', 'auditRoleFilter', 'auditStatusFilter', 'auditFromFilter', 'auditToFilter', 'auditPageSize']
            .forEach((id) => byId(id)?.addEventListener('change', runRefresh));

        byId('auditPreset24hBtn')?.addEventListener('click', () => { setPreset(1); runRefresh(); });
        byId('auditPreset7dBtn')?.addEventListener('click', () => { setPreset(7); runRefresh(); });
        byId('auditPreset30dBtn')?.addEventListener('click', () => { setPreset(30); runRefresh(); });
        byId('auditResetFiltersBtn')?.addEventListener('click', () => {
            ['auditSearch', 'auditActionFilter', 'auditEntityFilter', 'auditRoleFilter', 'auditStatusFilter', 'auditFromFilter', 'auditToFilter']
                .forEach((id) => { const el = byId(id); if (el) el.value = ''; });
            const pageSize = byId('auditPageSize');
            if (pageSize) pageSize.value = '25';
            runRefresh();
        });
        byId('auditAutoRefreshBtn')?.addEventListener('click', toggleAutoRefresh);
        byId('auditExportBtn')?.addEventListener('click', async () => {
            try {
                readFiltersFromUi();
                const url = `${API}/export.csv?${buildQuery({ page: undefined, limit: 10000 })}`;
                const response = await fetch(url, {
                    headers: { Authorization: `Bearer ${token()}` }
                });
                if (!response.ok) throw new Error(`Export failed: ${response.status}`);
                const blob = await response.blob();
                const objectUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = objectUrl;
                a.download = `audit_export_${Date.now()}.csv`;
                a.click();
                URL.revokeObjectURL(objectUrl);
            } catch (error) {
                console.error('Audit export error:', error);
                alert('Failed to export audit CSV');
            }
        });
    }

    async function init() {
        if (!document.getElementById('auditLogsTable')) return;
        await loadFacets();
        bindEvents();
        await refresh(true);
    }

    window.AuditPage = { init };
})();
