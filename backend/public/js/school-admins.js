// School Admins Manager
const SchoolAdminsManager = (function () {
    'use strict';

    let currentPage = 1;
    let currentSearch = '';
    let currentSchoolFilter = 'all';
    let schools = [];

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
                ? '<span class="badge badge-success">Active</span>'
                : '<span class="badge badge-danger">Inactive</span>';
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
                            <button class="btn-icon" onclick="SchoolAdminsManager.editAdmin(${admin.id}, ${admin.school_id})" title="Edit">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                            </button>
                            <button class="btn-icon" onclick="SchoolAdminsManager.resetPassword(${admin.id}, ${admin.school_id})" title="Reset Password">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                </svg>
                            </button>
                            <button class="btn-icon btn-danger" onclick="SchoolAdminsManager.deleteAdmin(${admin.id}, ${admin.school_id})" title="Delete">
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
                // Redirect to schools page where they can add admins
                window.location.hash = '#schools';
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
        alert(`Edit functionality will be implemented. Admin ID: ${adminId}, School ID: ${schoolId}`);
        // TODO: Implement edit modal
    }

    async function resetPassword(adminId, schoolId) {
        if (!confirm('Are you sure you want to reset this administrator\'s password?')) {
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
            alert(`Password reset successfully! New password: ${data.new_password}`);
        } catch (error) {
            console.error('Failed to reset password:', error);
            alert('Failed to reset password. Please try again.');
        }
    }

    async function deleteAdmin(adminId, schoolId) {
        if (!confirm('Are you sure you want to delete this administrator? This action cannot be undone.')) {
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

            alert('Administrator deleted successfully!');
            loadAdmins();
        } catch (error) {
            console.error('Failed to delete admin:', error);
            alert('Failed to delete administrator. Please try again.');
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
            alert('Failed to export administrators. Please try again.');
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

    // Public API
    return {
        init,
        goToPage,
        editAdmin,
        resetPassword,
        deleteAdmin
    };
})();

// Expose to window for onclick handlers
window.SchoolAdminsManager = SchoolAdminsManager;
