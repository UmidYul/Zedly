// Subjects Management Component
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

    function showBulkProgress(total) {
        const existing = document.getElementById('subjectsBulkDeleteOverlay');
        if (existing) existing.remove();
        const overlay = document.createElement('div');
        overlay.id = 'subjectsBulkDeleteOverlay';
        overlay.className = 'operation-progress-overlay';
        overlay.innerHTML = `
            <div class="operation-progress-modal">
                <div class="progress-head">
                    <div class="progress-label"><span class="spinner" style="display:inline-block;"></span><span>Массовое удаление...</span></div>
                    <strong id="subjectsBulkDeletePercent">0%</strong>
                </div>
                <div class="progress-track"><div class="progress-fill" id="subjectsBulkDeleteFill" style="width:0%"></div></div>
                <div id="subjectsBulkDeleteMeta" class="text-secondary" style="margin-top:8px;">0 / ${Number(total) || 0}</div>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    function updateBulkProgress(done, total, failed) {
        const safeTotal = Math.max(1, Number(total) || 1);
        const safeDone = Math.min(safeTotal, Math.max(0, Number(done) || 0));
        const percent = Math.round((safeDone / safeTotal) * 100);
        const fill = document.getElementById('subjectsBulkDeleteFill');
        const pct = document.getElementById('subjectsBulkDeletePercent');
        const meta = document.getElementById('subjectsBulkDeleteMeta');
        if (fill) fill.style.width = `${percent}%`;
        if (pct) pct.textContent = `${percent}%`;
        if (meta) meta.textContent = `${safeDone} / ${safeTotal}` + (failed ? ` · Failed: ${failed}` : '');
    }

    function hideBulkProgress() {
        const overlay = document.getElementById('subjectsBulkDeleteOverlay');
        if (overlay) overlay.remove();
    }

    window.SubjectsManager = {
        currentPage: 1,
        limit: 10,
        searchTerm: '',
        selectedIds: new Set(),
        lastRenderedSubjects: [],
        searchDebounceTimer: null,
        activeSubjectsRequest: null,

        // Initialize subjects page
        init: function () {
            if (this.searchDebounceTimer) {
                clearTimeout(this.searchDebounceTimer);
                this.searchDebounceTimer = null;
            }
            if (this.activeSubjectsRequest) {
                this.activeSubjectsRequest.abort();
                this.activeSubjectsRequest = null;
            }
            this.clearSelection();
            this.loadSubjects();
            this.setupEventListeners();
        },

        // Setup event listeners
        setupEventListeners: function () {
            // Search input
            const searchInput = document.getElementById('subjectsSearch');
            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    this.searchTerm = e.target.value;
                    this.currentPage = 1;
                    if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
                    this.searchDebounceTimer = setTimeout(() => {
                        this.loadSubjects();
                    }, 300);
                });
            }

            // Add subject button
            const addBtn = document.getElementById('addSubjectBtn');
            if (addBtn) {
                addBtn.addEventListener('click', () => this.showSubjectModal());
            }
        },

        // Load subjects from API
        loadSubjects: async function () {
            const container = document.getElementById('subjectsContainer');
            if (!container) return;
            this.clearSelection();

            if (this.activeSubjectsRequest) {
                this.activeSubjectsRequest.abort();
            }
            this.activeSubjectsRequest = new AbortController();

            // Show loading
            container.innerHTML = `
                <div style="text-align: center; padding: var(--spacing-3xl);">
                    <div class="spinner" style="display: inline-block;"></div>
                    <p style="margin-top: var(--spacing-lg); color: var(--text-secondary);">Loading subjects...</p>
                </div>
            `;

            try {
                const token = localStorage.getItem('access_token');
                const params = new URLSearchParams({
                    page: this.currentPage,
                    limit: this.limit,
                    search: this.searchTerm
                });

                const response = await fetch(`/api/admin/subjects?${params}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    },
                    signal: this.activeSubjectsRequest.signal
                });

                if (!response.ok) {
                    throw new Error('Failed to load subjects');
                }

                const data = await response.json();
                this.renderSubjects(data.subjects, data.pagination);
            } catch (error) {
                if (error.name === 'AbortError') return;
                console.error('Load subjects error:', error);
                container.innerHTML = `
                    <div class="error-message">
                        <p>Failed to load subjects. Please try again.</p>
                    </div>
                `;
            } finally {
                this.activeSubjectsRequest = null;
            }
        },

        // Render subjects table
        renderSubjects: function (subjects, pagination) {
            const container = document.getElementById('subjectsContainer');
            if (!container) return;
            this.lastRenderedSubjects = subjects;

            if (subjects.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; padding: var(--spacing-3xl);">
                        <p style="color: var(--text-secondary);">No subjects found.</p>
                    </div>
                `;
                return;
            }

            let html = `
                <div class="bulk-toolbar" id="subjectsBulkToolbar">
                    <div class="bulk-toolbar-left">
                        <span class="bulk-count-pill" id="subjectsBulkCount">0 selected</span>
                        <button class="btn btn-sm btn-outline" id="subjectsClearSelectionBtn" onclick="SubjectsManager.clearSelection()">Clear</button>
                    </div>
                    <div class="bulk-toolbar-right">
                        <button class="btn btn-sm btn-danger" id="subjectsBulkDeleteBtn" onclick="SubjectsManager.bulkDeleteSubjects()" disabled>
                            Delete selected
                        </button>
                    </div>
                </div>
                <div class="table-responsive">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th class="bulk-checkbox-cell">
                                    <input
                                        type="checkbox"
                                        id="subjectsSelectAll"
                                        onchange="SubjectsManager.toggleSelectAllSubjects(this.checked)"
                                        aria-label="Select all subjects"
                                    >
                                </th>
                                <th>Code</th>
                                <th>Subject Name</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            subjects.forEach(subject => {
                const statusClass = subject.is_active ? 'status-active' : 'status-inactive';
                const statusText = subject.is_active ? 'Active' : 'Inactive';
                const safeName = (subject.name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                const isSelected = this.selectedIds.has(subject.id);

                html += `
                    <tr data-subject-id="${subject.id}" class="${isSelected ? 'bulk-row-selected' : ''}">
                        <td class="bulk-checkbox-cell">
                            <input
                                type="checkbox"
                                class="bulk-row-checkbox"
                                ${isSelected ? 'checked' : ''}
                                onchange="SubjectsManager.toggleSelectSubject('${subject.id}')"
                                aria-label="Select ${subject.name || 'subject'}"
                            >
                        </td>
                        <td>
                            <span class="role-badge" style="background: ${subject.color}15; color: ${subject.color};">
                                ${subject.code}
                            </span>
                        </td>
                        <td>
                            <div class="user-name">${subject.name}</div>
                        </td>
                        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                        <td>
                            <div class="action-buttons">
                                <button class="btn-icon" onclick="SubjectsManager.editSubject('${subject.id}')" title="Edit">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                    </svg>
                                </button>
                                <button class="btn-icon btn-danger" onclick="SubjectsManager.deleteSubject('${subject.id}', '${safeName}')" title="Delete">
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

        toggleSelectSubject: function (subjectId) {
            const normalizedId = String(subjectId);
            if (this.selectedIds.has(normalizedId)) {
                this.selectedIds.delete(normalizedId);
            } else {
                this.selectedIds.add(normalizedId);
            }
            this.syncSelectionUi();
        },

        toggleSelectAllSubjects: function (checked) {
            const currentIds = this.lastRenderedSubjects.map(subject => String(subject.id));
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
            const countEl = document.getElementById('subjectsBulkCount');
            if (countEl) {
                countEl.textContent = `${count} selected`;
            }

            const deleteBtn = document.getElementById('subjectsBulkDeleteBtn');
            if (deleteBtn) {
                deleteBtn.disabled = count === 0;
            }

            const clearBtn = document.getElementById('subjectsClearSelectionBtn');
            if (clearBtn) {
                clearBtn.disabled = count === 0;
            }

            const selectAllEl = document.getElementById('subjectsSelectAll');
            if (selectAllEl) {
                const currentIds = this.lastRenderedSubjects.map(subject => String(subject.id));
                const selectedOnPage = currentIds.filter(id => this.selectedIds.has(id)).length;
                selectAllEl.checked = currentIds.length > 0 && selectedOnPage === currentIds.length;
                selectAllEl.indeterminate = selectedOnPage > 0 && selectedOnPage < currentIds.length;
            }

            document.querySelectorAll('tr[data-subject-id]').forEach(row => {
                row.classList.toggle('bulk-row-selected', this.selectedIds.has(row.dataset.subjectId));
            });
        },

        bulkDeleteSubjects: async function () {
            const ids = Array.from(this.selectedIds);
            if (ids.length === 0) return;

            const confirmed = await showConfirm(`Are you sure you want to delete ${ids.length} selected subjects permanently?`);
            if (!confirmed) return;

            const token = localStorage.getItem('access_token');
            let failed = 0;
            let done = 0;
            showBulkProgress(ids.length);
            updateBulkProgress(done, ids.length, failed);
            try {
                for (const id of ids) {
                    try {
                        const response = await fetch(`/api/admin/subjects/${id}`, {
                            method: 'DELETE',
                            headers: {
                                'Authorization': `Bearer ${token}`
                            }
                        });
                        if (!response.ok) failed += 1;
                    } catch (_) {
                        failed += 1;
                    }
                    done += 1;
                    updateBulkProgress(done, ids.length, failed);
                }
            } finally {
                setTimeout(hideBulkProgress, 240);
            }

            const deleted = ids.length - failed;
            this.clearSelection();
            if (failed > 0) {
                showAlert(`Deleted: ${deleted}. Failed: ${failed}.`, 'Bulk delete result');
            }
            this.loadSubjects();
        },

        // Render pagination
        renderPagination: function (pagination) {
            let html = '<div class="pagination">';
            const totalPages = Math.max(1, Number(pagination.pages) || 1);
            const currentPage = Math.min(Math.max(1, Number(pagination.page) || 1), totalPages);

            if (currentPage > 1) {
                html += `<button class="pagination-btn" onclick="SubjectsManager.goToPage(${currentPage - 1})">Previous</button>`;
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
                    html += `<button class="pagination-btn" onclick="SubjectsManager.goToPage(${i})">${i}</button>`;
                }
                prevPage = i;
            }

            if (currentPage < totalPages) {
                html += `<button class="pagination-btn" onclick="SubjectsManager.goToPage(${currentPage + 1})">Next</button>`;
            }

            html += '</div>';
            return html;
        },

        // Go to page
        goToPage: function (page) {
            this.currentPage = page;
            this.loadSubjects();
        },

        // Show subject modal (create/edit)
        showSubjectModal: async function (subjectId = null) {
            const isEdit = subjectId !== null;
            let subject = null;
            const subjectIdArg = JSON.stringify(subjectId);

            // Load subject data if editing
            if (isEdit) {
                try {
                    const token = localStorage.getItem('access_token');
                    const response = await fetch(`/api/admin/subjects/${subjectId}`, {
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });

                    if (response.ok) {
                        const data = await response.json();
                        subject = data.subject;
                    } else {
                        showAlert('Failed to load subject data');
                        return;
                    }
                } catch (error) {
                    console.error('Load subject error:', error);
                    showAlert('Failed to load subject data');
                    return;
                }
            }


            // Create modal HTML
            const modalHtml = `
                <div class="modal-overlay" id="subjectModal">
                    <div class="modal">
                        <div class="modal-header">
                            <h2 class="modal-title">${isEdit ? 'Edit Subject' : 'Add New Subject'}</h2>
                            <button class="modal-close" onclick="SubjectsManager.closeModal()">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </div>
                        <div class="modal-body">
                            <form id="subjectForm" onsubmit="SubjectsManager.submitSubject(event, ${subjectIdArg})">
                                <div class="form-row">
                                    <div class="form-group">
                                        <label class="form-label">
                                            Subject Name <span class="required">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            class="form-input"
                                            name="name"
                                            value="${subject?.name || ''}"
                                            required
                                            placeholder="Математика"
                                        />
                                    </div>

                                    <div class="form-group">
                                        <label class="form-label">
                                            Subject Code <span class="required">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            class="form-input"
                                            name="code"
                                            value="${subject?.code || ''}"
                                            required
                                            placeholder="MATH"
                                            maxlength="10"
                                            style="text-transform: uppercase;"
                                        />
                                        <span class="form-hint">Short code (e.g., MATH, PHYS, CHEM)</span>
                                    </div>
                                </div>

                                ${isEdit ? `
                                <div class="form-group">
                                    <div class="form-check">
                                        <input
                                            type="checkbox"
                                            class="form-check-input"
                                            id="subjectActive"
                                            name="is_active"
                                            ${subject?.is_active ? 'checked' : ''}
                                        />
                                        <label class="form-check-label" for="subjectActive">
                                            Active
                                        </label>
                                    </div>
                                </div>
                                ` : ''}

                                <div id="formAlert" class="hidden"></div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-outline" onclick="SubjectsManager.closeModal()">
                                Cancel
                            </button>
                            <button type="submit" form="subjectForm" class="btn btn-primary" id="submitBtn">
                                ${isEdit ? 'Update Subject' : 'Create Subject'}
                            </button>
                        </div>
                    </div>
                </div>

            `;

            // Add modal to body
            document.body.insertAdjacentHTML('beforeend', modalHtml);

            // Close on overlay click
            document.getElementById('subjectModal').addEventListener('click', (e) => {
                if (e.target.id === 'subjectModal') {
                    this.closeModal();
                }
            });

            // Close on Escape key
            document.addEventListener('keydown', this.handleEscapeKey);
        },

        // Handle Escape key
        handleEscapeKey: function (e) {
            if (e.key === 'Escape') {
                SubjectsManager.closeModal();
            }
        },

        // Close modal
        closeModal: function () {
            const modal = document.getElementById('subjectModal');
            if (modal) {
                modal.remove();
            }
            document.removeEventListener('keydown', this.handleEscapeKey);
        },

        // Submit subject form
        submitSubject: async function (event, subjectId) {
            event.preventDefault();

            const form = event.target;
            const submitBtn = document.getElementById('submitBtn');
            const formAlert = document.getElementById('formAlert');

            // Get form data
            const formData = new FormData(form);
            const data = {
                name: formData.get('name').trim(),
                code: formData.get('code').trim().toUpperCase()
            };

            if (subjectId) {
                data.is_active = formData.get('is_active') === 'on';
            }

            // Validation
            if (!data.name || !data.code) {
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
                const url = subjectId
                    ? `/api/admin/subjects/${subjectId}`
                    : '/api/admin/subjects';
                const method = subjectId ? 'PUT' : 'POST';

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

                    // Reload subjects list
                    setTimeout(() => {
                        this.closeModal();
                        this.loadSubjects();
                    }, 1000);
                } else {
                    // Show error
                    formAlert.className = 'alert alert-error';
                    formAlert.textContent = result.message || 'An error occurred';
                }
            } catch (error) {
                console.error('Submit subject error:', error);
                formAlert.className = 'alert alert-error';
                formAlert.textContent = 'Network error. Please try again.';
            } finally {
                submitBtn.classList.remove('loading');
                submitBtn.disabled = false;
            }
        },

        // Edit subject
        editSubject: function (subjectId) {
            this.showSubjectModal(subjectId);
        },

        // Delete subject
        deleteSubject: async function (subjectId, subjectName) {
            const confirmed = await showConfirm(`Are you sure you want to delete subject "${subjectName}" permanently?`);
            if (!confirmed) {
                return;
            }

            try {
                const token = localStorage.getItem('access_token');
                const response = await fetch(`/api/admin/subjects/${subjectId}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (response.ok) {
                    this.selectedIds.delete(subjectId);
                    this.loadSubjects();
                } else {
                    showAlert('Failed to delete subject');
                }
            } catch (error) {
                console.error('Delete subject error:', error);
                showAlert('Failed to delete subject');
            }
        }
    };
})();
