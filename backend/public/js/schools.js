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
        showSchoolModal: async function (schoolId = null) {
            const isEdit = schoolId !== null;
            let school = null;

            // Load school data if editing
            if (isEdit) {
                try {
                    const token = localStorage.getItem('access_token');
                    const response = await fetch(`/api/superadmin/schools/${schoolId}`, {
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });

                    if (response.ok) {
                        const data = await response.json();
                        school = data.school;
                    } else {
                        alert('Failed to load school data');
                        return;
                    }
                } catch (error) {
                    console.error('Load school error:', error);
                    alert('Failed to load school data');
                    return;
                }
            }

            // Create modal HTML
            const modalHtml = `
                <div class="modal-overlay" id="schoolModal">
                    <div class="modal">
                        <div class="modal-header">
                            <h2 class="modal-title">${isEdit ? 'Edit School' : 'Add New School'}</h2>
                            <button class="modal-close" onclick="SchoolsManager.closeModal()">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </div>
                        <div class="modal-body">
                            <form id="schoolForm" onsubmit="SchoolsManager.submitSchool(event, ${schoolId})">
                                <div class="form-group">
                                    <label class="form-label">
                                        School Name <span class="required">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        class="form-input"
                                        id="schoolName"
                                        name="name"
                                        value="${school?.name || ''}"
                                        required
                                        placeholder="Enter school name"
                                    />
                                    <span class="form-error hidden" id="nameError"></span>
                                </div>

                                <div class="form-group">
                                    <label class="form-label">Address</label>
                                    <textarea
                                        class="form-textarea"
                                        id="schoolAddress"
                                        name="address"
                                        placeholder="Enter school address"
                                    >${school?.address || ''}</textarea>
                                </div>

                                <div class="form-row">
                                    <div class="form-group">
                                        <label class="form-label">Phone</label>
                                        <input
                                            type="tel"
                                            class="form-input"
                                            id="schoolPhone"
                                            name="phone"
                                            value="${school?.phone || ''}"
                                            placeholder="+998901234567"
                                        />
                                    </div>

                                    <div class="form-group">
                                        <label class="form-label">Email</label>
                                        <input
                                            type="email"
                                            class="form-input"
                                            id="schoolEmail"
                                            name="email"
                                            value="${school?.email || ''}"
                                            placeholder="school@example.uz"
                                        />
                                    </div>
                                </div>

                                ${isEdit ? `
                                <div class="form-group">
                                    <div class="form-check">
                                        <input
                                            type="checkbox"
                                            class="form-check-input"
                                            id="schoolActive"
                                            name="is_active"
                                            ${school?.is_active ? 'checked' : ''}
                                        />
                                        <label class="form-check-label" for="schoolActive">
                                            Active
                                        </label>
                                    </div>
                                </div>
                                ` : ''}

                                <div id="formAlert" class="hidden"></div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-outline" onclick="SchoolsManager.closeModal()">
                                Cancel
                            </button>
                            <button type="submit" form="schoolForm" class="btn btn-primary" id="submitBtn">
                                ${isEdit ? 'Update School' : 'Create School'}
                            </button>
                        </div>
                    </div>
                </div>
            `;

            // Add modal to body
            document.body.insertAdjacentHTML('beforeend', modalHtml);

            // Close on overlay click
            document.getElementById('schoolModal').addEventListener('click', (e) => {
                if (e.target.id === 'schoolModal') {
                    this.closeModal();
                }
            });

            // Close on Escape key
            document.addEventListener('keydown', this.handleEscapeKey);
        },

        // Handle Escape key
        handleEscapeKey: function (e) {
            if (e.key === 'Escape') {
                SchoolsManager.closeModal();
            }
        },

        // Close modal
        closeModal: function () {
            const modal = document.getElementById('schoolModal');
            if (modal) {
                modal.remove();
            }
            document.removeEventListener('keydown', this.handleEscapeKey);
        },

        // Submit school form
        submitSchool: async function (event, schoolId) {
            event.preventDefault();

            const form = event.target;
            const submitBtn = document.getElementById('submitBtn');
            const formAlert = document.getElementById('formAlert');

            // Get form data
            const formData = new FormData(form);
            const data = {
                name: formData.get('name').trim(),
                address: formData.get('address')?.trim() || null,
                phone: formData.get('phone')?.trim() || null,
                email: formData.get('email')?.trim() || null
            };

            if (schoolId) {
                data.is_active = formData.get('is_active') === 'on';
            }

            // Validation
            if (!data.name) {
                this.showFormError('nameError', 'School name is required');
                return;
            }

            if (data.email && !this.validateEmail(data.email)) {
                this.showFormError('emailError', 'Invalid email format');
                return;
            }

            // Show loading
            submitBtn.classList.add('loading');
            submitBtn.disabled = true;
            formAlert.className = 'hidden';

            try {
                const token = localStorage.getItem('access_token');
                const url = schoolId
                    ? `/api/superadmin/schools/${schoolId}`
                    : '/api/superadmin/schools';
                const method = schoolId ? 'PUT' : 'POST';

                const response = await fetch(url, {
                    method,
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                });

                const result = await response.json();

                if (response.ok) {
                    // Show success message
                    formAlert.className = 'alert alert-success';
                    formAlert.textContent = result.message;

                    // Reload schools list
                    setTimeout(() => {
                        this.closeModal();
                        this.loadSchools();
                    }, 1000);
                } else {
                    // Show error
                    formAlert.className = 'alert alert-error';
                    formAlert.textContent = result.message || 'An error occurred';
                }
            } catch (error) {
                console.error('Submit school error:', error);
                formAlert.className = 'alert alert-error';
                formAlert.textContent = 'Network error. Please try again.';
            } finally {
                submitBtn.classList.remove('loading');
                submitBtn.disabled = false;
            }
        },

        // Show form error
        showFormError: function (errorId, message) {
            const errorEl = document.getElementById(errorId);
            if (errorEl) {
                errorEl.textContent = message;
                errorEl.classList.remove('hidden');

                // Add error class to input
                const input = errorEl.previousElementSibling;
                if (input) {
                    input.classList.add('error');
                }
            }
        },

        // Validate email
        validateEmail: function (email) {
            const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return re.test(email);
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
