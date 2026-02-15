// Reports Center
(function () {
    'use strict';

    const API = '/api';
    const PRESETS_KEY = 'zedly_reports_presets_v1';

    const state = {
        role: '',
        period: 30,
        metric: 'avg_score',
        overview: null,
        comparison: null,
        risk: null,
        riskStudents: [],
        riskPagination: { page: 1, limit: 20, total: 0, has_more: false },
        riskRequestController: null,
        notifications: [],
        notificationsPagination: { page: 1, limit: 20, total: 0, pages: 1 },
        notificationsFilters: {
            channel: '',
            eventKey: '',
            status: '',
            from: '',
            to: ''
        },
        chart: null
    };

    function getToken() {
        return localStorage.getItem('access_token') || '';
    }

    function getCurrentUser() {
        try {
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            return user && typeof user === 'object' ? user : {};
        } catch (error) {
            return {};
        }
    }

    function getUserRole() {
        return getCurrentUser().role || '';
    }

    function getPresetStorageKey() {
        const user = getCurrentUser();
        const userId = user.id || user.user_id || user.username || 'anon';
        return `${PRESETS_KEY}:${userId}`;
    }

    async function apiGet(url) {
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!response.ok) {
            throw new Error(`Request failed: ${response.status}`);
        }
        return response.json();
    }

    function fmtInt(value) {
        const n = Number(value);
        return Number.isFinite(n) ? n.toLocaleString('ru-RU') : '0';
    }

    function fmtPct(value) {
        const n = Number(value);
        return Number.isFinite(n) ? `${n.toFixed(1)}%` : '-';
    }

    function setHtml(id, html) {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
    }

    function buildKpiCard(label, value, tone = '') {
        return `
            <div class="report-kpi ${tone}">
                <span>${label}</span>
                <strong>${value}</strong>
            </div>
        `;
    }

    function loadPresets() {
        try {
            const raw = localStorage.getItem(getPresetStorageKey());
            const parsed = raw ? JSON.parse(raw) : {};
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (error) {
            return {};
        }
    }

    function savePresets(presets) {
        localStorage.setItem(getPresetStorageKey(), JSON.stringify(presets || {}));
    }

    function updatePresetSelect() {
        const select = document.getElementById('reportsPresetSelect');
        if (!select) return;
        const presets = loadPresets();
        const options = Object.keys(presets)
            .sort((a, b) => a.localeCompare(b))
            .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
            .join('');
        select.innerHTML = `<option value="">Default</option>${options}`;
    }

    function getCurrentFilters() {
        return {
            period: Number(state.period) || 30,
            metric: state.metric || 'avg_score'
        };
    }

    function getSelectedPresetKey() {
        return `${getPresetStorageKey()}:selected`;
    }

    function saveSelectedPreset(name) {
        localStorage.setItem(getSelectedPresetKey(), String(name || ''));
    }

    function applyFilters(filters) {
        state.period = Number(filters?.period) || 30;
        state.metric = filters?.metric || 'avg_score';
        const period = document.getElementById('reportsPeriodFilter');
        const metric = document.getElementById('reportsMetricFilter');
        if (period) period.value = String(state.period);
        if (metric) metric.value = state.metric;
    }

    function bindPresetEvents() {
        const presetSelect = document.getElementById('reportsPresetSelect');
        const saveBtn = document.getElementById('reportsSavePresetBtn');
        const deleteBtn = document.getElementById('reportsDeletePresetBtn');

        if (presetSelect) {
            presetSelect.addEventListener('change', () => {
                const name = presetSelect.value;
                if (!name) {
                    applyFilters({ period: 30, metric: 'avg_score' });
                    saveSelectedPreset('');
                    refreshView();
                    return;
                }
                const presets = loadPresets();
                if (presets[name]) {
                    applyFilters(presets[name]);
                    saveSelectedPreset(name);
                    refreshView();
                }
            });
        }

        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                const name = prompt('Preset name');
                if (!name) return;
                const trimmed = name.trim();
                if (!trimmed) return;
                const presets = loadPresets();
                presets[trimmed] = getCurrentFilters();
                savePresets(presets);
                updatePresetSelect();
                const select = document.getElementById('reportsPresetSelect');
                if (select) select.value = trimmed;
                saveSelectedPreset(trimmed);
            });
        }

        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                const select = document.getElementById('reportsPresetSelect');
                const name = select?.value || '';
                if (!name) return;
                const presets = loadPresets();
                delete presets[name];
                savePresets(presets);
                updatePresetSelect();
                if (select) select.value = '';
                saveSelectedPreset('');
            });
        }
    }

    function renderSummary() {
        const role = state.role;
        if (role === 'superadmin') {
            const s = state.overview?.stats || {};
            setHtml('reportsSummaryGrid', [
                buildKpiCard('Schools', fmtInt(s.schools), 'tone-blue'),
                buildKpiCard('Students', fmtInt(s.students), 'tone-green'),
                buildKpiCard('Teachers', fmtInt(s.teachers), 'tone-cyan'),
                buildKpiCard('Tests', fmtInt(s.tests), 'tone-orange'),
                buildKpiCard('Average Score', fmtPct(s.avg_score), 'tone-violet'),
                buildKpiCard('Career Tests', fmtInt(s.career_tests_completed), 'tone-rose')
            ].join(''));
            return;
        }

        const o = state.overview?.overview || {};
        setHtml('reportsSummaryGrid', [
            buildKpiCard('Students', fmtInt(o.total_students), 'tone-blue'),
            buildKpiCard('Teachers', fmtInt(o.total_teachers), 'tone-cyan'),
            buildKpiCard('Classes', fmtInt(o.total_classes), 'tone-green'),
            buildKpiCard('Subjects', fmtInt(o.total_subjects), 'tone-orange'),
            buildKpiCard('Tests', fmtInt(o.total_tests), 'tone-violet'),
            buildKpiCard('Average Score', fmtPct(o.average_score), 'tone-rose')
        ].join(''));
    }

    function renderTop() {
        if (state.role === 'superadmin') {
            const top = state.overview?.top_schools || [];
            if (!top.length) {
                setHtml('reportsTopTable', '<p class="text-secondary">No data</p>');
                return;
            }
            setHtml('reportsTopTable', `
                <div class="table-responsive">
                    <table class="data-table">
                        <thead><tr><th>School</th><th>Attempts</th><th>Avg Score</th></tr></thead>
                        <tbody>
                            ${top.map((row) => `
                                <tr>
                                    <td>${escapeHtml(row.school_name || '-')}</td>
                                    <td>${fmtInt(row.attempts)}</td>
                                    <td>${fmtPct(row.avg_score)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `);
            return;
        }

        const topClasses = state.overview?.top_classes || [];
        if (!topClasses.length) {
            setHtml('reportsTopTable', '<p class="text-secondary">No data</p>');
            return;
        }
        setHtml('reportsTopTable', `
            <div class="table-responsive">
                <table class="data-table">
                    <thead><tr><th>Class</th><th>Students</th><th>Attempts</th><th>Avg Score</th></tr></thead>
                    <tbody>
                        ${topClasses.map((row) => `
                            <tr>
                                <td>${escapeHtml(row.name || '-')}</td>
                                <td>${fmtInt(row.student_count)}</td>
                                <td>${fmtInt(row.total_attempts)}</td>
                                <td>${fmtPct(row.avg_score)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `);
    }

    function renderActivity() {
        const activity = state.overview?.recent_activity || [];
        if (!activity.length) {
            setHtml('reportsActivityList', '<p class="text-secondary">No recent activity</p>');
            return;
        }

        setHtml('reportsActivityList', `
            <div class="reports-activity-list">
                ${activity.slice(0, 12).map((item) => `
                    <div class="reports-activity-item">
                        <div>
                            <strong>${escapeHtml(item.title || item.type || 'Activity')}</strong>
                            <p>${escapeHtml(item.subtitle || '')}</p>
                        </div>
                        <span>${new Date(item.date).toLocaleDateString('ru-RU')}</span>
                    </div>
                `).join('')}
            </div>
        `);
    }

    function renderComparison() {
        const rows = state.role === 'superadmin'
            ? (state.comparison?.schools || [])
            : (state.comparison?.data || []);

        if (!rows.length) {
            setHtml('reportsCompareTable', '<p class="text-secondary">No comparison data</p>');
            return;
        }

        const first = rows[0] || {};
        const keyValue = Object.prototype.hasOwnProperty.call(first, 'value') ? 'value' : 'avg_score';
        const keyName = Object.prototype.hasOwnProperty.call(first, 'name') ? 'name' : (first.class_name ? 'class_name' : 'name');

        setHtml('reportsCompareTable', `
            <div class="table-responsive">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Main Metric</th>
                            <th>Details</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.slice(0, 50).map((row) => `
                            <tr>
                                <td>${escapeHtml(row[keyName] || row.name_ru || row.subject || '-')}</td>
                                <td>${typeof row[keyValue] === 'number' ? fmtPct(row[keyValue]) : escapeHtml(String(row[keyValue] ?? '-'))}</td>
                                <td>${escapeHtml(buildRowDetails(row))}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `);
    }

    function riskLevelLabel(level) {
        if (level === 'critical') return 'Critical';
        if (level === 'high') return 'High';
        if (level === 'medium') return 'Medium';
        return 'Safe';
    }

    function buildCompactPaginationHtml(currentPage, totalPages, onClickHandler) {
        const safeTotal = Math.max(1, Number(totalPages) || 1);
        const safeCurrent = Math.min(Math.max(1, Number(currentPage) || 1), safeTotal);
        const pagesToRender = [];
        const pushPage = (page) => {
            if (page >= 1 && page <= safeTotal && !pagesToRender.includes(page)) {
                pagesToRender.push(page);
            }
        };

        pushPage(1);
        for (let i = safeCurrent - 2; i <= safeCurrent + 2; i++) pushPage(i);
        pushPage(safeTotal);
        pagesToRender.sort((a, b) => a - b);

        let html = '';
        if (safeCurrent > 1) {
            html += `<button class="pagination-btn" type="button" data-risk-page="${safeCurrent - 1}" onclick="${onClickHandler}">Previous</button>`;
        }

        let prevPage = null;
        for (const page of pagesToRender) {
            if (prevPage !== null && page - prevPage > 1) {
                html += '<span class="pagination-ellipsis">...</span>';
            }
            if (page === safeCurrent) {
                html += `<button class="pagination-btn active" type="button">${page}</button>`;
            } else {
                html += `<button class="pagination-btn" type="button" data-risk-page="${page}" onclick="${onClickHandler}">${page}</button>`;
            }
            prevPage = page;
        }

        if (safeCurrent < safeTotal) {
            html += `<button class="pagination-btn" type="button" data-risk-page="${safeCurrent + 1}" onclick="${onClickHandler}">Next</button>`;
        }

        return html;
    }

    function isNotificationsDiagnosticsEnabled() {
        return state.role === 'superadmin' || state.role === 'school_admin';
    }

    function getNotificationsEndpoint() {
        if (state.role === 'superadmin') return `${API}/superadmin/notifications/logs`;
        if (state.role === 'school_admin') return `${API}/admin/notifications/logs`;
        return '';
    }

    function formatDateTimeLocalToIso(value) {
        if (!value) return '';
        const normalized = String(value).trim();
        if (!normalized) return '';
        const d = new Date(normalized);
        if (Number.isNaN(d.getTime())) return '';
        return d.toISOString();
    }

    function buildNotificationRecipientLabel(row) {
        if (row?.recipient) return String(row.recipient);
        if (row?.channel === 'email') return '-';
        return 'n/a';
    }

    function renderNotificationLogs() {
        const card = document.getElementById('reportsNotificationsCard');
        const tableEl = document.getElementById('reportsNotificationsTable');
        if (!card || !tableEl) return;

        if (!isNotificationsDiagnosticsEnabled()) {
            card.style.display = 'none';
            return;
        }

        card.style.display = '';
        const rows = Array.isArray(state.notifications) ? state.notifications : [];
        if (!rows.length) {
            tableEl.innerHTML = '<p class="text-secondary">No notification logs for selected filters.</p>';
            return;
        }

        const pagination = state.notificationsPagination || {};
        const totalPages = Math.max(1, Number(pagination.pages) || 1);
        const currentPage = Math.min(Math.max(1, Number(pagination.page) || 1), totalPages);
        const total = Number(pagination.total) || 0;

        tableEl.innerHTML = `
            <div class="table-responsive">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            ${state.role === 'superadmin' ? '<th>School</th>' : ''}
                            <th>User</th>
                            <th>Role</th>
                            <th>Channel</th>
                            <th>Event</th>
                            <th>Status</th>
                            <th>Recipient</th>
                            <th>Error</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map((row) => `
                            <tr>
                                <td>${row.created_at ? new Date(row.created_at).toLocaleString('ru-RU') : '-'}</td>
                                ${state.role === 'superadmin' ? `<td>${escapeHtml(row.school_name || '-')}</td>` : ''}
                                <td>${escapeHtml(`${row.first_name || ''} ${row.last_name || ''}`.trim() || row.username || '-')}</td>
                                <td>${escapeHtml(row.role || '-')}</td>
                                <td>${escapeHtml(row.channel || '-')}</td>
                                <td>${escapeHtml(row.event_key || '-')}</td>
                                <td>
                                    <span class="reports-notification-status ${(row.status || '').toLowerCase() === 'sent' ? 'sent' : 'failed'}">
                                        ${escapeHtml(row.status || '-')}
                                    </span>
                                </td>
                                <td>${escapeHtml(buildNotificationRecipientLabel(row))}</td>
                                <td>${escapeHtml(row.error_message || '-')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div class="reports-notification-footer">
                <span class="text-secondary">Page ${fmtInt(currentPage)} / ${fmtInt(totalPages)} · Total: ${fmtInt(total)}</span>
                <div class="pagination">
                    ${buildCompactPaginationHtml(currentPage, totalPages, 'window.ReportsManager.goToNotificationPageFromEvent(event)')}
                </div>
            </div>
        `;
    }

    function renderRiskDashboard() {
        const summaryEl = document.getElementById('reportsRiskSummary');
        const tableEl = document.getElementById('reportsRiskTable');
        if (!summaryEl || !tableEl) return;

        if (state.role === 'superadmin') {
            summaryEl.innerHTML = '<p class="text-secondary">Risk dashboard is available for school admin and teacher scopes.</p>';
            tableEl.innerHTML = '';
            return;
        }

        const summary = state.risk?.summary || {};
        const students = Array.isArray(state.riskStudents) ? state.riskStudents : [];
        const classes = Array.isArray(state.risk?.classes) ? state.risk.classes : [];

        summaryEl.innerHTML = `
            <div class="reports-risk-kpi-grid">
                ${buildKpiCard('Critical', fmtInt(summary.critical_count), 'tone-rose')}
                ${buildKpiCard('High', fmtInt(summary.high_count), 'tone-orange')}
                ${buildKpiCard('Medium', fmtInt(summary.medium_count), 'tone-violet')}
                ${buildKpiCard('No attempts', fmtInt(summary.no_data_count), 'tone-cyan')}
            </div>
            <div class="reports-risk-class-list">
                ${(classes || []).slice(0, 6).map((item) => `
                    <div class="reports-risk-class-item">
                        <strong>${escapeHtml(item.class_name || '-')}</strong>
                        <span>C: ${fmtInt(item.critical_count)} · H: ${fmtInt(item.high_count)} · M: ${fmtInt(item.medium_count)}</span>
                    </div>
                `).join('') || '<p class="text-secondary">No class-level risk data</p>'}
            </div>
        `;

        if (!students.length) {
            tableEl.innerHTML = '<p class="text-secondary">No students at risk for selected filters.</p>';
            return;
        }

        tableEl.innerHTML = `
            <div class="table-responsive">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Student</th>
                            <th>Class</th>
                            <th>Score</th>
                            <th>Attempts</th>
                            <th>Risk</th>
                            <th>Last attempt</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${students.map((row) => `
                            <tr>
                                <td>${escapeHtml(`${row.first_name || ''} ${row.last_name || ''}`.trim() || row.username || '-')}</td>
                                <td>${escapeHtml(row.class_name || '-')}</td>
                                <td>${fmtPct(row.avg_score)}</td>
                                <td>${fmtInt(row.attempts_completed)}</td>
                                <td><span class="reports-risk-badge ${escapeHtml(String(row.risk_level || 'safe'))}">${riskLevelLabel(row.risk_level)}</span></td>
                                <td>${row.last_attempt_at ? new Date(row.last_attempt_at).toLocaleDateString('ru-RU') : '-'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div style="margin-top:12px; display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;">
                <span class="text-secondary">Page ${fmtInt(state.riskPagination.page || 1)} / ${fmtInt(Math.max(1, Math.ceil((state.riskPagination.total || 0) / (state.riskPagination.limit || 20))))} · Total: ${fmtInt(state.riskPagination.total || 0)}</span>
                <div style="display:flex; align-items:center; gap:8px;">
                    <label for="reportsRiskLimitSelect" class="text-secondary">Per page</label>
                    <select id="reportsRiskLimitSelect" class="form-control" style="width:auto; min-width: 90px;">
                        <option value="20" ${(state.riskPagination.limit || 20) === 20 ? 'selected' : ''}>20</option>
                        <option value="50" ${(state.riskPagination.limit || 20) === 50 ? 'selected' : ''}>50</option>
                        <option value="100" ${(state.riskPagination.limit || 20) === 100 ? 'selected' : ''}>100</option>
                    </select>
                </div>
            </div>
            <div class="pagination">
                ${buildCompactPaginationHtml(
                    state.riskPagination.page || 1,
                    Math.max(1, Math.ceil((state.riskPagination.total || 0) / (state.riskPagination.limit || 20))),
                    'window.ReportsManager.goToRiskPageFromEvent(event)'
                )}
            </div>
        `;

        const limitSelect = document.getElementById('reportsRiskLimitSelect');
        if (limitSelect) {
            limitSelect.addEventListener('change', async (e) => {
                const nextLimit = Number.parseInt(String(e.target.value || '20'), 10);
                if (![20, 50, 100].includes(nextLimit)) return;
                try {
                    state.riskPagination.limit = nextLimit;
                    await loadRiskPage(1, false);
                    renderRiskDashboard();
                } catch (error) {
                    if (error.name === 'AbortError') return;
                    console.error('Risk limit change error:', error);
                }
            });
        }
    }

    function buildRowDetails(row) {
        const parts = [];
        if (row.attempts !== undefined) parts.push(`attempts: ${fmtInt(row.attempts)}`);
        if (row.total_attempts !== undefined) parts.push(`total: ${fmtInt(row.total_attempts)}`);
        if (row.student_count !== undefined) parts.push(`students: ${fmtInt(row.student_count)}`);
        if (row.attempt_count !== undefined) parts.push(`attempt_count: ${fmtInt(row.attempt_count)}`);
        if (row.test_count !== undefined) parts.push(`tests: ${fmtInt(row.test_count)}`);
        if (row.completed !== undefined) parts.push(`completed: ${fmtInt(row.completed)}`);
        return parts.length ? parts.join(' · ') : '-';
    }

    function renderInsights() {
        const insights = [];
        if (state.role === 'superadmin') {
            const summary = state.comparison?.summary || {};
            insights.push(`Top performer: ${summary.top_performer || 'N/A'}`);
            if (summary.average !== undefined) insights.push(`Network average: ${summary.average}`);
            if (summary.total_attempts !== undefined) insights.push(`Total attempts: ${fmtInt(summary.total_attempts)}`);
        } else {
            const subjects = state.overview?.subject_performance || [];
            if (subjects.length) {
                const best = subjects.reduce((a, b) => Number(a.avg_score || 0) > Number(b.avg_score || 0) ? a : b);
                const risk = subjects.reduce((a, b) => Number(a.avg_score || 0) < Number(b.avg_score || 0) ? a : b);
                const bestName = best.name_ru || best.name_uz || best.subject || 'N/A';
                const riskName = risk.name_ru || risk.name_uz || risk.subject || 'N/A';
                insights.push(`Best subject: ${bestName} (${fmtPct(best.avg_score)})`);
                insights.push(`At-risk subject: ${riskName} (${fmtPct(risk.avg_score)})`);
            }
            const activity = state.overview?.recent_activity || [];
            insights.push(`Recent activity points: ${fmtInt(activity.length)}`);
        }

        setHtml('reportsInsights', `
            <ul class="reports-insights-list">
                ${insights.map((text) => `<li>${escapeHtml(text)}</li>`).join('')}
            </ul>
        `);
    }

    function renderTrendsChart() {
        const canvas = document.getElementById('reportsTrendsChart');
        if (!canvas || !window.Chart) return;

        const { labels, attemptsSeries, scoreSeries } = buildTrendSeries();
        if (!labels.length) {
            const empty = document.getElementById('reportsTrendsEmpty');
            if (empty) empty.style.display = 'flex';
            if (state.chart) {
                state.chart.destroy();
                state.chart = null;
            }
            return;
        }
        const empty = document.getElementById('reportsTrendsEmpty');
        if (empty) empty.style.display = 'none';
        if (state.chart) {
            state.chart.destroy();
        }

        state.chart = new window.Chart(canvas, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Activity',
                        data: attemptsSeries,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59,130,246,0.15)',
                        tension: 0.3,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Average score',
                        data: scoreSeries,
                        borderColor: '#22c55e',
                        backgroundColor: 'rgba(34,197,94,0.15)',
                        tension: 0.3,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Activity' }
                    },
                    y1: {
                        beginAtZero: true,
                        suggestedMax: 100,
                        position: 'right',
                        grid: { drawOnChartArea: false },
                        title: { display: true, text: 'Score %' }
                    }
                }
            }
        });
    }

    function buildTrendSeries() {
        if (state.role === 'superadmin') {
            const activity = state.overview?.recent_activity || [];
            const map = new Map();
            activity.forEach((item) => {
                const key = formatDateOnly(item.date);
                const prev = map.get(key) || { count: 0, scoreSum: 0, scoreCount: 0 };
                prev.count += 1;
                if (Number.isFinite(Number(item.percentage))) {
                    prev.scoreSum += Number(item.percentage);
                    prev.scoreCount += 1;
                }
                map.set(key, prev);
            });
            const labels = Array.from(map.keys()).sort((a, b) => new Date(a) - new Date(b));
            const attemptsSeries = labels.map((label) => map.get(label).count);
            const scoreSeries = labels.map((label) => {
                const m = map.get(label);
                return m.scoreCount ? Number((m.scoreSum / m.scoreCount).toFixed(2)) : null;
            });
            return { labels, attemptsSeries, scoreSeries };
        }

        const rows = state.overview?.recent_activity || [];
        const sorted = [...rows]
            .map((row) => ({
                date: formatDateOnly(row.date),
                attempts: Number(row.attempts || 0),
                avg: Number(row.avg_score || 0)
            }))
            .sort((a, b) => new Date(a.date) - new Date(b.date));
        return {
            labels: sorted.map((row) => row.date),
            attemptsSeries: sorted.map((row) => row.attempts),
            scoreSeries: sorted.map((row) => Number.isFinite(row.avg) ? Number(row.avg.toFixed(2)) : null)
        };
    }

    function formatDateOnly(value) {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '-';
        return d.toISOString().slice(0, 10);
    }

    async function loadNotificationLogs(page = 1) {
        if (!isNotificationsDiagnosticsEnabled()) {
            state.notifications = [];
            state.notificationsPagination = { page: 1, limit: 20, total: 0, pages: 1 };
            return;
        }

        const endpoint = getNotificationsEndpoint();
        if (!endpoint) return;

        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('limit', String(state.notificationsPagination.limit || 20));
        if (state.notificationsFilters.channel) params.set('channel', state.notificationsFilters.channel);
        if (state.notificationsFilters.eventKey) params.set('event_key', state.notificationsFilters.eventKey);
        if (state.notificationsFilters.status) params.set('status', state.notificationsFilters.status);

        const fromIso = formatDateTimeLocalToIso(state.notificationsFilters.from);
        const toIso = formatDateTimeLocalToIso(state.notificationsFilters.to);
        if (fromIso) params.set('from', fromIso);
        if (toIso) params.set('to', toIso);

        const data = await apiGet(`${endpoint}?${params.toString()}`);
        state.notifications = Array.isArray(data.logs) ? data.logs : [];
        state.notificationsPagination = {
            page: data.pagination?.page || page,
            limit: data.pagination?.limit || (state.notificationsPagination.limit || 20),
            total: data.pagination?.total || 0,
            pages: data.pagination?.pages || 1
        };
    }

    async function loadData() {
        const period = Number(state.period);
        if (state.role === 'superadmin') {
            const periodMap = { 7: 'week', 30: 'month', 90: 'quarter', 365: 'year' };
            const periodKey = periodMap[period] || 'month';
            const [overview, comparison] = await Promise.all([
                apiGet(`${API}/superadmin/dashboard/overview`),
                apiGet(`${API}/superadmin/comparison?metric=${encodeURIComponent(state.metric)}&period=${encodeURIComponent(periodKey)}`)
            ]);
            state.overview = overview;
            state.comparison = comparison;
            state.risk = null;
            state.riskStudents = [];
            state.riskPagination = { page: 1, limit: 20, total: 0, has_more: false };
            await loadNotificationLogs(1);
            return;
        }

        const [overview, comparison] = await Promise.all([
            apiGet(`${API}/analytics/school/overview?period=${encodeURIComponent(period)}`),
            apiGet(`${API}/analytics/school/comparison?type=classes`)
        ]);
        state.overview = overview;
        state.comparison = comparison;
        await loadRiskPage(1, false);
        await loadNotificationLogs(1);
    }

    async function loadRiskPage(page = 1, append = false) {
        if (state.role === 'superadmin') {
            state.risk = null;
            state.riskStudents = [];
            state.riskPagination = { page: 1, limit: 20, total: 0, has_more: false };
            return;
        }

        if (state.riskRequestController) {
            state.riskRequestController.abort();
        }
        state.riskRequestController = new AbortController();

        const period = Number(state.period) || 30;
        const limit = state.riskPagination.limit || 20;
        try {
            const response = await fetch(`${API}/analytics/school/risk-dashboard?period=${encodeURIComponent(period)}&risk_threshold=60&min_attempts=1&page=${encodeURIComponent(page)}&limit=${encodeURIComponent(limit)}`, {
                headers: { Authorization: `Bearer ${getToken()}` },
                signal: state.riskRequestController.signal
            });
            if (!response.ok) {
                throw new Error(`Request failed: ${response.status}`);
            }
            const risk = await response.json();
            state.risk = risk;
            const incoming = Array.isArray(risk.students) ? risk.students : [];
            state.riskStudents = append ? state.riskStudents.concat(incoming) : incoming;
            state.riskPagination = {
                page: risk.pagination?.page || page,
                limit: risk.pagination?.limit || limit,
                total: risk.pagination?.total || 0,
                has_more: Boolean(risk.pagination?.has_more)
            };
        } finally {
            state.riskRequestController = null;
        }
    }

    async function handleDataExport() {
        if (state.role === 'superadmin') {
            const rows = state.comparison?.schools || [];
            const header = ['name', 'value'];
            const csv = [header.join(',')].concat(rows.map((row) => {
                const name = `"${String(row.name || '').replace(/"/g, '""')}"`;
                const value = row.value ?? '';
                return `${name},${value}`;
            })).join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            downloadBlob(blob, `superadmin_reports_${Date.now()}.csv`);
            return;
        }

        const response = await fetch(`${API}/analytics/export/school`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!response.ok) throw new Error('Export failed');
        const blob = await response.blob();
        downloadBlob(blob, `school_reports_${Date.now()}.xlsx`);
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    function handlePdfExport() {
        const root = document.querySelector('.reports-page');
        if (!root) return;

        const printWindow = window.open('', '_blank', 'width=1200,height=800');
        if (!printWindow) {
            alert('Popup blocked. Allow popups to export PDF.');
            return;
        }

        const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
            .map((link) => `<link rel="stylesheet" href="${link.href}">`)
            .join('');
        const clone = root.cloneNode(true);
        const sourceChartCanvas = document.getElementById('reportsTrendsChart');
        const targetChartCanvas = clone.querySelector('#reportsTrendsChart');
        if (sourceChartCanvas && targetChartCanvas) {
            try {
                const image = document.createElement('img');
                image.alt = 'Reports trends chart';
                image.src = sourceChartCanvas.toDataURL('image/png', 1.0);
                image.style.width = '100%';
                image.style.maxHeight = '360px';
                image.style.objectFit = 'contain';
                targetChartCanvas.replaceWith(image);
            } catch (error) {
                // Keep canvas fallback if toDataURL fails.
            }
        }

        printWindow.document.write(`
            <html>
            <head>
                <title>Reports PDF</title>
                ${styles}
                <style>
                    body { background: #fff !important; padding: 16px; }
                    .reports-page { width: 100% !important; max-width: 100% !important; }
                    .dashboard-section { break-inside: avoid; page-break-inside: avoid; }
                </style>
            </head>
            <body>${clone.outerHTML}</body>
            </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
        }, 350);
    }

    function bindEvents() {
        const period = document.getElementById('reportsPeriodFilter');
        const metric = document.getElementById('reportsMetricFilter');
        const refresh = document.getElementById('reportsRefreshBtn');
        const exportBtn = document.getElementById('reportsExportBtn');
        const pdfBtn = document.getElementById('reportsPdfBtn');
        const notificationsChannel = document.getElementById('reportsNotificationChannel');
        const notificationsEvent = document.getElementById('reportsNotificationEvent');
        const notificationsStatus = document.getElementById('reportsNotificationStatus');
        const notificationsFrom = document.getElementById('reportsNotificationFrom');
        const notificationsTo = document.getElementById('reportsNotificationTo');
        const notificationsLimit = document.getElementById('reportsNotificationLimit');

        if (period) {
            period.addEventListener('change', () => {
                state.period = Number(period.value || 30);
                refreshView();
            });
        }
        if (metric) {
            metric.addEventListener('change', () => {
                state.metric = metric.value || 'avg_score';
                refreshView();
            });
        }
        if (refresh) refresh.addEventListener('click', refreshView);
        if (pdfBtn) pdfBtn.addEventListener('click', handlePdfExport);
        if (exportBtn) {
            exportBtn.addEventListener('click', async () => {
                try {
                    exportBtn.disabled = true;
                    exportBtn.textContent = 'Exporting...';
                    await handleDataExport();
                } catch (error) {
                    console.error('Export reports error:', error);
                    alert('Failed to export reports');
                } finally {
                    exportBtn.disabled = false;
                    exportBtn.textContent = 'Export data';
                }
            });
        }

        const onNotificationsFilterChange = async () => {
            if (!isNotificationsDiagnosticsEnabled()) return;
            state.notificationsFilters.channel = notificationsChannel?.value || '';
            state.notificationsFilters.eventKey = notificationsEvent?.value || '';
            state.notificationsFilters.status = notificationsStatus?.value || '';
            state.notificationsFilters.from = notificationsFrom?.value || '';
            state.notificationsFilters.to = notificationsTo?.value || '';
            try {
                setHtml('reportsNotificationsTable', '<p class="text-secondary">Loading...</p>');
                await loadNotificationLogs(1);
                renderNotificationLogs();
            } catch (error) {
                console.error('Notification logs filter error:', error);
                setHtml('reportsNotificationsTable', '<p class="text-secondary">Failed to load notification logs.</p>');
            }
        };

        if (notificationsChannel) notificationsChannel.addEventListener('change', onNotificationsFilterChange);
        if (notificationsEvent) notificationsEvent.addEventListener('change', onNotificationsFilterChange);
        if (notificationsStatus) notificationsStatus.addEventListener('change', onNotificationsFilterChange);
        if (notificationsFrom) notificationsFrom.addEventListener('change', onNotificationsFilterChange);
        if (notificationsTo) notificationsTo.addEventListener('change', onNotificationsFilterChange);
        if (notificationsLimit) {
            notificationsLimit.addEventListener('change', async () => {
                const nextLimit = Number.parseInt(String(notificationsLimit.value || '20'), 10);
                if (![20, 50, 100].includes(nextLimit)) return;
                state.notificationsPagination.limit = nextLimit;
                await onNotificationsFilterChange();
            });
        }
    }

    async function refreshView() {
        setHtml('reportsSummaryGrid', '<div class="report-kpi"><span>Loading...</span><strong>-</strong></div>');
        setHtml('reportsTopTable', '<p class="text-secondary">Loading...</p>');
        setHtml('reportsActivityList', '<p class="text-secondary">Loading...</p>');
        setHtml('reportsCompareTable', '<p class="text-secondary">Loading...</p>');
        setHtml('reportsInsights', '<p class="text-secondary">Loading...</p>');
        setHtml('reportsRiskSummary', '<p class="text-secondary">Loading...</p>');
        setHtml('reportsRiskTable', '<p class="text-secondary">Loading...</p>');
        setHtml('reportsNotificationsTable', '<p class="text-secondary">Loading...</p>');
        const empty = document.getElementById('reportsTrendsEmpty');
        if (empty) empty.style.display = 'none';

        try {
            await loadData();
            renderSummary();
            renderTop();
            renderActivity();
            renderComparison();
            renderInsights();
            renderTrendsChart();
            renderRiskDashboard();
            renderNotificationLogs();
        } catch (error) {
            console.error('Reports load error:', error);
            setHtml('reportsInsights', '<p class="text-secondary">Failed to load reports data.</p>');
            setHtml('reportsRiskSummary', '<p class="text-secondary">Failed to load risk dashboard.</p>');
            setHtml('reportsRiskTable', '');
            setHtml('reportsNotificationsTable', '<p class="text-secondary">Failed to load notification logs.</p>');
        }
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function init() {
        if (!document.getElementById('reportsSummaryGrid')) return;
        state.role = getUserRole();
        const metricWrap = document.getElementById('reportsMetricWrap');
        const notificationsCard = document.getElementById('reportsNotificationsCard');
        const notificationsLimit = document.getElementById('reportsNotificationLimit');
        if (metricWrap) {
            metricWrap.style.display = state.role === 'superadmin' ? 'block' : 'none';
        }
        if (notificationsCard) {
            notificationsCard.style.display = isNotificationsDiagnosticsEnabled() ? '' : 'none';
        }
        if (notificationsLimit) {
            notificationsLimit.value = String(state.notificationsPagination.limit || 20);
        }
        updatePresetSelect();
        bindEvents();
        bindPresetEvents();
        const selectedPreset = localStorage.getItem(getSelectedPresetKey()) || '';
        const presets = loadPresets();
        if (selectedPreset && presets[selectedPreset]) {
            applyFilters(presets[selectedPreset]);
            const select = document.getElementById('reportsPresetSelect');
            if (select) select.value = selectedPreset;
        } else {
            applyFilters({ period: 30, metric: 'avg_score' });
            saveSelectedPreset('');
        }
        refreshView();
    }

    window.ReportsManager = {
        init,
        goToRiskPageFromEvent: async (event) => {
            const target = event?.currentTarget;
            const page = Number.parseInt(String(target?.dataset?.riskPage || ''), 10);
            if (!Number.isFinite(page) || page < 1) return;
            try {
                await loadRiskPage(page, false);
                renderRiskDashboard();
            } catch (error) {
                if (error.name === 'AbortError') return;
                console.error('Risk page switch error:', error);
            }
        },
        goToNotificationPageFromEvent: async (event) => {
            if (!isNotificationsDiagnosticsEnabled()) return;
            const target = event?.currentTarget;
            const page = Number.parseInt(String(target?.dataset?.riskPage || ''), 10);
            if (!Number.isFinite(page) || page < 1) return;
            try {
                await loadNotificationLogs(page);
                renderNotificationLogs();
            } catch (error) {
                console.error('Notification page switch error:', error);
                setHtml('reportsNotificationsTable', '<p class="text-secondary">Failed to load notification logs.</p>');
            }
        }
    };
})();
