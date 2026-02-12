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
            this.toggleRoleFields(user?.role || '');

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
                    this.showAlertModal('Failed to delete user', 'Error');
                }
            } catch (error) {
                console.error('Delete user error:', error);
                this.showAlertModal('Failed to delete user', 'Error');
            }
        },

        // Reset user password
        resetPassword: async function (userId, userName) {
            if (!confirm(window.ZedlyI18n.translate('users.confirmResetPassword', { name: userName }))) {
                return;
            }

            try {
                const token = localStorage.getItem('token');
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

                    // Show OTP modal
                    this.showOTPModal(userName, otp);

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
            const modalHTML = `
                <div class="modal-overlay" id="otpModal">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3>${window.ZedlyI18n.translate('users.tempPassword')}</h3>
                            <button class="modal-close" onclick="UsersManager.closeOTPModal()">&times;</button>
                        </div>
                        <div class="modal-body">
                            <p>${window.ZedlyI18n.translate('users.tempPasswordFor', { name: userName })}</p>
                            <div class="otp-display">
                                <div class="otp-code" id="otpCode">${otp}</div>
                                <button class="btn btn-primary" onclick="UsersManager.copyOTP('${otp}')">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;">
                                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                    </svg>
                                    ${window.ZedlyI18n.translate('users.copyPassword')}
                                </button>
                            </div>
                            <p class="warning-text">${window.ZedlyI18n.translate('users.userMustChangePassword')}</p>
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHTML);
        },

        // Close OTP modal
        closeOTPModal: function () {
            const modal = document.getElementById('otpModal');
            if (modal) {
                modal.remove();
            }
        },

        // Copy OTP to clipboard
        copyOTP: function (otp) {
            navigator.clipboard.writeText(otp).then(() => {
                this.showAlertModal(window.ZedlyI18n.translate('users.passwordCopied'), 'Info');
            }).catch(err => {
                console.error('Failed to copy:', err);
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = otp;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                this.showAlertModal(window.ZedlyI18n.translate('users.passwordCopied'), 'Info');
            });
        },

        // Teacher-specific functions
        subjects: [],
        classes: [],
        assignmentCounter: 0,

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
            }
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
                const classSelect = div.querySelector('select[name^="classes_"]');

                // Always re-render all subject options and re-select previous
                const selectedSubject = subjectSelect?.value || '';
                const selectedClasses = classSelect
                    ? Array.from(classSelect.selectedOptions).map(opt => opt.value)
                    : [];

                if (subjectSelect) {
                    subjectSelect.innerHTML = `<option value="">Select subject</option>${subjectOptions}`;
                    subjectSelect.value = selectedSubject;

                    // При изменении предмета — фильтруем классы
                    subjectSelect.onchange = async () => {
                        await window.UsersManager.updateAssignmentClasses(div, subjectSelect.value);
                    };
                }

                // Изначально фильтруем классы по выбранному предмету
                await window.UsersManager.updateAssignmentClasses(div, selectedSubject, selectedClasses);
            });
        },

        // Фильтрует классы по предмету для конкретного assignment
        updateAssignmentClasses: async function (div, subjectId, preselectClassIds = []) {
            const classSelect = div.querySelector('select[name^="classes_"]');
            if (!classSelect) return;
            if (!subjectId) {
                classSelect.innerHTML = '';
                return;
            }
            try {
                const token = localStorage.getItem('access_token');
                const role = this.getCurrentRole();
                const isTeacher = role === 'teacher';
                const endpoint = isTeacher
                    ? `/api/teacher/classes?subject_id=${subjectId}`
                    : `/api/admin/classes?page=1&limit=1000&search=&grade=all`;
                const response = await fetch(endpoint, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    const data = await response.json();
                    const classOptions = data.classes.map(c =>
                        `<option value="${c.id}">${c.name} (Grade ${c.grade_level})</option>`
                    ).join('');
                    classSelect.innerHTML = classOptions;
                    // Проставить выбранные классы, если есть
                    preselectClassIds.forEach(value => {
                        const option = classSelect.querySelector(`option[value="${value}"]`);
                        if (option) {
                            option.selected = true;
                        }
                    });
                } else {
                    classSelect.innerHTML = '';
                }
            } catch (error) {
                classSelect.innerHTML = '';
            }
        },

        // Add new teacher assignment row
        addTeacherAssignment: function () {
            const container = document.getElementById('teacherAssignments');
            const assignmentId = this.assignmentCounter++;

            const subjectOptions = this.subjects.map(s =>
                `<option value="${s.id}">${s.name}</option>`
            ).join('');

            const html = `
                <div class="teacher-assignment" data-id="${assignmentId}">
                    <div class="assignment-row">
                        <div class="form-group flex-1">
                            <label class="form-label">Subject</label>
                            <select class="form-input" name="subject_${assignmentId}" required>
                                <option value="">Select subject</option>
                                ${subjectOptions}
                            </select>
                        </div>
                        <div class="form-group flex-2">
                            <label class="form-label">Classes</label>
                            <select class="form-input" name="classes_${assignmentId}" multiple required></select>
                            <span class="form-hint">Select one or more classes</span>
                        </div>
                        <button type="button" class="btn-remove" onclick="UsersManager.removeTeacherAssignment(${assignmentId})" title="Remove">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                </div>
            `;

            container.insertAdjacentHTML('beforeend', html);

            // Инициализировать динамическую фильтрацию классов по предмету
            const div = container.querySelector(`.teacher-assignment[data-id="${assignmentId}"]`);
            const subjectSelect = div.querySelector('select[name^="subject_"]');
            const classSelect = div.querySelector('select[name^="classes_"]');
            if (subjectSelect) {
                subjectSelect.onchange = async () => {
                    await window.UsersManager.updateAssignmentClasses(div, subjectSelect.value);
                };
            }
            // Пустой список классов до выбора предмета
            if (classSelect) classSelect.innerHTML = '';
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
            // Remove existing OTP modal if present
            const existing = document.getElementById('otpModal');
            if (existing) existing.remove();
            const html = `
                <div class="modal-overlay" id="otpModal">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h2 class="modal-title">User created successfully!</h2>
                        </div>
                        <div class="modal-body" style="text-align:center;">
                            <div style="margin-bottom:1.5rem;">
                                <strong>Generated Password:</strong><br>
                                <code style="background: rgba(0,0,0,0.1); padding: 8px 16px; border-radius: 6px; font-size: 1.3em; letter-spacing:2px;">${otp}</code><br>
                                <small style="display:block;margin-top:0.5rem;">Please save this password - it won't be shown again!</small>
                            </div>
                            <button class="btn btn-primary" id="closeOtpModalBtn">Close</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', html);
            document.getElementById('closeOtpModalBtn').onclick = () => {
                document.getElementById('otpModal').remove();
                this.loadUsers();
            };
        }
    };
})();
