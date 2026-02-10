// SuperAdmin Global Statistics
(function () {
    'use strict';

    const ICONS = {
        schools: '<path d="M3 21h18M3 7v14M21 7v14M9 7v14M15 7v14M3 7h18M9 3v4M15 3v4"/>',
        users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
        tests: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
        attempts: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>'
    };

    window.SuperadminStats = {
        init: async function () {
            this.renderLoading();
            await this.loadStats();
        },

        renderLoading: function () {
            const cards = document.getElementById('superadminStatsCards');
            const breakdown = document.getElementById('superadminStatsBreakdown');
            const note = document.getElementById('superadminStatsNote');

            if (cards) {
                cards.innerHTML = `
                    <div class="stat-card">
                        <div class="stat-content">
                            <div class="stat-label">Loading...</div>
                            <div class="stat-value">--</div>
                        </div>
                    </div>
                `;
            }

            if (breakdown) {
                breakdown.innerHTML = '<p style="color: var(--text-secondary);">Loading statistics...</p>';
            }

            if (note) {
                note.innerHTML = '<p style="color: var(--text-secondary);">Fetching latest global metrics.</p>';
            }
        },

        loadStats: async function () {
            try {
                const token = localStorage.getItem('access_token');
                if (!token) {
                    this.renderError('Missing access token. Please log in again.');
                    return;
                }

                const response = await fetch('/api/superadmin/dashboard/stats', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!response.ok) {
                    throw new Error('Failed to load global statistics');
                }

                const data = await response.json();
                this.renderStats(data.stats || {});
            } catch (error) {
                console.error('Load global statistics error:', error);
                this.renderError(error.message || 'Unable to load statistics');
            }
        },

        renderStats: function (stats) {
            const cards = document.getElementById('superadminStatsCards');
            const breakdown = document.getElementById('superadminStatsBreakdown');
            const note = document.getElementById('superadminStatsNote');

            const schoolsTotal = stats.schools?.total ?? 0;
            const schoolsActive = stats.schools?.active ?? 0;
            const usersTotal = stats.users?.total ?? 0;
            const usersAdmins = stats.users?.school_admins ?? 0;
            const usersTeachers = stats.users?.teachers ?? 0;
            const usersStudents = stats.users?.students ?? 0;
            const testsTotal = stats.tests?.total ?? 0;
            const attemptsTotal = stats.attempts?.total ?? 0;

            if (cards) {
                cards.innerHTML = `
                    <div class="stat-card">
                        <div class="stat-icon blue">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                ${ICONS.schools}
                            </svg>
                        </div>
                        <div class="stat-content">
                            <div class="stat-label">Schools</div>
                            <div class="stat-value">${schoolsTotal}</div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon green">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                ${ICONS.users}
                            </svg>
                        </div>
                        <div class="stat-content">
                            <div class="stat-label">Users</div>
                            <div class="stat-value">${usersTotal}</div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon orange">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                ${ICONS.tests}
                            </svg>
                        </div>
                        <div class="stat-content">
                            <div class="stat-label">Tests</div>
                            <div class="stat-value">${testsTotal}</div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon purple">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                ${ICONS.attempts}
                            </svg>
                        </div>
                        <div class="stat-content">
                            <div class="stat-label">Completed Attempts</div>
                            <div class="stat-value">${attemptsTotal}</div>
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
                                    <th>Metric</th>
                                    <th>Total</th>
                                    <th>Active / Completed</th>
                                    <th>Details</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>Schools</td>
                                    <td>${schoolsTotal}</td>
                                    <td>${schoolsActive}</td>
                                    <td>${schoolsActive} active schools</td>
                                </tr>
                                <tr>
                                    <td>Users</td>
                                    <td>${usersTotal}</td>
                                    <td>-</td>
                                    <td>${usersAdmins} admins, ${usersTeachers} teachers, ${usersStudents} students</td>
                                </tr>
                                <tr>
                                    <td>Tests</td>
                                    <td>${testsTotal}</td>
                                    <td>-</td>
                                    <td>All created tests</td>
                                </tr>
                                <tr>
                                    <td>Attempts</td>
                                    <td>${attemptsTotal}</td>
                                    <td>${attemptsTotal}</td>
                                    <td>Completed attempts</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                `;
            }

            if (note) {
                note.innerHTML = `
                    <div class="section-header">
                        <h2 class="section-title">Notes</h2>
                    </div>
                    <p style="color: var(--text-secondary);">Statistics are aggregated across all schools. Use the Schools page to drill down.</p>
                `;
            }
        },

        renderError: function (message) {
            const cards = document.getElementById('superadminStatsCards');
            const breakdown = document.getElementById('superadminStatsBreakdown');
            const note = document.getElementById('superadminStatsNote');

            if (cards) {
                cards.innerHTML = `
                    <div class="dashboard-section">
                        <div class="section-header">
                            <h2 class="section-title">Statistics</h2>
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
