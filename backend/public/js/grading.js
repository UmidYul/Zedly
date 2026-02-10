// Manual Grading Queue Manager
(function () {
    'use strict';

    window.GradingQueue = {
        attempts: [],
        filteredAttempts: [],

        // Initialize
        init: async function () {
            await this.loadPendingAttempts();
            this.setupSearch();
        },

        // Load pending attempts
        loadPendingAttempts: async function () {
            try {
                const token = localStorage.getItem('access_token');
                const response = await fetch('/api/teacher/grading/pending', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!response.ok) {
                    throw new Error('Failed to load pending attempts');
                }

                const data = await response.json();
                this.attempts = data.attempts || [];
                this.filteredAttempts = [...this.attempts];

                // Hide loading
                document.getElementById('loadingState').style.display = 'none';

                if (this.attempts.length === 0) {
                    // Show empty state
                    document.getElementById('emptyState').style.display = 'flex';
                } else {
                    // Show content
                    document.getElementById('resultsContent').style.display = 'block';
                    this.renderAttempts();
                }

            } catch (error) {
                console.error('Load pending attempts error:', error);
                this.showError(error.message || 'Failed to load pending grading');
            }
        },

        // Render attempts table
        renderAttempts: function () {
            const container = document.getElementById('gradingTableContainer');

            // Update count
            document.getElementById('pendingCount').textContent =
                `${this.filteredAttempts.length} attempt${this.filteredAttempts.length !== 1 ? 's' : ''} waiting for review`;

            if (this.filteredAttempts.length === 0) {
                container.innerHTML = '<div class="no-results">No attempts match your search.</div>';
                return;
            }

            let html = `
                <table class="results-table">
                    <thead>
                        <tr>
                            <th>Student Name</th>
                            <th>Test Title</th>
                            <th>Class</th>
                            <th>Submitted At</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            this.filteredAttempts.forEach(attempt => {
                const submittedAt = this.formatDateTime(attempt.submitted_at);

                html += `
                    <tr>
                        <td class="student-name">${attempt.student_name}</td>
                        <td>${attempt.test_title}</td>
                        <td>${attempt.class_name}</td>
                        <td>${submittedAt}</td>
                        <td>
                            <button class="btn-icon btn-primary" onclick="GradingQueue.gradeAttempt(${attempt.attempt_id})" title="Grade Now">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                            </button>
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

        // Setup search
        setupSearch: function () {
            const searchInput = document.getElementById('searchInput');
            searchInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase().trim();

                if (searchTerm === '') {
                    this.filteredAttempts = [...this.attempts];
                } else {
                    this.filteredAttempts = this.attempts.filter(attempt =>
                        attempt.student_name.toLowerCase().includes(searchTerm) ||
                        attempt.test_title.toLowerCase().includes(searchTerm) ||
                        attempt.class_name.toLowerCase().includes(searchTerm)
                    );
                }

                this.renderAttempts();
            });
        },

        // Navigate to grading page
        gradeAttempt: function (attemptId) {
            window.location.href = `/grade-attempt.html?attempt_id=${attemptId}`;
        },

        // Format date and time
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
            document.getElementById('emptyState').style.display = 'none';
            document.getElementById('errorState').style.display = 'flex';
            document.getElementById('errorMessage').textContent = message;
        }
    };

    // Initialize on load
    document.addEventListener('DOMContentLoaded', () => {
        GradingQueue.init();
    });
})();
