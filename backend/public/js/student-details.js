(function () {
    'use strict';

    const API_URL = '/api';
    const state = {
        token: null,
        currentUser: null,
        studentId: null,
        report: null,
        subjectSearch: '',
        subjectSort: 'avg_desc',
        progressRange: '30'
    };

    function showAlert(message, title = 'Info') {
        if (window.ZedlyDialog?.alert) {
            return window.ZedlyDialog.alert(message, { title });
        }
        alert(message);
        return Promise.resolve(true);
    }

    function showConfirm(message, title = 'Confirmation') {
        if (window.ZedlyDialog?.confirm) {
            return window.ZedlyDialog.confirm(message, { title });
        }
        return Promise.resolve(confirm(message));
    }

    function showTempPassword(password, studentName) {
        if (window.ZedlyDialog?.temporaryPassword) {
            return window.ZedlyDialog.temporaryPassword({
                title: 'Temporary password',
                subtitle: `Password for ${studentName}`,
                password: password || '',
                passwordLabel: 'Temporary password',
                copyText: 'Copy',
                hint: 'Student must change this password after next login.'
            });
        }
        return showAlert(`Temporary password: ${password || '-'}`, 'Password reset');
    }

    function safeText(value, fallback = '-') {
        if (value === null || value === undefined || value === '') return fallback;
        return String(value);
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function toNumber(value) {
        const num = Number(value);
        return Number.isFinite(num) ? num : 0;
    }

    function toPercent(value, digits = 1) {
        return `${toNumber(value).toFixed(digits)}%`;
    }

    function formatDateTime(isoValue) {
        if (!isoValue) return '-';
        const date = new Date(isoValue);
        if (Number.isNaN(date.getTime())) return '-';
        return date.toLocaleString();
    }

    function formatShortDate(isoValue) {
        const date = new Date(isoValue);
        if (Number.isNaN(date.getTime())) return '-';
        return date.toLocaleDateString();
    }

    function getInitials(name) {
        const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return 'S';
        if (parts.length === 1) return parts[0][0].toUpperCase();
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }

    function getToken() {
        return localStorage.getItem('access_token') || localStorage.getItem('accessToken') || '';
    }

    async function fetchCurrentUser(token) {
        const cached = localStorage.getItem('user');
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                if (parsed?.id) return parsed;
            } catch (_) {
                // ignore parse error
            }
        }

        const response = await fetch(`${API_URL}/auth/me`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Failed to fetch current user');
        const data = await response.json();
        localStorage.setItem('user', JSON.stringify(data));
        return data;
    }

    function resolveStudentId(currentUser) {
        const params = new URLSearchParams(window.location.search);
        const fromQuery = params.get('id');
        if (fromQuery) return String(fromQuery);
        if (currentUser?.role === 'student') return String(currentUser.id);
        return null;
    }

    async function fetchStudentReport() {
        const response = await fetch(`${API_URL}/analytics/student/${encodeURIComponent(state.studentId)}/report`, {
            headers: { Authorization: `Bearer ${state.token}` }
        });

        if (!response.ok) {
            if (response.status === 403) throw new Error('Access denied for this student');
            if (response.status === 404) throw new Error('Student not found');
            throw new Error('Failed to load student report');
        }

        return response.json();
    }

    function renderHero() {
        const student = state.report?.student || {};
        const fullName = `${safeText(student.first_name, '').trim()} ${safeText(student.last_name, '').trim()}`.trim() || 'Student';
        const classPart = safeText(student.class_name, 'No class');
        const gradePart = safeText(student.grade_level, 'N/A');
        const emailPart = safeText(student.email, 'No email');

        document.getElementById('studentFullName').textContent = fullName;
        document.getElementById('studentMeta').textContent = `Class: ${classPart} • Grade: ${gradePart} • Email: ${emailPart}`;
        document.getElementById('studentAvatar').textContent = getInitials(fullName);
        document.getElementById('updatedAt').textContent = formatDateTime(new Date().toISOString());
    }

    function renderKpis() {
        const overall = state.report?.overall || {};
        const ranking = state.report?.ranking || {};
        const attempts = toNumber(overall.total_attempts);
        const passed = toNumber(overall.passed_count);
        const passRate = attempts > 0 ? (passed / attempts) * 100 : 0;
        const rank = toNumber(ranking.rank);
        const totalStudents = toNumber(ranking.total_students);

        document.getElementById('kpiAttempts').textContent = String(attempts);
        document.getElementById('kpiAvgScore').textContent = toPercent(overall.avg_score);
        document.getElementById('kpiPassRate').textContent = toPercent(passRate);
        document.getElementById('kpiRank').textContent = rank > 0 ? `#${rank}/${totalStudents}` : '-';
        document.getElementById('kpiBest').textContent = toPercent(overall.max_score);
        document.getElementById('kpiAvgTime').textContent = `${toNumber(overall.avg_time_minutes).toFixed(1)}m`;
    }

    function getFilteredSubjects() {
        const list = Array.isArray(state.report?.by_subject) ? [...state.report.by_subject] : [];
        const query = state.subjectSearch.trim().toLowerCase();
        let filtered = list;

        if (query) {
            filtered = filtered.filter((row) => String(row.subject || '').toLowerCase().includes(query));
        }

        const sortKey = state.subjectSort;
        filtered.sort((a, b) => {
            if (sortKey === 'avg_desc') return toNumber(b.avg_score) - toNumber(a.avg_score);
            if (sortKey === 'avg_asc') return toNumber(a.avg_score) - toNumber(b.avg_score);
            if (sortKey === 'attempts_desc') return toNumber(b.attempts) - toNumber(a.attempts);
            if (sortKey === 'pass_desc') return toNumber(b.pass_rate) - toNumber(a.pass_rate);
            return String(a.subject || '').localeCompare(String(b.subject || ''));
        });

        return filtered;
    }

    function renderSubjects() {
        const body = document.getElementById('subjectsBody');
        const rows = getFilteredSubjects();

        if (!rows.length) {
            body.innerHTML = '<tr><td class="empty-row" colspan="6">No subject records found.</td></tr>';
            return;
        }

        body.innerHTML = rows.map((row) => `
            <tr>
                <td>${escapeHtml(row.subject || '-')}</td>
                <td>${toNumber(row.attempts)}</td>
                <td>${toPercent(row.avg_score)}</td>
                <td>${toPercent(row.best_score)}</td>
                <td>${toPercent(row.worst_score)}</td>
                <td>${toPercent(row.pass_rate)}</td>
            </tr>
        `).join('');
    }

    function getProgressRows() {
        const rows = Array.isArray(state.report?.progress) ? [...state.report.progress] : [];
        if (state.progressRange === 'all') return rows;

        const days = Number(state.progressRange);
        const now = new Date();
        return rows.filter((row) => {
            const week = new Date(row.week);
            if (Number.isNaN(week.getTime())) return false;
            const diff = now.getTime() - week.getTime();
            const ageDays = diff / (1000 * 60 * 60 * 24);
            return ageDays <= days;
        });
    }

    function buildChartSvg(rows) {
        if (!rows.length) {
            return '<div class="chart-empty">No progress data for selected range.</div>';
        }

        const width = 920;
        const height = 260;
        const left = 42;
        const right = 16;
        const top = 20;
        const bottom = 30;
        const innerWidth = width - left - right;
        const innerHeight = height - top - bottom;

        const points = rows.map((row, index) => {
            const x = left + (index * innerWidth) / Math.max(1, rows.length - 1);
            const y = top + innerHeight - (Math.max(0, Math.min(100, toNumber(row.avg_score))) / 100) * innerHeight;
            return { x, y, raw: row };
        });

        const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
        const gridLines = [0, 25, 50, 75, 100].map((v) => {
            const y = top + innerHeight - (v / 100) * innerHeight;
            return `<g class="chart-axis"><line class="chart-grid" x1="${left}" y1="${y}" x2="${width - right}" y2="${y}"></line><text x="4" y="${y + 4}">${v}%</text></g>`;
        }).join('');

        const dots = points.map((point) => {
            const label = `${formatShortDate(point.raw.week)} - ${toPercent(point.raw.avg_score)} (${toNumber(point.raw.attempts)} attempts)`;
            return `<circle class="chart-dot" cx="${point.x}" cy="${point.y}" r="5"><title>${escapeHtml(label)}</title></circle>`;
        }).join('');

        const labels = points.map((point, index) => {
            if (rows.length > 10 && index % 2 === 1) return '';
            return `<text x="${point.x}" y="${height - 8}" text-anchor="middle">${escapeHtml(formatShortDate(point.raw.week))}</text>`;
        }).join('');

        return `
            <svg class="progress-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Student progress chart">
                ${gridLines}
                <path class="chart-line" d="${path}"></path>
                ${dots}
                <g class="chart-axis">${labels}</g>
            </svg>
        `;
    }

    function renderProgress() {
        const visual = document.getElementById('progressVisual');
        const rows = getProgressRows();
        visual.innerHTML = buildChartSvg(rows);
    }

    function renderInsights() {
        const strengths = Array.isArray(state.report?.strengths) ? state.report.strengths : [];
        const weaknesses = Array.isArray(state.report?.weaknesses) ? state.report.weaknesses : [];
        const ranking = state.report?.ranking || {};

        const strengthsList = document.getElementById('strengthsList');
        const weaknessesList = document.getElementById('weaknessesList');
        const rankDetail = document.getElementById('rankDetail');
        const rankNote = document.getElementById('rankNote');

        strengthsList.innerHTML = strengths.length
            ? strengths.map((item) => `<span class="tag good">${escapeHtml(item.subject || '-')} • ${toPercent(item.avg_score)}</span>`).join('')
            : '<span class="tag">Not enough data yet</span>';

        weaknessesList.innerHTML = weaknesses.length
            ? weaknesses.map((item) => `<span class="tag bad">${escapeHtml(item.subject || '-')} • ${toPercent(item.avg_score)}</span>`).join('')
            : '<span class="tag">Not enough data yet</span>';

        const rank = toNumber(ranking.rank);
        const total = toNumber(ranking.total_students);
        if (rank > 0 && total > 0) {
            rankDetail.textContent = `#${rank}`;
            rankNote.textContent = `Out of ${total} students in class.`;
        } else {
            rankDetail.textContent = '-';
            rankNote.textContent = 'No class ranking data yet.';
        }
    }

    function renderAll() {
        renderHero();
        renderKpis();
        renderSubjects();
        renderProgress();
        renderInsights();
    }

    function setTab(tabId) {
        document.querySelectorAll('.tab-btn').forEach((btn) => {
            const active = btn.dataset.tab === tabId;
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-selected', String(active));
        });
        document.querySelectorAll('.tab-panel').forEach((panel) => {
            panel.classList.toggle('is-active', panel.dataset.panel === tabId);
        });
    }

    async function handleResetPassword() {
        if (!state.currentUser || !state.studentId) return;
        const role = state.currentUser.role;
        if (!['school_admin', 'teacher'].includes(role)) {
            return showAlert('Only school admin or teacher can reset student password.', 'Access');
        }

        const studentName = document.getElementById('studentFullName').textContent || 'Student';
        const approved = await showConfirm(`Reset password for ${studentName}?`, 'Confirm');
        if (!approved) return;

        const endpoint = role === 'teacher'
            ? `${API_URL}/teacher/students/${encodeURIComponent(state.studentId)}/reset-password`
            : `${API_URL}/admin/users/${encodeURIComponent(state.studentId)}/reset-password`;

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { Authorization: `Bearer ${state.token}` }
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(payload.message || 'Failed to reset password');
        }

        await showTempPassword(payload.tempPassword || '', studentName);
    }

    function downloadJsonReport() {
        const studentName = (document.getElementById('studentFullName').textContent || 'student')
            .toLowerCase()
            .replace(/\s+/g, '_');
        const filename = `${studentName}_report.json`;
        const blob = new Blob([JSON.stringify(state.report || {}, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    async function copyEmail() {
        const email = state.report?.student?.email;
        if (!email) {
            await showAlert('Student email is empty.', 'Info');
            return;
        }

        try {
            await navigator.clipboard.writeText(String(email));
            await showAlert('Email copied to clipboard.', 'Success');
        } catch (_) {
            await showAlert(`Email: ${email}`, 'Copy failed');
        }
    }

    function bindEvents() {
        const backBtn = document.getElementById('backBtn');
        backBtn.addEventListener('click', () => {
            if (document.referrer) {
                history.back();
            } else {
                window.location.href = 'dashboard.html';
            }
        });

        document.querySelectorAll('.tab-btn').forEach((btn) => {
            btn.addEventListener('click', () => setTab(btn.dataset.tab));
        });

        document.getElementById('subjectSearch').addEventListener('input', (event) => {
            state.subjectSearch = event.target.value || '';
            renderSubjects();
        });

        document.getElementById('subjectSort').addEventListener('change', (event) => {
            state.subjectSort = event.target.value || 'avg_desc';
            renderSubjects();
        });

        document.querySelectorAll('.segment-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                state.progressRange = btn.dataset.range || '30';
                document.querySelectorAll('.segment-btn').forEach((item) => {
                    item.classList.toggle('is-active', item === btn);
                });
                renderProgress();
            });
        });

        document.getElementById('exportJsonBtn').addEventListener('click', downloadJsonReport);
        document.getElementById('printBtn').addEventListener('click', () => window.print());
        document.getElementById('copyEmailBtn').addEventListener('click', () => {
            copyEmail().catch((error) => showAlert(error.message || 'Failed to copy email', 'Error'));
        });
        document.getElementById('resetPasswordBtn').addEventListener('click', () => {
            handleResetPassword().catch((error) => showAlert(error.message || 'Failed to reset password', 'Error'));
        });
    }

    function setupRoleActions() {
        const btn = document.getElementById('resetPasswordBtn');
        if (!state.currentUser || !['school_admin', 'teacher'].includes(state.currentUser.role)) {
            btn.style.display = 'none';
        }
    }

    async function init() {
        try {
            state.token = getToken();
            if (!state.token) {
                window.location.href = '/login.html';
                return;
            }

            state.currentUser = await fetchCurrentUser(state.token);
            state.studentId = resolveStudentId(state.currentUser);
            if (!state.studentId) {
                throw new Error('Student id is required in URL (?id=...) for this role');
            }

            bindEvents();
            setupRoleActions();
            state.report = await fetchStudentReport();
            renderAll();
        } catch (error) {
            console.error('Student details init error:', error);
            document.getElementById('studentFullName').textContent = 'Failed to load student profile';
            document.getElementById('studentMeta').textContent = error.message || 'Unknown error';
            showAlert(error.message || 'Failed to open student page', 'Error');
        }
    }

    window.addEventListener('DOMContentLoaded', init);
})();
