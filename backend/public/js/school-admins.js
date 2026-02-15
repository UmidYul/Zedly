// School Admins Manager
const SchoolAdminsManager = (function () {
    'use strict';

    let currentPage = 1;
    let currentSearch = '';
    let currentSchoolFilter = 'all';
    let schools = [];

    async function confirmAction(message, title = 'Подтверждение') {
        if (window.ZedlyDialog?.confirm) {
            return window.ZedlyDialog.confirm(message, { title });
        }
        return confirm(message);
    }

    async function showInfo(message, title = 'Информация') {
        if (window.ZedlyDialog?.alert) {
            return window.ZedlyDialog.alert(message, { title });
        }
        alert(message);
    }

    function showTempPasswordModal(username, password) {
        if (window.ZedlyDialog?.temporaryPassword) {
            return window.ZedlyDialog.temporaryPassword({
                title: 'Temporary password',
                subtitle: `New temporary password for ${username}:`,
                password: password || '',
                passwordLabel: 'Temporary password',
                copyText: 'Copy',
                hint: 'User should change password after login.'
            });
        }
        return showInfo(`Temporary password for ${username}: ${password || '-'}`);
    }

    async function copyTempPassword() {
        return Promise.resolve();
    }
    async function init() {
        console.log('📋 Initializing School Admins Manager...');
        await loadSchools();
        await loadAdmins();
        attachEventListeners();
    }

    async function loadSchools() {
        try {
            const response = await fetch('/api/superadmin/schools?limit=1000', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('access_token')}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch schools');
            }

            const data = await response.json();
            schools = data.schools || [];

            // Populate school filter dropdown
            const schoolFilter = document.getElementById('schoolFilterAdmins');
            if (schoolFilter) {
                schoolFilter.innerHTML = '<option value="all">All Schools</option>';
                schools.forEach(school => {
                    const option = document.createElement('option');
                    option.value = school.id;
                    option.textContent = school.name;
                    schoolFilter.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Failed to load schools:', error);
        }
    }

    async function loadAdmins() {
        try {
            const container = document.getElementById('adminsContainer');
            if (!container) return;

            // Show loading
            container.innerHTML = `
                <div style="text-align: center; padding: var(--spacing-3xl);">
                    <div class="spinner" style="display: inline-block; width: 40px; height: 40px;"></div>
                    <p style="margin-top: var(--spacing-lg); color: var(--text-secondary);">Loading administrators...</p>
                </div>
            `;

            const params = new URLSearchParams({
                page: currentPage,
                limit: 10,
                search: currentSearch,
                school_id: currentSchoolFilter
            });

            const response = await fetch(`/api/superadmin/admins?${params}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('access_token')}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch administrators');
            }

            const data = await response.json();
            renderAdmins(data.admins, data.pagination);
        } catch (error) {
            console.error('Failed to load admins:', error);
            const container = document.getElementById('adminsContainer');
            if (container) {
                container.innerHTML = `
                    <div class="empty-state">
                        <p style="color: var(--text-danger);">Failed to load administrators. Please try again.</p>
                    </div>
                `;
            }
        }
    }

    function renderAdmins(admins, pagination) {
        const container = document.getElementById('adminsContainer');
        if (!container) return;

        if (admins.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                    <p>No school administrators found.</p>
                </div>
            `;
            return;
        }

        let html = `
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Username</th>
                            <th>School</th>
                            <th>Email</th>
                            <th>Phone</th>
                            <th>Status</th>
                            <th>Last Login</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        admins.forEach(admin => {
            const fullName = `${admin.first_name || ''} ${admin.last_name || ''}`.trim() || 'N/A';
            const statusBadge = admin.is_active
                ? '<span class="status-badge status-active">Active</span>'
                : '<span class="status-badge status-inactive">Inactive</span>';
            const lastLogin = admin.last_login
                ? new Date(admin.last_login).toLocaleString()
                : 'Never';

            html += `
                <tr>
                    <td>${fullName}</td>
                    <td>${admin.username}</td>
                    <td>${admin.school_name || 'N/A'}</td>
                    <td>${admin.email || 'N/A'}</td>
                    <td>${admin.phone || 'N/A'}</td>
                    <td>${statusBadge}</td>
                    <td>${lastLogin}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn-icon" onclick="SchoolAdminsManager.editAdmin('${admin.id}', '${admin.school_id}')" title="Edit">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                            </button>
                            <button class="btn-icon" onclick="SchoolAdminsManager.resetPassword('${admin.id}', '${admin.school_id}')" title="Reset Password">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                </svg>
                            </button>
                            <button class="btn-icon btn-danger" onclick="SchoolAdminsManager.deleteAdmin('${admin.id}', '${admin.school_id}')" title="Delete">
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
            html += renderPagination(pagination);
        }

        container.innerHTML = html;
    }

    function renderPagination(pagination) {
        let html = '<div class="pagination">';

        // Previous button
        if (pagination.page > 1) {
            html += `<button class="pagination-btn" onclick="SchoolAdminsManager.goToPage(${pagination.page - 1})">Previous</button>`;
        }

        // Page numbers
        const startPage = Math.max(1, pagination.page - 2);
        const endPage = Math.min(pagination.pages, pagination.page + 2);

        for (let i = startPage; i <= endPage; i++) {
            const activeClass = i === pagination.page ? 'active' : '';
            html += `<button class="pagination-btn ${activeClass}" onclick="SchoolAdminsManager.goToPage(${i})">${i}</button>`;
        }

        // Next button
        if (pagination.page < pagination.pages) {
            html += `<button class="pagination-btn" onclick="SchoolAdminsManager.goToPage(${pagination.page + 1})">Next</button>`;
        }

        html += '</div>';
        return html;
    }

    function attachEventListeners() {
        // Search input
        const searchInput = document.getElementById('adminsSearch');
        if (searchInput) {
            let searchTimeout;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    currentSearch = e.target.value;
                    currentPage = 1;
                    loadAdmins();
                }, 300);
            });
        }

        // School filter
        const schoolFilter = document.getElementById('schoolFilterAdmins');
        if (schoolFilter) {
            schoolFilter.addEventListener('change', (e) => {
                currentSchoolFilter = e.target.value;
                currentPage = 1;
                loadAdmins();
            });
        }

        // Add admin button
        const addAdminBtn = document.getElementById('addAdminBtn');
        if (addAdminBtn) {
            addAdminBtn.addEventListener('click', () => {
                showAddAdminModal();
            });
        }

        // Export button
        const exportBtn = document.getElementById('exportAdminsBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', exportAdmins);
        }
    }

    function goToPage(page) {
        currentPage = page;
        loadAdmins();
    }

    async function editAdmin(adminId, schoolId) {
        await showInfo(`Edit functionality will be implemented. Admin ID: ${adminId}, School ID: ${schoolId}`);
        // TODO: Implement edit modal
    }

    async function resetPassword(adminId, schoolId) {
        const confirmed = await confirmAction('Are you sure you want to reset this administrator\'s password?');
        if (!confirmed) {
            return;
        }

        try {
            const response = await fetch(`/api/superadmin/schools/${schoolId}/admins/${adminId}/reset-password`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Failed to reset password');
            }

            const data = await response.json();
            showTempPasswordModal(data.admin?.username || adminId, data.tempPassword);

            if (window.ZedlyNotifications) {
                window.ZedlyNotifications.add({
                    type: 'password_reset',
                    title: 'Пароль сброшен',
                    message: `Временный пароль для администратора ${data.admin?.username || adminId} сгенерирован`,
                    icon: '🔑'
                });
            }
        } catch (error) {
            console.error('Failed to reset password:', error);
            await showInfo('Failed to reset password. Please try again.', 'Ошибка');
        }
    }

    async function deleteAdmin(adminId, schoolId) {
        const confirmed = await confirmAction('Are you sure you want to delete this administrator? This action cannot be undone.');
        if (!confirmed) {
            return;
        }

        try {
            const response = await fetch(`/api/superadmin/schools/${schoolId}/admins/${adminId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('access_token')}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to delete administrator');
            }

            await showInfo('Administrator deleted successfully!');
            loadAdmins();
        } catch (error) {
            console.error('Failed to delete admin:', error);
            await showInfo('Failed to delete administrator. Please try again.', 'Ошибка');
        }
    }

    async function exportAdmins() {
        try {
            const params = new URLSearchParams({
                search: currentSearch,
                school_id: currentSchoolFilter,
                limit: 10000 // Get all for export
            });

            const response = await fetch(`/api/superadmin/admins?${params}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('access_token')}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch administrators');
            }

            const data = await response.json();

            // Convert to CSV
            const csv = convertToCSV(data.admins);

            // Download
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `school-administrators-${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Failed to export admins:', error);
            await showInfo('Failed to export administrators. Please try again.', 'Ошибка');
        }
    }

    function convertToCSV(admins) {
        const headers = ['ID', 'Username', 'First Name', 'Last Name', 'School', 'Email', 'Phone', 'Status', 'Last Login', 'Created At'];
        const rows = admins.map(admin => [
            admin.id,
            admin.username,
            admin.first_name || '',
            admin.last_name || '',
            admin.school_name || '',
            admin.email || '',
            admin.phone || '',
            admin.is_active ? 'Active' : 'Inactive',
            admin.last_login ? new Date(admin.last_login).toLocaleString() : 'Never',
            new Date(admin.created_at).toLocaleString()
        ]);

        return [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    }

    // Show add admin modal
    function showAddAdminModal() {
        if (currentSchoolFilter === 'all') {
            showInfo('Please select a specific school from the filter dropdown first.', 'Ошибка');
            return;
        }

        const selectedSchool = schools.find(s => s.id === currentSchoolFilter);
        if (!selectedSchool) {
            showInfo('Selected school not found', 'Ошибка');
            return;
        }

        const modalHtml = `
            <div class="modal-overlay" id="addAdminModal">
                <div class="modal">
                    <div class="modal-header">
                        <h2 class="modal-title">Add School Administrator - ${selectedSchool.name}</h2>
                        <button class="modal-close" onclick="SchoolAdminsManager.closeAddAdminModal()">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                    <div class="modal-body">
                        <form id="addAdminForm" onsubmit="SchoolAdminsManager.submitNewAdmin(event, '${selectedSchool.id}', '${selectedSchool.name}')">
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

                            <div id="addFormAlert" class="hidden"></div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-outline" onclick="SchoolAdminsManager.closeAddAdminModal()">
                            Cancel
                        </button>
                        <button type="submit" form="addAdminForm" class="btn btn-primary" id="submitNewAdminBtn">
                            Create Administrator
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Close on overlay click
        document.getElementById('addAdminModal').addEventListener('click', (e) => {
            if (e.target.id === 'addAdminModal') {
                closeAddAdminModal();
            }
        });

        // Close on Escape key
        const handleEscapeKey = (e) => {
            if (e.key === 'Escape') {
                closeAddAdminModal();
            }
        };
        document.addEventListener('keydown', handleEscapeKey);

        // Store handler for cleanup
        const modal = document.getElementById('addAdminModal');
        modal._handleEscapeKey = handleEscapeKey;
    }

    // Close add admin modal
    function closeAddAdminModal() {
        const modal = document.getElementById('addAdminModal');
        if (modal) {
            if (modal._handleEscapeKey) {
                document.removeEventListener('keydown', modal._handleEscapeKey);
            }
            modal.remove();
        }
    }

    // Submit new admin form
    async function submitNewAdmin(event, schoolId, schoolName) {
        event.preventDefault();

        const form = event.target;
        const submitBtn = document.getElementById('submitNewAdminBtn');
        const formAlert = document.getElementById('addFormAlert');

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
                        closeAddAdminModal();
                        loadAdmins(); // Reload admins list
                    };
                } else {
                    formAlert.className = 'alert alert-success';
                    formAlert.textContent = result.message;

                    // Reload admins list and close modal
                    setTimeout(() => {
                        closeAddAdminModal();
                        loadAdmins();
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

    // Public API
    return {
        init,
        goToPage,
        editAdmin,
        resetPassword,
        deleteAdmin,
        showAddAdminModal,
        closeAddAdminModal,
        submitNewAdmin
    };
})();

// Expose to window for onclick handlers
window.SchoolAdminsManager = SchoolAdminsManager;
