// Student diary (rich scaffold, API-first + mock fallback)
(function () {
    'use strict';

    const U = window.ZedlyDiaryUtils;
    const state = {
        integrationStatus: 'mock',
        endpoint: '',
        subjects: [],
        terms: [],
        grades: [],
        selectedSubject: 'all',
        selectedTerm: 'q2'
    };

    function getMockData() {
        return {
            subjects: [
                { id: 'all', name: 'All subjects' },
                { id: 'math', name: 'Mathematics' },
                { id: 'physics', name: 'Physics' },
                { id: 'history', name: 'History' },
                { id: 'english', name: 'English' }
            ],
            terms: [
                { id: 'q1', name: 'Quarter 1' },
                { id: 'q2', name: 'Quarter 2' }
            ],
            grades: [
                { id: '1', subject_name: 'Mathematics', grade_value: 5, grade_type: 'quiz', comment: 'Great logic', grade_date: '2026-03-01' },
                { id: '2', subject_name: 'Physics', grade_value: 4, grade_type: 'classwork', comment: 'Accurate but slow', grade_date: '2026-02-28' },
                { id: '3', subject_name: 'History', grade_value: 5, grade_type: 'homework', comment: 'Good argumentation', grade_date: '2026-02-27' },
                { id: '4', subject_name: 'English', grade_value: 3, grade_type: 'essay', comment: 'Grammar issues', grade_date: '2026-02-26' }
            ]
        };
    }

    function setSelect(select, options, selected) {
        if (!select) return;
        select.innerHTML = options.map((option) => `
            <option value="${U.escapeHtml(option.id)}" ${String(option.id) === String(selected) ? 'selected' : ''}>${U.escapeHtml(option.name)}</option>
        `).join('');
    }

    function subjectStats() {
        const map = new Map();
        state.grades.forEach((row) => {
            const key = row.subject_name || 'Unknown';
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(Number(row.grade_value || 0));
        });
        return Array.from(map.entries()).map(([name, values]) => {
            const avg = values.reduce((a, b) => a + b, 0) / values.length;
            return { name, avg, count: values.length };
        });
    }

    function renderKpis() {
        const total = state.grades.length;
        const avg = total ? state.grades.reduce((a, b) => a + Number(b.grade_value || 0), 0) / total : 0;
        const latest = [...state.grades].sort((a, b) => new Date(b.grade_date) - new Date(a.grade_date))[0];
        return `
            <div class="diary-grid diary-grid-3">
                <article class="diary-panel diary-kpi">
                    <h3>Average</h3>
                    <div class="value">${avg.toFixed(2)}</div>
                    <div class="hint">Across selected term and subject</div>
                </article>
                <article class="diary-panel diary-kpi">
                    <h3>Marks count</h3>
                    <div class="value">${total}</div>
                    <div class="hint">All recorded entries</div>
                </article>
                <article class="diary-panel diary-kpi">
                    <h3>Latest mark</h3>
                    <div class="value">${latest ? U.escapeHtml(latest.grade_value) : '-'}</div>
                    <div class="hint">${latest ? U.escapeHtml(latest.subject_name) : 'No data'}</div>
                </article>
            </div>
        `;
    }

    function renderSubjectCards() {
        const stats = subjectStats();
        if (!stats.length) return U.renderState('empty', 'No subjects for selected filters');
        return `
            <div class="diary-grid diary-grid-2">
                ${stats.map((item) => `
                    <article class="diary-panel">
                        <h3>${U.escapeHtml(item.name)}</h3>
                        <div class="diary-kpi">
                            <div class="value">${item.avg.toFixed(2)}</div>
                            <div class="hint">${item.count} marks</div>
                        </div>
                        <div class="diary-progress" style="margin-top:10px;">
                            <span style="width:${Math.max(0, Math.min(100, (item.avg / 5) * 100))}%"></span>
                        </div>
                    </article>
                `).join('')}
            </div>
        `;
    }

    function renderTable() {
        if (!state.grades.length) return U.renderState('empty', 'No grade rows');
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
                                <td>${U.escapeHtml(row.subject_name || '-')}</td>
                                <td><strong>${U.escapeHtml(row.grade_value)}</strong></td>
                                <td>${U.escapeHtml(row.grade_type || '-')}</td>
                                <td>${U.escapeHtml(row.comment || '-')}</td>
                                <td>${U.escapeHtml(row.grade_date || '-')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    function render() {
        const root = document.getElementById('studentDiaryRoot');
        if (!root) return;
        root.innerHTML = `
            ${U.renderIntegrationBadge(state.integrationStatus, state.endpoint)}
            ${renderKpis()}
            <div style="margin-top:14px;">${renderSubjectCards()}</div>
            <div class="diary-panel" style="margin-top:14px;">${renderTable()}</div>
        `;
    }

    async function loadData() {
        const endpoint = `/api/v1/students/me/grades?subject_id=${encodeURIComponent(state.selectedSubject)}&term_id=${encodeURIComponent(state.selectedTerm)}`;
        const result = await U.fetchWithFallback(endpoint, getMockData, { method: 'GET' });
        state.integrationStatus = result.integrationStatus;
        state.endpoint = result.endpoint;
        const payload = result.data || getMockData();
        state.subjects = Array.isArray(payload.subjects) ? payload.subjects : [];
        state.terms = Array.isArray(payload.terms) ? payload.terms : [];
        state.grades = Array.isArray(payload.grades) ? payload.grades : [];

        setSelect(document.getElementById('studentDiarySubjectFilter'), state.subjects, state.selectedSubject);
        setSelect(document.getElementById('studentDiaryTermFilter'), state.terms, state.selectedTerm);
    }

    function bindEvents() {
        const subject = document.getElementById('studentDiarySubjectFilter');
        const term = document.getElementById('studentDiaryTermFilter');
        if (subject) {
            subject.onchange = async () => {
                state.selectedSubject = subject.value;
                await loadData();
                render();
            };
        }
        if (term) {
            term.onchange = async () => {
                state.selectedTerm = term.value;
                await loadData();
                render();
            };
        }
    }

    async function init() {
        if (!U) return;
        const root = document.getElementById('studentDiaryRoot');
        if (!root) return;
        root.innerHTML = U.renderState('loading', 'Loading student diary...');
        bindEvents();
        try {
            await loadData();
            render();
        } catch (error) {
            root.innerHTML = U.renderState('error', error.message || 'Failed to load diary');
        }
    }

    window.StudentDiaryPage = { init };
})();
