// Teacher overview page
(function () {
    'use strict';

    const API_BASE = '/api/teacher/dashboard/teacher-overview';

    function getAuthHeaders() {
        const token = window.ZedlyAuth?.getAuthToken?.() || 'cookie-session';
        return {
            'Authorization': `Bearer ${token}`
        };
    }

    function getRoot() {
        return document.getElementById('teacherOverviewPage');
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function toNumber(value, fallback = 0) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function formatPercent(value, digits = 1) {
        return `${toNumber(value, 0).toFixed(digits)}%`;
    }

    function formatDate(value) {
        if (!value) return '—';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '—';
        return date.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    }

    function formatDateLong(value) {
        const date = value ? new Date(value) : new Date();
        if (Number.isNaN(date.getTime())) return '';
        const text = date.toLocaleDateString('ru-RU', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
        return text.charAt(0).toUpperCase() + text.slice(1);
    }

    function formatDateTime(value) {
        if (!value) return '—';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '—';
        return date.toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function formatDaysLeft(days) {
        const safe = Number(days);
        if (!Number.isFinite(safe)) return 'Без дедлайна';
        if (safe <= 0) return 'Сегодня';
        if (safe === 1) return '1 день';
        return `${safe} дн.`;
    }

    function greetingByHour(hour) {
        if (hour < 12) return 'Доброе утро';
        if (hour < 18) return 'Добрый день';
        return 'Добрый вечер';
    }

    function trendArrow(trend) {
        if (trend === 'up') return '↑';
        if (trend === 'down') return '↓';
        return '→';
    }

    async function apiGet(path = '') {
        const response = await fetch(`${API_BASE}${path}`, {
            method: 'GET',
            headers: getAuthHeaders()
        });
        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.message || 'Не удалось загрузить данные');
        }
        return response.json();
    }

    async function apiDownload(path, fallbackName) {
        const response = await fetch(`${API_BASE}${path}`, {
            method: 'GET',
            headers: getAuthHeaders()
        });
        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.message || 'Не удалось скачать отчёт');
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

    function groupEventsByDay(events) {
        const groups = [];
        const byKey = new Map();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        (Array.isArray(events) ? events : []).forEach((event) => {
            const eventDate = new Date(event.occurred_at);
            if (Number.isNaN(eventDate.getTime())) return;
            const day = new Date(eventDate);
            day.setHours(0, 0, 0, 0);
            const key = day.toISOString().slice(0, 10);

            let title = formatDate(day);
            if (day.getTime() === today.getTime()) title = 'Сегодня';
            else if (day.getTime() === yesterday.getTime()) title = 'Вчера';

            if (!byKey.has(key)) {
                const group = { key, title, items: [] };
                byKey.set(key, group);
                groups.push(group);
            }
            byKey.get(key).items.push(event);
        });

        return groups;
    }

    function navigateToDashboardPage(pageId) {
        const safePageId = String(pageId || '').trim();
        if (!safePageId) return;

        const navItem = document.querySelector(`.nav-item[data-page="${safePageId}"]`);
        if (navItem && typeof navItem.click === 'function') {
            navItem.click();
            return;
        }

        if (window.location.pathname === '/dashboard' || window.location.pathname === '/dashboard.html') {
            window.location.hash = safePageId;
            return;
        }

        window.location.href = `/dashboard#${encodeURIComponent(safePageId)}`;
    }

    window.TeacherOverviewPage = {
        state: {
            overview: null,
            performance: null,
            chart: null,
            loadingPerformance: false
        },

        init: async function () {
            const root = getRoot();
            if (!root) return;

            this.renderLayout();
            this.bindEvents();
            await this.loadAll();
        },

        renderLayout: function () {
            const root = getRoot();
            if (!root) return;

            root.innerHTML = `
                <div class="teacher-overview-page">
                    <section class="dashboard-section teacher-overview-welcome">
                        <h1 class="teacher-overview-greeting" id="teacherOverviewGreeting">Здравствуйте</h1>
                        <p class="teacher-overview-date" id="teacherOverviewDate">—</p>
                        <p class="teacher-overview-subtitle" id="teacherOverviewSubtitle">Загрузка данных...</p>
                    </section>

                    <section class="teacher-overview-top-grid">
                        <article class="dashboard-section teacher-overview-card">
                            <div class="section-header">
                                <h2 class="section-title">Мини-статистика</h2>
                            </div>
                            <div id="teacherOverviewMiniStats"></div>
                        </article>

                        <article class="dashboard-section teacher-overview-card">
                            <div class="section-header">
                                <h2 class="section-title">Быстрые действия</h2>
                            </div>
                            <div class="teacher-overview-actions">
                                <button type="button" class="btn btn-primary" id="teacherOverviewCreateTestBtn">Создать тест</button>
                                <button type="button" class="btn btn-secondary" id="teacherOverviewAssignTestBtn">Назначить тест</button>
                                <button type="button" class="btn btn-outline" id="teacherOverviewDownloadReportBtn">Скачать отчёт</button>
                            </div>
                        </article>
                    </section>

                    <section class="dashboard-section" id="teacherOverviewAlertsSection" style="display:none;">
                        <div class="section-header">
                            <h2 class="section-title">Требуют внимания</h2>
                        </div>
                        <div class="teacher-overview-alert-grid">
                            <div class="teacher-overview-alert-card">
                                <h3>Срочные тесты (&lt; 2 дней, &lt; 50%)</h3>
                                <div id="teacherOverviewAlertUrgentTests"></div>
                            </div>
                            <div class="teacher-overview-alert-card">
                                <h3>Классы ниже 50% (2 недели)</h3>
                                <div id="teacherOverviewAlertLowClasses"></div>
                            </div>
                            <div class="teacher-overview-alert-card">
                                <h3>Неактивные ученики (&gt; 5 дней)</h3>
                                <div id="teacherOverviewAlertInactiveStudents"></div>
                            </div>
                            <div class="teacher-overview-alert-card positive">
                                <h3>Классы с улучшением &gt; 10%</h3>
                                <div id="teacherOverviewAlertImprovedClasses"></div>
                            </div>
                        </div>
                    </section>

                    <section class="dashboard-section">
                        <div class="section-header">
                            <h2 class="section-title">Активные тесты</h2>
                        </div>
                        <div id="teacherOverviewActiveTests"></div>
                    </section>

                    <section class="dashboard-section">
                        <div class="section-header">
                            <h2 class="section-title">Рейтинг моих классов</h2>
                        </div>
                        <div id="teacherOverviewClassRanking"></div>
                    </section>

                    <section class="dashboard-section">
                        <div class="section-header">
                            <h2 class="section-title">Ученики в зоне риска</h2>
                        </div>
                        <div id="teacherOverviewRiskStudents"></div>
                    </section>

                    <section class="dashboard-section">
                        <div class="section-header teacher-overview-chart-header">
                            <h2 class="section-title">График успеваемости моих классов</h2>
                            <div class="teacher-overview-chart-controls">
                                <label for="teacherOverviewClassFilter">Класс:</label>
                                <select id="teacherOverviewClassFilter" class="teacher-overview-select">
                                    <option value="all">Все классы</option>
                                </select>
                            </div>
                        </div>
                        <div class="teacher-overview-chart-wrap">
                            <canvas id="teacherOverviewChart"></canvas>
                        </div>
                    </section>

                    <section class="dashboard-section">
                        <div class="section-header">
                            <h2 class="section-title">Последняя активность</h2>
                        </div>
                        <div id="teacherOverviewLastActivity"></div>
                    </section>
                </div>
            `;
        },

        bindEvents: function () {
            const root = getRoot();
            if (!root || root.dataset.bound === '1') return;
            root.dataset.bound = '1';

            const createBtn = document.getElementById('teacherOverviewCreateTestBtn');
            if (createBtn) {
                createBtn.addEventListener('click', () => {
                    navigateToDashboardPage('tests');
                });
            }

            const assignBtn = document.getElementById('teacherOverviewAssignTestBtn');
            if (assignBtn) {
                assignBtn.addEventListener('click', () => {
                    navigateToDashboardPage('assignments');
                });
            }

            const downloadBtn = document.getElementById('teacherOverviewDownloadReportBtn');
            if (downloadBtn) {
                downloadBtn.addEventListener('click', async () => {
                    try {
                        downloadBtn.disabled = true;
                        await apiDownload('/report.pdf', `teacher_classes_summary_${new Date().toISOString().slice(0, 10)}.pdf`);
                    } catch (error) {
                        console.error('Teacher overview report download error:', error);
                    } finally {
                        downloadBtn.disabled = false;
                    }
                });
            }

            const filter = document.getElementById('teacherOverviewClassFilter');
            if (filter) {
                filter.addEventListener('change', async () => {
                    const classId = String(filter.value || 'all');
                    await this.loadPerformance(classId);
                });
            }

            root.addEventListener('click', (event) => {
                const detailsBtn = event.target.closest('.js-teacher-overview-details');
                if (detailsBtn) {
                    const assignmentId = detailsBtn.dataset.assignmentId;
                    if (assignmentId) {
                        window.location.href = `/teacher-results.html?assignment_id=${encodeURIComponent(assignmentId)}`;
                    }
                    return;
                }

                const classRow = event.target.closest('.js-teacher-overview-class-row');
                if (classRow) {
                    const classId = classRow.dataset.classId;
                    if (classId) {
                        window.location.href = `/class-details.html?id=${encodeURIComponent(classId)}`;
                    }
                    return;
                }

                const createFirstBtn = event.target.closest('.js-teacher-overview-create-first-test');
                if (createFirstBtn) {
                    navigateToDashboardPage('tests');
                }
            });
        },

        loadAll: async function () {
            this.renderGreeting();
            this.renderLoading();

            try {
                this.state.overview = await apiGet('');
                this.renderOverview();
            } catch (error) {
                console.error('Teacher overview load error:', error);
                this.renderError(error.message || 'Не удалось загрузить обзор учителя.');
                return;
            }

            await this.loadPerformance('all');
        },

        loadPerformance: async function (classId) {
            this.state.loadingPerformance = true;
            try {
                const payload = await apiGet(`/performance?class_id=${encodeURIComponent(classId || 'all')}`);
                this.state.performance = payload;
                this.renderClassFilter();
                this.renderPerformanceChart();
            } catch (error) {
                console.error('Teacher performance load error:', error);
                const chartWrap = document.querySelector('.teacher-overview-chart-wrap');
                if (chartWrap) {
                    chartWrap.innerHTML = `
                        <canvas id="teacherOverviewChart" style="display:none;"></canvas>
                        <div class="teacher-overview-empty">Не удалось загрузить график успеваемости.</div>
                    `;
                }
            } finally {
                this.state.loadingPerformance = false;
            }
        },

        renderLoading: function () {
            const ids = [
                'teacherOverviewMiniStats',
                'teacherOverviewActiveTests',
                'teacherOverviewClassRanking',
                'teacherOverviewRiskStudents',
                'teacherOverviewLastActivity'
            ];

            ids.forEach((id) => {
                const node = document.getElementById(id);
                if (node) node.innerHTML = '<p class="text-secondary">Загрузка...</p>';
            });
        },

        renderError: function (message) {
            const ids = [
                'teacherOverviewMiniStats',
                'teacherOverviewActiveTests',
                'teacherOverviewClassRanking',
                'teacherOverviewRiskStudents',
                'teacherOverviewLastActivity'
            ];

            ids.forEach((id) => {
                const node = document.getElementById(id);
                if (node) node.innerHTML = `<div class="error-message"><p>${escapeHtml(message)}</p></div>`;
            });

            const subtitle = document.getElementById('teacherOverviewSubtitle');
            if (subtitle) subtitle.textContent = 'Не удалось загрузить данные обзора.';
        },

        renderOverview: function () {
            this.renderGreeting();
            this.renderMiniStats();
            this.renderAlerts();
            this.renderActiveTests();
            this.renderClassRanking();
            this.renderRiskStudents();
            this.renderLastActivity();
        },

        renderGreeting: function () {
            const greetingNode = document.getElementById('teacherOverviewGreeting');
            const dateNode = document.getElementById('teacherOverviewDate');
            const subtitleNode = document.getElementById('teacherOverviewSubtitle');

            const now = new Date();
            const rawName = String(document.getElementById('userName')?.textContent || '').trim();
            const firstName = rawName.split(/\s+/)[0] || 'учитель';

            if (greetingNode) {
                greetingNode.textContent = `${greetingByHour(now.getHours())}, ${firstName}`;
            }
            if (dateNode) {
                dateNode.textContent = formatDateLong(now);
            }

            const greetingMeta = this.state.overview?.greeting_meta || {};
            if (subtitleNode) {
                subtitleNode.textContent = `У вас ${toNumber(greetingMeta.classes_count, 0)} классов, ${toNumber(greetingMeta.tests_deadline_this_week, 0)} тестов с дедлайном на этой неделе`;
            }
        },

        renderMiniStats: function () {
            const container = document.getElementById('teacherOverviewMiniStats');
            if (!container) return;

            const stats = this.state.overview?.mini_stats || {};
            container.innerHTML = `
                <div class="teacher-overview-mini-grid">
                    <div class="teacher-overview-mini-card">
                        <div class="teacher-overview-mini-value">${toNumber(stats.classes_count, 0)}</div>
                        <div class="teacher-overview-mini-label">Мои классы</div>
                    </div>
                    <div class="teacher-overview-mini-card">
                        <div class="teacher-overview-mini-value">${toNumber(stats.active_tests_count, 0)}</div>
                        <div class="teacher-overview-mini-label">Активные тесты</div>
                    </div>
                    <div class="teacher-overview-mini-card">
                        <div class="teacher-overview-mini-value">${formatPercent(stats.avg_score_30d, 1)}</div>
                        <div class="teacher-overview-mini-label">Средний балл (30 дней)</div>
                    </div>
                    <div class="teacher-overview-mini-card">
                        <div class="teacher-overview-mini-value">${toNumber(stats.tests_created_total, 0)}</div>
                        <div class="teacher-overview-mini-label">Создано тестов</div>
                    </div>
                </div>
            `;
        },

        renderAlerts: function () {
            const section = document.getElementById('teacherOverviewAlertsSection');
            if (!section) return;

            const alerts = this.state.overview?.alerts || {};
            if (!alerts.show) {
                section.style.display = 'none';
                return;
            }

            section.style.display = '';

            const urgentWrap = document.getElementById('teacherOverviewAlertUrgentTests');
            const lowWrap = document.getElementById('teacherOverviewAlertLowClasses');
            const inactiveWrap = document.getElementById('teacherOverviewAlertInactiveStudents');
            const improvedWrap = document.getElementById('teacherOverviewAlertImprovedClasses');

            const urgentRows = Array.isArray(alerts.urgent_tests) ? alerts.urgent_tests : [];
            if (urgentWrap) {
                urgentWrap.innerHTML = urgentRows.length
                    ? urgentRows.map((item) => `
                        <div class="teacher-overview-alert-row">
                            <strong>${escapeHtml(item.test_title || 'Тест')}</strong>
                            <span>${escapeHtml(item.class_name || 'Класс')} · ${toNumber(item.completed_students, 0)}/${toNumber(item.total_students, 0)} · ${formatDaysLeft(item.days_left)}</span>
                        </div>
                    `).join('')
                    : '<div class="teacher-overview-empty">Нет срочных тестов</div>';
            }

            const lowRows = Array.isArray(alerts.low_score_classes) ? alerts.low_score_classes : [];
            if (lowWrap) {
                lowWrap.innerHTML = lowRows.length
                    ? lowRows.map((item) => `
                        <div class="teacher-overview-alert-row">
                            <strong>${escapeHtml(item.class_name || 'Класс')}</strong>
                            <span>${formatPercent(item.avg_score, 1)}</span>
                        </div>
                    `).join('')
                    : '<div class="teacher-overview-empty">Нет проблемных классов</div>';
            }

            if (inactiveWrap) {
                inactiveWrap.innerHTML = `
                    <div class="teacher-overview-alert-count">${toNumber(alerts.inactive_students_count, 0)}</div>
                    <div class="teacher-overview-alert-sub">учеников без активности более 5 дней</div>
                `;
            }

            const improvedRows = Array.isArray(alerts.improved_classes) ? alerts.improved_classes : [];
            if (improvedWrap) {
                improvedWrap.innerHTML = improvedRows.length
                    ? improvedRows.map((item) => `
                        <div class="teacher-overview-alert-row">
                            <strong>${escapeHtml(item.class_name || 'Класс')}</strong>
                            <span>+${toNumber(item.improvement, 0).toFixed(1)}%</span>
                        </div>
                    `).join('')
                    : '<div class="teacher-overview-empty">Нет улучшений &gt; 10%</div>';
            }
        },

        renderActiveTests: function () {
            const container = document.getElementById('teacherOverviewActiveTests');
            if (!container) return;

            const rows = Array.isArray(this.state.overview?.active_tests)
                ? this.state.overview.active_tests
                : [];

            if (!rows.length) {
                container.innerHTML = `
                    <div class="teacher-overview-empty-wrap">
                        <p class="text-secondary">У вас пока нет активных тестов.</p>
                        <button type="button" class="btn btn-primary js-teacher-overview-create-first-test">Создать первый тест</button>
                    </div>
                `;
                return;
            }

            const body = rows.map((item) => {
                const progressPercent = Math.max(0, Math.min(100, toNumber(item.completion_percent, 0)));
                const daysLeft = toNumber(item.days_left, 0);
                const daysClass = daysLeft < 2 ? 'is-danger' : '';
                return `
                    <tr>
                        <td>${escapeHtml(item.test_title || 'Тест')}</td>
                        <td>${escapeHtml(item.class_name || 'Класс')}</td>
                        <td>
                            <div class="teacher-overview-progress-meta">${toNumber(item.completed_students, 0)} из ${toNumber(item.total_students, 0)}</div>
                            <div class="teacher-overview-progress">
                                <span style="width:${progressPercent.toFixed(1)}%;"></span>
                            </div>
                        </td>
                        <td class="${daysClass}">${formatDaysLeft(daysLeft)}</td>
                        <td>${formatPercent(item.avg_score, 1)}</td>
                        <td>
                            <button type="button" class="btn btn-outline js-teacher-overview-details" data-assignment-id="${escapeHtml(item.assignment_id || '')}">Подробнее</button>
                        </td>
                    </tr>
                `;
            }).join('');

            container.innerHTML = `
                <div class="table-responsive">
                    <table class="data-table teacher-overview-table">
                        <thead>
                            <tr>
                                <th>Тест</th>
                                <th>Класс</th>
                                <th>Прогресс</th>
                                <th>До дедлайна</th>
                                <th>Ср. балл</th>
                                <th>Действия</th>
                            </tr>
                        </thead>
                        <tbody>${body}</tbody>
                    </table>
                </div>
            `;
        },

        renderClassRanking: function () {
            const container = document.getElementById('teacherOverviewClassRanking');
            if (!container) return;

            const rows = Array.isArray(this.state.overview?.class_ranking)
                ? this.state.overview.class_ranking
                : [];

            if (!rows.length) {
                container.innerHTML = '<div class="teacher-overview-empty">Нет данных по классам.</div>';
                return;
            }

            const body = rows.map((item) => {
                const score = Math.max(0, Math.min(100, toNumber(item.avg_score, 0)));
                const danger = score < 50 ? 'is-danger' : '';
                const delta = toNumber(item.trend_delta, 0);
                return `
                    <tr class="js-teacher-overview-class-row ${danger}" data-class-id="${escapeHtml(item.class_id || '')}">
                        <td>${escapeHtml(item.class_name || 'Класс')}</td>
                        <td>${formatPercent(score, 1)}</td>
                        <td>
                            <div class="teacher-overview-progress">
                                <span style="width:${score.toFixed(1)}%;"></span>
                            </div>
                        </td>
                        <td>${trendArrow(item.trend)} ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%</td>
                    </tr>
                `;
            }).join('');

            container.innerHTML = `
                <div class="table-responsive">
                    <table class="data-table teacher-overview-table teacher-overview-ranking-table">
                        <thead>
                            <tr>
                                <th>Класс</th>
                                <th>Средний балл</th>
                                <th>Прогресс</th>
                                <th>Тренд</th>
                            </tr>
                        </thead>
                        <tbody>${body}</tbody>
                    </table>
                </div>
            `;
        },

        renderRiskStudents: function () {
            const container = document.getElementById('teacherOverviewRiskStudents');
            if (!container) return;

            const rows = Array.isArray(this.state.overview?.risk_students)
                ? this.state.overview.risk_students
                : [];

            if (!rows.length) {
                container.innerHTML = '<div class="teacher-overview-empty">Нет учеников в зоне риска.</div>';
                return;
            }

            const body = rows.map((item) => `
                <tr>
                    <td>${escapeHtml(item.student_name || 'Ученик')}</td>
                    <td>${escapeHtml(item.class_name || '—')}</td>
                    <td>${formatPercent(item.avg_score, 1)}</td>
                    <td>${escapeHtml((Array.isArray(item.reasons) ? item.reasons : []).join('; ') || '—')}</td>
                    <td>${item.inactive_days === null || item.inactive_days === undefined ? '—' : `${toNumber(item.inactive_days, 0)} дн.`}</td>
                </tr>
            `).join('');

            container.innerHTML = `
                <div class="table-responsive">
                    <table class="data-table teacher-overview-table">
                        <thead>
                            <tr>
                                <th>Ученик</th>
                                <th>Класс</th>
                                <th>Средний балл</th>
                                <th>Причина</th>
                                <th>Неактивен</th>
                            </tr>
                        </thead>
                        <tbody>${body}</tbody>
                    </table>
                </div>
            `;
        },

        renderClassFilter: function () {
            const select = document.getElementById('teacherOverviewClassFilter');
            const payload = this.state.performance;
            if (!select || !payload) return;

            const options = Array.isArray(payload.class_options) ? payload.class_options : [];
            const selected = String(payload.selected_class_id || 'all');

            select.innerHTML = `
                <option value="all">Все классы</option>
                ${options.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('')}
            `;
            select.value = selected;
        },

        renderPerformanceChart: function () {
            const chartCanvas = document.getElementById('teacherOverviewChart');
            const payload = this.state.performance;
            if (!chartCanvas || !payload) return;

            chartCanvas.style.display = '';

            if (!window.Chart) {
                const chartWrap = document.querySelector('.teacher-overview-chart-wrap');
                if (chartWrap) {
                    chartWrap.innerHTML = `
                        <canvas id="teacherOverviewChart" style="display:none;"></canvas>
                        <div class="teacher-overview-empty">Chart.js не загружен.</div>
                    `;
                }
                return;
            }

            if (this.state.chart) {
                this.state.chart.destroy();
                this.state.chart = null;
            }

            const labels = (Array.isArray(payload.weekly_labels) ? payload.weekly_labels : [])
                .map((value) => {
                    const date = new Date(value);
                    if (Number.isNaN(date.getTime())) return '—';
                    return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
                });

            const series = Array.isArray(payload.class_series) ? payload.class_series : [];
            if (!series.length) {
                const chartWrap = document.querySelector('.teacher-overview-chart-wrap');
                if (chartWrap) {
                    chartWrap.innerHTML = `
                        <canvas id="teacherOverviewChart" style="display:none;"></canvas>
                        <div class="teacher-overview-empty">Нет данных для графика.</div>
                    `;
                }
                return;
            }

            const datasets = series.map((item) => ({
                label: item.class_name || 'Класс',
                data: (Array.isArray(item.points) ? item.points : []).map((point) => {
                    if (point?.avg_score === null || point?.avg_score === undefined) return null;
                    return toNumber(point.avg_score, 0);
                }),
                borderColor: item.color || '#2563eb',
                backgroundColor: 'transparent',
                borderWidth: 2,
                tension: 0.25,
                spanGaps: true
            }));

            this.state.chart = new window.Chart(chartCanvas, {
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
                        y: {
                            beginAtZero: true,
                            max: 100,
                            ticks: {
                                callback: (value) => `${value}%`
                            }
                        }
                    },
                    plugins: {
                        tooltip: {
                            callbacks: {
                                title: (context) => {
                                    const index = context[0]?.dataIndex ?? 0;
                                    const raw = (Array.isArray(payload.weekly_labels) ? payload.weekly_labels[index] : null);
                                    return formatDate(raw);
                                },
                                label: (context) => {
                                    const val = context.parsed?.y;
                                    if (val === null || val === undefined || Number.isNaN(val)) {
                                        return `${context.dataset.label}: нет данных`;
                                    }
                                    return `${context.dataset.label}: ${Number(val).toFixed(1)}%`;
                                }
                            }
                        }
                    }
                }
            });
        },

        renderLastActivity: function () {
            const container = document.getElementById('teacherOverviewLastActivity');
            if (!container) return;

            const events = Array.isArray(this.state.overview?.last_activity)
                ? this.state.overview.last_activity
                : [];

            if (!events.length) {
                container.innerHTML = '<div class="teacher-overview-empty">Событий пока нет.</div>';
                return;
            }

            const groups = groupEventsByDay(events);
            container.innerHTML = groups.map((group) => `
                <div class="teacher-overview-activity-group">
                    <h3>${escapeHtml(group.title)}</h3>
                    <div class="teacher-overview-activity-list">
                        ${group.items.map((item) => `
                            <div class="teacher-overview-activity-item">
                                <div class="teacher-overview-activity-main">${escapeHtml(item.text || 'Событие')}</div>
                                <div class="teacher-overview-activity-meta">
                                    <span>${formatDateTime(item.occurred_at)}</span>
                                    ${item.avg_score === null || item.avg_score === undefined
                                        ? ''
                                        : `<span class="teacher-overview-activity-score">${formatPercent(item.avg_score, 1)}</span>`}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `).join('');
        }
    };
})();
