// Academic terms page scaffold (API-first with mock fallback)
(function () {
    'use strict';

    const U = window.ZedlyDiaryUtils;
    const state = {
        integrationStatus: 'mock',
        endpoint: '',
        terms: []
    };

    function getMockData() {
        return {
            terms: [
                { id: 'q1', name: 'Quarter 1', start_date: '2026-09-01', end_date: '2026-10-31', is_active: false },
                { id: 'q2', name: 'Quarter 2', start_date: '2026-11-01', end_date: '2026-12-29', is_active: true }
            ]
        };
    }

    async function loadData() {
        const endpoint = '/api/v1/academic-terms';
        const result = await U.fetchWithFallback(endpoint, getMockData, { method: 'GET' });
        state.integrationStatus = result.integrationStatus;
        state.endpoint = result.endpoint;
        state.terms = Array.isArray(result.data?.terms) ? result.data.terms : [];
    }

    function renderTable() {
        if (!state.terms.length) return U.renderState('empty', 'No academic terms configured');

        return `
            <div class="table-responsive mobile-stack-table">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Start date</th>
                            <th>End date</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${state.terms.map((row) => `
                            <tr>
                                <td>${U.escapeHtml(row.name || '-')}</td>
                                <td>${U.escapeHtml(row.start_date || '-')}</td>
                                <td>${U.escapeHtml(row.end_date || '-')}</td>
                                <td>${U.escapeHtml(row.is_active ? 'Active' : 'Inactive')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    async function render() {
        const root = document.getElementById('academicTermsRoot');
        if (!root) return;
        root.innerHTML = U.renderState('loading', 'Loading academic terms...');
        await loadData();
        root.innerHTML = `
            ${U.renderIntegrationBadge(state.integrationStatus, state.endpoint)}
            ${renderTable()}
        `;
    }

    function bindControls() {
        const addBtn = document.getElementById('academicTermAddBtn');
        if (addBtn) {
            addBtn.onclick = () => {
                state.terms = [
                    {
                        id: `new-${Date.now()}`,
                        name: 'New term',
                        start_date: new Date().toISOString().slice(0, 10),
                        end_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
                        is_active: false
                    },
                    ...state.terms
                ];
                const root = document.getElementById('academicTermsRoot');
                if (root) {
                    root.innerHTML = `
                        ${U.renderIntegrationBadge(state.integrationStatus, state.endpoint)}
                        ${renderTable()}
                    `;
                }
            };
        }
    }

    function init() {
        if (!window.ZedlyDiaryUtils) return;
        bindControls();
        render().catch((error) => {
            const root = document.getElementById('academicTermsRoot');
            if (root) root.innerHTML = U.renderState('error', error.message || 'Failed to load academic terms');
        });
    }

    window.AcademicTermsPage = { init };
})();
