// Advanced Analytics (Dashboard Tab) - v2
(function () {
    'use strict';

    const API_URL = '/api';
    const STORAGE_KEY = 'advancedAnalyticsFiltersV2';
    const PERIOD_PRESETS = {
        this_week: 7,
        this_month: 30,
        current_quarter: 90,
        academic_year: 270
    };

    const DEFAULT_FILTERS = {
        period: '30',
        period_preset: '',
        grade_level: '',
        class_id: '',
        subject_id: '',
        teacher_id: ''
    };

    const state = {
        filters: { ...DEFAULT_FILTERS },
        activeTab: 'heatmap',
        options: {
            classes: [],
            subjects: [],
            teachers: [],
            gradeLevels: []
        },
        charts: {
            comparison: null,
            trends: null,
            subjects: null
        },
        heatmapData: [],
        heatmapWeeks: [],
        heatmapSubjects: [],
        teachersSort: {
            by: 'last_activity',
            dir: 'desc'
        },
        expandedTeacherId: null,
        chartLoadPromise: null,
        documentClickBound: false
    };

    function showAlert(message, title = 'Ошибка') {
        if (window.ZedlyDialog?.alert) {
            return window.ZedlyDialog.alert(message, { title });
        }
        alert(message);
        return Promise.resolve(true);
    }

    function getCurrentUserRole() {
        try {
            const raw = localStorage.getItem('user');
            if (!raw) return '';
            const user = JSON.parse(raw);
            return user?.role || '';
        } catch (error) {
            console.warn('Failed to parse current user:', error);
            return '';
        }
    }

    function getSchoolScopeId() {
        const role = getCurrentUserRole();
        if (role !== 'superadmin') return null;
        const params = new URLSearchParams(window.location.search);
        const value = params.get('school_id') || params.get('schoolId');
        return value ? String(value) : null;
    }

    function getRoot() {
        return document.getElementById('advancedAnalyticsRoot');
    }

    function ensureChartJs() {
        if (window.Chart) {
            return Promise.resolve();
        }
        if (state.chartLoadPromise) {
            return state.chartLoadPromise;
        }

        state.chartLoadPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load Chart.js'));
            document.head.appendChild(script);
        });

        return state.chartLoadPromise;
    }

    function toQueryParams(params = {}) {
        const search = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (value === undefined || value === null || value === '') return;
            search.set(key, String(value));
        });
        const schoolScopeId = getSchoolScopeId();
        if (schoolScopeId) {
            search.set('school_id', schoolScopeId);
        }
        return search;
    }

    async function apiGet(path, params = {}) {
        const query = toQueryParams(params);
        const url = `${API_URL}${path}${query.toString() ? `?${query.toString()}` : ''}`;
        const response = await fetch(url, { credentials: 'include' });
        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.message || 'Request failed');
        }
        return response.json();
    }

    async function apiDownload(path, filename, params = {}) {
        const query = toQueryParams(params);
        const url = `${API_URL}${path}${query.toString() ? `?${query.toString()}` : ''}`;
        const response = await fetch(url, { credentials: 'include' });
        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.message || 'Export failed');
        }
        const blob = await response.blob();
        const objectUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(objectUrl);
    }

    function getFilterParams(extra = {}) {
        const params = {
            period: state.filters.period,
            period_preset: state.filters.period_preset,
            grade_level: state.filters.grade_level,
            class_id: state.filters.class_id,
            subject_id: state.filters.subject_id,
            teacher_id: state.filters.teacher_id,
            ...extra
        };
        return params;
    }

    function renderLayout() {
        return `
            <div class="analytics-container" data-advanced-v2="1">
                <div class="page-header-section">
                    <h1 class="page-main-title" data-i18n="advanced_analytics">Расширенная аналитика</h1>
                </div>

                <div class="filters" id="advancedFilters">
                    <div class="filter-group">
                        <label data-i18n="period">Период</label>
                        <select id="periodFilter">
                            <option value="7">Последние 7 дней</option>
                            <option value="30">Последние 30 дней</option>
                            <option value="90">Последние 90 дней</option>
                            <option value="365">Последний год</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label>Быстрый пресет</label>
                        <select id="periodPresetFilter">
                            <option value="">Без пресета</option>
                            <option value="this_week">Эта неделя</option>
                            <option value="this_month">Этот месяц</option>
                            <option value="current_quarter">Текущая четверть</option>
                            <option value="academic_year">Учебный год</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label data-i18n="grade_level">Параллель</label>
                        <select id="gradeLevelFilter">
                            <option value="">Все параллели</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label data-i18n="reports.class">Класс</label>
                        <select id="advancedClassFilter">
                            <option value="">Все классы</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label data-i18n="subject">Предмет</label>
                        <select id="subjectFilter">
                            <option value="">Все предметы</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label>Учитель</label>
                        <select id="teacherFilter">
                            <option value="">Все учителя</option>
                        </select>
                    </div>
                    <button class="btn btn-primary" type="button" id="applyAdvancedFilters">Применить</button>
                    <button class="btn btn-outline" type="button" id="saveAdvancedFilters">Сохранить фильтр</button>
                    <div class="export-dropdown" id="advancedExportDropdown">
                        <button class="btn btn-outline" type="button" id="exportAdvancedAnalytics">Экспорт</button>
                        <div class="export-menu" id="advancedExportMenu" hidden>
                            <button type="button" class="export-menu-item" data-export-type="pdf">📄 PDF — сводный отчёт</button>
                            <button type="button" class="export-menu-item" data-export-type="excel">📊 Excel — подробные данные</button>
                        </div>
                    </div>
                </div>

                <div class="analytics-grid" id="overviewStats">
                    <div class="stat-card">
                        <h3 data-i18n="total_students">Всего студентов</h3>
                        <div class="stat-value" id="totalStudents">-</div>
                    </div>
                    <div class="stat-card">
                        <h3 data-i18n="average_score">Средний балл</h3>
                        <div class="stat-value" id="avgScore">-</div>
                    </div>
                    <div class="stat-card">
                        <h3 data-i18n="total_tests">Всего тестов</h3>
                        <div class="stat-value" id="totalTests">-</div>
                    </div>
                    <div class="stat-card">
                        <h3 data-i18n="total_attempts">Всего попыток</h3>
                        <div class="stat-value" id="totalAttempts">-</div>
                    </div>
                </div>

                <div class="tabs" id="advancedTabs">
                    <button class="tab active" type="button" data-tab="heatmap">Тепловая карта</button>
                    <button class="tab" type="button" data-tab="comparison">Сравнение</button>
                    <button class="tab" type="button" data-tab="trends">Тренды</button>
                    <button class="tab" type="button" data-tab="subjects">По предметам</button>
                    <button class="tab" type="button" data-tab="teachers">По учителям</button>
                    <button class="tab" type="button" data-tab="students-progress">Прогресс учеников</button>
                    <button class="tab" type="button" data-tab="tests-analysis">Анализ тестов</button>
                    <button class="tab" type="button" data-tab="period-comparison">Сравнение периодов</button>
                </div>

                <div class="tab-content active" id="heatmap-content">
                    <div class="chart-card">
                        <h2>
                            <span>Тепловая карта успеваемости</span>
                            <button class="btn btn-outline btn-sm" type="button" id="downloadHeatmapPng">Скачать как PNG</button>
                        </h2>
                        <p class="chart-subtitle">Визуализация средних баллов по предметам и неделям</p>
                        <div class="heatmap-legend">
                            <span class="legend-title">Легенда:</span>
                            <div class="legend-item"><div class="legend-color red"></div><span>&lt;50%</span></div>
                            <div class="legend-item"><div class="legend-color yellow"></div><span>50-70%</span></div>
                            <div class="legend-item"><div class="legend-color green"></div><span>&gt;70%</span></div>
                        </div>
                        <div class="heatmap-container">
                            <div id="heatmapCanvas" class="loading">Загрузка данных...</div>
                        </div>
                    </div>
                </div>

                <div class="tab-content" id="comparison-content">
                    <div class="chart-card">
                        <h2>Сравнение</h2>
                        <div class="comparison-controls">
                            <select id="comparisonType">
                                <option value="classes">По классам</option>
                                <option value="subjects">По предметам</option>
                                <option value="students">По ученикам</option>
                            </select>
                            <select id="comparisonMode">
                                <option value="default">Стандарт</option>
                                <option value="class_dual">Сравнить два класса</option>
                                <option value="year_ago">Год назад</option>
                            </select>
                            <select id="comparisonClassA" class="comparison-dual" hidden></select>
                            <select id="comparisonClassB" class="comparison-dual" hidden></select>
                        </div>
                        <div class="chart-container">
                            <canvas id="comparisonChart"></canvas>
                        </div>
                    </div>
                    <div class="chart-card">
                        <h2>Детальное сравнение</h2>
                        <div class="table-container">
                            <table class="comparison-table" id="comparisonTable">
                                <thead id="comparisonTableHead"></thead>
                                <tbody id="comparisonTableBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div class="tab-content" id="trends-content">
                    <div class="chart-card">
                        <h2>Тренды активности</h2>
                        <div class="chart-container"><canvas id="trendsChart"></canvas></div>
                    </div>
                    <div class="analytics-grid">
                        <div class="chart-card">
                            <h2>Лучшие классы</h2>
                            <div id="topClassesList"></div>
                        </div>
                        <div class="chart-card">
                            <h2>Требуют внимания</h2>
                            <div id="needsAttentionList"></div>
                        </div>
                    </div>
                </div>

                <div class="tab-content" id="subjects-content">
                    <div class="chart-card">
                        <h2>Успеваемость по предметам</h2>
                        <div class="chart-container"><canvas id="subjectsChart"></canvas></div>
                    </div>
                    <div class="chart-card">
                        <h2>Статистика по предметам</h2>
                        <div class="table-container">
                            <table class="comparison-table">
                                <thead>
                                    <tr>
                                        <th>Предмет</th>
                                        <th>Тестов</th>
                                        <th>Попыток</th>
                                        <th>Средний балл</th>
                                        <th>Среднее время (мин)</th>
                                    </tr>
                                </thead>
                                <tbody id="subjectsTableBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div class="tab-content" id="teachers-content">
                    <div class="chart-card">
                        <h2>Аналитика по учителям</h2>
                        <div class="table-container">
                            <table class="comparison-table" id="teachersTable">
                                <thead>
                                    <tr>
                                        <th class="sortable" data-sort="name">Имя учителя</th>
                                        <th class="sortable" data-sort="subjects">Предметы</th>
                                        <th class="sortable" data-sort="tests_created">Тестов создано</th>
                                        <th class="sortable" data-sort="tests_assigned">Тестов назначено</th>
                                        <th class="sortable" data-sort="avg_student_score">Средний балл</th>
                                        <th class="sortable" data-sort="last_activity">Последняя активность</th>
                                        <th class="sortable" data-sort="status">Статус</th>
                                    </tr>
                                </thead>
                                <tbody id="teachersTableBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div class="tab-content" id="students-progress-content">
                    <div class="analytics-grid two-columns">
                        <div class="chart-card">
                            <h2>Топ улучшившихся</h2>
                            <div id="topImprovedList"></div>
                        </div>
                        <div class="chart-card">
                            <h2>Зона риска</h2>
                            <div id="riskZoneList"></div>
                        </div>
                    </div>
                </div>

                <div class="tab-content" id="tests-analysis-content">
                    <div class="chart-card">
                        <h2>Самые сложные тесты</h2>
                        <div class="table-container">
                            <table class="comparison-table">
                                <thead>
                                    <tr>
                                        <th>Название</th>
                                        <th>Предмет</th>
                                        <th>Учитель</th>
                                        <th>Средний балл</th>
                                        <th>Пройден</th>
                                    </tr>
                                </thead>
                                <tbody id="hardestTestsBody"></tbody>
                            </table>
                        </div>
                    </div>
                    <div class="chart-card">
                        <h2>Проблемные вопросы</h2>
                        <div class="table-container">
                            <table class="comparison-table">
                                <thead>
                                    <tr>
                                        <th>Вопрос</th>
                                        <th>Тест</th>
                                        <th>% неправильных</th>
                                    </tr>
                                </thead>
                                <tbody id="problemQuestionsBody"></tbody>
                            </table>
                        </div>
                    </div>
                    <div class="chart-card">
                        <h2>Заброшенные тесты</h2>
                        <div class="table-container">
                            <table class="comparison-table">
                                <thead>
                                    <tr>
                                        <th>Название</th>
                                        <th>Учитель</th>
                                        <th>Дата создания</th>
                                        <th>Статус</th>
                                    </tr>
                                </thead>
                                <tbody id="abandonedTestsBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div class="tab-content" id="period-comparison-content">
                    <div class="chart-card">
                        <h2>Сравнение периодов</h2>
                        <div class="comparison-controls multi-line">
                            <select id="periodComparisonDimension">
                                <option value="subjects">По предметам</option>
                                <option value="classes">По классам</option>
                                <option value="teachers">По учителям</option>
                            </select>
                            <select id="periodComparisonMonths">
                                <option value="4">4 месяца</option>
                                <option value="5">5 месяцев</option>
                                <option value="6" selected>6 месяцев</option>
                            </select>
                            <input type="date" id="periodAStart" title="Период A: начало">
                            <input type="date" id="periodAEnd" title="Период A: конец">
                            <input type="date" id="periodBStart" title="Период B: начало">
                            <input type="date" id="periodBEnd" title="Период B: конец">
                            <button class="btn btn-outline" type="button" id="periodCompareApply">Сравнить периоды</button>
                        </div>
                        <div class="table-container">
                            <table class="comparison-table" id="periodComparisonTable">
                                <thead id="periodComparisonHead"></thead>
                                <tbody id="periodComparisonBody"></tbody>
                            </table>
                        </div>
                    </div>
                    <div class="chart-card">
                        <h2>Сравнение двух периодов рядом</h2>
                        <div class="table-container">
                            <table class="comparison-table">
                                <thead>
                                    <tr>
                                        <th>Сущность</th>
                                        <th>Период A</th>
                                        <th>Период B</th>
                                        <th>Δ</th>
                                    </tr>
                                </thead>
                                <tbody id="periodPairBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <div class="advanced-modal" id="heatmapStudentsModal" hidden>
                <div class="advanced-modal-backdrop" data-modal-close></div>
                <div class="advanced-modal-content">
                    <div class="advanced-modal-header">
                        <h3 id="heatmapModalTitle">Ученики по ячейке</h3>
                        <button type="button" class="btn btn-outline btn-sm" id="heatmapModalClose">Закрыть</button>
                    </div>
                    <div class="advanced-modal-body">
                        <div class="table-container">
                            <table class="comparison-table">
                                <thead>
                                    <tr>
                                        <th>Ученик</th>
                                        <th>Класс</th>
                                        <th>Средний балл</th>
                                        <th>Попыток</th>
                                    </tr>
                                </thead>
                                <tbody id="heatmapModalBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function ensureLayout() {
        const root = getRoot();
        if (!root) return false;
        root.innerHTML = renderLayout();
        return true;
    }

    function refreshTranslations() {
        if (window.ZedlyI18n?.getCurrentLang && window.ZedlyI18n?.setLang) {
            const lang = window.ZedlyI18n.getCurrentLang();
            window.ZedlyI18n.setLang(lang);
        }
    }

    function restoreSavedFilters() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            state.filters = {
                ...DEFAULT_FILTERS,
                ...(parsed && typeof parsed === 'object' ? parsed : {})
            };
        } catch (error) {
            console.warn('Failed to restore filters', error);
        }
    }

    function saveFiltersToStorage() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.filters));
    }

    function syncFilterControls() {
        const periodFilter = document.getElementById('periodFilter');
        const periodPresetFilter = document.getElementById('periodPresetFilter');
        const gradeLevelFilter = document.getElementById('gradeLevelFilter');
        const classFilter = document.getElementById('advancedClassFilter');
        const subjectFilter = document.getElementById('subjectFilter');
        const teacherFilter = document.getElementById('teacherFilter');

        if (periodFilter) periodFilter.value = state.filters.period || '30';
        if (periodPresetFilter) periodPresetFilter.value = state.filters.period_preset || '';
        if (gradeLevelFilter) gradeLevelFilter.value = state.filters.grade_level || '';
        if (classFilter) classFilter.value = state.filters.class_id || '';
        if (subjectFilter) subjectFilter.value = state.filters.subject_id || '';
        if (teacherFilter) teacherFilter.value = state.filters.teacher_id || '';
    }

    function applyFiltersFromDom() {
        const periodFilter = document.getElementById('periodFilter');
        const periodPresetFilter = document.getElementById('periodPresetFilter');
        const gradeLevelFilter = document.getElementById('gradeLevelFilter');
        const classFilter = document.getElementById('advancedClassFilter');
        const subjectFilter = document.getElementById('subjectFilter');
        const teacherFilter = document.getElementById('teacherFilter');

        state.filters = {
            ...state.filters,
            period: periodFilter?.value || '30',
            period_preset: periodPresetFilter?.value || '',
            grade_level: gradeLevelFilter?.value || '',
            class_id: classFilter?.value || '',
            subject_id: subjectFilter?.value || '',
            teacher_id: teacherFilter?.value || ''
        };
    }

    function renderGradeOptions() {
        const gradeSelect = document.getElementById('gradeLevelFilter');
        if (!gradeSelect) return;

        while (gradeSelect.options.length > 1) {
            gradeSelect.remove(1);
        }

        state.options.gradeLevels.forEach((grade) => {
            const option = document.createElement('option');
            option.value = String(grade);
            option.textContent = `${grade} класс`;
            gradeSelect.appendChild(option);
        });
    }

    function renderClassOptions() {
        const classSelect = document.getElementById('advancedClassFilter');
        if (!classSelect) return;

        const selectedGrade = state.filters.grade_level;
        while (classSelect.options.length > 1) {
            classSelect.remove(1);
        }

        state.options.classes
            .filter((item) => !selectedGrade || String(item.grade_level || '') === String(selectedGrade))
            .forEach((item) => {
                const option = document.createElement('option');
                option.value = String(item.id);
                option.textContent = item.name;
                classSelect.appendChild(option);
            });

        classSelect.value = state.filters.class_id || '';
    }

    function renderSubjectOptions() {
        const subjectSelect = document.getElementById('subjectFilter');
        if (!subjectSelect) return;

        while (subjectSelect.options.length > 1) {
            subjectSelect.remove(1);
        }

        state.options.subjects.forEach((item) => {
            const option = document.createElement('option');
            option.value = String(item.id);
            option.textContent = item.name_ru || item.name_uz || item.name || '—';
            subjectSelect.appendChild(option);
        });

        subjectSelect.value = state.filters.subject_id || '';
    }

    function renderTeacherOptions() {
        const teacherSelect = document.getElementById('teacherFilter');
        if (!teacherSelect) return;

        while (teacherSelect.options.length > 1) {
            teacherSelect.remove(1);
        }

        state.options.teachers.forEach((item) => {
            const option = document.createElement('option');
            option.value = String(item.id);
            option.textContent = item.name;
            teacherSelect.appendChild(option);
        });

        teacherSelect.value = state.filters.teacher_id || '';

        const classA = document.getElementById('comparisonClassA');
        const classB = document.getElementById('comparisonClassB');
        if (classA && classB) {
            populateComparisonClassSelects();
        }
    }

    async function loadFilterOptions() {
        const data = await apiGet('/analytics/school/advanced/filter-options');
        state.options.classes = Array.isArray(data.classes) ? data.classes : [];
        state.options.subjects = Array.isArray(data.subjects) ? data.subjects : [];
        state.options.teachers = Array.isArray(data.teachers) ? data.teachers : [];
        state.options.gradeLevels = Array.isArray(data.grade_levels) ? data.grade_levels : [];

        renderGradeOptions();
        renderClassOptions();
        renderSubjectOptions();
        renderTeacherOptions();
        syncFilterControls();
    }

    function switchTab(tabName) {
        state.activeTab = tabName;

        const root = getRoot();
        if (!root) return;

        root.querySelectorAll('.tab').forEach((tab) => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        root.querySelectorAll('.tab-content').forEach((content) => {
            content.classList.toggle('active', content.id === `${tabName}-content`);
        });

        loadActiveTab().catch((error) => {
            console.error(`Failed to load tab ${tabName}`, error);
        });
    }

    async function loadOverview() {
        const data = await apiGet('/analytics/school/advanced/overview', getFilterParams());

        const totalStudents = document.getElementById('totalStudents');
        const avgScore = document.getElementById('avgScore');
        const totalTests = document.getElementById('totalTests');
        const totalAttempts = document.getElementById('totalAttempts');

        if (totalStudents) totalStudents.textContent = data.overview?.total_students || 0;
        if (avgScore) avgScore.textContent = data.overview?.average_score
            ? `${Number(data.overview.average_score).toFixed(1)}%`
            : '0%';
        if (totalTests) totalTests.textContent = data.overview?.total_tests || 0;
        if (totalAttempts) totalAttempts.textContent = data.overview?.total_attempts || 0;
    }

    function getHeatmapColor(score) {
        if (score < 50) return '#ef4444';
        if (score <= 70) return '#f59e0b';
        return '#22c55e';
    }

    function renderHeatmap(rows) {
        const container = document.getElementById('heatmapCanvas');
        if (!container) return;

        if (!Array.isArray(rows) || rows.length === 0) {
            container.innerHTML = '<p style="color: var(--text-secondary);">Нет данных для отображения</p>';
            state.heatmapData = [];
            state.heatmapWeeks = [];
            state.heatmapSubjects = [];
            return;
        }

        const weeks = [...new Set(rows.map((item) => String(item.week_start)))];
        const subjects = [...new Set(rows.map((item) => `${item.subject_id}::${item.subject}`))];
        state.heatmapData = rows;
        state.heatmapWeeks = weeks;
        state.heatmapSubjects = subjects;

        let html = `<div class="heatmap" style="grid-template-columns: 170px repeat(${weeks.length}, 1fr);">`;
        html += '<div class="heatmap-header">Предмет</div>';
        weeks.forEach((week) => {
            const label = new Date(week).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
            html += `<div class="heatmap-header">${label}</div>`;
        });

        subjects.forEach((subjectKey) => {
            const [subjectId, subjectName] = subjectKey.split('::');
            html += `<div class="heatmap-header">${subjectName}</div>`;
            weeks.forEach((weekStart) => {
                const entry = rows.find((item) => String(item.subject_id) === subjectId && String(item.week_start) === weekStart);
                if (!entry) {
                    html += '<div class="heatmap-cell heatmap-empty">-</div>';
                    return;
                }
                const score = Number(entry.avg_score || 0);
                const color = getHeatmapColor(score);
                html += `
                    <button
                        class="heatmap-cell"
                        type="button"
                        data-subject-id="${subjectId}"
                        data-week-start="${String(entry.week_start)}"
                        style="background: ${color}; color: #fff;"
                        title="${subjectName}: ${score.toFixed(1)}% (${entry.attempt_count || 0} попыток)"
                    >${score.toFixed(0)}%</button>
                `;
            });
        });

        html += '</div>';
        container.innerHTML = html;

        container.querySelectorAll('.heatmap-cell[data-subject-id]').forEach((button) => {
            button.addEventListener('click', async () => {
                const subjectId = button.dataset.subjectId;
                const weekStart = button.dataset.weekStart;
                await openHeatmapCellModal(subjectId, weekStart);
            });
        });
    }

    function downloadHeatmapAsPng() {
        if (!state.heatmapData.length) {
            showAlert('Нет данных для экспорта PNG');
            return;
        }

        const weeks = state.heatmapWeeks;
        const subjects = state.heatmapSubjects;
        const cellW = 110;
        const cellH = 36;
        const leftW = 210;
        const padding = 20;
        const width = padding * 2 + leftW + (weeks.length * cellW);
        const height = padding * 2 + cellH + (subjects.length * cellH);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.font = '12px sans-serif';
        ctx.textBaseline = 'middle';

        ctx.fillStyle = '#1f2937';
        ctx.fillRect(padding, padding, leftW, cellH);
        ctx.fillStyle = '#ffffff';
        ctx.fillText('Предмет', padding + 8, padding + (cellH / 2));

        weeks.forEach((week, index) => {
            const x = padding + leftW + index * cellW;
            const label = new Date(week).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
            ctx.fillStyle = '#1f2937';
            ctx.fillRect(x, padding, cellW, cellH);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(label, x + 10, padding + (cellH / 2));
        });

        subjects.forEach((subjectKey, rowIndex) => {
            const [subjectId, subjectName] = subjectKey.split('::');
            const y = padding + cellH + rowIndex * cellH;

            ctx.fillStyle = '#f3f4f6';
            ctx.fillRect(padding, y, leftW, cellH);
            ctx.fillStyle = '#111827';
            ctx.fillText(subjectName, padding + 8, y + (cellH / 2));

            weeks.forEach((weekStart, colIndex) => {
                const x = padding + leftW + colIndex * cellW;
                const entry = state.heatmapData.find((item) => String(item.subject_id) === subjectId && String(item.week_start) === weekStart);
                if (!entry) {
                    ctx.fillStyle = '#e5e7eb';
                    ctx.fillRect(x, y, cellW, cellH);
                    ctx.fillStyle = '#6b7280';
                    ctx.fillText('-', x + 10, y + (cellH / 2));
                    return;
                }
                const score = Number(entry.avg_score || 0);
                ctx.fillStyle = getHeatmapColor(score);
                ctx.fillRect(x, y, cellW, cellH);
                ctx.fillStyle = '#ffffff';
                ctx.fillText(`${score.toFixed(0)}%`, x + 10, y + (cellH / 2));
            });
        });

        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `heatmap_${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    async function openHeatmapCellModal(subjectId, weekStart) {
        const modal = document.getElementById('heatmapStudentsModal');
        const title = document.getElementById('heatmapModalTitle');
        const tbody = document.getElementById('heatmapModalBody');
        if (!modal || !tbody || !title) return;

        tbody.innerHTML = '<tr><td colspan="4" class="loading">Загрузка...</td></tr>';
        title.textContent = `Ученики: ${new Date(weekStart).toLocaleDateString('ru-RU')}`;
        modal.hidden = false;

        try {
            const data = await apiGet('/analytics/school/advanced/heatmap/students', getFilterParams({
                subject_id: subjectId,
                week_start: weekStart
            }));
            const students = Array.isArray(data.students) ? data.students : [];
            if (!students.length) {
                tbody.innerHTML = '<tr><td colspan="4" class="loading">Нет данных</td></tr>';
                return;
            }
            tbody.innerHTML = students.map((item) => `
                <tr>
                    <td>${item.first_name || ''} ${item.last_name || ''}</td>
                    <td>${item.class_name || '—'}</td>
                    <td>${Number(item.avg_score || 0).toFixed(1)}%</td>
                    <td>${item.attempts || 0}</td>
                </tr>
            `).join('');
        } catch (error) {
            console.error(error);
            tbody.innerHTML = `<tr><td colspan="4" class="loading" style="color: var(--error);">${error.message}</td></tr>`;
        }
    }

    function closeHeatmapModal() {
        const modal = document.getElementById('heatmapStudentsModal');
        if (modal) modal.hidden = true;
    }

    async function loadHeatmap() {
        const container = document.getElementById('heatmapCanvas');
        if (container) {
            container.innerHTML = '<div class="loading">Загрузка данных...</div>';
        }
        const data = await apiGet('/analytics/school/advanced/heatmap', getFilterParams());
        renderHeatmap(Array.isArray(data.heatmap) ? data.heatmap : []);
    }

    function fillComparisonTableHead(columns) {
        const head = document.getElementById('comparisonTableHead');
        if (!head) return;
        head.innerHTML = `<tr>${columns.map((col) => `<th>${col}</th>`).join('')}</tr>`;
    }

    function populateComparisonClassSelects() {
        const selectA = document.getElementById('comparisonClassA');
        const selectB = document.getElementById('comparisonClassB');
        if (!selectA || !selectB) return;

        const classes = state.options.classes.filter((item) => {
            if (!state.filters.grade_level) return true;
            return String(item.grade_level || '') === String(state.filters.grade_level);
        });

        [selectA, selectB].forEach((select) => {
            const previous = select.value;
            select.innerHTML = '';
            classes.forEach((item) => {
                const option = document.createElement('option');
                option.value = String(item.id);
                option.textContent = item.name;
                select.appendChild(option);
            });
            if (previous && classes.some((item) => String(item.id) === previous)) {
                select.value = previous;
            }
        });
    }

    function updateComparisonModeUi() {
        const mode = document.getElementById('comparisonMode')?.value || 'default';
        const dualControls = document.querySelectorAll('.comparison-dual');
        dualControls.forEach((element) => {
            element.hidden = mode !== 'class_dual';
        });
    }

    function destroyChart(name) {
        const existing = state.charts[name];
        if (existing) {
            existing.destroy();
            state.charts[name] = null;
        }
    }

    async function renderComparisonDefault(type, rows) {
        await ensureChartJs();
        const canvas = document.getElementById('comparisonChart');
        if (!canvas) return;

        const labels = rows.map((row) => {
            if (type === 'subjects') return row.name_ru || row.name_uz || row.name || '—';
            if (type === 'students') return `${row.first_name || ''} ${row.last_name || ''}`.trim();
            return row.name || '—';
        });
        const values = rows.map((row) => Number(row.avg_score || 0));

        destroyChart('comparison');
        state.charts.comparison = new window.Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Средний балл (%)',
                    data: values,
                    backgroundColor: 'rgba(59, 130, 246, 0.75)',
                    borderColor: 'rgba(59, 130, 246, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, max: 100 }
                }
            }
        });

        fillComparisonTableHead(['Название', 'Попыток', 'Средний балл', 'Мин', 'Макс']);
        const tbody = document.getElementById('comparisonTableBody');
        if (!tbody) return;
        tbody.innerHTML = rows.map((row) => `
            <tr>
                <td>${type === 'subjects'
                    ? (row.name_ru || row.name_uz || '—')
                    : type === 'students'
                        ? `${row.first_name || ''} ${row.last_name || ''}`.trim()
                        : (row.name || '—')}</td>
                <td>${row.attempt_count || row.total_attempts || 0}</td>
                <td>${Number(row.avg_score || 0).toFixed(1)}%</td>
                <td>${Number(row.min_score || 0).toFixed(1)}%</td>
                <td>${Number(row.max_score || 0).toFixed(1)}%</td>
            </tr>
        `).join('');
    }

    async function renderComparisonClassDual(payload) {
        await ensureChartJs();
        const canvas = document.getElementById('comparisonChart');
        if (!canvas) return;

        const rows = Array.isArray(payload.data) ? payload.data : [];
        const labels = rows.map((row) => row.name_ru || row.name_uz || '—');
        const classALabel = payload.class_a?.name || 'Класс A';
        const classBLabel = payload.class_b?.name || 'Класс B';

        destroyChart('comparison');
        state.charts.comparison = new window.Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: classALabel,
                        data: rows.map((row) => Number(row.class_a_avg_score || 0)),
                        backgroundColor: 'rgba(59, 130, 246, 0.8)'
                    },
                    {
                        label: classBLabel,
                        data: rows.map((row) => Number(row.class_b_avg_score || 0)),
                        backgroundColor: 'rgba(16, 185, 129, 0.8)'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, max: 100 }
                }
            }
        });

        fillComparisonTableHead(['Предмет', classALabel, classBLabel, 'Δ']);
        const tbody = document.getElementById('comparisonTableBody');
        if (!tbody) return;
        tbody.innerHTML = rows.map((row) => `
            <tr>
                <td>${row.name_ru || row.name_uz || '—'}</td>
                <td>${Number(row.class_a_avg_score || 0).toFixed(1)}%</td>
                <td>${Number(row.class_b_avg_score || 0).toFixed(1)}%</td>
                <td>${Number(row.diff || 0).toFixed(1)}%</td>
            </tr>
        `).join('');
    }

    async function renderComparisonYearAgo(payload) {
        await ensureChartJs();
        const canvas = document.getElementById('comparisonChart');
        if (!canvas) return;

        const rows = Array.isArray(payload.data) ? payload.data : [];
        const labels = rows.map((row) => row.name_ru || row.name_uz || row.name || '—');

        destroyChart('comparison');
        state.charts.comparison = new window.Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Текущий период',
                        data: rows.map((row) => Number(row.current_avg_score || 0)),
                        backgroundColor: 'rgba(59, 130, 246, 0.8)'
                    },
                    {
                        label: 'Год назад',
                        data: rows.map((row) => Number(row.year_ago_avg_score || 0)),
                        backgroundColor: 'rgba(245, 158, 11, 0.8)'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, max: 100 }
                }
            }
        });

        fillComparisonTableHead(['Название', 'Текущий период', 'Год назад', 'Δ']);
        const tbody = document.getElementById('comparisonTableBody');
        if (!tbody) return;
        tbody.innerHTML = rows.map((row) => `
            <tr>
                <td>${row.name_ru || row.name_uz || row.name || '—'}</td>
                <td>${Number(row.current_avg_score || 0).toFixed(1)}%</td>
                <td>${Number(row.year_ago_avg_score || 0).toFixed(1)}%</td>
                <td>${Number(row.delta || 0).toFixed(1)}%</td>
            </tr>
        `).join('');
    }

    async function loadComparison() {
        const type = document.getElementById('comparisonType')?.value || 'classes';
        const mode = document.getElementById('comparisonMode')?.value || 'default';

        const params = getFilterParams({ type, mode });
        if (mode === 'class_dual') {
            const classA = document.getElementById('comparisonClassA')?.value;
            const classB = document.getElementById('comparisonClassB')?.value;
            if (!classA || !classB || classA === classB) {
                await showAlert('Для режима "Сравнить два класса" выберите два разных класса');
                return;
            }
            params.class_a_id = classA;
            params.class_b_id = classB;
        }

        const payload = await apiGet('/analytics/school/advanced/comparison', params);
        if (mode === 'class_dual') {
            await renderComparisonClassDual(payload);
            return;
        }
        if (mode === 'year_ago') {
            await renderComparisonYearAgo(payload);
            return;
        }
        await renderComparisonDefault(type, Array.isArray(payload.data) ? payload.data : []);
    }

    function renderTopList(containerId, rows, scoreClassName = 'success') {
        const container = document.getElementById(containerId);
        if (!container) return;
        if (!rows.length) {
            container.innerHTML = '<p class="loading">Нет данных</p>';
            return;
        }
        container.innerHTML = rows.map((row, index) => `
            <div class="list-item">
                <div class="list-item-header">
                    <span class="list-item-title">
                        <span class="list-item-badge">${index + 1}</span>${row.name || row.class_name || '—'}
                    </span>
                    <span class="list-item-score ${scoreClassName}">${Number(row.avg_score || 0).toFixed(1)}%</span>
                </div>
                <div class="list-item-meta">${row.total_attempts || row.attempts || 0} попыток</div>
            </div>
        `).join('');
    }

    async function loadTrends() {
        await ensureChartJs();
        const payload = await apiGet('/analytics/school/advanced/trends', getFilterParams());
        const weekly = Array.isArray(payload.weekly) ? payload.weekly : [];

        const labels = weekly.map((row) => new Date(row.week_start).toLocaleDateString('ru-RU'));
        const avgScores = weekly.map((row) => Number(row.avg_score || 0));
        const attempts = weekly.map((row) => Number(row.attempts || 0));
        const trendLine = Array.isArray(payload.trend_line)
            ? payload.trend_line.map((row) => Number(row.value || 0))
            : [];
        const anomalies = Array.isArray(payload.anomalies) ? payload.anomalies : [];

        const anomalyPoints = anomalies.map((anomaly) => {
            const index = weekly.findIndex((item) => String(item.week_start) === String(anomaly.week_start));
            if (index < 0) return null;
            return {
                x: labels[index],
                y: avgScores[index],
                label: anomaly.label,
                delta: anomaly.delta
            };
        }).filter(Boolean);

        destroyChart('trends');
        const canvas = document.getElementById('trendsChart');
        if (!canvas) return;

        state.charts.trends = new window.Chart(canvas, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Средний балл',
                        data: avgScores,
                        borderColor: 'rgba(59, 130, 246, 1)',
                        backgroundColor: 'rgba(59, 130, 246, 0.15)',
                        yAxisID: 'y1',
                        tension: 0.2
                    },
                    {
                        label: 'Линия тренда',
                        data: trendLine,
                        borderColor: 'rgba(16, 185, 129, 1)',
                        borderDash: [6, 4],
                        pointRadius: 0,
                        yAxisID: 'y1',
                        tension: 0
                    },
                    {
                        label: 'Попытки',
                        data: attempts,
                        borderColor: 'rgba(245, 158, 11, 1)',
                        backgroundColor: 'rgba(245, 158, 11, 0.2)',
                        yAxisID: 'y',
                        tension: 0.2
                    },
                    {
                        label: 'Аномалии',
                        data: anomalyPoints,
                        parsing: { xAxisKey: 'x', yAxisKey: 'y' },
                        showLine: false,
                        pointRadius: 6,
                        pointBackgroundColor: '#ef4444',
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    tooltip: {
                        callbacks: {
                            afterBody(items) {
                                const anomalyItem = items.find((item) => item.dataset.label === 'Аномалии');
                                if (!anomalyItem) return '';
                                const raw = anomalyItem.raw || {};
                                return `${raw.label || 'аномалия'} (${Number(raw.delta || 0).toFixed(1)}%)`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        type: 'linear',
                        position: 'left'
                    },
                    y1: {
                        type: 'linear',
                        position: 'right',
                        max: 100,
                        grid: { drawOnChartArea: false }
                    }
                }
            }
        });

        renderTopList('topClassesList', (payload.top_classes || []).map((item) => ({
            name: item.name,
            avg_score: item.avg_score,
            attempts: item.total_attempts
        })));

        renderTopList('needsAttentionList', (payload.needs_attention || []).map((item) => ({
            name: item.name,
            avg_score: item.avg_score,
            attempts: item.total_attempts
        })), 'error');
    }

    async function loadSubjects() {
        await ensureChartJs();
        const payload = await apiGet('/analytics/school/advanced/subjects', getFilterParams());
        const subjects = Array.isArray(payload.subjects) ? payload.subjects : [];

        const canvas = document.getElementById('subjectsChart');
        const tbody = document.getElementById('subjectsTableBody');
        if (!canvas || !tbody) return;

        destroyChart('subjects');
        state.charts.subjects = new window.Chart(canvas, {
            type: 'bar',
            data: {
                labels: subjects.map((item) => item.name_ru || item.name_uz || '—'),
                datasets: [{
                    label: 'Средний балл (%)',
                    data: subjects.map((item) => Number(item.avg_score || 0)),
                    backgroundColor: 'rgba(16, 185, 129, 0.8)'
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { beginAtZero: true, max: 100 }
                }
            }
        });

        if (!subjects.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="loading">Нет данных</td></tr>';
            return;
        }

        tbody.innerHTML = subjects.map((item) => `
            <tr>
                <td>${item.name_ru || item.name_uz || '—'}</td>
                <td>${item.test_count || 0}</td>
                <td>${item.attempt_count || 0}</td>
                <td>${Number(item.avg_score || 0).toFixed(1)}%</td>
                <td>${Number(item.avg_time_minutes || 0).toFixed(1)}</td>
            </tr>
        `).join('');
    }

    function renderTeacherStatusBadge(code, label) {
        let className = 'status-inactive-long';
        if (code === 'active') className = 'status-active';
        if (code === 'inactive') className = 'status-inactive';
        return `<span class="teacher-status ${className}">${label || '—'}</span>`;
    }

    function renderTeacherDetailBlock(details) {
        const classes = Array.isArray(details.classes) ? details.classes : [];
        const trend = Array.isArray(details.trend) ? details.trend : [];
        const tests = Array.isArray(details.tests) ? details.tests : [];

        const points = trend.map((item, idx) => {
            const x = trend.length <= 1 ? 0 : (idx / (trend.length - 1)) * 100;
            const y = 100 - Math.max(0, Math.min(100, Number(item.avg_score || 0)));
            return `${x},${y}`;
        }).join(' ');

        return `
            <div class="teacher-detail-grid">
                <div>
                    <div class="teacher-detail-title">Классы</div>
                    <div>${classes.length
                        ? classes.map((item) => `<span class="pill">${item.name}</span>`).join(' ')
                        : 'Нет данных'}</div>
                </div>
                <div>
                    <div class="teacher-detail-title">Динамика среднего балла</div>
                    <svg class="teacher-sparkline" viewBox="0 0 100 100" preserveAspectRatio="none">
                        <polyline fill="none" stroke="#3b82f6" stroke-width="2" points="${points}"></polyline>
                    </svg>
                </div>
                <div>
                    <div class="teacher-detail-title">Тесты и результаты</div>
                    <div class="teacher-detail-tests">
                        ${tests.slice(0, 12).map((test) => `
                            <div class="teacher-test-row">
                                <span>${test.title || '—'} (${test.subject_name_ru || test.subject_name_uz || '—'})</span>
                                <span>${Number(test.avg_score || 0).toFixed(1)}% · ${test.attempts || 0}</span>
                            </div>
                        `).join('') || '<div>Нет данных</div>'}
                    </div>
                </div>
            </div>
        `;
    }

    async function toggleTeacherDetails(teacherId) {
        const tbody = document.getElementById('teachersTableBody');
        if (!tbody) return;

        const existing = tbody.querySelector('tr.teacher-detail-row');
        if (existing) existing.remove();

        if (state.expandedTeacherId === teacherId) {
            state.expandedTeacherId = null;
            return;
        }

        state.expandedTeacherId = teacherId;
        const row = tbody.querySelector(`tr[data-teacher-id="${teacherId}"]`);
        if (!row) return;

        const detailRow = document.createElement('tr');
        detailRow.className = 'teacher-detail-row';
        detailRow.innerHTML = `<td colspan="7" class="loading">Загрузка детализации...</td>`;
        row.insertAdjacentElement('afterend', detailRow);

        try {
            const details = await apiGet(`/analytics/school/advanced/teachers/${encodeURIComponent(teacherId)}/details`, getFilterParams());
            detailRow.innerHTML = `<td colspan="7">${renderTeacherDetailBlock(details)}</td>`;
        } catch (error) {
            detailRow.innerHTML = `<td colspan="7" style="color: var(--error);">${error.message}</td>`;
        }
    }

    async function loadTeachers() {
        const payload = await apiGet('/analytics/school/advanced/teachers', getFilterParams({
            sort_by: state.teachersSort.by,
            sort_dir: state.teachersSort.dir
        }));
        const rows = Array.isArray(payload.teachers) ? payload.teachers : [];
        const tbody = document.getElementById('teachersTableBody');
        if (!tbody) return;

        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="loading">Нет данных</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map((row) => `
            <tr data-teacher-id="${row.id}" class="teacher-main-row">
                <td>${row.name || '—'}</td>
                <td>${row.subjects || '—'}</td>
                <td>${row.tests_created || 0}</td>
                <td>${row.tests_assigned || 0}</td>
                <td>${Number(row.avg_student_score || 0).toFixed(1)}%</td>
                <td>${row.last_activity_at ? new Date(row.last_activity_at).toLocaleDateString('ru-RU') : '—'}</td>
                <td>${renderTeacherStatusBadge(row.status_code, row.status)}</td>
            </tr>
        `).join('');

        tbody.querySelectorAll('tr.teacher-main-row').forEach((rowEl) => {
            rowEl.addEventListener('click', () => {
                const teacherId = rowEl.dataset.teacherId;
                if (teacherId) {
                    toggleTeacherDetails(teacherId).catch((error) => console.error(error));
                }
            });
        });
    }

    async function loadStudentsProgress() {
        const payload = await apiGet('/analytics/school/advanced/students-progress', getFilterParams());
        const topImproved = Array.isArray(payload.top_improved) ? payload.top_improved : [];
        const riskZone = Array.isArray(payload.risk_zone) ? payload.risk_zone : [];

        const topContainer = document.getElementById('topImprovedList');
        const riskContainer = document.getElementById('riskZoneList');
        if (!topContainer || !riskContainer) return;

        topContainer.innerHTML = topImproved.length
            ? topImproved.map((item, index) => `
                <div class="list-item">
                    <div class="list-item-header">
                        <span class="list-item-title">${index < 3 ? '🚀 ' : ''}${item.first_name || ''} ${item.last_name || ''}</span>
                        <span class="list-item-score success">+${Number(item.growth_percent || 0).toFixed(1)}%</span>
                    </div>
                    <div class="list-item-meta">
                        ${item.class_name || '—'} · ${Number(item.avg_before || 0).toFixed(1)}% → ${Number(item.avg_after || 0).toFixed(1)}%
                    </div>
                </div>
            `).join('')
            : '<p class="loading">Нет данных</p>';

        riskContainer.innerHTML = riskZone.length
            ? riskZone.slice(0, 50).map((item) => `
                <div class="list-item risk-item">
                    <div class="list-item-header">
                        <span class="list-item-title">${item.first_name || ''} ${item.last_name || ''}</span>
                        <span class="list-item-score error">${Number(item.avg_score || 0).toFixed(1)}%</span>
                    </div>
                    <div class="list-item-meta">
                        ${item.class_name || '—'} · ${item.risk_reasons.join(', ') || '—'} · не активен ${item.days_inactive || 0} дн.
                    </div>
                </div>
            `).join('')
            : '<p class="loading">Нет учеников в зоне риска</p>';
    }

    async function loadTestsAnalysis() {
        const payload = await apiGet('/analytics/school/advanced/tests-analysis', getFilterParams());
        const hardest = Array.isArray(payload.hardest_tests) ? payload.hardest_tests : [];
        const problematic = Array.isArray(payload.problematic_questions) ? payload.problematic_questions : [];
        const abandoned = Array.isArray(payload.abandoned_tests) ? payload.abandoned_tests : [];

        const hardestBody = document.getElementById('hardestTestsBody');
        const problemBody = document.getElementById('problemQuestionsBody');
        const abandonedBody = document.getElementById('abandonedTestsBody');
        if (!hardestBody || !problemBody || !abandonedBody) return;

        hardestBody.innerHTML = hardest.length
            ? hardest.map((item) => `
                <tr>
                    <td>${item.title || '—'}</td>
                    <td>${item.subject_name || '—'}</td>
                    <td>${item.teacher_name || '—'}</td>
                    <td>${Number(item.avg_score || 0).toFixed(1)}%</td>
                    <td>${item.attempts_count || 0}</td>
                </tr>
            `).join('')
            : '<tr><td colspan="5" class="loading">Нет данных</td></tr>';

        problemBody.innerHTML = problematic.length
            ? problematic.map((item) => `
                <tr>
                    <td title="${item.question_text || ''}">${item.short_text || '—'}</td>
                    <td>${item.test_title || '—'}</td>
                    <td>${Number(item.wrong_percent || 0).toFixed(1)}%</td>
                </tr>
            `).join('')
            : '<tr><td colspan="3" class="loading">Нет данных</td></tr>';

        abandonedBody.innerHTML = abandoned.length
            ? abandoned.map((item) => `
                <tr>
                    <td>${item.title || '—'}</td>
                    <td>${item.teacher_name || '—'}</td>
                    <td>${item.created_at ? new Date(item.created_at).toLocaleDateString('ru-RU') : '—'}</td>
                    <td>${item.status || '—'}</td>
                </tr>
            `).join('')
            : '<tr><td colspan="4" class="loading">Нет заброшенных тестов</td></tr>';
    }

    function getScoreClass(value) {
        const score = Number(value || 0);
        if (score < 50) return 'cell-red';
        if (score <= 70) return 'cell-yellow';
        return 'cell-green';
    }

    async function loadPeriodComparison() {
        const dimension = document.getElementById('periodComparisonDimension')?.value || 'subjects';
        const months = document.getElementById('periodComparisonMonths')?.value || '6';
        const periodAStart = document.getElementById('periodAStart')?.value || '';
        const periodAEnd = document.getElementById('periodAEnd')?.value || '';
        const periodBStart = document.getElementById('periodBStart')?.value || '';
        const periodBEnd = document.getElementById('periodBEnd')?.value || '';

        const payload = await apiGet('/analytics/school/advanced/period-comparison', getFilterParams({
            dimension,
            months,
            period_a_start: periodAStart,
            period_a_end: periodAEnd,
            period_b_start: periodBStart,
            period_b_end: periodBEnd
        }));

        const head = document.getElementById('periodComparisonHead');
        const body = document.getElementById('periodComparisonBody');
        const pairBody = document.getElementById('periodPairBody');
        if (!head || !body || !pairBody) return;

        const monthLabels = Array.isArray(payload.months) ? payload.months : [];
        const rows = Array.isArray(payload.rows) ? payload.rows : [];

        head.innerHTML = `<tr><th>${dimension === 'subjects' ? 'Предмет' : dimension === 'classes' ? 'Класс' : 'Учитель'}</th>${monthLabels.map((m) => `<th>${m}</th>`).join('')}<th>Тренд</th></tr>`;
        body.innerHTML = rows.length
            ? rows.map((row) => `
                <tr>
                    <td>${row.name || '—'}</td>
                    ${(Array.isArray(row.monthly) ? row.monthly : []).map((value) => `
                        <td class="${value === null ? '' : getScoreClass(value)}">${value === null ? '—' : `${Number(value).toFixed(1)}%`}</td>
                    `).join('')}
                    <td>${row.trend === 'up' ? '📈' : row.trend === 'down' ? '📉' : '➖'}</td>
                </tr>
            `).join('')
            : `<tr><td colspan="${monthLabels.length + 2}" class="loading">Нет данных</td></tr>`;

        const compareRows = Array.isArray(payload.compare_rows) ? payload.compare_rows : [];
        pairBody.innerHTML = compareRows.length
            ? compareRows.map((row) => `
                <tr>
                    <td>${row.name || '—'}</td>
                    <td>${Number(row.period_a_avg || 0).toFixed(1)}%</td>
                    <td>${Number(row.period_b_avg || 0).toFixed(1)}%</td>
                    <td>${Number(row.delta || 0).toFixed(1)}%</td>
                </tr>
            `).join('')
            : '<tr><td colspan="4" class="loading">Выберите даты двух периодов для сравнения</td></tr>';
    }

    async function loadActiveTab() {
        if (state.activeTab === 'heatmap') {
            await loadHeatmap();
            return;
        }
        if (state.activeTab === 'comparison') {
            await loadComparison();
            return;
        }
        if (state.activeTab === 'trends') {
            await loadTrends();
            return;
        }
        if (state.activeTab === 'subjects') {
            await loadSubjects();
            return;
        }
        if (state.activeTab === 'teachers') {
            await loadTeachers();
            return;
        }
        if (state.activeTab === 'students-progress') {
            await loadStudentsProgress();
            return;
        }
        if (state.activeTab === 'tests-analysis') {
            await loadTestsAnalysis();
            return;
        }
        if (state.activeTab === 'period-comparison') {
            await loadPeriodComparison();
        }
    }

    async function applyFiltersAndReload() {
        applyFiltersFromDom();
        renderClassOptions();
        await loadOverview();
        await loadActiveTab();
    }

    async function onSaveFilters() {
        applyFiltersFromDom();
        saveFiltersToStorage();
        await showAlert('Фильтры сохранены. При следующем открытии страницы они восстановятся.', 'Готово');
    }

    function bindEvents() {
        const root = getRoot();
        if (!root) return;

        root.querySelectorAll('.tab').forEach((tab) => {
            tab.addEventListener('click', () => switchTab(tab.dataset.tab));
        });

        const applyBtn = document.getElementById('applyAdvancedFilters');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                applyFiltersAndReload().catch((error) => {
                    console.error(error);
                    showAlert(error.message || 'Не удалось применить фильтры');
                });
            });
        }

        const saveBtn = document.getElementById('saveAdvancedFilters');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                onSaveFilters().catch((error) => {
                    console.error(error);
                    showAlert(error.message || 'Не удалось сохранить фильтры');
                });
            });
        }

        const periodPreset = document.getElementById('periodPresetFilter');
        if (periodPreset) {
            periodPreset.addEventListener('change', () => {
                const value = periodPreset.value;
                if (value && PERIOD_PRESETS[value]) {
                    const periodSelect = document.getElementById('periodFilter');
                    if (periodSelect) {
                        periodSelect.value = String(PERIOD_PRESETS[value]);
                    }
                }
            });
        }

        const gradeSelect = document.getElementById('gradeLevelFilter');
        if (gradeSelect) {
            gradeSelect.addEventListener('change', () => {
                state.filters.grade_level = gradeSelect.value || '';
                state.filters.class_id = '';
                renderClassOptions();
            });
        }

        const exportBtn = document.getElementById('exportAdvancedAnalytics');
        const exportMenu = document.getElementById('advancedExportMenu');
        if (exportBtn && exportMenu) {
            exportBtn.addEventListener('click', () => {
                exportMenu.hidden = !exportMenu.hidden;
            });
            if (!state.documentClickBound) {
                document.addEventListener('click', (event) => {
                    const dropdown = document.getElementById('advancedExportDropdown');
                    const menu = document.getElementById('advancedExportMenu');
                    if (dropdown && menu && !dropdown.contains(event.target)) {
                        menu.hidden = true;
                    }
                });
                state.documentClickBound = true;
            }
            exportMenu.querySelectorAll('[data-export-type]').forEach((item) => {
                item.addEventListener('click', async () => {
                    try {
                        applyFiltersFromDom();
                        exportMenu.hidden = true;
                        const type = item.dataset.exportType;
                        if (type === 'pdf') {
                            await apiDownload('/analytics/school/advanced/export/pdf', `advanced_analytics_${Date.now()}.pdf`, getFilterParams());
                            return;
                        }
                        await apiDownload('/analytics/school/advanced/export/excel', `advanced_analytics_${Date.now()}.xlsx`, getFilterParams());
                    } catch (error) {
                        console.error(error);
                        showAlert(error.message || 'Ошибка экспорта');
                    }
                });
            });
        }

        const downloadPngBtn = document.getElementById('downloadHeatmapPng');
        if (downloadPngBtn) {
            downloadPngBtn.addEventListener('click', downloadHeatmapAsPng);
        }

        const comparisonType = document.getElementById('comparisonType');
        const comparisonMode = document.getElementById('comparisonMode');
        const comparisonClassA = document.getElementById('comparisonClassA');
        const comparisonClassB = document.getElementById('comparisonClassB');
        [comparisonType, comparisonMode, comparisonClassA, comparisonClassB].forEach((element) => {
            if (!element) return;
            element.addEventListener('change', () => {
                updateComparisonModeUi();
                loadComparison().catch((error) => {
                    console.error(error);
                    showAlert(error.message || 'Ошибка сравнения');
                });
            });
        });

        const periodCompareApply = document.getElementById('periodCompareApply');
        if (periodCompareApply) {
            periodCompareApply.addEventListener('click', () => {
                loadPeriodComparison().catch((error) => {
                    console.error(error);
                    showAlert(error.message || 'Ошибка сравнения периодов');
                });
            });
        }

        document.querySelectorAll('#teachersTable .sortable').forEach((th) => {
            th.addEventListener('click', () => {
                const sortBy = th.dataset.sort;
                if (!sortBy) return;
                if (state.teachersSort.by === sortBy) {
                    state.teachersSort.dir = state.teachersSort.dir === 'asc' ? 'desc' : 'asc';
                } else {
                    state.teachersSort.by = sortBy;
                    state.teachersSort.dir = 'desc';
                }
                loadTeachers().catch((error) => {
                    console.error(error);
                    showAlert(error.message || 'Ошибка сортировки');
                });
            });
        });

        const modalClose = document.getElementById('heatmapModalClose');
        if (modalClose) modalClose.addEventListener('click', closeHeatmapModal);
        document.querySelectorAll('[data-modal-close]').forEach((element) => {
            element.addEventListener('click', closeHeatmapModal);
        });
    }

    async function init() {
        const root = getRoot();
        if (!root || root.dataset.analyticsInitialized === 'true') return;

        if (getCurrentUserRole() === 'superadmin' && !getSchoolScopeId()) {
            await showAlert('Для супер-админа укажите school_id в URL, чтобы открыть аналитику школы');
            return;
        }

        root.dataset.analyticsInitialized = 'true';
        restoreSavedFilters();
        if (!ensureLayout()) {
            return;
        }
        refreshTranslations();
        bindEvents();

        try {
            await loadFilterOptions();
            syncFilterControls();
            populateComparisonClassSelects();
            updateComparisonModeUi();
            await loadOverview();
            await loadActiveTab();
        } catch (error) {
            console.error('Failed to initialize advanced analytics:', error);
            await showAlert(error.message || 'Не удалось загрузить расширенную аналитику');
        }
    }

    window.AdvancedAnalytics = {
        init
    };
})();
