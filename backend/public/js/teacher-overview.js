// Teacher overview page
(function () {
    'use strict';

    const API_BASE = '/api/teacher/dashboard/teacher-overview';

    function looksLikeMojibake(value) {
        if (typeof value !== 'string' || value.length < 4) return false;
        const chunks = value.match(/(?:Р.|С.)/g) || [];
        return chunks.length >= 3 && chunks.length / value.length > 0.2;
    }

    function t(key, fallback) {
        const translated = window.ZedlyI18n?.translate(key);
        if (!translated || translated === key || looksLikeMojibake(translated)) {
            return fallback || key;
        }
        return translated;
    }

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

    function getLocale() {
        const lang = window.ZedlyI18n?.getCurrentLang?.() || 'ru';
        if (lang === 'uz') return 'uz-UZ';
        return 'ru-RU';
    }

    function formatPercent(value, digits = 1) {
        return `${toNumber(value, 0).toFixed(digits)}%`;
    }

    function formatDate(value) {
        if (!value) return '—';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '—';
        return date.toLocaleDateString(getLocale(), {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    }

    function formatDateLong(value) {
        const date = value ? new Date(value) : new Date();
        if (Number.isNaN(date.getTime())) return '';
        const text = date.toLocaleDateString(getLocale(), {
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
        return date.toLocaleString(getLocale(), {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function formatDaysLeft(days) {
        const safe = Number(days);
        if (!Number.isFinite(safe)) return t('teacherOverview.deadlineNone', 'Без дедлайна');
        if (safe <= 0) return t('teacherOverview.deadlineToday', 'Сегодня');
        if (safe === 1) return t('teacherOverview.deadlineOneDay', '1 день');
        return t('teacherOverview.deadlineDays', '{days} дн.').replace('{days}', String(safe));
    }

    function greetingByHour(hour) {
        if (hour < 12) return t('teacherOverview.greetingMorning', 'Доброе утро');
        if (hour < 18) return t('teacherOverview.greetingDay', 'Добрый день');
        return t('teacherOverview.greetingEvening', 'Добрый вечер');
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
            throw new Error(payload.message || t('teacherOverview.failedLoad', 'Не удалось загрузить данные'));
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
            throw new Error(payload.message || t('teacherOverview.failedDownload', 'Не удалось скачать отчёт'));
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
            if (day.getTime() === today.getTime()) title = t('teacherOverview.today', 'Сегодня');
            else if (day.getTime() === yesterday.getTime()) title = t('teacherOverview.yesterday', 'Вчера');

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
                        <h1 class="teacher-overview-greeting" id="teacherOverviewGreeting">${t('teacherOverview.greetingHello', 'Здравствуйте')}</h1>
                        <p class="teacher-overview-date" id="teacherOverviewDate">—</p>
                        <p class="teacher-overview-subtitle" id="teacherOverviewSubtitle">${t('teacherOverview.loadingData', 'Загрузка данных...')}</p>
                    </section>

                    <section class="teacher-overview-top-grid">
                        <article class="dashboard-section teacher-overview-card">
                            <div class="section-header">
                                <h2 class="section-title">${t('teacherOverview.miniStats', 'Мини-статистика')}</h2>
                            </div>
                            <div id="teacherOverviewMiniStats"></div>
                        </article>

                        <article class="dashboard-section teacher-overview-card">
                            <div class="section-header">
                                <h2 class="section-title">${t('teacherOverview.quickActions', 'Быстрые действия')}</h2>
                            </div>
                            <div class="teacher-overview-actions">
                                <button type="button" class="btn btn-primary" id="teacherOverviewCreateTestBtn">${t('teacherOverview.createTest', 'Создать тест')}</button>
                                <button type="button" class="btn btn-secondary" id="teacherOverviewAssignTestBtn">${t('teacherOverview.assignTest', 'Назначить тест')}</button>
                                <button type="button" class="btn btn-outline" id="teacherOverviewDownloadReportBtn">${t('teacherOverview.downloadReport', 'Скачать отчёт')}</button>
                            </div>
                        </article>
                    </section>

                    <section class="dashboard-section" id="teacherOverviewAlertsSection" style="display:none;">
                        <div class="section-header">
                            <h2 class="section-title">${t('teacherOverview.attention', 'Требуют внимания')}</h2>
                        </div>
                        <div class="teacher-overview-alert-grid">
                            <div class="teacher-overview-alert-card">
                                <h3>${t('teacherOverview.urgentTests', 'Срочные тесты (&lt; 2 дней, &lt; 50%)')}</h3>
                                <div id="teacherOverviewAlertUrgentTests"></div>
                            </div>
                            <div class="teacher-overview-alert-card">
                                <h3>${t('teacherOverview.lowClasses', 'Классы ниже 50% (2 недели)')}</h3>
                                <div id="teacherOverviewAlertLowClasses"></div>
                            </div>
                            <div class="teacher-overview-alert-card">
                                <h3>${t('teacherOverview.inactiveStudents', 'Неактивные ученики (&gt; 5 дней)')}</h3>
                                <div id="teacherOverviewAlertInactiveStudents"></div>
                            </div>
                            <div class="teacher-overview-alert-card positive">
                                <h3>${t('teacherOverview.improvedClasses', 'Классы с улучшением &gt; 10%')}</h3>
                                <div id="teacherOverviewAlertImprovedClasses"></div>
                            </div>
                        </div>
                    </section>

                    <section class="dashboard-section">
                        <div class="section-header">
                            <h2 class="section-title">${t('teacherOverview.activeTests', 'Активные тесты')}</h2>
                        </div>
                        <div id="teacherOverviewActiveTests"></div>
                    </section>

                    <section class="dashboard-section">
                        <div class="section-header">
                            <h2 class="section-title">${t('teacherOverview.classRanking', 'Рейтинг моих классов')}</h2>
                        </div>
                        <div id="teacherOverviewClassRanking"></div>
                    </section>

                    <section class="dashboard-section">
                        <div class="section-header">
                            <h2 class="section-title">${t('teacherOverview.riskStudents', 'Ученики в зоне риска')}</h2>
                        </div>
                        <div id="teacherOverviewRiskStudents"></div>
                    </section>

                    <section class="dashboard-section">
                        <div class="section-header teacher-overview-chart-header">
                            <h2 class="section-title">${t('teacherOverview.performanceChart', 'График успеваемости моих классов')}</h2>
                            <div class="teacher-overview-chart-controls">
                                <label for="teacherOverviewClassFilter">${t('teacherOverview.classLabel', 'Класс:')}</label>
                                <select id="teacherOverviewClassFilter" class="teacher-overview-select">
                                    <option value="all">${t('teacherOverview.allClasses', 'Все классы')}</option>
                                </select>
                            </div>
                        </div>
                        <div class="teacher-overview-chart-wrap">
                            <canvas id="teacherOverviewChart"></canvas>
                        </div>
                    </section>

                    <section class="dashboard-section">
                        <div class="section-header">
                            <h2 class="section-title">${t('teacherOverview.lastActivity', 'Последняя активность')}</h2>
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

            if (!window.__zedlyTeacherOverviewLangBound) {
                window.__zedlyTeacherOverviewLangBound = true;
                window.addEventListener('zedly:lang-changed', () => {
                    if (!getRoot()) return;
                    if (this.state.chart) {
                        this.state.chart.destroy();
                        this.state.chart = null;
                    }
                    this.renderLayout();
                    this.renderOverview();
                    this.renderClassFilter();
                    this.renderPerformanceChart();
                });
            }

            root.addEventListener('change', async (event) => {
                const filter = event.target.closest('#teacherOverviewClassFilter');
                if (!filter) return;
                const classId = String(filter.value || 'all');
                await this.loadPerformance(classId);
            });

            root.addEventListener('click', async (event) => {
                const createBtn = event.target.closest('#teacherOverviewCreateTestBtn');
                if (createBtn) {
                    navigateToDashboardPage('tests');
                    return;
                }

                const assignBtn = event.target.closest('#teacherOverviewAssignTestBtn');
                if (assignBtn) {
                    navigateToDashboardPage('assignments');
                    return;
                }

                const downloadBtn = event.target.closest('#teacherOverviewDownloadReportBtn');
                if (downloadBtn) {
                    try {
                        downloadBtn.disabled = true;
                        await apiDownload('/report.pdf', `teacher_classes_summary_${new Date().toISOString().slice(0, 10)}.pdf`);
                    } catch (error) {
                        console.error('Teacher overview report download error:', error);
                    } finally {
                        downloadBtn.disabled = false;
                    }
                    return;
                }

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
                this.renderError(error.message || t('teacherOverview.failedLoadOverview', 'Не удалось загрузить обзор учителя.'));
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
                        <div class="teacher-overview-empty">${t('teacherOverview.failedLoadChart', 'Не удалось загрузить график успеваемости.')}</div>
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
                if (node) node.innerHTML = `<p class="text-secondary">${t('common.loading', 'Загрузка...')}</p>`;
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
            if (subtitle) subtitle.textContent = t('teacherOverview.failedLoadSubtitle', 'Не удалось загрузить данные обзора.');
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
            const firstName = rawName.split(/\s+/)[0] || t('teacherOverview.defaultTeacher', 'учитель');

            if (greetingNode) {
                greetingNode.textContent = `${greetingByHour(now.getHours())}, ${firstName}`;
            }
            if (dateNode) {
                dateNode.textContent = formatDateLong(now);
            }

            const greetingMeta = this.state.overview?.greeting_meta || {};
            if (subtitleNode) {
                subtitleNode.textContent = t(
                    'teacherOverview.greetingMeta',
                    'У вас {classes} классов, {tests} тестов с дедлайном на этой неделе'
                )
                    .replace('{classes}', String(toNumber(greetingMeta.classes_count, 0)))
                    .replace('{tests}', String(toNumber(greetingMeta.tests_deadline_this_week, 0)));
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
                        <div class="teacher-overview-mini-label">${t('teacherOverview.miniMyClasses', 'Мои классы')}</div>
                    </div>
                    <div class="teacher-overview-mini-card">
                        <div class="teacher-overview-mini-value">${toNumber(stats.active_tests_count, 0)}</div>
                        <div class="teacher-overview-mini-label">${t('teacherOverview.miniActiveTests', 'Активные тесты')}</div>
                    </div>
                    <div class="teacher-overview-mini-card">
                        <div class="teacher-overview-mini-value">${formatPercent(stats.avg_score_30d, 1)}</div>
                        <div class="teacher-overview-mini-label">${t('teacherOverview.miniAvgScore', 'Средний балл (30 дней)')}</div>
                    </div>
                    <div class="teacher-overview-mini-card">
                        <div class="teacher-overview-mini-value">${toNumber(stats.tests_created_total, 0)}</div>
                        <div class="teacher-overview-mini-label">${t('teacherOverview.miniTestsCreated', 'Создано тестов')}</div>
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
                            <strong>${escapeHtml(item.test_title || t('teacherOverview.test', 'Тест'))}</strong>
                            <span>${escapeHtml(item.class_name || t('teacherOverview.class', 'Класс'))} · ${toNumber(item.completed_students, 0)}/${toNumber(item.total_students, 0)} · ${formatDaysLeft(item.days_left)}</span>
                        </div>
                    `).join('')
                    : `<div class="teacher-overview-empty">${t('teacherOverview.noUrgentTests', 'Нет срочных тестов')}</div>`;
            }

            const lowRows = Array.isArray(alerts.low_score_classes) ? alerts.low_score_classes : [];
            if (lowWrap) {
                lowWrap.innerHTML = lowRows.length
                    ? lowRows.map((item) => `
                        <div class="teacher-overview-alert-row">
                            <strong>${escapeHtml(item.class_name || t('teacherOverview.class', 'Класс'))}</strong>
                            <span>${formatPercent(item.avg_score, 1)}</span>
                        </div>
                    `).join('')
                    : `<div class="teacher-overview-empty">${t('teacherOverview.noLowClasses', 'Нет проблемных классов')}</div>`;
            }

            if (inactiveWrap) {
                inactiveWrap.innerHTML = `
                    <div class="teacher-overview-alert-count">${toNumber(alerts.inactive_students_count, 0)}</div>
                    <div class="teacher-overview-alert-sub">${t('teacherOverview.inactiveStudentsSub', 'учеников без активности более 5 дней')}</div>
                `;
            }

            const improvedRows = Array.isArray(alerts.improved_classes) ? alerts.improved_classes : [];
            if (improvedWrap) {
                improvedWrap.innerHTML = improvedRows.length
                    ? improvedRows.map((item) => `
                        <div class="teacher-overview-alert-row">
                            <strong>${escapeHtml(item.class_name || t('teacherOverview.class', 'Класс'))}</strong>
                            <span>+${toNumber(item.improvement, 0).toFixed(1)}%</span>
                        </div>
                    `).join('')
                    : `<div class="teacher-overview-empty">${t('teacherOverview.noImprovements', 'Нет улучшений &gt; 10%')}</div>`;
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
                        <p class="text-secondary">${t('teacherOverview.noActiveTests', 'У вас пока нет активных тестов.')}</p>
                        <button type="button" class="btn btn-primary js-teacher-overview-create-first-test">${t('teacherOverview.createFirstTest', 'Создать первый тест')}</button>
                    </div>
                `;
                return;
            }

            const colTest = t('teacherOverview.colTest', 'Тест');
            const colClass = t('teacherOverview.colClass', 'Класс');
            const colProgress = t('teacherOverview.colProgress', 'Прогресс');
            const colDeadline = t('teacherOverview.colDeadline', 'До дедлайна');
            const colAvgScore = t('teacherOverview.colAvgScore', 'Ср. балл');
            const colActions = t('teacherOverview.colActions', 'Действия');

            const body = rows.map((item) => {
                const progressPercent = Math.max(0, Math.min(100, toNumber(item.completion_percent, 0)));
                const daysLeft = toNumber(item.days_left, 0);
                const daysClass = daysLeft < 2 ? 'is-danger' : '';
                const progressMeta = t('teacherOverview.outOf', '{done} из {total}')
                    .replace('{done}', String(toNumber(item.completed_students, 0)))
                    .replace('{total}', String(toNumber(item.total_students, 0)));
                return `
                    <tr>
                        <td data-label="${escapeHtml(colTest)}">${escapeHtml(item.test_title || colTest)}</td>
                        <td data-label="${escapeHtml(colClass)}">${escapeHtml(item.class_name || colClass)}</td>
                        <td data-label="${escapeHtml(colProgress)}">
                            <div class="teacher-overview-progress-meta">${escapeHtml(progressMeta)}</div>
                            <div class="teacher-overview-progress">
                                <span style="width:${progressPercent.toFixed(1)}%;"></span>
                            </div>
                        </td>
                        <td data-label="${escapeHtml(colDeadline)}" class="${daysClass}">${formatDaysLeft(daysLeft)}</td>
                        <td data-label="${escapeHtml(colAvgScore)}">${formatPercent(item.avg_score, 1)}</td>
                        <td data-label="${escapeHtml(colActions)}">
                            <button type="button" class="btn btn-outline js-teacher-overview-details" data-assignment-id="${escapeHtml(item.assignment_id || '')}">${t('teacherOverview.details', 'Подробнее')}</button>
                        </td>
                    </tr>
                `;
            }).join('');

            container.innerHTML = `
                <div class="table-responsive mobile-stack-table">
                    <table class="data-table teacher-overview-table">
                        <thead>
                            <tr>
                                <th>${colTest}</th>
                                <th>${colClass}</th>
                                <th>${colProgress}</th>
                                <th>${colDeadline}</th>
                                <th>${colAvgScore}</th>
                                <th>${colActions}</th>
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
                container.innerHTML = `<div class="teacher-overview-empty">${t('teacherOverview.noClassData', 'Нет данных по классам.')}</div>`;
                return;
            }

            const colClass = t('teacherOverview.colClass', 'Класс');
            const colAvgScore = t('teacherOverview.colAvgScoreFull', 'Средний балл');
            const colProgress = t('teacherOverview.colProgress', 'Прогресс');
            const colTrend = t('teacherOverview.colTrend', 'Тренд');

            const body = rows.map((item) => {
                const score = Math.max(0, Math.min(100, toNumber(item.avg_score, 0)));
                const danger = score < 50 ? 'is-danger' : '';
                const delta = toNumber(item.trend_delta, 0);
                return `
                    <tr class="js-teacher-overview-class-row ${danger}" data-class-id="${escapeHtml(item.class_id || '')}">
                        <td data-label="${escapeHtml(colClass)}">${escapeHtml(item.class_name || colClass)}</td>
                        <td data-label="${escapeHtml(colAvgScore)}">${formatPercent(score, 1)}</td>
                        <td data-label="${escapeHtml(colProgress)}">
                            <div class="teacher-overview-progress">
                                <span style="width:${score.toFixed(1)}%;"></span>
                            </div>
                        </td>
                        <td data-label="${escapeHtml(colTrend)}">${trendArrow(item.trend)} ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%</td>
                    </tr>
                `;
            }).join('');

            container.innerHTML = `
                <div class="table-responsive mobile-stack-table">
                    <table class="data-table teacher-overview-table teacher-overview-ranking-table">
                        <thead>
                            <tr>
                                <th>${colClass}</th>
                                <th>${colAvgScore}</th>
                                <th>${colProgress}</th>
                                <th>${colTrend}</th>
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
                container.innerHTML = `<div class="teacher-overview-empty">${t('teacherOverview.noRiskStudents', 'Нет учеников в зоне риска.')}</div>`;
                return;
            }

            const colStudent = t('teacherOverview.colStudent', 'Ученик');
            const colClass = t('teacherOverview.colClass', 'Класс');
            const colAvgScore = t('teacherOverview.colAvgScoreFull', 'Средний балл');
            const colReason = t('teacherOverview.colReason', 'Причина');
            const colInactive = t('teacherOverview.colInactive', 'Неактивен');

            const body = rows.map((item) => `
                <tr>
                    <td data-label="${escapeHtml(colStudent)}">${escapeHtml(item.student_name || colStudent)}</td>
                    <td data-label="${escapeHtml(colClass)}">${escapeHtml(item.class_name || '—')}</td>
                    <td data-label="${escapeHtml(colAvgScore)}">${formatPercent(item.avg_score, 1)}</td>
                    <td data-label="${escapeHtml(colReason)}">${escapeHtml((Array.isArray(item.reasons) ? item.reasons : []).join('; ') || '—')}</td>
                    <td data-label="${escapeHtml(colInactive)}">${item.inactive_days === null || item.inactive_days === undefined ? '—' : `${toNumber(item.inactive_days, 0)} ${t('teacherOverview.daysShort', 'дн.')}`}</td>
                </tr>
            `).join('');

            container.innerHTML = `
                <div class="table-responsive mobile-stack-table">
                    <table class="data-table teacher-overview-table">
                        <thead>
                            <tr>
                                <th>${colStudent}</th>
                                <th>${colClass}</th>
                                <th>${colAvgScore}</th>
                                <th>${colReason}</th>
                                <th>${colInactive}</th>
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
                <option value="all">${t('teacherOverview.allClasses', 'Все классы')}</option>
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
                        <div class="teacher-overview-empty">${t('teacherOverview.chartNotLoaded', 'Chart.js не загружен.')}</div>
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
                    return date.toLocaleDateString(getLocale(), { day: '2-digit', month: '2-digit' });
                });

            const series = Array.isArray(payload.class_series) ? payload.class_series : [];
            if (!series.length) {
                const chartWrap = document.querySelector('.teacher-overview-chart-wrap');
                if (chartWrap) {
                    chartWrap.innerHTML = `
                        <canvas id="teacherOverviewChart" style="display:none;"></canvas>
                        <div class="teacher-overview-empty">${t('teacherOverview.chartNoData', 'Нет данных для графика.')}</div>
                    `;
                }
                return;
            }

            const datasets = series.map((item) => ({
                label: item.class_name || t('teacherOverview.class', 'Класс'),
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
                                        return `${context.dataset.label}: ${t('teacherOverview.noData', 'нет данных')}`;
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
                container.innerHTML = `<div class="teacher-overview-empty">${t('teacherOverview.noEvents', 'Событий пока нет.')}</div>`;
                return;
            }

            const groups = groupEventsByDay(events);
            container.innerHTML = groups.map((group) => `
                <div class="teacher-overview-activity-group">
                    <h3>${escapeHtml(group.title)}</h3>
                    <div class="teacher-overview-activity-list">
                        ${group.items.map((item) => `
                            <div class="teacher-overview-activity-item">
                                <div class="teacher-overview-activity-main">${escapeHtml(item.text || t('teacherOverview.event', 'Событие'))}</div>
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
