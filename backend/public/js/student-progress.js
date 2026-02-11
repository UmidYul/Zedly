// Student Progress Page
(function () {
    'use strict';

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
                    throw new Error('Failed to load progress');
                }

                const data = await response.json();
                this.renderStats(data.stats || {});
                this.renderTrend(data.trend || []);
                this.renderSubjects(data.subjects || []);
            } catch (error) {
                console.error('Load progress error:', error);
                this.renderError(error.message || 'Unable to load progress.');
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
                            <div class="stat-label">Loading...</div>
                            <div class="stat-value">--</div>
                        </div>
                    </div>
                `;
            }

            if (trend) {
                trend.innerHTML = '<p style="color: var(--text-secondary);">Loading trend...</p>';
            }

            if (subjects) {
                subjects.innerHTML = '<p style="color: var(--text-secondary);">Loading subjects...</p>';
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
                        <div class="stat-label">Tests Assigned</div>
                        <div class="stat-value">${stats.tests_assigned || 0}</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-content">
                        <div class="stat-label">Tests Completed</div>
                        <div class="stat-value">${stats.tests_completed || 0}</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-content">
                        <div class="stat-label">Completion Rate</div>
                        <div class="stat-value">${stats.completion_rate || 0}%</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-content">
                        <div class="stat-label">Average Score</div>
                        <div class="stat-value">${formatPercent(stats.avg_score)}%</div>
                    </div>
                </div>
            `;
        },

        renderTrend: function (trend) {
            const container = document.getElementById('studentProgressTrend');
            if (!container) return;

            if (!trend.length) {
                container.innerHTML = '<p style="color: var(--text-secondary);">No recent attempts yet.</p>';
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
                                <th>Week</th>
                                <th>Attempts</th>
                                <th>Avg Score</th>
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
                container.innerHTML = '<p style="color: var(--text-secondary);">No subject data yet.</p>';
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
                                <th>Subject</th>
                                <th>Attempts</th>
                                <th>Avg Score</th>
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
