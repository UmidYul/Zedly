// Users Management Component
(function () {
    'use strict';

    window.UsersManager = {
        currentPage: 1,
        limit: 10,
        searchTerm: '',
        roleFilter: 'all',

        // Show custom alert modal
        showAlertModal: function (message, title = 'Info') {
            // Remove existing alert modal if present
            const existing = document.getElementById('alertModal');
            if (existing) existing.remove();
            const html = `
                        <div class="modal-overlay" id="alertModal">
                            <div class="modal-content" style="max-width: 400px;">
                                <div class="modal-header">
                                    <h2 class="modal-title">${title}</h2>
                                </div>
                                <div class="modal-body" style="text-align:center;">
                                    <div style="margin-bottom:1.5rem; font-size:1.1em;">${message}</div>
                                    <button class="btn btn-primary" id="closeAlertModalBtn">OK</button>
                                </div>
                            </div>
                        </div>
                    `;
            document.body.insertAdjacentHTML('beforeend', html);
            document.getElementById('closeAlertModalBtn').onclick = () => {
                document.getElementById('alertModal').remove();
            };
        },

        confirmAction: async function (message, title = 'Подтверждение') {
            if (window.ZedlyDialog?.confirm) {
                return window.ZedlyDialog.confirm(message, { title });
            }
            return confirm(message);
        },

        showTempPasswordModal: function ({ title, subtitle, password, onClose }) {
            const existing = document.getElementById('tempPasswordModal');
            if (existing) existing.remove();

            const html = `
                <div class="modal-overlay" id="tempPasswordModal">
                    <div class="modal-content temp-password-modal">
                        <div class="modal-header">
                            <h3>${title}</h3>
                            <button class="modal-close" id="tempPasswordCloseBtn">&times;</button>
                        </div>
                        <div class="modal-body">
                            <p>${subtitle}</p>
                            <div class="otp-display otp-display-reset">
                                <label class="otp-label">Временный пароль</label>
                                <div class="otp-field-wrap">
                                    <input class="otp-field" id="tempPasswordField" type="text" readonly value="${password}">
                                    <button class="btn btn-primary" id="copyTempPasswordBtn">
                                        ${window.ZedlyI18n?.translate('users.copyPassword') || 'Скопировать'}
                                    </button>
                                </div>
                            </div>
                            <p class="warning-text">${window.ZedlyI18n?.translate('users.userMustChangePassword') || 'Пользователь должен сменить пароль при входе.'}</p>
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', html);

            const close = () => {
                const modal = document.getElementById('tempPasswordModal');
                if (modal) modal.remove();
                if (typeof onClose === 'function') onClose();
            };

            document.getElementById('tempPasswordCloseBtn')?.addEventListener('click', close);
            document.getElementById('tempPasswordModal')?.addEventListener('click', (e) => {
                if (e.target.id === 'tempPasswordModal') close();
            });
            document.getElementById('copyTempPasswordBtn')?.addEventListener('click', () => this.copyTempPasswordFromModal());
        },

        copyTempPasswordFromModal: async function () {
            const input = document.getElementById('tempPasswordField');
            if (!input) return;
            await this.copyOTP(input.value);
        },

        // Initialize users page
        init: function () {
            this.currentPage = 1; // Reset to first page
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
                                <button class="btn-icon" onclick="UsersManager.resetPassword('${user.id}', '${user.first_name} ${user.last_name}')" title="Reset Password">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                    </svg>
                                </button>
                                <button class="btn-icon" onclick="UsersManager.editUser('${user.id}')" title="Edit">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                    </svg>
                                </button>
                                <button class="btn-icon btn-danger" onclick="UsersManager.deleteUser('${user.id}', '${user.first_name} ${user.last_name}')" title="Delete">
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
                        this.showAlertModal('Failed to load user data', 'Error');
                        return;
                    }
                } catch (error) {
                    console.error('Load user error:', error);
                    this.showAlertModal('Failed to load user data', 'Error');
                    return;
                }
            }

            // Prepare class options for students
            let classOptionsHtml = '';
            if (!this.classes || !this.classes.length) {
                await this.loadSubjectsAndClasses();
            }
            if (this.classes && this.classes.length) {
                classOptionsHtml = this.classes.map(c => `<option value="${c.id}">${c.name} (Grade ${c.grade_level})</option>`).join('');
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
                            <form id="userForm" onsubmit="return UsersManager.submitUser(event, ${userId ? `'${userId}'` : 'null'})">
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
                                        <select class="form-input" name="role" id="userRoleSelect" required onchange="UsersManager.toggleRoleFields(this.value)">
                                            <option value="">Select role</option>
                                            <option value="school_admin" ${user?.role === 'school_admin' ? 'selected' : ''}>School Admin</option>
                                            <option value="teacher" ${user?.role === 'teacher' ? 'selected' : ''}>Teacher</option>
                                            <option value="student" ${user?.role === 'student' ? 'selected' : ''}>Student</option>
                                        </select>
                                    </div>
                                </div>

                                <!-- Student-specific fields -->
                                <div id="studentFields" style="display: none;">
                                    <div class="form-group">
                                        <label class="form-label">Class <span class="required">*</span></label>
                                        <select class="form-input" name="student_class_id" id="studentClassSelect" required>
                                            <option value="">Select class</option>
                                            ${classOptionsHtml}
                                        </select>
                                    </div>
                                </div>

                                <!-- Teacher-specific fields -->
                                <div id="teacherFields" style="display: none;">
                                    <div class="form-section-header">
                                        <h3>Teaching Assignments</h3>
                                        <p>Select subjects and classes this teacher will teach</p>
                                    </div>

                                    <div id="teacherAssignments">
                                        <!-- Assignments will be added here dynamically -->
                                    </div>

                                    <button type="button" class="btn btn-outline btn-sm assignment-add-btn" onclick="UsersManager.addTeacherAssignment()">
                                        + Add Subject & Classes
                                    </button>
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

            // Initialize role-specific fields
            await this.toggleRoleFields(user?.role || '');
            if (user?.role === 'teacher') {
                this.renderTeacherAssignments(user?.teacher_assignments || []);
            }

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
            // Add student_class_id if student
            if (data.role === 'student') {
                data.student_class_id = formData.get('student_class_id');
            }

            // Add teacher assignments if role is teacher
            if (data.role === 'teacher') {
                data.teacher_assignments = this.getTeacherAssignments();
            }

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
                    // Show OTP password in a separate modal if generated
                    if (result.otp_password) {
                        this.closeModal();
                        this.showOtpModal(result.otp_password);
                    } else {
                        formAlert.className = 'alert alert-success';
                        formAlert.textContent = result.message;
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
            const confirmed = await this.confirmAction(`Are you sure you want to delete "${userName}" permanently?`);
            if (!confirmed) {
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
                    this.showAlertModal('Failed to delete user', 'Error');
                }
            } catch (error) {
                console.error('Delete user error:', error);
                this.showAlertModal('Failed to delete user', 'Error');
            }
        },

        // Reset user password
        resetPassword: async function (userId, userName) {
            const confirmed = await this.confirmAction(window.ZedlyI18n.translate('users.confirmResetPassword', { name: userName }));
            if (!confirmed) {
                return;
            }

            try {
                const token = localStorage.getItem('access_token');
                const response = await fetch(`/api/admin/users/${userId}/reset-password`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    const otp = data.tempPassword;

                    this.showTempPasswordModal({
                        title: window.ZedlyI18n.translate('users.tempPassword'),
                        subtitle: window.ZedlyI18n.translate('users.tempPasswordFor', { name: userName }),
                        password: otp
                    });

                    // Create notification
                    if (window.ZedlyNotifications) {
                        window.ZedlyNotifications.add({
                            type: 'password_reset',
                            title: window.ZedlyI18n.translate('notifications.passwordReset'),
                            message: window.ZedlyI18n.translate('notifications.passwordResetFor', { name: userName }),
                            time: new Date().toISOString()
                        });
                    }
                } else {
                    this.showAlertModal(window.ZedlyI18n.translate('users.resetPasswordFailed'), 'Error');
                }
            } catch (error) {
                console.error('Reset password error:', error);
                this.showAlertModal(window.ZedlyI18n.translate('users.resetPasswordFailed'), 'Error');
            }
        },

        // Show OTP modal
        showOTPModal: function (userName, otp) {
            this.showTempPasswordModal({
                title: window.ZedlyI18n.translate('users.tempPassword'),
                subtitle: window.ZedlyI18n.translate('users.tempPasswordFor', { name: userName }),
                password: otp
            });
        },

        // Close OTP modal
        closeOTPModal: function () {
            const modal = document.getElementById('tempPasswordModal') || document.getElementById('otpModal');
            if (modal) modal.remove();
        },

        // Copy OTP to clipboard
        copyOTP: async function (otp) {
            const value = String(otp || '').trim();
            if (!value) return;

            let copied = false;
            try {
                if (navigator.clipboard && window.isSecureContext) {
                    await navigator.clipboard.writeText(value);
                    copied = true;
                }
            } catch (err) {
                console.warn('Clipboard API failed, using fallback:', err);
            }

            if (!copied) {
                const textArea = document.createElement('textarea');
                textArea.value = value;
                textArea.style.position = 'fixed';
                textArea.style.left = '-9999px';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                copied = document.execCommand('copy');
                document.body.removeChild(textArea);
            }

            if (copied) {
                this.showAlertModal(window.ZedlyI18n.translate('users.passwordCopied'), 'Info');
            } else {
                this.showAlertModal('Не удалось скопировать пароль автоматически. Скопируйте вручную.', 'Error');
            }
        },

        // Teacher-specific functions
        subjects: [],
        classes: [],
        assignmentCounter: 0,

        addTeacherAssignment: function (subjectId = '', classIds = []) {
            const container = document.getElementById('teacherAssignments');
            if (!container) return;

            this.assignmentCounter += 1;
            const id = `assign_${this.assignmentCounter}`;

            const subjectOptions = this.subjects.map(s =>
                `<option value="${s.id}">${s.name}</option>`
            ).join('');

            const div = document.createElement('div');
            div.className = 'teacher-assignment';
            div.dataset.id = id;
            div.innerHTML = `
                <div class="assignment-row">
                    <div class="assignment-col">
                        <label class="form-label">Subject</label>
                        <select class="form-input" name="subject_${id}">
                            <option value="">Select subject</option>
                            ${subjectOptions}
                        </select>
                    </div>
                    <div class="assignment-col">
                        <label class="form-label">Classes</label>
                        <div class="multi-choice-list" data-empty="Select one or more classes"></div>
                    </div>
                    <button type="button" class="assignment-remove-btn" onclick="UsersManager.removeTeacherAssignment('${id}')" title="Remove">
                        &times;
                    </button>
                </div>
            `;
            container.appendChild(div);

            const subjectSelect = div.querySelector(`select[name="subject_${id}"]`);
            if (subjectSelect) {
                if (subjectId) subjectSelect.value = subjectId;
                subjectSelect.onchange = async () => {
                    await this.updateAssignmentClasses(div, subjectSelect.value);
                };
            }

            if (subjectId) {
                this.updateAssignmentClasses(div, subjectId, classIds);
            }
        },

        updateAssignmentClasses: function (assignmentDiv, subjectId, preselected = []) {
            const classList = assignmentDiv.querySelector('.multi-choice-list');
            if (!classList) return;

            classList.innerHTML = '';

            if (!subjectId) {
                classList.innerHTML = `<div class="multi-choice-empty">Select one or more classes</div>`;
                return;
            }

            if (!this.classes.length) {
                classList.innerHTML = `<div class="multi-choice-empty">No classes available</div>`;
                return;
            }

            const id = assignmentDiv.dataset.id;
            classList.innerHTML = this.classes.map(cls => {
                const label = `${cls.name} (Grade ${cls.grade_level})`;
                const checked = preselected.includes(String(cls.id)) ? 'checked' : '';
                return `
                    <label class="multi-choice-option">
                        <input type="checkbox" name="classes_${id}" value="${cls.id}" ${checked}>
                        <span>${label}</span>
                    </label>
                `;
            }).join('');
        },

        getCurrentRole: function () {
            try {
                const userStr = localStorage.getItem('user');
                if (!userStr) return null;
                const user = JSON.parse(userStr);
                return user.role || null;
            } catch (error) {
                return null;
            }
        },

        // Toggle teacher/student fields visibility
        toggleRoleFields: async function (role) {
            const teacherFields = document.getElementById('teacherFields');
            const studentFields = document.getElementById('studentFields');
            const studentClassSelect = document.getElementById('studentClassSelect');
            if (role === 'teacher') {
                teacherFields.style.display = 'block';
                studentFields.style.display = 'none';
                if (studentClassSelect) studentClassSelect.disabled = true;
                if (!this.subjects.length || !this.classes.length) {
                    await this.loadSubjectsAndClasses();
                }
                this.refreshTeacherAssignmentsOptions();
                // Add one assignment by default if none exist
                const container = document.getElementById('teacherAssignments');
                if (!container.children.length) {
                    this.addTeacherAssignment();
                }
            } else if (role === 'student') {
                teacherFields.style.display = 'none';
                studentFields.style.display = 'block';
                if (studentClassSelect) studentClassSelect.disabled = false;
                // Optionally, set class select value if editing
            } else {
                teacherFields.style.display = 'none';
                studentFields.style.display = 'none';
                if (studentClassSelect) studentClassSelect.disabled = true;
            }
        },

        // Load subjects and classes
        loadSubjectsAndClasses: async function () {
            try {
                const token = localStorage.getItem('access_token');
                const role = this.getCurrentRole();
                const isTeacher = role === 'teacher';

                const subjectsEndpoint = isTeacher ? '/api/teacher/subjects' : '/api/admin/subjects?page=1&limit=1000';
                const subjectsResponse = await fetch(subjectsEndpoint, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (subjectsResponse.ok) {
                    const subjectsData = await subjectsResponse.json();
                    this.subjects = subjectsData.subjects || [];
                }

                const classesEndpoint = isTeacher
                    ? '/api/teacher/classes?page=1&limit=1000&search=&grade=all'
                    : '/api/admin/classes?page=1&limit=1000&search=&grade=all';
                const classesResponse = await fetch(classesEndpoint, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (classesResponse.ok) {
                    const classesData = await classesResponse.json();
                    this.classes = classesData.classes || [];
                }
            } catch (error) {
                console.error('Load subjects/classes error:', error);
            }
        },

        refreshTeacherAssignmentsOptions: function () {
            const container = document.getElementById('teacherAssignments');
            if (!container) return;

            const assignmentDivs = container.querySelectorAll('.teacher-assignment');
            if (!assignmentDivs.length) return;

            const subjectOptions = this.subjects.map(s =>
                `<option value="${s.id}">${s.name}</option>`
            ).join('');

            assignmentDivs.forEach(async div => {
                const subjectSelect = div.querySelector('select[name^="subject_"]');
                const classList = div.querySelector('.multi-choice-list');

                if (subjectSelect) {
                    subjectSelect.onchange = async () => {
                        await window.UsersManager.updateAssignmentClasses(div, subjectSelect.value);
                    };
                }
            });
        },

        renderTeacherAssignments: function (assignments = []) {
            const container = document.getElementById('teacherAssignments');
            if (!container) return;
            container.innerHTML = '';
            if (!assignments.length) {
                this.addTeacherAssignment();
                return;
            }
            assignments.forEach(item => {
                const subjectId = item.subject_id || '';
                const classIds = Array.isArray(item.class_ids) ? item.class_ids.map(String) : [];
                this.addTeacherAssignment(subjectId, classIds);
            });
        },

        // Remove teacher assignment row
        removeTeacherAssignment: function (assignmentId) {
            const assignment = document.querySelector(`.teacher-assignment[data-id="${assignmentId}"]`);
            if (assignment) {
                assignment.remove();
            }
        },

        // Get teacher assignments from form
        getTeacherAssignments: function () {
            const assignments = [];
            const container = document.getElementById('teacherAssignments');
            const assignmentDivs = container.querySelectorAll('.teacher-assignment');

            assignmentDivs.forEach(div => {
                const id = div.dataset.id;
                const subjectId = div.querySelector(`[name="subject_${id}"]`)?.value;
                // For checkboxes, collect all checked values
                const checkedBoxes = div.querySelectorAll(`input[type="checkbox"][name="classes_${id}"]:checked`);
                const classIds = Array.from(checkedBoxes).map(cb => cb.value);

                if (subjectId && classIds.length > 0) {
                    assignments.push({
                        subject_id: subjectId,
                        class_ids: classIds
                    });
                }
            });

            return assignments;
        },

            // Show OTP password modal after user creation
            showOtpModal: function (otp) {
                this.showTempPasswordModal({
                    title: 'User created successfully!',
                    subtitle: "Please save this password - it won't be shown again.",
                    password: otp,
                    onClose: () => this.loadUsers()
                });
            }
        };
    }) ();
