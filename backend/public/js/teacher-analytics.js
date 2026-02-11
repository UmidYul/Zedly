// Teacher Class Analytics
(function () {
    'use strict';

    window.TeacherAnalytics = {
        classes: [],
        selectedClassId: null,

        init: async function () {
            this.bindEvents();
            await this.loadClasses();
        },

        bindEvents: function () {
            const select = document.getElementById('classAnalyticsSelect');
            if (select) {
                select.addEventListener('change', () => {
                    this.selectedClassId = select.value || null;
                    if (this.selectedClassId) {
                        this.loadAnalytics();
                    } else {
                        this.renderEmptyState('Select a class to view analytics.');
                    }
                });
            }

            const refreshBtn = document.getElementById('refreshAnalyticsBtn');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', () => {
                    if (this.selectedClassId) {
                        this.loadAnalytics();
                    }
                });
            }
        },

        loadClasses: async function () {
            const select = document.getElementById('classAnalyticsSelect');
            if (!select) return;

            select.innerHTML = '<option value="">Loading classes...</option>';

            try {
                const token = localStorage.getItem('access_token');
                const response = await fetch('/api/teacher/classes?limit=100', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!response.ok) {
                    throw new Error('Failed to load classes');
                }

                const data = await response.json();
                this.classes = data.classes || [];

                if (this.classes.length === 0) {
                    select.innerHTML = '<option value="">No classes available</option>';
                    this.renderEmptyState('No classes found for analytics.');
                    return;
                }

                select.innerHTML = '<option value="">Select class...</option>';
                this.classes.forEach(cls => {
                    const option = document.createElement('option');
                    option.value = cls.id;
                    option.textContent = `${cls.name} (${cls.grade_level} grade)`;
                    select.appendChild(option);
                });

                this.selectedClassId = this.classes[0].id;
                select.value = this.selectedClassId;
                await this.loadAnalytics();

            } catch (error) {
                console.error('Load classes error:', error);
                select.innerHTML = '<option value="">Failed to load classes</option>';
                this.renderEmptyState('Unable to load classes. Please try again.');
            }
        },

        loadAnalytics: async function () {
            if (!this.selectedClassId) return;

            this.renderLoading();

            try {
                const token = localStorage.getItem('access_token');
                const response = await fetch(`/api/teacher/classes/${this.selectedClassId}/analytics`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!response.ok) {
                    throw new Error('Failed to load class analytics');
                }

                const data = await response.json();
                this.renderAnalytics(data);
            } catch (error) {
                console.error('Load analytics error:', error);
                this.renderEmptyState(error.message || 'Unable to load analytics.');
            }
        },

        renderLoading: function () {
            const stats = document.getElementById('classAnalyticsStats');
            const assignments = document.getElementById('classAnalyticsAssignments');
            const notes = document.getElementById('classAnalyticsNotes');

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

            if (assignments) {
                assignments.innerHTML = '<p style="color: var(--text-secondary);">Loading assignments...</p>';
            }

            if (notes) {
                notes.innerHTML = '<p style="color: var(--text-secondary);">Fetching analytics data.</p>';
            }
        },

        renderEmptyState: function (message) {
            const stats = document.getElementById('classAnalyticsStats');
            const assignments = document.getElementById('classAnalyticsAssignments');
            const notes = document.getElementById('classAnalyticsNotes');

            if (stats) {
                stats.innerHTML = '';
            }

            if (assignments) {
                assignments.innerHTML = `<p style="color: var(--text-secondary);">${message}</p>`;
            }

            if (notes) {
                notes.innerHTML = '';
            }
        },

        renderAnalytics: function (data) {
            const stats = document.getElementById('classAnalyticsStats');
            const assignments = document.getElementById('classAnalyticsAssignments');
            const notes = document.getElementById('classAnalyticsNotes');

            const summary = data.stats || {};
            const avgScore = summary.avg_percentage !== null && summary.avg_percentage !== undefined
                ? `${parseFloat(summary.avg_percentage).toFixed(1)}%`
                : '-';

            if (stats) {
                stats.innerHTML = `
                    <div class="stat-card">
                        <div class="stat-content">
                            <div class="stat-label">Students</div>
                            <div class="stat-value">${summary.student_count || 0}</div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-content">
                            <div class="stat-label">Active Assignments</div>
                            <div class="stat-value">${summary.active_assignments || 0}</div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-content">
                            <div class="stat-label">Completed Attempts</div>
                            <div class="stat-value">${summary.completed_attempts || 0}</div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-content">
                            <div class="stat-label">Average Score</div>
                            <div class="stat-value">${avgScore}</div>
                        </div>
                    </div>
                `;
            }

            if (assignments) {
                const list = data.assignments || [];
                if (list.length === 0) {
                    assignments.innerHTML = '<p style="color: var(--text-secondary);">No assignments found for this class.</p>';
                } else {
                    assignments.innerHTML = this.renderAssignmentsTable(list);
                }
            }

            if (notes) {
                const classInfo = data.class || {};
                notes.innerHTML = `
                    <div class="section-header">
                        <h2 class="section-title">Class Notes</h2>
                    </div>
                    <p style="color: var(--text-secondary);">
                        ${classInfo.name || 'Class'} · Grade ${classInfo.grade_level || '-'} · Academic year ${classInfo.academic_year || '-'}
                    </p>
                `;
            }
        },

        renderAssignmentsTable: function (assignments) {
            let html = `
                <div class="table-responsive">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Test</th>
                                <th>Window</th>
                                <th>Status</th>
                                <th>Completed</th>
                                <th>Average</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            assignments.forEach(item => {
                const windowText = `${this.formatDate(item.start_date)} - ${this.formatDate(item.end_date)}`;
                const statusText = this.getStatusLabel(item);
                const statusClass = item.is_active ? 'status-active' : 'status-inactive';
                const avg = item.avg_percentage !== null && item.avg_percentage !== undefined
                    ? `${parseFloat(item.avg_percentage).toFixed(1)}%`
                    : '-';
                const completed = `${item.completed_attempts || 0} / ${item.total_attempts || 0}`;

                html += `
                    <tr>
                        <td>${item.test_title}</td>
                        <td>${windowText}</td>
                        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                        <td>${completed}</td>
                        <td>${avg}</td>
                        <td>
                            <button class="btn-icon" onclick="window.location.href='/teacher-results.html?assignment_id='+'${item.id}'" title="View Results">
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

            return html;
        },

        getStatusLabel: function (assignment) {
            const now = new Date();
            const startDate = assignment.start_date ? new Date(assignment.start_date) : null;
            const endDate = assignment.end_date ? new Date(assignment.end_date) : null;

            if (!assignment.is_active) {
                return 'Inactive';
            }

            if (startDate && now < startDate) {
                return 'Upcoming';
            }

            if (endDate && now > endDate) {
                return 'Completed';
            }

            return 'Active';
        },

        formatDate: function (dateString) {
            if (!dateString) return '-';
            const date = new Date(dateString);
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            return `${day}.${month}.${year}`;
        }
    };
})();
