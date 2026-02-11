// School Admin Statistics
(function () {
    'use strict';

    const t = (key, fallback) => window.ZedlyI18n?.translate(key) || fallback || key;

    const ICONS = {
        users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
        class: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
        tests: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
        subjects: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'
    };

    function formatPercent(value) {
        const num = Number(value);
        if (!Number.isFinite(num)) {
            return '0';
        }

        const rounded = Math.round(num * 10) / 10;
        if (Number.isInteger(rounded)) {
            return String(rounded);
        }

        return rounded.toFixed(1);
    }

    window.SchoolAdminStats = {
        init: async function () {
            this.renderLoading();
            await this.loadStats();
        },

        renderLoading: function () {
            const cards = document.getElementById('schoolAdminStatsCards');
            const breakdown = document.getElementById('schoolAdminStatsBreakdown');
            const note = document.getElementById('schoolAdminStatsNote');

            if (cards) {
                cards.innerHTML = `
                    <div class="stat-card">
                        <div class="stat-content">
                            <div class="stat-label">${t('dashboard.statistics.loading', 'Loading statistics...')}</div>
                            <div class="stat-value">--</div>
                        </div>
                    </div>
                `;
            }

            if (breakdown) {
                breakdown.innerHTML = `<p style="color: var(--text-secondary);">${t('dashboard.statistics.loading', 'Loading statistics...')}</p>`;
            }

            if (note) {
                note.innerHTML = `<p style="color: var(--text-secondary);">${t('dashboard.statistics.loadingNote', 'Fetching latest school metrics.')}</p>`;
            }
        },

        loadStats: async function () {
            try {
                const token = localStorage.getItem('access_token');
                if (!token) {
                    this.renderError(t('dashboard.statistics.errorMissingToken', 'Missing access token. Please log in again.'));
                    return;
                }

                const response = await fetch('/api/analytics/school/overview?period=30', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!response.ok) {
                    throw new Error(t('dashboard.statistics.errorFailedLoad', 'Failed to load school statistics'));
                }

                const data = await response.json();
                this.renderStats(data.overview || {});
            } catch (error) {
                console.error('Load school statistics error:', error);
                this.renderError(error.message || t('dashboard.statistics.errorUnableLoad', 'Unable to load statistics'));
            }
        },

        renderStats: function (stats) {
            const cards = document.getElementById('schoolAdminStatsCards');
            const breakdown = document.getElementById('schoolAdminStatsBreakdown');
            const note = document.getElementById('schoolAdminStatsNote');

            const studentsTotal = stats.total_students ?? 0;
            const teachersTotal = stats.total_teachers ?? 0;
            const classesTotal = stats.total_classes ?? 0;
            const subjectsTotal = stats.total_subjects ?? 0;
            const testsTotal = stats.total_tests ?? 0;
            const attemptsTotal = stats.total_attempts ?? 0;
            const avgScore = stats.average_score ?? 0;

            if (cards) {
                cards.innerHTML = `
                    <div class="stat-card">
                        <div class="stat-icon blue">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                ${ICONS.users}
                            </svg>
                        </div>
                        <div class="stat-content">
                            <div class="stat-label">${t('dashboard.stats.students', 'Students')}</div>
                            <div class="stat-value">${studentsTotal}</div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon green">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                ${ICONS.users}
                            </svg>
                        </div>
                        <div class="stat-content">
                            <div class="stat-label">${t('dashboard.stats.teachers', 'Teachers')}</div>
                            <div class="stat-value">${teachersTotal}</div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon orange">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                ${ICONS.class}
                            </svg>
                        </div>
                        <div class="stat-content">
                            <div class="stat-label">${t('dashboard.stats.classes', 'Classes')}</div>
                            <div class="stat-value">${classesTotal}</div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon purple">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                ${ICONS.tests}
                            </svg>
                        </div>
                        <div class="stat-content">
                            <div class="stat-label">${t('dashboard.stats.tests', 'Tests')}</div>
                            <div class="stat-value">${testsTotal}</div>
                        </div>
                    </div>
                `;
            }

            if (breakdown) {
                breakdown.innerHTML = `
                    <div class="table-responsive">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>${t('dashboard.statistics.metric', 'Metric')}</th>
                                    <th>${t('dashboard.statistics.total', 'Total')}</th>
                                    <th>${t('dashboard.statistics.details', 'Details')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>${t('dashboard.stats.students', 'Students')}</td>
                                    <td>${studentsTotal}</td>
                                    <td>-</td>
                                </tr>
                                <tr>
                                    <td>${t('dashboard.stats.teachers', 'Teachers')}</td>
                                    <td>${teachersTotal}</td>
                                    <td>-</td>
                                </tr>
                                <tr>
                                    <td>${t('dashboard.stats.classes', 'Classes')}</td>
                                    <td>${classesTotal}</td>
                                    <td>-</td>
                                </tr>
                                <tr>
                                    <td>${t('dashboard.stats.subjects', 'Subjects')}</td>
                                    <td>${subjectsTotal}</td>
                                    <td>-</td>
                                </tr>
                                <tr>
                                    <td>${t('dashboard.stats.tests', 'Tests')}</td>
                                    <td>${testsTotal}</td>
                                    <td>-</td>
                                </tr>
                                <tr>
                                    <td>${t('dashboard.stats.attempts', 'Attempts')}</td>
                                    <td>${attemptsTotal}</td>
                                    <td>${t('dashboard.stats.completedAttempts', 'Completed Attempts')}</td>
                                </tr>
                                <tr>
                                    <td>${t('dashboard.stats.avgScore', 'Avg Score')}</td>
                                    <td>${formatPercent(avgScore)}%</td>
                                    <td>-</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                `;
            }

            if (note) {
                note.innerHTML = `
                    <div class="section-header">
                        <h2 class="section-title">${t('dashboard.statistics.notes', 'Notes')}</h2>
                    </div>
                    <p style="color: var(--text-secondary);">${t('dashboard.statistics.schoolNote', 'Statistics are aggregated for your school only.')}</p>
                `;
            }
        },

        renderError: function (message) {
            const cards = document.getElementById('schoolAdminStatsCards');
            const breakdown = document.getElementById('schoolAdminStatsBreakdown');
            const note = document.getElementById('schoolAdminStatsNote');

            if (cards) {
                cards.innerHTML = `
                    <div class="dashboard-section">
                        <div class="section-header">
                            <h2 class="section-title">${t('dashboard.statistics.title', 'Statistics')}</h2>
                        </div>
                        <p style="color: var(--text-secondary);">${message}</p>
                    </div>
                `;
            }

            if (breakdown) {
                breakdown.innerHTML = '';
            }

            if (note) {
                note.innerHTML = '';
            }
        }
    };
})();
