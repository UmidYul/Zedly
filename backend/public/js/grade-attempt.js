// Grade Attempt Page
(function () {
    'use strict';

    window.GradeAttempt = {
        attemptId: null,
        attempt: null,
        questions: [],
        essayQuestions: [],

        // Initialize
        init: async function () {
            // Get attempt ID from URL
            const urlParams = new URLSearchParams(window.location.search);
            this.attemptId = urlParams.get('attempt_id');

            if (!this.attemptId) {
                this.showError('Invalid request. Missing attempt ID.');
                return;
            }

            // Load attempt
            await this.loadAttempt();
        },

        // Load attempt
        loadAttempt: async function () {
            try {
                const token = localStorage.getItem('access_token');
                const response = await fetch(`/api/teacher/attempts/${this.attemptId}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!response.ok) {
                    throw new Error('Failed to load attempt');
                }

                const data = await response.json();
                this.attempt = data.attempt;
                this.questions = data.questions;

                // Filter essay questions
                this.essayQuestions = this.questions.filter(q => q.question_type === 'essay');

                if (this.essayQuestions.length === 0) {
                    this.showError('No essay questions found in this attempt.');
                    return;
                }

                // Render page
                this.renderPage();

            } catch (error) {
                console.error('Load attempt error:', error);
                this.showError(error.message || 'Failed to load attempt');
            }
        },

        // Render page
        renderPage: function () {
            // Hide loading
            document.getElementById('loadingState').style.display = 'none';
            document.getElementById('resultsContent').style.display = 'block';

            // Update title
            document.getElementById('resultsTitle').textContent = `Grade: ${this.attempt.student_name}`;

            // Update info
            document.getElementById('studentName').textContent = this.attempt.student_name;
            document.getElementById('testName').textContent = this.attempt.test_title;
            document.getElementById('testDate').textContent = this.formatDateTime(this.attempt.submitted_at);
            document.getElementById('currentScore').textContent = `${this.attempt.score} / ${this.attempt.max_score}`;

            // Render essay questions
            this.renderEssayQuestions();
        },

        // Render essay questions
        renderEssayQuestions: function () {
            const container = document.getElementById('questionsContainer');
            const answers = this.attempt.answers || {};

            let html = '';

            this.essayQuestions.forEach((question, index) => {
                const answer = answers[question.id];
                const studentAnswer = answer?.student_answer || '';
                const earnedMarks = answer?.earned_marks;
                const feedback = answer?.feedback || '';
                const isGraded = answer?.is_correct !== null;

                html += `
                    <div class="grading-card ${isGraded ? 'graded' : ''}" id="question-${question.id}">
                        <div class="grading-header">
                            <div class="question-number-badge">Essay Question ${index + 1}</div>
                            <div class="question-marks-info">
                                <strong>Maximum Marks:</strong> ${question.marks}
                            </div>
                        </div>

                        <div class="grading-body">
                            <div class="question-text">${question.question_text}</div>
                            ${question.media_url ? `<img src="${question.media_url}" class="question-media" alt="Question media" />` : ''}

                            <div class="essay-answer-section">
                                <div class="essay-label">Student's Answer:</div>
                                <div class="essay-content">${studentAnswer || '<em>No answer provided</em>'}</div>
                            </div>

                            <div class="grading-form">
                                <div class="grading-input-group">
                                    <label for="marks-${question.id}">Earned Marks:</label>
                                    <input
                                        type="number"
                                        id="marks-${question.id}"
                                        class="grading-input"
                                        min="0"
                                        max="${question.marks}"
                                        step="0.5"
                                        value="${earnedMarks !== undefined && earnedMarks !== null ? earnedMarks : ''}"
                                        placeholder="Enter marks (0-${question.marks})"
                                    />
                                </div>

                                <div class="grading-input-group">
                                    <label for="feedback-${question.id}">Feedback (Optional):</label>
                                    <textarea
                                        id="feedback-${question.id}"
                                        class="grading-textarea"
                                        rows="3"
                                        placeholder="Provide feedback to the student..."
                                    >${feedback}</textarea>
                                </div>

                                <div class="grading-actions">
                                    <button class="btn btn-primary" onclick="GradeAttempt.saveGrade(${question.id}, ${question.marks})">
                                        Save Grade
                                    </button>
                                    ${isGraded ? '<span class="graded-badge">✓ Graded</span>' : ''}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            });

            container.innerHTML = html;
        },

        // Save grade for a question
        saveGrade: async function (questionId, maxMarks) {
            try {
                const marksInput = document.getElementById(`marks-${questionId}`);
                const feedbackInput = document.getElementById(`feedback-${questionId}`);

                const earnedMarks = parseFloat(marksInput.value);
                const feedback = feedbackInput.value.trim();

                // Validation
                if (isNaN(earnedMarks)) {
                    alert('Please enter valid marks');
                    return;
                }

                if (earnedMarks < 0 || earnedMarks > maxMarks) {
                    alert(`Marks must be between 0 and ${maxMarks}`);
                    return;
                }

                // Save grade
                const token = localStorage.getItem('access_token');
                const response = await fetch(`/api/teacher/grading/${this.attemptId}/question/${questionId}`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        earned_marks: earnedMarks,
                        feedback: feedback
                    })
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.message || 'Failed to save grade');
                }

                const data = await response.json();

                // Update UI
                const questionCard = document.getElementById(`question-${questionId}`);
                questionCard.classList.add('graded');

                // Update score in header
                document.getElementById('currentScore').textContent = `${data.score} / ${data.max_score}`;

                // Show success notification
                this.showSaveNotification();

                // Update attempt data
                this.attempt.score = data.score;
                this.attempt.percentage = data.percentage;

            } catch (error) {
                console.error('Save grade error:', error);
                alert(error.message || 'Failed to save grade');
            }
        },

        // Show save notification
        showSaveNotification: function () {
            const notification = document.getElementById('saveNotification');
            notification.classList.add('show');

            setTimeout(() => {
                notification.classList.remove('show');
            }, 2000);
        },

        // Format date and time
        formatDateTime: function (dateString) {
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
        GradeAttempt.init();
    });
})();
