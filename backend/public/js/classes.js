// Classes Management Component
(function () {
    'use strict';

    function showAlert(message, title = 'Error') {
        if (window.ZedlyDialog?.alert) {
            return window.ZedlyDialog.alert(message, { title });
        }
        alert(message);
        return Promise.resolve(true);
    }

    function showConfirm(message, title = 'Confirmation') {
        if (window.ZedlyDialog?.confirm) {
            return window.ZedlyDialog.confirm(message, { title });
        }
        return Promise.resolve(confirm(message));
    }

    window.ClassesManager = {
        currentPage: 1,
        limit: 10,
        searchTerm: '',
        gradeFilter: 'all',
        userRole: null,
        selectedIds: new Set(),
        lastRenderedClasses: [],
        pageSizeStorageKey: 'classes_page_limit',
        searchDebounceTimer: null,
        activeClassesRequest: null,

        // Initialize classes page
        init: function () {
            // Get user role from localStorage (key: 'user')
            const userDataStr = localStorage.getItem('user');
            if (userDataStr) {
                try {
                    const userData = JSON.parse(userDataStr);
                    this.userRole = userData.role;
                } catch (e) {
                    console.error('Failed to parse user', e);
                    this.userRole = 'teacher'; // Default to teacher
                }
            }

            this.limit = this.getSavedLimit();
            if (this.searchDebounceTimer) {
                clearTimeout(this.searchDebounceTimer);
                this.searchDebounceTimer = null;
            }
            if (this.activeClassesRequest) {
                this.activeClassesRequest.abort();
                this.activeClassesRequest = null;
            }
            this.clearSelection();
            this.loadClasses();
            this.setupEventListeners();
        },

        getSavedLimit: function () {
            const saved = parseInt(localStorage.getItem(this.pageSizeStorageKey), 10);
            return [10, 20, 50, 100].includes(saved) ? saved : 10;
        },

        // Get API base path based on user role
        getApiBasePath: function () {
            // Map school_admin to admin API route
            if (this.userRole === 'school_admin') {
                return '/api/admin';
            }
            return `/api/${this.userRole || 'teacher'}`;
        },

        // Setup event listeners
        setupEventListeners: function () {
            // Search input
            const searchInput = document.getElementById('classesSearch');
            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    this.searchTerm = e.target.value;
                    this.currentPage = 1;
                    if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
                    this.searchDebounceTimer = setTimeout(() => {
                        this.loadClasses();
                    }, 300);
                });
            }

            // Grade filter
            const gradeFilter = document.getElementById('gradeFilter');
            if (gradeFilter) {
                gradeFilter.addEventListener('change', (e) => {
                    this.gradeFilter = e.target.value;
                    this.currentPage = 1;
                    this.loadClasses();
                });
            }

            const pageSizeSelect = document.getElementById('classesPerPage');
            if (pageSizeSelect) {
                pageSizeSelect.value = String(this.limit);
                pageSizeSelect.addEventListener('change', (e) => {
                    const nextLimit = parseInt(e.target.value, 10);
                    if (![10, 20, 50, 100].includes(nextLimit)) return;
                    this.limit = nextLimit;
                    localStorage.setItem(this.pageSizeStorageKey, String(nextLimit));
                    this.currentPage = 1;
                    this.loadClasses();
                });
            }

            // Add class button (only for admin)
            const addBtn = document.getElementById('addClassBtn');
            if (addBtn) {
                if (this.userRole === 'school_admin' || this.userRole === 'admin') {
                    addBtn.addEventListener('click', () => this.showClassModal());
                } else {
                    addBtn.style.display = 'none'; // Hide for teachers
                }
            }
        },

        // Load classes from API
        loadClasses: async function () {
            const container = document.getElementById('classesContainer');
            if (!container) return;
            this.clearSelection();

            if (this.activeClassesRequest) {
                this.activeClassesRequest.abort();
            }
            this.activeClassesRequest = new AbortController();

            // Show loading
            container.innerHTML = `
                <div style="text-align: center; padding: var(--spacing-3xl);">
                    <div class="spinner" style="display: inline-block;"></div>
                    <p style="margin-top: var(--spacing-lg); color: var(--text-secondary);">Loading classes...</p>
                </div>
            `;

            try {
                const token = localStorage.getItem('access_token');
                const params = new URLSearchParams({
                    page: this.currentPage,
                    limit: this.limit,
                    search: this.searchTerm,
                    grade: this.gradeFilter
                });

                const response = await fetch(`${this.getApiBasePath()}/classes?${params}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    },
                    signal: this.activeClassesRequest.signal
                });

                if (!response.ok) {
                    throw new Error('Failed to load classes');
                }

                const data = await response.json();
                this.renderClasses(data.classes, data.pagination);
            } catch (error) {
                if (error.name === 'AbortError') return;
                console.error('Load classes error:', error);
                container.innerHTML = `
                    <div class="error-message">
                        <p>Failed to load classes. Please try again.</p>
                    </div>
                `;
            } finally {
                this.activeClassesRequest = null;
            }
        },

        // Render classes table
        renderClasses: function (classes, pagination) {
            const container = document.getElementById('classesContainer');
            if (!container) return;
            this.lastRenderedClasses = classes;
            const canManage = this.userRole === 'school_admin' || this.userRole === 'admin';

            if (classes.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; padding: var(--spacing-3xl);">
                        <p style="color: var(--text-secondary);">No classes found.</p>
                    </div>
                `;
                return;
            }

            let html = `
                ${canManage ? `
                <div class="bulk-toolbar" id="classesBulkToolbar">
                    <div class="bulk-toolbar-left">
                        <span class="bulk-count-pill" id="classesBulkCount">0 selected</span>
                        <button class="btn btn-sm btn-outline" id="classesClearSelectionBtn" onclick="ClassesManager.clearSelection()">Clear</button>
                    </div>
                    <div class="bulk-toolbar-right">
                        <button class="btn btn-sm btn-danger" id="classesBulkDeleteBtn" onclick="ClassesManager.bulkDeleteClasses()" disabled>
                            Delete selected
                        </button>
                    </div>
                </div>
                ` : ''}
                <div class="table-responsive">
                    <table class="data-table">
                        <thead>
                            <tr>
                                ${canManage ? `
                                <th class="bulk-checkbox-cell">
                                    <input
                                        type="checkbox"
                                        id="classesSelectAll"
                                        onchange="ClassesManager.toggleSelectAllClasses(this.checked)"
                                        aria-label="Select all classes"
                                    >
                                </th>
                                ` : ''}
                                <th>Class Name</th>
                                <th>Grade Level</th>
                                <th>Academic Year</th>
                                <th>Homeroom Teacher</th>
                                <th>Students</th>
                                ${this.userRole === 'school_admin' ? '<th>Status</th>' : ''}
                                ${this.userRole === 'school_admin' ? '<th>Actions</th>' : '<th>Subjects</th>'}
                            </tr>
                        </thead>
                        <tbody>
            `;

            classes.forEach(cls => {
                const statusClass = cls.is_active ? 'status-active' : 'status-inactive';
                const statusText = cls.is_active ? 'Active' : 'Inactive';
                const teacherName = cls.homeroom_teacher_name || '<span class="text-secondary">Not assigned</span>';
                const safeClassName = (cls.name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                const isSelected = this.selectedIds.has(cls.id);

                html += `
                        <tr data-class-id="${cls.id}" class="${isSelected ? 'bulk-row-selected' : ''}">
                            ${canManage ? `
                            <td class="bulk-checkbox-cell">
                                <input
                                    type="checkbox"
                                    class="bulk-row-checkbox"
                                    ${isSelected ? 'checked' : ''}
                                    onchange="ClassesManager.toggleSelectClass('${cls.id}')"
                                    aria-label="Select ${cls.name || 'class'}"
                                >
                            </td>
                            ` : ''}
                            <td>
                                <div class="user-name">
                                    <a href="class-details.html?id=${cls.id}" class="class-link">${cls.name}</a>
                                </div>
                            </td>
                            <td>${cls.grade_level} класс</td>
                            <td>${cls.academic_year}</td>
                            <td>${teacherName}</td>
                            <td>${cls.student_count || 0} students</td>
                    `;

                if (this.userRole === 'school_admin') {
                    html += `
                        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                        <td>
                            <div class="action-buttons">
                                <button class="btn-icon" onclick="ClassesManager.editClass('${cls.id}')" title="Edit">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                    </svg>
                                </button>
                                <button class="btn-icon btn-danger" onclick="ClassesManager.deleteClass('${cls.id}', '${safeClassName}')" title="Delete">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <polyline points="3 6 5 6 21 6"></polyline>
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                    </svg>
                                </button>
                            </div>
                        </td>
                    `;
                } else {
                    // For teachers, show subject count
                    html += `
                        <td>${cls.subject_count || 0} subjects</td>
                    `;
                }

                html += `
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
            if (canManage) {
                this.syncSelectionUi();
            }
        },

        toggleSelectClass: function (classId) {
            if (this.selectedIds.has(classId)) {
                this.selectedIds.delete(classId);
            } else {
                this.selectedIds.add(classId);
            }
            this.syncSelectionUi();
        },

        toggleSelectAllClasses: function (checked) {
            const currentIds = this.lastRenderedClasses.map(cls => cls.id);
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
            const countEl = document.getElementById('classesBulkCount');
            if (countEl) {
                countEl.textContent = `${count} selected`;
            }

            const deleteBtn = document.getElementById('classesBulkDeleteBtn');
            if (deleteBtn) {
                deleteBtn.disabled = count === 0;
            }

            const clearBtn = document.getElementById('classesClearSelectionBtn');
            if (clearBtn) {
                clearBtn.disabled = count === 0;
            }

            const selectAllEl = document.getElementById('classesSelectAll');
            if (selectAllEl) {
                const currentIds = this.lastRenderedClasses.map(cls => cls.id);
                const selectedOnPage = currentIds.filter(id => this.selectedIds.has(id)).length;
                selectAllEl.checked = currentIds.length > 0 && selectedOnPage === currentIds.length;
                selectAllEl.indeterminate = selectedOnPage > 0 && selectedOnPage < currentIds.length;
            }

            document.querySelectorAll('tr[data-class-id]').forEach(row => {
                row.classList.toggle('bulk-row-selected', this.selectedIds.has(row.dataset.classId));
            });
        },

        bulkDeleteClasses: async function () {
            const ids = Array.from(this.selectedIds);
            if (ids.length === 0) return;

            const confirmed = await showConfirm(`Are you sure you want to delete ${ids.length} selected classes permanently?`);
            if (!confirmed) return;

            const token = localStorage.getItem('access_token');
            let failed = 0;

            const results = await Promise.allSettled(
                ids.map(id => fetch(`${this.getApiBasePath()}/classes/${id}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }))
            );

            results.forEach(result => {
                if (result.status !== 'fulfilled' || !result.value.ok) {
                    failed += 1;
                }
            });

            const deleted = ids.length - failed;
            this.clearSelection();
            if (failed > 0) {
                showAlert(`Deleted: ${deleted}. Failed: ${failed}.`, 'Bulk delete result');
            }
            this.loadClasses();
        },

        // Render pagination
        renderPagination: function (pagination) {
            let html = '<div class="pagination">';
            const totalPages = Math.max(1, Number(pagination.pages) || 1);
            const currentPage = Math.min(Math.max(1, Number(pagination.page) || 1), totalPages);

            if (currentPage > 1) {
                html += `<button class="pagination-btn" onclick="ClassesManager.goToPage(${currentPage - 1})">Previous</button>`;
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
                    html += `<button class="pagination-btn" onclick="ClassesManager.goToPage(${i})">${i}</button>`;
                }
                prevPage = i;
            }

            if (currentPage < totalPages) {
                html += `<button class="pagination-btn" onclick="ClassesManager.goToPage(${currentPage + 1})">Next</button>`;
            }

            html += '</div>';
            return html;
        },

        // Go to page
        goToPage: function (page) {
            this.currentPage = page;
            this.loadClasses();
        },

        // Show class modal (create/edit)
        showClassModal: async function (classId = null) {
            const isEdit = classId !== null;
            let classData = null;

            // Load class data if editing
            if (isEdit) {
                try {
                    const token = localStorage.getItem('access_token');
                    const response = await fetch(`${this.getApiBasePath()}/classes/${classId}`, {
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });

                    if (response.ok) {
                        const data = await response.json();
                        classData = data.class;
                    } else {
                        showAlert('Failed to load class data');
                        return;
                    }
                } catch (error) {
                    console.error('Load class error:', error);
                    showAlert('Failed to load class data');
                    return;
                }
            }

            // Load teachers list (only for admin)
            let teachersList = [];
            if (this.userRole === 'school_admin') {
                try {
                    const token = localStorage.getItem('access_token');
                    const response = await fetch(`${this.getApiBasePath()}/teachers`, {
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });

                    if (response.ok) {
                        const data = await response.json();
                        teachersList = data.teachers;
                    }
                } catch (error) {
                    console.error('Load teachers error:', error);
                }
            }

            // Create modal HTML
            const modalHtml = `
                <div class="modal-overlay" id="classModal">
                    <div class="modal">
                        <div class="modal-header">
                            <h2 class="modal-title">${isEdit ? 'Edit Class' : 'Add New Class'}</h2>
                            <button class="modal-close" onclick="ClassesManager.closeModal()">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </div>
                        <div class="modal-body">
                            <form id="classForm" onsubmit="return ClassesManager.submitClass(event, ${classId ? `'${classId}'` : 'null'})">
                                <div class="form-row">
                                    <div class="form-group">
                                        <label class="form-label">
                                            Class Name <span class="required">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            class="form-input"
                                            name="name"
                                            value="${classData?.name || ''}"
                                            required
                                            placeholder="9-A"
                                        />
                                        <span class="form-hint">Example: 9-A, 10-B, 11-В</span>
                                    </div>

                                    <div class="form-group">
                                        <label class="form-label">
                                            Grade Level <span class="required">*</span>
                                        </label>
                                        <select class="form-input" name="grade_level" required>
                                            <option value="">Select grade</option>
                                            ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(grade =>
                `<option value="${grade}" ${classData?.grade_level === grade ? 'selected' : ''}>${grade} класс</option>`
            ).join('')}
                                        </select>
                                    </div>
                                </div>

                                <div class="form-row">
                                    <div class="form-group">
                                        <label class="form-label">
                                            Academic Year <span class="required">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            class="form-input"
                                            name="academic_year"
                                            value="${classData?.academic_year || '2024-2025'}"
                                            required
                                            placeholder="2024-2025"
                                        />
                                        <span class="form-hint">Format: YYYY-YYYY</span>
                                    </div>

                                    <div class="form-group">
                                        <label class="form-label">Homeroom Teacher</label>
                                        <select class="form-input" name="homeroom_teacher_id">
                                            <option value="">No teacher assigned</option>
                                            ${teachersList.map(teacher =>
                `<option value="${teacher.id}" ${classData?.homeroom_teacher_id === teacher.id ? 'selected' : ''}>${teacher.name}</option>`
            ).join('')}
                                        </select>
                                    </div>
                                </div>

                                ${isEdit ? `
                                <div class="form-group">
                                    <div class="form-check">
                                        <input
                                            type="checkbox"
                                            class="form-check-input"
                                            id="classActive"
                                            name="is_active"
                                            ${classData?.is_active ? 'checked' : ''}
                                        />
                                        <label class="form-check-label" for="classActive">
                                            Active
                                        </label>
                                    </div>
                                </div>
                                ` : ''}

                                <div id="formAlert" class="hidden"></div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-outline" onclick="ClassesManager.closeModal()">
                                Cancel
                            </button>
                            <button type="submit" form="classForm" class="btn btn-primary" id="submitBtn">
                                ${isEdit ? 'Update Class' : 'Create Class'}
                            </button>
                        </div>
                    </div>
                </div>
            `;

            // Add modal to body
            document.body.insertAdjacentHTML('beforeend', modalHtml);

            // Close on overlay click
            document.getElementById('classModal').addEventListener('click', (e) => {
                if (e.target.id === 'classModal') {
                    this.closeModal();
                }
            });

            // Close on Escape key
            document.addEventListener('keydown', this.handleEscapeKey);
        },

        // Handle Escape key
        handleEscapeKey: function (e) {
            if (e.key === 'Escape') {
                ClassesManager.closeModal();
            }
        },

        // Close modal
        closeModal: function () {
            const modal = document.getElementById('classModal');
            if (modal) {
                modal.remove();
            }
            document.removeEventListener('keydown', this.handleEscapeKey);
        },

        // Submit class form
        submitClass: async function (event, classId) {
            event.preventDefault();

            const form = event.target;
            const submitBtn = document.getElementById('submitBtn');
            const formAlert = document.getElementById('formAlert');

            // Get form data
            const formData = new FormData(form);
            const data = {
                name: formData.get('name').trim(),
                grade_level: parseInt(formData.get('grade_level')),
                academic_year: formData.get('academic_year').trim(),
                homeroom_teacher_id: formData.get('homeroom_teacher_id') || null
            };

            if (classId) {
                data.is_active = formData.get('is_active') === 'on';
            }

            // Validation
            if (!data.name || !data.grade_level || !data.academic_year) {
                formAlert.className = 'alert alert-error';
                formAlert.textContent = 'Please fill all required fields';
                return false;
            }

            // Show loading
            submitBtn.classList.add('loading');
            submitBtn.disabled = true;
            formAlert.className = 'hidden';

            try {
                const token = localStorage.getItem('access_token');
                const url = classId
                    ? `${this.getApiBasePath()}/classes/${classId}`
                    : `${this.getApiBasePath()}/classes`;
                const method = classId ? 'PUT' : 'POST';

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
                    formAlert.className = 'alert alert-success';
                    formAlert.textContent = result.message;

                    // Reload classes list
                    setTimeout(() => {
                        this.closeModal();
                        this.loadClasses();
                    }, 1000);
                } else {
                    // Show error
                    formAlert.className = 'alert alert-error';
                    formAlert.textContent = result.message || 'An error occurred';
                }
            } catch (error) {
                console.error('Submit class error:', error);
                formAlert.className = 'alert alert-error';
                formAlert.textContent = 'Network error. Please try again.';
            } finally {
                submitBtn.classList.remove('loading');
                submitBtn.disabled = false;
            }
            return false;
        },

        // Edit class
        editClass: function (classId) {
            this.showClassModal(classId);
        },

        // Delete class
        deleteClass: async function (classId, className) {
            const confirmed = await showConfirm(`Are you sure you want to delete class "${className}" permanently?`);
            if (!confirmed) {
                return;
            }

            try {
                const token = localStorage.getItem('access_token');
                const response = await fetch(`${this.getApiBasePath()}/classes/${classId}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (response.ok) {
                    this.selectedIds.delete(classId);
                    this.loadClasses();
                } else {
                    showAlert('Failed to delete class');
                }
            } catch (error) {
                console.error('Delete class error:', error);
                showAlert('Failed to delete class');
            }
        }
    };
})();
