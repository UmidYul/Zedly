// Users Management Component
(function () {
    'use strict';

    window.UsersManager = {
        currentPage: 1,
        limit: 10,
        searchTerm: '',
        roleFilter: 'all',
        selectedIds: new Set(),
        lastRenderedUsers: [],
        pageSizeStorageKey: 'users_page_limit',
        searchDebounceTimer: null,
        activeUsersRequest: null,
        bulkDeleteInProgress: false,
        t: function (key, fallback, params) {
            const tr = window.ZedlyI18n?.translate?.(key, params);
            return tr && tr !== key ? tr : (fallback || key);
        },
        showAlertModal: function (message, title) {
            const resolvedTitle = title || this.t('common.info');
            if (window.ZedlyDialog?.alert) {
                return window.ZedlyDialog.alert(message, { title: resolvedTitle });
            }
            alert(message);
            return Promise.resolve(true);
        },

        confirmAction: async function (message, title) {
            const resolvedTitle = title || this.t('common.confirmation');
            if (window.ZedlyDialog?.confirm) {
                return window.ZedlyDialog.confirm(message, { title: resolvedTitle });
            }
            return confirm(message);
        },
        showTempPasswordModal: function ({ title, subtitle, password, onClose }) {
            if (window.ZedlyDialog?.temporaryPassword) {
                return window.ZedlyDialog.temporaryPassword({
                    title: title || window.ZedlyI18n?.translate('users.tempPassword') || this.t('users.tempPassword'),
                    subtitle: subtitle || '',
                    password: password || '',
                    passwordLabel: window.ZedlyI18n?.translate('users.tempPassword') || this.t('users.tempPassword'),
                    copyText: window.ZedlyI18n?.translate('users.copyPassword') || this.t('users.copyPassword'),
                    hint: window.ZedlyI18n?.translate('users.userMustChangePassword') || this.t('users.userMustChangePassword')
                }).finally(() => {
                    if (typeof onClose === 'function') onClose();
                });
            }

            if (typeof onClose === 'function') onClose();
            return Promise.resolve(true);
        },
        copyTempPasswordFromModal: async function () {
            return Promise.resolve();
        },

        showBulkDeleteProgress: function (total) {
            const existing = document.getElementById('usersBulkDeleteOverlay');
            if (existing) existing.remove();
            const overlay = document.createElement('div');
            overlay.id = 'usersBulkDeleteOverlay';
            overlay.className = 'operation-progress-overlay';
            overlay.innerHTML = `
                <div class="operation-progress-modal">
                    <div class="progress-head">
                        <div class="progress-label">
                            <span class="spinner" style="display:inline-block;"></span>
                            <span>${this.t('users.bulkDeleteProgress', 'Массовое удаление...')}</span>
                        </div>
                        <strong id="usersBulkDeletePercent">0%</strong>
                    </div>
                    <div class="progress-track">
                        <div class="progress-fill" id="usersBulkDeleteFill" style="width:0%"></div>
                    </div>
                    <div id="usersBulkDeleteMeta" class="text-secondary" style="margin-top:8px;">
                        0 / ${Number(total) || 0}
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
        },

        updateBulkDeleteProgress: function (done, total, failed) {
            const safeTotal = Math.max(1, Number(total) || 1);
            const safeDone = Math.min(safeTotal, Math.max(0, Number(done) || 0));
            const percent = Math.round((safeDone / safeTotal) * 100);
            const fill = document.getElementById('usersBulkDeleteFill');
            const pct = document.getElementById('usersBulkDeletePercent');
            const meta = document.getElementById('usersBulkDeleteMeta');
            if (fill) fill.style.width = `${percent}%`;
            if (pct) pct.textContent = `${percent}%`;
            if (meta) meta.textContent = `${safeDone} / ${safeTotal}` + (failed ? ` · ${this.t('audit.failed', 'Ошибка')}: ${failed}` : '');
        },

        hideBulkDeleteProgress: function () {
            const overlay = document.getElementById('usersBulkDeleteOverlay');
            if (overlay) overlay.remove();
        },

        formatUzPhone: function (value) {
            const raw = String(value || '').trim();
            if (!raw) return '';
            const digits = raw.replace(/\D/g, '');
            let local = '';
            if (digits.length === 12 && digits.startsWith('998')) local = digits.slice(3);
            else if (digits.length === 10 && digits.startsWith('0')) local = digits.slice(1);
            else if (digits.length === 9) local = digits;
            return /^\d{9}$/.test(local) ? `+998${local}` : raw;
        },

        // Initialize users page
        init: function () {
            this.currentPage = 1; // Reset to first page
            this.limit = this.getSavedLimit();
            if (this.searchDebounceTimer) {
                clearTimeout(this.searchDebounceTimer);
                this.searchDebounceTimer = null;
            }
            if (this.activeUsersRequest) {
                this.activeUsersRequest.abort();
                this.activeUsersRequest = null;
            }
            this.clearSelection();
            this.loadUsers();
            this.setupEventListeners();
        },

        getSavedLimit: function () {
            const saved = parseInt(localStorage.getItem(this.pageSizeStorageKey), 10);
            return [10, 20, 50, 100].includes(saved) ? saved : 10;
        },

        // Setup event listeners
        setupEventListeners: function () {
            // Search input
            const searchInput = document.getElementById('usersSearch');
            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    this.searchTerm = e.target.value;
                    this.currentPage = 1;
                    if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
                    this.searchDebounceTimer = setTimeout(() => {
                        this.loadUsers();
                    }, 300);
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

            const pageSizeSelect = document.getElementById('usersPerPage');
            if (pageSizeSelect) {
                pageSizeSelect.value = String(this.limit);
                pageSizeSelect.addEventListener('change', (e) => {
                    const nextLimit = parseInt(e.target.value, 10);
                    if (![10, 20, 50, 100].includes(nextLimit)) return;
                    this.limit = nextLimit;
                    localStorage.setItem(this.pageSizeStorageKey, String(nextLimit));
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
            this.clearSelection();

            if (this.activeUsersRequest) {
                this.activeUsersRequest.abort();
            }
            this.activeUsersRequest = new AbortController();

            // Show loading
            container.innerHTML = `
                <div style="text-align: center; padding: var(--spacing-3xl);">
                    <div class="spinner" style="display: inline-block;"></div>
                    <p style="margin-top: var(--spacing-lg); color: var(--text-secondary);">${this.t('users.loadingUsers')}</p>
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
                    },
                    signal: this.activeUsersRequest.signal
                });

                if (!response.ok) {
                    throw new Error('Failed to load users');
                }

                const data = await response.json();
                this.renderUsers(data.users, data.pagination);
            } catch (error) {
                if (error.name === 'AbortError') return;
                console.error('Load users error:', error);
                container.innerHTML = `
                    <div class="error-message">
                        <p>${this.t('users.failedLoadUsers')}</p>
                    </div>
                `;
            } finally {
                this.activeUsersRequest = null;
            }
        },

        // Render users table
        renderUsers: function (users, pagination) {
            const container = document.getElementById('usersContainer');
            if (!container) return;
            this.lastRenderedUsers = users;

            if (users.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; padding: var(--spacing-3xl);">
                        <p style="color: var(--text-secondary);">${this.t('users.noUsersFound')}</p>
                    </div>
                `;
                return;
            }

            let html = `
                <div class="bulk-toolbar" id="usersBulkToolbar">
                    <div class="bulk-toolbar-left">
                        <span class="bulk-count-pill" id="usersBulkCount">${this.t('users.selectedCount', undefined, { count: 0 })}</span>
                        <button class="btn btn-sm btn-outline" id="usersClearSelectionBtn" onclick="UsersManager.clearSelection()">${this.t('users.clear')}</button>
                    </div>
                    <div class="bulk-toolbar-right">
                        <button class="btn btn-sm btn-danger" id="usersBulkDeleteBtn" onclick="UsersManager.bulkDeleteUsers()" disabled>
                            ${this.t('users.deleteSelected')}
                        </button>
                    </div>
                </div>
                <div class="table-responsive mobile-stack-table">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th class="bulk-checkbox-cell">
                                    <input
                                        type="checkbox"
                                        id="usersSelectAll"
                                        onchange="UsersManager.toggleSelectAllUsers(this.checked)"
                                        aria-label="${this.t('users.selectAllUsers')}"
                                    >
                                </th>
                                <th>${this.t('users.fullNameHeader')}</th>
                                <th>${this.t('users.username')}</th>
                                <th>${this.t('common.role')}</th>
                                <th>${this.t('users.contact')}</th>
                                <th>${this.t('common.status')}</th>
                                <th>${this.t('users.lastLogin')}</th>
                                <th>${this.t('common.actions')}</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            users.forEach(user => {
                const statusClass = user.is_active ? 'status-active' : 'status-inactive';
                const statusText = user.is_active ? this.t('users.active') : this.t('users.inactive');
                const roleLabel = this.getRoleLabel(user.role);
                const lastLogin = user.last_login ? new Date(user.last_login).toLocaleDateString() : this.t('users.never');
                const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
                const safeFullName = fullName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                const isSelected = this.selectedIds.has(String(user.id));
                const formattedPhone = this.formatUzPhone(user.phone);

                html += `
                    <tr data-user-id="${user.id}" class="${isSelected ? 'bulk-row-selected' : ''}">
                        <td class="bulk-checkbox-cell" data-label="">
                            <input
                                type="checkbox"
                                class="bulk-row-checkbox"
                                ${isSelected ? 'checked' : ''}
                                onchange="UsersManager.toggleSelectUser('${user.id}')"
                                aria-label="${this.t('users.selectUserAria', undefined, { name: fullName || this.t('reports.user') })}"
                            >
                        </td>
                        <td data-label="${this.t('users.fullNameHeader')}">
                            <div class="user-name">${fullName}</div>
                        </td>
                        <td data-label="${this.t('users.username')}">${user.username}</td>
                        <td data-label="${this.t('common.role')}"><span class="role-badge role-${user.role}">${roleLabel}</span></td>
                        <td data-label="${this.t('users.contact')}">
                            ${user.email ? `<div>${user.email}</div>` : ''}
                            ${formattedPhone ? `<div class="text-secondary">${formattedPhone}</div>` : ''}
                        </td>
                        <td data-label="${this.t('common.status')}"><span class="status-badge ${statusClass}">${statusText}</span></td>
                        <td class="text-secondary" data-label="${this.t('users.lastLogin')}">${lastLogin}</td>
                        <td data-label="${this.t('common.actions')}">
                            <div class="action-buttons">
                                <button class="btn-icon" onclick="UsersManager.resetPassword('${user.id}', '${user.first_name} ${user.last_name}')" title="${this.t('users.resetPasswordTitle')}">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                    </svg>
                                </button>
                                <button class="btn-icon" onclick="UsersManager.editUser('${user.id}')" title="${this.t('users.editTitle')}">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                    </svg>
                                </button>
                                <button class="btn-icon btn-danger" onclick="UsersManager.deleteUser('${user.id}', '${safeFullName}')" title="${this.t('users.deleteTitle')}">
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
            this.syncSelectionUi();
        },

        toggleSelectUser: function (userId) {
            const normalizedId = String(userId);
            if (this.selectedIds.has(normalizedId)) {
                this.selectedIds.delete(normalizedId);
            } else {
                this.selectedIds.add(normalizedId);
            }
            this.syncSelectionUi();
        },

        toggleSelectAllUsers: function (checked) {
            const currentIds = this.lastRenderedUsers.map(user => String(user.id));
            if (checked) {
                currentIds.forEach(id => this.selectedIds.add(id));
            } else {
                currentIds.forEach(id => this.selectedIds.delete(id));
            }
            this.syncSelectionUi();
        },

        clearSelection: function () {
            this.selectedIds.clear();
            this.syncSelectionUi();
        },

        syncSelectionUi: function () {
            const count = this.selectedIds.size;
            const countEl = document.getElementById('usersBulkCount');
            if (countEl) {
                countEl.textContent = this.t('users.selectedCount', undefined, { count });
            }

            const deleteBtn = document.getElementById('usersBulkDeleteBtn');
            if (deleteBtn) {
                deleteBtn.disabled = count === 0;
            }

            const clearBtn = document.getElementById('usersClearSelectionBtn');
            if (clearBtn) {
                clearBtn.disabled = count === 0;
            }

            const selectAllEl = document.getElementById('usersSelectAll');
            if (selectAllEl) {
                const currentIds = this.lastRenderedUsers.map(user => String(user.id));
                const selectedOnPage = currentIds.filter(id => this.selectedIds.has(id)).length;
                selectAllEl.checked = currentIds.length > 0 && selectedOnPage === currentIds.length;
                selectAllEl.indeterminate = selectedOnPage > 0 && selectedOnPage < currentIds.length;
            }

            document.querySelectorAll('tr[data-user-id]').forEach(row => {
                const rowId = String(row.dataset.userId || '');
                const isSelected = this.selectedIds.has(rowId);
                row.classList.toggle('bulk-row-selected', isSelected);
                const checkbox = row.querySelector('.bulk-row-checkbox');
                if (checkbox) checkbox.checked = isSelected;
            });
        },

        bulkDeleteUsers: async function () {
            const ids = Array.from(this.selectedIds);
            if (ids.length === 0) return;
            if (this.bulkDeleteInProgress) return;

            const confirmed = await this.confirmAction(this.t('users.bulkDeleteConfirm', undefined, { count: ids.length }));
            if (!confirmed) return;

            const token = localStorage.getItem('access_token');
            this.bulkDeleteInProgress = true;
            let failed = 0;
            let done = 0;
            this.showBulkDeleteProgress(ids.length);
            this.updateBulkDeleteProgress(done, ids.length, failed);

            try {
                for (const id of ids) {
                    try {
                        const response = await fetch(`/api/admin/users/${id}`, {
                            method: 'DELETE',
                            headers: {
                                'Authorization': `Bearer ${token}`
                            }
                        });
                        if (!response.ok) {
                            failed += 1;
                        }
                    } catch (_) {
                        failed += 1;
                    }
                    done += 1;
                    this.updateBulkDeleteProgress(done, ids.length, failed);
                }
            } finally {
                setTimeout(() => this.hideBulkDeleteProgress(), 240);
                this.bulkDeleteInProgress = false;
            }

            const deleted = ids.length - failed;
            this.clearSelection();

            if (failed > 0) {
                this.showAlertModal(this.t('users.bulkDeleteStats', undefined, { deleted, failed }), this.t('users.bulkDeleteResult'));
            }

            this.loadUsers();
        },

        // Get role label
        getRoleLabel: function (role) {
            const labels = {
                'school_admin': this.t('settings.role.school_admin'),
                'teacher': this.t('settings.role.teacher'),
                'student': this.t('settings.role.student')
            };
            return labels[role] || role;
        },

        // Render pagination
        renderPagination: function (pagination) {
            let html = '<div class="pagination">';
            const totalPages = Math.max(1, Number(pagination.pages) || 1);
            const currentPage = Math.min(Math.max(1, Number(pagination.page) || 1), totalPages);

            if (currentPage > 1) {
                html += `<button class="pagination-btn" onclick="UsersManager.goToPage(${currentPage - 1})">${this.t('reports.previous')}</button>`;
            }

            const pagesToRender = [];
            const pushPage = (page) => {
                if (page >= 1 && page <= totalPages && !pagesToRender.includes(page)) {
                    pagesToRender.push(page);
                }
            };

            pushPage(1);
            for (let i = currentPage - 2; i <= currentPage + 2; i++) pushPage(i);
            pushPage(totalPages);
            pagesToRender.sort((a, b) => a - b);

            let prevPage = null;
            for (const i of pagesToRender) {
                if (prevPage !== null && i - prevPage > 1) {
                    html += '<span class="pagination-ellipsis">...</span>';
                }
                if (i === currentPage) {
                    html += `<button class="pagination-btn active">${i}</button>`;
                } else {
                    html += `<button class="pagination-btn" onclick="UsersManager.goToPage(${i})">${i}</button>`;
                }
                prevPage = i;
            }

            if (currentPage < totalPages) {
                html += `<button class="pagination-btn" onclick="UsersManager.goToPage(${currentPage + 1})">${this.t('reports.next')}</button>`;
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
                        this.showAlertModal(this.t('users.failedLoadUserData'), this.t('common.error'));
                        return;
                    }
                } catch (error) {
                    console.error('Load user error:', error);
                    this.showAlertModal(this.t('users.failedLoadUserData'), this.t('common.error'));
                    return;
                }
            }

            // Prepare class options for students
            let classOptionsHtml = '';
            if (!this.classes || !this.classes.length) {
                await this.loadSubjectsAndClasses();
            }
            if (this.classes && this.classes.length) {
                const selectedStudentClassId = String(user?.student_class_id || '');
                classOptionsHtml = this.classes.map(c => `
                    <option value="${c.id}" ${selectedStudentClassId === String(c.id) ? 'selected' : ''}>
                        ${c.name} (Grade ${c.grade_level})
                    </option>
                `).join('');
            }

            // Create modal HTML
            const modalHtml = `
                <div class="modal-overlay" id="userModal">
                    <div class="modal">
                        <div class="modal-header">
                            <h2 class="modal-title">${isEdit ? this.t('users.editUserTitle', 'Редактировать пользователя') : this.t('users.addUserTitle', 'Добавить пользователя')}</h2>
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
                                            ${this.t('users.username')} <span class="required">*</span>
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
                                            ${this.t('common.role', 'Роль')} <span class="required">*</span>
                                        </label>
                                        <select class="form-input" name="role" id="userRoleSelect" required onchange="UsersManager.toggleRoleFields(this.value)">
                                            <option value="">${this.t('users.role')}</option>
                                            <option value="school_admin" ${user?.role === 'school_admin' ? 'selected' : ''}>${this.t('settings.role.school_admin', 'Администратор школы')}</option>
                                            <option value="teacher" ${user?.role === 'teacher' ? 'selected' : ''}>${this.t('settings.role.teacher', 'Учитель')}</option>
                                            <option value="student" ${user?.role === 'student' ? 'selected' : ''}>${this.t('settings.role.student', 'Ученик')}</option>
                                        </select>
                                    </div>
                                </div>

                                <!-- Student-specific fields -->
                                <div id="studentFields" style="display: none;">
                                    <div class="form-group">
                                        <label class="form-label">${this.t('dashboard.nav.classes', 'Классы')} <span class="required">*</span></label>
                                        <select class="form-input" name="student_class_id" id="studentClassSelect" required>
                                            <option value="">${this.t('users.selectClassForStudent', 'Выберите класс для ученика')}</option>
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
                                        + ${this.t('users.addSubjectClasses', 'Добавить предмет и классы')}
                                    </button>
                                </div>

                                ${!isEdit ? `
                                <div class="form-group">
                                    <label class="form-label">${this.t('login.password', 'Пароль')}</label>
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
                                        <label class="form-label">${this.t('users.email', 'Email')}</label>
                                        <input
                                            type="email"
                                            class="form-input"
                                            name="email"
                                            value="${user?.email || ''}"
                                            placeholder="user@example.uz"
                                        />
                                    </div>

                                    <div class="form-group">
                                        <label class="form-label">${this.t('users.phone', 'Телефон')}</label>
                                        <input
                                            type="tel"
                                            class="form-input"
                                            name="phone"
                                            value="${user?.phone || ''}"
                                            placeholder="+998901234567"
                                        />
                                    </div>
                                </div>

                                <div class="form-row">
                                    <div class="form-group">
                                        <label class="form-label">Date of Birth</label>
                                        <input
                                            type="date"
                                            class="form-input"
                                            name="date_of_birth"
                                            value="${user?.date_of_birth || ''}"
                                        />
                                    </div>

                                    <div class="form-group">
                                        <label class="form-label">Gender</label>
                                        <select class="form-input" name="gender">
                                            <option value="">Select gender</option>
                                            <option value="male" ${user?.gender === 'male' ? 'selected' : ''}>Male</option>
                                            <option value="female" ${user?.gender === 'female' ? 'selected' : ''}>Female</option>
                                            <option value="other" ${user?.gender === 'other' ? 'selected' : ''}>Other</option>
                                        </select>
                                    </div>
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
                                            ${this.t('users.active', 'Активный')}
                                        </label>
                                    </div>
                                </div>
                                ` : ''}

                                <div id="formAlert" class="hidden"></div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-outline" onclick="UsersManager.closeModal()">
                                ${this.t('users.cancel', 'Отмена')}
                            </button>
                            <button type="submit" form="userForm" class="btn btn-primary" id="submitBtn">
                                ${isEdit ? this.t('users.updateUser', 'Обновить пользователя') : this.t('users.createUser', 'Создать пользователя')}
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
                date_of_birth: formData.get('date_of_birth')?.trim() || null,
                gender: formData.get('gender')?.trim() || null
            };
            // Add student_class_id if student
            if (data.role === 'student') {
                data.student_class_id = formData.get('student_class_id') || null;
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
                formAlert.textContent = this.t('users.requiredFields');
                return;
            }

            if (data.role === 'student' && !data.student_class_id) {
                formAlert.className = 'alert alert-error';
                formAlert.textContent = this.t('users.selectClassForStudent');
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
                    formAlert.textContent = result.message || this.t('users.genericError');
                }
            } catch (error) {
                console.error('Submit user error:', error);
                formAlert.className = 'alert alert-error';
                formAlert.textContent = this.t('users.networkError');
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
            const confirmed = await this.confirmAction(this.t('users.deleteConfirm', undefined, { name: userName }));
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
                    this.selectedIds.delete(userId);
                    this.loadUsers();
                } else {
                    this.showAlertModal(this.t('users.failedDeleteUser'), this.t('common.error'));
                }
            } catch (error) {
                console.error('Delete user error:', error);
                this.showAlertModal(this.t('users.failedDeleteUser'), this.t('common.error'));
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
                    this.showAlertModal(window.ZedlyI18n.translate('users.resetPasswordFailed'), this.t('common.error'));
                }
            } catch (error) {
                console.error('Reset password error:', error);
                this.showAlertModal(window.ZedlyI18n.translate('users.resetPasswordFailed'), this.t('common.error'));
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
                this.showAlertModal(this.t('users.copyPasswordFailed', 'Не удалось скопировать пароль автоматически. Скопируйте вручную.'), this.t('common.error', 'Ошибка'));
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
            if (!teacherFields || !studentFields) return;

            if (role === 'teacher') {
                teacherFields.style.display = 'block';
                studentFields.style.display = 'none';
                if (studentClassSelect) {
                    studentClassSelect.disabled = true;
                    studentClassSelect.required = false;
                    studentClassSelect.value = '';
                }
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
                if (studentClassSelect) {
                    studentClassSelect.disabled = false;
                    studentClassSelect.required = true;
                }
            } else {
                teacherFields.style.display = 'none';
                studentFields.style.display = 'none';
                if (studentClassSelect) {
                    studentClassSelect.disabled = true;
                    studentClassSelect.required = false;
                    studentClassSelect.value = '';
                }
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
                    title: this.t('users.createdSuccess', 'Пользователь успешно создан'),
                    subtitle: "Please save this password - it won't be shown again.",
                    password: otp,
                    onClose: () => this.loadUsers()
                });
            }
        };
    }) ();
