// Test Taking Interface
(function () {
    'use strict';

    const TestTaker = {
        attemptId: null,
        attempt: null,
        questions: [],
        answers: {},
        currentQuestionIndex: 0,
        timer: null,
        endTime: null,
        autoSaveInterval: null,
        lastSaveTime: null,
        tabSwitches: 0,
        copyAttempts: 0,
        suspiciousActivity: [],
        proctoring: {
            blockCopyPaste: true,
            trackTabSwitches: true,
            fullscreenRequired: false
        },
        lastTabSwitchAt: 0,

        // Initialize test taking page
        init: async function () {
            // Get attempt ID from URL
            const urlParams = new URLSearchParams(window.location.search);
            this.attemptId = urlParams.get('attempt_id');

            if (!this.attemptId) {
                alert('Invalid test attempt');
                window.location.href = '/dashboard.html';
                return;
            }

            // Load attempt data
            await this.loadAttempt();

            // Setup event listeners
            this.setupEventListeners();

            // Setup proctoring listeners
            this.initProctoring();

            // Start timer
            this.startTimer();

            // Start auto-save
            this.startAutoSave();

            // Render first question
            this.renderQuestion();

            // Prevent accidental page leave
            window.addEventListener('beforeunload', (e) => {
                if (!this.attempt.is_completed) {
                    e.preventDefault();
                    e.returnValue = 'Your test progress will be saved, but are you sure you want to leave?';
                }
            });
        },

        // Load attempt and questions
        loadAttempt: async function () {
            try {
                const token = localStorage.getItem('access_token');
                const response = await fetch(`/api/student/attempts/${this.attemptId}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!response.ok) {
                    throw new Error('Failed to load test');
                }

                const data = await response.json();
                this.attempt = data.attempt;
                this.questions = data.questions;

                // Validate questions exist
                if (!this.questions || this.questions.length === 0) {
                    alert('This test has no questions. Please contact your teacher.');
                    window.location.href = '/dashboard.html';
                    return;
                }

                this.proctoring = {
                    blockCopyPaste: this.attempt.block_copy_paste !== false,
                    trackTabSwitches: this.attempt.track_tab_switches !== false,
                    fullscreenRequired: this.attempt.fullscreen_required === true
                };
                this.tabSwitches = parseInt(this.attempt.tab_switches || 0, 10);
                this.copyAttempts = parseInt(this.attempt.copy_attempts || 0, 10);
                this.suspiciousActivity = Array.isArray(this.attempt.suspicious_activity)
                    ? [...this.attempt.suspicious_activity]
                    : [];

                // Load existing answers if any
                if (this.attempt.answers && typeof this.attempt.answers === 'object') {
                    this.answers = this.attempt.answers;
                }

                // Calculate end time
                const startedAt = new Date(this.attempt.started_at);
                this.endTime = new Date(startedAt.getTime() + this.attempt.duration_minutes * 60000);

                // Check if time expired
                if (new Date() >= this.endTime) {
                    alert('Time has expired for this test. Submitting automatically.');
                    await this.submitTest();
                    return;
                }

                // Update header
                document.getElementById('testTitle').textContent = this.attempt.test_title;
                document.getElementById('testMeta').innerHTML = `
                    <span>${this.questions.length} Questions</span>
                    <span>•</span>
                    <span>${this.attempt.duration_minutes} Minutes</span>
                `;

                // Render question navigation
                this.renderQuestionNav();

            } catch (error) {
                console.error('Load attempt error:', error);
                alert('Failed to load test. Redirecting to dashboard.');
                window.location.href = '/dashboard.html';
            }
        },

        // Setup event listeners
        setupEventListeners: function () {
            // Navigation buttons
            document.getElementById('prevBtn').addEventListener('click', () => {
                this.saveCurrentAnswer();
                this.navigateQuestion(-1);
            });

            document.getElementById('nextBtn').addEventListener('click', () => {
                this.saveCurrentAnswer();
                this.navigateQuestion(1);
            });

            // Submit button
            document.getElementById('submitTestBtn').addEventListener('click', () => {
                this.confirmSubmit();
            });
        },

        initProctoring: function () {
            if (this.proctoring.trackTabSwitches) {
                document.addEventListener('visibilitychange', () => {
                    if (document.hidden) {
                        this.recordTabSwitch('visibility');
                    }
                });

                window.addEventListener('blur', () => {
                    this.recordTabSwitch('blur');
                });
            }

            if (this.proctoring.blockCopyPaste) {
                ['copy', 'cut', 'paste'].forEach(eventName => {
                    document.addEventListener(eventName, (event) => {
                        event.preventDefault();
                        this.copyAttempts += 1;
                        this.recordSuspiciousActivity('clipboard_blocked', { action: eventName });
                        this.showProctoringNotice('Copy/paste is disabled during this test.');
                    });
                });
            }

            if (this.proctoring.fullscreenRequired) {
                this.requestFullscreen();
                document.addEventListener('fullscreenchange', () => {
                    if (!document.fullscreenElement && !this.attempt.is_completed) {
                        this.recordSuspiciousActivity('fullscreen_exit', {});
                        this.showProctoringNotice('Fullscreen is required. Please return to fullscreen.');
                        this.requestFullscreen();
                    }
                });
            }
        },

        recordTabSwitch: function (source) {
            const now = Date.now();
            if (now - this.lastTabSwitchAt < 1500) {
                return;
            }
            this.lastTabSwitchAt = now;
            this.tabSwitches += 1;
            this.recordSuspiciousActivity('tab_switch', { source: source });
            this.showProctoringNotice('Tab switching is monitored during this test.');
        },

        recordSuspiciousActivity: function (type, details) {
            this.suspiciousActivity.push({
                type: type,
                details: details || {},
                timestamp: new Date().toISOString()
            });
        },

        requestFullscreen: function () {
            const root = document.documentElement;
            if (!root.requestFullscreen) {
                return;
            }
            if (!document.fullscreenElement) {
                root.requestFullscreen().catch(() => {
                    this.showProctoringNotice('Please enable fullscreen to continue this test.');
                });
            }
        },

        showProctoringNotice: function (message) {
            let notice = document.getElementById('proctoringNotice');
            if (!notice) {
                notice = document.createElement('div');
                notice.id = 'proctoringNotice';
                notice.className = 'proctoring-notice';
                document.body.appendChild(notice);
            }

            notice.textContent = message;
            notice.classList.add('show');
            clearTimeout(notice._timeout);
            notice._timeout = setTimeout(() => {
                notice.classList.remove('show');
            }, 3000);
        },

        // Start countdown timer
        startTimer: function () {
            const updateTimer = () => {
                const now = new Date();
                const remaining = this.endTime - now;

                if (remaining <= 0) {
                    clearInterval(this.timer);
                    this.autoSubmit();
                    return;
                }

                const minutes = Math.floor(remaining / 60000);
                const seconds = Math.floor((remaining % 60000) / 1000);
                const display = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

                const timerElement = document.getElementById('timerDisplay');
                timerElement.textContent = display;

                // Warning when less than 5 minutes
                if (remaining < 5 * 60000) {
                    timerElement.style.color = 'var(--danger)';
                }
            };

            updateTimer();
            this.timer = setInterval(updateTimer, 1000);
        },

        // Start auto-save
        startAutoSave: function () {
            this.autoSaveInterval = setInterval(() => {
                this.autoSaveProgress();
            }, 30000); // Save every 30 seconds
        },

        // Auto-save progress
        autoSaveProgress: async function () {
            try {
                const token = localStorage.getItem('access_token');
                const response = await fetch(`/api/student/attempts/${this.attemptId}/save`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        answers: this.answers,
                        tab_switches: this.tabSwitches,
                        copy_attempts: this.copyAttempts,
                        suspicious_activity: this.suspiciousActivity
                    })
                });

                if (response.ok) {
                    this.showAutoSaveIndicator();
                    this.lastSaveTime = new Date();
                }
            } catch (error) {
                console.error('Auto-save error:', error);
            }
        },

        // Show auto-save indicator
        showAutoSaveIndicator: function () {
            const indicator = document.getElementById('autoSaveIndicator');
            indicator.classList.add('show');
            setTimeout(() => {
                indicator.classList.remove('show');
            }, 2000);
        },

        // Render question navigation
        renderQuestionNav: function () {
            const nav = document.getElementById('questionNav');
            let html = '';

            this.questions.forEach((question, index) => {
                const isAnswered = this.isQuestionAnswered(question.id);
                const isCurrent = index === this.currentQuestionIndex;
                html += `
                    <button
                        class="nav-question ${isCurrent ? 'current' : ''} ${isAnswered ? 'answered' : 'unanswered'}"
                        onclick="TestTaker.jumpToQuestion(${index})"
                    >
                        ${index + 1}
                    </button>
                `;
            });

            nav.innerHTML = html;
        },

        // Check if question is answered
        isQuestionAnswered: function (questionId) {
            const answer = this.answers[questionId];
            if (answer === undefined || answer === null || answer === '') return false;
            if (Array.isArray(answer) && answer.length === 0) return false;
            return true;
        },

        // Navigate to specific question
        jumpToQuestion: function (index) {
            this.saveCurrentAnswer();
            this.currentQuestionIndex = index;
            this.renderQuestion();
        },

        // Navigate question (+1 or -1)
        navigateQuestion: function (direction) {
            const newIndex = this.currentQuestionIndex + direction;

            if (newIndex < 0 || newIndex >= this.questions.length) {
                return;
            }

            this.currentQuestionIndex = newIndex;
            this.renderQuestion();
        },

        // Render current question
        renderQuestion: function () {
            const question = this.questions[this.currentQuestionIndex];

            // Safety check
            if (!question) {
                console.error('Question not found at index:', this.currentQuestionIndex);
                alert('Unable to load question. Returning to dashboard.');
                window.location.href = '/dashboard.html';
                return;
            }

            const container = document.getElementById('questionContainer');

            let html = `
                <div class="question-card">
                    <div class="question-header-info">
                        <span class="question-number">Question ${this.currentQuestionIndex + 1} of ${this.questions.length}</span>
                        <span class="question-marks">${question.marks} marks</span>
                    </div>
                    <div class="question-text">${question.question_text}</div>
                    ${question.media_url ? `<img src="${question.media_url}" alt="Question media" class="question-media" />` : ''}
                    <div class="answer-area">
                        ${this.renderAnswerInput(question)}
                    </div>
                </div>
            `;

            container.innerHTML = html;

            // Update navigation buttons
            document.getElementById('prevBtn').style.visibility = this.currentQuestionIndex === 0 ? 'hidden' : 'visible';
            document.getElementById('nextBtn').textContent = this.currentQuestionIndex === this.questions.length - 1 ? 'Finish' : 'Next';

            // Update question navigation
            this.renderQuestionNav();

            // Scroll to top
            window.scrollTo(0, 0);
        },

        // Render answer input based on question type
        renderAnswerInput: function (question) {
            const existingAnswer = this.answers[question.id];

            switch (question.question_type) {
                case 'singlechoice':
                    return this.renderSingleChoice(question, existingAnswer);

                case 'multiplechoice':
                    return this.renderMultipleChoice(question, existingAnswer);

                case 'truefalse':
                    return this.renderTrueFalse(question, existingAnswer);

                case 'shortanswer':
                    return this.renderShortAnswer(question, existingAnswer);

                case 'fillblanks':
                    return this.renderFillBlanks(question, existingAnswer);

                case 'ordering':
                    return this.renderOrdering(question, existingAnswer);

                case 'matching':
                    return this.renderMatching(question, existingAnswer);

                case 'imagebased':
                    return this.renderImageBased(question, existingAnswer);

                default:
                    return '<p>Unsupported question type</p>';
            }
        },

        // Render single choice
        renderSingleChoice: function (question, existingAnswer) {
            const options = question.options || [];
            let html = '<div class="options-list">';

            options.forEach((option, index) => {
                const isChecked = existingAnswer === index;
                html += `
                    <label class="option-label">
                        <input
                            type="radio"
                            name="question_${question.id}"
                            value="${index}"
                            ${isChecked ? 'checked' : ''}
                        />
                        <span>${option}</span>
                    </label>
                `;
            });

            html += '</div>';
            return html;
        },

        // Render multiple choice
        renderMultipleChoice: function (question, existingAnswer) {
            const options = question.options || [];
            const selectedOptions = Array.isArray(existingAnswer) ? existingAnswer : [];
            let html = '<div class="options-list">';

            options.forEach((option, index) => {
                const isChecked = selectedOptions.includes(index);
                html += `
                    <label class="option-label">
                        <input
                            type="checkbox"
                            name="question_${question.id}"
                            value="${index}"
                            ${isChecked ? 'checked' : ''}
                        />
                        <span>${option}</span>
                    </label>
                `;
            });

            html += '</div>';
            return html;
        },

        // Render true/false
        renderTrueFalse: function (question, existingAnswer) {
            return `
                <div class="options-list">
                    <label class="option-label">
                        <input
                            type="radio"
                            name="question_${question.id}"
                            value="true"
                            ${existingAnswer === 'true' || existingAnswer === true ? 'checked' : ''}
                        />
                        <span>True</span>
                    </label>
                    <label class="option-label">
                        <input
                            type="radio"
                            name="question_${question.id}"
                            value="false"
                            ${existingAnswer === 'false' || existingAnswer === false ? 'checked' : ''}
                        />
                        <span>False</span>
                    </label>
                </div>
            `;
        },

        // Render short answer
        renderShortAnswer: function (question, existingAnswer) {
            return `
                <input
                    type="text"
                    class="answer-input"
                    id="answer_${question.id}"
                    value="${existingAnswer || ''}"
                    placeholder="Type your answer here..."
                />
            `;
        },


        // Render fill in blanks
        renderFillBlanks: function (question, existingAnswer) {
            const blanksCount = (question.question_text.match(/___/g) || []).length;
            const answers = Array.isArray(existingAnswer) ? existingAnswer : new Array(blanksCount).fill('');
            let html = '<div class="blanks-list">';

            for (let i = 0; i < blanksCount; i++) {
                html += `
                    <div class="blank-item">
                        <label>Blank ${i + 1}:</label>
                        <input
                            type="text"
                            class="blank-input"
                            data-blank-index="${i}"
                            value="${answers[i] || ''}"
                            placeholder="Answer for blank ${i + 1}"
                        />
                    </div>
                `;
            }

            html += '</div>';
            return html;
        },

        // Render ordering
        renderOrdering: function (question, existingAnswer) {
            const items = question.options || [];
            const orderedItems = Array.isArray(existingAnswer) && existingAnswer.length > 0
                ? existingAnswer
                : items.map((_, i) => i);

            let html = '<div class="ordering-list" id="orderingList">';

            orderedItems.forEach((itemIndex, position) => {
                html += `
                    <div class="ordering-item" data-item-index="${itemIndex}" draggable="true">
                        <span class="drag-handle">⋮⋮</span>
                        <span class="item-number">${position + 1}.</span>
                        <span class="item-text">${items[itemIndex]}</span>
                    </div>
                `;
            });

            html += '</div>';
            html += '<div class="ordering-hint">Drag items to reorder them</div>';

            // Add drag and drop listeners after rendering
            setTimeout(() => this.initDragDrop(), 100);

            return html;
        },

        // Render matching
        renderMatching: function (question, existingAnswer) {
            const pairs = question.options || [];
            const leftItems = pairs.map(p => p.left);
            const rightItems = pairs.map(p => p.right);
            const matches = Array.isArray(existingAnswer) ? existingAnswer : new Array(pairs.length).fill(null);

            let html = '<div class="matching-container">';

            pairs.forEach((pair, index) => {
                html += `
                    <div class="matching-pair">
                        <div class="matching-left">${pair.left}</div>
                        <div class="matching-arrow">→</div>
                        <select class="matching-select" data-pair-index="${index}">
                            <option value="">Select match...</option>
                            ${rightItems.map((item, i) => `
                                <option value="${i}" ${matches[index] === i ? 'selected' : ''}>${item}</option>
                            `).join('')}
                        </select>
                    </div>
                `;
            });

            html += '</div>';
            return html;
        },

        // Render image-based
        renderImageBased: function (question, existingAnswer) {
            return this.renderSingleChoice(question, existingAnswer);
        },

        // Initialize drag and drop for ordering questions
        initDragDrop: function () {
            const list = document.getElementById('orderingList');
            if (!list) return;

            let draggedElement = null;

            list.querySelectorAll('.ordering-item').forEach(item => {
                item.addEventListener('dragstart', (e) => {
                    draggedElement = item;
                    item.classList.add('dragging');
                });

                item.addEventListener('dragend', () => {
                    item.classList.remove('dragging');
                });

                item.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    const afterElement = this.getDragAfterElement(list, e.clientY);
                    if (afterElement == null) {
                        list.appendChild(draggedElement);
                    } else {
                        list.insertBefore(draggedElement, afterElement);
                    }
                });
            });

            // Update numbers after drag
            list.addEventListener('dragend', () => {
                list.querySelectorAll('.ordering-item').forEach((item, index) => {
                    item.querySelector('.item-number').textContent = `${index + 1}.`;
                });
            });
        },

        // Get element after drag position
        getDragAfterElement: function (container, y) {
            const draggableElements = [...container.querySelectorAll('.ordering-item:not(.dragging)')];

            return draggableElements.reduce((closest, child) => {
                const box = child.getBoundingClientRect();
                const offset = y - box.top - box.height / 2;

                if (offset < 0 && offset > closest.offset) {
                    return { offset: offset, element: child };
                } else {
                    return closest;
                }
            }, { offset: Number.NEGATIVE_INFINITY }).element;
        },

        // Save current answer
        saveCurrentAnswer: function () {
            const question = this.questions[this.currentQuestionIndex];

            // Safety check
            if (!question) {
                console.warn('No question to save answer for');
                return;
            }

            let answer = null;

            switch (question.question_type) {
                case 'singlechoice':
                case 'truefalse':
                case 'imagebased':
                    const radio = document.querySelector(`input[name="question_${question.id}"]:checked`);
                    answer = radio ? radio.value : null;
                    if (question.question_type === 'singlechoice' || question.question_type === 'imagebased') {
                        answer = answer !== null ? parseInt(answer) : null;
                    }
                    break;

                case 'multiplechoice':
                    const checkboxes = document.querySelectorAll(`input[name="question_${question.id}"]:checked`);
                    answer = Array.from(checkboxes).map(cb => parseInt(cb.value));
                    break;

                case 'shortanswer':
                    const input = document.getElementById(`answer_${question.id}`);
                    answer = input ? input.value.trim() : '';
                    break;

                case 'fillblanks':
                    const blanks = document.querySelectorAll('.blank-input');
                    answer = Array.from(blanks).map(input => input.value.trim());
                    break;

                case 'ordering':
                    const orderingItems = document.querySelectorAll('.ordering-item');
                    answer = Array.from(orderingItems).map(item => parseInt(item.dataset.itemIndex));
                    break;

                case 'matching':
                    const selects = document.querySelectorAll('.matching-select');
                    answer = Array.from(selects).map(select => {
                        const value = select.value;
                        return value === '' ? null : parseInt(value);
                    });
                    break;
            }

            this.answers[question.id] = answer;
        },

        // Confirm submit
        confirmSubmit: function () {
            this.saveCurrentAnswer();

            const unanswered = this.questions.filter(q => !this.isQuestionAnswered(q.id)).length;

            let message = 'Are you sure you want to submit your test?';
            if (unanswered > 0) {
                message += `\n\nYou have ${unanswered} unanswered question(s).`;
            }

            if (confirm(message)) {
                this.submitTest();
            }
        },

        // Auto-submit when time expires
        autoSubmit: function () {
            this.saveCurrentAnswer();
            alert('Time is up! Your test is being submitted automatically.');
            this.submitTest();
        },

        // Submit test
        submitTest: async function () {
            try {
                // Clear intervals
                clearInterval(this.timer);
                clearInterval(this.autoSaveInterval);

                // Show loading
                const submitBtn = document.getElementById('submitTestBtn');
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<span class="spinner"></span> Submitting...';

                const token = localStorage.getItem('access_token');
                const response = await fetch(`/api/student/attempts/${this.attemptId}/submit`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        answers: this.answers,
                        tab_switches: this.tabSwitches,
                        copy_attempts: this.copyAttempts,
                        suspicious_activity: this.suspiciousActivity
                    })
                });

                const data = await response.json();

                if (response.ok) {
                    // Show success and redirect
                    alert(`Test submitted successfully!\n\nYour score: ${data.score}/${data.max_score} (${data.percentage}%)\nStatus: ${data.passed ? 'Passed' : 'Not Passed'}`);
                    window.location.href = '/dashboard.html';
                } else {
                    throw new Error(data.message || 'Failed to submit test');
                }
            } catch (error) {
                console.error('Submit test error:', error);
                alert('Failed to submit test. Please try again.');
                window.location.reload();
            }
        }
    };

    // Expose to window for inline onclick handlers
    window.TestTaker = TestTaker;

    // Initialize on load
    document.addEventListener('DOMContentLoaded', () => {
        TestTaker.init();
    });
})();
