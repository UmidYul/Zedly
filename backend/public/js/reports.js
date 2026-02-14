// Reports Center
(function () {
    'use strict';

    const API = '/api';
    const state = {
        role: '',
        period: 30,
        metric: 'avg_score',
        overview: null,
        comparison: null
    };

    function getToken() {
        return localStorage.getItem('access_token') || '';
    }

    function getUserRole() {
        try {
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            return user.role || '';
        } catch (error) {
            return '';
        }
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
                                    <td>${row.school_name || '-'}</td>
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
                                <td>${row.name || '-'}</td>
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
                            <strong>${item.title || item.type || 'Activity'}</strong>
                            <p>${item.subtitle || ''}</p>
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
                                <td>${row[keyName] || row.name_ru || row.subject || '-'}</td>
                                <td>${typeof row[keyValue] === 'number' ? fmtPct(row[keyValue]) : (row[keyValue] ?? '-')}</td>
                                <td>${buildRowDetails(row)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `);
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
                ${insights.map((text) => `<li>${text}</li>`).join('')}
            </ul>
        `);
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
            return;
        }

        const [overview, comparison] = await Promise.all([
            apiGet(`${API}/analytics/school/overview?period=${encodeURIComponent(period)}`),
            apiGet(`${API}/analytics/school/comparison?type=classes`)
        ]);
        state.overview = overview;
        state.comparison = comparison;
    }

    async function handleExport() {
        if (state.role === 'superadmin') {
            const rows = state.comparison?.schools || [];
            const header = ['name', 'value'];
            const csv = [header.join(',')].concat(rows.map((row) => {
                const name = `"${String(row.name || '').replace(/"/g, '""')}"`;
                const value = row.value ?? '';
                return `${name},${value}`;
            })).join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `superadmin_reports_${Date.now()}.csv`;
            a.click();
            URL.revokeObjectURL(url);
            return;
        }

        const response = await fetch(`${API}/analytics/export/school`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!response.ok) throw new Error('Export failed');
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `school_reports_${Date.now()}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
    }

    function bindEvents() {
        const period = document.getElementById('reportsPeriodFilter');
        const metric = document.getElementById('reportsMetricFilter');
        const refresh = document.getElementById('reportsRefreshBtn');
        const exportBtn = document.getElementById('reportsExportBtn');

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
        if (exportBtn) {
            exportBtn.addEventListener('click', async () => {
                try {
                    exportBtn.disabled = true;
                    exportBtn.textContent = 'Exporting...';
                    await handleExport();
                } catch (error) {
                    console.error('Export reports error:', error);
                    alert('Failed to export reports');
                } finally {
                    exportBtn.disabled = false;
                    exportBtn.textContent = 'Export';
                }
            });
        }
    }

    async function refreshView() {
        setHtml('reportsSummaryGrid', '<div class="report-kpi"><span>Loading...</span><strong>-</strong></div>');
        setHtml('reportsTopTable', '<p class="text-secondary">Loading...</p>');
        setHtml('reportsActivityList', '<p class="text-secondary">Loading...</p>');
        setHtml('reportsCompareTable', '<p class="text-secondary">Loading...</p>');
        setHtml('reportsInsights', '<p class="text-secondary">Loading...</p>');

        try {
            await loadData();
            renderSummary();
            renderTop();
            renderActivity();
            renderComparison();
            renderInsights();
        } catch (error) {
            console.error('Reports load error:', error);
            setHtml('reportsInsights', '<p class="text-secondary">Failed to load reports data.</p>');
        }
    }

    function init() {
        if (!document.getElementById('reportsSummaryGrid')) return;
        state.role = getUserRole();
        const metricWrap = document.getElementById('reportsMetricWrap');
        if (metricWrap) {
            metricWrap.style.display = state.role === 'superadmin' ? 'block' : 'none';
        }
        bindEvents();
        refreshView();
    }

    window.ReportsManager = { init };
})();
