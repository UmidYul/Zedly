// Student Progress Page
(function () {
    'use strict';

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

    function toNumber(value, defaultValue = 0) {
        const num = Number(value);
        return Number.isFinite(num) ? num : defaultValue;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatPercent(value) {
        return `${(Math.round(toNumber(value, 0) * 10) / 10).toFixed(1)}%`;
    }

    function formatDate(value) {
        if (!value) return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '-';
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}.${month}.${year}`;
    }

    function formatDateUtc(value) {
        if (!value) return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '-';
        const day = String(date.getUTCDate()).padStart(2, '0');
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const year = date.getUTCFullYear();
        return `${day}.${month}.${year}`;
    }

    function formatDurationCompact(totalSeconds) {
        const safeSeconds = Math.max(0, Math.floor(toNumber(totalSeconds, 0)));
        const hours = Math.floor(safeSeconds / 3600);
        const minutes = Math.floor((safeSeconds % 3600) / 60);

        if (hours > 0) {
            return `${hours}ч ${minutes}мин`;
        }

        if (minutes > 0) {
            return `${minutes}мин`;
        }

        return 'меньше 1 мин';
    }

    function formatDurationRow(totalSeconds) {
        const safeSeconds = Math.max(0, Math.floor(toNumber(totalSeconds, 0)));
        const hours = Math.floor(safeSeconds / 3600);
        const minutes = Math.floor((safeSeconds % 3600) / 60);
        const seconds = safeSeconds % 60;

        if (hours > 0) {
            return `${hours}ч ${minutes}м`;
        }
        if (minutes > 0) {
            return `${minutes}м ${seconds}с`;
        }
        return `${seconds}с`;
    }

    function getPerformanceTone(score) {
        const safeScore = toNumber(score, 0);
        if (safeScore < 50) {
            return {
                color: '#ef4444',
                badgeClass: 'progress-score-badge is-low'
            };
        }
        if (safeScore <= 75) {
            return {
                color: '#f59e0b',
                badgeClass: 'progress-score-badge is-mid'
            };
        }
        return {
            color: '#22c55e',
            badgeClass: 'progress-score-badge is-high'
        };
    }

    function getDurationFromResult(result) {
        const directSeconds = toNumber(result?.time_spent_seconds, -1);
        if (directSeconds >= 0) return directSeconds;

        const startedAt = result?.started_at ? new Date(result.started_at) : null;
        const submittedAt = result?.submitted_at ? new Date(result.submitted_at) : null;
        if (!startedAt || !submittedAt) return 0;
        const diff = Math.floor((submittedAt.getTime() - startedAt.getTime()) / 1000);
        return diff > 0 ? diff : 0;
    }

    function createReactRoot(container) {
        if (!container || !window.ReactDOM) {
            return null;
        }

        if (typeof window.ReactDOM.createRoot === 'function') {
            const root = window.ReactDOM.createRoot(container);
            return {
                render: (element) => root.render(element),
                unmount: () => root.unmount()
            };
        }

        return {
            render: (element) => window.ReactDOM.render(element, container),
            unmount: () => window.ReactDOM.unmountComponentAtNode(container)
        };
    }

    window.StudentProgress = {
        state: {
            overview: null,
            results: [],
            chartRange: '30',
            chartSubject: 'all',
            historySubject: 'all',
            historyVisibleCount: 10,
            expandedSubjects: new Set(),
            trendRoot: null,
            progressBarRoots: []
        },

        init: async function () {
            this.teardownReactRoots();
            this.state = {
                overview: null,
                results: [],
                chartRange: '30',
                chartSubject: 'all',
                historySubject: 'all',
                historyVisibleCount: 10,
                expandedSubjects: new Set(),
                trendRoot: null,
                progressBarRoots: []
            };

            this.bindEvents();
            await this.loadAll();
        },

        bindEvents: function () {
            const refresh = document.getElementById('studentProgressRefresh');
            if (refresh) {
                refresh.addEventListener('click', () => this.loadAll());
            }

            const rangeToggle = document.getElementById('studentProgressRangeToggle');
            if (rangeToggle) {
                rangeToggle.addEventListener('click', async (event) => {
                    const button = event.target.closest('.progress-range-btn');
                    if (!button) return;

                    const range = button.dataset.range || '30';
                    if (this.state.chartRange === range) return;

                    this.state.chartRange = range;
                    this.updateRangeButtons();
                    await this.reloadOverview();
                });
            }

            const chartSubjectFilter = document.getElementById('studentProgressChartSubjectFilter');
            if (chartSubjectFilter) {
                chartSubjectFilter.addEventListener('change', async (event) => {
                    this.state.chartSubject = event.target.value || 'all';
                    await this.reloadOverview();
                });
            }

            const historySubjectFilter = document.getElementById('studentProgressHistorySubjectFilter');
            if (historySubjectFilter) {
                historySubjectFilter.addEventListener('change', (event) => {
                    this.state.historySubject = event.target.value || 'all';
                    this.state.historyVisibleCount = 10;
                    this.renderHistory();
                });
            }

            const knowledge = document.getElementById('studentProgressKnowledge');
            if (knowledge) {
                knowledge.addEventListener('click', (event) => {
                    const toggle = event.target.closest('.js-knowledge-toggle');
                    if (!toggle) return;

                    const subjectId = String(toggle.dataset.subjectId || '');
                    if (!subjectId) return;

                    if (this.state.expandedSubjects.has(subjectId)) {
                        this.state.expandedSubjects.delete(subjectId);
                    } else {
                        this.state.expandedSubjects.add(subjectId);
                    }

                    this.renderKnowledge();
                });
            }

            const history = document.getElementById('studentProgressHistory');
            if (history) {
                history.addEventListener('click', (event) => {
                    const loadMore = event.target.closest('#studentProgressHistoryLoadMore');
                    if (!loadMore) return;
                    this.state.historyVisibleCount += 10;
                    this.renderHistory();
                });
            }
        },

        loadAll: async function () {
            this.renderLoading();

            try {
                await Promise.all([
                    this.loadOverview(),
                    this.loadResults()
                ]);
                this.renderOverview();
                this.populateSubjectFilters();
                this.renderHistory();
            } catch (error) {
                console.error('Student progress load error:', error);
                this.renderError(error.message || t('progress.unableLoad', 'Не удалось загрузить прогресс.'));
            }
        },

        reloadOverview: async function () {
            this.renderOverviewLoading();
            try {
                await this.loadOverview();
                this.renderOverview();
                this.populateSubjectFilters();
                this.renderHistory();
            } catch (error) {
                console.error('Student progress overview reload error:', error);
                this.renderError(error.message || t('progress.unableLoad', 'Не удалось загрузить прогресс.'));
            }
        },

        buildOverviewUrl: function () {
            const params = new URLSearchParams();
            params.set('period', this.state.chartRange || '30');
            if (this.state.chartSubject && this.state.chartSubject !== 'all') {
                params.set('subject_id', this.state.chartSubject);
            }
            return `/api/student/progress/overview?${params.toString()}`;
        },

        loadOverview: async function () {
            const token = window.ZedlyAuth?.getAuthToken?.() || 'cookie-session';
            const response = await fetch(this.buildOverviewUrl(), {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error(t('progress.failedLoad', 'Не удалось загрузить прогресс'));
            }

            this.state.overview = await response.json();
        },

        loadResults: async function () {
            const token = window.ZedlyAuth?.getAuthToken?.() || 'cookie-session';
            const response = await fetch('/api/student/results', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error(t('results.failedLoad', 'Не удалось загрузить результаты'));
            }

            const payload = await response.json();
            this.state.results = Array.isArray(payload.results) ? payload.results : [];
        },

        renderLoading: function () {
            const stats = document.getElementById('studentProgressStats');
            const knowledge = document.getElementById('studentProgressKnowledge');
            const trend = document.getElementById('studentProgressTrend');
            const weak = document.getElementById('studentProgressWeakTopics');
            const achievements = document.getElementById('studentProgressAchievements');
            const history = document.getElementById('studentProgressHistory');

            if (stats) {
                stats.innerHTML = `
                    <div class="stat-card"><div class="stat-content"><div class="stat-label">${t('common.loading', 'Загрузка...')}</div><div class="stat-value">--</div></div></div>
                    <div class="stat-card"><div class="stat-content"><div class="stat-label">${t('common.loading', 'Загрузка...')}</div><div class="stat-value">--</div></div></div>
                    <div class="stat-card"><div class="stat-content"><div class="stat-label">${t('common.loading', 'Загрузка...')}</div><div class="stat-value">--</div></div></div>
                    <div class="stat-card"><div class="stat-content"><div class="stat-label">${t('common.loading', 'Загрузка...')}</div><div class="stat-value">--</div></div></div>
                `;
            }

            if (knowledge) knowledge.innerHTML = `<p class="no-data">${t('progress.loadingSubjects', 'Загрузка предметов...')}</p>`;
            if (trend) trend.innerHTML = `<p class="no-data">${t('progress.loadingTrend', 'Загрузка динамики...')}</p>`;
            if (weak) weak.innerHTML = `<p class="no-data">${t('common.loading', 'Загрузка...')}</p>`;
            if (achievements) achievements.innerHTML = `<p class="no-data">${t('common.loading', 'Загрузка...')}</p>`;
            if (history) history.innerHTML = `<p class="no-data">${t('results.loadingResults', 'Загрузка результатов...')}</p>`;
        },

        renderOverviewLoading: function () {
            const trend = document.getElementById('studentProgressTrend');
            if (trend) {
                trend.innerHTML = `<p class="no-data">${t('progress.loadingTrend', 'Загрузка динамики...')}</p>`;
            }
        },

        renderError: function (message) {
            const containers = [
                'studentProgressStats',
                'studentProgressKnowledge',
                'studentProgressTrend',
                'studentProgressWeakTopics',
                'studentProgressAchievements',
                'studentProgressHistory'
            ];

            containers.forEach((id) => {
                const el = document.getElementById(id);
                if (!el) return;
                el.innerHTML = `<div class="error-message"><p>${escapeHtml(message)}</p></div>`;
            });

            this.teardownReactRoots();
        },

        renderOverview: function () {
            const overview = this.state.overview || {};
            this.renderStats(overview.stats || {});
            this.renderKnowledge();
            this.renderTrend();
            this.renderWeakTopics(overview.weak_topics || []);
            this.renderAchievements(overview.achievements || []);
            this.updateRangeButtons();
        },

        renderStats: function (stats) {
            const container = document.getElementById('studentProgressStats');
            if (!container) return;

            const avgScore = toNumber(stats.avg_score, 0);
            const avgTrend = toNumber(stats.avg_score_trend, 0);
            const testsCompleted = toNumber(stats.tests_completed, 0);
            const testsAssigned = toNumber(stats.tests_assigned, 0);
            const streakDays = toNumber(stats.streak_days, 0);
            const totalTimeSeconds = toNumber(stats.total_time_spent_seconds, 0);

            let trendClass = 'is-flat';
            let trendArrow = '→';
            if (avgTrend > 0.1) {
                trendClass = 'is-up';
                trendArrow = '↑';
            } else if (avgTrend < -0.1) {
                trendClass = 'is-down';
                trendArrow = '↓';
            }

            container.innerHTML = `
                <div class="stat-card student-progress-stat-card">
                    <div class="stat-content">
                        <div class="stat-label">Средний балл</div>
                        <div class="stat-value">${formatPercent(avgScore)}</div>
                        <div class="progress-stat-meta ${trendClass}">${trendArrow} ${Math.abs(avgTrend).toFixed(1)}% за последние 30 дней</div>
                    </div>
                </div>

                <div class="stat-card student-progress-stat-card">
                    <div class="stat-content">
                        <div class="stat-label">Пройдено тестов</div>
                        <div class="stat-value">${testsCompleted} <span class="progress-stat-muted">из ${testsAssigned}</span></div>
                        <div class="progress-stat-meta">Назначенных тестов</div>
                    </div>
                </div>

                <div class="stat-card student-progress-stat-card">
                    <div class="stat-content">
                        <div class="stat-label">Streak</div>
                        <div class="stat-value">🔥 ${streakDays}</div>
                        <div class="progress-stat-meta">дней подряд</div>
                    </div>
                </div>

                <div class="stat-card student-progress-stat-card">
                    <div class="stat-content">
                        <div class="stat-label">Потрачено времени</div>
                        <div class="stat-value">${formatDurationCompact(totalTimeSeconds)}</div>
                        <div class="progress-stat-meta">на тесты</div>
                    </div>
                </div>
            `;
        },

        renderKnowledge: function () {
            const container = document.getElementById('studentProgressKnowledge');
            if (!container) return;

            const subjects = Array.isArray(this.state.overview?.subjects) ? this.state.overview.subjects : [];

            if (!subjects.length) {
                container.innerHTML = `<p class="no-data">${t('progress.noSubjectData', 'Пока нет данных по предметам.')}</p>`;
                this.teardownProgressBars();
                return;
            }

            const html = subjects.map((subject) => {
                const subjectId = String(subject.subject_id || '');
                const avgScore = clamp(toNumber(subject.avg_score, 0), 0, 100);
                const attempts = toNumber(subject.attempts, 0);
                const tone = getPerformanceTone(avgScore);
                const isExpanded = this.state.expandedSubjects.has(subjectId);
                const topics = Array.isArray(subject.topics) ? subject.topics : [];

                const topicsHtml = topics.length
                    ? topics.map((topic) => {
                        const topicScore = clamp(toNumber(topic.avg_score, 0), 0, 100);
                        const topicTone = getPerformanceTone(topicScore);
                        return `
                            <div class="knowledge-topic-row">
                                <div class="knowledge-topic-top">
                                    <span class="knowledge-topic-name">${escapeHtml(topic.topic_name || 'Тема')}</span>
                                    <span class="knowledge-topic-score">${formatPercent(topicScore)}</span>
                                </div>
                                <div class="knowledge-topic-track">
                                    <span style="width:${topicScore}%;background:${topicTone.color};"></span>
                                </div>
                            </div>
                        `;
                    }).join('')
                    : `<p class="knowledge-topic-empty">Нет данных по темам.</p>`;

                return `
                    <article class="knowledge-item ${isExpanded ? 'is-expanded' : ''}">
                        <button type="button" class="knowledge-toggle js-knowledge-toggle" data-subject-id="${escapeHtml(subjectId)}" aria-expanded="${isExpanded ? 'true' : 'false'}">
                            <div class="knowledge-toggle-row">
                                <span class="knowledge-subject-name">${escapeHtml(subject.subject_name || 'Предмет')}</span>
                                <span class="${tone.badgeClass}">${formatPercent(avgScore)}</span>
                            </div>
                            <div class="knowledge-progress-wrap">
                                <div class="knowledge-progress-rechart" data-progress="${avgScore}" data-color="${tone.color}"></div>
                            </div>
                            <div class="knowledge-toggle-row knowledge-toggle-meta-row">
                                <span class="knowledge-subject-meta">${attempts} тестов</span>
                                <span class="knowledge-chevron">⌄</span>
                            </div>
                        </button>
                        <div class="knowledge-topics-shell">
                            <div class="knowledge-topics-inner">
                                ${topicsHtml}
                            </div>
                        </div>
                    </article>
                `;
            }).join('');

            container.innerHTML = `<div class="knowledge-list">${html}</div>`;
            this.renderKnowledgeProgressBars();
        },

        renderKnowledgeProgressBars: function () {
            this.teardownProgressBars();

            if (!window.React || !window.ReactDOM || !window.Recharts) {
                return;
            }

            const charts = document.querySelectorAll('#studentProgressKnowledge .knowledge-progress-rechart');
            const React = window.React;
            const Recharts = window.Recharts;

            charts.forEach((chartEl) => {
                const score = clamp(toNumber(chartEl.dataset.progress, 0), 0, 100);
                const color = chartEl.dataset.color || '#22c55e';
                const root = createReactRoot(chartEl);
                if (!root) return;

                const data = [{ name: 'score', value: score }];
                const chart = React.createElement(
                    Recharts.ResponsiveContainer,
                    { width: '100%', height: 18 },
                    React.createElement(
                        Recharts.BarChart,
                        { data, layout: 'vertical', margin: { top: 0, right: 0, bottom: 0, left: 0 } },
                        React.createElement(Recharts.XAxis, {
                            type: 'number',
                            domain: [0, 100],
                            hide: true
                        }),
                        React.createElement(Recharts.YAxis, {
                            type: 'category',
                            dataKey: 'name',
                            hide: true
                        }),
                        React.createElement(Recharts.Bar, {
                            dataKey: 'value',
                            fill: color,
                            radius: [999, 999, 999, 999],
                            barSize: 12,
                            background: {
                                fill: 'rgba(148, 163, 184, 0.25)',
                                radius: 999
                            },
                            isAnimationActive: true,
                            animationDuration: 700
                        })
                    )
                );

                root.render(chart);
                this.state.progressBarRoots.push(root);
            });
        },

        buildTrendSeries: function (rows) {
            const safeRows = Array.isArray(rows) ? rows : [];
            const byWeek = new Map();

            safeRows.forEach((row) => {
                const periodDate = new Date(row.period);
                if (Number.isNaN(periodDate.getTime())) return;
                periodDate.setHours(0, 0, 0, 0);
                const key = periodDate.toISOString().slice(0, 10);
                byWeek.set(key, {
                    score: toNumber(row.avg_score, 0),
                    attempts: toNumber(row.attempts, 0)
                });
            });

            const weekCount = this.state.chartRange === '365'
                ? 52
                : (this.state.chartRange === '90' ? 13 : 8);

            const now = new Date();
            const utcNow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
            const day = utcNow.getUTCDay();
            const mondayOffset = day === 0 ? 6 : day - 1;
            const currentWeekStart = new Date(utcNow);
            currentWeekStart.setUTCDate(currentWeekStart.getUTCDate() - mondayOffset);

            const series = [];
            for (let i = weekCount - 1; i >= 0; i--) {
                const pointDate = new Date(currentWeekStart);
                pointDate.setUTCDate(pointDate.getUTCDate() - (i * 7));
                const key = pointDate.toISOString().slice(0, 10);
                const hit = byWeek.get(key);
                const label = `${String(pointDate.getUTCDate()).padStart(2, '0')}.${String(pointDate.getUTCMonth() + 1).padStart(2, '0')}`;

                series.push({
                    label,
                    fullDate: formatDateUtc(pointDate),
                    score: hit ? Number(hit.score.toFixed(1)) : null,
                    attempts: hit ? hit.attempts : 0
                });
            }

            return series;
        },

        renderTrend: function () {
            const container = document.getElementById('studentProgressTrend');
            if (!container) return;

            const trendRows = Array.isArray(this.state.overview?.trend) ? this.state.overview.trend : [];
            const data = this.buildTrendSeries(trendRows);

            if (!data.some((point) => point.score !== null)) {
                container.innerHTML = `<p class="no-data">${t('progress.noRecentAttempts', 'Пока нет недавних попыток.')}</p>`;
                this.teardownTrendRoot();
                return;
            }

            if (!window.React || !window.ReactDOM || !window.Recharts) {
                container.innerHTML = `<p class="no-data">Не удалось загрузить Recharts.</p>`;
                this.teardownTrendRoot();
                return;
            }

            container.innerHTML = '<div class="progress-trend-chart" id="studentProgressTrendChartRoot"></div>';
            const chartRootEl = document.getElementById('studentProgressTrendChartRoot');
            if (!chartRootEl) return;

            this.teardownTrendRoot();

            const React = window.React;
            const Recharts = window.Recharts;
            const tooltipLabel = t('progress.averageScore', 'Средний балл');
            const CustomTooltip = (props) => {
                const active = props?.active;
                const payload = props?.payload;
                if (!active || !Array.isArray(payload) || !payload.length) {
                    return null;
                }

                const point = payload[0].payload || {};
                const score = point.score;
                const scoreText = score === null || score === undefined ? '—' : `${score.toFixed(1)}%`;
                return React.createElement(
                    'div',
                    { className: 'progress-chart-tooltip' },
                    React.createElement('div', { className: 'progress-chart-tooltip-date' }, point.fullDate || ''),
                    React.createElement('div', { className: 'progress-chart-tooltip-score' }, `${tooltipLabel}: ${scoreText}`)
                );
            };

            const chartElement = React.createElement(
                Recharts.ResponsiveContainer,
                { width: '100%', height: 320 },
                React.createElement(
                    Recharts.LineChart,
                    {
                        data,
                        margin: { top: 10, right: 12, left: 0, bottom: 4 }
                    },
                    React.createElement(Recharts.CartesianGrid, {
                        stroke: 'rgba(148, 163, 184, 0.22)',
                        strokeDasharray: '4 4'
                    }),
                    React.createElement(Recharts.XAxis, {
                        dataKey: 'label',
                        tick: { fill: '#94a3b8', fontSize: 12 },
                        axisLine: { stroke: 'rgba(148, 163, 184, 0.28)' },
                        tickLine: false
                    }),
                    React.createElement(Recharts.YAxis, {
                        domain: [0, 100],
                        tick: { fill: '#94a3b8', fontSize: 12 },
                        axisLine: { stroke: 'rgba(148, 163, 184, 0.28)' },
                        tickLine: false,
                        tickFormatter: (value) => `${value}%`
                    }),
                    React.createElement(Recharts.Tooltip, {
                        content: CustomTooltip
                    }),
                    React.createElement(Recharts.Line, {
                        type: 'monotone',
                        dataKey: 'score',
                        stroke: '#60a5fa',
                        strokeWidth: 3,
                        dot: { r: 4, strokeWidth: 2, fill: '#1e293b' },
                        activeDot: { r: 6 },
                        connectNulls: false,
                        isAnimationActive: true,
                        animationDuration: 700
                    })
                )
            );

            const root = createReactRoot(chartRootEl);
            if (!root) {
                container.innerHTML = '<p class="no-data">Не удалось инициализировать график.</p>';
                return;
            }

            root.render(chartElement);
            this.state.trendRoot = root;
        },

        renderWeakTopics: function (weakTopics) {
            const container = document.getElementById('studentProgressWeakTopics');
            if (!container) return;

            const rows = Array.isArray(weakTopics) ? weakTopics : [];
            if (!rows.length) {
                container.innerHTML = '<p class="no-data">Слабых тем пока не найдено.</p>';
                return;
            }

            const listHtml = rows.map((row) => {
                const testsCount = toNumber(row.error_tests, 0);
                const topicName = escapeHtml(row.topic_name || 'Тема');
                return `
                    <div class="weak-topic-item">
                        <div class="weak-topic-content">${topicName} — ошибки в ${testsCount} тестах</div>
                        <button type="button" class="btn btn-outline" disabled>Найти тест</button>
                    </div>
                `;
            }).join('');

            container.innerHTML = `<div class="weak-topics-list">${listHtml}</div>`;
        },

        renderAchievements: function (achievements) {
            const container = document.getElementById('studentProgressAchievements');
            if (!container) return;

            const rows = Array.isArray(achievements) ? achievements : [];
            if (!rows.length) {
                container.innerHTML = '<p class="no-data">Достижения пока не найдены.</p>';
                return;
            }

            const html = rows.slice(0, 6).map((item, index) => {
                const obtained = Boolean(item.obtained);
                const badgeClass = obtained ? 'achievement-item is-unlocked' : 'achievement-item is-locked';
                const icon = escapeHtml(item.icon || '🏅');
                const title = escapeHtml(item.title || 'Достижение');
                const description = escapeHtml(item.description || '');

                return `
                    <article class="${badgeClass}" style="--appear-delay:${index * 80}ms;">
                        <div class="achievement-icon">${icon}${obtained ? '' : ' <span class="achievement-lock">🔒</span>'}</div>
                        <div class="achievement-title">${title}</div>
                        <div class="achievement-desc">${description}</div>
                    </article>
                `;
            }).join('');

            container.innerHTML = `<div class="achievements-grid">${html}</div>`;
        },

        populateSubjectFilters: function () {
            const filtersFromOverview = Array.isArray(this.state.overview?.filters?.subjects)
                ? this.state.overview.filters.subjects
                : [];

            const chartOptions = filtersFromOverview
                .filter((item) => item && item.subject_name)
                .reduce((acc, item) => {
                    const key = String(item.subject_id || item.subject_name).trim();
                    if (!key || acc.some((entry) => String(entry.subject_id) === key)) return acc;
                    acc.push({
                        subject_id: key,
                        subject_name: String(item.subject_name)
                    });
                    return acc;
                }, [])
                .sort((a, b) => a.subject_name.localeCompare(b.subject_name, 'ru'));

            const historyOptions = this.state.results
                .map((row) => String(row.subject_name || '').trim())
                .filter(Boolean)
                .reduce((acc, name) => {
                    const value = name.toLowerCase();
                    if (acc.some((item) => item.value === value)) return acc;
                    acc.push({ value, label: name });
                    return acc;
                }, [])
                .sort((a, b) => a.label.localeCompare(b.label, 'ru'));

            this.populateSelect('studentProgressChartSubjectFilter', chartOptions, 'Все предметы', this.state.chartSubject);
            this.populateSelect('studentProgressHistorySubjectFilter', historyOptions, 'Все предметы', this.state.historySubject);
        },

        populateSelect: function (id, options, allLabel, selectedValue) {
            const select = document.getElementById(id);
            if (!select) return;

            const selected = selectedValue || 'all';
            const optionsHtml = (Array.isArray(options) ? options : []).map((item) => {
                const value = String(item.value || item.subject_id || '').trim();
                const label = escapeHtml(item.label || item.subject_name || '-');
                const isSelected = value === selected ? 'selected' : '';
                return `<option value="${escapeHtml(value)}" ${isSelected}>${label}</option>`;
            }).join('');

            select.innerHTML = `
                <option value="all" ${selected === 'all' ? 'selected' : ''}>${escapeHtml(allLabel)}</option>
                ${optionsHtml}
            `;

            if (![...select.options].some((opt) => opt.value === selected)) {
                select.value = 'all';
                if (id === 'studentProgressChartSubjectFilter') this.state.chartSubject = 'all';
                if (id === 'studentProgressHistorySubjectFilter') this.state.historySubject = 'all';
            }
        },

        updateRangeButtons: function () {
            const buttons = document.querySelectorAll('#studentProgressRangeToggle .progress-range-btn');
            buttons.forEach((button) => {
                const isActive = button.dataset.range === this.state.chartRange;
                button.classList.toggle('active', isActive);
            });
        },

        getFilteredHistoryRows: function () {
            const rows = Array.isArray(this.state.results) ? this.state.results : [];
            const subjectFilter = this.state.historySubject || 'all';

            return rows
                .filter((row) => {
                    if (subjectFilter === 'all') return true;
                    return String(row.subject_name || '').toLowerCase() === subjectFilter.toLowerCase();
                })
                .sort((a, b) => {
                    const left = new Date(b.submitted_at || b.started_at || 0).getTime();
                    const right = new Date(a.submitted_at || a.started_at || 0).getTime();
                    return left - right;
                });
        },

        renderHistory: function () {
            const container = document.getElementById('studentProgressHistory');
            if (!container) return;

            const filteredRows = this.getFilteredHistoryRows();
            if (!filteredRows.length) {
                container.innerHTML = '<p class="no-data">История тестов пока пуста.</p>';
                return;
            }

            const visibleRows = filteredRows.slice(0, this.state.historyVisibleCount);
            const hasMore = filteredRows.length > this.state.historyVisibleCount;

            const rowsHtml = visibleRows.map((row) => {
                const score = clamp(toNumber(row.percentage, 0), 0, 100);
                const tone = getPerformanceTone(score);
                const subjectName = row.subject_name ? escapeHtml(row.subject_name) : '—';
                const timeSeconds = getDurationFromResult(row);
                const testTitle = escapeHtml(row.test_title || 'Тест без названия');

                return `
                    <tr>
                        <td>${testTitle}</td>
                        <td>${subjectName}</td>
                        <td>${formatDate(row.submitted_at || row.started_at)}</td>
                        <td><span class="${tone.badgeClass}">${formatPercent(score)}</span></td>
                        <td>${formatDurationRow(timeSeconds)}</td>
                        <td><button type="button" class="btn btn-outline progress-history-action" disabled>Подробнее</button></td>
                    </tr>
                `;
            }).join('');

            container.innerHTML = `
                <div class="table-responsive">
                    <table class="data-table progress-history-table">
                        <thead>
                            <tr>
                                <th>Название теста</th>
                                <th>Предмет</th>
                                <th>Дата</th>
                                <th>Балл</th>
                                <th>Время</th>
                                <th>Действие</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </div>
                ${hasMore ? `
                    <div class="progress-history-more-wrap">
                        <button id="studentProgressHistoryLoadMore" type="button" class="btn btn-outline">Загрузить еще</button>
                    </div>
                ` : ''}
            `;
        },

        teardownTrendRoot: function () {
            if (this.state.trendRoot && typeof this.state.trendRoot.unmount === 'function') {
                this.state.trendRoot.unmount();
            }
            this.state.trendRoot = null;
        },

        teardownProgressBars: function () {
            if (!Array.isArray(this.state.progressBarRoots)) {
                this.state.progressBarRoots = [];
                return;
            }

            this.state.progressBarRoots.forEach((root) => {
                if (root && typeof root.unmount === 'function') {
                    root.unmount();
                }
            });
            this.state.progressBarRoots = [];
        },

        teardownReactRoots: function () {
            this.teardownTrendRoot();
            this.teardownProgressBars();
        }
    };
})();
