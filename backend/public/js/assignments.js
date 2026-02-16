// Test Assignments Management Component
(function () {
    'use strict';

    function looksLikeMojibake(value) {
        if (typeof value !== 'string' || value.length < 4) return false;
        const chunks = value.match(/(?:Р.|С.)/g) || [];
        return chunks.length >= 3 && chunks.length / value.length > 0.2;
    }

    function t(key, fallback) {
        const translated = window.ZedlyI18n?.translate?.(key);
        if (!translated || translated === key || looksLikeMojibake(translated)) {
            return fallback || key;
        }
        return translated;
    }

    function showAlert(message, title = null) {
        const dialogTitle = title || t('common.error', 'Ошибка');
        if (window.ZedlyDialog?.alert) {
            return window.ZedlyDialog.alert(message, { title: dialogTitle });
        }
        alert(message);
        return Promise.resolve(true);
    }

    function showConfirm(message, title = null) {
        const dialogTitle = title || t('common.confirmation', 'Подтверждение');
        if (window.ZedlyDialog?.confirm) {
            return window.ZedlyDialog.confirm(message, { title: dialogTitle });
        }
        return Promise.resolve(confirm(message));
    }

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
                    <p style="margin-top: var(--spacing-lg); color: var(--text-secondary);">${t('assignments.loading', 'Загрузка назначений...')}</p>
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
                    throw new Error(t('assignments.failedLoad', 'Не удалось загрузить назначения'));
                }

                const data = await response.json();
                this.renderAssignments(data.assignments, data.pagination);
            } catch (error) {
                console.error('Load assignments error:', error);
                container.innerHTML = `
                    <div class="error-message">
                        <p>${t('assignments.failedLoadTryAgain', 'Не удалось загрузить назначения. Попробуйте снова.')}</p>
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
                        <p style="color: var(--text-secondary);">${t('assignments.noAssignments', 'Назначения не найдены.')}</p>
                    </div>
                `;
                return;
            }

            let html = `
                <div class="table-responsive">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>${t('assignments.colTest', 'Тест')}</th>
                                <th>${t('assignments.colClass', 'Класс')}</th>
                                <th>${t('assignments.colSubject', 'Предмет')}</th>
                                <th>${t('assignments.colDuration', 'Длительность')}</th>
                                <th>${t('assignments.colStartDate', 'Дата начала')}</th>
                                <th>${t('assignments.colEndDate', 'Дата окончания')}</th>
                                <th>${t('assignments.colProgress', 'Прогресс')}</th>
                                <th>${t('assignments.colStatus', 'Статус')}</th>
                                <th>${t('assignments.colActions', 'Действия')}</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            const now = new Date();
            assignments.forEach(assignment => {
                const startDate = new Date(assignment.start_date);
                const endDate = new Date(assignment.end_date);

                let statusClass = 'status-inactive';
                let statusText = t('assignments.statusUpcoming', 'Скоро');

                if (!assignment.is_active) {
                    statusClass = 'status-inactive';
                    statusText = t('assignments.statusInactive', 'Неактивно');
                } else if (now > endDate) {
                    statusClass = 'status-completed';
                    statusText = t('assignments.statusCompleted', 'Завершено');
                } else if (now >= startDate && now <= endDate) {
                    statusClass = 'status-active';
                    statusText = t('assignments.statusActive', 'Активно');
                }

                const progress = assignment.student_count > 0
                    ? Math.round((assignment.attempt_count / assignment.student_count) * 100)
                    : 0;

                html += `
                    <tr>
                        <td>
                            <div class="user-name">${assignment.test_title}</div>
                            <div class="user-email">${assignment.passing_score}% ${t('assignments.passingScore', 'проходной балл')}</div>
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
                        <td>${assignment.duration_minutes} ${t('assignments.minShort', 'мин')}</td>
                        <td>${this.formatDate(assignment.start_date)}</td>
                        <td>${this.formatDate(assignment.end_date)}</td>
                        <td>
                            <div class="progress-info">
                                <span>${assignment.attempt_count}/${assignment.student_count} ${t('assignments.students', 'учеников')}</span>
                                <div class="progress-bar">
                                    <div class="progress-fill" style="width: ${progress}%"></div>
                                </div>
                            </div>
                        </td>
                        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                        <td>
                            <div class="action-buttons">
                                <button class="btn-icon" onclick="AssignmentsManager.viewDetails('${assignment.id}')" title="${t('assignments.viewDetails', 'Детали')}">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                        <circle cx="12" cy="12" r="3"></circle>
                                    </svg>
                                </button>
                                <button class="btn-icon btn-success" onclick="AssignmentsManager.viewResults('${assignment.id}')" title="${t('assignments.viewResults', 'Результаты')}">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M9 11l3 3L22 4"></path>
                                        <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"></path>
                                    </svg>
                                </button>
                                <button class="btn-icon" onclick="AssignmentsManager.editAssignment('${assignment.id}')" title="${t('tests.edit', 'Редактировать')}">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                    </svg>
                                </button>
                                <button class="btn-icon btn-danger" onclick="AssignmentsManager.deleteAssignment('${assignment.id}', '${assignment.test_title}')" title="${t('tests.delete', 'Удалить')}">
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
                html += `<button class="pagination-btn" onclick="AssignmentsManager.goToPage(${pagination.page - 1})">${t('common.prev', 'Назад')}</button>`;
            }

            for (let i = 1; i <= pagination.pages; i++) {
                if (i === pagination.page) {
                    html += `<button class="pagination-btn active">${i}</button>`;
                } else {
                    html += `<button class="pagination-btn" onclick="AssignmentsManager.goToPage(${i})">${i}</button>`;
                }
            }

            if (pagination.page < pagination.pages) {
                html += `<button class="pagination-btn" onclick="AssignmentsManager.goToPage(${pagination.page + 1})">${t('common.next', 'Далее')}</button>`;
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
                        showAlert(t('assignments.failedLoadAssignmentData', 'Не удалось загрузить данные назначения'));
                        return;
                    }
                } catch (error) {
                    console.error('Load assignment error:', error);
                    showAlert(t('assignments.failedLoadAssignmentData', 'Не удалось загрузить данные назначения'));
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
                            <h2 class="modal-title">${isEdit ? t('assignments.editAssignment', 'Редактировать назначение') : t('assignments.createNewAssignment', 'Создать назначение')}</h2>
                            <button class="modal-close" onclick="AssignmentsManager.closeModal()">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </div>
                        <div class="modal-body">
                            <form id="assignmentForm" data-assignment-id="${isEdit ? String(assignmentId) : ''}" onsubmit="AssignmentsManager.submitAssignment(event)">
                                ${!isEdit ? `
                                <div class="form-group">
                                    <label class="form-label">
                                        ${t('assignments.colTest', 'Тест')} <span class="required">*</span>
                                    </label>
                                    <select class="form-input" name="test_id" required ${isEdit ? 'disabled' : ''}>
                                        <option value="">${t('assignments.selectTest', 'Выберите тест')}</option>
                                        ${testsList.map(test =>
                `<option value="${test.id}" data-subject-id="${test.subject_id || ''}" ${assignmentData?.test_id === test.id ? 'selected' : ''}>${test.title} (${test.subject_name})</option>`
            ).join('')}
                                    </select>
                                </div>

                                <div class="form-group">
                                    <label class="form-label">
                                        ${t('assignments.classes', 'Классы')} <span class="required">*</span>
                                    </label>
                                    <label class="multi-choice-option" for="assignmentSelectAllClasses" style="margin-bottom: 8px;">
                                        <input type="checkbox" id="assignmentSelectAllClasses" />
                                        <span>${t('assignments.selectAllClasses', 'Select all')}</span>
                                    </label>
                                    <div class="multi-choice-list" id="assignmentClassList"></div>
                                    <span class="form-hint">${t('assignments.allClassesHint', 'Опция "Все классы" выбирает сразу все доступные классы.')}</span>
                                </div>
                                ` : `
                                <div class="alert alert-info">
                                    <strong>${t('assignments.colTest', 'Тест')}:</strong> ${assignmentData.test_title}<br>
                                    <strong>${t('assignments.colClass', 'Класс')}:</strong> ${assignmentData.class_name}
                                </div>
                                `}

                                <div class="form-row">
                                    <div class="form-group">
                                        <label class="form-label">
                                            ${t('assignments.startDateTime', 'Дата и время начала')} <span class="required">*</span>
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
                                            ${t('assignments.endDateTime', 'Дата и время окончания')} <span class="required">*</span>
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
                                            ${t('assignments.statusActive', 'Активно')}
                                        </label>
                                    </div>
                                </div>
                                ` : ''}

                                <div id="formAlert" class="hidden"></div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-outline" onclick="AssignmentsManager.closeModal()">
                                ${t('common.close', 'Закрыть')}
                            </button>
                            <button type="submit" form="assignmentForm" class="btn btn-primary" id="submitBtn">
                                ${isEdit ? t('assignments.updateAssignment', 'Обновить назначение') : t('assignments.createAssignment', 'Создать назначение')}
                            </button>
                        </div>
                    </div>
                </div>
            `;

            // Add modal to body
            document.body.insertAdjacentHTML('beforeend', modalHtml);

            if (!isEdit) {
                const testSelect = document.querySelector('#assignmentForm select[name="test_id"]');
                const classList = document.getElementById('assignmentClassList');
                const selectAllClasses = document.getElementById('assignmentSelectAllClasses');

                const getCheckedClassIds = () => {
                    if (!classList) return [];
                    return Array.from(classList.querySelectorAll('input[name="class_ids"]:checked'))
                        .map((input) => String(input.value))
                        .filter(Boolean);
                };

                const updateSelectAllState = () => {
                    if (!classList || !selectAllClasses) return;
                    const boxes = Array.from(classList.querySelectorAll('input[name="class_ids"]'));
                    if (!boxes.length) {
                        selectAllClasses.checked = false;
                        selectAllClasses.indeterminate = false;
                        selectAllClasses.disabled = true;
                        return;
                    }
                    const checkedCount = boxes.filter((box) => box.checked).length;
                    selectAllClasses.disabled = false;
                    selectAllClasses.checked = checkedCount > 0 && checkedCount === boxes.length;
                    selectAllClasses.indeterminate = checkedCount > 0 && checkedCount < boxes.length;
                };

                const setClassListMessage = (message) => {
                    if (!classList) return;
                    classList.innerHTML = `<div class="multi-choice-empty">${message}</div>`;
                    updateSelectAllState();
                };

                const setClassOptions = (classes = [], preselected = null) => {
                    if (!classList) return;
                    if (!classes.length) {
                        setClassListMessage(t('assignments.noClassesAvailable', 'No classes available'));
                        return;
                    }

                    const wanted = preselected === null
                        ? new Set(getCheckedClassIds())
                        : new Set((Array.isArray(preselected) ? preselected : []).map(String));

                    classList.innerHTML = classes.map((cls) => {
                        const classId = String(cls.id);
                        const checked = wanted.has(classId) ? 'checked' : '';
                        return `
                            <label class="multi-choice-option">
                                <input type="checkbox" name="class_ids" value="${classId}" ${checked} />
                                <span>${cls.name} - ${cls.grade_level}</span>
                            </label>
                        `;
                    }).join('');

                    classList.querySelectorAll('input[name="class_ids"]').forEach((box) => {
                        box.addEventListener('change', updateSelectAllState);
                    });
                    updateSelectAllState();
                };

                const loadClassesForSubject = async (subjectId, preselected = null) => {
                    if (!subjectId) {
                        setClassListMessage(t('assignments.selectTestFirst', 'Select test first'));
                        return;
                    }

                    if (this.subjectClassesCache[subjectId]) {
                        setClassOptions(this.subjectClassesCache[subjectId], preselected);
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
                            setClassOptions(classes, preselected);
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
                        loadClassesForSubject(subjectId, []);
                    });
                }

                if (selectAllClasses) {
                    selectAllClasses.addEventListener('change', () => {
                        if (!classList) return;
                        const boxes = classList.querySelectorAll('input[name="class_ids"]');
                        boxes.forEach((box) => {
                            box.checked = selectAllClasses.checked;
                        });
                        updateSelectAllState();
                    });
                }

                const initialSubjectId = testSelect?.options[testSelect.selectedIndex]?.dataset?.subjectId || '';
                if (!initialSubjectId) {
                    setClassListMessage(t('assignments.selectTestFirst', 'Select test first'));
                } else {
                    loadClassesForSubject(initialSubjectId, []);
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
        submitAssignment: async function (event, assignmentId = null) {
            event.preventDefault();

            const form = event.target;
            const resolvedAssignmentId = assignmentId || form?.dataset?.assignmentId || null;
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

            if (!resolvedAssignmentId) {
                data.test_id = formData.get('test_id');
                const classChecks = form.querySelectorAll('input[name="class_ids"]:checked');
                data.class_ids = Array.from(classChecks)
                    .map((input) => String(input.value))
                    .filter(Boolean);
            }

            data.start_date = toIso(formData.get('start_date'));
            data.end_date = toIso(formData.get('end_date'));

            if (resolvedAssignmentId) {
                data.is_active = formData.get('is_active') === 'on';
            }

            // Validation
            if (!resolvedAssignmentId && (!data.test_id || !Array.isArray(data.class_ids) || data.class_ids.length === 0)) {
                formAlert.className = 'alert alert-error';
                formAlert.textContent = t('assignments.validationTestAndClass', 'Выберите тест и хотя бы один класс');
                return;
            }

            if (!data.start_date || !data.end_date) {
                formAlert.className = 'alert alert-error';
                formAlert.textContent = t('assignments.validationDatesRequired', 'Заполните дату начала и окончания');
                return;
            }

            if (new Date(data.start_date) >= new Date(data.end_date)) {
                formAlert.className = 'alert alert-error';
                formAlert.textContent = t('assignments.validationEndAfterStart', 'Дата окончания должна быть позже даты начала');
                return;
            }

            // Show loading
            submitBtn.classList.add('loading');
            submitBtn.disabled = true;
            formAlert.className = 'hidden';

            try {
                const token = localStorage.getItem('access_token');
                const url = resolvedAssignmentId
                    ? `/api/teacher/assignments/${resolvedAssignmentId}`
                    : '/api/teacher/assignments';
                const method = resolvedAssignmentId ? 'PUT' : 'POST';

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
                    formAlert.textContent = result.message || t('assignments.errorGeneric', 'Произошла ошибка');
                }
            } catch (error) {
                console.error('Submit assignment error:', error);
                formAlert.className = 'alert alert-error';
                formAlert.textContent = t('assignments.errorNetwork', 'Ошибка сети. Попробуйте снова.');
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
                    throw new Error(t('assignments.failedLoadDetails', 'Не удалось загрузить детали назначения'));
                }

                const data = await response.json();
                this.showDetailsModal(data.assignment, data.students);
            } catch (error) {
                console.error('Load assignment details error:', error);
                showAlert(t('assignments.failedLoadDetails', 'Не удалось загрузить детали назначения'));
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
                            <h2 class="modal-title">${t('assignments.assignmentDetails', 'Детали назначения')}</h2>
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
                                    <h3>${t('assignments.testInformation', 'Информация о тесте')}</h3>
                                    <div class="detail-grid">
                                        <div class="detail-item">
                                            <label>${t('assignments.colTest', 'Тест')}:</label>
                                            <span>${assignment.test_title}</span>
                                        </div>
                                        <div class="detail-item">
                                            <label>${t('assignments.colSubject', 'Предмет')}:</label>
                                            <span>${assignment.subject_name || '-'}</span>
                                        </div>
                                        <div class="detail-item">
                                            <label>${t('assignments.colDuration', 'Длительность')}:</label>
                                            <span>${assignment.duration_minutes} ${t('assignments.minutes', 'минут')}</span>
                                        </div>
                                        <div class="detail-item">
                                            <label>${t('assignments.questions', 'Вопросы')}:</label>
                                            <span>${assignment.question_count}</span>
                                        </div>
                                        <div class="detail-item">
                                            <label>${t('assignments.passingScoreLabel', 'Проходной балл')}:</label>
                                            <span>${assignment.passing_score}%</span>
                                        </div>
                                        <div class="detail-item">
                                            <label>${t('assignments.maxAttempts', 'Макс. попыток')}:</label>
                                            <span>${assignment.max_attempts}</span>
                                        </div>
                                    </div>
                                </div>

                                <div class="detail-section">
                                    <h3>${t('assignments.assignmentDetails', 'Детали назначения')}</h3>
                                    <div class="detail-grid">
                                        <div class="detail-item">
                                            <label>${t('assignments.colClass', 'Класс')}:</label>
                                            <span>${assignment.class_name} (${assignment.grade_level} класс)</span>
                                        </div>
                                        <div class="detail-item">
                                            <label>${t('assignments.colStartDate', 'Дата начала')}:</label>
                                            <span>${this.formatDate(assignment.start_date)}</span>
                                        </div>
                                        <div class="detail-item">
                                            <label>${t('assignments.colEndDate', 'Дата окончания')}:</label>
                                            <span>${this.formatDate(assignment.end_date)}</span>
                                        </div>
                                        <div class="detail-item">
                                            <label>${t('assignments.colStatus', 'Статус')}:</label>
                                            <span class="status-badge ${isActive ? 'status-active' : 'status-inactive'}">
                                                ${isActive ? t('assignments.statusActive', 'Активно') : t('assignments.statusInactive', 'Неактивно')}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div class="detail-section">
                                    <h3>${t('assignments.studentProgress', 'Прогресс учеников')} (${students.length} ${t('assignments.students', 'учеников')})</h3>
                                    <div class="table-responsive">
                                        <table class="data-table">
                                            <thead>
                                                <tr>
                                                    <th>${t('assignments.rollNumber', '№ в журнале')}</th>
                                                    <th>${t('assignments.studentName', 'Имя ученика')}</th>
                                                    <th>${t('assignments.attemptsMade', 'Попыток')}</th>
                                                    <th>${t('assignments.bestScore', 'Лучший балл')}</th>
                                                    <th>${t('assignments.lastAttempt', 'Последняя попытка')}</th>
                                                    <th>${t('assignments.colStatus', 'Статус')}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${students.map(student => {
                const bestScore = student.best_score !== null ? parseFloat(student.best_score).toFixed(1) : '-';
                const isPassed = student.best_score !== null && student.best_score >= assignment.passing_score;
                const statusClass = student.attempts_made === 0 ? 'status-inactive' : (isPassed ? 'status-active' : 'status-warning');
                const statusText = student.attempts_made === 0
                    ? t('assignments.statusNotStarted', 'Не начато')
                    : (isPassed ? t('assignments.statusPassed', 'Сдано') : t('assignments.statusInProgress', 'В процессе'));

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
                                ${t('common.close', 'Закрыть')}
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
            const confirmed = await showConfirm(
                t('assignments.deleteConfirm', 'Вы уверены, что хотите удалить назначение "{title}"?').replace('{title}', testTitle)
            );
            if (!confirmed) {
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
                    showAlert(t('assignments.failedDeleteAssignment', 'Не удалось удалить назначение'));
                }
            } catch (error) {
                console.error('Delete assignment error:', error);
                showAlert(t('assignments.failedDeleteAssignment', 'Не удалось удалить назначение'));
            }
        },

        // View assignment results
        viewResults: function (assignmentId) {
            window.location.href = `/teacher-results.html?assignment_id=${assignmentId}`;
        }
    };
})();
