// Teacher Results Viewer
(function () {
    'use strict';

    window.TeacherResults = {
        assignmentId: null,
        assignment: null,
        results: [],
        filteredResults: [],

        // Initialize results viewer
        init: async function () {
            // Get assignment ID from URL
            const urlParams = new URLSearchParams(window.location.search);
            this.assignmentId = urlParams.get('assignment_id');

            if (!this.assignmentId) {
                this.showError('Invalid request. Missing assignment ID.');
                return;
            }

            // Load results
            await this.loadResults();

            // Setup search
            this.setupSearch();
        },

        // Load results from API
        loadResults: async function () {
            try {
                const token = localStorage.getItem('access_token');
                const response = await fetch(`/api/teacher/assignments/${this.assignmentId}/results`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!response.ok) {
                    throw new Error('Failed to load results');
                }

                const data = await response.json();
                this.assignment = data.assignment;
                this.results = data.results;
                this.filteredResults = [...this.results];

                // Render page
                this.renderResults();

            } catch (error) {
                console.error('Load results error:', error);
                this.showError(error.message || 'Failed to load results');
            }
        },

        // Render results
        renderResults: function () {
            // Hide loading, show content
            document.getElementById('loadingState').style.display = 'none';
            document.getElementById('resultsContent').style.display = 'block';

            // Update title
            document.getElementById('resultsTitle').textContent = `${this.assignment.test_title} - Results`;

            // Render info card
            this.renderInfoCard();

            // Render statistics
            this.renderStatistics();

            // Render table
            this.renderTable();
        },

        // Render assignment info card
        renderInfoCard: function () {
            document.getElementById('testTitle').textContent = this.assignment.test_title;

            const className = this.assignment.class_name || 'Unknown Class';
            const startDate = this.formatDate(this.assignment.start_date);
            const endDate = this.formatDate(this.assignment.end_date);

            document.getElementById('className').textContent = className;
            document.getElementById('dateRange').textContent = `${startDate} - ${endDate}`;
        },

        // Render statistics
        renderStatistics: function () {
            const totalStudents = this.assignment.total_students || 0;
            const completedCount = this.results.filter(r => r.is_completed).length;
            const pendingCount = totalStudents - completedCount;

            // Calculate average score
            const completedResults = this.results.filter(r => r.is_completed);
            const avgScore = completedResults.length > 0
                ? (completedResults.reduce((sum, r) => sum + parseFloat(r.percentage), 0) / completedResults.length).toFixed(1)
                : 0;

            document.getElementById('totalStudents').textContent = totalStudents;
            document.getElementById('completedCount').textContent = completedCount;
            document.getElementById('pendingCount').textContent = pendingCount;
            document.getElementById('avgScore').textContent = `${avgScore}%`;
        },

        // Render results table
        renderTable: function () {
            const container = document.getElementById('resultsTableContainer');

            if (this.filteredResults.length === 0) {
                container.innerHTML = '<div class="no-results">No results found.</div>';
                return;
            }

            let html = `
                <table class="results-table">
                    <thead>
                        <tr>
                            <th>Student Name</th>
                            <th>Status</th>
                            <th>Score</th>
                            <th>Percentage</th>
                            <th>Submitted At</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            this.filteredResults.forEach(result => {
                const statusClass = result.is_completed ? 'status-completed' : 'status-pending';
                const statusText = result.is_completed ? 'Completed' : 'Pending';
                const score = result.is_completed ? `${result.score} / ${result.max_score}` : '-';
                const percentage = result.is_completed ? `${parseFloat(result.percentage).toFixed(1)}%` : '-';
                const submittedAt = result.is_completed ? this.formatDateTime(result.submitted_at) : '-';

                // Determine pass/fail status
                const passed = result.is_completed && parseFloat(result.percentage) >= parseFloat(this.assignment.passing_score);
                const percentageClass = result.is_completed ? (passed ? 'percentage-passed' : 'percentage-failed') : '';

                html += `
                    <tr>
                        <td class="student-name">${result.student_name}</td>
                        <td>
                            <span class="status-badge ${statusClass}">${statusText}</span>
                        </td>
                        <td>${score}</td>
                        <td class="${percentageClass}">${percentage}</td>
                        <td>${submittedAt}</td>
                        <td>
                            ${result.is_completed ? `
                                <button class="btn-icon btn-view" onclick="TeacherResults.viewAttempt(${result.attempt_id})" title="View Details">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                        <circle cx="12" cy="12" r="3"></circle>
                                    </svg>
                                </button>
                            ` : '<span class="text-muted">-</span>'}
                        </td>
                    </tr>
                `;
            });

            html += `
                    </tbody>
                </table>
            `;

            container.innerHTML = html;
        },

        // Setup search functionality
        setupSearch: function () {
            const searchInput = document.getElementById('searchInput');
            searchInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase().trim();

                if (searchTerm === '') {
                    this.filteredResults = [...this.results];
                } else {
                    this.filteredResults = this.results.filter(result =>
                        result.student_name.toLowerCase().includes(searchTerm)
                    );
                }

                this.renderTable();
            });
        },

        // View specific attempt details
        viewAttempt: function (attemptId) {
            window.location.href = `/student-attempt.html?attempt_id=${attemptId}`;
        },

        // Export results to CSV
        exportResults: function () {
            if (this.results.length === 0) {
                alert('No results to export.');
                return;
            }

            // Prepare CSV data
            const headers = ['Student Name', 'Status', 'Score', 'Max Score', 'Percentage', 'Submitted At'];
            const rows = this.results.map(result => [
                result.student_name,
                result.is_completed ? 'Completed' : 'Pending',
                result.is_completed ? result.score : '-',
                result.is_completed ? result.max_score : '-',
                result.is_completed ? `${parseFloat(result.percentage).toFixed(1)}%` : '-',
                result.is_completed ? this.formatDateTime(result.submitted_at) : '-'
            ]);

            // Build CSV string
            let csvContent = headers.join(',') + '\n';
            rows.forEach(row => {
                csvContent += row.map(cell => `"${cell}"`).join(',') + '\n';
            });

            // Create download link
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);

            link.setAttribute('href', url);
            link.setAttribute('download', `${this.assignment.test_title}_results_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        },

        // Format date (DD.MM.YYYY)
        formatDate: function (dateString) {
            const date = new Date(dateString);
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            return `${day}.${month}.${year}`;
        },

        // Format date and time (DD.MM.YYYY HH:MM)
        formatDateTime: function (dateString) {
            const date = new Date(dateString);
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            return `${day}.${month}.${year} ${hours}:${minutes}`;
        },

        // Show error
        showError: function (message) {
            document.getElementById('loadingState').style.display = 'none';
            document.getElementById('resultsContent').style.display = 'none';
            document.getElementById('errorState').style.display = 'flex';
            document.getElementById('errorMessage').textContent = message;
        }
    };

    // Initialize on load
    document.addEventListener('DOMContentLoaded', () => {
        TeacherResults.init();
    });
})();
