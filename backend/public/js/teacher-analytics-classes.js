// Teacher Analytics - My Classes
(function () {
    'use strict';

    const API_URL = '/api';
    let currentUser = null;
    let classes = [];
    let subjects = [];
    let selectedClassId = '';
    let selectedSubjectId = '';
    let students = [];
    let subjectPerformance = [];
    let assignmentPerformance = [];
    let performanceChart = null;
    let topicsChart = null;

    // Pagination
    let currentPage = 1;
    const itemsPerPage = 10;

    // Initialize
    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        try {
            // Get current user
            currentUser = await fetchCurrentUser();

            // Check if user is teacher
            if (currentUser.role !== 'teacher' && currentUser.role !== 'school_admin') {
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
                'Authorization': `Bearer ${localStorage.getItem('access_token')}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch user');
        }

        return await response.json();
    }

    // Setup event listeners
    function setupEventListeners() {
        // Class filter
        document.getElementById('classFilter').addEventListener('change', (e) => {
            selectedClassId = e.target.value;
            refreshAnalytics();
        });

        // Subject filter
        document.getElementById('subjectFilter').addEventListener('change', (e) => {
            selectedSubjectId = e.target.value;
            refreshAnalytics();
        });

        // Student search
        document.getElementById('studentSearch').addEventListener('input', (e) => {
            currentPage = 1;
            renderStudentsTable();
        });
    }

    // Load initial data
    async function loadInitialData() {
        try {
            // Load teacher's classes
            await loadClasses();

            // Load teacher's subjects
            await loadSubjects();

            // Load analytics
            await refreshAnalytics();
        } catch (error) {
            console.error('Error loading initial data:', error);
            showError('Ошибка загрузки данных');
        }
    }

    // Load classes
    async function loadClasses() {
        try {
            const response = await fetch(`${API_URL}/teacher/classes`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('access_token')}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch classes');
            }

            const data = await response.json();
            classes = data.classes || [];

            // Populate class filter
            const classFilter = document.getElementById('classFilter');
            classFilter.innerHTML = `<option value="" data-i18n="teacherAnalytics.allClasses">Все классы</option>`;

            classes.forEach(cls => {
                const option = document.createElement('option');
                option.value = cls.id;
                option.textContent = cls.name;
                classFilter.appendChild(option);
            });
        } catch (error) {
            console.error('Error loading classes:', error);
            throw error;
        }
    }

    // Load subjects
    async function loadSubjects() {
        try {
            const response = await fetch(`${API_URL}/teacher/subjects`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('access_token')}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch subjects');
            }

            const data = await response.json();
            subjects = data.subjects || [];

            // Populate subject filter
            const subjectFilter = document.getElementById('subjectFilter');
            subjectFilter.innerHTML = `<option value="" data-i18n="teacherAnalytics.allSubjects">Все предметы</option>`;

            subjects.forEach(subject => {
                const option = document.createElement('option');
                option.value = subject.id;
                option.textContent = getCurrentLang() === 'ru' ? subject.name_ru : subject.name_uz;
                subjectFilter.appendChild(option);
            });
        } catch (error) {
            console.error('Error loading subjects:', error);
            throw error;
        }
    }

    // Refresh analytics
    async function refreshAnalytics() {
        try {
            await loadAnalytics();

            // Render charts
            renderPerformanceChart();
            renderTopicsChart();

            // Render table
            renderStudentsTable();
        } catch (error) {
            console.error('Error refreshing analytics:', error);
            showError('Ошибка обновления аналитики');
        }
    }

    // Load analytics
    async function loadAnalytics() {
        try {
            if (!selectedClassId) {
                students = [];
                subjectPerformance = [];
                assignmentPerformance = [];
                return;
            }

            const params = new URLSearchParams();
            if (selectedSubjectId) {
                params.set('subject_id', selectedSubjectId);
            }

            const response = await fetch(`${API_URL}/teacher/classes/${selectedClassId}/analytics?${params.toString()}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('access_token')}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch students');
            }

            const data = await response.json();
            students = data.students || [];
            subjectPerformance = data.subject_performance || [];
            assignmentPerformance = data.assignments || [];

            // Sort by avg_score descending
            students.sort((a, b) => (b.avg_score || 0) - (a.avg_score || 0));

            // Update ranks
            students.forEach((student, index) => {
                student.rank = index + 1;
            });
        } catch (error) {
            console.error('Error loading students:', error);
            students = [];
            subjectPerformance = [];
            assignmentPerformance = [];
        }
    }

    // Render performance chart
    function renderPerformanceChart() {
        const ctx = document.getElementById('classPerformanceChart');

        if (performanceChart) {
            performanceChart.destroy();
        }

        const labels = subjectPerformance.map(item => item.subject_name);
        const data = subjectPerformance.map(item => Math.round(item.avg_score || 0));

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
                        displayColors: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            color: isDark ? '#a0aec0' : '#4a5568'
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

    // Render topics chart
    function renderTopicsChart() {
        const ctx = document.getElementById('topicsPerformanceChart');

        if (topicsChart) {
            topicsChart.destroy();
        }

        const labels = assignmentPerformance.map(item => item.test_title);
        const data = assignmentPerformance.map(item => Math.round(item.avg_percentage || 0));

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        topicsChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: i18n.translate('profile.avgScore'),
                    data: data,
                    borderColor: 'rgb(104, 83, 203)',
                    backgroundColor: 'rgba(104, 83, 203, 0.1)',
                    tension: 0.4,
                    fill: true,
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    pointBackgroundColor: 'rgb(104, 83, 203)',
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
                        displayColors: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            color: isDark ? '#a0aec0' : '#4a5568'
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

    // Render students table
    function renderStudentsTable() {
        const tbody = document.getElementById('studentsTableBody');
        const searchTerm = document.getElementById('studentSearch').value.toLowerCase();

        // Filter students
        let filteredStudents = students.filter(student => {
            const fullName = `${student.first_name} ${student.last_name}`.toLowerCase();
            const username = student.username.toLowerCase();
            return fullName.includes(searchTerm) || username.includes(searchTerm);
        });

        // Update total count
        document.getElementById('totalStudents').textContent = filteredStudents.length;

        // Pagination
        const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const paginatedStudents = filteredStudents.slice(startIndex, endIndex);

        // Render rows
        if (paginatedStudents.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6">
                        <div class="empty-state">
                            <div class="empty-state-icon">📋</div>
                            <div class="empty-state-title" data-i18n="teacherAnalytics.noStudents">Ученики не найдены</div>
                            <div class="empty-state-desc" data-i18n="teacherAnalytics.selectClassFirst">Выберите класс для просмотра учеников</div>
                        </div>
                    </td>
                </tr>
            `;
        } else {
            tbody.innerHTML = paginatedStudents.map(student => `
                <tr>
                    <td>
                        <div class="rank-badge ${getRankClass(student.rank)}">
                            ${student.rank}
                        </div>
                    </td>
                    <td>${student.first_name} ${student.last_name}</td>
                    <td>${student.username}</td>
                    <td>
                        <span class="score-badge ${getScoreClass(student.avg_score || 0)}">
                            ${Math.round(student.avg_score || 0)}%
                        </span>
                    </td>
                    <td>${student.tests_completed || 0}</td>
                    <td>
                        <button class="btn-view-profile" onclick="viewProfile('${student.id}')">
                            <span>👤</span>
                            <span data-i18n="users.viewProfile">Профиль</span>
                        </button>
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
        renderStudentsTable();
    };

    // View profile
    window.viewProfile = function (userId) {
        window.location.href = `profile.html?id=${userId}`;
    };

    // Get rank class
    function getRankClass(rank) {
        if (rank === 1) return 'rank-1';
        if (rank === 2) return 'rank-2';
        if (rank === 3) return 'rank-3';
        return 'default';
    }

    // Get score class
    function getScoreClass(score) {
        if (score >= 90) return 'excellent';
        if (score >= 75) return 'good';
        if (score >= 60) return 'average';
        return 'poor';
    }

    // Get current language
    function getCurrentLang() {
        return localStorage.getItem('zedly-lang') || 'ru';
    }

    // Show error
    function showError(message) {
        alert(message); // TODO: Replace with proper notification system
    }

    // Re-render charts on theme change
    document.addEventListener('themeChanged', () => {
        if (performanceChart) renderPerformanceChart();
        if (topicsChart) renderTopicsChart();
    });
})();
