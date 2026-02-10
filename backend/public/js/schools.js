// Schools Management Component
(function () {
    'use strict';

    window.SchoolsManager = {
        currentPage: 1,
        limit: 10,
        searchTerm: '',
        statusFilter: 'all',

        // Initialize schools page
        init: function () {
            this.loadSchools();
            this.setupEventListeners();
        },

        // Setup event listeners
        setupEventListeners: function () {
            // Search input
            const searchInput = document.getElementById('schoolsSearch');
            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    this.searchTerm = e.target.value;
                    this.currentPage = 1;
                    this.loadSchools();
                });
            }

            // Status filter
            const statusFilter = document.getElementById('statusFilter');
            if (statusFilter) {
                statusFilter.addEventListener('change', (e) => {
                    this.statusFilter = e.target.value;
                    this.currentPage = 1;
                    this.loadSchools();
                });
            }

            // Add school button
            const addBtn = document.getElementById('addSchoolBtn');
            if (addBtn) {
                addBtn.addEventListener('click', () => this.showSchoolModal());
            }
        },

        // Load schools from API
        loadSchools: async function () {
            const container = document.getElementById('schoolsContainer');
            if (!container) return;

            // Show loading
            container.innerHTML = `
                <div style="text-align: center; padding: var(--spacing-3xl);">
                    <div class="spinner" style="display: inline-block;"></div>
                    <p style="margin-top: var(--spacing-lg); color: var(--text-secondary);">Loading schools...</p>
                </div>
            `;

            try {
                const token = localStorage.getItem('access_token');
                const params = new URLSearchParams({
                    page: this.currentPage,
                    limit: this.limit,
                    search: this.searchTerm,
                    status: this.statusFilter
                });

                const response = await fetch(`/api/superadmin/schools?${params}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!response.ok) {
                    throw new Error('Failed to load schools');
                }

                const data = await response.json();
                this.renderSchools(data.schools, data.pagination);
            } catch (error) {
                console.error('Load schools error:', error);
                container.innerHTML = `
                    <div class="error-message">
                        <p>Failed to load schools. Please try again.</p>
                    </div>
                `;
            }
        },

        // Render schools table
        renderSchools: function (schools, pagination) {
            const container = document.getElementById('schoolsContainer');
            if (!container) return;

            if (schools.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; padding: var(--spacing-3xl);">
                        <p style="color: var(--text-secondary);">No schools found.</p>
                    </div>
                `;
                return;
            }

            let html = `
                <div class="table-responsive">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>School Name</th>
                                <th>Address</th>
                                <th>Contact</th>
                                <th>Users</th>
                                <th>Classes</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            schools.forEach(school => {
                const statusClass = school.is_active ? 'status-active' : 'status-inactive';
                const statusText = school.is_active ? 'Active' : 'Inactive';

                html += `
                    <tr>
                        <td>
                            <div class="school-name">${school.name}</div>
                        </td>
                        <td>${school.address || '-'}</td>
                        <td>
                            ${school.phone ? `<div>${school.phone}</div>` : ''}
                            ${school.email ? `<div class="text-secondary">${school.email}</div>` : ''}
                        </td>
                        <td>${school.user_count || 0}</td>
                        <td>${school.class_count || 0}</td>
                        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                        <td>
                            <div class="action-buttons">
                                <button class="btn-icon" onclick="SchoolsManager.editSchool(${school.id})" title="Edit">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                    </svg>
                                </button>
                                <button class="btn-icon btn-danger" onclick="SchoolsManager.deleteSchool(${school.id}, '${school.name}')" title="Delete">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <polyline points="3 6 5 6 21 6"></polyline>
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                    </svg>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            });

            html += `
                        </tbody>
                    </table>
                </div>
            `;

            // Add pagination
            if (pagination.pages > 1) {
                html += this.renderPagination(pagination);
            }

            container.innerHTML = html;
        },

        // Render pagination
        renderPagination: function (pagination) {
            let html = '<div class="pagination">';

            // Previous button
            if (pagination.page > 1) {
                html += `<button class="pagination-btn" onclick="SchoolsManager.goToPage(${pagination.page - 1})">Previous</button>`;
            }

            // Page numbers
            for (let i = 1; i <= pagination.pages; i++) {
                if (i === pagination.page) {
                    html += `<button class="pagination-btn active">${i}</button>`;
                } else {
                    html += `<button class="pagination-btn" onclick="SchoolsManager.goToPage(${i})">${i}</button>`;
                }
            }

            // Next button
            if (pagination.page < pagination.pages) {
                html += `<button class="pagination-btn" onclick="SchoolsManager.goToPage(${pagination.page + 1})">Next</button>`;
            }

            html += '</div>';
            return html;
        },

        // Go to page
        goToPage: function (page) {
            this.currentPage = page;
            this.loadSchools();
        },

        // Show school modal (create/edit)
        showSchoolModal: function (schoolId = null) {
            // Will implement modal later
            alert('School modal will be implemented next');
        },

        // Edit school
        editSchool: function (schoolId) {
            this.showSchoolModal(schoolId);
        },

        // Delete school
        deleteSchool: async function (schoolId, schoolName) {
            if (!confirm(`Are you sure you want to deactivate "${schoolName}"?`)) {
                return;
            }

            try {
                const token = localStorage.getItem('access_token');
                const response = await fetch(`/api/superadmin/schools/${schoolId}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (response.ok) {
                    this.loadSchools();
                } else {
                    alert('Failed to delete school');
                }
            } catch (error) {
                console.error('Delete school error:', error);
                alert('Failed to delete school');
            }
        }
    };
})();
