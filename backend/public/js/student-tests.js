// Student Tests & Assignments Management
(function () {
    'use strict';

    function t(key, fallback) {
        return window.ZedlyI18n?.translate(key) || fallback || key;
    }

    window.StudentTestsManager = {
        currentTab: 'available', // available, completed
        assignments: [],
        subjects: [],
        selectedSubjectId: null,
        focusAssignmentId: null,
        focusSubjectId: null,
        langListenerBound: false,

        // Safely serialize values for inline onclick handlers
        toJsArg: function (value) {
            const str = String(value ?? '');
            return `'${str.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
        },

        notify: function (message, options) {
            if (window.ZedlyDialog?.alert) {
                return window.ZedlyDialog.alert(message, options);
            }
            alert(message);
            return Promise.resolve(true);
        },

        askConfirm: function (message, options) {
            if (window.ZedlyDialog?.confirm) {
                return window.ZedlyDialog.confirm(message, options);
            }
            return Promise.resolve(confirm(message));
        },

        // Initialize student tests page
        init: function () {
            const params = new URLSearchParams(window.location.search);
            this.focusAssignmentId = params.get('assignment_id');
            this.focusSubjectId = params.get('subject_id');
            this.selectedSubjectId = this.focusSubjectId ? String(this.focusSubjectId) : null;
            this.applyTabTranslations();
            this.setupEventListeners();
            this.loadAssignments();
            if (!this.langListenerBound) {
                window.addEventListener('zedly:lang-changed', () => this.applyTabTranslations());
                this.langListenerBound = true;
            }
        },

        applyTabTranslations: function () {
            const availableTab = document.querySelector('[data-tab="available"]');
            const completedTab = document.querySelector('[data-tab="completed"]');
            if (availableTab) {
                availableTab.textContent = t('tests.availableTests', 'Доступные тесты');
            }
            if (completedTab) {
                completedTab.textContent = t('tests.completedTests', 'Завершенные тесты');
            }
        },

        // Setup event listeners
        setupEventListeners: function () {
            document.querySelectorAll('[data-tab]').forEach(tab => {
                tab.addEventListener('click', (e) => {
                    const tabName = e.currentTarget.dataset.tab;
                    this.switchTab(tabName);
                });
            });
        },

        // Switch tab
        switchTab: function (tabName) {
            this.currentTab = tabName;

            document.querySelectorAll('[data-tab]').forEach(tab => {
                tab.classList.remove('active');
                if (tab.dataset.tab === tabName) {
                    tab.classList.add('active');
                }
            });

            if (tabName === 'available') {
                this.loadAssignments();
            } else if (tabName === 'completed') {
                this.loadResults();
            }
        },

        // Select a subject and rerender tests list
        selectSubject: function (subjectId) {
            this.selectedSubjectId = String(subjectId);
            this.renderAssignments();
        },

        clearSubjectSelection: function () {
            this.selectedSubjectId = null;
            this.renderAssignments();
        },

        // Load subjects + assignments from API
        loadAssignments: async function () {
            const container = document.getElementById('testsContainer');
            if (!container) return;

            container.innerHTML = `
                <div style="text-align: center; padding: var(--spacing-3xl);">
                    <div class="spinner" style="display: inline-block;"></div>
                    <p style="margin-top: var(--spacing-lg); color: var(--text-secondary);">Загрузка тестов...</p>
                </div>
            `;

            try {
                const token = localStorage.getItem('access_token');
                const headers = { Authorization: `Bearer ${token}` };

                const [subjectsResponse, assignmentsResponse] = await Promise.all([
                    fetch('/api/student/subjects', { headers }),
                    fetch('/api/student/assignments?status=all', { headers })
                ]);

                if (!assignmentsResponse.ok) {
                    throw new Error('Failed to load assignments');
                }

                const assignmentsData = await assignmentsResponse.json();
                this.assignments = Array.isArray(assignmentsData.assignments) ? assignmentsData.assignments : [];

                if (subjectsResponse.ok) {
                    const subjectsData = await subjectsResponse.json();
                    this.subjects = this.normalizeSubjects(subjectsData.subjects);
                } else {
                    this.subjects = [];
                }

                // Fallback to subjects from assignments if school subjects endpoint is empty
                if (this.subjects.length === 0 && this.assignments.length > 0) {
                    const byId = new Map();
                    this.assignments.forEach((assignment) => {
                        if (assignment.subject_id == null) return;
                        const key = String(assignment.subject_id);
                        if (!byId.has(key)) {
                            byId.set(key, {
                                id: key,
                                name: assignment.subject_name || 'Без предмета',
                                color: assignment.subject_color || '#2563eb'
                            });
                        }
                    });
                    this.subjects = Array.from(byId.values());
                }

                if (this.focusAssignmentId && !this.selectedSubjectId) {
                    const focusAssignment = this.assignments.find((item) => String(item.id) === String(this.focusAssignmentId));
                    if (focusAssignment?.subject_id != null) {
                        this.selectedSubjectId = String(focusAssignment.subject_id);
                    }
                }

                if (this.selectedSubjectId) {
                    const hasSelected = this.subjects.some(subject => String(subject.id) === String(this.selectedSubjectId));
                    if (!hasSelected) {
                        this.selectedSubjectId = null;
                    }
                }

                this.renderAssignments();
            } catch (error) {
                console.error('Load assignments error:', error);
                container.innerHTML = `
                    <div class="error-message">
                        <p>Не удалось загрузить тесты. Попробуйте ещё раз.</p>
                    </div>
                `;
            }
        },

        normalizeSubjects: function (subjects) {
            if (!Array.isArray(subjects)) {
                return [];
            }

            return subjects
                .filter(subject => subject && subject.id != null)
                .map(subject => ({
                    id: String(subject.id),
                    name: subject.name || 'Без названия',
                    color: subject.color || '#2563eb'
                }));
        },

        getAssignmentsBySubjectId: function (subjectId) {
            const id = String(subjectId);
            return this.assignments.filter(assignment => String(assignment.subject_id) === id);
        },

        renderSubjectsCatalog: function () {
            let html = `
                <div class="subject-hub">
                    <div class="subject-hub-header">
                        <h3>Предметы</h3>
                        <p>Выберите предмет, чтобы увидеть доступные тесты.</p>
                    </div>
                    <div class="subject-catalog">
            `;

            this.subjects.forEach(subject => {
                const count = this.getAssignmentsBySubjectId(subject.id).length;
                html += `
                    <button
                        type="button"
                        class="subject-card"
                        onclick="StudentTestsManager.selectSubject(${this.toJsArg(subject.id)})"
                    >
                        <span class="subject-card__color" style="background:${subject.color};"></span>
                        <span class="subject-card__name">${subject.name}</span>
                        <span class="subject-card__meta">${count} ${this.getTestsWord(count)}</span>
                    </button>
                `;
            });

            html += '</div></div>';
            return html;
        },

        // Render assignments in subject-first UX
        renderAssignments: function () {
            const container = document.getElementById('testsContainer');
            if (!container) return;

            if (this.subjects.length === 0) {
                container.innerHTML = `
                    <div class="empty-state subject-empty-state">
                        <h3>Предметы пока не добавлены</h3>
                        <p>Когда в школе появятся предметы, здесь отобразятся соответствующие тесты.</p>
                    </div>
                `;
                return;
            }

            // Step 1: show only subjects until user selects one
            if (!this.selectedSubjectId) {
                container.innerHTML = this.renderSubjectsCatalog();
                return;
            }

            const selectedSubject = this.subjects.find(subject => String(subject.id) === String(this.selectedSubjectId));
            if (!selectedSubject) {
                this.selectedSubjectId = null;
                container.innerHTML = this.renderSubjectsCatalog();
                return;
            }

            const subjectAssignments = this.getAssignmentsBySubjectId(selectedSubject.id);
            const testsCount = subjectAssignments.length;

            let html = `
                ${this.renderSubjectsCatalog()}
                <div class="tests-section">
                    <div class="subject-selection-summary">
                        <div class="subject-selection-title">
                            <span class="subject-badge" style="background-color: ${selectedSubject.color}20; color: ${selectedSubject.color}; border: 1px solid ${selectedSubject.color}55;">
                                ${selectedSubject.name}
                            </span>
                            <h3>Тесты по предмету</h3>
                        </div>
                        <div class="subject-selection-actions">
                            <p>${testsCount} ${this.getTestsWord(testsCount)}</p>
                            <button type="button" class="btn btn-outline btn-sm" onclick="StudentTestsManager.clearSubjectSelection()">Выбрать другой предмет</button>
                        </div>
                    </div>
            `;

            if (subjectAssignments.length === 0) {
                html += `
                    <div class="empty-state">
                        <h3>По этому предмету пока нет тестов</h3>
                        <p>Выберите другой предмет или подождите, пока учитель назначит тест.</p>
                    </div>
                `;
                html += '</div>';
                container.innerHTML = html;
                return;
            }

            const now = new Date();
            const active = [];
            const upcoming = [];
            const expired = [];

            subjectAssignments.forEach(assignment => {
                const startDate = new Date(assignment.start_date);
                const endDate = new Date(assignment.end_date);

                if (now < startDate) {
                    upcoming.push(assignment);
                } else if (now > endDate) {
                    expired.push(assignment);
                } else {
                    active.push(assignment);
                }
            });

            if (active.length > 0) {
                html += '<h4 class="section-title">Доступные сейчас</h4><div class="tests-grid">';
                active.forEach(assignment => {
                    html += this.renderTestCard(assignment, 'active');
                });
                html += '</div>';
            }

            if (upcoming.length > 0) {
                html += '<h4 class="section-title">Скоро начнутся</h4><div class="tests-grid">';
                upcoming.forEach(assignment => {
                    html += this.renderTestCard(assignment, 'upcoming');
                });
                html += '</div>';
            }

            if (expired.length > 0) {
                html += '<h4 class="section-title">Завершённые</h4><div class="tests-grid">';
                expired.forEach(assignment => {
                    html += this.renderTestCard(assignment, 'expired');
                });
                html += '</div>';
            }

            html += '</div>';
            container.innerHTML = html;

            if (this.focusAssignmentId) {
                const targetCard = container.querySelector(`[data-assignment-id="${this.focusAssignmentId}"]`);
                if (targetCard) {
                    targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        },

        getTestsWord: function (count) {
            if (count % 10 === 1 && count % 100 !== 11) return 'тест';
            if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) return 'теста';
            return 'тестов';
        },

        // Render test card
        renderTestCard: function (assignment, status) {
            const attemptsLeft = assignment.max_attempts - assignment.attempts_made;
            const hasOngoing = assignment.ongoing_attempt_id !== null;
            const bestScore = assignment.best_score !== null ? parseFloat(assignment.best_score).toFixed(1) : null;
            const hasPendingGrading = assignment.has_pending_grading === true;
            const passed = bestScore !== null && bestScore >= assignment.passing_score;

            let actionButton = '';
            if (status === 'active') {
                if (hasOngoing) {
                    actionButton = `
                        <button class="btn btn-primary" onclick="StudentTestsManager.continueTest(${this.toJsArg(assignment.ongoing_attempt_id)})">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polygon points="5 3 19 12 5 21 5 3"></polygon>
                            </svg>
                            Продолжить
                        </button>
                    `;
                } else if (attemptsLeft > 0) {
                    actionButton = `
                        <button class="btn btn-primary" onclick="StudentTestsManager.startTest(${this.toJsArg(assignment.id)})">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polygon points="5 3 19 12 5 21 5 3"></polygon>
                            </svg>
                            Начать тест
                        </button>
                    `;
                } else {
                    actionButton = '<span class="text-secondary">Лимит попыток исчерпан</span>';
                }
            } else if (status === 'upcoming') {
                actionButton = `<button class="btn btn-outline" disabled>Старт: ${this.formatDate(assignment.start_date)}</button>`;
            } else {
                actionButton = `
                    <button class="btn btn-outline" onclick="StudentTestsManager.viewResults(${this.toJsArg(assignment.id)})">
                        Смотреть результат
                    </button>
                `;
            }

            const statusLabel = status === 'active'
                ? 'Доступен'
                : status === 'upcoming'
                    ? 'Ожидается'
                    : 'Завершён';

            return `
                <div class="test-card ${status} ${String(assignment.id) === String(this.focusAssignmentId) ? 'focused' : ''}" data-assignment-id="${assignment.id}">
                    <div class="test-card-header">
                        <span class="status-badge status-${status}">${statusLabel}</span>
                    </div>
                    <div class="test-card-body">
                        <h3 class="test-title">${assignment.test_title}</h3>
                        <p class="test-class">${assignment.class_name}</p>
                        ${assignment.test_description ? `<p class="test-description">${assignment.test_description}</p>` : ''}

                        <div class="test-meta">
                            <div class="meta-item">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <polyline points="12 6 12 12 16 14"></polyline>
                                </svg>
                                ${assignment.duration_minutes} мин
                            </div>
                            <div class="meta-item">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M9 11l3 3L22 4"></path>
                                    <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"></path>
                                </svg>
                                ${assignment.question_count} вопросов
                            </div>
                            <div class="meta-item">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M12 2v20M2 12h20"></path>
                                </svg>
                                Порог: ${assignment.passing_score}%
                            </div>
                        </div>

                        <div class="test-progress">
                            <div class="progress-row">
                                <span>Попытки:</span>
                                <span>${assignment.attempts_made} / ${assignment.max_attempts}</span>
                            </div>
                            ${bestScore !== null ? `
                                <div class="progress-row">
                                    <span>Лучший результат:</span>
                                    <span class="${hasPendingGrading ? 'text-warning' : (passed ? 'text-success' : 'text-warning')}">
                                        ${hasPendingGrading ? 'Проверяется' : bestScore + '%'}
                                    </span>
                                </div>
                            ` : ''}
                        </div>

                        ${status === 'active' ? `
                            <div class="test-deadline">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                    <line x1="16" y1="2" x2="16" y2="6"></line>
                                    <line x1="8" y1="2" x2="8" y2="6"></line>
                                    <line x1="3" y1="10" x2="21" y2="10"></line>
                                </svg>
                                Сдать до: ${this.formatDate(assignment.end_date)}
                            </div>
                        ` : ''}
                    </div>
                    <div class="test-card-footer">
                        ${actionButton}
                    </div>
                </div>
            `;
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

        // Start test
        startTest: async function (assignmentId) {
            const confirmed = await this.askConfirm(
                'Вы уверены, что хотите начать тест? Таймер запустится сразу.',
                { title: 'Начать тест', okText: 'Начать', cancelText: 'Отмена' }
            );

            if (!confirmed) {
                return;
            }

            try {
                const token = localStorage.getItem('access_token');
                const response = await fetch('/api/student/attempts', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ assignment_id: assignmentId })
                });

                const data = await response.json();

                if (response.ok) {
                    window.location.href = `/take-test.html?attempt_id=${data.attempt_id}`;
                } else {
                    await this.notify(data.message || 'Не удалось начать тест');
                }
            } catch (error) {
                console.error('Start test error:', error);
                await this.notify('Не удалось начать тест. Попробуйте ещё раз.');
            }
        },

        // Continue test
        continueTest: function (attemptId) {
            window.location.href = `/take-test.html?attempt_id=${attemptId}`;
        },

        // View results
        viewResults: function (assignmentId) {
            window.location.href = `/test-results.html?assignment_id=${assignmentId}`;
        },

        // Load test results
        loadResults: async function () {
            const container = document.getElementById('testsContainer');
            if (!container) return;

            container.innerHTML = `
                <div style="text-align: center; padding: var(--spacing-3xl);">
                    <div class="spinner" style="display: inline-block;"></div>
                    <p style="margin-top: var(--spacing-lg); color: var(--text-secondary);">Загрузка результатов...</p>
                </div>
            `;

            try {
                const token = localStorage.getItem('access_token');
                const response = await fetch('/api/student/results', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!response.ok) {
                    throw new Error('Failed to load results');
                }

                const data = await response.json();
                this.renderResults(data.results);
            } catch (error) {
                console.error('Load results error:', error);
                container.innerHTML = `
                    <div class="error-message">
                        <p>Не удалось загрузить результаты. Попробуйте ещё раз.</p>
                    </div>
                `;
            }
        },

        // Render results
        renderResults: function (results) {
            const container = document.getElementById('testsContainer');
            if (!container) return;

            if (results.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; padding: var(--spacing-3xl);">
                        <p style="color: var(--text-secondary);">Пока нет завершённых тестов.</p>
                    </div>
                `;
                return;
            }

            let html = `
                <div class="table-responsive">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Тест</th>
                                <th>Предмет</th>
                                <th>Класс</th>
                                <th>Дата</th>
                                <th>Баллы</th>
                                <th>Результат</th>
                                <th>Действия</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            results.forEach(result => {
                const percentage = parseFloat(result.percentage);
                const statusClass = percentage >= 60 ? 'status-active' : 'status-warning';
                const statusText = percentage >= 60 ? 'Сдан' : 'Не сдан';

                html += `
                    <tr>
                        <td>
                            <div class="user-name">${result.test_title}</div>
                        </td>
                        <td>
                            ${result.subject_name ? `
                                <span class="subject-badge" style="background-color: ${result.subject_color}20; color: ${result.subject_color};">
                                    ${result.subject_name}
                                </span>
                            ` : '-'}
                        </td>
                        <td>${result.class_name}</td>
                        <td>${this.formatDate(result.submitted_at)}</td>
                        <td>${result.score} / ${result.max_score}</td>
                        <td>
                            <span class="status-badge ${statusClass}">${percentage.toFixed(1)}% - ${statusText}</span>
                        </td>
                        <td>
                            <button class="btn-icon" onclick="StudentTestsManager.viewAttemptDetails(${this.toJsArg(result.attempt_id)})" title="Подробнее">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                    <circle cx="12" cy="12" r="3"></circle>
                                </svg>
                            </button>
                        </td>
                    </tr>
                `;
            });

            html += `
                        </tbody>
                    </table>
                </div>
            `;

            container.innerHTML = html;
        },

        // View attempt details
        viewAttemptDetails: function (attemptId) {
            window.location.href = `/test-results.html?attempt_id=${attemptId}`;
        }
    };
})();
