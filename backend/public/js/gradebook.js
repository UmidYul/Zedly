// Teacher gradebook page scaffold (API-first with mock fallback)
(function () {
    'use strict';

    const U = window.ZedlyDiaryUtils;
    const state = {
        integrationStatus: 'mock',
        endpoint: '',
        rows: [],
        classes: [],
        subjects: [],
        terms: []
    };

    function setOptions(select, options) {
        if (!select) return;
        select.innerHTML = options.map((item) => `<option value="${item.id}">${U.escapeHtml(item.name)}</option>`).join('');
    }

    function getMockData() {
        return {
            classes: [
                { id: 'class-7a', name: '7A' },
                { id: 'class-8b', name: '8B' }
            ],
            subjects: [
                { id: 'math', name: 'Mathematics' },
                { id: 'physics', name: 'Physics' }
            ],
            terms: [
                { id: 'q1', name: 'Quarter 1' },
                { id: 'q2', name: 'Quarter 2' }
            ],
            entries: [
                { id: 'e1', student_name: 'Ali Karimov', grade_value: 5, grade_type: 'homework', comment: 'Strong work', grade_date: '2026-03-01' },
                { id: 'e2', student_name: 'Sofia Rustamova', grade_value: 4, grade_type: 'classwork', comment: 'Good progress', grade_date: '2026-03-01' },
                { id: 'e3', student_name: 'Jasur Akbarov', grade_value: 3, grade_type: 'quiz', comment: 'Needs revision', grade_date: '2026-03-01' }
            ]
        };
    }

    async function loadData() {
        const classId = document.getElementById('gradebookClassFilter')?.value || 'class-7a';
        const subjectId = document.getElementById('gradebookSubjectFilter')?.value || 'math';
        const termId = document.getElementById('gradebookTermFilter')?.value || 'q1';
        const endpoint = `/api/v1/gradebook/classes/${encodeURIComponent(classId)}/subjects/${encodeURIComponent(subjectId)}/entries?term_id=${encodeURIComponent(termId)}`;

        const result = await U.fetchWithFallback(endpoint, getMockData, { method: 'GET' });
        state.integrationStatus = result.integrationStatus;
        state.endpoint = result.endpoint;
        const payload = result.data || {};
        state.classes = Array.isArray(payload.classes) ? payload.classes : getMockData().classes;
        state.subjects = Array.isArray(payload.subjects) ? payload.subjects : getMockData().subjects;
        state.terms = Array.isArray(payload.terms) ? payload.terms : getMockData().terms;
        state.rows = Array.isArray(payload.entries) ? payload.entries : [];
    }

    function renderTable() {
        if (!state.rows.length) {
            return U.renderState('empty', 'No gradebook entries yet');
        }

        return `
            <div class="table-responsive mobile-stack-table">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Student</th>
                            <th>Grade</th>
                            <th>Type</th>
                            <th>Comment</th>
                            <th>Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${state.rows.map((row) => `
                            <tr>
                                <td>${U.escapeHtml(row.student_name || row.student || '-')}</td>
                                <td>${U.escapeHtml(row.grade_value ?? row.grade ?? '-')}</td>
                                <td>${U.escapeHtml(row.grade_type || row.type || '-')}</td>
                                <td>${U.escapeHtml(row.comment || '-')}</td>
                                <td>${U.escapeHtml(row.grade_date || row.date || '-')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    async function render() {
        const root = document.getElementById('gradebookRoot');
        if (!root) return;
        root.innerHTML = U.renderState('loading', 'Loading gradebook...');
        await loadData();
        setOptions(document.getElementById('gradebookClassFilter'), state.classes);
        setOptions(document.getElementById('gradebookSubjectFilter'), state.subjects);
        setOptions(document.getElementById('gradebookTermFilter'), state.terms);

        root.innerHTML = `
            ${U.renderIntegrationBadge(state.integrationStatus, state.endpoint)}
            ${renderTable()}
        `;
    }

    function addMockGrade() {
        state.rows = [
            {
                id: `new-${Date.now()}`,
                student_name: 'New student',
                grade_value: 5,
                grade_type: 'homework',
                comment: 'Added from UI',
                grade_date: new Date().toISOString().slice(0, 10)
            },
            ...state.rows
        ];
        const root = document.getElementById('gradebookRoot');
        if (!root) return;
        root.innerHTML = `
            ${U.renderIntegrationBadge(state.integrationStatus, state.endpoint)}
            ${renderTable()}
        `;
    }

    function bindControls() {
        const reload = () => render().catch((error) => {
            const root = document.getElementById('gradebookRoot');
            if (root) root.innerHTML = U.renderState('error', error.message || 'Failed to load gradebook');
        });

        const classFilter = document.getElementById('gradebookClassFilter');
        const subjectFilter = document.getElementById('gradebookSubjectFilter');
        const termFilter = document.getElementById('gradebookTermFilter');
        const addBtn = document.getElementById('gradebookAddBtn');

        if (classFilter) classFilter.onchange = reload;
        if (subjectFilter) subjectFilter.onchange = reload;
        if (termFilter) termFilter.onchange = reload;
        if (addBtn) addBtn.onclick = addMockGrade;
    }

    function init() {
        if (!window.ZedlyDiaryUtils) return;
        bindControls();
        render().catch((error) => {
            const root = document.getElementById('gradebookRoot');
            if (root) root.innerHTML = U.renderState('error', error.message || 'Failed to load gradebook');
        });
    }

    window.GradebookPage = { init };
})();
