// Student History Page
(function () {
    'use strict';

    const API_URL = '/api';
    let currentUser = null;
    let attempts = [];
    let subjects = [];
    let performanceChart = null;

    // Filters
    let selectedSubject = '';
    let selectedStatus = '';
    let sortBy = 'date_desc';

    // Pagination
    let currentPage = 1;
    const itemsPerPage = 10;

    // Initialize
    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        try {
            // Get current user
            currentUser = await fetchCurrentUser();

            // Check if user is student
            if (currentUser.role !== 'student') {
                alert('У вас нет доступа к этой странице');
                window.location.href = 'dashboard.html';
                return;
            }

            // Setup event listeners
            setupEventListeners();

            // Load data
            await loadInitialData();
        } catch (error) {
            console.error('Error initializing:', error);
            showError('Ошибка инициализации страницы');
        }
    }

    // Fetch current user
    async function fetchCurrentUser() {
        const response = await fetch(`${API_URL}/auth/me`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch user');
        }

        return await response.json();
    }

    // Setup event listeners
    function setupEventListeners() {
        // Subject filter
        document.getElementById('subjectFilter').addEventListener('change', (e) => {
            selectedSubject = e.target.value;
            currentPage = 1;
            renderHistory();
        });

        // Status filter
        document.getElementById('statusFilter').addEventListener('change', (e) => {
            selectedStatus = e.target.value;
            currentPage = 1;
            renderHistory();
        });

        // Sort
        document.getElementById('sortBy').addEventListener('change', (e) => {
            sortBy = e.target.value;
            currentPage = 1;
            renderHistory();
        });
    }

    // Load initial data
    async function loadInitialData() {
        try {
            // Load attempts
            await loadAttempts();

            // Load subjects for filter
            await loadSubjects();

            // Update stats
            updateStats();

            // Render chart
            renderPerformanceChart();

            // Render history table
            renderHistory();
        } catch (error) {
            console.error('Error loading initial data:', error);
            showError('Ошибка загрузки данных');
        }
    }

    // Load attempts
    async function loadAttempts() {
        try {
            const response = await fetch(`${API_URL}/student/attempts`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch attempts');
            }

            const data = await response.json();
            attempts = data.attempts || [];
        } catch (error) {
            console.error('Error loading attempts:', error);
            attempts = [];
        }
    }

    // Load subjects
    async function loadSubjects() {
        try {
            // Extract unique subjects from attempts
            const subjectMap = new Map();
            attempts.forEach(attempt => {
                if (attempt.subject_name && !subjectMap.has(attempt.subject_id)) {
                    subjectMap.set(attempt.subject_id, attempt.subject_name);
                }
            });

            subjects = Array.from(subjectMap, ([id, name]) => ({ id, name }));

            // Populate subject filter
            const subjectFilter = document.getElementById('subjectFilter');
            subjectFilter.innerHTML = `<option value="" data-i18n="studentHistory.allSubjects">Все предметы</option>`;

            subjects.forEach(subject => {
                const option = document.createElement('option');
                option.value = subject.id;
                option.textContent = subject.name;
                subjectFilter.appendChild(option);
            });
        } catch (error) {
            console.error('Error loading subjects:', error);
        }
    }

    // Update stats
    function updateStats() {
        const completedAttempts = attempts.filter(a => a.status === 'completed');
        const totalScore = completedAttempts.reduce((sum, a) => sum + (a.score || 0), 0);
        const avgScore = completedAttempts.length > 0 ? (totalScore / completedAttempts.length).toFixed(1) : 0;

        document.getElementById('totalAttempts').textContent = attempts.length;
        document.getElementById('completedTests').textContent = completedAttempts.length;
        document.getElementById('avgScore').textContent = `${avgScore}%`;
        document.getElementById('classRank').textContent = '-'; // TODO: Implement class ranking
    }

    // Render performance chart
    function renderPerformanceChart() {
        const ctx = document.getElementById('performanceChart');

        if (performanceChart) {
            performanceChart.destroy();
        }

        // Group attempts by subject
        const subjectScores = new Map();

        attempts
            .filter(a => a.status === 'completed' && a.score !== null)
            .forEach(attempt => {
                const subjectName = attempt.subject_name || 'Неизвестный предмет';
                if (!subjectScores.has(subjectName)) {
                    subjectScores.set(subjectName, []);
                }
                subjectScores.get(subjectName).push(attempt.score);
            });

        // Calculate average scores
        const labels = [];
        const data = [];

        subjectScores.forEach((scores, subject) => {
            const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
            labels.push(subject);
            data.push(avgScore);
        });

        // If no data, show placeholder
        if (labels.length === 0) {
            labels.push('Нет данных');
            data.push(0);
        }

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        performanceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: i18n.translate('profile.avgScore'),
                    data: data,
                    borderColor: 'rgb(74, 144, 226)',
                    backgroundColor: 'rgba(74, 144, 226, 0.1)',
                    tension: 0.4,
                    fill: true,
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    pointBackgroundColor: 'rgb(74, 144, 226)',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: isDark ? '#2d3748' : '#fff',
                        titleColor: isDark ? '#fff' : '#2d3748',
                        bodyColor: isDark ? '#fff' : '#2d3748',
                        borderColor: isDark ? '#4a5568' : '#e2e8f0',
                        borderWidth: 1,
                        padding: 12,
                        displayColors: false,
                        callbacks: {
                            label: function (context) {
                                return ` ${context.parsed.y.toFixed(1)}%`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            color: isDark ? '#a0aec0' : '#4a5568',
                            callback: function (value) {
                                return value + '%';
                            }
                        },
                        grid: {
                            color: isDark ? '#2d3748' : '#e2e8f0'
                        }
                    },
                    x: {
                        ticks: {
                            color: isDark ? '#a0aec0' : '#4a5568'
                        },
                        grid: {
                            color: isDark ? '#2d3748' : '#e2e8f0'
                        }
                    }
                }
            }
        });
    }

    // Render history table
    function renderHistory() {
        const tbody = document.getElementById('historyTableBody');

        // Filter attempts
        let filteredAttempts = attempts.filter(attempt => {
            if (selectedSubject && attempt.subject_id !== parseInt(selectedSubject)) {
                return false;
            }
            if (selectedStatus && attempt.status !== selectedStatus) {
                return false;
            }
            return true;
        });

        // Sort attempts
        filteredAttempts.sort((a, b) => {
            switch (sortBy) {
                case 'date_desc':
                    return new Date(b.started_at) - new Date(a.started_at);
                case 'date_asc':
                    return new Date(a.started_at) - new Date(b.started_at);
                case 'score_desc':
                    return (b.score || 0) - (a.score || 0);
                case 'score_asc':
                    return (a.score || 0) - (b.score || 0);
                default:
                    return 0;
            }
        });

        // Pagination
        const totalPages = Math.ceil(filteredAttempts.length / itemsPerPage);
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const paginatedAttempts = filteredAttempts.slice(startIndex, endIndex);

        // Render rows
        if (paginatedAttempts.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6">
                        <div class="empty-state">
                            <div class="empty-state-icon">📝</div>
                            <div class="empty-state-title" data-i18n="studentHistory.noAttempts">История пуста</div>
                            <div class="empty-state-desc" data-i18n="studentHistory.startTaking">Начните проходить тесты, чтобы увидеть свою историю</div>
                        </div>
                    </td>
                </tr>
            `;
        } else {
            tbody.innerHTML = paginatedAttempts.map(attempt => `
                <tr>
                    <td>${attempt.test_title || 'Неизвестный тест'}</td>
                    <td>${attempt.subject_name || '-'}</td>
                    <td>${formatDate(attempt.started_at)}</td>
                    <td>
                        ${attempt.status === 'completed' && attempt.score !== null
                    ? `<span class="score-badge ${getScoreClass(attempt.score)}">${attempt.score}%</span>`
                    : '-'}
                    </td>
                    <td>
                        <span class="status-badge ${attempt.status}">
                            ${getStatusText(attempt.status)}
                        </span>
                    </td>
                    <td>
                        ${attempt.status === 'completed'
                    ? `<button class="btn-view" onclick="viewResults('${attempt.id}')">
                                <span>👁️</span>
                                <span data-i18n="studentHistory.viewResults">Результаты</span>
                               </button>`
                    : `<button class="btn-continue" onclick="continueTest('${attempt.id}')">
                                <span>▶️</span>
                                <span data-i18n="studentHistory.continue">Продолжить</span>
                               </button>`
                }
                    </td>
                </tr>
            `).join('');
        }

        // Render pagination
        renderPagination(totalPages);

        // Re-translate
        if (window.i18n) {
            window.i18n.translate();
        }
    }

    // Render pagination
    function renderPagination(totalPages) {
        const pagination = document.getElementById('pagination');

        if (totalPages <= 1) {
            pagination.style.display = 'none';
            return;
        }

        pagination.style.display = 'flex';

        const prevBtn = `
            <button ${currentPage === 1 ? 'disabled' : ''} onclick="changePage(${currentPage - 1})">
                ← ${i18n.translate('common.prev', getCurrentLang())}
            </button>
        `;

        const nextBtn = `
            <button ${currentPage === totalPages ? 'disabled' : ''} onclick="changePage(${currentPage + 1})">
                ${i18n.translate('common.next', getCurrentLang())} →
            </button>
        `;

        const pageInfo = `
            <div class="page-info">
                ${i18n.translate('common.page', getCurrentLang())} ${currentPage} ${i18n.translate('common.of', getCurrentLang())} ${totalPages}
            </div>
        `;

        pagination.innerHTML = prevBtn + pageInfo + nextBtn;
    }

    // Change page
    window.changePage = function (page) {
        currentPage = page;
        renderHistory();
    };

    // View results
    window.viewResults = function (attemptId) {
        window.location.href = `test-results.html?attempt=${attemptId}`;
    };

    // Continue test
    window.continueTest = function (attemptId) {
        window.location.href = `take-test.html?attempt=${attemptId}`;
    };

    // Utility functions
    function formatDate(dateString) {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function getScoreClass(score) {
        if (score >= 90) return 'excellent';
        if (score >= 75) return 'good';
        if (score >= 60) return 'average';
        return 'poor';
    }

    function getStatusText(status) {
        const statuses = {
            'completed': 'Завершено',
            'in_progress': 'В процессе',
            'abandoned': 'Прервано'
        };
        return statuses[status] || status;
    }

    function getCurrentLang() {
        return localStorage.getItem('zedly-lang') || 'ru';
    }

    function showError(message) {
        alert(message); // TODO: Replace with proper notification system
    }

    // Re-render chart on theme change
    document.addEventListener('themeChanged', () => {
        if (performanceChart) renderPerformanceChart();
    });
})();
