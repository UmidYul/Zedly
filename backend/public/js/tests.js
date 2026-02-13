// Tests Management Component (Teacher)
(function () {
    'use strict';

    function normalizeHexColor(input, fallback = '#2563EB') {
        const value = String(input || '').trim();
        const fullHexMatch = value.match(/^#([0-9a-fA-F]{6})$/);
        if (fullHexMatch) return `#${fullHexMatch[1]}`;

        const shortHexMatch = value.match(/^#([0-9a-fA-F]{3})$/);
        if (shortHexMatch) {
            const [r, g, b] = shortHexMatch[1].split('');
            return `#${r}${r}${g}${g}${b}${b}`;
        }

        return fallback;
    }

    function hexToRgb(hex) {
        const normalized = normalizeHexColor(hex);
        return {
            r: parseInt(normalized.slice(1, 3), 16),
            g: parseInt(normalized.slice(3, 5), 16),
            b: parseInt(normalized.slice(5, 7), 16)
        };
    }

    function getReadableTextColor(hex) {
        const { r, g, b } = hexToRgb(hex);
        const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        return luminance > 0.62 ? '#0F172A' : '#FFFFFF';
    }

    function buildSubjectBadgeStyle(hex) {
        const base = normalizeHexColor(hex, '#4A90E2');
        const text = getReadableTextColor(base);
        const { r, g, b } = hexToRgb(base);

        return [
            `background-color: rgba(${r}, ${g}, ${b}, 0.2)`,
            `border: 1px solid rgba(${r}, ${g}, ${b}, 0.42)`,
            `color: ${text}`
        ].join('; ');
    }

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

    window.TestsManager = {
        currentPage: 1,
        limit: 10,
        searchTerm: '',
        subjectFilter: 'all',
        statusFilter: 'all',
        subjects: [],
        selectedIds: new Set(),
        lastRenderedTests: [],

        // Initialize tests page
        init: async function () {
            this.clearSelection();
            await this.loadSubjects();
            this.loadTests();
            this.setupEventListeners();
        },

        // Load subjects for filter
        loadSubjects: async function () {
            try {
                const token = localStorage.getItem('access_token');
                const response = await fetch('/api/teacher/subjects', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (response.ok) {
                    const data = await response.json();
                    this.subjects = data.subjects;
                    this.renderSubjectFilter();
                }
            } catch (error) {
                console.error('Load subjects error:', error);
            }
        },

        renderSubjectFilter: function () {
            const subjectFilter = document.getElementById('subjectFilter');
            if (!subjectFilter) return;

            subjectFilter.innerHTML = '<option value="all">All Subjects</option>';
            this.subjects.forEach(subject => {
                const option = document.createElement('option');
                option.value = subject.id;
                option.textContent = subject.name || subject.name_ru || subject.name_uz || 'Subject';
                subjectFilter.appendChild(option);
            });
        },

        // Setup event listeners
        setupEventListeners: function () {
            // Search input
            const searchInput = document.getElementById('testsSearch');
            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    this.searchTerm = e.target.value;
                    this.currentPage = 1;
                    this.loadTests();
                });
            }

            // Subject filter
            const subjectFilter = document.getElementById('subjectFilter');
            if (subjectFilter) {
                subjectFilter.addEventListener('change', (e) => {
                    this.subjectFilter = e.target.value;
                    this.currentPage = 1;
                    this.loadTests();
                });
            }

            // Status filter
            const statusFilter = document.getElementById('statusFilter');
            if (statusFilter) {
                statusFilter.addEventListener('change', (e) => {
                    this.statusFilter = e.target.value;
                    this.currentPage = 1;
                    this.loadTests();
                });
            }

            // Add test button
            const addBtn = document.getElementById('addTestBtn');
            if (addBtn) {
                addBtn.addEventListener('click', () => this.showTestEditor());
            }
        },

        // Load tests from API
        loadTests: async function () {
            const container = document.getElementById('testsContainer');
            if (!container) return;
            this.clearSelection();

            // Show loading
            container.innerHTML = `
                <div style="text-align: center; padding: var(--spacing-3xl);">
                    <div class="spinner" style="display: inline-block;"></div>
                    <p style="margin-top: var(--spacing-lg); color: var(--text-secondary);">Loading tests...</p>
                </div>
            `;

            try {
                const token = localStorage.getItem('access_token');
                const params = new URLSearchParams({
                    page: this.currentPage,
                    limit: this.limit,
                    search: this.searchTerm,
                    subject: this.subjectFilter,
                    status: this.statusFilter
                });

                const response = await fetch(`/api/teacher/tests?${params}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (!response.ok) throw new Error('Failed to load tests');

                const data = await response.json();
                this.renderTests(data.tests, data.pagination);
            } catch (error) {
                console.error('Load tests error:', error);
                container.innerHTML = `
                    <div class="error-message">
                        <p>Failed to load tests. Please try again.</p>
                    </div>
                `;
            }
        },

        // Render tests list
        renderTests: function (tests, pagination) {
            const container = document.getElementById('testsContainer');
            if (!container) return;
            this.lastRenderedTests = tests;

            if (tests.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; padding: var(--spacing-3xl);">
                        <p style="color: var(--text-secondary);">No tests found. Create your first test!</p>
                    </div>
                `;
                return;
            }

            let html = `
                <div class="bulk-toolbar" id="testsBulkToolbar">
                    <div class="bulk-toolbar-left">
                        <label class="bulk-inline-checkbox">
                            <input
                                type="checkbox"
                                id="testsSelectAll"
                                onchange="TestsManager.toggleSelectAllTests(this.checked)"
                                aria-label="Select all tests"
                            >
                            <span>Select all on page</span>
                        </label>
                        <span class="bulk-count-pill" id="testsBulkCount">0 selected</span>
                        <button class="btn btn-sm btn-outline" id="testsClearSelectionBtn" onclick="TestsManager.clearSelection()">Clear</button>
                    </div>
                    <div class="bulk-toolbar-right">
                        <button class="btn btn-sm btn-danger" id="testsBulkDeleteBtn" onclick="TestsManager.bulkDeleteTests()" disabled>
                            Delete selected
                        </button>
                    </div>
                </div>
                <div class="tests-grid">
            `;

            tests.forEach(test => {
                const statusClass = test.is_active ? 'status-active' : 'status-draft';
                const statusText = test.is_active ? 'Active' : 'Draft';
                const subjectBadgeStyle = buildSubjectBadgeStyle(test.subject_color);
                const safeTitle = (test.title || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                const isSelected = this.selectedIds.has(test.id);

                html += `
                    <div class="test-card ${isSelected ? 'bulk-card-selected' : ''}" data-test-id="${test.id}">
                        <label class="test-bulk-select">
                            <input
                                type="checkbox"
                                class="bulk-row-checkbox"
                                ${isSelected ? 'checked' : ''}
                                onchange="TestsManager.toggleSelectTest('${test.id}')"
                                aria-label="Select ${test.title || 'test'}"
                            >
                        </label>
                        <div class="test-card-header">
                            <div class="test-subject" style="${subjectBadgeStyle}">
                                ${test.subject_name || 'No subject'}
                            </div>
                            <span class="status-badge ${statusClass}">${statusText}</span>
                        </div>
                        <div class="test-card-body">
                            <h3 class="test-title">${test.title}</h3>
                            <p class="test-description">${test.description || 'No description'}</p>
                            <div class="test-stats">
                                <div class="stat">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <circle cx="12" cy="12" r="10"></circle>
                                        <polyline points="12 6 12 12 16 14"></polyline>
                                    </svg>
                                    <span>${test.duration_minutes} min</span>
                                </div>
                                <div class="stat">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M9 11l3 3L22 4"></path>
                                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                                    </svg>
                                    <span>${test.question_count} Q</span>
                                </div>
                                <div class="stat">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                        <circle cx="12" cy="7" r="4"></circle>
                                    </svg>
                                    <span>${test.max_attempts || 1} attempts</span>
                                </div>
                            </div>
                        </div>
                        <div class="test-card-footer">
                            <button class="btn btn-sm btn-outline" onclick="TestsManager.viewTest('${test.id}')">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                    <circle cx="12" cy="12" r="3"></circle>
                                </svg>
                                View
                            </button>
                            <button class="btn btn-sm btn-primary" onclick="TestsManager.editTest('${test.id}')">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                                Edit
                            </button>
                            <button class="btn btn-sm btn-danger" onclick="TestsManager.deleteTest('${test.id}', '${safeTitle}')">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                                Delete
                            </button>
                        </div>
                    </div>
                `;
            });

            html += '</div>';

            // Add pagination
            if (pagination.pages > 1) {
                html += this.renderPagination(pagination);
            }

            container.innerHTML = html;
            this.syncSelectionUi();
        },

        toggleSelectTest: function (testId) {
            if (this.selectedIds.has(testId)) {
                this.selectedIds.delete(testId);
            } else {
                this.selectedIds.add(testId);
            }
            this.syncSelectionUi();
        },

        toggleSelectAllTests: function (checked) {
            const currentIds = this.lastRenderedTests.map(test => test.id);
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
            const countEl = document.getElementById('testsBulkCount');
            if (countEl) {
                countEl.textContent = `${count} selected`;
            }

            const deleteBtn = document.getElementById('testsBulkDeleteBtn');
            if (deleteBtn) {
                deleteBtn.disabled = count === 0;
            }

            const clearBtn = document.getElementById('testsClearSelectionBtn');
            if (clearBtn) {
                clearBtn.disabled = count === 0;
            }

            const selectAllEl = document.getElementById('testsSelectAll');
            if (selectAllEl) {
                const currentIds = this.lastRenderedTests.map(test => test.id);
                const selectedOnPage = currentIds.filter(id => this.selectedIds.has(id)).length;
                selectAllEl.checked = currentIds.length > 0 && selectedOnPage === currentIds.length;
                selectAllEl.indeterminate = selectedOnPage > 0 && selectedOnPage < currentIds.length;
            }

            document.querySelectorAll('.test-card[data-test-id]').forEach(card => {
                card.classList.toggle('bulk-card-selected', this.selectedIds.has(card.dataset.testId));
            });
        },

        bulkDeleteTests: async function () {
            const ids = Array.from(this.selectedIds);
            if (ids.length === 0) return;

            const confirmed = await showConfirm(`Are you sure you want to delete ${ids.length} selected tests permanently?`);
            if (!confirmed) return;

            const token = localStorage.getItem('access_token');
            let failed = 0;

            const results = await Promise.allSettled(
                ids.map(id => fetch(`/api/teacher/tests/${id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
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
            this.loadTests();
        },

        // Render pagination
        renderPagination: function (pagination) {
            let html = '<div class="pagination">';

            if (pagination.page > 1) {
                html += `<button class="pagination-btn" onclick="TestsManager.goToPage(${pagination.page - 1})">Previous</button>`;
            }

            for (let i = 1; i <= pagination.pages; i++) {
                if (i === pagination.page) {
                    html += `<button class="pagination-btn active">${i}</button>`;
                } else {
                    html += `<button class="pagination-btn" onclick="TestsManager.goToPage(${i})">${i}</button>`;
                }
            }

            if (pagination.page < pagination.pages) {
                html += `<button class="pagination-btn" onclick="TestsManager.goToPage(${pagination.page + 1})">Next</button>`;
            }

            html += '</div>';
            return html;
        },

        // Go to page
        goToPage: function (page) {
            this.currentPage = page;
            this.loadTests();
        },

        // Show test editor (create/edit)
        showTestEditor: function (testId = null) {
            // Load test editor script if not already loaded
            if (typeof TestEditor === 'undefined') {
                const script = document.createElement('script');
                script.src = '/js/test-editor.js';
                script.onload = () => {
                    TestEditor.open(testId);
                };
                document.head.appendChild(script);
            } else {
                TestEditor.open(testId);
            }
        },

        // View test details
        viewTest: function (testId) {
            this.showTestPreview(testId);
        },

        showTestPreview: async function (testId) {
            try {
                const token = localStorage.getItem('access_token');
                const response = await fetch(`/api/teacher/tests/${testId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (!response.ok) {
                    throw new Error('Failed to load test');
                }

                const data = await response.json();
                this.renderTestPreviewModal(data.test, data.questions || []);
            } catch (error) {
                console.error('Load test preview error:', error);
                showAlert('Failed to load test preview');
            }
        },

        renderTestPreviewModal: function (test, questions) {
            const modalHtml = `
                <div class="modal-overlay" id="testPreviewModal">
                    <div class="modal modal-large">
                        <div class="modal-header">
                            <h2 class="modal-title">${test.title}</h2>
                            <button class="modal-close" onclick="TestsManager.closeTestPreview()">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </div>
                        <div class="modal-body">
                            <div class="detail-section">
                                <div class="detail-grid">
                                    <div class="detail-item">
                                        <label>Subject:</label>
                                        <span>${test.subject_name || '-'}</span>
                                    </div>
                                    <div class="detail-item">
                                        <label>Duration:</label>
                                        <span>${test.duration_minutes || '-'} minutes</span>
                                    </div>
                                    <div class="detail-item">
                                        <label>Passing Score:</label>
                                        <span>${test.passing_score || 0}%</span>
                                    </div>
                                    <div class="detail-item">
                                        <label>Questions:</label>
                                        <span>${questions.length}</span>
                                    </div>
                                </div>
                                ${test.description ? `<p style="margin-top: 12px; color: var(--text-secondary);">${test.description}</p>` : ''}
                            </div>
                            <div class="detail-section">
                                <h3>Questions</h3>
                                ${questions.length === 0 ? '<p style="color: var(--text-secondary);">No questions found.</p>' : `
                                    <div class="table-responsive">
                                        <table class="data-table">
                                            <thead>
                                                <tr>
                                                    <th>#</th>
                                                    <th>Type</th>
                                                    <th>Question</th>
                                                    <th>Marks</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${questions.map((q, index) => `
                                                    <tr>
                                                        <td>${index + 1}</td>
                                                        <td>${q.question_type}</td>
                                                        <td>${q.question_text}</td>
                                                        <td>${q.marks}</td>
                                                    </tr>
                                                `).join('')}
                                            </tbody>
                                        </table>
                                    </div>
                                `}
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button class="btn btn-outline" onclick="TestsManager.closeTestPreview()">Close</button>
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);
            document.getElementById('testPreviewModal').addEventListener('click', (e) => {
                if (e.target.id === 'testPreviewModal') {
                    this.closeTestPreview();
                }
            });
        },

        closeTestPreview: function () {
            const modal = document.getElementById('testPreviewModal');
            if (modal) {
                modal.remove();
            }
        },

        // Edit test
        editTest: function (testId) {
            this.showTestEditor(testId);
        },

        // Delete test
        deleteTest: async function (testId, testTitle) {
            const confirmed = await showConfirm(`Are you sure you want to delete "${testTitle}" permanently?`);
            if (!confirmed) {
                return;
            }

            try {
                const token = localStorage.getItem('access_token');
                const response = await fetch(`/api/teacher/tests/${testId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (response.ok) {
                    this.selectedIds.delete(testId);
                    this.loadTests();
                } else {
                    showAlert('Failed to delete test');
                }
            } catch (error) {
                console.error('Delete test error:', error);
                showAlert('Failed to delete test');
            }
        }
    };
})();
