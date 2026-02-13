// Advanced Analytics (Dashboard Tab)
(function () {
    'use strict';

    const API_URL = '/api';
    let currentFilters = {
        period: 30,
        grade_level: '',
        subject_id: ''
    };

    let comparisonChart = null;
    let trendsChart = null;
    let subjectsChart = null;
    let activeTab = 'heatmap';
    let chartLoadPromise = null;

    function showAlert(message, title = 'Ошибка') {
        if (window.ZedlyDialog?.alert) {
            return window.ZedlyDialog.alert(message, { title });
        }
        alert(message);
        return Promise.resolve(true);
    }

    function getLocalizedName(item) {
        const lang = window.ZedlyI18n?.getCurrentLang?.() || 'ru';
        if (lang === 'uz') {
            return item?.name_uz || item?.name_ru || item?.name || '—';
        }
        return item?.name_ru || item?.name_uz || item?.name || '—';
    }

    function getRoot() {
        return document.getElementById('advancedAnalyticsRoot');
    }

    function ensureChartJs() {
        if (window.Chart) {
            return Promise.resolve();
        }
        if (chartLoadPromise) {
            return chartLoadPromise;
        }

        chartLoadPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load Chart.js'));
            document.head.appendChild(script);
        });

        return chartLoadPromise;
    }

    function refreshTranslations() {
        if (window.ZedlyI18n?.getCurrentLang && window.ZedlyI18n?.setLang) {
            const lang = window.ZedlyI18n.getCurrentLang();
            window.ZedlyI18n.setLang(lang);
        }
    }

    function switchTab(tabName) {
        const root = getRoot();
        if (!root) return;

        activeTab = tabName;

        root.querySelectorAll('.tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        root.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}-content`);
        });

        switch (tabName) {
            case 'heatmap':
                loadHeatmap();
                break;
            case 'comparison':
                loadComparison();
                break;
            case 'trends':
                loadTrends();
                break;
            case 'subjects':
                loadSubjects();
                break;
            default:
                break;
        }
    }

    function applyFilters() {
        const periodFilter = document.getElementById('periodFilter');
        const gradeLevelFilter = document.getElementById('gradeLevelFilter');
        const subjectFilter = document.getElementById('subjectFilter');

        if (!periodFilter || !gradeLevelFilter || !subjectFilter) return;

        currentFilters = {
            period: periodFilter.value,
            grade_level: gradeLevelFilter.value,
            subject_id: subjectFilter.value
        };

        loadOverview();
        switchTab(activeTab);
    }

    async function loadOverview() {
        try {
            const token = localStorage.getItem('access_token');
            if (!token) {
                window.location.href = '/login.html';
                return;
            }

            const response = await fetch(`${API_URL}/analytics/school/overview?period=${currentFilters.period}` , {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.status === 401) {
                localStorage.removeItem('access_token');
                window.location.href = '/login.html';
                return;
            }

            if (!response.ok) {
                return;
            }

            const data = await response.json();

            const totalStudents = document.getElementById('totalStudents');
            const avgScore = document.getElementById('avgScore');
            const totalTests = document.getElementById('totalTests');
            const totalAttempts = document.getElementById('totalAttempts');

            if (totalStudents) totalStudents.textContent = data.overview.total_students || 0;
            if (avgScore) {
                avgScore.textContent = data.overview.average_score
                    ? `${parseFloat(data.overview.average_score).toFixed(1)}%`
                    : '-';
            }
            if (totalTests) totalTests.textContent = data.overview.total_tests || 0;
            if (totalAttempts) totalAttempts.textContent = data.overview.total_attempts || 0;
        } catch (error) {
            console.error('Overview error:', error);
        }
    }

    async function loadHeatmap() {
        const container = document.getElementById('heatmapCanvas');
        if (!container) return;

        try {
            const token = localStorage.getItem('access_token');
            if (!token) {
                window.location.href = '/login.html';
                return;
            }

            let url = `${API_URL}/analytics/school/heatmap?period=${currentFilters.period}`;
            if (currentFilters.grade_level) {
                url += `&grade_level=${currentFilters.grade_level}`;
            }

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.status === 401) {
                localStorage.removeItem('access_token');
                window.location.href = '/login.html';
                return;
            }

            if (response.status === 403) {
                container.innerHTML = '<p style="color: var(--error);">У вас нет доступа к этой аналитике</p>';
                return;
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Failed to load heatmap');
            }

            const data = await response.json();
            renderHeatmap(data.heatmap);
        } catch (error) {
            console.error('Heatmap error:', error);
            container.innerHTML = `<p style="color: var(--error);">Ошибка загрузки данных: ${error.message}</p>`;
        }
    }

    function renderHeatmap(data) {
        const container = document.getElementById('heatmapCanvas');
        if (!container) return;

        if (!data || data.length === 0) {
            container.innerHTML = '<p style="color: var(--text-secondary);">Нет данных для отображения</p>';
            return;
        }

        const subjects = [...new Set(data.map(item => item.subject))];
        const weeks = [...new Set(data.map(item => item.week))].sort((a, b) => b - a);

        let html = `<div class="heatmap" style="grid-template-columns: 150px repeat(${weeks.length}, 1fr);">`;

        html += '<div class="heatmap-header">Предмет</div>';
        weeks.forEach(week => {
            html += `<div class="heatmap-header">Неделя ${week}</div>`;
        });

        subjects.forEach(subject => {
            html += `<div class="heatmap-header">${subject}</div>`;
            weeks.forEach(week => {
                const item = data.find(entry => entry.subject === subject && entry.week === week);
                if (item) {
                    const score = parseFloat(item.avg_score);
                    const color = getHeatmapColor(score);
                    html += `
                        <div class="heatmap-cell" style="background: ${color}; color: white;" 
                            title="${subject}, Неделя ${week}: ${score.toFixed(1)}% (${item.attempt_count} попыток)">
                            ${score.toFixed(0)}%
                        </div>
                    `;
                } else {
                    html += '<div class="heatmap-cell" style="background: var(--bg-secondary); color: var(--text-secondary);">-</div>';
                }
            });
        });

        html += '</div>';
        container.innerHTML = html;
    }

    function getHeatmapColor(score) {
        if (score >= 85) return 'linear-gradient(135deg, #22c55e, #16a34a)';
        if (score >= 70) return 'linear-gradient(135deg, #84cc16, #65a30d)';
        if (score >= 50) return 'linear-gradient(135deg, #fbbf24, #f59e0b)';
        return 'linear-gradient(135deg, #f97316, #ef4444)';
    }

    async function loadComparison() {
        const select = document.getElementById('comparisonType');
        if (!select) return;

        const type = select.value;

        try {
            await ensureChartJs();
            const token = localStorage.getItem('access_token');
            if (!token) {
                window.location.href = '/login.html';
                return;
            }

            let url = `${API_URL}/analytics/school/comparison?type=${type}`;
            if (currentFilters.subject_id) {
                url += `&subject_id=${currentFilters.subject_id}`;
            }

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.status === 401) {
                localStorage.removeItem('access_token');
                window.location.href = '/login.html';
                return;
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Failed to load comparison');
            }

            const data = await response.json();
            renderComparison(data.data, type);
        } catch (error) {
            console.error('Comparison error:', error);
            const tableBody = document.getElementById('comparisonTableBody');
            if (tableBody) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="6" style="color: var(--error); text-align: center; padding: 20px;">
                            Ошибка: ${error.message}
                        </td>
                    </tr>
                `;
            }
        }
    }

    function renderComparison(data, type) {
        const ctx = document.getElementById('comparisonChart');
        if (!ctx) return;

        if (comparisonChart) {
            comparisonChart.destroy();
        }

        const labels = data.map(item => {
            if (type === 'classes') return item.name;
            if (type === 'subjects') return getLocalizedName(item);
            if (type === 'students') return `${item.first_name} ${item.last_name}`;
            return '';
        });

        const scores = data.map(item => parseFloat(item.avg_score) || 0);

        comparisonChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Средний балл (%)',
                    data: scores,
                    backgroundColor: 'rgba(74, 144, 226, 0.8)',
                    borderColor: 'rgba(74, 144, 226, 1)',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100
                    }
                }
            }
        });

        const tbody = document.getElementById('comparisonTableBody');
        if (!tbody) return;

        tbody.innerHTML = data.map(item => {
            const score = parseFloat(item.avg_score) || 0;
            const name = type === 'classes' ? item.name
                : type === 'subjects' ? getLocalizedName(item)
                    : `${item.first_name} ${item.last_name}`;

            return `
                <tr>
                    <td>${name}</td>
                    <td>${item.attempt_count || item.total_attempts || 0}</td>
                    <td>${score.toFixed(1)}%</td>
                    <td>${parseFloat(item.min_score || 0).toFixed(1)}%</td>
                    <td>${parseFloat(item.max_score || 0).toFixed(1)}%</td>
                    <td>
                        <div class="score-bar">
                            <div class="score-bar-fill">
                                <div class="score-bar-value" style="width: ${score}%"></div>
                            </div>
                            <span class="score-text">${score.toFixed(0)}%</span>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    async function loadTrends() {
        try {
            await ensureChartJs();
            const token = localStorage.getItem('access_token');
            if (!token) {
                window.location.href = '/login.html';
                return;
            }

            const response = await fetch(`${API_URL}/analytics/school/overview?period=${currentFilters.period}` , {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.status === 401) {
                localStorage.removeItem('access_token');
                window.location.href = '/login.html';
                return;
            }

            if (!response.ok) {
                throw new Error('Failed to load trends');
            }

            const data = await response.json();

            const ctx = document.getElementById('trendsChart');
            if (!ctx) return;

            if (trendsChart) {
                trendsChart.destroy();
            }

            const labels = data.recent_activity.map(item => new Date(item.date).toLocaleDateString('ru-RU'));
            const attempts = data.recent_activity.map(item => parseInt(item.attempts));
            const scores = data.recent_activity.map(item => parseFloat(item.avg_score));

            trendsChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Попытки',
                            data: attempts,
                            borderColor: 'rgba(74, 144, 226, 1)',
                            backgroundColor: 'rgba(74, 144, 226, 0.1)',
                            yAxisID: 'y'
                        },
                        {
                            label: 'Средний балл (%)',
                            data: scores,
                            borderColor: 'rgba(80, 227, 194, 1)',
                            backgroundColor: 'rgba(80, 227, 194, 0.1)',
                            yAxisID: 'y1'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        mode: 'index',
                        intersect: false
                    },
                    scales: {
                        y: {
                            type: 'linear',
                            display: true,
                            position: 'left'
                        },
                        y1: {
                            type: 'linear',
                            display: true,
                            position: 'right',
                            grid: {
                                drawOnChartArea: false
                            },
                            max: 100
                        }
                    }
                }
            });

            const topClassesList = document.getElementById('topClassesList');
            if (topClassesList) {
                topClassesList.innerHTML = data.top_classes.slice(0, 5).map((item, index) => `
                    <div class="list-item">
                        <div class="list-item-header">
                            <span class="list-item-title">
                                <span class="list-item-badge">${index + 1}</span>${item.name}
                            </span>
                            <span class="list-item-score success">${parseFloat(item.avg_score).toFixed(1)}%</span>
                        </div>
                        <div class="list-item-meta">
                            ${item.student_count} студентов • ${item.total_attempts} попыток
                        </div>
                    </div>
                `).join('');
            }

            const needsAttentionList = document.getElementById('needsAttentionList');
            if (needsAttentionList) {
                const needsAttention = [...data.top_classes].sort((a, b) => a.avg_score - b.avg_score).slice(0, 5);
                needsAttentionList.innerHTML = needsAttention.map(item => `
                    <div class="list-item">
                        <div class="list-item-header">
                            <span class="list-item-title">${item.name}</span>
                            <span class="list-item-score error">${parseFloat(item.avg_score).toFixed(1)}%</span>
                        </div>
                        <div class="list-item-meta">
                            Проходной балл: ${parseFloat(item.pass_rate || 0).toFixed(1)}%
                        </div>
                    </div>
                `).join('');
            }
        } catch (error) {
            console.error('Trends error:', error);
        }
    }

    async function loadSubjects() {
        try {
            await ensureChartJs();
            const token = localStorage.getItem('access_token');
            if (!token) {
                window.location.href = '/login.html';
                return;
            }

            const response = await fetch(`${API_URL}/analytics/school/overview` , {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.status === 401) {
                localStorage.removeItem('access_token');
                window.location.href = '/login.html';
                return;
            }

            if (!response.ok) {
                throw new Error('Failed to load subjects');
            }

            const data = await response.json();
            const subjects = data.subject_performance || [];

            const ctx = document.getElementById('subjectsChart');
            if (!ctx) return;

            if (subjectsChart) {
                subjectsChart.destroy();
                subjectsChart = null;
            }

            const tbody = document.getElementById('subjectsTableBody');
            if (!tbody) return;

            if (subjects.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px; color: var(--text-secondary);">Нет данных по предметам</td></tr>';
                return;
            }

            const labels = subjects.map(item => getLocalizedName(item));
            const scores = subjects.map(item => parseFloat(item.avg_score) || 0);

            subjectsChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Средний балл (%)',
                        data: scores,
                        backgroundColor: 'rgba(80, 227, 194, 0.8)',
                        borderColor: 'rgba(80, 227, 194, 1)',
                        borderWidth: 2
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            beginAtZero: true,
                            max: 100
                        }
                    }
                }
            });

            tbody.innerHTML = subjects.map(item => `
                <tr>
                    <td>${getLocalizedName(item)}</td>
                    <td>${item.test_count || 0}</td>
                    <td>${item.attempt_count || 0}</td>
                    <td>${parseFloat(item.avg_score || 0).toFixed(1)}%</td>
                    <td>${parseFloat(item.avg_time_minutes || 0).toFixed(1)}</td>
                </tr>
            `).join('');
        } catch (error) {
            console.error('Subjects error:', error);
        }
    }

    async function exportData() {
        try {
            const token = localStorage.getItem('access_token');
            const response = await fetch(`${API_URL}/analytics/export/school`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Export failed');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `school_analytics_${Date.now()}.xlsx`;
            document.body.appendChild(link);
            link.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(link);
        } catch (error) {
            console.error('Export error:', error);
            showAlert('Ошибка при экспорте данных');
        }
    }

    async function loadSubjectOptions() {
        try {
            const token = localStorage.getItem('access_token');
            const response = await fetch(`${API_URL}/admin/subjects?limit=100`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                return;
            }

            const data = await response.json();
            const select = document.getElementById('subjectFilter');
            if (!select) return;

            while (select.options.length > 1) {
                select.remove(1);
            }

            if (data.subjects && data.subjects.length > 0) {
                data.subjects.forEach(subject => {
                    const option = document.createElement('option');
                    option.value = subject.id;
                    option.textContent = subject.name_ru || subject.name || 'Без названия';
                    select.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Failed to load subjects:', error);
        }
    }

    async function init() {
        const root = getRoot();
        if (!root || root.dataset.initialized === 'true') return;

        root.dataset.initialized = 'true';

        root.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => switchTab(tab.dataset.tab));
        });

        const applyBtn = document.getElementById('applyAdvancedFilters');
        if (applyBtn) {
            applyBtn.addEventListener('click', applyFilters);
        }

        const exportBtn = document.getElementById('exportAdvancedAnalytics');
        if (exportBtn) {
            exportBtn.addEventListener('click', exportData);
        }

        const comparisonType = document.getElementById('comparisonType');
        if (comparisonType) {
            comparisonType.addEventListener('change', loadComparison);
        }

        refreshTranslations();

        await loadSubjectOptions();
        await loadOverview();
        await loadHeatmap();
    }

    window.AdvancedAnalytics = {
        init
    };
})();
