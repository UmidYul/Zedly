// School Director Overview page
(function () {
    'use strict';

    const API_BASE = '/api/admin/director';
    const CHART_COLORS = ['#2563eb', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6'];

    const state = {
        chart: null,
        chartMode: 'classes',
        overview: null,
        performance: null,
        themeListenerBound: false
    };

    function getRoot() {
        return document.getElementById('schoolDirectorOverviewPage');
    }

    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function formatPercent(value, digits = 1) {
        const num = Number(value || 0);
        return `${num.toFixed(digits)}%`;
    }

    function formatDate(value) {
        if (!value) return '—';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '—';
        return date.toLocaleDateString('ru-RU');
    }

    function formatDateTime(value) {
        if (!value) return '—';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '—';
        return date.toLocaleString('ru-RU');
    }

    function getChartThemePalette() {
        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        return {
            schoolLine: isLight ? '#0f172a' : '#60a5fa',
            schoolFill: isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(96, 165, 250, 0.16)',
            text: isLight ? '#334155' : '#cbd5e1',
            grid: isLight ? 'rgba(15, 23, 42, 0.12)' : 'rgba(148, 163, 184, 0.18)'
        };
    }

    async function apiGet(path) {
        const response = await fetch(`${API_BASE}${path}`, {
            credentials: 'include'
        });
        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.message || 'Request failed');
        }
        return response.json();
    }

    async function apiDownload(path, fallbackName) {
        const response = await fetch(`${API_BASE}${path}`, {
            credentials: 'include'
        });
        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.message || 'Download failed');
        }

        const disposition = response.headers.get('content-disposition') || '';
        const matchedName = disposition.match(/filename="?([^\"]+)"?/i)?.[1];
        const filename = matchedName || fallbackName;

        const blob = await response.blob();
        const objectUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(objectUrl);
    }

    function ensureChartJs() {
        if (window.Chart) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const existing = document.querySelector('script[data-director-chart="1"]');
            if (existing) {
                existing.addEventListener('load', resolve, { once: true });
                existing.addEventListener('error', () => reject(new Error('Failed to load Chart.js')), { once: true });
                return;
            }
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
            script.dataset.directorChart = '1';
            script.onload = resolve;
            script.onerror = () => reject(new Error('Failed to load Chart.js'));
            document.head.appendChild(script);
        });
    }

    function getTrendArrow(trend) {
        if (trend === 'up') return '↑';
        if (trend === 'down') return '↓';
        return '→';
    }

    function renderLayout() {
        const root = getRoot();
        if (!root) return;

        root.innerHTML = `
            <div class="director-overview-page">
                <div class="page-header-section">
                    <h1 class="page-main-title">Обзор школы</h1>
                    <p class="page-subtitle">Главная панель директора школы</p>
                </div>

                <div class="stats-grid" id="directorMainKpis"></div>

                <section class="dashboard-section" id="directorAlertsSection" style="display:none;">
                    <div class="section-header">
                        <h2 class="section-title">Алерты — требуют внимания</h2>
                    </div>
                    <div class="director-alert-grid">
                        <div class="director-alert-card">
                            <h3>Классы ниже 50% (2 недели)</h3>
                            <div id="directorAlertLowClasses"></div>
                        </div>
                        <div class="director-alert-card">
                            <h3>Неактивные учителя (&gt;14 дней)</h3>
                            <div id="directorAlertInactiveTeachers"></div>
                        </div>
                        <div class="director-alert-card">
                            <h3>Ученики без активности</h3>
                            <div id="directorAlertInactiveStudents"></div>
                        </div>
                        <div class="director-alert-card positive">
                            <h3>Классы с улучшением &gt;10%</h3>
                            <div id="directorAlertImprovedClasses"></div>
                        </div>
                    </div>
                </section>

                <section class="dashboard-section">
                    <div class="section-header director-chart-header">
                        <h2 class="section-title">График успеваемости школы</h2>
                        <div class="director-switch" id="directorChartSwitch">
                            <button type="button" class="btn btn-outline active" data-mode="classes">По классам</button>
                            <button type="button" class="btn btn-outline" data-mode="subjects">По предметам</button>
                        </div>
                    </div>
                    <p class="director-chart-caption" id="directorMonthCompareCaption">—</p>
                    <div class="chart-container">
                        <canvas id="directorPerformanceChart"></canvas>
                    </div>
                </section>

                <section class="dashboard-section">
                    <div class="section-header">
                        <h2 class="section-title">Рейтинг классов</h2>
                    </div>
                    <div class="table-responsive">
                        <table class="data-table director-table" id="directorClassRankingTable">
                            <thead>
                                <tr>
                                    <th>Класс</th>
                                    <th>Средний балл</th>
                                    <th>Прогресс</th>
                                    <th>Тренд</th>
                                </tr>
                            </thead>
                            <tbody id="directorClassRankingBody"></tbody>
                        </table>
                    </div>
                </section>

                <section class="dashboard-section">
                    <div class="section-header">
                        <h2 class="section-title">Активность учителей</h2>
                    </div>
                    <div class="table-responsive">
                        <table class="data-table director-table" id="directorTeacherActivityTable">
                            <thead>
                                <tr>
                                    <th>Учитель</th>
                                    <th>Создал тестов за месяц</th>
                                    <th>Последняя активность</th>
                                </tr>
                            </thead>
                            <tbody id="directorTeacherActivityBody"></tbody>
                        </table>
                    </div>
                </section>

                <section class="dashboard-section">
                    <div class="section-header">
                        <h2 class="section-title">Слабые предметы по школе</h2>
                    </div>
                    <div class="table-responsive">
                        <table class="data-table director-table" id="directorWeakSubjectsTable">
                            <thead>
                                <tr>
                                    <th>Предмет</th>
                                    <th>Средний балл</th>
                                    <th>Попыток</th>
                                </tr>
                            </thead>
                            <tbody id="directorWeakSubjectsBody"></tbody>
                        </table>
                    </div>
                </section>

                <section class="dashboard-section director-risk-section">
                    <div class="section-header">
                        <h2 class="section-title">Ученики в зоне риска (закрытый блок директора)</h2>
                    </div>
                    <div class="table-responsive">
                        <table class="data-table director-table" id="directorRiskStudentsTable">
                            <thead>
                                <tr>
                                    <th>Ученик</th>
                                    <th>Класс</th>
                                    <th>Средний балл</th>
                                    <th>Дней без тестов</th>
                                </tr>
                            </thead>
                            <tbody id="directorRiskStudentsBody"></tbody>
                        </table>
                    </div>
                </section>

                <section class="dashboard-section">
                    <div class="section-header">
                        <h2 class="section-title">Активность сегодня</h2>
                    </div>
                    <div class="director-today-grid" id="directorTodayGrid"></div>
                </section>

                <section class="dashboard-section">
                    <div class="section-header">
                        <h2 class="section-title">Быстрые отчёты</h2>
                    </div>
                    <div class="director-report-actions">
                        <button class="btn btn-primary" id="directorMonthlyReportBtn" type="button">Отчёт за месяц (PDF)</button>
                        <button class="btn btn-outline" id="directorClassRankingReportBtn" type="button">Рейтинг классов (Excel)</button>
                    </div>
                    <p class="director-report-note">Отчёты формируются на бэкенде и скачиваются сразу.</p>
                </section>
            </div>
        `;
    }

    function renderMainNumbers() {
        const container = document.getElementById('directorMainKpis');
        if (!container || !state.overview) return;

        const m = state.overview.main_numbers || {};
        const delta = Number(m.avg_score_delta || 0);
        const deltaSign = delta > 0 ? '+' : '';
        const deltaArrow = delta > 0 ? '↑' : (delta < 0 ? '↓' : '→');

        container.innerHTML = `
            <div class="stat-card director-stat-card">
                <div class="stat-content">
                    <div class="stat-label">Общее количество учеников</div>
                    <div class="stat-value">${Number(m.total_students || 0)}</div>
                </div>
            </div>
            <div class="stat-card director-stat-card">
                <div class="stat-content">
                    <div class="stat-label">Общее количество учителей</div>
                    <div class="stat-value">${Number(m.total_teachers || 0)}</div>
                </div>
            </div>
            <div class="stat-card director-stat-card">
                <div class="stat-content">
                    <div class="stat-label">Тестов пройдено сегодня</div>
                    <div class="stat-value">${Number(m.tests_completed_today || 0)}</div>
                </div>
            </div>
            <div class="stat-card director-stat-card">
                <div class="stat-content">
                    <div class="stat-label">Средний балл по школе</div>
                    <div class="stat-value">${formatPercent(m.avg_score || 0)}</div>
                    <div class="director-delta ${delta > 0 ? 'up' : (delta < 0 ? 'down' : 'stable')}">${deltaArrow} ${deltaSign}${delta.toFixed(1)}% к прошлому месяцу</div>
                </div>
            </div>
        `;
    }

    function renderAlerts() {
        const section = document.getElementById('directorAlertsSection');
        if (!section || !state.overview) return;

        const alerts = state.overview.alerts || {};
        if (!alerts.show) {
            section.style.display = 'none';
            return;
        }

        section.style.display = '';

        const lowClasses = document.getElementById('directorAlertLowClasses');
        const inactiveTeachers = document.getElementById('directorAlertInactiveTeachers');
        const inactiveStudents = document.getElementById('directorAlertInactiveStudents');
        const improvedClasses = document.getElementById('directorAlertImprovedClasses');

        if (lowClasses) {
            const rows = Array.isArray(alerts.low_score_classes) ? alerts.low_score_classes : [];
            lowClasses.innerHTML = rows.length
                ? rows.map((item) => `<div class="director-alert-row">${escapeHtml(item.name)} — ${formatPercent(item.avg_score)}</div>`).join('')
                : '<div class="director-alert-empty">Нет проблемных классов</div>';
        }

        if (inactiveTeachers) {
            const rows = Array.isArray(alerts.inactive_teachers) ? alerts.inactive_teachers : [];
            inactiveTeachers.innerHTML = rows.length
                ? rows.map((item) => `<div class="director-alert-row">${escapeHtml(item.name)} — ${formatDate(item.last_assigned_at)}</div>`).join('')
                : '<div class="director-alert-empty">Нет неактивных учителей</div>';
        }

        if (inactiveStudents) {
            inactiveStudents.innerHTML = `
                <div class="director-alert-count">${Number(alerts.inactive_students_count || 0)}</div>
                <div class="director-alert-sub">учеников не проходили тесты более 7 дней</div>
            `;
        }

        if (improvedClasses) {
            const rows = Array.isArray(alerts.improved_classes) ? alerts.improved_classes : [];
            improvedClasses.innerHTML = rows.length
                ? rows.map((item) => `<div class="director-alert-row">${escapeHtml(item.name)} — +${Number(item.improvement || 0).toFixed(1)}%</div>`).join('')
                : '<div class="director-alert-empty">Нет классов с улучшением &gt;10%</div>';
        }
    }

    function renderClassRanking() {
        const tbody = document.getElementById('directorClassRankingBody');
        if (!tbody || !state.overview) return;

        const rows = Array.isArray(state.overview.class_ranking) ? state.overview.class_ranking : [];
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="4">Нет данных</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map((item) => {
            const score = Number(item.avg_score || 0);
            const trend = item.trend || 'stable';
            const trendArrow = getTrendArrow(trend);
            const trendDelta = Number(item.trend_delta || 0);
            const dangerClass = score < 50 ? 'is-danger' : '';
            return `
                <tr class="director-class-row ${dangerClass}" data-class-id="${escapeHtml(item.id)}">
                    <td data-label="Класс">${escapeHtml(item.name)}</td>
                    <td data-label="Средний балл">${formatPercent(score)}</td>
                    <td data-label="Прогресс" class="director-progress-cell">
                        <div class="director-progress-bar">
                            <div class="director-progress-fill ${dangerClass}" style="width:${Math.max(0, Math.min(100, score)).toFixed(1)}%"></div>
                        </div>
                    </td>
                    <td data-label="Тренд">${trendArrow} ${trendDelta > 0 ? '+' : ''}${trendDelta.toFixed(1)}%</td>
                </tr>
            `;
        }).join('');

        tbody.querySelectorAll('.director-class-row').forEach((row) => {
            row.addEventListener('click', () => {
                const classId = row.dataset.classId;
                if (!classId) return;
                window.location.href = `/class-details.html?id=${encodeURIComponent(classId)}`;
            });
        });
    }

    function renderTeacherActivity() {
        const tbody = document.getElementById('directorTeacherActivityBody');
        if (!tbody || !state.overview) return;

        const rows = Array.isArray(state.overview.teacher_activity) ? state.overview.teacher_activity : [];
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="3">Нет данных</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map((item) => {
            const inactiveClass = item.is_inactive_14_days ? 'is-warning' : '';
            return `
                <tr class="${inactiveClass}">
                    <td data-label="Учитель">${escapeHtml(item.name)}</td>
                    <td data-label="Тестов за месяц">${Number(item.tests_created_month || 0)}</td>
                    <td data-label="Последняя активность">${formatDateTime(item.last_activity_at)}</td>
                </tr>
            `;
        }).join('');
    }

    function renderWeakSubjects() {
        const tbody = document.getElementById('directorWeakSubjectsBody');
        if (!tbody || !state.overview) return;

        const rows = Array.isArray(state.overview.weak_subjects) ? state.overview.weak_subjects : [];
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="3">Нет данных</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map((item) => {
            const weakClass = Number(item.avg_score || 0) < 60 ? 'is-warning' : '';
            return `
                <tr class="${weakClass}">
                    <td data-label="Предмет">${escapeHtml(item.subject_name)}</td>
                    <td data-label="Средний балл">${formatPercent(item.avg_score)}</td>
                    <td data-label="Попыток">${Number(item.attempts || 0)}</td>
                </tr>
            `;
        }).join('');
    }

    function renderRiskStudents() {
        const tbody = document.getElementById('directorRiskStudentsBody');
        if (!tbody || !state.overview) return;

        const rows = Array.isArray(state.overview.risk_students) ? state.overview.risk_students : [];
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="4">Нет учеников в зоне риска</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map((item) => `
            <tr>
                <td data-label="Ученик">${escapeHtml(item.name)}</td>
                <td data-label="Класс">${escapeHtml(item.class_name)}</td>
                <td data-label="Средний балл">${formatPercent(item.avg_score)}</td>
                <td data-label="Дней без тестов">${item.inactive_days === null || item.inactive_days === undefined ? '—' : Number(item.inactive_days)}</td>
            </tr>
        `).join('');
    }

    function renderTodayActivity() {
        const container = document.getElementById('directorTodayGrid');
        if (!container || !state.overview) return;

        const today = state.overview.today_activity || {};
        container.innerHTML = `
            <div class="director-today-card">
                <div class="director-today-value">${Number(today.tests_completed_today || 0)}</div>
                <div class="director-today-label">Тестов пройдено сегодня</div>
            </div>
            <div class="director-today-card">
                <div class="director-today-value">${Number(today.tests_assigned_today || 0)}</div>
                <div class="director-today-label">Тестов назначено сегодня</div>
            </div>
            <div class="director-today-card">
                <div class="director-today-value">${Number(today.active_students_today || 0)} / ${Number(today.total_students || 0)}</div>
                <div class="director-today-label">Активные ученики сегодня</div>
                <div class="director-today-sub">${formatPercent(today.active_students_ratio || 0, 1)} от всех учеников</div>
            </div>
        `;
    }

    function renderMonthComparisonCaption() {
        const caption = document.getElementById('directorMonthCompareCaption');
        if (!caption || !state.performance) return;

        const cmp = state.performance.month_comparison || {};
        const delta = Number(cmp.delta || 0);
        const trend = delta > 0 ? 'рост' : (delta < 0 ? 'снижение' : 'без изменений');
        const sign = delta > 0 ? '+' : '';
        caption.textContent = `Текущий месяц: ${formatPercent(cmp.current_month_avg || 0)} · Предыдущий: ${formatPercent(cmp.previous_month_avg || 0)} · ${trend} (${sign}${delta.toFixed(1)}%)`;
    }

    async function renderPerformanceChart() {
        await ensureChartJs();
        const canvas = document.getElementById('directorPerformanceChart');
        if (!canvas || !state.performance) return;
        const palette = getChartThemePalette();

        if (state.chart) {
            state.chart.destroy();
            state.chart = null;
        }

        const labels = Array.isArray(state.performance.weekly_labels)
            ? state.performance.weekly_labels.map((item) => formatDate(item))
            : [];

        const datasets = [];

        const schoolSeries = Array.isArray(state.performance.school_series) ? state.performance.school_series : [];
        datasets.push({
            label: 'Школа (средний балл)',
            data: schoolSeries.map((item) => item.avg_score),
            borderColor: palette.schoolLine,
            backgroundColor: palette.schoolFill,
            borderWidth: 3,
            tension: 0.2
        });

        const dimensionSeries = Array.isArray(state.performance.dimension_series) ? state.performance.dimension_series : [];
        dimensionSeries.forEach((series, index) => {
            datasets.push({
                label: series.name,
                data: (series.points || []).map((point) => point.avg_score),
                borderColor: CHART_COLORS[(index + 1) % CHART_COLORS.length],
                backgroundColor: 'transparent',
                borderWidth: 2,
                tension: 0.2
            });
        });

        state.chart = new window.Chart(canvas, {
            type: 'line',
            data: {
                labels,
                datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                scales: {
                    x: {
                        ticks: {
                            color: palette.text
                        },
                        grid: {
                            color: palette.grid
                        }
                    },
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            color: palette.text
                        },
                        grid: {
                            color: palette.grid
                        }
                    }
                },
                plugins: {
                    legend: {
                        labels: {
                            color: palette.text
                        }
                    }
                }
            }
        });

        renderMonthComparisonCaption();
    }

    function bindEvents() {
        const switchRoot = document.getElementById('directorChartSwitch');
        if (switchRoot) {
            switchRoot.querySelectorAll('[data-mode]').forEach((button) => {
                button.addEventListener('click', async () => {
                    const mode = String(button.dataset.mode || 'classes');
                    if (mode === state.chartMode) return;

                    state.chartMode = mode;
                    switchRoot.querySelectorAll('[data-mode]').forEach((btn) => btn.classList.remove('active'));
                    button.classList.add('active');

                    try {
                        state.performance = await apiGet(`/performance-chart?mode=${encodeURIComponent(mode)}`);
                        await renderPerformanceChart();
                    } catch (error) {
                        console.error('Failed to load performance chart:', error);
                    }
                });
            });
        }

        const monthlyReportBtn = document.getElementById('directorMonthlyReportBtn');
        if (monthlyReportBtn) {
            monthlyReportBtn.addEventListener('click', async () => {
                try {
                    monthlyReportBtn.disabled = true;
                    await apiDownload('/reports/monthly.pdf', `director_monthly_report_${new Date().toISOString().slice(0, 10)}.pdf`);
                } catch (error) {
                    console.error('Monthly report download error:', error);
                } finally {
                    monthlyReportBtn.disabled = false;
                }
            });
        }

        const rankingReportBtn = document.getElementById('directorClassRankingReportBtn');
        if (rankingReportBtn) {
            rankingReportBtn.addEventListener('click', async () => {
                try {
                    rankingReportBtn.disabled = true;
                    await apiDownload('/reports/class-ranking.xlsx', `class_ranking_${new Date().toISOString().slice(0, 10)}.xlsx`);
                } catch (error) {
                    console.error('Class ranking report download error:', error);
                } finally {
                    rankingReportBtn.disabled = false;
                }
            });
        }
    }

    function renderAll() {
        renderMainNumbers();
        renderAlerts();
        renderClassRanking();
        renderTeacherActivity();
        renderWeakSubjects();
        renderRiskStudents();
        renderTodayActivity();
    }

    async function loadData() {
        const [overview, performance] = await Promise.all([
            apiGet('/overview'),
            apiGet(`/performance-chart?mode=${encodeURIComponent(state.chartMode)}`)
        ]);
        state.overview = overview;
        state.performance = performance;
    }

    async function init() {
        const root = getRoot();
        if (!root) return;

        renderLayout();
        bindEvents();
        if (!state.themeListenerBound) {
            document.addEventListener('themeChanged', () => {
                if (state.performance) {
                    renderPerformanceChart().catch((error) => {
                        console.error('Failed to re-render director chart on theme change:', error);
                    });
                }
            });
            state.themeListenerBound = true;
        }

        try {
            await loadData();
            renderAll();
            await renderPerformanceChart();
        } catch (error) {
            console.error('School director overview init error:', error);
            root.innerHTML = `
                <div class="dashboard-section">
                    <div class="section-header"><h2 class="section-title">Ошибка загрузки</h2></div>
                    <p style="color: var(--text-secondary);">Не удалось загрузить обзор директора. Попробуйте обновить страницу.</p>
                </div>
            `;
        }
    }

    window.SchoolDirectorOverview = {
        init
    };
})();
