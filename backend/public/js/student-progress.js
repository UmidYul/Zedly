// Student Progress Page
(function () {
    'use strict';

    function t(key, fallback) {
        return window.ZedlyI18n?.translate(key) || fallback || key;
    }

    function formatPercent(value) {
        const num = Number(value);
        if (!Number.isFinite(num)) {
            return '0.0';
        }
        return (Math.round(num * 10) / 10).toFixed(1);
    }

    function formatDate(value) {
        if (!value) return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '-';
        return date.toLocaleDateString();
    }

    window.StudentProgress = {
        init: function () {
            this.bindEvents();
            this.loadProgress();
        },

        bindEvents: function () {
            const refresh = document.getElementById('studentProgressRefresh');
            if (refresh) {
                refresh.addEventListener('click', () => this.loadProgress());
            }
        },

        loadProgress: async function () {
            this.renderLoading();

            try {
                const token = localStorage.getItem('access_token');
                const response = await fetch('/api/student/progress/overview', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!response.ok) {
                    throw new Error(t('progress.failedLoad', 'Не удалось загрузить прогресс'));
                }

                const data = await response.json();
                this.renderStats(data.stats || {});
                this.renderTrend(data.trend || []);
                this.renderSubjects(data.subjects || []);
            } catch (error) {
                console.error('Load progress error:', error);
                this.renderError(error.message || t('progress.unableLoad', 'Не удалось загрузить прогресс.'));
            }
        },

        renderLoading: function () {
            const stats = document.getElementById('studentProgressStats');
            const trend = document.getElementById('studentProgressTrend');
            const subjects = document.getElementById('studentProgressSubjects');

            if (stats) {
                stats.innerHTML = `
                    <div class="stat-card">
                        <div class="stat-content">
                            <div class="stat-label">${t('common.loading', 'Загрузка...')}</div>
                            <div class="stat-value">--</div>
                        </div>
                    </div>
                `;
            }

            if (trend) {
                trend.innerHTML = `<p style="color: var(--text-secondary);">${t('progress.loadingTrend', 'Загрузка динамики...')}</p>`;
            }

            if (subjects) {
                subjects.innerHTML = `<p style="color: var(--text-secondary);">${t('progress.loadingSubjects', 'Загрузка предметов...')}</p>`;
            }
        },

        renderError: function (message) {
            const stats = document.getElementById('studentProgressStats');
            const trend = document.getElementById('studentProgressTrend');
            const subjects = document.getElementById('studentProgressSubjects');

            if (stats) {
                stats.innerHTML = '';
            }

            if (trend) {
                trend.innerHTML = `<div class="error-message"><p>${message}</p></div>`;
            }

            if (subjects) {
                subjects.innerHTML = '';
            }
        },

        renderStats: function (stats) {
            const container = document.getElementById('studentProgressStats');
            if (!container) return;

            container.innerHTML = `
                <div class="stat-card">
                    <div class="stat-content">
                        <div class="stat-label">${t('progress.testsAssigned', 'Назначено тестов')}</div>
                        <div class="stat-value">${stats.tests_assigned || 0}</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-content">
                        <div class="stat-label">${t('progress.testsCompleted', 'Завершено тестов')}</div>
                        <div class="stat-value">${stats.tests_completed || 0}</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-content">
                        <div class="stat-label">${t('progress.completionRate', 'Процент завершения')}</div>
                        <div class="stat-value">${stats.completion_rate || 0}%</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-content">
                        <div class="stat-label">${t('progress.averageScore', 'Средний балл')}</div>
                        <div class="stat-value">${formatPercent(stats.avg_score)}%</div>
                    </div>
                </div>
            `;
        },

        renderTrend: function (trend) {
            const container = document.getElementById('studentProgressTrend');
            if (!container) return;

            if (!trend.length) {
                container.innerHTML = `<p style="color: var(--text-secondary);">${t('progress.noRecentAttempts', 'Пока нет недавних попыток.')}</p>`;
                return;
            }

            const rows = trend.map(item => `
                <tr>
                    <td>${formatDate(item.period)}</td>
                    <td>${item.attempts || 0}</td>
                    <td>${formatPercent(item.avg_score)}%</td>
                </tr>
            `).join('');

            container.innerHTML = `
                <div class="table-responsive">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>${t('progress.colWeek', 'Неделя')}</th>
                                <th>${t('progress.colAttempts', 'Попытки')}</th>
                                <th>${t('progress.colAvgScore', 'Средний балл')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                </div>
            `;
        },

        renderSubjects: function (subjects) {
            const container = document.getElementById('studentProgressSubjects');
            if (!container) return;

            if (!subjects.length) {
                container.innerHTML = `<p style="color: var(--text-secondary);">${t('progress.noSubjectData', 'Пока нет данных по предметам.')}</p>`;
                return;
            }

            const rows = subjects.map(item => `
                <tr>
                    <td>
                        ${item.subject_name ? `
                            <span class="subject-badge" style="background-color: ${item.subject_color || '#4A90E2'}20; color: ${item.subject_color || '#4A90E2'};">
                                ${item.subject_name}
                            </span>
                        ` : '-'}
                    </td>
                    <td>${item.attempts || 0}</td>
                    <td>${formatPercent(item.avg_score)}%</td>
                </tr>
            `).join('');

            container.innerHTML = `
                <div class="table-responsive">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>${t('progress.colSubject', 'Предмет')}</th>
                                <th>${t('progress.colAttempts', 'Попытки')}</th>
                                <th>${t('progress.colAvgScore', 'Средний балл')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                </div>
            `;
        }
    };
})();
