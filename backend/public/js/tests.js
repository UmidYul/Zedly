// Tests Management Component (Teacher)
(function () {
    'use strict';

    function looksLikeMojibake(value) {
        if (typeof value !== 'string' || value.length < 4) return false;
        // Typical broken UTF-8/CP1251 pattern: Р..., С...
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

    function escapeHtml(value) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return String(value ?? '').replace(/[&<>"']/g, (char) => map[char]);
    }

    function toPositiveInt(value, fallback = 0) {
        const parsed = Number.parseInt(String(value ?? ''), 10);
        if (!Number.isFinite(parsed) || parsed < 0) return fallback;
        return parsed;
    }

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

    function getQuestionTypeLabel(type) {
        const normalized = String(type || '').toLowerCase();
        const labels = {
            singlechoice: t('testEditor.typeSingleChoice', 'Один выбор'),
            multiplechoice: t('testEditor.typeMultipleChoice', 'Множественный выбор'),
            truefalse: t('testEditor.typeTrueFalse', 'Верно/Неверно'),
            shortanswer: t('testEditor.typeShortAnswer', 'Краткий ответ'),
            matching: t('testEditor.typeMatching', 'Сопоставление'),
            ordering: t('testEditor.typeOrdering', 'Последовательность'),
            fillblanks: t('testEditor.typeFillBlanks', 'Заполнить пропуски'),
            imagebased: t('testEditor.typeImageBased', 'По изображению')
        };

        return labels[normalized] || normalized;
    }

    function showBulkProgress(total) {
        const existing = document.getElementById('testsBulkDeleteOverlay');
        if (existing) existing.remove();
        const overlay = document.createElement('div');
        overlay.id = 'testsBulkDeleteOverlay';
        overlay.className = 'operation-progress-overlay';
        overlay.innerHTML = `
            <div class="operation-progress-modal">
                <div class="progress-head">
                    <div class="progress-label"><span class="spinner" style="display:inline-block;"></span><span>${t('tests.bulkDeleteProgress', 'Массовое удаление...')}</span></div>
                    <strong id="testsBulkDeletePercent">0%</strong>
                </div>
                <div class="progress-track"><div class="progress-fill" id="testsBulkDeleteFill" style="width:0%"></div></div>
                <div id="testsBulkDeleteMeta" class="text-secondary" style="margin-top:8px;">0 / ${Number(total) || 0}</div>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    function updateBulkProgress(done, total, failed) {
        const safeTotal = Math.max(1, Number(total) || 1);
        const safeDone = Math.min(safeTotal, Math.max(0, Number(done) || 0));
        const percent = Math.round((safeDone / safeTotal) * 100);
        const fill = document.getElementById('testsBulkDeleteFill');
        const pct = document.getElementById('testsBulkDeletePercent');
        const meta = document.getElementById('testsBulkDeleteMeta');
        if (fill) fill.style.width = `${percent}%`;
        if (pct) pct.textContent = `${percent}%`;
        if (meta) meta.textContent = `${safeDone} / ${safeTotal}` + (failed ? ` | ${t('tests.failedCount', 'Ошибок')}: ${failed}` : '');
    }

    function hideBulkProgress() {
        const overlay = document.getElementById('testsBulkDeleteOverlay');
        if (overlay) overlay.remove();
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
                const response = await fetch('/api/teacher/subjects');

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

            subjectFilter.innerHTML = `<option value="all">${t('tests.allSubjects', 'Все предметы')}</option>`;
            this.subjects.forEach(subject => {
                const option = document.createElement('option');
                option.value = subject.id;
                option.textContent = subject.name || subject.name_ru || subject.name_uz || t('tests.subject', 'Предмет');
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
                    <p style="margin-top: var(--spacing-lg); color: var(--text-secondary);">${t('tests.loading', 'Загрузка тестов...')}</p>
                </div>
            `;

            try {
                const params = new URLSearchParams({
                    page: this.currentPage,
                    limit: this.limit,
                    search: this.searchTerm,
                    subject: this.subjectFilter,
                    status: this.statusFilter
                });

                const response = await fetch(`/api/teacher/tests?${params}`);

                if (!response.ok) throw new Error(t('tests.failedLoadTests', 'Не удалось загрузить тесты'));

                const data = await response.json();
                this.renderTests(data.tests, data.pagination);
            } catch (error) {
                console.error('Load tests error:', error);
                container.innerHTML = `
                    <div class="error-message">
                        <p>${t('tests.failedLoadTryAgain', 'Не удалось загрузить тесты. Попробуйте снова.')}</p>
                    </div>
                `;
            }
        },

        // Render tests list
        renderTests: function (tests, pagination) {
            const container = document.getElementById('testsContainer');
            if (!container) return;
            this.lastRenderedTests = Array.isArray(tests) ? tests : [];

            if (this.lastRenderedTests.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; padding: var(--spacing-3xl);">
                        <p style="color: var(--text-secondary);">${t('tests.noTestsFound', 'Тесты не найдены. Создайте первый тест!')}</p>
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
                                aria-label="${t('tests.selectAllTestsAria', 'Выбрать все тесты')}"
                            >
                            <span>${t('tests.selectAllOnPage', 'Выбрать все на странице')}</span>
                        </label>
                        <span class="bulk-count-pill" id="testsBulkCount">0 ${t('tests.selectedCountSuffix', 'выбрано')}</span>
                        <button class="btn btn-sm btn-outline" id="testsClearSelectionBtn" onclick="TestsManager.clearSelection()">${t('tests.clearSelection', 'Очистить')}</button>
                    </div>
                    <div class="bulk-toolbar-right">
                        <button class="btn btn-sm btn-danger" id="testsBulkDeleteBtn" onclick="TestsManager.bulkDeleteTests()" disabled>
                            ${t('tests.deleteSelected', 'Удалить выбранные')}
                        </button>
                    </div>
                </div>
                <div class="tests-grid">
            `;

            this.lastRenderedTests.forEach(test => {
                const testId = String(test?.id ?? '').trim();
                if (!testId) return;

                const encodedId = encodeURIComponent(testId);
                const statusClass = test.is_active ? 'status-active' : 'status-draft';
                const statusText = test.is_active
                    ? t('tests.statusActive', 'Активный')
                    : t('tests.statusDraft', 'Черновик');
                const subjectBadgeStyle = buildSubjectBadgeStyle(test.subject_color);
                const isSelected = this.selectedIds.has(testId);
                const selectLabelName = escapeHtml(test.title || t('tests.testFallbackName', 'тест'));
                const subjectName = escapeHtml(test.subject_name || t('tests.noSubject', 'Без предмета'));
                const testTitle = escapeHtml(test.title || t('tests.testFallbackName', 'Без названия'));
                const description = escapeHtml(test.description || t('tests.noDescription', 'Без описания'));
                const durationMinutes = toPositiveInt(test.duration_minutes, 0);
                const questionCount = toPositiveInt(test.question_count, 0);
                const maxAttempts = Math.max(1, toPositiveInt(test.max_attempts, 1));

                html += `
                    <div class="test-card ${isSelected ? 'bulk-card-selected' : ''}" data-test-id="${escapeHtml(testId)}">
                        <label class="test-bulk-select">
                            <input
                                type="checkbox"
                                class="bulk-row-checkbox"
                                ${isSelected ? 'checked' : ''}
                                onchange="TestsManager.toggleSelectTest(decodeURIComponent('${encodedId}'))"
                                aria-label="${t('tests.selectTestAria', 'Выбрать тест')}: ${selectLabelName}"
                            >
                        </label>
                        <div class="test-card-header">
                            <div class="test-subject" style="${subjectBadgeStyle}">
                                ${subjectName}
                            </div>
                            <span class="status-badge ${statusClass}">${escapeHtml(statusText)}</span>
                        </div>
                        <div class="test-card-body">
                            <h3 class="test-title">${testTitle}</h3>
                            <p class="test-description">${description}</p>
                            <div class="test-stats">
                                <div class="stat">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <circle cx="12" cy="12" r="10"></circle>
                                        <polyline points="12 6 12 12 16 14"></polyline>
                                    </svg>
                                    <span>${durationMinutes} ${t('tests.minShort', 'мин')}</span>
                                </div>
                                <div class="stat">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M9 11l3 3L22 4"></path>
                                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                                    </svg>
                                    <span>${questionCount} ${t('tests.questionsShort', 'вопр.')}</span>
                                </div>
                                <div class="stat">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                        <circle cx="12" cy="7" r="4"></circle>
                                    </svg>
                                    <span>${maxAttempts} ${t('tests.attempts', 'попыток')}</span>
                                </div>
                            </div>
                        </div>
                        <div class="test-card-footer">
                            <button class="btn btn-sm btn-outline" onclick="TestsManager.viewTest(decodeURIComponent('${encodedId}'))">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                    <circle cx="12" cy="12" r="3"></circle>
                                </svg>
                                ${t('tests.view', 'Просмотр')}
                            </button>
                            <button class="btn btn-sm btn-primary" onclick="TestsManager.editTest(decodeURIComponent('${encodedId}'))">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                                ${t('tests.edit', 'Редактировать')}
                            </button>
                            <button class="btn btn-sm btn-danger" onclick="TestsManager.deleteTest(decodeURIComponent('${encodedId}'))">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                                ${t('tests.delete', 'Удалить')}
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
            const normalizedId = String(testId || '').trim();
            if (!normalizedId) return;

            if (this.selectedIds.has(normalizedId)) {
                this.selectedIds.delete(normalizedId);
            } else {
                this.selectedIds.add(normalizedId);
            }
            this.syncSelectionUi();
        },

        toggleSelectAllTests: function (checked) {
            const currentIds = this.lastRenderedTests
                .map(test => String(test.id || '').trim())
                .filter(Boolean);
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
                countEl.textContent = `${count} ${t('tests.selectedCountSuffix', 'выбрано')}`;
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
                const currentIds = this.lastRenderedTests
                    .map(test => String(test.id || '').trim())
                    .filter(Boolean);
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

            const confirmed = await showConfirm(
                t('tests.bulkDeleteConfirm', 'Вы уверены, что хотите безвозвратно удалить выбранные тесты ({count})?')
                    .replace('{count}', ids.length)
            );
            if (!confirmed) return;

            let failed = 0;
            let done = 0;
            showBulkProgress(ids.length);
            updateBulkProgress(done, ids.length, failed);
            try {
                for (const id of ids) {
                    try {
                        const response = await fetch(`/api/teacher/tests/${id}`, {
                            method: 'DELETE'
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
                showAlert(
                    t('tests.bulkDeleteResultStats', 'Удалено: {deleted}. Ошибок: {failed}.')
                        .replace('{deleted}', deleted)
                        .replace('{failed}', failed),
                    t('tests.bulkDeleteResultTitle', 'Массовое удаление')
                );
            }
            this.loadTests();
        },

        // Render pagination
        renderPagination: function (pagination) {
            let html = '<div class="pagination">';

            if (pagination.page > 1) {
                html += `<button class="pagination-btn" onclick="TestsManager.goToPage(${pagination.page - 1})">${t('common.prev', 'Назад')}</button>`;
            }

            for (let i = 1; i <= pagination.pages; i++) {
                if (i === pagination.page) {
                    html += `<button class="pagination-btn active">${i}</button>`;
                } else {
                    html += `<button class="pagination-btn" onclick="TestsManager.goToPage(${i})">${i}</button>`;
                }
            }

            if (pagination.page < pagination.pages) {
                html += `<button class="pagination-btn" onclick="TestsManager.goToPage(${pagination.page + 1})">${t('common.next', 'Далее')}</button>`;
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
                const normalizedId = encodeURIComponent(String(testId || '').trim());
                const response = await fetch(`/api/teacher/tests/${normalizedId}`);

                if (!response.ok) {
                    throw new Error(t('tests.failedLoadTest', 'Не удалось загрузить тест'));
                }

                const data = await response.json();
                this.renderTestPreviewModal(data.test, data.questions || []);
            } catch (error) {
                console.error('Load test preview error:', error);
                showAlert(t('tests.failedLoadPreview', 'Не удалось загрузить предпросмотр теста'));
            }
        },

        renderTestPreviewModal: function (test, questions) {
            const testTitle = escapeHtml(test?.title || t('tests.testFallbackName', 'Без названия'));
            const subjectName = escapeHtml(test?.subject_name || '-');
            const durationMinutes = toPositiveInt(test?.duration_minutes, 0);
            const passingScore = toPositiveInt(test?.passing_score, 0);
            const safeDescription = String(test?.description || '').trim();
            const safeQuestions = Array.isArray(questions) ? questions : [];
            const modalHtml = `
                <div class="modal-overlay" id="testPreviewModal">
                    <div class="modal modal-large">
                        <div class="modal-header">
                            <h2 class="modal-title">${testTitle}</h2>
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
                                        <label>${t('tests.subjectLabel', 'Предмет')}:</label>
                                        <span>${subjectName}</span>
                                    </div>
                                    <div class="detail-item">
                                        <label>${t('tests.durationLabel', 'Длительность')}:</label>
                                        <span>${durationMinutes || '-'} ${t('tests.minutes', 'минут')}</span>
                                    </div>
                                    <div class="detail-item">
                                        <label>${t('tests.passingScoreLabel', 'Проходной балл')}:</label>
                                        <span>${passingScore}%</span>
                                    </div>
                                    <div class="detail-item">
                                        <label>${t('tests.questionsLabel', 'Вопросы')}:</label>
                                        <span>${safeQuestions.length}</span>
                                    </div>
                                </div>
                                ${safeDescription ? `<p style="margin-top: 12px; color: var(--text-secondary);">${escapeHtml(safeDescription)}</p>` : ''}
                            </div>
                            <div class="detail-section">
                                <h3>${t('tests.questionsLabel', 'Вопросы')}</h3>
                                ${safeQuestions.length === 0 ? `<p style="color: var(--text-secondary);">${t('tests.noQuestionsFound', 'Вопросы не найдены.')}</p>` : `
                                    <div class="table-responsive">
                                        <table class="data-table">
                                            <thead>
                                                <tr>
                                                    <th>#</th>
                                                    <th>${t('tests.type', 'Тип')}</th>
                                                    <th>${t('tests.question', 'Вопрос')}</th>
                                                    <th>${t('tests.marks', 'Баллы')}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${safeQuestions.map((q, index) => `
                                                    <tr>
                                                        <td>${index + 1}</td>
                                                        <td>${escapeHtml(getQuestionTypeLabel(q.question_type))}</td>
                                                        <td>${escapeHtml(q.question_text || '')}</td>
                                                        <td>${toPositiveInt(q.marks, 0)}</td>
                                                    </tr>
                                                `).join('')}
                                            </tbody>
                                        </table>
                                    </div>
                                `}
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button class="btn btn-outline" onclick="TestsManager.closeTestPreview()">${t('common.close', 'Закрыть')}</button>
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
        deleteTest: async function (testId) {
            const normalizedId = String(testId || '').trim();
            if (!normalizedId) return;

            const currentTest = this.lastRenderedTests.find((item) => String(item.id || '').trim() === normalizedId);
            const testTitle = currentTest?.title || t('tests.testFallbackName', 'тест');
            const confirmed = await showConfirm(
                t('tests.deleteConfirmSingle', 'Вы уверены, что хотите безвозвратно удалить "{title}"?')
                    .replace('{title}', testTitle)
            );
            if (!confirmed) {
                return;
            }

            try {
                const response = await fetch(`/api/teacher/tests/${encodeURIComponent(normalizedId)}`, {
                    method: 'DELETE'
                });

                if (response.ok) {
                    this.selectedIds.delete(normalizedId);
                    this.loadTests();
                } else {
                    showAlert(t('tests.failedDeleteTest', 'Не удалось удалить тест'));
                }
            } catch (error) {
                console.error('Delete test error:', error);
                showAlert(t('tests.failedDeleteTest', 'Не удалось удалить тест'));
            }
        }
    };
})();
