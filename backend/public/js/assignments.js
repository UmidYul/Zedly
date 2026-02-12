// Test Assignments Management Component
(function () {
    'use strict';

    window.AssignmentsManager = {
        currentPage: 1,
        limit: 10,
        searchTerm: '',
        classFilter: 'all',
        statusFilter: 'all',
        subjectClassesCache: {},

        // Initialize assignments page
        init: function () {
            this.loadClasses(); // Load classes for filter
            this.loadAssignments();
            this.setupEventListeners();
        },

        // Load classes for filter dropdown
        loadClasses: async function () {
            try {
                const token = localStorage.getItem('access_token');
                const response = await fetch('/api/teacher/classes?limit=100', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (response.ok) {
                    const data = await response.json();
                    const classFilter = document.getElementById('classFilter');
                    if (classFilter && data.classes) {
                        data.classes.forEach(cls => {
                            const option = document.createElement('option');
                            option.value = cls.id;
                            option.textContent = `${cls.name} - ${cls.grade_level} класс`;
                            classFilter.appendChild(option);
                        });
                    }
                }
            } catch (error) {
                console.error('Load classes error:', error);
            }
        },

        // Setup event listeners
        setupEventListeners: function () {
            // Search input
            const searchInput = document.getElementById('assignmentsSearch');
            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    this.searchTerm = e.target.value;
                    this.currentPage = 1;
                    this.loadAssignments();
                });
            }

            // Class filter
            const classFilter = document.getElementById('classFilter');
            if (classFilter) {
                classFilter.addEventListener('change', (e) => {
                    this.classFilter = e.target.value;
                    this.currentPage = 1;
                    this.loadAssignments();
                });
            }

            // Status filter
            const statusFilter = document.getElementById('statusFilter');
            if (statusFilter) {
                statusFilter.addEventListener('change', (e) => {
                    this.statusFilter = e.target.value;
                    this.currentPage = 1;
                    this.loadAssignments();
                });
            }

            // Add assignment button
            const addBtn = document.getElementById('addAssignmentBtn');
            if (addBtn) {
                addBtn.addEventListener('click', () => this.showAssignmentModal());
            }
        },

        // Load assignments from API
        loadAssignments: async function () {
            const container = document.getElementById('assignmentsContainer');
            if (!container) return;

            // Show loading
            container.innerHTML = `
                <div style="text-align: center; padding: var(--spacing-3xl);">
                    <div class="spinner" style="display: inline-block;"></div>
                    <p style="margin-top: var(--spacing-lg); color: var(--text-secondary);">Loading assignments...</p>
                </div>
            `;

            try {
                const token = localStorage.getItem('access_token');
                const params = new URLSearchParams({
                    page: this.currentPage,
                    limit: this.limit,
                    search: this.searchTerm,
                    class_id: this.classFilter,
                    status: this.statusFilter
                });

                const response = await fetch(`/api/teacher/assignments?${params}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!response.ok) {
                    throw new Error('Failed to load assignments');
                }

                const data = await response.json();
                this.renderAssignments(data.assignments, data.pagination);
            } catch (error) {
                console.error('Load assignments error:', error);
                container.innerHTML = `
                    <div class="error-message">
                        <p>Failed to load assignments. Please try again.</p>
                    </div>
                `;
            }
        },

        // Render assignments table
        renderAssignments: function (assignments, pagination) {
            const container = document.getElementById('assignmentsContainer');
            if (!container) return;

            if (assignments.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; padding: var(--spacing-3xl);">
                        <p style="color: var(--text-secondary);">No assignments found.</p>
                    </div>
                `;
                return;
            }

            let html = `
                <div class="table-responsive">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Test</th>
                                <th>Class</th>
                                <th>Subject</th>
                                <th>Duration</th>
                                <th>Start Date</th>
                                <th>End Date</th>
                                <th>Progress</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            const now = new Date();
            assignments.forEach(assignment => {
                const startDate = new Date(assignment.start_date);
                const endDate = new Date(assignment.end_date);

                let statusClass = 'status-inactive';
                let statusText = 'Upcoming';

                if (!assignment.is_active) {
                    statusClass = 'status-inactive';
                    statusText = 'Inactive';
                } else if (now > endDate) {
                    statusClass = 'status-completed';
                    statusText = 'Completed';
                } else if (now >= startDate && now <= endDate) {
                    statusClass = 'status-active';
                    statusText = 'Active';
                }

                const progress = assignment.student_count > 0
                    ? Math.round((assignment.attempt_count / assignment.student_count) * 100)
                    : 0;

                html += `
                    <tr>
                        <td>
                            <div class="user-name">${assignment.test_title}</div>
                            <div class="user-email">${assignment.passing_score}% passing score</div>
                        </td>
                        <td>
                            <div>${assignment.class_name}</div>
                            <div class="text-secondary">${assignment.grade_level} класс</div>
                        </td>
                        <td>
                            ${assignment.subject_name ? `
                                <span class="subject-badge" style="background-color: ${assignment.subject_color}20; color: ${assignment.subject_color};">
                                    ${assignment.subject_name}
                                </span>
                            ` : '-'}
                        </td>
                        <td>${assignment.duration_minutes} min</td>
                        <td>${this.formatDate(assignment.start_date)}</td>
                        <td>${this.formatDate(assignment.end_date)}</td>
                        <td>
                            <div class="progress-info">
                                <span>${assignment.attempt_count}/${assignment.student_count} students</span>
                                <div class="progress-bar">
                                    <div class="progress-fill" style="width: ${progress}%"></div>
                                </div>
                            </div>
                        </td>
                        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                        <td>
                            <div class="action-buttons">
                                <button class="btn-icon" onclick="AssignmentsManager.viewDetails('${assignment.id}')" title="View Details">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                        <circle cx="12" cy="12" r="3"></circle>
                                    </svg>
                                </button>
                                <button class="btn-icon btn-success" onclick="AssignmentsManager.viewResults('${assignment.id}')" title="View Results">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M9 11l3 3L22 4"></path>
                                        <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"></path>
                                    </svg>
                                </button>
                                <button class="btn-icon" onclick="AssignmentsManager.editAssignment('${assignment.id}')" title="Edit">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                    </svg>
                                </button>
                                <button class="btn-icon btn-danger" onclick="AssignmentsManager.deleteAssignment('${assignment.id}', '${assignment.test_title}')" title="Delete">
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
                html += `<button class="pagination-btn" onclick="AssignmentsManager.goToPage(${pagination.page - 1})">Previous</button>`;
            }

            for (let i = 1; i <= pagination.pages; i++) {
                if (i === pagination.page) {
                    html += `<button class="pagination-btn active">${i}</button>`;
                } else {
                    html += `<button class="pagination-btn" onclick="AssignmentsManager.goToPage(${i})">${i}</button>`;
                }
            }

            if (pagination.page < pagination.pages) {
                html += `<button class="pagination-btn" onclick="AssignmentsManager.goToPage(${pagination.page + 1})">Next</button>`;
            }

            html += '</div>';
            return html;
        },

        // Go to page
        goToPage: function (page) {
            this.currentPage = page;
            this.loadAssignments();
        },

        // Format date
        formatDate: function (dateString) {
            const date = new Date(dateString);
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            return `${day}.${month}.${year} ${hours}:${minutes}`;
        },

        // Show assignment modal (create/edit)
        showAssignmentModal: async function (assignmentId = null) {
            const isEdit = assignmentId !== null;
            let assignmentData = null;

            // Load assignment data if editing
            if (isEdit) {
                try {
                    const token = localStorage.getItem('access_token');
                    const response = await fetch(`/api/teacher/assignments/${assignmentId}`, {
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });

                    if (response.ok) {
                        const data = await response.json();
                        assignmentData = data.assignment;
                    } else {
                        alert('Failed to load assignment data');
                        return;
                    }
                } catch (error) {
                    console.error('Load assignment error:', error);
                    alert('Failed to load assignment data');
                    return;
                }
            }

            // Load tests for dropdown
            let testsList = [];

            try {
                const token = localStorage.getItem('access_token');

                // Load published tests
                const testsResponse = await fetch('/api/teacher/tests?status=active&limit=100', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (testsResponse.ok) {
                    const data = await testsResponse.json();
                    testsList = data.tests;
                }

            } catch (error) {
                console.error('Load data error:', error);
            }

            // Format dates for datetime-local input
            const now = new Date();
            const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
            const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

            const formatForInput = (date) => {
                const d = new Date(date);
                d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
                return d.toISOString().slice(0, 16);
            };

            // Create modal HTML
            const modalHtml = `
                <div class="modal-overlay" id="assignmentModal">
                    <div class="modal">
                        <div class="modal-header">
                            <h2 class="modal-title">${isEdit ? 'Edit Assignment' : 'Create New Assignment'}</h2>
                            <button class="modal-close" onclick="AssignmentsManager.closeModal()">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </div>
                        <div class="modal-body">
                            <form id="assignmentForm" onsubmit="AssignmentsManager.submitAssignment(event, ${assignmentId})">
                                ${!isEdit ? `
                                <div class="form-group">
                                    <label class="form-label">
                                        Test <span class="required">*</span>
                                    </label>
                                    <select class="form-input" name="test_id" required ${isEdit ? 'disabled' : ''}>
                                        <option value="">Select test</option>
                                        ${testsList.map(test =>
                `<option value="${test.id}" data-subject-id="${test.subject_id || ''}" ${assignmentData?.test_id === test.id ? 'selected' : ''}>${test.title} (${test.subject_name})</option>`
            ).join('')}
                                    </select>
                                </div>

                                <div class="form-group">
                                    <label class="form-label">
                                        Class <span class="required">*</span>
                                    </label>
                                    <select class="form-input" name="class_id" required ${isEdit ? 'disabled' : ''}>
                                        <option value="">Select class</option>
                                        
                                    </select>
                                </div>
                                ` : `
                                <div class="alert alert-info">
                                    <strong>Test:</strong> ${assignmentData.test_title}<br>
                                    <strong>Class:</strong> ${assignmentData.class_name}
                                </div>
                                `}

                                <div class="form-row">
                                    <div class="form-group">
                                        <label class="form-label">
                                            Start Date & Time <span class="required">*</span>
                                        </label>
                                        <input
                                            type="datetime-local"
                                            class="form-input"
                                            name="start_date"
                                            value="${assignmentData ? formatForInput(assignmentData.start_date) : formatForInput(tomorrow)}"
                                            required
                                        />
                                    </div>

                                    <div class="form-group">
                                        <label class="form-label">
                                            End Date & Time <span class="required">*</span>
                                        </label>
                                        <input
                                            type="datetime-local"
                                            class="form-input"
                                            name="end_date"
                                            value="${assignmentData ? formatForInput(assignmentData.end_date) : formatForInput(nextWeek)}"
                                            required
                                        />
                                    </div>
                                </div>

                                ${isEdit ? `
                                <div class="form-group">
                                    <div class="form-check">
                                        <input
                                            type="checkbox"
                                            class="form-check-input"
                                            id="assignmentActive"
                                            name="is_active"
                                            ${assignmentData?.is_active ? 'checked' : ''}
                                        />
                                        <label class="form-check-label" for="assignmentActive">
                                            Active
                                        </label>
                                    </div>
                                </div>
                                ` : ''}

                                <div id="formAlert" class="hidden"></div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-outline" onclick="AssignmentsManager.closeModal()">
                                Cancel
                            </button>
                            <button type="submit" form="assignmentForm" class="btn btn-primary" id="submitBtn">
                                ${isEdit ? 'Update Assignment' : 'Create Assignment'}
                            </button>
                        </div>
                    </div>
                </div>
            `;

            // Add modal to body
            document.body.insertAdjacentHTML('beforeend', modalHtml);

            if (!isEdit) {
                const testSelect = document.querySelector('#assignmentForm select[name="test_id"]');
                const classSelect = document.querySelector('#assignmentForm select[name="class_id"]');

                const setClassOptions = (classes = []) => {
                    if (!classSelect) return;
                    if (!classes.length) {
                        classSelect.innerHTML = `<option value="">No classes available</option>`;
                        return;
                    }
                    classSelect.innerHTML = `
                        <option value="">Select class</option>
                        ${classes.map(cls =>
                            `<option value="${cls.id}">${cls.name} - ${cls.grade_level} класс</option>`
                        ).join('')}
                    `;
                };

                const loadClassesForSubject = async (subjectId) => {
                    if (!subjectId) {
                        if (classSelect) {
                            classSelect.innerHTML = `<option value="">Select test first</option>`;
                        }
                        return;
                    }

                    if (this.subjectClassesCache[subjectId]) {
                        setClassOptions(this.subjectClassesCache[subjectId]);
                        return;
                    }

                    try {
                        const token = localStorage.getItem('access_token');
                        const response = await fetch(`/api/teacher/classes-by-subject?subject_id=${encodeURIComponent(subjectId)}`, {
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        if (response.ok) {
                            const data = await response.json();
                            const classes = data.classes || [];
                            this.subjectClassesCache[subjectId] = classes;
                            setClassOptions(classes);
                        } else {
                            setClassOptions([]);
                        }
                    } catch (error) {
                        console.error('Load classes by subject error:', error);
                        setClassOptions([]);
                    }
                };

                if (testSelect) {
                    testSelect.addEventListener('change', () => {
                        const subjectId = testSelect.options[testSelect.selectedIndex]?.dataset?.subjectId || '';
                        loadClassesForSubject(subjectId);
                    });
                }

                const initialSubjectId = testSelect?.options[testSelect.selectedIndex]?.dataset?.subjectId || '';
                if (!initialSubjectId) {
                    if (classSelect) classSelect.innerHTML = `<option value="">Select test first</option>`;
                } else {
                    loadClassesForSubject(initialSubjectId);
                }
            }

            // Close on overlay click
            document.getElementById('assignmentModal').addEventListener('click', (e) => {
                if (e.target.id === 'assignmentModal') {
                    this.closeModal();
                }
            });

            // Close on Escape key
            document.addEventListener('keydown', this.handleEscapeKey);
        },

        // Handle Escape key
        handleEscapeKey: function (e) {
            if (e.key === 'Escape') {
                AssignmentsManager.closeModal();
            }
        },

        // Close modal
        closeModal: function () {
            const modal = document.getElementById('assignmentModal');
            if (modal) {
                modal.remove();
            }
            const detailsModal = document.getElementById('assignmentDetailsModal');
            if (detailsModal) {
                detailsModal.remove();
            }
            document.removeEventListener('keydown', this.handleEscapeKey);
        },

        // Submit assignment form
        submitAssignment: async function (event, assignmentId) {
            event.preventDefault();

            const form = event.target;
            const submitBtn = document.getElementById('submitBtn');
            const formAlert = document.getElementById('formAlert');
            const toIso = (value) => {
                if (!value) return value;
                const d = new Date(value);
                return isNaN(d) ? value : d.toISOString();
            };

            // Get form data
            const formData = new FormData(form);
            const data = {};

            if (!assignmentId) {
                data.test_id = formData.get('test_id');
                data.class_id = formData.get('class_id');
            }

            data.start_date = toIso(formData.get('start_date'));
            data.end_date = toIso(formData.get('end_date'));

            if (assignmentId) {
                data.is_active = formData.get('is_active') === 'on';
            }

            // Validation
            if (!assignmentId && (!data.test_id || !data.class_id)) {
                formAlert.className = 'alert alert-error';
                formAlert.textContent = 'Please select both test and class';
                return;
            }

            if (!data.start_date || !data.end_date) {
                formAlert.className = 'alert alert-error';
                formAlert.textContent = 'Please fill in start and end dates';
                return;
            }

            if (new Date(data.start_date) >= new Date(data.end_date)) {
                formAlert.className = 'alert alert-error';
                formAlert.textContent = 'End date must be after start date';
                return;
            }

            // Show loading
            submitBtn.classList.add('loading');
            submitBtn.disabled = true;
            formAlert.className = 'hidden';

            try {
                const token = localStorage.getItem('access_token');
                const url = assignmentId
                    ? `/api/teacher/assignments/${assignmentId}`
                    : '/api/teacher/assignments';
                const method = assignmentId ? 'PUT' : 'POST';

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

                    // Reload assignments list
                    setTimeout(() => {
                        this.closeModal();
                        this.loadAssignments();
                    }, 1000);
                } else {
                    // Show error
                    formAlert.className = 'alert alert-error';
                    formAlert.textContent = result.message || 'An error occurred';
                }
            } catch (error) {
                console.error('Submit assignment error:', error);
                formAlert.className = 'alert alert-error';
                formAlert.textContent = 'Network error. Please try again.';
            } finally {
                submitBtn.classList.remove('loading');
                submitBtn.disabled = false;
            }
        },

        // Edit assignment
        editAssignment: function (assignmentId) {
            this.showAssignmentModal(assignmentId);
        },

        // View assignment details and student progress
        viewDetails: async function (assignmentId) {
            try {
                const token = localStorage.getItem('access_token');
                const response = await fetch(`/api/teacher/assignments/${assignmentId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (!response.ok) {
                    throw new Error('Failed to load assignment details');
                }

                const data = await response.json();
                this.showDetailsModal(data.assignment, data.students);
            } catch (error) {
                console.error('Load assignment details error:', error);
                alert('Failed to load assignment details');
            }
        },

        // Show details modal
        showDetailsModal: function (assignment, students) {
            const now = new Date();
            const endDate = new Date(assignment.end_date);
            const isActive = assignment.is_active && now <= endDate;

            const modalHtml = `
                <div class="modal-overlay" id="assignmentDetailsModal">
                    <div class="modal modal-large">
                        <div class="modal-header">
                            <h2 class="modal-title">Assignment Details</h2>
                            <button class="modal-close" onclick="AssignmentsManager.closeModal()">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </div>
                        <div class="modal-body">
                            <div class="assignment-details">
                                <div class="detail-section">
                                    <h3>Test Information</h3>
                                    <div class="detail-grid">
                                        <div class="detail-item">
                                            <label>Test:</label>
                                            <span>${assignment.test_title}</span>
                                        </div>
                                        <div class="detail-item">
                                            <label>Subject:</label>
                                            <span>${assignment.subject_name || '-'}</span>
                                        </div>
                                        <div class="detail-item">
                                            <label>Duration:</label>
                                            <span>${assignment.duration_minutes} minutes</span>
                                        </div>
                                        <div class="detail-item">
                                            <label>Questions:</label>
                                            <span>${assignment.question_count}</span>
                                        </div>
                                        <div class="detail-item">
                                            <label>Passing Score:</label>
                                            <span>${assignment.passing_score}%</span>
                                        </div>
                                        <div class="detail-item">
                                            <label>Max Attempts:</label>
                                            <span>${assignment.max_attempts}</span>
                                        </div>
                                    </div>
                                </div>

                                <div class="detail-section">
                                    <h3>Assignment Details</h3>
                                    <div class="detail-grid">
                                        <div class="detail-item">
                                            <label>Class:</label>
                                            <span>${assignment.class_name} (${assignment.grade_level} класс)</span>
                                        </div>
                                        <div class="detail-item">
                                            <label>Start Date:</label>
                                            <span>${this.formatDate(assignment.start_date)}</span>
                                        </div>
                                        <div class="detail-item">
                                            <label>End Date:</label>
                                            <span>${this.formatDate(assignment.end_date)}</span>
                                        </div>
                                        <div class="detail-item">
                                            <label>Status:</label>
                                            <span class="status-badge ${isActive ? 'status-active' : 'status-inactive'}">
                                                ${isActive ? 'Active' : 'Inactive'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div class="detail-section">
                                    <h3>Student Progress (${students.length} students)</h3>
                                    <div class="table-responsive">
                                        <table class="data-table">
                                            <thead>
                                                <tr>
                                                    <th>Roll #</th>
                                                    <th>Student Name</th>
                                                    <th>Attempts Made</th>
                                                    <th>Best Score</th>
                                                    <th>Last Attempt</th>
                                                    <th>Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${students.map(student => {
                const bestScore = student.best_score !== null ? parseFloat(student.best_score).toFixed(1) : '-';
                const isPassed = student.best_score !== null && student.best_score >= assignment.passing_score;
                const statusClass = student.attempts_made === 0 ? 'status-inactive' : (isPassed ? 'status-active' : 'status-warning');
                const statusText = student.attempts_made === 0 ? 'Not Started' : (isPassed ? 'Passed' : 'In Progress');

                return `
                                                    <tr>
                                                        <td>${student.roll_number || '-'}</td>
                                                        <td>${student.student_name}</td>
                                                        <td>${student.attempts_made} / ${assignment.max_attempts}</td>
                                                        <td>${bestScore}${bestScore !== '-' ? '%' : ''}</td>
                                                        <td>${student.last_attempt_date ? this.formatDate(student.last_attempt_date) : '-'}</td>
                                                        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                                                    </tr>
                                                `;
            }).join('')}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-outline" onclick="AssignmentsManager.closeModal()">
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);

            // Close on overlay click
            document.getElementById('assignmentDetailsModal').addEventListener('click', (e) => {
                if (e.target.id === 'assignmentDetailsModal') {
                    this.closeModal();
                }
            });
        },

        // Delete assignment
        deleteAssignment: async function (assignmentId, testTitle) {
            if (!confirm(`Are you sure you want to delete assignment "${testTitle}"?`)) {
                return;
            }

            try {
                const token = localStorage.getItem('access_token');
                const response = await fetch(`/api/teacher/assignments/${assignmentId}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (response.ok) {
                    this.loadAssignments();
                } else {
                    alert('Failed to delete assignment');
                }
            } catch (error) {
                console.error('Delete assignment error:', error);
                alert('Failed to delete assignment');
            }
        },

        // View assignment results
        viewResults: function (assignmentId) {
            window.location.href = `/teacher-results.html?assignment_id=${assignmentId}`;
        }
    };
})();


