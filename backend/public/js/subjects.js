// Subjects Management Component
(function () {
    'use strict';

    window.SubjectsManager = {
        currentPage: 1,
        limit: 10,
        searchTerm: '',

        // Initialize subjects page
        init: function () {
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
                    this.loadSubjects();
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
                    }
                });

                if (!response.ok) {
                    throw new Error('Failed to load subjects');
                }

                const data = await response.json();
                this.renderSubjects(data.subjects, data.pagination);
            } catch (error) {
                console.error('Load subjects error:', error);
                container.innerHTML = `
                    <div class="error-message">
                        <p>Failed to load subjects. Please try again.</p>
                    </div>
                `;
            }
        },

        // Render subjects table
        renderSubjects: function (subjects, pagination) {
            const container = document.getElementById('subjectsContainer');
            if (!container) return;

            if (subjects.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; padding: var(--spacing-3xl);">
                        <p style="color: var(--text-secondary);">No subjects found.</p>
                    </div>
                `;
                return;
            }

            let html = `
                <div class="table-responsive">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Code</th>
                                <th>Subject Name</th>
                                <th>Color</th>
                                <th>Description</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            subjects.forEach(subject => {
                const statusClass = subject.is_active ? 'status-active' : 'status-inactive';
                const statusText = subject.is_active ? 'Active' : 'Inactive';
                const description = subject.description || '<span class="text-secondary">No description</span>';

                html += `
                    <tr>
                        <td>
                            <span class="role-badge" style="background: ${subject.color}15; color: ${subject.color};">
                                ${subject.code}
                            </span>
                        </td>
                        <td>
                            <div class="user-name">${subject.name}</div>
                        </td>
                        <td>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <div style="width: 24px; height: 24px; border-radius: 4px; background: ${subject.color};"></div>
                                <span class="text-secondary">${subject.color}</span>
                            </div>
                        </td>
                        <td>${description}</td>
                        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                        <td>
                            <div class="action-buttons">
                                <button class="btn-icon" onclick="SubjectsManager.editSubject('${subject.id}')" title="Edit">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                    </svg>
                                </button>
                                <button class="btn-icon btn-danger" onclick="SubjectsManager.deleteSubject('${subject.id}', '${subject.name}')" title="Delete">
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

            if (pagination.page > 1) {
                html += `<button class="pagination-btn" onclick="SubjectsManager.goToPage(${pagination.page - 1})">Previous</button>`;
            }

            for (let i = 1; i <= pagination.pages; i++) {
                if (i === pagination.page) {
                    html += `<button class="pagination-btn active">${i}</button>`;
                } else {
                    html += `<button class="pagination-btn" onclick="SubjectsManager.goToPage(${i})">${i}</button>`;
                }
            }

            if (pagination.page < pagination.pages) {
                html += `<button class="pagination-btn" onclick="SubjectsManager.goToPage(${pagination.page + 1})">Next</button>`;
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
                        alert('Failed to load subject data');
                        return;
                    }
                } catch (error) {
                    console.error('Load subject error:', error);
                    alert('Failed to load subject data');
                    return;
                }
            }

            // Predefined colors
            const colors = [
                '#4A90E2', '#E94C4C', '#50C878', '#F59E0B',
                '#8B5CF6', '#EC4899', '#06B6D4', '#10B981',
                '#F97316', '#6366F1', '#84CC16', '#EF4444'
            ];

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
                            <form id="subjectForm" onsubmit="SubjectsManager.submitSubject(event, ${subjectId})">
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

                                <div class="form-group">
                                    <label class="form-label">Color</label>
                                    <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px;">
                                        ${colors.map(color => `
                                            <label style="cursor: pointer;">
                                                <input
                                                    type="radio"
                                                    name="color"
                                                    value="${color}"
                                                    ${(subject?.color === color || (!subject && color === '#4A90E2')) ? 'checked' : ''}
                                                    style="display: none;"
                                                />
                                                <div style="
                                                    width: 40px;
                                                    height: 40px;
                                                    border-radius: 8px;
                                                    background: ${color};
                                                    border: 3px solid transparent;
                                                    transition: all 0.2s;
                                                " class="color-option"></div>
                                            </label>
                                        `).join('')}
                                    </div>
                                </div>

                                <div class="form-group">
                                    <label class="form-label">Description</label>
                                    <textarea
                                        class="form-textarea"
                                        name="description"
                                        placeholder="Brief description of the subject"
                                        rows="3"
                                    >${subject?.description || ''}</textarea>
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

                <style>
                    .color-option {
                        cursor: pointer;
                    }
                    input[type="radio"]:checked + .color-option {
                        border-color: var(--text-primary) !important;
                        box-shadow: 0 0 0 1px var(--bg-secondary), 0 0 0 3px var(--text-primary);
                    }
                </style>
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
                code: formData.get('code').trim().toUpperCase(),
                color: formData.get('color'),
                description: formData.get('description')?.trim() || null
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
            if (!confirm(`Are you sure you want to deactivate subject "${subjectName}"?`)) {
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
                    this.loadSubjects();
                } else {
                    alert('Failed to delete subject');
                }
            } catch (error) {
                console.error('Delete subject error:', error);
                alert('Failed to delete subject');
            }
        }
    };
})();
