// Attendance page for teacher/student (rich scaffold, API-first + mock fallback)
(function () {
    'use strict';

    const U = window.ZedlyDiaryUtils;
    const state = {
        integrationStatus: 'mock',
        endpoint: '',
        rows: []
    };

    function role() {
        return U.getRole() || 'student';
    }

    function getMockData() {
        if (role() === 'teacher') {
            return {
                attendance: [
                    { id: 'a1', lesson_date: '2026-03-01', class_name: '7A', subject_name: 'Mathematics', present: 24, absent: 2, late: 1 },
                    { id: 'a2', lesson_date: '2026-02-28', class_name: '8B', subject_name: 'Physics', present: 21, absent: 3, late: 0 },
                    { id: 'a3', lesson_date: '2026-02-27', class_name: '9A', subject_name: 'History', present: 22, absent: 1, late: 2 }
                ]
            };
        }
        return {
            attendance: [
                { id: 's1', lesson_date: '2026-03-01', subject_name: 'Mathematics', status: 'present', comment: '' },
                { id: 's2', lesson_date: '2026-02-28', subject_name: 'Physics', status: 'absent', comment: 'Medical certificate' },
                { id: 's3', lesson_date: '2026-02-27', subject_name: 'History', status: 'late', comment: 'Transport delay' }
            ]
        };
    }

    async function loadData() {
        const endpoint = role() === 'teacher'
            ? '/api/v1/attendance/sessions?range=week'
            : '/api/v1/attendance/students/me?range=week';
        const result = await U.fetchWithFallback(endpoint, getMockData, { method: 'GET' });
        state.integrationStatus = result.integrationStatus;
        state.endpoint = result.endpoint;
        state.rows = Array.isArray(result.data?.attendance) ? result.data.attendance : [];
    }

    function renderKpisTeacher() {
        const lessons = state.rows.length;
        const present = state.rows.reduce((acc, row) => acc + Number(row.present || 0), 0);
        const absent = state.rows.reduce((acc, row) => acc + Number(row.absent || 0), 0);
        return `
            <div class="diary-grid diary-grid-3">
                <article class="diary-panel diary-kpi"><h3>Lessons tracked</h3><div class="value">${lessons}</div><div class="hint">Current week</div></article>
                <article class="diary-panel diary-kpi"><h3>Total present</h3><div class="value">${present}</div><div class="hint">All sessions</div></article>
                <article class="diary-panel diary-kpi"><h3>Total absent</h3><div class="value">${absent}</div><div class="hint">Attention required</div></article>
            </div>
        `;
    }

    function renderKpisStudent() {
        const total = state.rows.length;
        const present = state.rows.filter((row) => row.status === 'present').length;
        const absent = state.rows.filter((row) => row.status === 'absent').length;
        return `
            <div class="diary-grid diary-grid-3">
                <article class="diary-panel diary-kpi"><h3>Total lessons</h3><div class="value">${total}</div><div class="hint">Current range</div></article>
                <article class="diary-panel diary-kpi"><h3>Present</h3><div class="value">${present}</div><div class="hint">Attendance rate ${(total ? (present / total) * 100 : 0).toFixed(0)}%</div></article>
                <article class="diary-panel diary-kpi"><h3>Absent</h3><div class="value">${absent}</div><div class="hint">Check missed lessons</div></article>
            </div>
        `;
    }

    function renderTeacherTable() {
        if (!state.rows.length) return U.renderState('empty', 'No attendance sessions');
        return `
            <div class="table-responsive mobile-stack-table">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Class</th>
                            <th>Subject</th>
                            <th>Present</th>
                            <th>Absent</th>
                            <th>Late</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${state.rows.map((row) => `
                            <tr>
                                <td>${U.escapeHtml(row.lesson_date || '-')}</td>
                                <td>${U.escapeHtml(row.class_name || '-')}</td>
                                <td>${U.escapeHtml(row.subject_name || '-')}</td>
                                <td>${U.escapeHtml(row.present ?? '-')}</td>
                                <td>${U.escapeHtml(row.absent ?? '-')}</td>
                                <td>${U.escapeHtml(row.late ?? '-')}</td>
                                <td><button class="btn btn-outline btn-sm" data-mark="${U.escapeHtml(row.id)}">Mark</button></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    function renderStudentTable() {
        if (!state.rows.length) return U.renderState('empty', 'No attendance records');
        return `
            <div class="table-responsive mobile-stack-table">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Subject</th>
                            <th>Status</th>
                            <th>Comment</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${state.rows.map((row) => `
                            <tr>
                                <td>${U.escapeHtml(row.lesson_date || '-')}</td>
                                <td>${U.escapeHtml(row.subject_name || '-')}</td>
                                <td>${U.escapeHtml(row.status || '-')}</td>
                                <td>${U.escapeHtml(row.comment || '-')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    function render() {
        const root = document.getElementById('attendanceRoot');
        if (!root) return;
        root.innerHTML = `
            ${U.renderIntegrationBadge(state.integrationStatus, state.endpoint)}
            ${role() === 'teacher' ? renderKpisTeacher() : renderKpisStudent()}
            <div class="diary-panel" style="margin-top:14px;">
                ${role() === 'teacher' ? renderTeacherTable() : renderStudentTable()}
            </div>
        `;
    }

    function bindEvents() {
        const root = document.getElementById('attendanceRoot');
        if (!root || role() !== 'teacher') return;
        root.onclick = (event) => {
            const btn = event.target.closest('button[data-mark]');
            if (!btn) return;
            const id = btn.getAttribute('data-mark');
            if (!id) return;
            state.rows = state.rows.map((row) => {
                if (String(row.id) !== String(id)) return row;
                return { ...row, present: Number(row.present || 0) + 1 };
            });
            render();
        };
    }

    async function init() {
        if (!U) return;
        const root = document.getElementById('attendanceRoot');
        if (!root) return;
        root.innerHTML = U.renderState('loading', 'Loading attendance...');
        bindEvents();
        try {
            await loadData();
            render();
        } catch (error) {
            root.innerHTML = U.renderState('error', error.message || 'Failed to load attendance');
        }
    }

    window.AttendancePage = { init };
})();
