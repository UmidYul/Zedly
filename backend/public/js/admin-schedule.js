// School admin schedule page (rich scaffold, API-first + mock fallback)
(function () {
    'use strict';

    const U = window.ZedlyDiaryUtils;
    const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const state = {
        integrationStatus: 'mock',
        endpoint: '',
        classes: [],
        lessons: [],
        selectedClass: 'all'
    };

    function mockData() {
        return {
            classes: [
                { id: 'all', name: 'All classes' },
                { id: '7a', name: '7A' },
                { id: '8b', name: '8B' },
                { id: '9a', name: '9A' }
            ],
            lessons: [
                { id: 'l1', class_id: '7a', weekday: 'Mon', slot: 1, subject_name: 'Mathematics', teacher_name: 'I. Ivanov', room: '301' },
                { id: 'l2', class_id: '7a', weekday: 'Tue', slot: 2, subject_name: 'Physics', teacher_name: 'S. Akhmedov', room: '204' },
                { id: 'l3', class_id: '8b', weekday: 'Wed', slot: 1, subject_name: 'History', teacher_name: 'M. Karimova', room: '110' },
                { id: 'l4', class_id: '9a', weekday: 'Thu', slot: 3, subject_name: 'Biology', teacher_name: 'R. Salimov', room: '210' }
            ]
        };
    }

    function filteredLessons() {
        if (state.selectedClass === 'all') return state.lessons;
        return state.lessons.filter((row) => String(row.class_id) === String(state.selectedClass));
    }

    async function loadData() {
        const endpoint = `/api/v1/schedule/lessons?class_id=${encodeURIComponent(state.selectedClass)}`;
        const result = await U.fetchWithFallback(endpoint, mockData, { method: 'GET' });
        state.integrationStatus = result.integrationStatus;
        state.endpoint = result.endpoint;
        const payload = result.data || mockData();
        state.classes = Array.isArray(payload.classes) ? payload.classes : [];
        state.lessons = Array.isArray(payload.lessons) ? payload.lessons : [];
    }

    function renderClassSelect() {
        const select = document.getElementById('adminScheduleClassFilter');
        if (!select) return;
        select.innerHTML = state.classes.map((item) => `
            <option value="${U.escapeHtml(item.id)}" ${String(item.id) === String(state.selectedClass) ? 'selected' : ''}>${U.escapeHtml(item.name)}</option>
        `).join('');
    }

    function lessonCell(day, slot) {
        const item = filteredLessons().find((row) => row.weekday === day && Number(row.slot) === Number(slot));
        if (!item) return '<span class="text-secondary">—</span>';
        return `
            <div>
                <strong>${U.escapeHtml(item.subject_name)}</strong>
                <p>${U.escapeHtml(item.teacher_name)}</p>
                <p>${U.escapeHtml(item.room)}</p>
            </div>
        `;
    }

    function renderGrid() {
        return `
            <div class="table-responsive mobile-stack-table">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Slot</th>
                            ${DAYS.map((day) => `<th>${day}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${[1, 2, 3, 4, 5, 6].map((slot) => `
                            <tr>
                                <td><strong>${slot}</strong></td>
                                ${DAYS.map((day) => `<td>${lessonCell(day, slot)}</td>`).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    function renderTable() {
        const rows = filteredLessons();
        if (!rows.length) return U.renderState('empty', 'No lessons in selected scope');
        return `
            <div class="table-responsive mobile-stack-table">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Day</th>
                            <th>Slot</th>
                            <th>Class</th>
                            <th>Subject</th>
                            <th>Teacher</th>
                            <th>Room</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map((row) => `
                            <tr>
                                <td>${U.escapeHtml(row.weekday || '-')}</td>
                                <td>${U.escapeHtml(row.slot ?? '-')}</td>
                                <td>${U.escapeHtml(row.class_id || '-')}</td>
                                <td>${U.escapeHtml(row.subject_name || '-')}</td>
                                <td>${U.escapeHtml(row.teacher_name || '-')}</td>
                                <td>${U.escapeHtml(row.room || '-')}</td>
                                <td><button class="btn btn-outline btn-sm" data-shift-id="${U.escapeHtml(row.id)}">Shift</button></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    function render() {
        const root = document.getElementById('adminScheduleRoot');
        if (!root) return;
        root.innerHTML = `
            ${U.renderIntegrationBadge(state.integrationStatus, state.endpoint)}
            <div class="diary-grid diary-grid-2">
                <article class="diary-panel">
                    <h3>Timetable matrix</h3>
                    ${renderGrid()}
                </article>
                <article class="diary-panel">
                    <h3>Lessons list</h3>
                    ${renderTable()}
                </article>
            </div>
        `;
    }

    function bindEvents() {
        const classFilter = document.getElementById('adminScheduleClassFilter');
        const addBtn = document.getElementById('adminScheduleAddLessonBtn');
        const root = document.getElementById('adminScheduleRoot');

        if (classFilter) {
            classFilter.onchange = async () => {
                state.selectedClass = classFilter.value;
                await loadData();
                renderClassSelect();
                render();
            };
        }
        if (addBtn) {
            addBtn.onclick = () => {
                state.lessons = [
                    {
                        id: `l-${Date.now()}`,
                        class_id: state.selectedClass === 'all' ? '7a' : state.selectedClass,
                        weekday: 'Fri',
                        slot: 2,
                        subject_name: 'New lesson',
                        teacher_name: 'Assigned later',
                        room: 'TBD'
                    },
                    ...state.lessons
                ];
                render();
            };
        }
        if (root) {
            root.onclick = (event) => {
                const btn = event.target.closest('button[data-shift-id]');
                if (!btn) return;
                const id = btn.getAttribute('data-shift-id');
                if (!id) return;
                state.lessons = state.lessons.map((row) => {
                    if (String(row.id) !== String(id)) return row;
                    return { ...row, weekday: row.weekday === 'Fri' ? 'Mon' : 'Fri' };
                });
                render();
            };
        }
    }

    async function init() {
        if (!U) return;
        const root = document.getElementById('adminScheduleRoot');
        if (!root) return;
        root.innerHTML = U.renderState('loading', 'Loading school schedule...');
        bindEvents();
        try {
            await loadData();
            renderClassSelect();
            render();
        } catch (error) {
            root.innerHTML = U.renderState('error', error.message || 'Failed to load school schedule');
        }
    }

    window.AdminSchedulePage = { init };
})();
