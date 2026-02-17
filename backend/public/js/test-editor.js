// Test Editor Module - Question Constructor
(function () {
    'use strict';

    function t(key, fallback) {
        return window.ZedlyI18n?.translate(key) || fallback || key;
    }

    function showConfirm(message, title = null) {
        const dialogTitle = title || t('common.confirmation', 'РџРѕРґС‚РІРµСЂР¶РґРµРЅРёРµ');
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
                    throw new Error(t('tests.failedLoadTest', 'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ С‚РµСЃС‚'));
                }
            } catch (error) {
                console.error('Load test error:', error);
                alert(t('tests.failedLoadTest', 'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ С‚РµСЃС‚'));
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

        // Render editor modal
        render: function () {
            const test = this.currentTest || {};
            const modalHtml = `
                <div class="modal-overlay" id="testEditorModal">
                    <div class="modal modal-xl test-editor">
                        <div class="modal-header">
                            <h2 class="modal-title">${test.id ? t('testEditor.editTest', 'Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ С‚РµСЃС‚') : t('testEditor.createNewTest', 'РЎРѕР·РґР°С‚СЊ РЅРѕРІС‹Р№ С‚РµСЃС‚')}</h2>
                            <button class="modal-close" onclick="TestEditor.close()">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </div>
                        <div class="modal-body test-editor-body">
                            <!-- Test Settings -->
                            <div class="test-editor-section">
                                <h3 class="section-title">${t('testEditor.testInformation', 'РРЅС„РѕСЂРјР°С†РёСЏ Рѕ С‚РµСЃС‚Рµ')}</h3>
                                <div class="form-row">
                                    <div class="form-group" style="flex: 2;">
                                        <label class="form-label">${t('testEditor.testTitle', 'РќР°Р·РІР°РЅРёРµ С‚РµСЃС‚Р°')} <span class="required">*</span></label>
                                        <input type="text" id="testTitle" class="form-input" value="${test.title || ''}" placeholder="${t('testEditor.testTitlePlaceholder', 'Р’РІРµРґРёС‚Рµ РЅР°Р·РІР°РЅРёРµ С‚РµСЃС‚Р°')}" required>
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label">${t('testEditor.subject', 'РџСЂРµРґРјРµС‚')} <span class="required">*</span></label>
                                        <select id="testSubject" class="form-input" required>
                                            <option value="">${t('testEditor.selectSubject', 'Р’С‹Р±РµСЂРёС‚Рµ РїСЂРµРґРјРµС‚')}</option>
                                            ${this.subjects.map(s => `
                                                <option value="${s.id}" ${test.subject_id == s.id ? 'selected' : ''}>${s.name}</option>
                                            `).join('')}
                                        </select>
                                    </div>
                                </div>
                                <div class="form-group">
                                    <label class="form-label">${t('testEditor.description', 'РћРїРёСЃР°РЅРёРµ')}</label>
                                    <textarea id="testDescription" class="form-textarea" rows="3" placeholder="${t('testEditor.descriptionPlaceholder', 'Р’РІРµРґРёС‚Рµ РѕРїРёСЃР°РЅРёРµ С‚РµСЃС‚Р°')}">${test.description || ''}</textarea>
                                </div>
                                <div class="form-row">
                                    <div class="form-group">
                                        <label class="form-label">${t('testEditor.durationMinutes', 'Р”Р»РёС‚РµР»СЊРЅРѕСЃС‚СЊ (РјРёРЅСѓС‚С‹)')}</label>
                                        <input type="number" id="testDuration" class="form-input" value="${test.duration_minutes || 60}" min="1">
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label">${t('testEditor.passingScore', 'РџСЂРѕС…РѕРґРЅРѕР№ Р±Р°Р»Р» (%)')}</label>
                                        <input type="number" id="testPassingScore" class="form-input" value="${test.passing_score || 60}" min="0" max="100">
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label">${t('testEditor.maxAttempts', 'РњР°РєСЃ. РїРѕРїС‹С‚РѕРє')}</label>
                                        <input type="number" id="testMaxAttempts" class="form-input" value="${test.max_attempts || 1}" min="1">
                                    </div>
                                </div>
                                <div class="form-group">
                                    <label class="form-label">${t('testEditor.antiCheating', 'РђРЅС‚Рё-СЃРїРёСЃС‹РІР°РЅРёРµ')}</label>
                                    <label class="checkbox-label">
                                        <input type="checkbox" id="testBlockCopyPaste" ${test.block_copy_paste !== false ? 'checked' : ''}>
                                        <span>${t('testEditor.blockCopyPaste', 'Р—Р°РїСЂРµС‚РёС‚СЊ РєРѕРїРёСЂРѕРІР°РЅРёРµ/РІСЃС‚Р°РІРєСѓ')}</span>
                                    </label>
                                    <label class="checkbox-label" style="margin-left: 16px;">
                                        <input type="checkbox" id="testTrackTabSwitches" ${test.track_tab_switches !== false ? 'checked' : ''}>
                                        <span>${t('testEditor.trackTabSwitches', 'РћС‚СЃР»РµР¶РёРІР°С‚СЊ РїРµСЂРµРєР»СЋС‡РµРЅРёРµ РІРєР»Р°РґРѕРє')}</span>
                                    </label>
                                    <label class="checkbox-label" style="margin-left: 16px;">
                                        <input type="checkbox" id="testFullscreenRequired" ${test.fullscreen_required === true ? 'checked' : ''} disabled>
                                        <span>${t('testEditor.requireFullscreen', 'РўСЂРµР±РѕРІР°С‚СЊ РїРѕР»РЅРѕСЌРєСЂР°РЅРЅС‹Р№ СЂРµР¶РёРј')}</span>
                                    </label>
                                </div>
                            </div>

                            <!-- Questions Section -->
                            <div class="test-editor-section">
                                <div class="section-header">
                                    <h3 class="section-title" id="questionsSectionTitle">${t('testEditor.questions', 'Р’РѕРїСЂРѕСЃС‹')} (${this.questions.length})</h3>
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
                                            ${t('testEditor.addQuestion', 'Р”РѕР±Р°РІРёС‚СЊ РІРѕРїСЂРѕСЃ')}
                                        </button>
                                </div>
                                <input id="questionsImportFile" type="file" accept=".xlsx,.xls" style="display:none;">
                                <div id="questionsList">
                                    ${this.renderQuestionsList()}
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button class="btn btn-outline" onclick="TestEditor.close()">${t('common.close', 'Закрыть')}</button>
                            <button class="btn btn-outline" onclick="TestEditor.saveAsDraft()">${t('testEditor.saveAsDraft', 'РЎРѕС…СЂР°РЅРёС‚СЊ РєР°Рє С‡РµСЂРЅРѕРІРёРє')}</button>
                            <button class="btn btn-primary" onclick="TestEditor.publish()">${t('testEditor.publishTest', 'РћРїСѓР±Р»РёРєРѕРІР°С‚СЊ С‚РµСЃС‚')}</button>
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
            this.initDragAndDrop();
        },

        // Render questions list
        renderQuestionsList: function () {
            if (this.questions.length === 0) {
                return `
                    <div class="empty-state">
                        <p>${t('testEditor.noQuestionsAdded', 'РџРѕРєР° РЅРµС‚ РІРѕРїСЂРѕСЃРѕРІ. РќР°Р¶РјРёС‚Рµ "Р”РѕР±Р°РІРёС‚СЊ РІРѕРїСЂРѕСЃ", С‡С‚РѕР±С‹ РЅР°С‡Р°С‚СЊ СЃРѕР·РґР°РЅРёРµ С‚РµСЃС‚Р°.')}</p>
                    </div>
                `;
            }

            return this.questions.map((q, index) => `
                <div class="question-item" data-index="${index}" draggable="true">
                    <div class="question-header">
                        <div class="drag-handle" title="${t('testEditor.dragToReorder', 'РџРµСЂРµС‚Р°С‰РёС‚Рµ РґР»СЏ РёР·РјРµРЅРµРЅРёСЏ РїРѕСЂСЏРґРєР°')}">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="10" y1="6" x2="21" y2="6"></line>
                                <line x1="10" y1="12" x2="21" y2="12"></line>
                                <line x1="10" y1="18" x2="21" y2="18"></line>
                                <circle cx="4" cy="6" r="1"></circle>
                                <circle cx="4" cy="12" r="1"></circle>
                                <circle cx="4" cy="18" r="1"></circle>
                            </svg>
                        </div>
                        <div class="question-number">${t('testEditor.questionShort', 'Р’')} ${index + 1}</div>
                        <div class="question-type-badge">${Object.values(QUESTION_TYPES).find(t => t.id === q.question_type)?.name || q.question_type}</div>
                        <div class="question-marks">${q.marks || 1} ${t('testEditor.points', 'Р±Р°Р»Р»(РѕРІ)')}</div>
                        <div class="question-actions">
                            <button class="btn-icon" onclick="TestEditor.editQuestion(${index})" title="${t('tests.edit', 'Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ')}">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                            </button>
                            <button class="btn-icon btn-danger" onclick="TestEditor.deleteQuestion(${index})" title="${t('tests.delete', 'РЈРґР°Р»РёС‚СЊ')}">
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
                            <h2 class="modal-title">${t('testEditor.selectQuestionType', 'Р’С‹Р±РµСЂРёС‚Рµ С‚РёРї РІРѕРїСЂРѕСЃР°')}</h2>
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
                media_url: null
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
            const confirmed = await showConfirm(t('testEditor.deleteQuestionConfirm', 'РЈРґР°Р»РёС‚СЊ СЌС‚РѕС‚ РІРѕРїСЂРѕСЃ?'));
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
                    <label class="form-label">${t('testEditor.questionText', 'РўРµРєСЃС‚ РІРѕРїСЂРѕСЃР°')} <span class="required">*</span></label>
                    <textarea id="questionText" class="form-textarea" rows="3" placeholder="${t('testEditor.questionTextPlaceholder', 'Р’РІРµРґРёС‚Рµ С‚РµРєСЃС‚ РІРѕРїСЂРѕСЃР°')}" required>${question.question_text || ''}</textarea>
                </div>
                ` : ''}
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">${t('tests.marks', 'Р‘Р°Р»Р»С‹')} <span class="required">*</span></label>
                        <input type="number" id="questionMarks" class="form-input" value="${question.marks || 1}" min="1" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">${t('testEditor.imageMediaUrlOptional', 'URL РёР·РѕР±СЂР°Р¶РµРЅРёСЏ/РјРµРґРёР° (РЅРµРѕР±СЏР·Р°С‚РµР»СЊРЅРѕ)')}</label>
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
                            <h2 class="modal-title">${isEdit ? t('tests.edit', 'Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ') : t('testEditor.add', 'Р”РѕР±Р°РІРёС‚СЊ')} ${typeConfig.name} ${t('testEditor.question', 'РІРѕРїСЂРѕСЃ')}</h2>
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
                                ${isEdit ? t('testEditor.update', 'РћР±РЅРѕРІРёС‚СЊ') : t('testEditor.add', 'Р”РѕР±Р°РІРёС‚СЊ')} ${t('testEditor.question', 'РІРѕРїСЂРѕСЃ')}
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
            const answers = Array.isArray(question.correct_answer) ? question.correct_answer : [question.correct_answer || ''];
            return `
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
                            ${t('testEditor.uploadImage', 'Р—Р°РіСЂСѓР·РёС‚СЊ РёР·РѕР±СЂР°Р¶РµРЅРёРµ')}
                        </button>
                        <span id="imageUploadStatus" style="font-size: 12px; color: var(--text-secondary);"></span>
                    </div>
                    <div id="imagePreviewWrap" style="margin-top: 10px;">
                        ${question.media_url ? `<img id="imagePreview" src="${question.media_url}" alt="${t('testEditor.previewAlt', 'Предпросмотр')}" style="max-width: 100%; max-height: 300px; border-radius: 8px;">` : `<img id="imagePreview" src="" alt="${t('testEditor.previewAlt', 'Предпросмотр')}" style="display:none; max-width: 100%; max-height: 300px; border-radius: 8px;">`}
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">${t('testEditor.answerType', 'РўРёРї РѕС‚РІРµС‚Р°')}</label>
                    <select id="imageAnswerType" class="form-input">
                        <option value="single" ${answerType === 'single' ? 'selected' : ''}>${t('testEditor.typeSingleChoice', 'РћРґРёРЅ РІС‹Р±РѕСЂ')}</option>
                        <option value="multiple" ${answerType === 'multiple' ? 'selected' : ''}>${t('testEditor.typeMultipleChoice', 'РњРЅРѕР¶РµСЃС‚РІРµРЅРЅС‹Р№ РІС‹Р±РѕСЂ')}</option>
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
                    throw new Error(data.message || t('testEditor.failedUploadImage', 'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РёР·РѕР±СЂР°Р¶РµРЅРёРµ'));
                }

                if (imageUrlInput) imageUrlInput.value = data.url;
                if (preview) {
                    preview.src = data.url;
                    preview.style.display = 'block';
                }
                if (status) status.textContent = t('testEditor.uploadedSuccessfully', 'РЈСЃРїРµС€РЅРѕ Р·Р°РіСЂСѓР¶РµРЅРѕ');
            } catch (error) {
                console.error('Question image upload error:', error);
                if (status) status.textContent = '';
                alert(error.message || t('testEditor.failedUploadImage', 'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РёР·РѕР±СЂР°Р¶РµРЅРёРµ'));
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

            // Validation
            if (questionType !== 'fillblanks' && !questionText) {
                alert(t('testEditor.enterQuestionText', 'Р’РІРµРґРёС‚Рµ С‚РµРєСЃС‚ РІРѕРїСЂРѕСЃР°'));
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
                    const answers = Array.from(document.querySelectorAll('.answer-input')).map(el => el.value.trim()).filter(a => a);
                    if (answers.length === 0) {
                        alert(t('testEditor.provideAtLeastOneAcceptable', 'Добавьте хотя бы один допустимый ответ'));
                        return;
                    }
                    correctAnswer = answers.length === 1 ? answers[0] : answers;
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
                media_url: questionType === 'imagebased' ? document.getElementById('imageUrl').value.trim() : mediaUrl
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
                header.textContent = `${t('testEditor.questions', 'Р’РѕРїСЂРѕСЃС‹')} (${this.questions.length})`;
            }

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
                alert(t('testEditor.addOneQuestionBeforePublish', 'Р”РѕР±Р°РІСЊС‚Рµ С…РѕС‚СЏ Р±С‹ РѕРґРёРЅ РІРѕРїСЂРѕСЃ РїРµСЂРµРґ РїСѓР±Р»РёРєР°С†РёРµР№.'));
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
                alert(t('testEditor.fillRequiredFields', 'Р—Р°РїРѕР»РЅРёС‚Рµ РІСЃРµ РѕР±СЏР·Р°С‚РµР»СЊРЅС‹Рµ РїРѕР»СЏ.'));
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
                            ? t('testEditor.publishSuccess', 'РўРµСЃС‚ СѓСЃРїРµС€РЅРѕ РѕРїСѓР±Р»РёРєРѕРІР°РЅ!')
                            : t('testEditor.draftSavedSuccess', 'РўРµСЃС‚ СѓСЃРїРµС€РЅРѕ СЃРѕС…СЂР°РЅРµРЅ РєР°Рє С‡РµСЂРЅРѕРІРёРє!')
                    );
                    this.close();
                    if (window.TestsManager) {
                        window.TestsManager.loadTests();
                    }
                } else {
                    const error = await response.json();
                    alert(error.message || t('testEditor.failedSaveTest', 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ С‚РµСЃС‚'));
                }
            } catch (error) {
                console.error('Save test error:', error);
                alert(t('testEditor.failedSaveTest', 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ С‚РµСЃС‚'));
            }
        },

        // Close editor
        close: function () {
            const modal = document.getElementById('testEditorModal');
            if (modal) modal.remove();
        }
    };
})();
