// Student Attempt Viewer (for teachers)
(function () {
    'use strict';

    const ICONS = {
        pass: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>',
        fail: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
        manual: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15 14"></polyline></svg>',
        answer: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"></circle></svg>'
    };

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function asArray(value) {
        if (Array.isArray(value)) return value;
        if (value === null || value === undefined) return [];
        return [value];
    }

    window.AttemptViewer = {
        attemptId: null,
        attempt: null,
        questions: [],
        currentFilter: 'all',

        icon: function (name) {
            return ICONS[name] || '';
        },

        optionMarker: function (isStudentChoice, isCorrectChoice) {
            if (isStudentChoice && isCorrectChoice) {
                return { className: 'option-marker is-correct', icon: this.icon('pass') };
            }
            if (isStudentChoice && !isCorrectChoice) {
                return { className: 'option-marker is-wrong', icon: this.icon('fail') };
            }
            if (!isStudentChoice && isCorrectChoice) {
                return { className: 'option-marker is-answer', icon: this.icon('answer') };
            }
            return { className: 'option-marker is-empty', icon: '' };
        },

        init: async function () {
            const urlParams = new URLSearchParams(window.location.search);
            this.attemptId = urlParams.get('attempt_id');

            if (!this.attemptId) {
                this.showError('Invalid request. Missing attempt ID.');
                return;
            }

            await this.loadAttempt();
        },

        loadAttempt: async function () {
            try {
                const token = localStorage.getItem('access_token');
                const response = await fetch(`/api/teacher/attempts/${this.attemptId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (!response.ok) {
                    throw new Error('Failed to load attempt details');
                }

                const data = await response.json();
                this.attempt = data.attempt;
                this.questions = Array.isArray(data.questions) ? data.questions : [];
                this.renderResults();
            } catch (error) {
                console.error('Load attempt error:', error);
                this.showError(error.message || 'Failed to load attempt details');
            }
        },

        renderResults: function () {
            document.getElementById('loadingState').style.display = 'none';
            document.getElementById('resultsContent').style.display = 'block';
            document.getElementById('resultsTitle').textContent = `${this.attempt.student_name} - ${this.attempt.test_title}`;

            this.renderSummary();
            this.renderQuestions();
        },

        renderSummary: function () {
            const percentage = parseFloat(this.attempt.percentage || 0);
            const passed = percentage >= parseFloat(this.attempt.passing_score || 0);

            const badge = document.getElementById('testBadge');
            badge.className = `test-badge ${passed ? 'passed' : 'failed'}`;
            badge.innerHTML = `<span class="badge-icon" aria-hidden="true">${this.icon(passed ? 'pass' : 'fail')}</span><span>${passed ? 'Passed' : 'Failed'}</span>`;

            document.getElementById('scoreValue').textContent = `${this.attempt.score} / ${this.attempt.max_score}`;

            const percentageEl = document.getElementById('percentageValue');
            percentageEl.textContent = `${percentage.toFixed(1)}%`;
            percentageEl.className = `summary-value ${passed ? 'passed' : 'failed'}`;

            document.getElementById('timeValue').textContent = this.formatTime(this.attempt.time_spent_seconds || 0);

            const answers = this.attempt.answers || {};
            const correctCount = Object.values(answers).filter((a) => a && a.is_correct === true).length;
            document.getElementById('correctValue').textContent = `${correctCount} / ${this.questions.length}`;

            document.getElementById('studentName').textContent = this.attempt.student_name || '-';
            document.getElementById('testName').textContent = this.attempt.test_title || '-';
            document.getElementById('subjectName').textContent = this.attempt.subject_name || '-';
            document.getElementById('testDate').textContent = this.formatDate(this.attempt.submitted_at);
        },

        renderQuestions: function () {
            const container = document.getElementById('questionsContainer');
            const answers = this.attempt.answers || {};

            let html = '';
            this.questions.forEach((question, index) => {
                const answer = answers[question.id] || {};
                const isCorrect = answer.is_correct === true;
                const isWrong = answer.is_correct === false;

                if (this.currentFilter === 'correct' && !isCorrect) return;
                if (this.currentFilter === 'incorrect' && !isWrong) return;

                const statusClass = isCorrect ? 'correct' : (isWrong ? 'incorrect' : 'manual');
                const statusIcon = this.icon(isCorrect ? 'pass' : (isWrong ? 'fail' : 'manual'));
                const statusText = isCorrect ? 'Correct' : (isWrong ? 'Incorrect' : 'Manual Grading');

                html += `
                    <div class="question-review-card ${statusClass}">
                        <div class="question-review-header">
                            <div class="question-number-badge">Question ${index + 1}</div>
                            <div class="question-status ${statusClass}">
                                <span class="status-icon" aria-hidden="true">${statusIcon}</span>
                                <span>${statusText}</span>
                            </div>
                            <div class="question-marks">
                                <strong>${answer.earned_marks || 0}</strong> / ${question.marks} marks
                            </div>
                        </div>

                        <div class="question-review-body">
                            <div class="question-text">${escapeHtml(question.question_text || '')}</div>
                            ${question.media_url ? `<img src="${question.media_url}" class="question-media" alt="Question media" />` : ''}

                            <div class="answer-section">
                                ${this.renderQuestionAnswer(question, answer)}
                            </div>
                        </div>
                    </div>
                `;
            });

            container.innerHTML = html || '<div class="no-results">No questions match the current filter.</div>';
        },

        renderQuestionAnswer: function (question, answer) {
            const studentAnswer = answer ? answer.student_answer : undefined;

            switch (question.question_type) {
                case 'singlechoice':
                case 'multiplechoice':
                case 'imagebased':
                    return this.renderChoiceAnswer(question, studentAnswer);
                case 'truefalse':
                    return this.renderTrueFalseAnswer(question, studentAnswer);
                case 'shortanswer':
                    return this.renderShortAnswer(question, studentAnswer, answer?.is_correct);
                case 'fillblanks':
                    return this.renderFillBlanksAnswer(question, studentAnswer);
                case 'ordering':
                    return this.renderOrderingAnswer(question, studentAnswer);
                case 'matching':
                    return this.renderMatchingAnswer(question, studentAnswer);
                default:
                    return '<p>Answer type not supported</p>';
            }
        },

        renderChoiceAnswer: function (question, studentAnswer) {
            const options = Array.isArray(question.options) ? question.options : [];
            const correctAnswers = asArray(question.correct_answer);
            const studentAnswers = asArray(studentAnswer);

            let html = '<div class="answer-options">';
            options.forEach((option, index) => {
                const isStudentChoice = studentAnswers.includes(index);
                const isCorrectChoice = correctAnswers.includes(index);
                const marker = this.optionMarker(isStudentChoice, isCorrectChoice);

                let className = 'answer-option';
                if (isCorrectChoice) className += ' correct-option';
                if (isStudentChoice && !isCorrectChoice) className += ' wrong-option';
                if (isStudentChoice) className += ' selected';

                html += `
                    <div class="${className}">
                        <div class="${marker.className}" aria-hidden="true">${marker.icon}</div>
                        <div class="option-text">${escapeHtml(option)}</div>
                    </div>
                `;
            });
            html += '</div>';
            return html;
        },

        renderTrueFalseAnswer: function (question, studentAnswer) {
            const studentValue = String(studentAnswer);
            const correctValue = String(question.correct_answer);
            const trueMarker = this.optionMarker(studentValue === 'true', correctValue === 'true');
            const falseMarker = this.optionMarker(studentValue === 'false', correctValue === 'false');

            return `
                <div class="answer-options">
                    <div class="answer-option ${correctValue === 'true' ? 'correct-option' : ''} ${studentValue === 'true' ? (correctValue === 'true' ? 'selected' : 'wrong-option selected') : ''}">
                        <div class="${trueMarker.className}" aria-hidden="true">${trueMarker.icon}</div>
                        <div class="option-text">True</div>
                    </div>
                    <div class="answer-option ${correctValue === 'false' ? 'correct-option' : ''} ${studentValue === 'false' ? (correctValue === 'false' ? 'selected' : 'wrong-option selected') : ''}">
                        <div class="${falseMarker.className}" aria-hidden="true">${falseMarker.icon}</div>
                        <div class="option-text">False</div>
                    </div>
                </div>
            `;
        },

        renderShortAnswer: function (question, studentAnswer, isCorrect) {
            const correctAnswers = asArray(question.correct_answer);
            return `
                <div class="answer-text-display">
                    <div class="answer-label">Student Answer:</div>
                    <div class="answer-value ${isCorrect ? 'correct-answer' : 'wrong-answer'}">
                        ${studentAnswer ? escapeHtml(studentAnswer) : '<em>Not answered</em>'}
                    </div>
                </div>
                <div class="answer-text-display">
                    <div class="answer-label">Correct Answer${correctAnswers.length > 1 ? 's' : ''}:</div>
                    <div class="answer-value correct-answer">
                        ${correctAnswers.map((value) => escapeHtml(value)).join(' <strong>or</strong> ')}
                    </div>
                </div>
            `;
        },

        renderFillBlanksAnswer: function (question, studentAnswer) {
            const correctAnswers = asArray(question.correct_answer);
            const studentAnswers = asArray(studentAnswer);

            let html = '<div class="blanks-review">';
            correctAnswers.forEach((correct, index) => {
                const student = studentAnswers[index] || '';
                const isBlankCorrect = String(correct).toLowerCase().trim() === String(student).toLowerCase().trim();

                html += `
                    <div class="blank-review-item">
                        <div class="blank-label">Blank ${index + 1}:</div>
                        <div class="blank-answers">
                            <div class="blank-answer ${isBlankCorrect ? 'correct-answer' : 'wrong-answer'}">
                                <strong>Student answer:</strong> ${student ? escapeHtml(student) : '<em>Empty</em>'}
                            </div>
                            ${!isBlankCorrect ? `
                                <div class="blank-answer correct-answer">
                                    <strong>Correct answer:</strong> ${escapeHtml(correct)}
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
            const items = Array.isArray(question.options) ? question.options : [];
            const correctOrder = asArray(question.correct_answer);
            const studentOrder = asArray(studentAnswer);

            let html = '<div class="ordering-review">';
            html += '<div class="ordering-column"><h4>Student Order:</h4>';
            studentOrder.forEach((itemIndex, position) => {
                const isInCorrectPosition = correctOrder[position] === itemIndex;
                html += `
                    <div class="ordering-review-item ${isInCorrectPosition ? 'correct-position' : 'wrong-position'}">
                        <span class="position-number">${position + 1}</span>
                        <span>${escapeHtml(items[itemIndex] || '')}</span>
                        <span class="result-icon ${isInCorrectPosition ? 'ok' : 'bad'}" aria-hidden="true">${this.icon(isInCorrectPosition ? 'pass' : 'fail')}</span>
                    </div>
                `;
            });
            html += '</div>';

            html += '<div class="ordering-column"><h4>Correct Order:</h4>';
            correctOrder.forEach((itemIndex, position) => {
                html += `
                    <div class="ordering-review-item correct-position">
                        <span class="position-number">${position + 1}</span>
                        <span>${escapeHtml(items[itemIndex] || '')}</span>
                    </div>
                `;
            });
            html += '</div></div>';
            return html;
        },

        renderMatchingAnswer: function (question, studentAnswer) {
            const pairs = Array.isArray(question.options) ? question.options : [];
            const correctMatches = asArray(question.correct_answer);
            const studentMatches = asArray(studentAnswer);
            const rightItems = pairs.map((p) => p.right);

            let html = '<div class="matching-review">';
            pairs.forEach((pair, index) => {
                const studentMatch = studentMatches[index];
                const correctMatch = correctMatches[index];
                const isMatchCorrect = studentMatch === correctMatch;

                const studentMatchText = (studentMatch !== null && studentMatch !== undefined && rightItems[studentMatch] !== undefined)
                    ? rightItems[studentMatch]
                    : 'Not matched';
                const correctMatchText = rightItems[correctMatch] || '';

                html += `
                    <div class="matching-review-item">
                        <div class="matching-left">${escapeHtml(pair.left)}</div>
                        <div class="matching-center">
                            <div class="matching-student ${isMatchCorrect ? 'correct-match' : 'wrong-match'}">
                                Student match: <strong>${escapeHtml(studentMatchText)}</strong>
                                <span class="result-icon ${isMatchCorrect ? 'ok' : 'bad'}" aria-hidden="true">${this.icon(isMatchCorrect ? 'pass' : 'fail')}</span>
                            </div>
                            ${!isMatchCorrect ? `
                                <div class="matching-correct">
                                    Correct: <strong>${escapeHtml(correctMatchText)}</strong>
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
            document.querySelectorAll('.filter-btn').forEach((btn) => {
                btn.classList.toggle('active', btn.dataset.filter === filter);
            });
            this.renderQuestions();
        },

        formatTime: function (seconds) {
            const minutes = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${minutes}m ${secs}s`;
        },

        formatDate: function (dateString) {
            const date = new Date(dateString);
            if (Number.isNaN(date.getTime())) return '-';
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            return `${day}.${month}.${year} ${hours}:${minutes}`;
        },

        showError: function (message) {
            document.getElementById('loadingState').style.display = 'none';
            document.getElementById('resultsContent').style.display = 'none';
            document.getElementById('errorState').style.display = 'flex';
            document.getElementById('errorMessage').textContent = message;
        }
    };

    document.addEventListener('DOMContentLoaded', () => {
        window.AttemptViewer.init();
    });
})();
