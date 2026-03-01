// Attendance page scaffold for teacher/student (API-first with mock fallback)
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
        const role = getRole();
        return {
            attendance: role === 'teacher'
                ? [
                    { lesson_date: '2026-03-01', class_name: '7A', subject: 'Mathematics', present: 24, absent: 2 },
                    { lesson_date: '2026-02-28', class_name: '8B', subject: 'Physics', present: 21, absent: 3 }
                ]
                : [
                    { lesson_date: '2026-03-01', subject: 'Mathematics', status: 'present', comment: '' },
                    { lesson_date: '2026-02-28', subject: 'Physics', status: 'absent', comment: 'Medical note' }
                ]
        };
    }

    async function loadData() {
        const role = getRole();
        const endpoint = role === 'teacher'
            ? '/api/v1/attendance/sessions?week=current'
            : '/api/v1/attendance/students/me?week=current';
        const result = await U.fetchWithFallback(endpoint, getMockData, { method: 'GET' });
        state.integrationStatus = result.integrationStatus;
        state.endpoint = result.endpoint;
        state.rows = Array.isArray(result.data?.attendance) ? result.data.attendance : [];
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
                        </tr>
                    </thead>
                    <tbody>
                        ${state.rows.map((row) => `
                            <tr>
                                <td>${U.escapeHtml(row.lesson_date || '-')}</td>
                                <td>${U.escapeHtml(row.class_name || '-')}</td>
                                <td>${U.escapeHtml(row.subject || row.subject_name || '-')}</td>
                                <td>${U.escapeHtml(row.present ?? '-')}</td>
                                <td>${U.escapeHtml(row.absent ?? '-')}</td>
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
                                <td>${U.escapeHtml(row.subject || row.subject_name || '-')}</td>
                                <td>${U.escapeHtml(row.status || '-')}</td>
                                <td>${U.escapeHtml(row.comment || '-')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    async function render() {
        const root = document.getElementById('attendanceRoot');
        if (!root) return;
        root.innerHTML = U.renderState('loading', 'Loading attendance...');
        await loadData();
        const role = getRole();
        root.innerHTML = `
            ${U.renderIntegrationBadge(state.integrationStatus, state.endpoint)}
            ${role === 'teacher' ? renderTeacherTable() : renderStudentTable()}
        `;
    }

    function init() {
        if (!window.ZedlyDiaryUtils) return;
        render().catch((error) => {
            const root = document.getElementById('attendanceRoot');
            if (root) root.innerHTML = U.renderState('error', error.message || 'Failed to load attendance');
        });
    }

    window.AttendancePage = { init };
})();
