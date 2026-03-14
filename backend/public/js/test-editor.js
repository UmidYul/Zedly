// Test Editor Module - Question Constructor
(function () {
    'use strict';

    function t(key, fallback) {
        return window.ZedlyI18n?.translate(key) || fallback || key;
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

    function showConfirm(message, title = null) {
        const dialogTitle = title || t('common.confirmation', 'Подтверждение');
        if (window.ZedlyDialog?.confirm) {
            return window.ZedlyDialog.confirm(message, { title: dialogTitle });
        }
        return Promise.resolve(confirm(message));
    }

    // Question types configuration
    const QUESTION_TYPES = {
        SINGLE_CHOICE: {
            id: 'singlechoice',
            name: t('testEditor.typeSingleChoice', 'Один выбор'),
            icon: '◉',
            description: t('testEditor.typeSingleChoiceDesc', 'Один правильный ответ')
        },
        MULTIPLE_CHOICE: {
            id: 'multiplechoice',
            name: t('testEditor.typeMultipleChoice', 'Множественный выбор'),
            icon: '☑',
            description: t('testEditor.typeMultipleChoiceDesc', 'Несколько правильных ответов')
        },
        TRUE_FALSE: {
            id: 'truefalse',
            name: t('testEditor.typeTrueFalse', 'Верно/Неверно'),
            icon: '✓✗',
            description: t('testEditor.typeTrueFalseDesc', 'Выберите верное утверждение')
        },
        SHORT_ANSWER: {
            id: 'shortanswer',
            name: t('testEditor.typeShortAnswer', 'Краткий ответ'),
            icon: '✎',
            description: t('testEditor.typeShortAnswerDesc', 'Короткий текстовый ответ')
        },
        ESSAY: {
            id: 'essay',
            name: t('testEditor.typeEssay', 'Развернутый ответ'),
            icon: '📝',
            description: t('testEditor.typeEssayDesc', 'Ответ проверяет учитель')
        },
        MATCHING: {
            id: 'matching',
            name: t('testEditor.typeMatching', 'Сопоставление'),
            icon: '↔',
            description: t('testEditor.typeMatchingDesc', 'Соедините пары')
        },
        ORDERING: {
            id: 'ordering',
            name: t('testEditor.typeOrdering', 'Последовательность'),
            icon: '↕',
            description: t('testEditor.typeOrderingDesc', 'Расположите в правильном порядке')
        },
        FILL_BLANKS: {
            id: 'fillblanks',
            name: t('testEditor.typeFillBlanks', 'Заполнить пропуски'),
            icon: '___',
            description: t('testEditor.typeFillBlanksDesc', 'Заполните пропущенные слова')
        },
        IMAGE_BASED: {
            id: 'imagebased',
            name: t('testEditor.typeImageBased', 'По изображению'),
            icon: '🖼',
            description: t('testEditor.typeImageBasedDesc', 'Вопрос с изображением')
        }
    };

    window.TestEditor = {
        currentTest: null,
        questions: [],
        subjects: [],
        currentStep: 1,
        editingQuestionIndex: -1,
        dragSourceIndex: null,

        // Open editor for new or existing test
        open: async function (testId = null) {
            if (testId) {
                await this.loadTest(testId);
            } else {
                this.currentTest = null;
                this.questions = [];
            }

            await this.loadSubjects();
            this.currentStep = 1;
            this.render();
        },

        // Load existing test
        loadTest: async function (testId) {
            try {
                const response = await fetch(`/api/teacher/tests/${testId}`, {
                    credentials: 'include'
                });

                if (response.ok) {
                    const data = await response.json();
                    this.currentTest = data.test;
                    this.questions = data.questions || [];
                } else {
                    throw new Error(t('tests.failedLoadTest', 'Не удалось загрузить тест'));
                }
            } catch (error) {
                console.error('Load test error:', error);
                alert(t('tests.failedLoadTest', 'Не удалось загрузить тест'));
            }
        },

        // Load subjects
        loadSubjects: async function () {
            try {
                const response = await fetch('/api/teacher/subjects', {
                    credentials: 'include'
                });

                if (response.ok) {
                    const data = await response.json();
                    this.subjects = data.subjects;
                }
            } catch (error) {
                console.error('Load subjects error:', error);
            }
        },

        downloadImportTemplate: async function () {
            try {
                const response = await fetch('/api/teacher/tests/questions/import-template', {
                    credentials: 'include'
                });
                if (!response.ok) {
                    throw new Error(t('testEditor.downloadTemplateFailed', 'Failed to download import template'));
                }

                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = 'test_questions_import_template.xlsx';
                document.body.appendChild(link);
                link.click();
                link.remove();
                URL.revokeObjectURL(url);
            } catch (error) {
                console.error('Download import template error:', error);
                alert(error.message || t('testEditor.downloadTemplateFailed', 'Failed to download import template'));
            }
        },

        triggerImportExcel: function () {
            const input = document.getElementById('questionsImportFile');
            if (input) input.click();
        },

        importFromExcelFile: async function (file) {
            if (!file) return;
            const name = String(file.name || '').toLowerCase();
            if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
                alert(t('testEditor.importExcelInvalidType', 'Select an Excel file (.xlsx or .xls)'));
                return;
            }

            try {
                const formData = new FormData();
                formData.append('file', file);

                const response = await fetch('/api/teacher/tests/questions/import-excel', {
                    method: 'POST',
                    credentials: 'include',
                    body: formData
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    throw new Error(data.message || t('testEditor.importExcelFailed', 'Failed to import questions'));
                }

                const importedQuestions = Array.isArray(data.questions) ? data.questions : [];
                if (!importedQuestions.length) {
                    alert(t('testEditor.importExcelNoQuestions', 'No valid questions found in file'));
                    return;
                }

                this.questions = this.questions.concat(importedQuestions);
                this.updateQuestionsList();

                const imported = Number(data?.stats?.imported || importedQuestions.length);
                const skipped = Number(data?.stats?.skipped || 0);
                const successTemplate = t('testEditor.importExcelSuccess', 'Questions imported: {imported}. Skipped: {skipped}.');
                alert(
                    successTemplate
                        .replace('{imported}', String(imported))
                        .replace('{skipped}', String(skipped))
                );
            } catch (error) {
                console.error('Import questions from excel error:', error);
                alert(error.message || t('testEditor.importExcelFailed', 'Failed to import questions'));
            } finally {
                const input = document.getElementById('questionsImportFile');
                if (input) input.value = '';
            }
        },

        getEditorSteps: function () {
            return [
                { id: 1, label: t('testEditor.stepSettings', 'Настройки') },
                { id: 2, label: t('testEditor.stepQuestions', 'Вопросы') },
                { id: 3, label: t('testEditor.stepPublish', 'Публикация') }
            ];
        },

        // Render editor modal
        render: function () {
            const test = this.currentTest || {};
            const steps = this.getEditorSteps();
            const modalTitle = test.id
                ? t('testEditor.editTest', 'Редактировать тест')
                : t('testEditor.createNewTest', 'Создать новый тест');
            const modalHtml = `
                <div class="modal-overlay" id="testEditorModal">
                    <div class="modal modal-xl test-editor">
                        <div class="modal-header">
                            <h2 class="modal-title">${modalTitle}</h2>
                            <button class="modal-close" onclick="TestEditor.close()">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </div>
                        <div class="test-editor-stepper" role="tablist" aria-label="${t('testEditor.creationSteps', 'Этапы создания теста')}">
                            ${steps.map((step, index) => `
                                <button
                                    type="button"
                                    class="test-editor-step-indicator ${this.currentStep === step.id ? 'is-active' : ''}"
                                    data-step="${step.id}"
                                    onclick="TestEditor.goToStep(${step.id})"
                                >
                                    <span class="test-editor-step-index">${step.id}</span>
                                    <span class="test-editor-step-label">${step.label}</span>
                                </button>
                                ${index < steps.length - 1 ? '<span class="test-editor-step-divider" aria-hidden="true"></span>' : ''}
                            `).join('')}
                        </div>
                        <div class="modal-body test-editor-body">
                            <div class="test-editor-step-page ${this.currentStep === 1 ? 'is-active' : ''}" data-step-page="1">
                                <div class="test-editor-section">
                                    <h3 class="section-title">${t('testEditor.testInformation', 'Информация о тесте')}</h3>
                                    <div class="form-row">
                                        <div class="form-group" style="flex: 2;">
                                            <label class="form-label">${t('testEditor.testTitle', 'Название теста')} <span class="required">*</span></label>
                                            <input type="text" id="testTitle" class="form-input" value="${test.title || ''}" placeholder="${t('testEditor.testTitlePlaceholder', 'Введите название теста')}" required>
                                        </div>
                                        <div class="form-group">
                                            <label class="form-label">${t('testEditor.subject', 'Предмет')} <span class="required">*</span></label>
                                            <select id="testSubject" class="form-input" required>
                                                <option value="">${t('testEditor.selectSubject', 'Выберите предмет')}</option>
                                                ${this.subjects.map(s => `
                                                    <option value="${s.id}" ${test.subject_id == s.id ? 'selected' : ''}>${s.name}</option>
                                                `).join('')}
                                            </select>
                                        </div>
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label">${t('testEditor.description', 'Описание')}</label>
                                        <textarea id="testDescription" class="form-textarea" rows="3" placeholder="${t('testEditor.descriptionPlaceholder', 'Введите описание теста')}">${test.description || ''}</textarea>
                                    </div>
                                    <div class="form-row">
                                        <div class="form-group">
                                            <label class="form-label">${t('testEditor.durationMinutes', 'Длительность (минуты)')}</label>
                                            <input type="number" id="testDuration" class="form-input" value="${test.duration_minutes || 60}" min="1">
                                        </div>
                                        <div class="form-group">
                                            <label class="form-label">${t('testEditor.passingScore', 'Проходной балл (%)')}</label>
                                            <input type="number" id="testPassingScore" class="form-input" value="${test.passing_score || 60}" min="0" max="100">
                                        </div>
                                        <div class="form-group">
                                            <label class="form-label">${t('testEditor.maxAttempts', 'Макс. попыток')}</label>
                                            <input type="number" id="testMaxAttempts" class="form-input" value="${test.max_attempts || 1}" min="1">
                                        </div>
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label">${t('testEditor.antiCheating', 'Анти-списывание')}</label>
                                        <label class="checkbox-label">
                                            <input type="checkbox" id="testBlockCopyPaste" ${test.block_copy_paste !== false ? 'checked' : ''}>
                                            <span>${t('testEditor.blockCopyPaste', 'Запретить копирование/вставку')}</span>
                                        </label>
                                        <label class="checkbox-label" style="margin-left: 16px;">
                                            <input type="checkbox" id="testTrackTabSwitches" ${test.track_tab_switches !== false ? 'checked' : ''}>
                                            <span>${t('testEditor.trackTabSwitches', 'Отслеживать переключение вкладок')}</span>
                                        </label>
                                        <label class="checkbox-label" style="margin-left: 16px;">
                                            <input type="checkbox" id="testFullscreenRequired" ${test.fullscreen_required === true ? 'checked' : ''}>
                                            <span>${t('testEditor.requireFullscreen', 'Требовать полноэкранный режим')}</span>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            <div class="test-editor-step-page ${this.currentStep === 2 ? 'is-active' : ''}" data-step-page="2">
                                <div class="test-editor-section">
                                    <div class="section-header">
                                        <h3 class="section-title" id="questionsSectionTitle">${t('testEditor.questions', 'Вопросы')} (${this.questions.length})</h3>
                                        <div class="test-editor-question-actions">
                                            <button class="btn btn-outline btn-sm" onclick="TestEditor.downloadImportTemplate()">
                                                ${t('testEditor.downloadImportTemplate', 'Download template')}
                                            </button>
                                            <button class="btn btn-outline btn-sm" onclick="TestEditor.triggerImportExcel()">
                                                ${t('testEditor.importFromExcel', 'Import Excel')}
                                            </button>
                                            <button class="btn btn-primary btn-sm" onclick="TestEditor.showQuestionTypeSelector()">
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                    <line x1="12" y1="5" x2="12" y2="19"></line>
                                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                                </svg>
                                                ${t('testEditor.addQuestion', 'Добавить вопрос')}
                                            </button>
                                        </div>
                                    </div>
                                    <input id="questionsImportFile" type="file" accept=".xlsx,.xls" style="display:none;">
                                    <div id="questionsList">
                                        ${this.renderQuestionsList()}
                                    </div>
                                </div>
                            </div>

                            <div class="test-editor-step-page ${this.currentStep === 3 ? 'is-active' : ''}" data-step-page="3">
                                <div class="test-editor-section">
                                    <h3 class="section-title">${t('testEditor.preview', 'Предпросмотр теста')}</h3>
                                    <div class="test-publish-summary-grid" id="testPublishPreviewSummary"></div>
                                </div>
                                <div class="test-editor-section">
                                    <h3 class="section-title">${t('testEditor.questions', 'Вопросы')}</h3>
                                    <div id="testPublishPreviewQuestions"></div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer test-editor-footer">
                            <div class="test-editor-footer-left">
                                <button class="btn btn-outline" id="testEditorBackBtn" onclick="TestEditor.previousStep()">${t('common.prev', 'Назад')}</button>
                            </div>
                            <div class="test-editor-footer-right">
                                <button class="btn btn-primary" id="testEditorNextBtn" onclick="TestEditor.nextStep()">${t('common.next', 'Далее')}</button>
                                <button class="btn btn-outline" id="testEditorSaveDraftBtn" onclick="TestEditor.saveAsDraft()">${t('testEditor.saveAsDraft', 'Сохранить как черновик')}</button>
                                <button class="btn btn-primary" id="testEditorPublishBtn" onclick="TestEditor.publish()">${t('testEditor.publishTest', 'Опубликовать тест')}</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);

            // Close on overlay click
            document.getElementById('testEditorModal').addEventListener('click', (e) => {
                if (e.target.id === 'testEditorModal') {
                    this.close();
                }
            });

            const importInput = document.getElementById('questionsImportFile');
            if (importInput) {
                importInput.addEventListener('change', (event) => {
                    const file = event.target?.files?.[0];
                    if (file) {
                        this.importFromExcelFile(file);
                    }
                });
            }

            this.bindStepFormSync();
            this.goToStep(this.currentStep, { force: true });
            this.initDragAndDrop();
        },

        bindStepFormSync: function () {
            const watchIds = [
                'testTitle',
                'testSubject',
                'testDescription',
                'testDuration',
                'testPassingScore',
                'testMaxAttempts'
            ];

            watchIds.forEach((id) => {
                const element = document.getElementById(id);
                if (!element) return;
                const eventName = element.tagName === 'SELECT' ? 'change' : 'input';
                element.addEventListener(eventName, () => {
                    if (this.currentStep === 3) {
                        this.refreshPublishPreview();
                    }
                });
            });
        },

        goToStep: function (step, options = {}) {
            const force = options?.force === true;
            const numericStep = Number.parseInt(String(step ?? ''), 10);
            const safeStep = Number.isFinite(numericStep) ? Math.min(3, Math.max(1, numericStep)) : 1;
            if (!force && safeStep === this.currentStep) return;

            this.currentStep = safeStep;

            document.querySelectorAll('.test-editor-step-page').forEach((page) => {
                const pageStep = Number.parseInt(page.dataset.stepPage || '', 10);
                page.classList.toggle('is-active', pageStep === safeStep);
            });

            document.querySelectorAll('.test-editor-step-indicator').forEach((indicator) => {
                const indicatorStep = Number.parseInt(indicator.dataset.step || '', 10);
                indicator.classList.toggle('is-active', indicatorStep === safeStep);
                indicator.classList.toggle('is-complete', indicatorStep < safeStep);
            });

            const backBtn = document.getElementById('testEditorBackBtn');
            const nextBtn = document.getElementById('testEditorNextBtn');
            const saveDraftBtn = document.getElementById('testEditorSaveDraftBtn');
            const publishBtn = document.getElementById('testEditorPublishBtn');

            if (backBtn) backBtn.style.display = safeStep > 1 ? '' : 'none';
            if (nextBtn) nextBtn.style.display = safeStep < 3 ? '' : 'none';
            if (saveDraftBtn) saveDraftBtn.style.display = safeStep === 3 ? '' : 'none';
            if (publishBtn) publishBtn.style.display = safeStep === 3 ? '' : 'none';

            if (safeStep === 3) {
                this.refreshPublishPreview();
            }
        },

        nextStep: function () {
            this.goToStep(this.currentStep + 1);
        },

        previousStep: function () {
            this.goToStep(this.currentStep - 1);
        },

        renderPublishQuestionPreview: function () {
            if (this.questions.length === 0) {
                return `
                    <div class="empty-state">
                        <p>${t('testEditor.noQuestionsAdded', 'Пока нет вопросов. Добавьте вопросы на предыдущем шаге.')}</p>
                    </div>
                `;
            }

            const previewQuestions = this.questions.slice(0, 5);
            const list = previewQuestions.map((question, index) => {
                const text = escapeHtml(question?.question_text || t('testEditor.noQuestionText', 'Без текста вопроса'));
                const typeLabel = escapeHtml(
                    Object.values(QUESTION_TYPES).find(type => type.id === question?.question_type)?.name
                    || question?.question_type
                    || '-'
                );
                return `
                    <div class="test-publish-question-item">
                        <div class="test-publish-question-index">${index + 1}</div>
                        <div class="test-publish-question-content">
                            <div class="test-publish-question-text">${text}</div>
                            <div class="test-publish-question-meta">${typeLabel}</div>
                        </div>
                    </div>
                `;
            }).join('');

            const remaining = this.questions.length - previewQuestions.length;
            const tail = remaining > 0
                ? `<p class="text-secondary test-publish-more">${t('testEditor.moreQuestionsCount', 'И ещё {count} вопросов').replace('{count}', String(remaining))}</p>`
                : '';

            return `<div class="test-publish-question-list">${list}</div>${tail}`;
        },

        refreshPublishPreview: function () {
            const title = document.getElementById('testTitle')?.value.trim() || t('testEditor.noTitle', 'Без названия');
            const subjectSelect = document.getElementById('testSubject');
            const subject = subjectSelect?.selectedOptions?.[0]?.textContent?.trim() || t('tests.noSubject', 'Без предмета');
            const description = document.getElementById('testDescription')?.value.trim() || t('testEditor.noDescriptionShort', 'Описание не указано');
            const duration = Number.parseInt(document.getElementById('testDuration')?.value || '0', 10) || 0;
            const passingScore = Number.parseFloat(document.getElementById('testPassingScore')?.value || '0') || 0;
            const maxAttempts = Number.parseInt(document.getElementById('testMaxAttempts')?.value || '1', 10) || 1;

            const summary = [
                { label: t('testEditor.testTitle', 'Название теста'), value: title },
                { label: t('testEditor.subject', 'Предмет'), value: subject },
                { label: t('testEditor.questions', 'Вопросы'), value: String(this.questions.length) },
                { label: t('testEditor.durationMinutes', 'Длительность (минуты)'), value: `${duration}` },
                { label: t('testEditor.passingScore', 'Проходной балл (%)'), value: `${passingScore}%` },
                { label: t('testEditor.maxAttempts', 'Макс. попыток'), value: String(maxAttempts) }
            ];

            const summaryContainer = document.getElementById('testPublishPreviewSummary');
            if (summaryContainer) {
                summaryContainer.innerHTML = `
                    ${summary.map((item) => `
                        <div class="test-publish-summary-item">
                            <div class="test-publish-summary-label">${escapeHtml(item.label)}</div>
                            <div class="test-publish-summary-value">${escapeHtml(item.value)}</div>
                        </div>
                    `).join('')}
                    <div class="test-publish-summary-item test-publish-summary-item-full">
                        <div class="test-publish-summary-label">${t('testEditor.description', 'Описание')}</div>
                        <div class="test-publish-summary-value">${escapeHtml(description)}</div>
                    </div>
                `;
            }

            const questionsContainer = document.getElementById('testPublishPreviewQuestions');
            if (questionsContainer) {
                questionsContainer.innerHTML = this.renderPublishQuestionPreview();
            }
        },

        // Render questions list
        renderQuestionsList: function () {
            if (this.questions.length === 0) {
                return `
                    <div class="empty-state">
                        <p>${t('testEditor.noQuestionsAdded', 'Пока нет вопросов. Нажмите "Добавить вопрос", чтобы начать создание теста.')}</p>
                    </div>
                `;
            }

            const questionShortLabelRaw = String(t('testEditor.questionShort', 'Q') || '').trim();
            const questionShortLabel = /[Рр][\u0400-\u04FF]?/.test(questionShortLabelRaw) ? '№' : questionShortLabelRaw || '№';

            return this.questions.map((q, index) => `
                <div class="question-item" data-index="${index}" draggable="true">
                    <div class="question-header">
                        <div class="drag-handle" title="${t('testEditor.dragToReorder', 'Перетащите для изменения порядка')}">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="10" y1="6" x2="21" y2="6"></line>
                                <line x1="10" y1="12" x2="21" y2="12"></line>
                                <line x1="10" y1="18" x2="21" y2="18"></line>
                                <circle cx="4" cy="6" r="1"></circle>
                                <circle cx="4" cy="12" r="1"></circle>
                                <circle cx="4" cy="18" r="1"></circle>
                            </svg>
                        </div>
                        <div class="question-number">${questionShortLabel} ${index + 1}</div>
                        <div class="question-type-badge">${Object.values(QUESTION_TYPES).find(t => t.id === q.question_type)?.name || q.question_type}</div>
                        <div class="question-marks">${q.marks || 1} ${t('testEditor.points', 'балл(ов)')}</div>
                        <div class="question-actions">
                            <button class="btn-icon" onclick="TestEditor.editQuestion(${index})" title="${t('tests.edit', 'Редактировать')}">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                            </button>
                            <button class="btn-icon btn-danger" onclick="TestEditor.deleteQuestion(${index})" title="${t('tests.delete', 'Удалить')}">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div class="question-preview">
                        ${q.question_text}
                    </div>
                </div>
            `).join('');
        },

        // Show question type selector
        showQuestionTypeSelector: function () {
            const selectorHtml = `
                <div class="modal-overlay" id="questionTypeSelector">
                    <div class="modal">
                        <div class="modal-header">
                            <h2 class="modal-title">${t('testEditor.selectQuestionType', 'Выберите тип вопроса')}</h2>
                            <button class="modal-close" onclick="TestEditor.closeQuestionTypeSelector()">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </div>
                        <div class="modal-body">
                            <div class="question-types-grid">
                                ${Object.values(QUESTION_TYPES).map(type => `
                                    <div class="question-type-card" onclick="TestEditor.addQuestion('${type.id}')">
                                        <div class="question-type-icon">${type.icon}</div>
                                        <div class="question-type-name">${type.name}</div>
                                        <div class="question-type-desc">${type.description}</div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', selectorHtml);
        },

        // Close question type selector
        closeQuestionTypeSelector: function () {
            const selector = document.getElementById('questionTypeSelector');
            if (selector) selector.remove();
        },

        // Add new question
        addQuestion: function (type) {
            this.closeQuestionTypeSelector();
            this.editingQuestionIndex = -1;

            const newQuestion = {
                question_type: type,
                question_text: '',
                options: [],
                correct_answer: '',
                marks: 1,
                media_url: null,
                requires_manual_review: type === 'essay'
            };

            this.showQuestionEditor(newQuestion);
        },

        // Edit existing question
        editQuestion: function (index) {
            this.editingQuestionIndex = index;
            this.showQuestionEditor(this.questions[index]);
        },

        // Delete question
        deleteQuestion: async function (index) {
            const confirmed = await showConfirm(t('testEditor.deleteQuestionConfirm', 'Удалить этот вопрос?'));
            if (!confirmed) return;

            this.questions.splice(index, 1);
            this.updateQuestionsList();
        },

        // Show question editor with type-specific forms
        showQuestionEditor: function (question) {
            // Find type config by matching the id field
            const typeConfig = Object.values(QUESTION_TYPES).find(t => t.id === question.question_type);
            const isEdit = this.editingQuestionIndex >= 0;

            let editorBodyHtml = '';

            // Common fields for all question types except fill-in-the-blanks
            const showQuestionTextField = question.question_type !== 'fillblanks';
            const commonFieldsHtml = `
                ${showQuestionTextField ? `
                <div class="form-group">
                    <label class="form-label">${t('testEditor.questionText', 'Текст вопроса')} <span class="required">*</span></label>
                    <textarea id="questionText" class="form-textarea" rows="3" placeholder="${t('testEditor.questionTextPlaceholder', 'Введите текст вопроса')}" required>${question.question_text || ''}</textarea>
                </div>
                ` : ''}
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">${t('tests.marks', 'Баллы')} <span class="required">*</span></label>
                        <input type="number" id="questionMarks" class="form-input" value="${question.marks || 1}" min="1" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">${t('testEditor.imageMediaUrlOptional', 'URL изображения/медиа (необязательно)')}</label>
                        <input type="url" id="questionMediaUrl" class="form-input" value="${question.media_url || ''}" placeholder="https://...">
                    </div>
                </div>
            `;

            // Type-specific form sections
            switch (question.question_type) {
                case 'singlechoice':
                    editorBodyHtml = this.renderSingleChoiceEditor(question);
                    break;
                case 'multiplechoice':
                    editorBodyHtml = this.renderMultipleChoiceEditor(question);
                    break;
                case 'truefalse':
                    editorBodyHtml = this.renderTrueFalseEditor(question);
                    break;
                case 'shortanswer':
                    editorBodyHtml = this.renderShortAnswerEditor(question);
                    break;
                case 'essay':
                    editorBodyHtml = this.renderEssayEditor(question);
                    break;
                case 'matching':
                    editorBodyHtml = this.renderMatchingEditor(question);
                    break;
                case 'ordering':
                    editorBodyHtml = this.renderOrderingEditor(question);
                    break;
                case 'fillblanks':
                    editorBodyHtml = this.renderFillBlanksEditor(question);
                    break;
                case 'imagebased':
                    editorBodyHtml = this.renderImageBasedEditor(question);
                    break;
            }

            const modalHtml = `
                <div class="modal-overlay" id="questionEditorModal">
                    <div class="modal modal-large">
                        <div class="modal-header">
                            <h2 class="modal-title">${isEdit ? t('tests.edit', 'Редактировать') : t('testEditor.add', 'Добавить')} ${typeConfig.name} ${t('testEditor.question', 'вопрос')}</h2>
                            <button class="modal-close" onclick="TestEditor.closeQuestionEditor()">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </div>
                        <div class="modal-body">
                            ${question.question_type === 'fillblanks'
                                ? `${editorBodyHtml}${commonFieldsHtml}`
                                : `${commonFieldsHtml}${editorBodyHtml}`
                            }
                        </div>
                        <div class="modal-footer">
                            <button class="btn btn-outline" onclick="TestEditor.closeQuestionEditor()">${t('common.close', 'Закрыть')}</button>
                            <button class="btn btn-primary" onclick="TestEditor.saveQuestion('${question.question_type}')">
                                ${isEdit ? t('testEditor.update', 'Обновить') : t('testEditor.add', 'Добавить')} ${t('testEditor.question', 'вопрос')}
                            </button>
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);

            if (question.question_type === 'imagebased') {
                this.bindImageAnswerTypeChange(question);
            }
        },

        // Single Choice Editor
        renderSingleChoiceEditor: function (question) {
            const options = question.options || ['', '', '', ''];
            return `
                <div class="form-group">
                    <label class="form-label">${t('testEditor.answerOptions', 'Варианты ответа')} <span class="required">*</span></label>
                    <div id="optionsList" class="options-list" data-correct-input-type="radio">
                        ${options.map((opt, i) => `
                            <div class="option-item">
                                <input type="radio" name="correctAnswer" value="${i}" ${question.correct_answer == i ? 'checked' : ''}>
                                <input type="text" class="form-input option-input" data-index="${i}" value="${opt}" placeholder="${t('testEditor.optionPlaceholder', 'Вариант {number}').replace('{number}', String(i + 1))}">
                                <button class="btn-icon btn-danger" onclick="TestEditor.removeOption(${i})" title="${t('tests.delete', 'Удалить')}">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                    </svg>
                                </button>
                            </div>
                        `).join('')}
                    </div>
                    <button class="btn btn-outline btn-sm" onclick="TestEditor.addOption()" style="margin-top: 10px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                        ${t('testEditor.addOption', 'Добавить вариант')}
                    </button>
                </div>
            `;
        },

        // Multiple Choice Editor
        renderMultipleChoiceEditor: function (question) {
            const options = question.options || ['', '', '', ''];
            const correctAnswers = Array.isArray(question.correct_answer) ? question.correct_answer : [];
            return `
                <div class="form-group">
                    <label class="form-label">${t('testEditor.answerOptions', 'Варианты ответа')} <span class="required">*</span></label>
                    <p class="form-hint">${t('testEditor.selectAllCorrectAnswers', 'Выберите все правильные ответы')}</p>
                    <div id="optionsList" class="options-list" data-correct-input-type="checkbox">
                        ${options.map((opt, i) => `
                            <div class="option-item">
                                <input type="checkbox" name="correctAnswer" value="${i}" ${correctAnswers.includes(i) || correctAnswers.includes(String(i)) ? 'checked' : ''}>
                                <input type="text" class="form-input option-input" data-index="${i}" value="${opt}" placeholder="${t('testEditor.optionPlaceholder', 'Вариант {number}').replace('{number}', String(i + 1))}">
                                <button class="btn-icon btn-danger" onclick="TestEditor.removeOption(${i})" title="${t('tests.delete', 'Удалить')}">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                    </svg>
                                </button>
                            </div>
                        `).join('')}
                    </div>
                    <button class="btn btn-outline btn-sm" onclick="TestEditor.addOption()" style="margin-top: 10px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                        ${t('testEditor.addOption', 'Добавить вариант')}
                    </button>
                </div>
            `;
        },

        // True/False Editor
        renderTrueFalseEditor: function (question) {
            return `
                <div class="form-group">
                    <label class="form-label">${t('testEditor.correctAnswer', 'Правильный ответ')} <span class="required">*</span></label>
                    <div class="radio-group">
                        <label class="radio-label">
                            <input type="radio" name="correctAnswer" value="true" ${question.correct_answer === 'true' || question.correct_answer === true ? 'checked' : ''}>
                            <span>${t('testEditor.true', 'Верно')}</span>
                        </label>
                        <label class="radio-label">
                            <input type="radio" name="correctAnswer" value="false" ${question.correct_answer === 'false' || question.correct_answer === false ? 'checked' : ''}>
                            <span>${t('testEditor.false', 'Неверно')}</span>
                        </label>
                    </div>
                </div>
            `;
        },

        // Short Answer Editor
        renderShortAnswerEditor: function (question) {
            const manual = question.requires_manual_review === true;
            const answers = Array.isArray(question.correct_answer) ? question.correct_answer : [question.correct_answer || ''];
            return `
                <div class="form-group">
                    <label class="multi-choice-option" for="requiresManualReview" style="margin-bottom: 8px;">
                        <input type="checkbox" id="requiresManualReview" ${manual ? 'checked' : ''} />
                        <span>${t('testEditor.manualReview', 'Ручная проверка (проверяет учитель)')}</span>
                    </label>
                    <span class="form-hint">${t('testEditor.manualReviewHint', 'Если включено, ответы ученика будут отправлены учителю на проверку.')}</span>
                </div>
                <div class="form-group">
                    <label class="form-label">${t('testEditor.acceptableAnswers', 'Допустимые ответы')} <span class="required">*</span></label>
                    <p class="form-hint">${t('testEditor.acceptableAnswersHint', 'Добавьте несколько допустимых ответов (без учета регистра)')}</p>
                    <div id="answersList" class="answers-list">
                        ${answers.map((ans, i) => `
                            <div class="answer-item">
                                <input type="text" class="form-input answer-input" data-index="${i}" value="${ans}" placeholder="${t('testEditor.answerPlaceholder', 'Ответ {number}').replace('{number}', String(i + 1))}">
                                ${i > 0 ? `
                                    <button class="btn-icon btn-danger" onclick="TestEditor.removeAnswer(${i})" title="${t('tests.delete', 'Удалить')}">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <line x1="18" y1="6" x2="6" y2="18"></line>
                                            <line x1="6" y1="6" x2="18" y2="18"></line>
                                        </svg>
                                    </button>
                                ` : ''}
                            </div>
                        `).join('')}
                    </div>
                    <button class="btn btn-outline btn-sm" onclick="TestEditor.addAnswer()" style="margin-top: 10px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                        ${t('testEditor.addAlternativeAnswer', 'Добавить альтернативный ответ')}
                    </button>
                </div>
            `;
        },

        renderEssayEditor: function (question) {
            const manual = question.requires_manual_review !== false;
            return `
                <div class="form-group">
                    <label class="multi-choice-option" for="requiresManualReview" style="margin-bottom: 8px;">
                        <input type="checkbox" id="requiresManualReview" checked disabled />
                        <span>${t('testEditor.manualReview', 'Ручная проверка (проверяет учитель)')}</span>
                    </label>
                    <span class="form-hint">${t('testEditor.essayHint', 'Развернутый ответ. После сдачи учитель выставит баллы вручную.')}</span>
                </div>
            `;
        },


        // Matching Editor
        renderMatchingEditor: function (question) {
            const pairs = question.options || [{ left: '', right: '' }, { left: '', right: '' }];
            return `
                <div class="form-group">
                    <label class="form-label">${t('testEditor.matchingPairs', 'Пары для сопоставления')} <span class="required">*</span></label>
                    <div id="pairsList" class="pairs-list">
                        ${pairs.map((pair, i) => `
                            <div class="pair-item">
                                <input type="text" class="form-input pair-left" data-index="${i}" value="${pair.left || ''}" placeholder="${t('testEditor.leftItemPlaceholder', 'Левый элемент {number}').replace('{number}', String(i + 1))}">
                                <span class="pair-separator">↔</span>
                                <input type="text" class="form-input pair-right" data-index="${i}" value="${pair.right || ''}" placeholder="${t('testEditor.rightItemPlaceholder', 'Правый элемент {number}').replace('{number}', String(i + 1))}">
                                ${i > 1 ? `
                                    <button class="btn-icon btn-danger" onclick="TestEditor.removePair(${i})" title="${t('tests.delete', 'Удалить')}">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <line x1="18" y1="6" x2="6" y2="18"></line>
                                            <line x1="6" y1="6" x2="18" y2="18"></line>
                                        </svg>
                                    </button>
                                ` : ''}
                            </div>
                        `).join('')}
                    </div>
                    <button class="btn btn-outline btn-sm" onclick="TestEditor.addPair()" style="margin-top: 10px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                        ${t('testEditor.addPair', 'Добавить пару')}
                    </button>
                </div>
            `;
        },

        // Ordering Editor
        renderOrderingEditor: function (question) {
            const items = question.options || ['', '', ''];
            return `
                <div class="form-group">
                    <label class="form-label">${t('testEditor.itemsInCorrectOrder', 'Элементы в правильном порядке')} <span class="required">*</span></label>
                    <p class="form-hint">${t('testEditor.itemsShuffledHint', 'Для учеников элементы будут перемешаны')}</p>
                    <div id="itemsList" class="items-list">
                        ${items.map((item, i) => `
                            <div class="item-row">
                                <span class="item-number">${i + 1}.</span>
                                <input type="text" class="form-input item-input" data-index="${i}" value="${item}" placeholder="${t('testEditor.itemPlaceholder', 'Элемент {number}').replace('{number}', String(i + 1))}">
                                ${i > 2 ? `
                                    <button class="btn-icon btn-danger" onclick="TestEditor.removeItem(${i})" title="${t('tests.delete', 'Удалить')}">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <line x1="18" y1="6" x2="6" y2="18"></line>
                                            <line x1="6" y1="6" x2="18" y2="18"></line>
                                        </svg>
                                    </button>
                                ` : ''}
                            </div>
                        `).join('')}
                    </div>
                    <button class="btn btn-outline btn-sm" onclick="TestEditor.addItem()" style="margin-top: 10px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                        ${t('testEditor.addItem', 'Добавить элемент')}
                    </button>
                </div>
            `;
        },

        // Fill in Blanks Editor
        renderFillBlanksEditor: function (question) {
            return `
                <div class="form-group">
                    <label class="form-label">${t('testEditor.textWithBlanks', 'Текст с пропусками')} <span class="required">*</span></label>
                    <p class="form-hint">${t('testEditor.blanksHint', 'Используйте тройное подчеркивание ___ для пропусков. Пример: "___ — самая большая планета"')}</p>
                    <textarea id="blanksText" class="form-textarea" rows="4" placeholder="${t('testEditor.blanksTextPlaceholder', 'Введите текст с ___ для пропусков')}">${question.question_text || ''}</textarea>
                </div>
                <div class="form-group">
                    <label class="form-label">${t('testEditor.correctAnswersForBlanks', 'Правильные ответы для пропусков')} <span class="required">*</span></label>
                    <p class="form-hint">${t('testEditor.answersInBlankOrder', 'Укажите ответы по порядку для каждого пропуска')}</p>
                    <div id="blanksAnswers">
                        ${(question.correct_answer || ['']).map((ans, i) => `
                            <div class="blank-answer-item">
                                <span class="blank-label">${t('testEditor.blankLabel', 'Пропуск {number}:').replace('{number}', String(i + 1))}</span>
                                <input type="text" class="form-input blank-answer" data-index="${i}" value="${ans}" placeholder="${t('testEditor.answerForBlankPlaceholder', 'Ответ для пропуска {number}').replace('{number}', String(i + 1))}">
                            </div>
                        `).join('')}
                    </div>
                    <button class="btn btn-outline btn-sm" onclick="TestEditor.detectBlanks()" style="margin-top: 10px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                        </svg>
                        ${t('testEditor.detectBlanks', 'Найти пропуски')}
                    </button>
                </div>
            `;
        },

        // Image Based Editor
        renderImageBasedEditor: function (question) {
            const options = question.options || ['', '', '', ''];
            const answerType = Array.isArray(question.correct_answer) ? 'multiple' : 'single';
            return `
                <div class="form-group">
                    <label class="form-label">${t('testEditor.questionImageUrl', 'URL изображения вопроса')} <span class="required">*</span></label>
                    <input type="url" id="imageUrl" class="form-input" value="${question.media_url || ''}" placeholder="https://..." required>
                    <div style="display: flex; gap: 10px; align-items: center; margin-top: 10px; flex-wrap: wrap;">
                        <input type="file" id="imageFileInput" accept="image/*" class="form-input" style="max-width: 320px;">
                        <button type="button" class="btn btn-outline btn-sm" onclick="TestEditor.uploadImageForQuestion()">
                            ${t('testEditor.uploadImage', 'Загрузить изображение')}
                        </button>
                        <span id="imageUploadStatus" style="font-size: 12px; color: var(--text-secondary);"></span>
                    </div>
                    <div id="imagePreviewWrap" style="margin-top: 10px;">
                        ${question.media_url ? `<img id="imagePreview" src="${question.media_url}" alt="${t('testEditor.previewAlt', 'Предпросмотр')}" style="max-width: 100%; max-height: 300px; border-radius: 8px;">` : `<img id="imagePreview" src="" alt="${t('testEditor.previewAlt', 'Предпросмотр')}" style="display:none; max-width: 100%; max-height: 300px; border-radius: 8px;">`}
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">${t('testEditor.answerType', 'Тип ответа')}</label>
                    <select id="imageAnswerType" class="form-input">
                        <option value="single" ${answerType === 'single' ? 'selected' : ''}>${t('testEditor.typeSingleChoice', 'Один выбор')}</option>
                        <option value="multiple" ${answerType === 'multiple' ? 'selected' : ''}>${t('testEditor.typeMultipleChoice', 'Множественный выбор')}</option>
                    </select>
                </div>
                <div id="imageAnswerOptions">
                    ${this.renderImageAnswerOptions(answerType, question)}
                </div>
            `;
        },

        renderImageAnswerOptions: function (answerType, question) {
            if (answerType === 'multiple') {
                const multiQuestion = {
                    ...question,
                    options: question.options || ['', '', '', ''],
                    correct_answer: Array.isArray(question.correct_answer)
                        ? question.correct_answer
                        : (question.correct_answer !== undefined && question.correct_answer !== null ? [question.correct_answer] : [])
                };
                return this.renderMultipleChoiceEditor(multiQuestion);
            }

            const singleQuestion = {
                ...question,
                options: question.options || ['', '', '', ''],
                correct_answer: Array.isArray(question.correct_answer)
                    ? (question.correct_answer[0] ?? null)
                    : question.correct_answer
            };
            return this.renderSingleChoiceEditor(singleQuestion);
        },

        bindImageAnswerTypeChange: function (question) {
            const select = document.getElementById('imageAnswerType');
            const container = document.getElementById('imageAnswerOptions');
            if (!select || !container) return;

            select.addEventListener('change', () => {
                const options = Array.from(document.querySelectorAll('#imageAnswerOptions .option-input'))
                    .map((el) => el.value.trim());
                const selected = Array.from(document.querySelectorAll('#imageAnswerOptions input[name="correctAnswer"]:checked'))
                    .map((el) => parseInt(el.value, 10))
                    .filter((value) => Number.isFinite(value));

                const answerType = select.value === 'multiple' ? 'multiple' : 'single';
                const nextQuestion = {
                    ...question,
                    options: options.length ? options : (question.options || ['', '', '', '']),
                    correct_answer: answerType === 'multiple'
                        ? selected
                        : (selected[0] ?? (Array.isArray(question.correct_answer) ? question.correct_answer[0] : question.correct_answer))
                };

                container.innerHTML = this.renderImageAnswerOptions(answerType, nextQuestion);
            });
        },

        uploadImageForQuestion: async function () {
            const fileInput = document.getElementById('imageFileInput');
            const imageUrlInput = document.getElementById('imageUrl');
            const status = document.getElementById('imageUploadStatus');
            const preview = document.getElementById('imagePreview');

            if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
                alert(t('testEditor.chooseImageFirst', 'Сначала выберите файл изображения'));
                return;
            }

            const file = fileInput.files[0];
            const formData = new FormData();
            formData.append('image', file);

            try {
                if (status) status.textContent = t('testEditor.uploading', 'Загрузка...');
                const response = await fetch('/api/teacher/upload/question-image', {
                    method: 'POST',
                    credentials: 'include',
                    body: formData
                });

                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.message || t('testEditor.failedUploadImage', 'Не удалось загрузить изображение'));
                }

                if (imageUrlInput) imageUrlInput.value = data.url;
                if (preview) {
                    preview.src = data.url;
                    preview.style.display = 'block';
                }
                if (status) status.textContent = t('testEditor.uploadedSuccessfully', 'Успешно загружено');
            } catch (error) {
                console.error('Question image upload error:', error);
                if (status) status.textContent = '';
                alert(error.message || t('testEditor.failedUploadImage', 'Не удалось загрузить изображение'));
            }
        },

        // Helper methods for dynamic options/answers/pairs/items
        addOption: function () {
            const list = document.getElementById('optionsList');
            const index = list.querySelectorAll('.option-item').length;
            const correctInputType = list.dataset.correctInputType || 'checkbox';
            const itemHtml = `
                <div class="option-item">
                    <input type="${correctInputType}" name="correctAnswer" value="${index}">
                    <input type="text" class="form-input option-input" data-index="${index}" value="" placeholder="${t('testEditor.optionPlaceholder', 'Вариант {number}').replace('{number}', String(index + 1))}">
                    <button class="btn-icon btn-danger" onclick="TestEditor.removeOption(${index})" title="${t('tests.delete', 'Удалить')}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
            `;
            list.insertAdjacentHTML('beforeend', itemHtml);
        },

        removeOption: function (index) {
            const items = document.querySelectorAll('.option-item');
            if (items.length > 2) {
                items[index].remove();
                // Reindex remaining items
                document.querySelectorAll('.option-item').forEach((item, i) => {
                    item.querySelector('.option-input').setAttribute('data-index', i);
                    item.querySelector('.option-input').placeholder = t('testEditor.optionPlaceholder', 'Вариант {number}').replace('{number}', String(i + 1));
                    item.querySelector('input[type="radio"], input[type="checkbox"]').value = i;
                });
            }
        },

        addAnswer: function () {
            const list = document.getElementById('answersList');
            const index = list.querySelectorAll('.answer-item').length;
            const itemHtml = `
                <div class="answer-item">
                    <input type="text" class="form-input answer-input" data-index="${index}" value="" placeholder="${t('testEditor.answerPlaceholder', 'Ответ {number}').replace('{number}', String(index + 1))}">
                    <button class="btn-icon btn-danger" onclick="TestEditor.removeAnswer(${index})" title="${t('tests.delete', 'Удалить')}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
            `;
            list.insertAdjacentHTML('beforeend', itemHtml);
        },

        removeAnswer: function (index) {
            const items = document.querySelectorAll('.answer-item');
            if (items.length > 1) {
                items[index].remove();
            }
        },

        addPair: function () {
            const list = document.getElementById('pairsList');
            const index = list.querySelectorAll('.pair-item').length;
            const itemHtml = `
                <div class="pair-item">
                    <input type="text" class="form-input pair-left" data-index="${index}" value="" placeholder="${t('testEditor.leftItemPlaceholder', 'Левый элемент {number}').replace('{number}', String(index + 1))}">
                    <span class="pair-separator">↔</span>
                    <input type="text" class="form-input pair-right" data-index="${index}" value="" placeholder="${t('testEditor.rightItemPlaceholder', 'Правый элемент {number}').replace('{number}', String(index + 1))}">
                    <button class="btn-icon btn-danger" onclick="TestEditor.removePair(${index})" title="${t('tests.delete', 'Удалить')}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
            `;
            list.insertAdjacentHTML('beforeend', itemHtml);
        },

        removePair: function (index) {
            const items = document.querySelectorAll('.pair-item');
            if (items.length > 2) {
                items[index].remove();
            }
        },

        addItem: function () {
            const list = document.getElementById('itemsList');
            const index = list.querySelectorAll('.item-row').length;
            const itemHtml = `
                <div class="item-row">
                    <span class="item-number">${index + 1}.</span>
                    <input type="text" class="form-input item-input" data-index="${index}" value="" placeholder="${t('testEditor.itemPlaceholder', 'Элемент {number}').replace('{number}', String(index + 1))}">
                    <button class="btn-icon btn-danger" onclick="TestEditor.removeItem(${index})" title="${t('tests.delete', 'Удалить')}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
            `;
            list.insertAdjacentHTML('beforeend', itemHtml);
        },

        removeItem: function (index) {
            const items = document.querySelectorAll('.item-row');
            if (items.length > 3) {
                items[index].remove();
                // Reindex remaining items
                document.querySelectorAll('.item-row').forEach((item, i) => {
                    item.querySelector('.item-number').textContent = `${i + 1}.`;
                    item.querySelector('.item-input').setAttribute('data-index', i);
                    item.querySelector('.item-input').placeholder = t('testEditor.itemPlaceholder', 'Элемент {number}').replace('{number}', String(i + 1));
                });
            }
        },

        detectBlanks: function () {
            const text = document.getElementById('blanksText').value;
            const blanksCount = (text.match(/___/g) || []).length;
            const container = document.getElementById('blanksAnswers');

            let html = '';
            for (let i = 0; i < blanksCount; i++) {
                const existingValue = container.querySelector(`[data-index="${i}"]`)?.value || '';
                html += `
                    <div class="blank-answer-item">
                        <span class="blank-label">${t('testEditor.blankLabel', 'Пропуск {number}:').replace('{number}', String(i + 1))}</span>
                        <input type="text" class="form-input blank-answer" data-index="${i}" value="${existingValue}" placeholder="${t('testEditor.answerForBlankPlaceholder', 'Ответ для пропуска {number}').replace('{number}', String(i + 1))}">
                    </div>
                `;
            }
            container.innerHTML = html;
        },

        // Close question editor
        closeQuestionEditor: function () {
            const modal = document.getElementById('questionEditorModal');
            if (modal) modal.remove();
        },

        // Save question
        saveQuestion: function (questionType) {
            const questionText = document.getElementById('questionText')?.value.trim();
            const marks = parseInt(document.getElementById('questionMarks')?.value) || 1;
            const mediaUrl = document.getElementById('questionMediaUrl')?.value.trim() || null;
            const requiresManualReview = document.getElementById('requiresManualReview')
                ? document.getElementById('requiresManualReview').checked === true
                : false;

            // Validation
            if (questionType !== 'fillblanks' && !questionText) {
                alert(t('testEditor.enterQuestionText', 'Введите текст вопроса'));
                return;
            }

            let options = [];
            let correctAnswer = null;

            // Collect data based on question type
            switch (questionType) {
                case 'singlechoice':
                    options = Array.from(document.querySelectorAll('.option-input')).map(el => el.value.trim());
                    const selectedRadio = document.querySelector('input[name="correctAnswer"]:checked');
                    if (!selectedRadio) {
                        alert(t('testEditor.selectCorrectAnswer', 'Выберите правильный ответ'));
                        return;
                    }
                    correctAnswer = parseInt(selectedRadio.value);
                    if (options.some(opt => !opt)) {
                        alert(t('testEditor.fillAllOptions', 'Заполните все варианты ответа'));
                        return;
                    }
                    break;

                case 'multiplechoice':
                    options = Array.from(document.querySelectorAll('.option-input')).map(el => el.value.trim());
                    const selectedCheckboxes = Array.from(document.querySelectorAll('input[name="correctAnswer"]:checked'));
                    if (selectedCheckboxes.length === 0) {
                        alert(t('testEditor.selectAtLeastOneCorrect', 'Выберите хотя бы один правильный ответ'));
                        return;
                    }
                    correctAnswer = selectedCheckboxes.map(cb => parseInt(cb.value));
                    if (options.some(opt => !opt)) {
                        alert(t('testEditor.fillAllOptions', 'Заполните все варианты ответа'));
                        return;
                    }
                    break;

                case 'truefalse':
                    const tfRadio = document.querySelector('input[name="correctAnswer"]:checked');
                    if (!tfRadio) {
                        alert(t('testEditor.selectCorrectAnswer', 'Выберите правильный ответ'));
                        return;
                    }
                    correctAnswer = tfRadio.value;
                    break;

                case 'shortanswer':
                    if (requiresManualReview) {
                        correctAnswer = null;
                    } else {
                        const answers = Array.from(document.querySelectorAll('.answer-input')).map(el => el.value.trim()).filter(a => a);
                        if (answers.length === 0) {
                            alert(t('testEditor.provideAtLeastOneAcceptable', 'Добавьте хотя бы один допустимый ответ'));
                            return;
                        }
                        correctAnswer = answers.length === 1 ? answers[0] : answers;
                    }
                    break;

                case 'essay':
                    correctAnswer = null;
                    break;

                case 'matching':
                    const leftItems = Array.from(document.querySelectorAll('.pair-left')).map(el => el.value.trim());
                    const rightItems = Array.from(document.querySelectorAll('.pair-right')).map(el => el.value.trim());
                    if (leftItems.some(item => !item) || rightItems.some(item => !item)) {
                        alert(t('testEditor.fillAllMatchingPairs', 'Заполните все пары сопоставления'));
                        return;
                    }
                    const hasDuplicateSides = leftItems.some((left, i) => left.toLowerCase() === String(rightItems[i] || '').toLowerCase());
                    if (hasDuplicateSides) {
                        alert(t('testEditor.matchingValuesDifferent', 'Левое и правое значения в паре должны отличаться'));
                        return;
                    }
                    options = leftItems.map((left, i) => ({ left, right: rightItems[i] }));
                    correctAnswer = options.map((_, i) => i); // Correct order is the original order
                    break;

                case 'ordering':
                    const items = Array.from(document.querySelectorAll('.item-input')).map(el => el.value.trim());
                    if (items.some(item => !item)) {
                        alert(t('testEditor.fillAllItems', 'Заполните все элементы'));
                        return;
                    }
                    options = items;
                    correctAnswer = items.map((_, i) => i); // Correct order is the original order
                    break;

                case 'fillblanks':
                    const blanksText = document.getElementById('blanksText')?.value.trim();
                    const blankAnswers = Array.from(document.querySelectorAll('.blank-answer')).map(el => el.value.trim());
                    if (!blanksText || blankAnswers.some(ans => !ans)) {
                        alert(t('testEditor.fillBlanksAndAnswers', 'Заполните все пропуски и ответы к ним'));
                        return;
                    }
                    correctAnswer = blankAnswers;
                    break;

                case 'imagebased':
                    const imageUrl = document.getElementById('imageUrl')?.value.trim();
                    if (!imageUrl) {
                        alert(t('testEditor.provideImageUrl', 'Укажите URL изображения'));
                        return;
                    }
                    const imageAnswerType = document.getElementById('imageAnswerType')?.value || 'single';
                    options = Array.from(document.querySelectorAll('.option-input')).map(el => el.value.trim());
                    if (options.some(opt => !opt)) {
                        alert(t('testEditor.fillAllOptions', 'Заполните все варианты ответа'));
                        return;
                    }
                    if (imageAnswerType === 'multiple') {
                        const imgChecks = Array.from(document.querySelectorAll('input[name="correctAnswer"]:checked'));
                        if (imgChecks.length === 0) {
                            alert(t('testEditor.selectAtLeastOneCorrect', 'Выберите хотя бы один правильный ответ'));
                            return;
                        }
                        correctAnswer = imgChecks.map(cb => parseInt(cb.value, 10));
                    } else {
                        const imgRadio = document.querySelector('input[name="correctAnswer"]:checked');
                        if (!imgRadio) {
                            alert(t('testEditor.selectCorrectAnswer', 'Выберите правильный ответ'));
                            return;
                        }
                        correctAnswer = parseInt(imgRadio.value, 10);
                    }
                    break;
            }

            // Create question object
            const question = {
                question_type: questionType,
                question_text: questionType === 'fillblanks' ? document.getElementById('blanksText').value.trim() : questionText,
                options: options,
                correct_answer: correctAnswer,
                marks: marks,
                media_url: questionType === 'imagebased' ? document.getElementById('imageUrl').value.trim() : mediaUrl,
                requires_manual_review: questionType === 'essay' ? true : requiresManualReview
            };

            // Add or update question
            if (this.editingQuestionIndex >= 0) {
                this.questions[this.editingQuestionIndex] = question;
                this.editingQuestionIndex = -1;
            } else {
                this.questions.push(question);
            }

            // Close editor and update list
            this.closeQuestionEditor();
            this.updateQuestionsList();
        },

        // Update questions list
        updateQuestionsList: function () {
            const container = document.getElementById('questionsList');
            if (container) {
                container.innerHTML = this.renderQuestionsList();
            }
            // Also update the question count in the section header
            const header = document.getElementById('questionsSectionTitle');
            if (header) {
                header.textContent = `${t('testEditor.questions', 'Вопросы')} (${this.questions.length})`;
            }

            this.refreshPublishPreview();
            this.initDragAndDrop();
        },

        initDragAndDrop: function () {
            const container = document.getElementById('questionsList');
            if (!container) return;

            const items = Array.from(container.querySelectorAll('.question-item'));
            items.forEach(item => {
                item.addEventListener('dragstart', (event) => {
                    if (!event.target.closest('.drag-handle')) {
                        event.preventDefault();
                        return;
                    }

                    this.dragSourceIndex = parseInt(item.dataset.index, 10);
                    item.classList.add('dragging');
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', item.dataset.index);
                });

                item.addEventListener('dragend', () => {
                    item.classList.remove('dragging');
                    this.clearDragOver();
                    this.dragSourceIndex = null;
                });

                item.addEventListener('dragover', (event) => {
                    event.preventDefault();
                    this.setDragOver(item);
                });

                item.addEventListener('dragleave', (event) => {
                    if (!item.contains(event.relatedTarget)) {
                        item.classList.remove('drag-over');
                    }
                });

                item.addEventListener('drop', (event) => {
                    event.preventDefault();
                    const targetIndex = parseInt(item.dataset.index, 10);
                    const sourceIndex = this.dragSourceIndex;

                    if (Number.isNaN(targetIndex) || sourceIndex === null || sourceIndex === targetIndex) {
                        this.clearDragOver();
                        return;
                    }

                    const moved = this.questions.splice(sourceIndex, 1)[0];
                    const insertIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
                    this.questions.splice(insertIndex, 0, moved);
                    this.updateQuestionsList();
                    this.clearDragOver();
                });
            });
        },

        setDragOver: function (item) {
            this.clearDragOver();
            item.classList.add('drag-over');
        },

        clearDragOver: function () {
            document.querySelectorAll('.question-item.drag-over').forEach(el => {
                el.classList.remove('drag-over');
            });
        },

        // Save as draft
        saveAsDraft: async function () {
            await this.save(false);
        },

        // Publish test
        publish: async function () {
            if (this.questions.length === 0) {
                alert(t('testEditor.addOneQuestionBeforePublish', 'Добавьте хотя бы один вопрос перед публикацией.'));
                return;
            }
            await this.save(true);
        },

        // Save test
        save: async function (isPublished) {
            const title = document.getElementById('testTitle').value.trim();
            const subject_id = document.getElementById('testSubject').value;
            const description = document.getElementById('testDescription').value.trim();
            const duration_minutes = parseInt(document.getElementById('testDuration').value);
            const passing_score = parseFloat(document.getElementById('testPassingScore').value);
            const max_attempts = parseInt(document.getElementById('testMaxAttempts').value);
            const shuffle_questions = true;
            const block_copy_paste = document.getElementById('testBlockCopyPaste')?.checked !== false;
            const track_tab_switches = document.getElementById('testTrackTabSwitches')?.checked !== false;
            const fullscreen_required = document.getElementById('testFullscreenRequired')?.checked === true;

            if (!title || !subject_id) {
                alert(t('testEditor.fillRequiredFields', 'Заполните все обязательные поля.'));
                return;
            }

            const testData = {
                title,
                subject_id,
                description,
                duration_minutes,
                passing_score,
                max_attempts,
                shuffle_questions,
                block_copy_paste,
                track_tab_switches,
                fullscreen_required,
                is_published: isPublished,
                questions: this.questions
            };

            try {
                const url = this.currentTest
                    ? `/api/teacher/tests/${this.currentTest.id}`
                    : '/api/teacher/tests';
                const method = this.currentTest ? 'PUT' : 'POST';

                const response = await fetch(url, {
                    method,
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(testData)
                });

                if (response.ok) {
                    alert(
                        isPublished
                            ? t('testEditor.publishSuccess', 'Тест успешно опубликован!')
                            : t('testEditor.draftSavedSuccess', 'Тест успешно сохранен как черновик!')
                    );
                    this.close();
                    if (window.TestsManager) {
                        window.TestsManager.loadTests();
                    }
                } else {
                    const error = await response.json();
                    alert(error.message || t('testEditor.failedSaveTest', 'Не удалось сохранить тест'));
                }
            } catch (error) {
                console.error('Save test error:', error);
                alert(t('testEditor.failedSaveTest', 'Не удалось сохранить тест'));
            }
        },

        // Close editor
        close: function () {
            const modal = document.getElementById('testEditorModal');
            if (modal) modal.remove();
        }
    };
})();
