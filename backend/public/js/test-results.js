// Test Results Viewer
(function () {
    'use strict';

    window.ResultsViewer = {
        attemptId: null,
        assignmentId: null,
        attempt: null,
        questions: [],
        currentFilter: 'all',
        lastErrorMessage: '',
        currentLang: localStorage.getItem('zedly-lang') || 'ru',
        translations: {
            ru: {
                backToDashboard: 'Назад в дашборд',
                loading: 'Загрузка результатов...',
                summaryTitle: 'Сводка теста',
                yourScore: 'Ваш балл',
                percentage: 'Процент',
                timeTaken: 'Время',
                correctAnswers: 'Верных ответов',
                testLabel: 'Тест:',
                subjectLabel: 'Предмет:',
                dateLabel: 'Дата:',
                questionsReview: 'Разбор вопросов',
                filterAll: 'Все вопросы',
                filterCorrect: 'Верные',
                filterIncorrect: 'Неверные',
                failedTitle: 'Не удалось загрузить результаты',
                failedMessage: 'Произошла ошибка при загрузке результатов теста.',
                resultsSuffix: 'Результаты',
                pendingReview: 'Ожидает проверки',
                passed: 'Пройден',
                failed: 'Не пройден',
                correct: 'Верно',
                incorrect: 'Неверно',
                question: 'Вопрос',
                marks: 'балл.',
                noQuestionsByFilter: 'Нет вопросов по выбранному фильтру.',
                unsupportedAnswerType: 'Тип ответа не поддерживается',
                yourAnswer: 'Ваш ответ',
                notAnswered: 'Нет ответа',
                correctAnswerLabel: 'Правильный ответ',
                correctAnswersLabel: 'Правильные ответы',
                or: 'или',
                blank: 'Пропуск',
                empty: 'Пусто',
                yourOrder: 'Ваш порядок',
                correctOrder: 'Правильный порядок',
                notMatched: 'Не сопоставлено',
                yourMatch: 'Ваше соответствие',
                correctLabel: 'Правильно',
                minutesShort: 'м',
                secondsShort: 'с',
                trueLabel: 'Верно',
                falseLabel: 'Неверно',
                errorMissingAttempt: 'Некорректный запрос. Нет attempt_id или assignment_id.',
                errorLoadFailed: 'Не удалось загрузить результаты',
                errorNoCompleted: 'Нет завершённых попыток',
                errorNotCompleted: 'Этот тест ещё не завершён.'
            },
            uz: {
                backToDashboard: 'Dashboardga qaytish',
                loading: 'Natijalar yuklanmoqda...',
                summaryTitle: 'Test xulosasi',
                yourScore: 'Sizning balingiz',
                percentage: 'Foiz',
                timeTaken: 'Vaqt',
                correctAnswers: "To'g'ri javoblar",
                testLabel: 'Test:',
                subjectLabel: 'Fan:',
                dateLabel: 'Sana:',
                questionsReview: 'Savollar tahlili',
                filterAll: 'Barcha savollar',
                filterCorrect: "To'g'ri",
                filterIncorrect: "Noto'g'ri",
                failedTitle: "Natijalarni yuklab bo'lmadi",
                failedMessage: "Test natijalarini yuklashda xatolik yuz berdi.",
                resultsSuffix: 'Natijalar',
                pendingReview: 'Tekshiruv kutilmoqda',
                passed: "O'tgan",
                failed: "O'tmagan",
                correct: "To'g'ri",
                incorrect: "Noto'g'ri",
                question: 'Savol',
                marks: 'ball',
                noQuestionsByFilter: "Tanlangan filtr bo'yicha savollar topilmadi.",
                unsupportedAnswerType: "Javob turi qo'llab-quvvatlanmaydi",
                yourAnswer: 'Sizning javobingiz',
                notAnswered: 'Javob berilmagan',
                correctAnswerLabel: "To'g'ri javob",
                correctAnswersLabel: "To'g'ri javoblar",
                or: 'yoki',
                blank: "Bo'sh joy",
                empty: "Bo'sh",
                yourOrder: 'Sizning tartibingiz',
                correctOrder: "To'g'ri tartib",
                notMatched: 'Moslanmagan',
                yourMatch: 'Sizning moslash',
                correctLabel: "To'g'ri",
                minutesShort: 'daq',
                secondsShort: 'son',
                trueLabel: 'Rost',
                falseLabel: "Yolg'on",
                errorMissingAttempt: "Noto'g'ri so'rov. attempt_id yoki assignment_id yo'q.",
                errorLoadFailed: "Natijalarni yuklab bo'lmadi",
                errorNoCompleted: "Yakunlangan urinishlar yo'q",
                errorNotCompleted: 'Ushbu test hali yakunlanmagan.'
            }
        },

        t: function (key, fallback, params) {
            const dict = this.translations[this.currentLang] || this.translations.ru;
            return dict[key] || fallback || key;
        },

        applyLangButtons: function () {
            document.querySelectorAll('.lang-btn').forEach((btn) => {
                btn.classList.toggle('active', btn.dataset.lang === this.currentLang);
            });
        },

        bindLangEvents: function () {
            document.querySelectorAll('.lang-btn').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const nextLang = btn.dataset.lang === 'uz' ? 'uz' : 'ru';
                    this.currentLang = nextLang;
                    localStorage.setItem('zedly-lang', nextLang);
                    this.applyLangButtons();
                    this.renderStaticTexts();
                    if (this.attempt) this.renderResults();
                    if (this.lastErrorMessage) this.showError(this.lastErrorMessage);
                });
            });
        },

        renderStaticTexts: function () {
            const setText = (selector, value) => {
                const el = document.querySelector(selector);
                if (el) el.textContent = value;
            };
            setText('.btn-back span', this.t('backToDashboard'));
            setText('#loadingState p', this.t('loading'));
            setText('.summary-header h2', this.t('summaryTitle'));
            setText('#resultsContent .summary-grid .summary-item:nth-child(1) .summary-label', this.t('yourScore'));
            setText('#resultsContent .summary-grid .summary-item:nth-child(2) .summary-label', this.t('percentage'));
            setText('#resultsContent .summary-grid .summary-item:nth-child(3) .summary-label', this.t('timeTaken'));
            setText('#resultsContent .summary-grid .summary-item:nth-child(4) .summary-label', this.t('correctAnswers'));
            setText('#resultsContent .summary-footer .test-info-item:nth-child(1) strong', this.t('testLabel'));
            setText('#resultsContent .summary-footer .test-info-item:nth-child(2) strong', this.t('subjectLabel'));
            setText('#resultsContent .summary-footer .test-info-item:nth-child(3) strong', this.t('dateLabel'));
            setText('.review-header h2', this.t('questionsReview'));
            setText('.filter-btn[data-filter="all"]', this.t('filterAll'));
            setText('.filter-btn[data-filter="correct"]', this.t('filterCorrect'));
            setText('.filter-btn[data-filter="incorrect"]', this.t('filterIncorrect'));
            setText('#errorState h3', this.t('failedTitle'));
            if (!this.lastErrorMessage) {
                setText('#errorMessage', this.t('failedMessage'));
            }
            setText('#errorState .btn.btn-primary span', this.t('backToDashboard'));
        },

        // Initialize results viewer
        init: async function () {
            const urlParams = new URLSearchParams(window.location.search);
            this.attemptId = urlParams.get('attempt_id');
            this.assignmentId = urlParams.get('assignment_id');

            if (!this.attemptId && !this.assignmentId) {
                this.showError(this.t('errorMissingAttempt', 'Некорректный запрос. Нет attempt_id или assignment_id.'));
                return;
            }
            this.applyLangButtons();
            this.bindLangEvents();
            this.renderStaticTexts();

            await this.loadResults();
        },

        loadResults: async function () {
            try {
                const token = localStorage.getItem('access_token');
                const url = this.attemptId
                    ? `/api/student/attempts/${this.attemptId}`
                    : `/api/student/assignments/${this.assignmentId}`;

                const response = await fetch(url, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!response.ok) {
                    throw new Error(this.t('errorLoadFailed', 'Не удалось загрузить результаты'));
                }

                const data = await response.json();

                if (this.attemptId) {
                    this.attempt = data.attempt;
                    this.questions = data.questions || [];
                } else {
                    const attempts = (data.attempts || []).filter(item => item.is_completed);
                    if (attempts.length === 0) {
                        throw new Error(this.t('errorNoCompleted', 'Нет завершённых попыток'));
                    }
                    const bestAttempt = attempts.reduce((best, current) =>
                        current.percentage > best.percentage ? current : best
                    );

                    const attemptResponse = await fetch(`/api/student/attempts/${bestAttempt.id}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (!attemptResponse.ok) {
                        throw new Error(this.t('errorLoadFailed', 'Не удалось загрузить результаты'));
                    }
                    const attemptData = await attemptResponse.json();
                    this.attempt = attemptData.attempt;
                    this.questions = attemptData.questions || [];
                }

                if (!this.attempt?.is_completed) {
                    this.showError(this.t('errorNotCompleted', 'Этот тест ещё не завершён.'));
                    return;
                }

                this.renderResults();
            } catch (error) {
                console.error('Load results error:', error);
                this.showError(error.message || this.t('errorLoadFailed', 'Не удалось загрузить результаты теста'));
            }
        },

        renderResults: function () {
            document.getElementById('loadingState').style.display = 'none';
            document.getElementById('resultsContent').style.display = 'block';

            document.getElementById('resultsTitle').textContent =
                `${this.attempt.test_title} - ${this.t('resultsSuffix', 'Результаты')}`;

            this.renderSummary();
            this.renderQuestions();
        },

        renderSummary: function () {
            const percentage = parseFloat(this.attempt.percentage || 0);
            const answers = this.attempt.answers || {};
            const hasUngradedQuestions = Object.values(answers).some(a => a.is_correct === null);
            const passed = percentage >= parseFloat(this.attempt.passing_score || 0);

            const badge = document.getElementById('testBadge');
            if (hasUngradedQuestions) {
                badge.className = 'test-badge pending';
                badge.textContent = `⏳ ${this.t('pendingReview', 'Ожидает проверки')}`;
            } else {
                badge.className = `test-badge ${passed ? 'passed' : 'failed'}`;
                badge.textContent = passed
                    ? `✓ ${this.t('passed', 'Пройден')}`
                    : `✗ ${this.t('failed', 'Не пройден')}`;
            }

            document.getElementById('scoreValue').textContent = `${this.attempt.score} / ${this.attempt.max_score}`;

            const percentageEl = document.getElementById('percentageValue');
            percentageEl.textContent = `${percentage.toFixed(1)}%`;
            percentageEl.className = hasUngradedQuestions
                ? 'summary-value pending'
                : `summary-value ${passed ? 'passed' : 'failed'}`;

            document.getElementById('timeValue').textContent = this.formatTime(this.attempt.time_spent_seconds || 0);

            const correctCount = Object.values(answers).filter(a => a.is_correct === true).length;
            document.getElementById('correctValue').textContent = `${correctCount} / ${this.questions.length}`;

            document.getElementById('testName').textContent = this.attempt.test_title || '-';
            document.getElementById('subjectName').textContent = this.attempt.subject_name || '-';
            document.getElementById('testDate').textContent = this.formatDate(this.attempt.submitted_at);
        },

        renderQuestions: function () {
            const container = document.getElementById('questionsContainer');
            const answers = this.attempt.answers || {};

            let html = '';
            this.questions.forEach((question, index) => {
                const answer = answers[question.id];
                const isCorrect = answer?.is_correct === true;
                const isWrong = answer?.is_correct === false;

                if (this.currentFilter === 'correct' && !isCorrect) return;
                if (this.currentFilter === 'incorrect' && !isWrong) return;

                const statusClass = isCorrect ? 'correct' : (isWrong ? 'incorrect' : 'manual');
                const statusIcon = isCorrect ? '✓' : (isWrong ? '✗' : '⏳');
                const statusText = isCorrect
                    ? this.t('correct', 'Верно')
                    : (isWrong ? this.t('incorrect', 'Неверно') : this.t('pendingReview', 'Ожидает проверки'));

                html += `
                    <div class="question-review-card ${statusClass}">
                        <div class="question-review-header">
                            <div class="question-number-badge">${this.t('question', 'Вопрос')} ${index + 1}</div>
                            <div class="question-status ${statusClass}">
                                <span class="status-icon">${statusIcon}</span>
                                <span>${statusText}</span>
                            </div>
                            <div class="question-marks">
                                <strong>${answer?.earned_marks || 0}</strong> / ${question.marks} ${this.t('marks', 'балл.')}
                            </div>
                        </div>

                        <div class="question-review-body">
                            <div class="question-text">${question.question_text}</div>
                            ${question.media_url ? `<img src="${question.media_url}" class="question-media" alt="Question media" />` : ''}

                            <div class="answer-section">
                                ${this.renderQuestionAnswer(question, answer)}
                            </div>
                        </div>
                    </div>
                `;
            });

            if (html === '') {
                html = `<div class="no-results">${this.t('noQuestionsByFilter', 'Нет вопросов по выбранному фильтру.')}</div>`;
            }

            container.innerHTML = html;
        },

        renderQuestionAnswer: function (question, answer) {
            const studentAnswer = answer?.student_answer;
            const isCorrect = answer?.is_correct ?? null;

            switch (question.question_type) {
                case 'singlechoice':
                case 'multiplechoice':
                    return this.renderChoiceAnswer(question, studentAnswer);
                case 'truefalse':
                    return this.renderTrueFalseAnswer(question, studentAnswer);
                case 'shortanswer':
                    return this.renderShortAnswer(question, studentAnswer, isCorrect);
                case 'fillblanks':
                    return this.renderFillBlanksAnswer(question, studentAnswer);
                case 'ordering':
                    return this.renderOrderingAnswer(question, studentAnswer);
                case 'matching':
                    return this.renderMatchingAnswer(question, studentAnswer);
                case 'imagebased':
                    return this.renderChoiceAnswer(question, studentAnswer);
                default:
                    return `<p>${this.t('unsupportedAnswerType', 'Тип ответа не поддерживается')}</p>`;
            }
        },

        renderChoiceAnswer: function (question, studentAnswer) {
            const options = question.options || [];
            const correctAnswer = question.correct_answer;
            const correctAnswers = Array.isArray(correctAnswer) ? correctAnswer : [correctAnswer];
            const studentAnswers = Array.isArray(studentAnswer) ? studentAnswer : [studentAnswer];

            let html = '<div class="answer-options">';
            options.forEach((option, index) => {
                const isStudentChoice = studentAnswers.includes(index);
                const isCorrectChoice = correctAnswers.includes(index);

                let className = 'answer-option';
                if (isCorrectChoice) className += ' correct-option';
                if (isStudentChoice && !isCorrectChoice) className += ' wrong-option';
                if (isStudentChoice) className += ' selected';

                html += `
                    <div class="${className}">
                        <div class="option-marker">
                            ${isStudentChoice ? (isCorrectChoice ? '✓' : '✗') : (isCorrectChoice ? '→' : '')}
                        </div>
                        <div class="option-text">${option}</div>
                    </div>
                `;
            });
            html += '</div>';
            return html;
        },

        renderTrueFalseAnswer: function (question, studentAnswer) {
            const correctValue = String(question.correct_answer);
            const studentValue = String(studentAnswer);

            return `
                <div class="answer-options">
                    <div class="answer-option ${correctValue === 'true' ? 'correct-option' : ''} ${studentValue === 'true' ? (correctValue === 'true' ? 'selected' : 'wrong-option selected') : ''}">
                        <div class="option-marker">${studentValue === 'true' ? (correctValue === 'true' ? '✓' : '✗') : (correctValue === 'true' ? '→' : '')}</div>
                        <div class="option-text">${this.t('trueLabel', 'Верно')}</div>
                    </div>
                    <div class="answer-option ${correctValue === 'false' ? 'correct-option' : ''} ${studentValue === 'false' ? (correctValue === 'false' ? 'selected' : 'wrong-option selected') : ''}">
                        <div class="option-marker">${studentValue === 'false' ? (correctValue === 'false' ? '✓' : '✗') : (correctValue === 'false' ? '→' : '')}</div>
                        <div class="option-text">${this.t('falseLabel', 'Неверно')}</div>
                    </div>
                </div>
            `;
        },

        renderShortAnswer: function (question, studentAnswer, isCorrect) {
            const correctAnswers = Array.isArray(question.correct_answer) ? question.correct_answer : [question.correct_answer];
            const correctLabel = correctAnswers.length > 1
                ? this.t('correctAnswersLabel', 'Правильные ответы')
                : this.t('correctAnswerLabel', 'Правильный ответ');

            return `
                <div class="answer-text-display">
                    <div class="answer-label">${this.t('yourAnswer', 'Ваш ответ')}:</div>
                    <div class="answer-value ${isCorrect ? 'correct-answer' : 'wrong-answer'}">
                        ${studentAnswer || `<em>${this.t('notAnswered', 'Нет ответа')}</em>`}
                    </div>
                </div>
                <div class="answer-text-display">
                    <div class="answer-label">${correctLabel}:</div>
                    <div class="answer-value correct-answer">
                        ${correctAnswers.join(` <strong>${this.t('or', 'или')}</strong> `)}
                    </div>
                </div>
            `;
        },

        renderFillBlanksAnswer: function (question, studentAnswer) {
            const correctAnswers = Array.isArray(question.correct_answer) ? question.correct_answer : [];
            const studentAnswers = Array.isArray(studentAnswer) ? studentAnswer : [];

            let html = '<div class="blanks-review">';
            correctAnswers.forEach((correct, index) => {
                const student = studentAnswers[index] || '';
                const isBlankCorrect = String(correct).toLowerCase().trim() === String(student).toLowerCase().trim();

                html += `
                    <div class="blank-review-item">
                        <div class="blank-label">${this.t('blank', 'Пропуск')} ${index + 1}:</div>
                        <div class="blank-answers">
                            <div class="blank-answer ${isBlankCorrect ? 'correct-answer' : 'wrong-answer'}">
                                <strong>${this.t('yourAnswer', 'Ваш ответ')}:</strong> ${student || `<em>${this.t('empty', 'Пусто')}</em>`}
                            </div>
                            ${!isBlankCorrect ? `
                                <div class="blank-answer correct-answer">
                                    <strong>${this.t('correctAnswerLabel', 'Правильный ответ')}:</strong> ${correct}
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `;
            });
            html += '</div>';
            return html;
        },

        renderOrderingAnswer: function (question, studentAnswer) {
            const items = question.options || [];
            const correctOrder = Array.isArray(question.correct_answer) ? question.correct_answer : [];
            const studentOrder = Array.isArray(studentAnswer) ? studentAnswer : [];

            let html = '<div class="ordering-review">';
            html += `<div class="ordering-column"><h4>${this.t('yourOrder', 'Ваш порядок')}:</h4>`;
            studentOrder.forEach((itemIndex, position) => {
                const isInCorrectPosition = correctOrder[position] === itemIndex;
                html += `
                    <div class="ordering-review-item ${isInCorrectPosition ? 'correct-position' : 'wrong-position'}">
                        <span class="position-number">${position + 1}</span>
                        <span>${items[itemIndex]}</span>
                        ${isInCorrectPosition ? '<span class="check">✓</span>' : '<span class="cross">✗</span>'}
                    </div>
                `;
            });
            html += '</div>';

            html += `<div class="ordering-column"><h4>${this.t('correctOrder', 'Правильный порядок')}:</h4>`;
            correctOrder.forEach((itemIndex, position) => {
                html += `
                    <div class="ordering-review-item correct-position">
                        <span class="position-number">${position + 1}</span>
                        <span>${items[itemIndex]}</span>
                    </div>
                `;
            });
            html += '</div>';
            html += '</div>';

            return html;
        },

        renderMatchingAnswer: function (question, studentAnswer) {
            const pairs = question.options || [];
            const correctMatches = Array.isArray(question.correct_answer) ? question.correct_answer : [];
            const studentMatches = Array.isArray(studentAnswer) ? studentAnswer : [];
            const rightItems = pairs.map(p => p.right);

            let html = '<div class="matching-review">';
            pairs.forEach((pair, index) => {
                const studentMatch = studentMatches[index];
                const correctMatch = correctMatches[index];
                const isMatchCorrect = studentMatch === correctMatch;

                const studentMatchText = studentMatch !== null && studentMatch !== undefined
                    ? rightItems[studentMatch]
                    : this.t('notMatched', 'Не сопоставлено');
                const correctMatchText = rightItems[correctMatch];

                html += `
                    <div class="matching-review-item">
                        <div class="matching-left">${pair.left}</div>
                        <div class="matching-center">
                            <div class="matching-student ${isMatchCorrect ? 'correct-match' : 'wrong-match'}">
                                ${this.t('yourMatch', 'Ваше соответствие')}: <strong>${studentMatchText}</strong>
                                ${isMatchCorrect ? '✓' : '✗'}
                            </div>
                            ${!isMatchCorrect ? `
                                <div class="matching-correct">
                                    ${this.t('correctLabel', 'Правильно')}: <strong>${correctMatchText}</strong>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `;
            });
            html += '</div>';
            return html;
        },

        filterQuestions: function (filter) {
            this.currentFilter = filter;
            document.querySelectorAll('.filter-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.filter === filter);
            });
            this.renderQuestions();
        },

        formatTime: function (seconds) {
            const minutes = Math.floor((seconds || 0) / 60);
            const secs = (seconds || 0) % 60;
            return `${minutes}${this.t('minutesShort', 'м')} ${secs}${this.t('secondsShort', 'с')}`;
        },

        formatDate: function (dateString) {
            if (!dateString) return '-';
            const date = new Date(dateString);
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            return `${day}.${month}.${year} ${hours}:${minutes}`;
        },

        showError: function (message) {
            this.lastErrorMessage = message;
            document.getElementById('loadingState').style.display = 'none';
            document.getElementById('resultsContent').style.display = 'none';
            document.getElementById('errorState').style.display = 'flex';
            document.getElementById('errorMessage').textContent = message;
        }
    };

    document.addEventListener('DOMContentLoaded', () => {
        ResultsViewer.init();
    });
})();
