// Academic terms page (rich scaffold, API-first + mock fallback)
(function () {
    'use strict';

    const U = window.ZedlyDiaryUtils;
    const state = {
        integrationStatus: 'mock',
        endpoint: '',
        terms: []
    };

    function mockData() {
        return {
            terms: [
                { id: 'q1', name: 'Quarter 1', start_date: '2026-09-01', end_date: '2026-10-31', is_active: false },
                { id: 'q2', name: 'Quarter 2', start_date: '2026-11-01', end_date: '2026-12-29', is_active: true },
                { id: 'q3', name: 'Quarter 3', start_date: '2027-01-10', end_date: '2027-03-20', is_active: false }
            ]
        };
    }

    async function loadData() {
        const endpoint = '/api/v1/academic-terms';
        const result = await U.fetchWithFallback(endpoint, mockData, { method: 'GET' });
        state.integrationStatus = result.integrationStatus;
        state.endpoint = result.endpoint;
        state.terms = Array.isArray(result.data?.terms) ? result.data.terms : [];
    }

    function daysBetween(start, end) {
        const s = new Date(start);
        const e = new Date(end);
        const diff = e.getTime() - s.getTime();
        return Math.max(0, Math.round(diff / 86400000) + 1);
    }

    function renderKpis() {
        const total = state.terms.length;
        const active = state.terms.filter((term) => term.is_active).length;
        const totalDays = state.terms.reduce((acc, term) => acc + daysBetween(term.start_date, term.end_date), 0);
        return `
            <div class="diary-grid diary-grid-3">
                <article class="diary-panel diary-kpi"><h3>Total terms</h3><div class="value">${total}</div><div class="hint">Configured periods</div></article>
                <article class="diary-panel diary-kpi"><h3>Active terms</h3><div class="value">${active}</div><div class="hint">Current visible periods</div></article>
                <article class="diary-panel diary-kpi"><h3>Academic days</h3><div class="value">${totalDays}</div><div class="hint">Sum of all terms</div></article>
            </div>
        `;
    }

    function renderTimeline() {
        if (!state.terms.length) return U.renderState('empty', 'No terms configured');
        return `
            <div class="diary-panel">
                <h3>Timeline</h3>
                <div class="diary-timeline">
                    ${state.terms.map((term) => `
                        <div class="diary-timeline-item">
                            <h4>${U.escapeHtml(term.name)}</h4>
                            <p>${U.escapeHtml(term.start_date)} → ${U.escapeHtml(term.end_date)} · ${daysBetween(term.start_date, term.end_date)} days</p>
                            <div style="margin-top:6px;">
                                <span class="diary-badge ${term.is_active ? 'diary-badge-success' : 'diary-badge-info'}">${term.is_active ? 'Active' : 'Inactive'}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    function renderTable() {
        if (!state.terms.length) return '';
        return `
            <div class="diary-panel">
                <div class="table-responsive mobile-stack-table">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Start date</th>
                                <th>End date</th>
                                <th>Days</th>
                                <th>Status</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${state.terms.map((term) => `
                                <tr>
                                    <td>${U.escapeHtml(term.name || '-')}</td>
                                    <td>${U.escapeHtml(term.start_date || '-')}</td>
                                    <td>${U.escapeHtml(term.end_date || '-')}</td>
                                    <td>${daysBetween(term.start_date, term.end_date)}</td>
                                    <td>${term.is_active ? 'Active' : 'Inactive'}</td>
                                    <td><button class="btn btn-outline btn-sm" data-toggle-term="${U.escapeHtml(term.id)}">Toggle</button></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    function render() {
        const root = document.getElementById('academicTermsRoot');
        if (!root) return;
        root.innerHTML = `
            ${U.renderIntegrationBadge(state.integrationStatus, state.endpoint)}
            ${renderKpis()}
            <div class="diary-grid diary-grid-2" style="margin-top:14px;">
                ${renderTimeline()}
                ${renderTable()}
            </div>
        `;
    }

    function bindEvents() {
        const addBtn = document.getElementById('academicTermAddBtn');
        const root = document.getElementById('academicTermsRoot');

        if (addBtn) {
            addBtn.onclick = () => {
                state.terms = [
                    {
                        id: `term-${Date.now()}`,
                        name: 'New term',
                        start_date: new Date().toISOString().slice(0, 10),
                        end_date: new Date(Date.now() + 55 * 86400000).toISOString().slice(0, 10),
                        is_active: false
                    },
                    ...state.terms
                ];
                render();
            };
        }

        if (root) {
            root.onclick = (event) => {
                const btn = event.target.closest('button[data-toggle-term]');
                if (!btn) return;
                const id = btn.getAttribute('data-toggle-term');
                if (!id) return;
                state.terms = state.terms.map((term) => {
                    if (String(term.id) !== String(id)) return term;
                    return { ...term, is_active: !term.is_active };
                });
                render();
            };
        }
    }

    async function init() {
        if (!U) return;
        const root = document.getElementById('academicTermsRoot');
        if (!root) return;
        root.innerHTML = U.renderState('loading', 'Loading academic terms...');
        bindEvents();
        try {
            await loadData();
            render();
        } catch (error) {
            root.innerHTML = U.renderState('error', error.message || 'Failed to load academic terms');
        }
    }

    window.AcademicTermsPage = { init };
})();
