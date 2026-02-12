// Student Tests & Assignments Management
(function () {
    'use strict';

    window.StudentTestsManager = {
        currentTab: 'available', // available, completed
        assignments: [],

        // Safely serialize values for inline onclick handlers
        toJsArg: function (value) {
            const str = String(value ?? '');
            return `'${str.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
        },

        notify: function (message, options) {
            if (window.ZedlyDialog?.alert) {
                return window.ZedlyDialog.alert(message, options);
            }
            alert(message);
            return Promise.resolve(true);
        },

        askConfirm: function (message, options) {
            if (window.ZedlyDialog?.confirm) {
                return window.ZedlyDialog.confirm(message, options);
            }
            return Promise.resolve(confirm(message));
        },

        // Initialize student tests page
        init: function () {
            this.setupEventListeners();
            this.loadAssignments();
        },

        // Setup event listeners
        setupEventListeners: function () {
            // Tab switching
            document.querySelectorAll('[data-tab]').forEach(tab => {
                tab.addEventListener('click', (e) => {
                    const tabName = e.currentTarget.dataset.tab;
                    this.switchTab(tabName);
                });
            });
        },

        // Switch tab
        switchTab: function (tabName) {
            this.currentTab = tabName;

            // Update active tab
            document.querySelectorAll('[data-tab]').forEach(tab => {
                tab.classList.remove('active');
                if (tab.dataset.tab === tabName) {
                    tab.classList.add('active');
                }
            });

            // Load content
            if (tabName === 'available') {
                this.loadAssignments();
            } else if (tabName === 'completed') {
                this.loadResults();
            }
        },

        // Load assignments from API
        loadAssignments: async function () {
            const container = document.getElementById('testsContainer');
            if (!container) return;

            // Show loading
            container.innerHTML = `
                <div style="text-align: center; padding: var(--spacing-3xl);">
                    <div class="spinner" style="display: inline-block;"></div>
                    <p style="margin-top: var(--spacing-lg); color: var(--text-secondary);">Loading tests...</p>
                </div>
            `;

            try {
                const token = localStorage.getItem('access_token');
                const response = await fetch('/api/student/assignments?status=all', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!response.ok) {
                    throw new Error('Failed to load assignments');
                }

                const data = await response.json();
                this.assignments = data.assignments;
                this.renderAssignments();
            } catch (error) {
                console.error('Load assignments error:', error);
                container.innerHTML = `
                    <div class="error-message">
                        <p>Failed to load tests. Please try again.</p>
                    </div>
                `;
            }
        },

        // Render assignments
        renderAssignments: function () {
            const container = document.getElementById('testsContainer');
            if (!container) return;

            if (this.assignments.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; padding: var(--spacing-3xl);">
                        <p style="color: var(--text-secondary);">No tests available at the moment.</p>
                    </div>
                `;
                return;
            }

            const now = new Date();

            // Group assignments by status
            const active = [];
            const upcoming = [];
            const expired = [];

            this.assignments.forEach(assignment => {
                const startDate = new Date(assignment.start_date);
                const endDate = new Date(assignment.end_date);

                if (now < startDate) {
                    upcoming.push(assignment);
                } else if (now > endDate) {
                    expired.push(assignment);
                } else {
                    active.push(assignment);
                }
            });

            let html = '';

            // Active tests
            if (active.length > 0) {
                html += '<div class="tests-section"><h3 class="section-title">Active Tests</h3>';
                html += '<div class="tests-grid">';
                active.forEach(assignment => {
                    html += this.renderTestCard(assignment, 'active');
                });
                html += '</div></div>';
            }

            // Upcoming tests
            if (upcoming.length > 0) {
                html += '<div class="tests-section"><h3 class="section-title">Upcoming Tests</h3>';
                html += '<div class="tests-grid">';
                upcoming.forEach(assignment => {
                    html += this.renderTestCard(assignment, 'upcoming');
                });
                html += '</div></div>';
            }

            // Expired tests
            if (expired.length > 0) {
                html += '<div class="tests-section"><h3 class="section-title">Past Tests</h3>';
                html += '<div class="tests-grid">';
                expired.forEach(assignment => {
                    html += this.renderTestCard(assignment, 'expired');
                });
                html += '</div></div>';
            }

            container.innerHTML = html;
        },

        // Render test card
        renderTestCard: function (assignment, status) {
            const attemptsLeft = assignment.max_attempts - assignment.attempts_made;
            const hasOngoing = assignment.ongoing_attempt_id !== null;
            const bestScore = assignment.best_score !== null ? parseFloat(assignment.best_score).toFixed(1) : null;
            const hasPendingGrading = assignment.has_pending_grading === true;
            const passed = bestScore !== null && bestScore >= assignment.passing_score;

            let actionButton = '';
            if (status === 'active') {
                if (hasOngoing) {
                    actionButton = `
                        <button class="btn btn-primary" onclick="StudentTestsManager.continueTest(${this.toJsArg(assignment.ongoing_attempt_id)})">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polygon points="5 3 19 12 5 21 5 3"></polygon>
                            </svg>
                            Continue Test
                        </button>
                    `;
                } else if (attemptsLeft > 0) {
                    actionButton = `
                        <button class="btn btn-primary" onclick="StudentTestsManager.startTest(${this.toJsArg(assignment.id)})">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polygon points="5 3 19 12 5 21 5 3"></polygon>
                            </svg>
                            Start Test
                        </button>
                    `;
                } else {
                    actionButton = '<span class="text-secondary">No attempts left</span>';
                }
            } else if (status === 'upcoming') {
                actionButton = `<button class="btn btn-outline" disabled>Starts ${this.formatDate(assignment.start_date)}</button>`;
            } else {
                actionButton = `
                    <button class="btn btn-outline" onclick="StudentTestsManager.viewResults(${this.toJsArg(assignment.id)})">
                        View Results
                    </button>
                `;
            }

            return `
                <div class="test-card ${status}">
                    <div class="test-card-header">
                        ${assignment.subject_name ? `
                            <span class="subject-badge" style="background-color: ${assignment.subject_color}20; color: ${assignment.subject_color};">
                                ${assignment.subject_name}
                            </span>
                        ` : ''}
                        <span class="status-badge status-${status}">${status.charAt(0).toUpperCase() + status.slice(1)}</span>
                    </div>
                    <div class="test-card-body">
                        <h3 class="test-title">${assignment.test_title}</h3>
                        <p class="test-class">${assignment.class_name}</p>
                        ${assignment.test_description ? `<p class="test-description">${assignment.test_description}</p>` : ''}

                        <div class="test-meta">
                            <div class="meta-item">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <polyline points="12 6 12 12 16 14"></polyline>
                                </svg>
                                ${assignment.duration_minutes} minutes
                            </div>
                            <div class="meta-item">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M9 11l3 3L22 4"></path>
                                    <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"></path>
                                </svg>
                                ${assignment.question_count} questions
                            </div>
                            <div class="meta-item">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M12 2v20M2 12h20"></path>
                                </svg>
                                ${assignment.passing_score}% to pass
                            </div>
                        </div>

                        <div class="test-progress">
                            <div class="progress-row">
                                <span>Attempts:</span>
                                <span>${assignment.attempts_made} / ${assignment.max_attempts}</span>
                            </div>
                            ${bestScore !== null ? `
                                <div class="progress-row">
                                    <span>Best Score:</span>
                                    <span class="${hasPendingGrading ? 'text-warning' : (passed ? 'text-success' : 'text-warning')}">
                                        ${hasPendingGrading ? '⏳ Pending Review' : bestScore + '%'}
                                    </span>
                                </div>
                            ` : ''}
                        </div>

                        ${status === 'active' ? `
                            <div class="test-deadline">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                    <line x1="16" y1="2" x2="16" y2="6"></line>
                                    <line x1="8" y1="2" x2="8" y2="6"></line>
                                    <line x1="3" y1="10" x2="21" y2="10"></line>
                                </svg>
                                Due: ${this.formatDate(assignment.end_date)}
                            </div>
                        ` : ''}
                    </div>
                    <div class="test-card-footer">
                        ${actionButton}
                    </div>
                </div>
            `;
        },

        // Format date
        formatDate: function (dateString) {
            const date = new Date(dateString);
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            return `${day}.${month}.${year} ${hours}:${minutes}`;
        },

        // Start test
        startTest: async function (assignmentId) {
            const confirmed = await this.askConfirm(
                'Вы уверены, что хотите начать тест? Таймер запустится сразу.',
                { title: 'Начать тест', okText: 'Начать', cancelText: 'Отмена' }
            );

            if (!confirmed) {
                return;
            }

            try {
                const token = localStorage.getItem('access_token');
                const response = await fetch('/api/student/attempts', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ assignment_id: assignmentId })
                });

                const data = await response.json();

                if (response.ok) {
                    // Redirect to test taking page
                    window.location.href = `/take-test.html?attempt_id=${data.attempt_id}`;
                } else {
                    await this.notify(data.message || 'Failed to start test');
                }
            } catch (error) {
                console.error('Start test error:', error);
                await this.notify('Failed to start test. Please try again.');
            }
        },

        // Continue test
        continueTest: function (attemptId) {
            window.location.href = `/take-test.html?attempt_id=${attemptId}`;
        },

        // View results
        viewResults: function (assignmentId) {
            window.location.href = `/test-results.html?assignment_id=${assignmentId}`;
        },

        // Load test results
        loadResults: async function () {
            const container = document.getElementById('testsContainer');
            if (!container) return;

            container.innerHTML = `
                <div style="text-align: center; padding: var(--spacing-3xl);">
                    <div class="spinner" style="display: inline-block;"></div>
                    <p style="margin-top: var(--spacing-lg); color: var(--text-secondary);">Loading results...</p>
                </div>
            `;

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
                this.renderResults(data.results);
            } catch (error) {
                console.error('Load results error:', error);
                container.innerHTML = `
                    <div class="error-message">
                        <p>Failed to load results. Please try again.</p>
                    </div>
                `;
            }
        },

        // Render results
        renderResults: function (results) {
            const container = document.getElementById('testsContainer');
            if (!container) return;

            if (results.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; padding: var(--spacing-3xl);">
                        <p style="color: var(--text-secondary);">No completed tests yet.</p>
                    </div>
                `;
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

            results.forEach(result => {
                const percentage = parseFloat(result.percentage);
                const statusClass = percentage >= 60 ? 'status-active' : 'status-warning';
                const statusText = percentage >= 60 ? 'Passed' : 'Failed';

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
                            <button class="btn-icon" onclick="StudentTestsManager.viewAttemptDetails(${this.toJsArg(result.attempt_id)})" title="View Details">
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

            container.innerHTML = html;
        },

        // View attempt details
        viewAttemptDetails: function (attemptId) {
            window.location.href = `/test-results.html?attempt_id=${attemptId}`;
        }
    };
})();
