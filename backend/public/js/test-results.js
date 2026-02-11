// Test Results Viewer
(function () {
    'use strict';

    window.ResultsViewer = {
        attemptId: null,
        assignmentId: null,
        attempt: null,
        questions: [],
        currentFilter: 'all',

        // Initialize results viewer
        init: async function () {
            // Get IDs from URL
            const urlParams = new URLSearchParams(window.location.search);
            this.attemptId = urlParams.get('attempt_id');
            this.assignmentId = urlParams.get('assignment_id');

            if (!this.attemptId && !this.assignmentId) {
                this.showError('Invalid request. Missing attempt or assignment ID.');
                return;
            }

            // Load results
            await this.loadResults();
        },

        // Load results from API
        loadResults: async function () {
            try {
                const token = localStorage.getItem('access_token');
                let url;

                if (this.attemptId) {
                    // Load specific attempt
                    url = `/api/student/attempts/${this.attemptId}`;
                } else {
                    // Load best attempt for assignment
                    url = `/api/student/assignments/${this.assignmentId}`;
                }

                const response = await fetch(url, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!response.ok) {
                    throw new Error('Failed to load results');
                }

                const data = await response.json();

                if (this.attemptId) {
                    this.attempt = data.attempt;
                    this.questions = data.questions;
                } else {
                    // Get best attempt from attempts list
                    const attempts = (data.attempts || []).filter(item => item.is_completed);
                    if (attempts.length === 0) {
                        throw new Error('No completed attempts found');
                    }
                    // Get the attempt with highest score
                    const bestAttempt = attempts.reduce((best, current) =>
                        current.percentage > best.percentage ? current : best
                    );

                    // Load that specific attempt
                    const attemptResponse = await fetch(`/api/student/attempts/${bestAttempt.id}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const attemptData = await attemptResponse.json();
                    this.attempt = attemptData.attempt;
                    this.questions = attemptData.questions;
                }

                // Check if completed
                if (!this.attempt.is_completed) {
                    this.showError('This test has not been completed yet.');
                    return;
                }

                // Render results
                this.renderResults();

            } catch (error) {
                console.error('Load results error:', error);
                this.showError(error.message || 'Failed to load test results');
            }
        },

        // Render results
        renderResults: function () {
            // Hide loading, show content
            document.getElementById('loadingState').style.display = 'none';
            document.getElementById('resultsContent').style.display = 'block';

            // Update title
            document.getElementById('resultsTitle').textContent = `${this.attempt.test_title} - Results`;

            // Render summary
            this.renderSummary();

            // Render questions
            this.renderQuestions();
        },

        // Render summary card
        renderSummary: function () {
            const percentage = parseFloat(this.attempt.percentage);
            const answers = this.attempt.answers || {};

            // Check if there are any ungraded questions
            const hasUngradedQuestions = Object.values(answers).some(a => a.is_correct === null);

            const passed = percentage >= this.attempt.passing_score;

            // Badge
            const badge = document.getElementById('testBadge');
            if (hasUngradedQuestions) {
                badge.className = 'test-badge pending';
                badge.textContent = '⏳ Pending Review';
            } else {
                badge.className = `test-badge ${passed ? 'passed' : 'failed'}`;
                badge.textContent = passed ? '✓ Passed' : '✗ Failed';
            }

            // Score
            document.getElementById('scoreValue').textContent = `${this.attempt.score} / ${this.attempt.max_score}`;

            // Percentage
            const percentageEl = document.getElementById('percentageValue');
            percentageEl.textContent = `${percentage.toFixed(1)}%`;
            if (hasUngradedQuestions) {
                percentageEl.className = 'summary-value pending';
            } else {
                percentageEl.className = 'summary-value ' + (passed ? 'passed' : 'failed');
            }

            // Time
            const timeSpent = this.formatTime(this.attempt.time_spent_seconds);
            document.getElementById('timeValue').textContent = timeSpent;

            // Correct answers
            const correctCount = Object.values(answers).filter(a => a.is_correct === true).length;
            const totalQuestions = this.questions.length;
            document.getElementById('correctValue').textContent = `${correctCount} / ${totalQuestions}`;

            // Test info
            document.getElementById('testName').textContent = this.attempt.test_title;
            document.getElementById('subjectName').textContent = this.attempt.subject_name || '-';
            document.getElementById('testDate').textContent = this.formatDate(this.attempt.submitted_at);
        },

        // Render questions
        renderQuestions: function () {
            const container = document.getElementById('questionsContainer');
            const answers = this.attempt.answers || {};

            let html = '';
            this.questions.forEach((question, index) => {
                const answer = answers[question.id];
                const isCorrect = answer?.is_correct === true;
                const isWrong = answer?.is_correct === false;
                const isManual = answer?.is_correct === null;

                // Apply filter
                if (this.currentFilter === 'correct' && !isCorrect) return;
                if (this.currentFilter === 'incorrect' && !isWrong) return;

                const statusClass = isCorrect ? 'correct' : (isWrong ? 'incorrect' : 'manual');
                const statusIcon = isCorrect ? '✓' : (isWrong ? '✗' : '⏳');
                const statusText = isCorrect ? 'Correct' : (isWrong ? 'Incorrect' : 'Pending Review');

                html += `
                    <div class="question-review-card ${statusClass}">
                        <div class="question-review-header">
                            <div class="question-number-badge">Question ${index + 1}</div>
                            <div class="question-status ${statusClass}">
                                <span class="status-icon">${statusIcon}</span>
                                <span>${statusText}</span>
                            </div>
                            <div class="question-marks">
                                <strong>${answer?.earned_marks || 0}</strong> / ${question.marks} marks
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
                html = '<div class="no-results">No questions match the current filter.</div>';
            }

            container.innerHTML = html;
        },

        // Render answer based on question type
        renderQuestionAnswer: function (question, answer) {
            const studentAnswer = answer?.student_answer;
            const isCorrect = answer?.is_correct ?? null;

            switch (question.question_type) {
                case 'singlechoice':
                case 'multiplechoice':
                    return this.renderChoiceAnswer(question, studentAnswer, isCorrect);

                case 'truefalse':
                    return this.renderTrueFalseAnswer(question, studentAnswer, isCorrect);

                case 'shortanswer':
                    return this.renderShortAnswer(question, studentAnswer, isCorrect);

                case 'fillblanks':
                    return this.renderFillBlanksAnswer(question, studentAnswer, isCorrect);

                case 'ordering':
                    return this.renderOrderingAnswer(question, studentAnswer, isCorrect);

                case 'matching':
                    return this.renderMatchingAnswer(question, studentAnswer, isCorrect);

                case 'imagebased':
                    return this.renderChoiceAnswer(question, studentAnswer, isCorrect);

                default:
                    return '<p>Answer type not supported</p>';
            }
        },

        // Render choice answer
        renderChoiceAnswer: function (question, studentAnswer, isCorrect) {
            const options = question.options || [];
            const correctAnswer = question.correct_answer;
            const isMultiple = question.question_type === 'multiplechoice';
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

        // Render true/false answer
        renderTrueFalseAnswer: function (question, studentAnswer, isCorrect) {
            const correctAnswer = question.correct_answer;
            const studentValue = String(studentAnswer);
            const correctValue = String(correctAnswer);

            return `
                <div class="answer-options">
                    <div class="answer-option ${correctValue === 'true' ? 'correct-option' : ''} ${studentValue === 'true' ? (correctValue === 'true' ? 'selected' : 'wrong-option selected') : ''}">
                        <div class="option-marker">${studentValue === 'true' ? (correctValue === 'true' ? '✓' : '✗') : (correctValue === 'true' ? '→' : '')}</div>
                        <div class="option-text">True</div>
                    </div>
                    <div class="answer-option ${correctValue === 'false' ? 'correct-option' : ''} ${studentValue === 'false' ? (correctValue === 'false' ? 'selected' : 'wrong-option selected') : ''}">
                        <div class="option-marker">${studentValue === 'false' ? (correctValue === 'false' ? '✓' : '✗') : (correctValue === 'false' ? '→' : '')}</div>
                        <div class="option-text">False</div>
                    </div>
                </div>
            `;
        },

        // Render short answer
        renderShortAnswer: function (question, studentAnswer, isCorrect) {
            const correctAnswers = Array.isArray(question.correct_answer) ? question.correct_answer : [question.correct_answer];

            return `
                <div class="answer-text-display">
                    <div class="answer-label">Your Answer:</div>
                    <div class="answer-value ${isCorrect ? 'correct-answer' : 'wrong-answer'}">
                        ${studentAnswer || '<em>Not answered</em>'}
                    </div>
                </div>
                <div class="answer-text-display">
                    <div class="answer-label">Correct Answer${correctAnswers.length > 1 ? 's' : ''}:</div>
                    <div class="answer-value correct-answer">
                        ${correctAnswers.join(' <strong>or</strong> ')}
                    </div>
                </div>
            `;
        },


        // Render fill blanks answer
        renderFillBlanksAnswer: function (question, studentAnswer, isCorrect) {
            const correctAnswers = Array.isArray(question.correct_answer) ? question.correct_answer : [];
            const studentAnswers = Array.isArray(studentAnswer) ? studentAnswer : [];

            let html = '<div class="blanks-review">';
            correctAnswers.forEach((correct, index) => {
                const student = studentAnswers[index] || '';
                const isBlankCorrect = String(correct).toLowerCase().trim() === String(student).toLowerCase().trim();

                html += `
                    <div class="blank-review-item">
                        <div class="blank-label">Blank ${index + 1}:</div>
                        <div class="blank-answers">
                            <div class="blank-answer ${isBlankCorrect ? 'correct-answer' : 'wrong-answer'}">
                                <strong>Your answer:</strong> ${student || '<em>Empty</em>'}
                            </div>
                            ${!isBlankCorrect ? `
                                <div class="blank-answer correct-answer">
                                    <strong>Correct answer:</strong> ${correct}
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `;
            });
            html += '</div>';

            return html;
        },

        // Render ordering answer
        renderOrderingAnswer: function (question, studentAnswer, isCorrect) {
            const items = question.options || [];
            const correctOrder = Array.isArray(question.correct_answer) ? question.correct_answer : [];
            const studentOrder = Array.isArray(studentAnswer) ? studentAnswer : [];

            let html = '<div class="ordering-review">';
            html += '<div class="ordering-column"><h4>Your Order:</h4>';
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

            html += '<div class="ordering-column"><h4>Correct Order:</h4>';
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

        // Render matching answer
        renderMatchingAnswer: function (question, studentAnswer, isCorrect) {
            const pairs = question.options || [];
            const correctMatches = Array.isArray(question.correct_answer) ? question.correct_answer : [];
            const studentMatches = Array.isArray(studentAnswer) ? studentAnswer : [];

            // Extract all right items into an array
            const rightItems = pairs.map(p => p.right);

            let html = '<div class="matching-review">';
            pairs.forEach((pair, index) => {
                const studentMatch = studentMatches[index];
                const correctMatch = correctMatches[index];
                const isMatchCorrect = studentMatch === correctMatch;

                // Get the text for student's match and correct match
                const studentMatchText = studentMatch !== null && studentMatch !== undefined
                    ? rightItems[studentMatch]
                    : 'Not matched';
                const correctMatchText = rightItems[correctMatch];

                html += `
                    <div class="matching-review-item">
                        <div class="matching-left">${pair.left}</div>
                        <div class="matching-center">
                            <div class="matching-student ${isMatchCorrect ? 'correct-match' : 'wrong-match'}">
                                Your match: <strong>${studentMatchText}</strong>
                                ${isMatchCorrect ? '✓' : '✗'}
                            </div>
                            ${!isMatchCorrect ? `
                                <div class="matching-correct">
                                    Correct: <strong>${correctMatchText}</strong>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `;
            });
            html += '</div>';

            return html;
        },

        // Filter questions
        filterQuestions: function (filter) {
            this.currentFilter = filter;

            // Update active button
            document.querySelectorAll('.filter-btn').forEach(btn => {
                btn.classList.remove('active');
                if (btn.dataset.filter === filter) {
                    btn.classList.add('active');
                }
            });

            // Re-render questions
            this.renderQuestions();
        },

        // Format time
        formatTime: function (seconds) {
            const minutes = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${minutes}m ${secs}s`;
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

        // Show error
        showError: function (message) {
            document.getElementById('loadingState').style.display = 'none';
            document.getElementById('resultsContent').style.display = 'none';
            document.getElementById('errorState').style.display = 'flex';
            document.getElementById('errorMessage').textContent = message;
        }
    };

    // Initialize on load
    document.addEventListener('DOMContentLoaded', () => {
        ResultsViewer.init();
    });
})();
