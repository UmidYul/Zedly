// Student diary page scaffold (API-first with mock fallback)
(function () {
    'use strict';

    const U = window.ZedlyDiaryUtils;
    const state = {
        integrationStatus: 'mock',
        endpoint: '',
        grades: [],
        subjects: [],
        terms: []
    };

    function getMockData() {
        return {
            subjects: [
                { id: 'all', name: 'All subjects' },
                { id: 'math', name: 'Mathematics' },
                { id: 'physics', name: 'Physics' },
                { id: 'history', name: 'History' }
            ],
            terms: [
                { id: 'q1', name: 'Quarter 1' },
                { id: 'q2', name: 'Quarter 2' }
            ],
            grades: [
                { subject: 'Mathematics', value: 5, type: 'homework', teacher_comment: 'Excellent', date: '2026-02-28' },
                { subject: 'Physics', value: 4, type: 'classwork', teacher_comment: 'Solid effort', date: '2026-02-27' },
                { subject: 'History', value: 5, type: 'quiz', teacher_comment: 'Great retention', date: '2026-02-25' }
            ]
        };
    }

    function setOptions(select, options) {
        if (!select) return;
        select.innerHTML = options.map((item) => `<option value="${item.id}">${U.escapeHtml(item.name)}</option>`).join('');
    }

    async function loadData() {
        const subject = document.getElementById('studentDiarySubjectFilter')?.value || 'all';
        const term = document.getElementById('studentDiaryTermFilter')?.value || 'q1';
        const endpoint = `/api/v1/students/me/grades?subject_id=${encodeURIComponent(subject)}&term_id=${encodeURIComponent(term)}`;
        const result = await U.fetchWithFallback(endpoint, getMockData, { method: 'GET' });
        state.integrationStatus = result.integrationStatus;
        state.endpoint = result.endpoint;

        const payload = result.data || {};
        state.subjects = Array.isArray(payload.subjects) ? payload.subjects : getMockData().subjects;
        state.terms = Array.isArray(payload.terms) ? payload.terms : getMockData().terms;
        state.grades = Array.isArray(payload.grades) ? payload.grades : [];
    }

    function renderTable() {
        if (!state.grades.length) {
            return U.renderState('empty', 'No grades found');
        }

        return `
            <div class="table-responsive mobile-stack-table">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Subject</th>
                            <th>Grade</th>
                            <th>Type</th>
                            <th>Teacher comment</th>
                            <th>Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${state.grades.map((row) => `
                            <tr>
                                <td>${U.escapeHtml(row.subject || row.subject_name || '-')}</td>
                                <td>${U.escapeHtml(row.value ?? row.grade_value ?? '-')}</td>
                                <td>${U.escapeHtml(row.type || row.grade_type || '-')}</td>
                                <td>${U.escapeHtml(row.teacher_comment || row.comment || '-')}</td>
                                <td>${U.escapeHtml(row.date || row.grade_date || '-')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    async function render() {
        const root = document.getElementById('studentDiaryRoot');
        if (!root) return;
        root.innerHTML = U.renderState('loading', 'Loading diary...');
        await loadData();
        setOptions(document.getElementById('studentDiarySubjectFilter'), state.subjects);
        setOptions(document.getElementById('studentDiaryTermFilter'), state.terms);

        const avg = state.grades.reduce((acc, item) => acc + Number(item.value ?? item.grade_value ?? 0), 0) / (state.grades.length || 1);
        root.innerHTML = `
            ${U.renderIntegrationBadge(state.integrationStatus, state.endpoint)}
            <div class="stats-grid">
                <div class="stat-card"><h3>Average grade</h3><p class="stat-value">${Number.isFinite(avg) ? avg.toFixed(2) : '0.00'}</p></div>
                <div class="stat-card"><h3>Total marks</h3><p class="stat-value">${state.grades.length}</p></div>
            </div>
            <div style="margin-top:16px;">${renderTable()}</div>
        `;
    }

    function bindControls() {
        const reload = () => render().catch((error) => {
            const root = document.getElementById('studentDiaryRoot');
            if (root) root.innerHTML = U.renderState('error', error.message || 'Failed to load diary');
        });
        const subject = document.getElementById('studentDiarySubjectFilter');
        const term = document.getElementById('studentDiaryTermFilter');
        if (subject) subject.onchange = reload;
        if (term) term.onchange = reload;
    }

    function init() {
        if (!window.ZedlyDiaryUtils) return;
        bindControls();
        render().catch((error) => {
            const root = document.getElementById('studentDiaryRoot');
            if (root) root.innerHTML = U.renderState('error', error.message || 'Failed to load diary');
        });
    }

    window.StudentDiaryPage = { init };
})();
