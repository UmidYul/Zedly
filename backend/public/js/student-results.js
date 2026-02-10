// Student Results Dashboard
(function () {
    'use strict';

    window.StudentResults = {
        results: [],
        filteredResults: [],

        init: async function () {
            this.bindEvents();
            await this.loadResults();
        },

        bindEvents: function () {
            const search = document.getElementById('studentResultsSearch');
            if (search) {
                search.addEventListener('input', (e) => {
                    const term = e.target.value.trim().toLowerCase();
                    if (!term) {
                        this.filteredResults = [...this.results];
                    } else {
                        this.filteredResults = this.results.filter(result =>
                            result.test_title.toLowerCase().includes(term) ||
                            (result.subject_name || '').toLowerCase().includes(term) ||
                            (result.class_name || '').toLowerCase().includes(term)
                        );
                    }
                    this.renderTable();
                });
            }

            const refresh = document.getElementById('studentResultsRefresh');
            if (refresh) {
                refresh.addEventListener('click', () => this.loadResults());
            }
        },

        loadResults: async function () {
            this.renderLoading();

            try {
                const token = localStorage.getItem('access_token');
                const response = await fetch('/api/student/results', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!response.ok) {
                    throw new Error('Failed to load results');
                }

                const data = await response.json();
                this.results = data.results || [];
                this.filteredResults = [...this.results];

                this.renderStats();
                this.renderTable();
            } catch (error) {
                console.error('Load student results error:', error);
                this.renderError(error.message || 'Unable to load results.');
            }
        },

        renderLoading: function () {
            const stats = document.getElementById('studentResultsStats');
            const table = document.getElementById('studentResultsTable');

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

            if (table) {
                table.innerHTML = '<p style="color: var(--text-secondary);">Loading results...</p>';
            }
        },

        renderError: function (message) {
            const stats = document.getElementById('studentResultsStats');
            const table = document.getElementById('studentResultsTable');

            if (stats) {
                stats.innerHTML = '';
            }

            if (table) {
                table.innerHTML = `<div class="error-message"><p>${message}</p></div>`;
            }
        },

        renderStats: function () {
            const stats = document.getElementById('studentResultsStats');
            if (!stats) return;

            const total = this.results.length;
            const completed = this.results.filter(r => r.is_completed).length;
            const avg = completed > 0
                ? (this.results.reduce((sum, r) => sum + parseFloat(r.percentage || 0), 0) / completed).toFixed(1)
                : '0.0';
            const passedCount = this.results.filter(r => this.isPassed(r)).length;
            const passRate = completed > 0 ? Math.round((passedCount / completed) * 100) : 0;

            stats.innerHTML = `
                <div class="stat-card">
                    <div class="stat-content">
                        <div class="stat-label">Tests Completed</div>
                        <div class="stat-value">${completed}</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-content">
                        <div class="stat-label">Average Score</div>
                        <div class="stat-value">${avg}%</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-content">
                        <div class="stat-label">Pass Rate</div>
                        <div class="stat-value">${passRate}%</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-content">
                        <div class="stat-label">Total Attempts</div>
                        <div class="stat-value">${total}</div>
                    </div>
                </div>
            `;
        },

        renderTable: function () {
            const table = document.getElementById('studentResultsTable');
            if (!table) return;

            if (this.filteredResults.length === 0) {
                table.innerHTML = '<p style="color: var(--text-secondary);">No completed tests yet.</p>';
                return;
            }

            let html = `
                <div class="table-responsive">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Test</th>
                                <th>Subject</th>
                                <th>Class</th>
                                <th>Date</th>
                                <th>Score</th>
                                <th>Result</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            this.filteredResults.forEach(result => {
                const percentage = parseFloat(result.percentage || 0);
                const passed = this.isPassed(result);
                const statusClass = passed ? 'status-active' : 'status-warning';
                const statusText = passed ? 'Passed' : 'Failed';

                html += `
                    <tr>
                        <td>
                            <div class="user-name">${result.test_title}</div>
                        </td>
                        <td>
                            ${result.subject_name ? `
                                <span class="subject-badge" style="background-color: ${result.subject_color}20; color: ${result.subject_color};">
                                    ${result.subject_name}
                                </span>
                            ` : '-'}
                        </td>
                        <td>${result.class_name}</td>
                        <td>${this.formatDate(result.submitted_at)}</td>
                        <td>${result.score} / ${result.max_score}</td>
                        <td>
                            <span class="status-badge ${statusClass}">${percentage.toFixed(1)}% - ${statusText}</span>
                        </td>
                        <td>
                            <button class="btn-icon" onclick="StudentResults.viewAttempt(${result.attempt_id})" title="View Details">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                    <circle cx="12" cy="12" r="3"></circle>
                                </svg>
                            </button>
                        </td>
                    </tr>
                `;
            });

            html += `
                        </tbody>
                    </table>
                </div>
            `;

            table.innerHTML = html;
        },

        viewAttempt: function (attemptId) {
            window.location.href = `/test-results.html?attempt_id=${attemptId}`;
        },

        isPassed: function (result) {
            const percentage = parseFloat(result.percentage || 0);
            const threshold = result.passing_score !== undefined && result.passing_score !== null
                ? parseFloat(result.passing_score)
                : 60;
            return percentage >= threshold;
        },

        formatDate: function (dateString) {
            if (!dateString) return '-';
            const date = new Date(dateString);
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            return `${day}.${month}.${year} ${hours}:${minutes}`;
        }
    };
})();
