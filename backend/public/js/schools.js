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
                // Escape school name for HTML attributes
                const escapedName = school.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');

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
                                <button class="btn-icon" onclick="SchoolsManager.manageAdmins('${school.id}', '${escapedName}')" title="Manage Admins">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                                        <circle cx="9" cy="7" r="4"/>
                                        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
                                    </svg>
                                </button>
                                <button class="btn-icon" onclick="SchoolsManager.editSchool(${school.id})" title="Edit">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                    </svg>
                                </button>
                                <button class="btn-icon btn-danger" onclick="SchoolsManager.deleteSchool('${school.id}', '${escapedName}')" title="Delete">
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
        },

        // Manage school administrators
        manageAdmins: async function (schoolId, schoolName) {
            try {
                const token = localStorage.getItem('access_token');
                const response = await fetch(`/api/superadmin/schools/${schoolId}/admins`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!response.ok) {
                    throw new Error('Failed to load school admins');
                }

                const data = await response.json();
                this.showAdminsModal(schoolId, schoolName, data.admins);
            } catch (error) {
                console.error('Load school admins error:', error);
                alert('Failed to load school administrators');
            }
        },

        // Show admins modal
        showAdminsModal: function (schoolId, schoolName, admins) {
            let adminsHtml = '';

            if (admins.length === 0) {
                adminsHtml = `
                    <div style="text-align: center; padding: var(--spacing-xl); color: var(--text-secondary);">
                        No administrators assigned to this school yet.
                    </div>
                `;
            } else {
                adminsHtml = `
                    <div class="table-responsive">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Username</th>
                                    <th>Contact</th>
                                    <th>Status</th>
                                    <th>Last Login</th>
                                </tr>
                            </thead>
                            <tbody>
                `;

                admins.forEach(admin => {
                    const statusClass = admin.is_active ? 'status-active' : 'status-inactive';
                    const statusText = admin.is_active ? 'Active' : 'Inactive';
                    const lastLogin = admin.last_login ? new Date(admin.last_login).toLocaleDateString() : 'Never';

                    adminsHtml += `
                        <tr>
                            <td>
                                <div class="user-name">${admin.first_name} ${admin.last_name}</div>
                            </td>
                            <td>${admin.username}</td>
                            <td>
                                ${admin.email ? `<div>${admin.email}</div>` : ''}
                                ${admin.phone ? `<div class="text-secondary">${admin.phone}</div>` : ''}
                            </td>
                            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                            <td class="text-secondary">${lastLogin}</td>
                        </tr>
                    `;
                });

                adminsHtml += `
                            </tbody>
                        </table>
                    </div>
                `;
            }

            const modalHtml = `
                <div class="modal-overlay" id="adminsModal">
                    <div class="modal modal-large">
                        <div class="modal-header">
                            <h2 class="modal-title">School Administrators - ${schoolName}</h2>
                            <button class="modal-close" onclick="SchoolsManager.closeAdminsModal()">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </div>
                        <div class="modal-body">
                            ${adminsHtml}
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-outline" onclick="SchoolsManager.closeAdminsModal()">
                                Close
                            </button>
                            <button type="button" class="btn btn-primary" onclick="SchoolsManager.showAdminModal(${schoolId}, '${schoolName}')">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;">
                                    <line x1="12" y1="5" x2="12" y2="19"></line>
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                </svg>
                                Add Administrator
                            </button>
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);

            // Close on overlay click
            document.getElementById('adminsModal').addEventListener('click', (e) => {
                if (e.target.id === 'adminsModal') {
                    this.closeAdminsModal();
                }
            });

            // Close on Escape key
            document.addEventListener('keydown', this.handleAdminsEscapeKey);
        },

        // Handle Escape key for admins modal
        handleAdminsEscapeKey: function (e) {
            if (e.key === 'Escape') {
                SchoolsManager.closeAdminsModal();
            }
        },

        // Close admins modal
        closeAdminsModal: function () {
            const modal = document.getElementById('adminsModal');
            if (modal) {
                modal.remove();
            }
            document.removeEventListener('keydown', this.handleAdminsEscapeKey);
        },

        // Show admin modal (create new admin)
        showAdminModal: function (schoolId, schoolName) {
            const modalHtml = `
                <div class="modal-overlay" id="adminModal">
                    <div class="modal">
                        <div class="modal-header">
                            <h2 class="modal-title">Add School Administrator - ${schoolName}</h2>
                            <button class="modal-close" onclick="SchoolsManager.closeAdminModal()">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </div>
                        <div class="modal-body">
                            <form id="adminForm" onsubmit="SchoolsManager.submitAdmin(event, ${schoolId}, '${schoolName}')">
                                <div class="form-row">
                                    <div class="form-group">
                                        <label class="form-label">
                                            First Name <span class="required">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            class="form-input"
                                            name="first_name"
                                            required
                                            placeholder="Иван"
                                        />
                                    </div>

                                    <div class="form-group">
                                        <label class="form-label">
                                            Last Name <span class="required">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            class="form-input"
                                            name="last_name"
                                            required
                                            placeholder="Петров"
                                        />
                                    </div>
                                </div>

                                <div class="form-row">
                                    <div class="form-group">
                                        <label class="form-label">
                                            Username <span class="required">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            class="form-input"
                                            name="username"
                                            required
                                            placeholder="ivan.petrov"
                                        />
                                        <span class="form-hint">Только латинские буквы, цифры и точки</span>
                                    </div>

                                    <div class="form-group">
                                        <label class="form-label">Password (Optional)</label>
                                        <input
                                            type="text"
                                            class="form-input"
                                            name="password"
                                            placeholder="Leave empty to auto-generate"
                                        />
                                        <span class="form-hint">Auto-generated 8-character password will be shown after creation</span>
                                    </div>
                                </div>

                                <div class="form-row">
                                    <div class="form-group">
                                        <label class="form-label">Email</label>
                                        <input
                                            type="email"
                                            class="form-input"
                                            name="email"
                                            placeholder="admin@example.uz"
                                        />
                                    </div>

                                    <div class="form-group">
                                        <label class="form-label">Phone</label>
                                        <input
                                            type="tel"
                                            class="form-input"
                                            name="phone"
                                            placeholder="+998901234567"
                                        />
                                    </div>
                                </div>

                                <div class="form-group">
                                    <label class="form-label">Telegram ID</label>
                                    <input
                                        type="text"
                                        class="form-input"
                                        name="telegram_id"
                                        placeholder="123456789"
                                    />
                                    <span class="form-hint">For Telegram notifications</span>
                                </div>

                                <div id="formAlert" class="hidden"></div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-outline" onclick="SchoolsManager.closeAdminModal()">
                                Cancel
                            </button>
                            <button type="submit" form="adminForm" class="btn btn-primary" id="submitAdminBtn">
                                Create Administrator
                            </button>
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);

            // Close on overlay click
            document.getElementById('adminModal').addEventListener('click', (e) => {
                if (e.target.id === 'adminModal') {
                    this.closeAdminModal();
                }
            });

            // Close on Escape key
            document.addEventListener('keydown', this.handleAdminEscapeKey);
        },

        // Handle Escape key for admin modal
        handleAdminEscapeKey: function (e) {
            if (e.key === 'Escape') {
                SchoolsManager.closeAdminModal();
            }
        },

        // Close admin modal
        closeAdminModal: function () {
            const modal = document.getElementById('adminModal');
            if (modal) {
                modal.remove();
            }
            document.removeEventListener('keydown', this.handleAdminEscapeKey);
        },

        // Submit admin form
        submitAdmin: async function (event, schoolId, schoolName) {
            event.preventDefault();

            const form = event.target;
            const submitBtn = document.getElementById('submitAdminBtn');
            const formAlert = document.getElementById('formAlert');

            // Get form data
            const formData = new FormData(form);
            const data = {
                first_name: formData.get('first_name')?.trim(),
                last_name: formData.get('last_name')?.trim(),
                username: formData.get('username')?.trim(),
                email: formData.get('email')?.trim() || null,
                phone: formData.get('phone')?.trim() || null,
                telegram_id: formData.get('telegram_id')?.trim() || null,
                password: formData.get('password')?.trim() || null
            };

            // Validation
            if (!data.first_name || !data.last_name || !data.username) {
                formAlert.className = 'alert alert-error';
                formAlert.textContent = 'Please fill all required fields';
                return;
            }

            // Show loading
            submitBtn.classList.add('loading');
            submitBtn.disabled = true;
            formAlert.className = 'hidden';

            try {
                const token = localStorage.getItem('access_token');
                const response = await fetch(`/api/superadmin/schools/${schoolId}/admins`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                });

                const result = await response.json();

                if (response.ok) {
                    // Show success with OTP password if generated
                    if (result.otp_password) {
                        formAlert.className = 'alert alert-success';
                        formAlert.innerHTML = `
                            <strong>Administrator created successfully!</strong><br>
                            <strong>Generated Password:</strong> <code style="background: rgba(0,0,0,0.1); padding: 4px 8px; border-radius: 4px; font-size: 1.1em;">${result.otp_password}</code><br>
                            <small>Please save this password - it won't be shown again!</small>
                        `;

                        // Change button to "Close"
                        submitBtn.textContent = 'Close';
                        submitBtn.onclick = () => {
                            this.closeAdminModal();
                            // Refresh admins modal
                            this.closeAdminsModal();
                            this.manageAdmins(schoolId, schoolName);
                        };
                    } else {
                        formAlert.className = 'alert alert-success';
                        formAlert.textContent = result.message;

                        // Refresh admins list
                        setTimeout(() => {
                            this.closeAdminModal();
                            this.closeAdminsModal();
                            this.manageAdmins(schoolId, schoolName);
                        }, 1000);
                    }
                } else {
                    // Show error
                    formAlert.className = 'alert alert-error';
                    formAlert.textContent = result.message || 'An error occurred';
                }
            } catch (error) {
                console.error('Submit admin error:', error);
                formAlert.className = 'alert alert-error';
                formAlert.textContent = 'Network error. Please try again.';
            } finally {
                if (!formAlert.classList.contains('alert-success') || !formAlert.innerHTML.includes('Generated Password')) {
                    submitBtn.classList.remove('loading');
                    submitBtn.disabled = false;
                }
            }
        }
    };
})();
