// Users Management Component
(function () {
    'use strict';

    window.UsersManager = {
        currentPage: 1,
        limit: 10,
        searchTerm: '',
        roleFilter: 'all',

        // Initialize users page
        init: function () {
            this.loadUsers();
            this.setupEventListeners();
        },

        // Setup event listeners
        setupEventListeners: function () {
            // Search input
            const searchInput = document.getElementById('usersSearch');
            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    this.searchTerm = e.target.value;
                    this.currentPage = 1;
                    this.loadUsers();
                });
            }

            // Role filter
            const roleFilter = document.getElementById('roleFilter');
            if (roleFilter) {
                roleFilter.addEventListener('change', (e) => {
                    this.roleFilter = e.target.value;
                    this.currentPage = 1;
                    this.loadUsers();
                });
            }

            // Add user button
            const addBtn = document.getElementById('addUserBtn');
            if (addBtn) {
                addBtn.addEventListener('click', () => this.showUserModal());
            }
        },

        // Load users from API
        loadUsers: async function () {
            const container = document.getElementById('usersContainer');
            if (!container) return;

            // Show loading
            container.innerHTML = `
                <div style="text-align: center; padding: var(--spacing-3xl);">
                    <div class="spinner" style="display: inline-block;"></div>
                    <p style="margin-top: var(--spacing-lg); color: var(--text-secondary);">Loading users...</p>
                </div>
            `;

            try {
                const token = localStorage.getItem('access_token');
                const params = new URLSearchParams({
                    page: this.currentPage,
                    limit: this.limit,
                    search: this.searchTerm,
                    role: this.roleFilter
                });

                const response = await fetch(`/api/admin/users?${params}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!response.ok) {
                    throw new Error('Failed to load users');
                }

                const data = await response.json();
                this.renderUsers(data.users, data.pagination);
            } catch (error) {
                console.error('Load users error:', error);
                container.innerHTML = `
                    <div class="error-message">
                        <p>Failed to load users. Please try again.</p>
                    </div>
                `;
            }
        },

        // Render users table
        renderUsers: function (users, pagination) {
            const container = document.getElementById('usersContainer');
            if (!container) return;

            if (users.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; padding: var(--spacing-3xl);">
                        <p style="color: var(--text-secondary);">No users found.</p>
                    </div>
                `;
                return;
            }

            let html = `
                <div class="table-responsive">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Full Name</th>
                                <th>Username</th>
                                <th>Role</th>
                                <th>Contact</th>
                                <th>Status</th>
                                <th>Last Login</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            users.forEach(user => {
                const statusClass = user.is_active ? 'status-active' : 'status-inactive';
                const statusText = user.is_active ? 'Active' : 'Inactive';
                const roleLabel = this.getRoleLabel(user.role);
                const lastLogin = user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never';

                html += `
                    <tr>
                        <td>
                            <div class="user-name">${user.first_name} ${user.last_name}</div>
                        </td>
                        <td>${user.username}</td>
                        <td><span class="role-badge role-${user.role}">${roleLabel}</span></td>
                        <td>
                            ${user.email ? `<div>${user.email}</div>` : ''}
                            ${user.phone ? `<div class="text-secondary">${user.phone}</div>` : ''}
                        </td>
                        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                        <td class="text-secondary">${lastLogin}</td>
                        <td>
                            <div class="action-buttons">
                                <button class="btn-icon" onclick="UsersManager.editUser(${user.id})" title="Edit">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                    </svg>
                                </button>
                                <button class="btn-icon btn-danger" onclick="UsersManager.deleteUser(${user.id}, '${user.first_name} ${user.last_name}')" title="Delete">
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

        // Get role label
        getRoleLabel: function (role) {
            const labels = {
                'school_admin': 'School Admin',
                'teacher': 'Teacher',
                'student': 'Student'
            };
            return labels[role] || role;
        },

        // Render pagination
        renderPagination: function (pagination) {
            let html = '<div class="pagination">';

            if (pagination.page > 1) {
                html += `<button class="pagination-btn" onclick="UsersManager.goToPage(${pagination.page - 1})">Previous</button>`;
            }

            for (let i = 1; i <= pagination.pages; i++) {
                if (i === pagination.page) {
                    html += `<button class="pagination-btn active">${i}</button>`;
                } else {
                    html += `<button class="pagination-btn" onclick="UsersManager.goToPage(${i})">${i}</button>`;
                }
            }

            if (pagination.page < pagination.pages) {
                html += `<button class="pagination-btn" onclick="UsersManager.goToPage(${pagination.page + 1})">Next</button>`;
            }

            html += '</div>';
            return html;
        },

        // Go to page
        goToPage: function (page) {
            this.currentPage = page;
            this.loadUsers();
        },

        // Show user modal (create/edit)
        showUserModal: async function (userId = null) {
            const isEdit = userId !== null;
            let user = null;

            // Load user data if editing
            if (isEdit) {
                try {
                    const token = localStorage.getItem('access_token');
                    const response = await fetch(`/api/admin/users/${userId}`, {
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });

                    if (response.ok) {
                        const data = await response.json();
                        user = data.user;
                    } else {
                        alert('Failed to load user data');
                        return;
                    }
                } catch (error) {
                    console.error('Load user error:', error);
                    alert('Failed to load user data');
                    return;
                }
            }

            // Create modal HTML
            const modalHtml = `
                <div class="modal-overlay" id="userModal">
                    <div class="modal">
                        <div class="modal-header">
                            <h2 class="modal-title">${isEdit ? 'Edit User' : 'Add New User'}</h2>
                            <button class="modal-close" onclick="UsersManager.closeModal()">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </div>
                        <div class="modal-body">
                            <form id="userForm" onsubmit="UsersManager.submitUser(event, ${userId})">
                                <div class="form-row">
                                    <div class="form-group">
                                        <label class="form-label">
                                            First Name <span class="required">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            class="form-input"
                                            name="first_name"
                                            value="${user?.first_name || ''}"
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
                                            value="${user?.last_name || ''}"
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
                                            value="${user?.username || ''}"
                                            required
                                            placeholder="ivan.petrov"
                                            ${isEdit ? 'readonly' : ''}
                                        />
                                        <span class="form-hint">Только латинские буквы, цифры и точки</span>
                                    </div>

                                    <div class="form-group">
                                        <label class="form-label">
                                            Role <span class="required">*</span>
                                        </label>
                                        <select class="form-input" name="role" required>
                                            <option value="">Select role</option>
                                            <option value="school_admin" ${user?.role === 'school_admin' ? 'selected' : ''}>School Admin</option>
                                            <option value="teacher" ${user?.role === 'teacher' ? 'selected' : ''}>Teacher</option>
                                            <option value="student" ${user?.role === 'student' ? 'selected' : ''}>Student</option>
                                        </select>
                                    </div>
                                </div>

                                ${!isEdit ? `
                                <div class="form-group">
                                    <label class="form-label">Password</label>
                                    <input
                                        type="text"
                                        class="form-input"
                                        name="password"
                                        placeholder="Leave empty to auto-generate OTP"
                                    />
                                    <span class="form-hint">Auto-generated 8-character password will be shown after creation</span>
                                </div>
                                ` : ''}

                                <div class="form-row">
                                    <div class="form-group">
                                        <label class="form-label">Email</label>
                                        <input
                                            type="email"
                                            class="form-input"
                                            name="email"
                                            value="${user?.email || ''}"
                                            placeholder="user@example.uz"
                                        />
                                    </div>

                                    <div class="form-group">
                                        <label class="form-label">Phone</label>
                                        <input
                                            type="tel"
                                            class="form-input"
                                            name="phone"
                                            value="${user?.phone || ''}"
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
                                        value="${user?.telegram_id || ''}"
                                        placeholder="123456789"
                                    />
                                    <span class="form-hint">For Telegram notifications</span>
                                </div>

                                ${isEdit ? `
                                <div class="form-group">
                                    <div class="form-check">
                                        <input
                                            type="checkbox"
                                            class="form-check-input"
                                            id="userActive"
                                            name="is_active"
                                            ${user?.is_active ? 'checked' : ''}
                                        />
                                        <label class="form-check-label" for="userActive">
                                            Active
                                        </label>
                                    </div>
                                </div>
                                ` : ''}

                                <div id="formAlert" class="hidden"></div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-outline" onclick="UsersManager.closeModal()">
                                Cancel
                            </button>
                            <button type="submit" form="userForm" class="btn btn-primary" id="submitBtn">
                                ${isEdit ? 'Update User' : 'Create User'}
                            </button>
                        </div>
                    </div>
                </div>
            `;

            // Add modal to body
            document.body.insertAdjacentHTML('beforeend', modalHtml);

            // Close on overlay click
            document.getElementById('userModal').addEventListener('click', (e) => {
                if (e.target.id === 'userModal') {
                    this.closeModal();
                }
            });

            // Close on Escape key
            document.addEventListener('keydown', this.handleEscapeKey);
        },

        // Handle Escape key
        handleEscapeKey: function (e) {
            if (e.key === 'Escape') {
                UsersManager.closeModal();
            }
        },

        // Close modal
        closeModal: function () {
            const modal = document.getElementById('userModal');
            if (modal) {
                modal.remove();
            }
            document.removeEventListener('keydown', this.handleEscapeKey);
        },

        // Submit user form
        submitUser: async function (event, userId) {
            event.preventDefault();

            const form = event.target;
            const submitBtn = document.getElementById('submitBtn');
            const formAlert = document.getElementById('formAlert');

            // Get form data
            const formData = new FormData(form);
            const data = {
                first_name: formData.get('first_name').trim(),
                last_name: formData.get('last_name').trim(),
                username: formData.get('username').trim(),
                role: formData.get('role'),
                email: formData.get('email')?.trim() || null,
                phone: formData.get('phone')?.trim() || null,
                telegram_id: formData.get('telegram_id')?.trim() || null
            };

            if (!userId) {
                const password = formData.get('password')?.trim();
                if (password) {
                    data.password = password;
                }
            } else {
                data.is_active = formData.get('is_active') === 'on';
            }

            // Validation
            if (!data.first_name || !data.last_name || !data.username || !data.role) {
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
                const url = userId
                    ? `/api/admin/users/${userId}`
                    : '/api/admin/users';
                const method = userId ? 'PUT' : 'POST';

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
                    // Show success with OTP password if generated
                    if (result.otp_password) {
                        formAlert.className = 'alert alert-success';
                        formAlert.innerHTML = `
                            <strong>User created successfully!</strong><br>
                            <strong>Generated Password:</strong> <code style="background: rgba(0,0,0,0.1); padding: 4px 8px; border-radius: 4px; font-size: 1.1em;">${result.otp_password}</code><br>
                            <small>Please save this password - it won't be shown again!</small>
                        `;

                        // Change button to "Close"
                        submitBtn.textContent = 'Close';
                        submitBtn.onclick = () => {
                            this.closeModal();
                            this.loadUsers();
                        };
                    } else {
                        formAlert.className = 'alert alert-success';
                        formAlert.textContent = result.message;

                        // Reload users list
                        setTimeout(() => {
                            this.closeModal();
                            this.loadUsers();
                        }, 1000);
                    }
                } else {
                    // Show error
                    formAlert.className = 'alert alert-error';
                    formAlert.textContent = result.message || 'An error occurred';
                }
            } catch (error) {
                console.error('Submit user error:', error);
                formAlert.className = 'alert alert-error';
                formAlert.textContent = 'Network error. Please try again.';
            } finally {
                if (!formAlert.classList.contains('alert-success') || !formAlert.innerHTML.includes('Generated Password')) {
                    submitBtn.classList.remove('loading');
                    submitBtn.disabled = false;
                }
            }
        },

        // Edit user
        editUser: function (userId) {
            this.showUserModal(userId);
        },

        // Delete user
        deleteUser: async function (userId, userName) {
            if (!confirm(`Are you sure you want to deactivate "${userName}"?`)) {
                return;
            }

            try {
                const token = localStorage.getItem('access_token');
                const response = await fetch(`/api/admin/users/${userId}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (response.ok) {
                    this.loadUsers();
                } else {
                    alert('Failed to delete user');
                }
            } catch (error) {
                console.error('Delete user error:', error);
                alert('Failed to delete user');
            }
        }
    };
})();
