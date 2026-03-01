// Teacher gradebook (rich scaffold, API-first + mock fallback)
(function () {
    'use strict';

    const U = window.ZedlyDiaryUtils;
    const state = {
        integrationStatus: 'mock',
        endpoint: '',
        classes: [],
        subjects: [],
        terms: [],
        rows: [],
        selectedClassId: '7a',
        selectedSubjectId: 'math',
        selectedTermId: 'q2'
    };

    function getMockDataset() {
        return {
            classes: [
                { id: '7a', name: '7A' },
                { id: '8b', name: '8B' }
            ],
            subjects: [
                { id: 'math', name: 'Mathematics' },
                { id: 'physics', name: 'Physics' },
                { id: 'history', name: 'History' }
            ],
            terms: [
                { id: 'q1', name: 'Quarter 1' },
                { id: 'q2', name: 'Quarter 2' }
            ],
            entries: [
                { id: 'g1', student_name: 'Ali Karimov', grade_value: 5, grade_type: 'homework', comment: 'Excellent speed', grade_date: '2026-03-01' },
                { id: 'g2', student_name: 'Sofia Rustamova', grade_value: 4, grade_type: 'classwork', comment: 'Stable progress', grade_date: '2026-03-01' },
                { id: 'g3', student_name: 'Jasur Akbarov', grade_value: 3, grade_type: 'quiz', comment: 'Need more practice', grade_date: '2026-03-01' },
                { id: 'g4', student_name: 'Malika Tursunova', grade_value: 5, grade_type: 'project', comment: 'Great initiative', grade_date: '2026-02-28' },
                { id: 'g5', student_name: 'Bekzod Umarov', grade_value: 2, grade_type: 'quiz', comment: 'Missed key steps', grade_date: '2026-02-28' }
            ]
        };
    }

    function setSelectOptions(select, options, selectedId) {
        if (!select) return;
        select.innerHTML = options.map((item) => `
            <option value="${U.escapeHtml(item.id)}" ${String(item.id) === String(selectedId) ? 'selected' : ''}>${U.escapeHtml(item.name)}</option>
        `).join('');
    }

    function averageGrade() {
        if (!state.rows.length) return 0;
        return state.rows.reduce((acc, row) => acc + Number(row.grade_value || 0), 0) / state.rows.length;
    }

    function gradeDistribution() {
        const map = new Map([[5, 0], [4, 0], [3, 0], [2, 0], [1, 0]]);
        state.rows.forEach((row) => {
            const val = Number(row.grade_value);
            if (map.has(val)) map.set(val, map.get(val) + 1);
        });
        return Array.from(map.entries());
    }

    function renderDistribution() {
        const dist = gradeDistribution();
        const max = Math.max(...dist.map(([, count]) => count), 1);
        return `
            <div class="diary-panel">
                <h3>Grade distribution</h3>
                <div class="diary-grid">
                    ${dist.map(([grade, count]) => `
                        <div>
                            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                                <span>Grade ${grade}</span>
                                <strong>${count}</strong>
                            </div>
                            <div class="diary-progress"><span style="width:${(count / max) * 100}%"></span></div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    function renderKpis() {
        const avg = averageGrade();
        const riskCount = state.rows.filter((row) => Number(row.grade_value) <= 3).length;
        const excellentCount = state.rows.filter((row) => Number(row.grade_value) === 5).length;

        return `
            <div class="diary-grid diary-grid-3">
                <article class="diary-panel diary-kpi">
                    <h3>Average grade</h3>
                    <div class="value">${avg.toFixed(2)}</div>
                    <div class="hint">${state.rows.length} entries in selected period</div>
                </article>
                <article class="diary-panel diary-kpi">
                    <h3>Excellent marks</h3>
                    <div class="value">${excellentCount}</div>
                    <div class="hint">Students with grade 5</div>
                </article>
                <article class="diary-panel diary-kpi">
                    <h3>Attention required</h3>
                    <div class="value">${riskCount}</div>
                    <div class="hint">Entries with grade 3 and below</div>
                </article>
            </div>
        `;
    }

    function renderTable() {
        if (!state.rows.length) return U.renderState('empty', 'No grade entries for selected filters');
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
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${state.rows.map((row) => `
                            <tr>
                                <td>${U.escapeHtml(row.student_name || '-')}</td>
                                <td><strong>${U.escapeHtml(row.grade_value)}</strong></td>
                                <td>${U.escapeHtml(row.grade_type || '-')}</td>
                                <td>${U.escapeHtml(row.comment || '-')}</td>
                                <td>${U.escapeHtml(row.grade_date || '-')}</td>
                                <td>
                                    <button class="btn btn-outline btn-sm" data-action="edit" data-id="${U.escapeHtml(row.id)}">Edit</button>
                                    <button class="btn btn-outline btn-sm" data-action="delete" data-id="${U.escapeHtml(row.id)}">Delete</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    function render() {
        const root = document.getElementById('gradebookRoot');
        if (!root) return;
        root.innerHTML = `
            ${U.renderIntegrationBadge(state.integrationStatus, state.endpoint)}
            ${renderKpis()}
            <div class="diary-grid diary-grid-2" style="margin-top:14px;">
                ${renderDistribution()}
                <div class="diary-panel">
                    <h3>Recent comments</h3>
                    <div class="diary-timeline">
                        ${state.rows.slice(0, 5).map((row) => `
                            <div class="diary-timeline-item">
                                <h4>${U.escapeHtml(row.student_name)} · ${U.escapeHtml(row.grade_value)}</h4>
                                <p>${U.escapeHtml(row.comment || 'No comment')}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
            <div class="diary-panel" style="margin-top:14px;">
                ${renderTable()}
            </div>
        `;
    }

    async function loadData() {
        const endpoint = `/api/v1/gradebook/classes/${encodeURIComponent(state.selectedClassId)}/subjects/${encodeURIComponent(state.selectedSubjectId)}/entries?term_id=${encodeURIComponent(state.selectedTermId)}`;
        const result = await U.fetchWithFallback(endpoint, getMockDataset, { method: 'GET' });
        state.integrationStatus = result.integrationStatus;
        state.endpoint = result.endpoint;
        const payload = result.data || getMockDataset();
        state.classes = Array.isArray(payload.classes) ? payload.classes : [];
        state.subjects = Array.isArray(payload.subjects) ? payload.subjects : [];
        state.terms = Array.isArray(payload.terms) ? payload.terms : [];
        state.rows = Array.isArray(payload.entries) ? payload.entries : [];

        setSelectOptions(document.getElementById('gradebookClassFilter'), state.classes, state.selectedClassId);
        setSelectOptions(document.getElementById('gradebookSubjectFilter'), state.subjects, state.selectedSubjectId);
        setSelectOptions(document.getElementById('gradebookTermFilter'), state.terms, state.selectedTermId);
    }

    function upsertMockGrade() {
        const id = `new-${Date.now()}`;
        state.rows = [
            {
                id,
                student_name: 'New student',
                grade_value: 5,
                grade_type: 'homework',
                comment: 'Added from UI',
                grade_date: new Date().toISOString().slice(0, 10)
            },
            ...state.rows
        ];
        render();
    }

    function bindEvents() {
        const classFilter = document.getElementById('gradebookClassFilter');
        const subjectFilter = document.getElementById('gradebookSubjectFilter');
        const termFilter = document.getElementById('gradebookTermFilter');
        const addBtn = document.getElementById('gradebookAddBtn');
        const root = document.getElementById('gradebookRoot');

        if (classFilter) {
            classFilter.onchange = async () => {
                state.selectedClassId = classFilter.value;
                await loadData();
                render();
            };
        }
        if (subjectFilter) {
            subjectFilter.onchange = async () => {
                state.selectedSubjectId = subjectFilter.value;
                await loadData();
                render();
            };
        }
        if (termFilter) {
            termFilter.onchange = async () => {
                state.selectedTermId = termFilter.value;
                await loadData();
                render();
            };
        }
        if (addBtn) addBtn.onclick = upsertMockGrade;
        if (root) {
            root.onclick = (event) => {
                const button = event.target.closest('button[data-action]');
                if (!button) return;
                const action = button.getAttribute('data-action');
                const id = button.getAttribute('data-id');
                if (!id) return;
                if (action === 'delete') {
                    state.rows = state.rows.filter((row) => String(row.id) !== String(id));
                    render();
                    return;
                }
                if (action === 'edit') {
                    state.rows = state.rows.map((row) => {
                        if (String(row.id) !== String(id)) return row;
                        const next = Math.min(5, Math.max(1, Number(row.grade_value || 0) + 1));
                        return { ...row, grade_value: next, comment: 'Updated from UI' };
                    });
                    render();
                }
            };
        }
    }

    async function init() {
        if (!U) return;
        const root = document.getElementById('gradebookRoot');
        if (!root) return;
        root.innerHTML = U.renderState('loading', 'Loading gradebook...');
        bindEvents();
        try {
            await loadData();
            render();
        } catch (error) {
            root.innerHTML = U.renderState('error', error.message || 'Failed to load gradebook');
        }
    }

    window.GradebookPage = { init };
})();
