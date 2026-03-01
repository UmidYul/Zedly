// Homework page for teacher/student (rich scaffold, API-first + mock fallback)
(function () {
    'use strict';

    const U = window.ZedlyDiaryUtils;
    const state = {
        integrationStatus: 'mock',
        endpoint: '',
        rows: [],
        selectedStatus: 'all'
    };

    function role() {
        return U.getRole() || 'student';
    }

    function getMockData() {
        return {
            homework: [
                { id: 'h1', title: 'Algebra #5', subject_name: 'Mathematics', due_at: '2026-03-04T20:00:00Z', status: 'assigned', submissions: 15, total_students: 24, score_avg: 4.2 },
                { id: 'h2', title: 'Physics lab', subject_name: 'Physics', due_at: '2026-03-05T18:00:00Z', status: 'submitted', submissions: 20, total_students: 24, score_avg: 4.5 },
                { id: 'h3', title: 'History essay', subject_name: 'History', due_at: '2026-03-06T17:00:00Z', status: 'checked', submissions: 24, total_students: 24, score_avg: 4.0 }
            ]
        };
    }

    function statusClass(status) {
        if (status === 'checked') return 'diary-badge-success';
        if (status === 'submitted') return 'diary-badge-info';
        if (status === 'overdue') return 'diary-badge-warning';
        return 'diary-badge-info';
    }

    async function loadData() {
        const endpoint = `/api/v1/homework?status=${encodeURIComponent(state.selectedStatus)}`;
        const result = await U.fetchWithFallback(endpoint, getMockData, { method: 'GET' });
        state.integrationStatus = result.integrationStatus;
        state.endpoint = result.endpoint;
        state.rows = Array.isArray(result.data?.homework) ? result.data.homework : [];
    }

    function renderKpis() {
        const total = state.rows.length;
        const checked = state.rows.filter((row) => row.status === 'checked').length;
        const active = state.rows.filter((row) => row.status === 'assigned' || row.status === 'submitted').length;
        return `
            <div class="diary-grid diary-grid-3">
                <article class="diary-panel diary-kpi"><h3>Total tasks</h3><div class="value">${total}</div><div class="hint">Selected status</div></article>
                <article class="diary-panel diary-kpi"><h3>Active now</h3><div class="value">${active}</div><div class="hint">Assigned + submitted</div></article>
                <article class="diary-panel diary-kpi"><h3>Checked</h3><div class="value">${checked}</div><div class="hint">Ready with feedback</div></article>
            </div>
        `;
    }

    function renderCards() {
        if (!state.rows.length) return U.renderState('empty', 'No homework tasks for this filter');
        return `
            <div class="diary-grid diary-grid-2">
                ${state.rows.map((row) => {
                    const progress = row.total_students ? Math.round(((row.submissions || 0) / row.total_students) * 100) : 0;
                    return `
                        <article class="diary-panel">
                            <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
                                <div>
                                    <h3>${U.escapeHtml(row.title || '-')}</h3>
                                    <p>${U.escapeHtml(row.subject_name || '-')}</p>
                                </div>
                                <span class="diary-badge ${statusClass(row.status)}">${U.escapeHtml(row.status || 'assigned')}</span>
                            </div>
                            <div class="diary-timeline" style="margin-top:12px;">
                                <div class="diary-timeline-item"><h4>Due</h4><p>${U.escapeHtml(new Date(row.due_at).toLocaleString())}</p></div>
                                ${role() === 'teacher' ? `
                                    <div class="diary-timeline-item"><h4>Submissions</h4><p>${row.submissions || 0} / ${row.total_students || 0}</p></div>
                                    <div class="diary-progress"><span style="width:${progress}%"></span></div>
                                ` : `
                                    <div class="diary-timeline-item"><h4>My status</h4><p>${U.escapeHtml(row.status || '-')}</p></div>
                                `}
                            </div>
                        </article>
                    `;
                }).join('')}
            </div>
        `;
    }

    function renderTable() {
        if (!state.rows.length) return '';
        return `
            <div class="diary-panel" style="margin-top:14px;">
                <div class="table-responsive mobile-stack-table">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Title</th>
                                <th>Subject</th>
                                <th>Due</th>
                                <th>Status</th>
                                ${role() === 'teacher' ? '<th>Progress</th>' : ''}
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${state.rows.map((row) => {
                                const progress = row.total_students ? `${row.submissions || 0}/${row.total_students}` : '-';
                                return `
                                    <tr>
                                        <td>${U.escapeHtml(row.title || '-')}</td>
                                        <td>${U.escapeHtml(row.subject_name || '-')}</td>
                                        <td>${U.escapeHtml(new Date(row.due_at).toLocaleString())}</td>
                                        <td>${U.escapeHtml(row.status || '-')}</td>
                                        ${role() === 'teacher' ? `<td>${U.escapeHtml(progress)}</td>` : ''}
                                        <td><button class="btn btn-outline btn-sm" data-action="touch" data-id="${U.escapeHtml(row.id)}">${role() === 'teacher' ? 'Review' : 'Open'}</button></td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    function render() {
        const root = document.getElementById('homeworkRoot');
        if (!root) return;
        root.innerHTML = `
            ${U.renderIntegrationBadge(state.integrationStatus, state.endpoint)}
            ${renderKpis()}
            <div style="margin-top:14px;">${renderCards()}</div>
            ${renderTable()}
        `;
    }

    function bindEvents() {
        const statusFilter = document.getElementById('homeworkStatusFilter');
        const createBtn = document.getElementById('homeworkCreateBtn');
        const root = document.getElementById('homeworkRoot');

        if (statusFilter) {
            statusFilter.innerHTML = `
                <option value="all" ${state.selectedStatus === 'all' ? 'selected' : ''}>All</option>
                <option value="assigned">Assigned</option>
                <option value="submitted">Submitted</option>
                <option value="checked">Checked</option>
                <option value="overdue">Overdue</option>
            `;
            statusFilter.onchange = async () => {
                state.selectedStatus = statusFilter.value;
                await loadData();
                render();
            };
        }

        if (createBtn) {
            createBtn.onclick = () => {
                state.rows = [
                    {
                        id: `new-${Date.now()}`,
                        title: 'New homework task',
                        subject_name: 'Mathematics',
                        due_at: new Date(Date.now() + 86400000).toISOString(),
                        status: 'assigned',
                        submissions: 0,
                        total_students: 24,
                        score_avg: 0
                    },
                    ...state.rows
                ];
                render();
            };
        }

        if (root) {
            root.onclick = (event) => {
                const btn = event.target.closest('button[data-action="touch"]');
                if (!btn) return;
                const id = btn.getAttribute('data-id');
                if (!id) return;
                state.rows = state.rows.map((row) => {
                    if (String(row.id) !== String(id)) return row;
                    if (row.status === 'assigned') return { ...row, status: 'submitted' };
                    if (row.status === 'submitted') return { ...row, status: 'checked' };
                    return row;
                });
                render();
            };
        }
    }

    async function init() {
        if (!U) return;
        const root = document.getElementById('homeworkRoot');
        if (!root) return;
        root.innerHTML = U.renderState('loading', 'Loading homework...');
        bindEvents();
        try {
            await loadData();
            render();
        } catch (error) {
            root.innerHTML = U.renderState('error', error.message || 'Failed to load homework');
        }
    }

    window.HomeworkPage = { init };
})();
