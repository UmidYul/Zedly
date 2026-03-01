// Homework page scaffold for teacher/student (API-first with mock fallback)
(function () {
    'use strict';

    const U = window.ZedlyDiaryUtils;
    const state = {
        integrationStatus: 'mock',
        endpoint: '',
        rows: []
    };

    function getRole() {
        try {
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            return user.role || 'student';
        } catch (error) {
            return 'student';
        }
    }

    function getMockData() {
        return {
            homework: [
                { id: 'h1', title: 'Algebra #5', subject: 'Mathematics', due_at: '2026-03-04T20:00:00Z', status: 'assigned' },
                { id: 'h2', title: 'Lab notes', subject: 'Physics', due_at: '2026-03-05T18:00:00Z', status: 'submitted' },
                { id: 'h3', title: 'Essay', subject: 'History', due_at: '2026-03-06T17:00:00Z', status: 'checked' }
            ]
        };
    }

    async function loadData() {
        const status = document.getElementById('homeworkStatusFilter')?.value || 'all';
        const endpoint = `/api/v1/homework?status=${encodeURIComponent(status)}`;
        const result = await U.fetchWithFallback(endpoint, getMockData, { method: 'GET' });
        state.integrationStatus = result.integrationStatus;
        state.endpoint = result.endpoint;
        state.rows = Array.isArray(result.data?.homework) ? result.data.homework : [];
    }

    function renderTable() {
        if (!state.rows.length) return U.renderState('empty', 'No homework found');
        return `
            <div class="table-responsive mobile-stack-table">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Title</th>
                            <th>Subject</th>
                            <th>Due</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${state.rows.map((row) => `
                            <tr>
                                <td>${U.escapeHtml(row.title || '-')}</td>
                                <td>${U.escapeHtml(row.subject || row.subject_name || '-')}</td>
                                <td>${U.escapeHtml(new Date(row.due_at).toLocaleString())}</td>
                                <td>${U.escapeHtml(row.status || '-')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    async function render() {
        const root = document.getElementById('homeworkRoot');
        if (!root) return;
        root.innerHTML = U.renderState('loading', 'Loading homework...');
        await loadData();
        root.innerHTML = `
            ${U.renderIntegrationBadge(state.integrationStatus, state.endpoint)}
            ${renderTable()}
        `;
    }

    function bindControls() {
        const statusSelect = document.getElementById('homeworkStatusFilter');
        if (statusSelect) {
            statusSelect.innerHTML = `
                <option value="all">All</option>
                <option value="assigned">Assigned</option>
                <option value="submitted">Submitted</option>
                <option value="checked">Checked</option>
                <option value="overdue">Overdue</option>
            `;
            statusSelect.onchange = () => render();
        }

        const createBtn = document.getElementById('homeworkCreateBtn');
        if (createBtn) {
            createBtn.onclick = () => {
                const role = getRole();
                const prefix = role === 'teacher' ? 'Created' : 'Draft';
                state.rows = [
                    {
                        id: `new-${Date.now()}`,
                        title: `${prefix} homework`,
                        subject: 'Mathematics',
                        due_at: new Date(Date.now() + 86400000).toISOString(),
                        status: 'assigned'
                    },
                    ...state.rows
                ];
                const root = document.getElementById('homeworkRoot');
                if (!root) return;
                root.innerHTML = `
                    ${U.renderIntegrationBadge(state.integrationStatus, state.endpoint)}
                    ${renderTable()}
                `;
            };
        }
    }

    function init() {
        if (!window.ZedlyDiaryUtils) return;
        bindControls();
        render().catch((error) => {
            const root = document.getElementById('homeworkRoot');
            if (root) root.innerHTML = U.renderState('error', error.message || 'Failed to load homework');
        });
    }

    window.HomeworkPage = { init };
})();
