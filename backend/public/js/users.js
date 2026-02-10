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

            // Modal will be created next
            alert('User modal coming soon...');
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
