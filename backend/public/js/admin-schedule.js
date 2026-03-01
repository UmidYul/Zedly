// School admin schedule page scaffold (API-first with mock fallback)
(function () {
    'use strict';

    const U = window.ZedlyDiaryUtils;
    const state = {
        integrationStatus: 'mock',
        endpoint: '',
        classes: [],
        lessons: []
    };

    function getMockData() {
        return {
            classes: [
                { id: '7a', name: '7A' },
                { id: '8b', name: '8B' },
                { id: '9a', name: '9A' }
            ],
            lessons: [
                { weekday: 'Monday', lesson_no: 1, class_name: '7A', subject: 'Mathematics', teacher: 'I. Ivanov', room: '301' },
                { weekday: 'Monday', lesson_no: 2, class_name: '8B', subject: 'Physics', teacher: 'S. Akhmedov', room: '204' },
                { weekday: 'Tuesday', lesson_no: 1, class_name: '9A', subject: 'History', teacher: 'M. Karimova', room: '110' }
            ]
        };
    }

    function setClassOptions() {
        const select = document.getElementById('adminScheduleClassFilter');
        if (!select) return;
        select.innerHTML = `<option value="all">All classes</option>${
            state.classes.map((c) => `<option value="${c.id}">${U.escapeHtml(c.name)}</option>`).join('')
        }`;
    }

    async function loadData() {
        const classId = document.getElementById('adminScheduleClassFilter')?.value || 'all';
        const endpoint = `/api/v1/schedule/lessons?class_id=${encodeURIComponent(classId)}`;
        const result = await U.fetchWithFallback(endpoint, getMockData, { method: 'GET' });
        state.integrationStatus = result.integrationStatus;
        state.endpoint = result.endpoint;
        const payload = result.data || {};
        state.classes = Array.isArray(payload.classes) ? payload.classes : getMockData().classes;
        state.lessons = Array.isArray(payload.lessons) ? payload.lessons : [];
    }

    function renderTable() {
        if (!state.lessons.length) return U.renderState('empty', 'No schedule records');

        return `
            <div class="table-responsive mobile-stack-table">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Weekday</th>
                            <th>Lesson</th>
                            <th>Class</th>
                            <th>Subject</th>
                            <th>Teacher</th>
                            <th>Room</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${state.lessons.map((row) => `
                            <tr>
                                <td>${U.escapeHtml(row.weekday || '-')}</td>
                                <td>${U.escapeHtml(row.lesson_no ?? '-')}</td>
                                <td>${U.escapeHtml(row.class_name || '-')}</td>
                                <td>${U.escapeHtml(row.subject || row.subject_name || '-')}</td>
                                <td>${U.escapeHtml(row.teacher || row.teacher_name || '-')}</td>
                                <td>${U.escapeHtml(row.room || '-')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    async function render() {
        const root = document.getElementById('adminScheduleRoot');
        if (!root) return;
        root.innerHTML = U.renderState('loading', 'Loading school schedule...');
        await loadData();
        setClassOptions();
        root.innerHTML = `
            ${U.renderIntegrationBadge(state.integrationStatus, state.endpoint)}
            ${renderTable()}
        `;
    }

    function bindControls() {
        const classFilter = document.getElementById('adminScheduleClassFilter');
        const addBtn = document.getElementById('adminScheduleAddLessonBtn');
        if (classFilter) classFilter.onchange = () => render();
        if (addBtn) {
            addBtn.onclick = () => {
                state.lessons = [
                    { weekday: 'Wednesday', lesson_no: 3, class_name: '7A', subject: 'Biology', teacher: 'R. Salimov', room: '210' },
                    ...state.lessons
                ];
                const root = document.getElementById('adminScheduleRoot');
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
            const root = document.getElementById('adminScheduleRoot');
            if (root) root.innerHTML = U.renderState('error', error.message || 'Failed to load school schedule');
        });
    }

    window.AdminSchedulePage = { init };
})();
