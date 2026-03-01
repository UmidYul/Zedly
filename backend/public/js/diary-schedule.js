// Diary schedule page scaffold for teacher/student (API-first with mock fallback)
(function () {
    'use strict';

    const U = window.ZedlyDiaryUtils;
    const state = {
        weekStart: startOfWeek(new Date()),
        integrationStatus: 'mock',
        endpoint: '',
        lessons: []
    };

    function startOfWeek(date) {
        const d = new Date(date);
        const day = d.getDay();
        const mondayShift = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + mondayShift);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    function weekLabel(date) {
        const from = new Date(date);
        const to = new Date(date);
        to.setDate(to.getDate() + 6);
        return `${from.toLocaleDateString()} - ${to.toLocaleDateString()}`;
    }

    function getCurrentRole() {
        try {
            const raw = localStorage.getItem('user');
            const user = raw ? JSON.parse(raw) : null;
            return user?.role || 'student';
        } catch (error) {
            return 'student';
        }
    }

    function getMockLessons() {
        const base = new Date(state.weekStart);
        return [0, 1, 2, 3, 4].map((offset, idx) => {
            const day = new Date(base);
            day.setDate(base.getDate() + offset);
            return {
                id: `lesson-${idx + 1}`,
                date: day.toISOString().slice(0, 10),
                lesson_no: idx + 1,
                start_time: `${String(8 + idx).padStart(2, '0')}:30`,
                end_time: `${String(9 + idx).padStart(2, '0')}:15`,
                subject: ['Mathematics', 'Physics', 'History', 'Biology', 'English'][idx],
                class_name: ['7A', '8B', '7A', '9A', '8B'][idx],
                room: `3${idx + 1}0`
            };
        });
    }

    async function loadData() {
        const role = getCurrentRole();
        const weekStart = state.weekStart.toISOString().slice(0, 10);
        const endpoint = role === 'teacher'
            ? `/api/v1/schedule/teacher/me?week_start=${weekStart}`
            : `/api/v1/schedule/student/me?week_start=${weekStart}`;

        const result = await U.fetchWithFallback(endpoint, () => ({ lessons: getMockLessons() }), { method: 'GET' });
        state.integrationStatus = result.integrationStatus;
        state.endpoint = result.endpoint;
        state.lessons = Array.isArray(result.data?.lessons) ? result.data.lessons : getMockLessons();
    }

    function renderTable() {
        if (!state.lessons.length) {
            return U.renderState('empty', 'No lessons for this week');
        }

        return `
            <div class="table-responsive mobile-stack-table">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Lesson</th>
                            <th>Time</th>
                            <th>Subject</th>
                            <th>Class</th>
                            <th>Room</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${state.lessons.map((row) => `
                            <tr>
                                <td>${U.escapeHtml(row.date || '-')}</td>
                                <td>${U.escapeHtml(row.lesson_no ?? '-')}</td>
                                <td>${U.escapeHtml(`${row.start_time || '--:--'} - ${row.end_time || '--:--'}`)}</td>
                                <td>${U.escapeHtml(row.subject || row.subject_name || '-')}</td>
                                <td>${U.escapeHtml(row.class_name || '-')}</td>
                                <td>${U.escapeHtml(row.room || '-')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    async function render() {
        const root = document.getElementById('scheduleRoot');
        if (!root) return;
        root.innerHTML = U.renderState('loading', 'Loading schedule...');
        await loadData();

        root.innerHTML = `
            ${U.renderIntegrationBadge(state.integrationStatus, state.endpoint)}
            <div class="dashboard-section">
                <div class="section-header">
                    <h2 class="section-title">Week: ${U.escapeHtml(weekLabel(state.weekStart))}</h2>
                </div>
                ${renderTable()}
            </div>
        `;
    }

    function bindControls() {
        const reload = () => render().catch((error) => {
            const root = document.getElementById('scheduleRoot');
            if (root) root.innerHTML = U.renderState('error', error.message || 'Failed to load schedule');
        });
        const prevBtn = document.getElementById('schedulePrevWeekBtn');
        const nextBtn = document.getElementById('scheduleNextWeekBtn');
        const todayBtn = document.getElementById('scheduleTodayBtn');

        if (prevBtn) {
            prevBtn.onclick = () => {
                state.weekStart.setDate(state.weekStart.getDate() - 7);
                reload();
            };
        }
        if (nextBtn) {
            nextBtn.onclick = () => {
                state.weekStart.setDate(state.weekStart.getDate() + 7);
                reload();
            };
        }
        if (todayBtn) {
            todayBtn.onclick = () => {
                state.weekStart = startOfWeek(new Date());
                reload();
            };
        }
    }

    function init() {
        if (!window.ZedlyDiaryUtils) return;
        bindControls();
        render().catch((error) => {
            const root = document.getElementById('scheduleRoot');
            if (root) root.innerHTML = U.renderState('error', error.message || 'Failed to load schedule');
        });
    }

    window.DiarySchedulePage = { init };
})();
