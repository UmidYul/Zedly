(function () {
    'use strict';

    const API_URL = '/api';
    const state = {
        currentUser: null,
        studentId: null,
        sourceClassId: null,
        teacherHomeroomClassId: null,
        report: null,
        subjectSearch: '',
        subjectSort: 'avg_desc',
        progressRange: '30'
    };

    function t(key, fallback, params) {
        return window.ZedlyI18n?.translate?.(key, params) || fallback || key;
    }

    function setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    function showAlert(message, title = t('common.info', 'Info')) {
        if (window.ZedlyDialog?.alert) {
            return window.ZedlyDialog.alert(message, { title });
        }
        alert(message);
        return Promise.resolve(true);
    }

    function showConfirm(message, title = t('common.confirmation', 'Confirmation')) {
        if (window.ZedlyDialog?.confirm) {
            return window.ZedlyDialog.confirm(message, { title });
        }
        return Promise.resolve(confirm(message));
    }

    function showTempPassword(password, studentName) {
        if (window.ZedlyDialog?.temporaryPassword) {
            return window.ZedlyDialog.temporaryPassword({
                title: t('studentDetails.tempPasswordTitle', 'Temporary password'),
                subtitle: t('studentDetails.tempPasswordFor', 'Password for {name}', { name: studentName }),
                password: password || '',
                passwordLabel: t('studentDetails.tempPasswordLabel', 'Temporary password'),
                copyText: t('studentDetails.copy', 'Copy'),
                hint: t('studentDetails.tempPasswordHint', 'Student must change this password after next login.')
            });
        }

        return showAlert(
            t('studentDetails.tempPasswordValue', 'Temporary password: {password}', { password: password || '-' }),
            t('studentDetails.passwordResetTitle', 'Password reset')
        );
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

    function getCurrentLocale() {
        const lang = window.ZedlyI18n?.getCurrentLang?.() || 'ru';
        return lang === 'uz' ? 'uz-UZ' : 'ru-RU';
    }

    function formatDateTime(isoValue) {
        if (!isoValue) return '-';
        const date = new Date(isoValue);
        if (Number.isNaN(date.getTime())) return '-';
        return date.toLocaleString(getCurrentLocale());
    }

    function formatShortDate(isoValue) {
        const date = new Date(isoValue);
        if (Number.isNaN(date.getTime())) return '-';
        return date.toLocaleDateString(getCurrentLocale());
    }

    function getInitials(name) {
        const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return 'S';
        if (parts.length === 1) return parts[0][0].toUpperCase();
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }

    function applyStaticI18n() {
        window.i18n?.translate?.();

        const pageTitle = t('studentDetails.pageTitle', 'Student Profile - ZEDLY');
        const pageTitleEl = document.getElementById('pageTitle');
        if (pageTitleEl) pageTitleEl.textContent = pageTitle;
        document.title = pageTitle;

        const backBtn = document.getElementById('backBtn');
        if (backBtn) {
            backBtn.setAttribute('aria-label', t('studentDetails.back', 'Back'));
        }

        const tabsBar = document.getElementById('tabsBar');
        if (tabsBar) {
            tabsBar.setAttribute('aria-label', t('studentDetails.tabsAriaLabel', 'Student report tabs'));
        }
    }

    async function fetchCurrentUser() {
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
            credentials: 'include'
        });

        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('auth_required');
            }
            throw new Error(t('studentDetails.failedFetchCurrentUser', 'Failed to fetch current user'));
        }

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

    function resolveSourceClassId() {
        const params = new URLSearchParams(window.location.search);
        const classId = params.get('class_id');
        return classId ? String(classId) : null;
    }

    async function fetchStudentReport() {
        const response = await fetch(`${API_URL}/analytics/student/${encodeURIComponent(state.studentId)}/report`, {
            credentials: 'include'
        });

        if (!response.ok) {
            if (response.status === 403) throw new Error(t('studentDetails.accessDeniedStudent', 'Access denied for this student'));
            if (response.status === 404) throw new Error(t('studentDetails.studentNotFound', 'Student not found'));
            throw new Error(t('studentDetails.failedLoadReport', 'Failed to load student report'));
        }

        return response.json();
    }

    async function fetchTeacherHomeroomClassId() {
        const response = await fetch(`${API_URL}/teacher/homeroom-class`, {
            credentials: 'include'
        });
        if (!response.ok) return null;
        const data = await response.json().catch(() => ({}));
        return data?.class?.id ? String(data.class.id) : null;
    }

    function renderHero() {
        const student = state.report?.student || {};
        const fullName = `${safeText(student.first_name, '').trim()} ${safeText(student.last_name, '').trim()}`.trim()
            || t('studentDetails.studentFallback', 'Student');
        const classPart = safeText(student.class_name, t('studentDetails.noClass', 'No class'));
        const gradePart = safeText(student.grade_level, '-');
        const emailPart = safeText(student.email, t('studentDetails.noEmail', 'No email'));

        setText('studentFullName', fullName);
        setText('studentMeta', t('studentDetails.metaTemplate', 'Class: {class} • Grade: {grade} • Email: {email}', {
            class: classPart,
            grade: gradePart,
            email: emailPart
        }));
        setText('studentAvatar', getInitials(fullName));
        setText('updatedAt', formatDateTime(new Date().toISOString()));
    }

    function renderKpis() {
        const overall = state.report?.overall || {};
        const ranking = state.report?.ranking || {};
        const attempts = toNumber(overall.total_attempts);
        const passed = toNumber(overall.passed_count);
        const passRate = attempts > 0 ? (passed / attempts) * 100 : 0;
        const rank = toNumber(ranking.rank);
        const totalStudents = toNumber(ranking.total_students);

        setText('kpiAttempts', String(attempts));
        setText('kpiAvgScore', toPercent(overall.avg_score));
        setText('kpiPassRate', toPercent(passRate));
        setText('kpiRank', rank > 0 ? `#${rank}/${totalStudents}` : '-');
        setText('kpiAvgTime', `${toNumber(overall.avg_time_minutes).toFixed(1)}${t('studentDetails.minutesSuffix', 'm')}`);
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
            body.innerHTML = `<tr><td class="empty-row" colspan="6">${escapeHtml(t('studentDetails.noSubjectRecords', 'No subject records found.'))}</td></tr>`;
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
            return `<div class="chart-empty">${escapeHtml(t('studentDetails.noProgressData', 'No progress data for selected range.'))}</div>`;
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
            const label = t('studentDetails.progressPointLabel', '{date} - {score} ({attempts} attempts)', {
                date: formatShortDate(point.raw.week),
                score: toPercent(point.raw.avg_score),
                attempts: toNumber(point.raw.attempts)
            });
            return `<circle class="chart-dot" cx="${point.x}" cy="${point.y}" r="5"><title>${escapeHtml(label)}</title></circle>`;
        }).join('');

        const labels = points.map((point, index) => {
            if (rows.length > 10 && index % 2 === 1) return '';
            return `<text x="${point.x}" y="${height - 8}" text-anchor="middle">${escapeHtml(formatShortDate(point.raw.week))}</text>`;
        }).join('');

        return `
            <svg class="progress-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(t('studentDetails.progressChartAria', 'Student progress chart'))}">
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

        const noDataLabel = t('studentDetails.notEnoughData', 'Not enough data yet');
        strengthsList.innerHTML = strengths.length
            ? strengths.map((item) => `<span class="tag good">${escapeHtml(item.subject || '-')} • ${toPercent(item.avg_score)}</span>`).join('')
            : `<span class="tag">${escapeHtml(noDataLabel)}</span>`;

        weaknessesList.innerHTML = weaknesses.length
            ? weaknesses.map((item) => `<span class="tag bad">${escapeHtml(item.subject || '-')} • ${toPercent(item.avg_score)}</span>`).join('')
            : `<span class="tag">${escapeHtml(noDataLabel)}</span>`;

        const rank = toNumber(ranking.rank);
        const total = toNumber(ranking.total_students);
        if (rank > 0 && total > 0) {
            rankDetail.textContent = `#${rank}`;
            rankNote.textContent = t('studentDetails.rankOutOf', 'Out of {total} students in class.', { total });
        } else {
            rankDetail.textContent = '-';
            rankNote.textContent = t('studentDetails.noClassRankData', 'No class ranking data yet.');
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
            return showAlert(
                t('studentDetails.resetAccessDeniedRole', 'Only school admin or teacher can reset student password.'),
                t('common.error', 'Error')
            );
        }
        if (role === 'teacher') {
            const sourceClassId = state.sourceClassId ? String(state.sourceClassId) : '';
            const homeroomClassId = state.teacherHomeroomClassId ? String(state.teacherHomeroomClassId) : '';
            if (!sourceClassId || !homeroomClassId || sourceClassId !== homeroomClassId) {
                return showAlert(
                    t('studentDetails.resetAccessDeniedClass', 'You can reset password only for students from your homeroom class.'),
                    t('common.error', 'Error')
                );
            }
        }

        const studentName = document.getElementById('studentFullName')?.textContent || t('studentDetails.studentGenitive', 'student');
        const approved = await showConfirm(
            t('studentDetails.confirmResetPassword', 'Reset password for {name}?', { name: studentName }),
            t('common.confirmation', 'Confirmation')
        );
        if (!approved) return;

        const endpoint = role === 'teacher'
            ? `${API_URL}/teacher/students/${encodeURIComponent(state.studentId)}/reset-password?class_id=${encodeURIComponent(state.sourceClassId || '')}`
            : `${API_URL}/admin/users/${encodeURIComponent(state.studentId)}/reset-password`;

        const response = await fetch(endpoint, {
            method: 'POST',
            credentials: 'include'
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(payload.message || t('studentDetails.failedResetPassword', 'Failed to reset password'));
        }

        await showTempPassword(payload.tempPassword || '', studentName);
    }

    function downloadJsonReport() {
        const studentName = (document.getElementById('studentFullName')?.textContent || 'student')
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
            await showAlert(
                t('studentDetails.studentEmailEmpty', 'Student email is empty.'),
                t('common.info', 'Info')
            );
            return;
        }

        try {
            await navigator.clipboard.writeText(String(email));
            await showAlert(
                t('studentDetails.emailCopied', 'Email copied to clipboard.'),
                t('common.success', 'Success')
            );
        } catch (_) {
            await showAlert(`Email: ${email}`, t('studentDetails.copyFailed', 'Copy failed'));
        }
    }

    function bindEvents() {
        const backBtn = document.getElementById('backBtn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                history.back();
            });
        }

        document.querySelectorAll('.tab-btn').forEach((btn) => {
            btn.addEventListener('click', () => setTab(btn.dataset.tab));
        });

        const subjectSearch = document.getElementById('subjectSearch');
        if (subjectSearch) {
            subjectSearch.addEventListener('input', (event) => {
                state.subjectSearch = event.target.value || '';
                renderSubjects();
            });
        }

        const subjectSort = document.getElementById('subjectSort');
        if (subjectSort) {
            subjectSort.addEventListener('change', (event) => {
                state.subjectSort = event.target.value || 'avg_desc';
                renderSubjects();
            });
        }

        document.querySelectorAll('.segment-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                state.progressRange = btn.dataset.range || '30';
                document.querySelectorAll('.segment-btn').forEach((item) => {
                    item.classList.toggle('is-active', item === btn);
                });
                renderProgress();
            });
        });

        document.getElementById('exportJsonBtn')?.addEventListener('click', downloadJsonReport);
        document.getElementById('printBtn')?.addEventListener('click', () => window.print());
        document.getElementById('copyEmailBtn')?.addEventListener('click', () => {
            copyEmail().catch((error) => showAlert(error.message || t('studentDetails.failedCopyEmail', 'Failed to copy email'), t('common.error', 'Error')));
        });
        document.getElementById('resetPasswordBtn')?.addEventListener('click', () => {
            handleResetPassword().catch((error) => showAlert(error.message || t('studentDetails.failedResetPassword', 'Failed to reset password'), t('common.error', 'Error')));
        });

        window.addEventListener('zedly:lang-changed', () => {
            applyStaticI18n();
            if (state.report) renderAll();
        });
    }

    function setupRoleActions() {
        const btn = document.getElementById('resetPasswordBtn');
        if (!btn) return;

        if (!state.currentUser || !['school_admin', 'teacher'].includes(state.currentUser.role)) {
            btn.style.display = 'none';
            return;
        }

        if (state.currentUser.role === 'teacher') {
            const sourceClassId = state.sourceClassId ? String(state.sourceClassId) : '';
            const homeroomClassId = state.teacherHomeroomClassId ? String(state.teacherHomeroomClassId) : '';
            if (!sourceClassId || !homeroomClassId || sourceClassId !== homeroomClassId) {
                btn.style.display = 'none';
                return;
            }
        }
    }

    async function init() {
        try {
            applyStaticI18n();
            state.currentUser = await fetchCurrentUser();
            state.studentId = resolveStudentId(state.currentUser);
            state.sourceClassId = resolveSourceClassId();
            if (state.currentUser.role === 'teacher') {
                state.teacherHomeroomClassId = await fetchTeacherHomeroomClassId();
            }

            if (!state.studentId) {
                throw new Error(t('studentDetails.studentIdRequired', 'Student id is required in URL (?id=...) for this role'));
            }

            bindEvents();
            setupRoleActions();
            state.report = await fetchStudentReport();
            renderAll();
        } catch (error) {
            console.error('Student details init error:', error);
            if (error?.message === 'auth_required') {
                window.location.href = '/login';
                return;
            }
            setText('studentFullName', t('studentDetails.failedLoadProfile', 'Failed to load student profile'));
            setText('studentMeta', error.message || t('studentDetails.unknownError', 'Unknown error'));
            showAlert(error.message || t('studentDetails.failedOpenPage', 'Failed to open student page'), t('common.error', 'Error'));
        }
    }

    window.addEventListener('DOMContentLoaded', init);
})();
