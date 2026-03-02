// Teacher Advanced Analytics page
(function () {
    'use strict';

    const API_BASE = '/api/teacher/advanced';
    const STORAGE_KEY = 'teacherAdvancedAnalyticsFiltersV1';

    const DEFAULT_FILTERS = {
        period_key: 'this_month',
        date_from: '',
        date_to: '',
        class_id: '',
        subject_id: ''
    };

    const state = {
        filters: { ...DEFAULT_FILTERS },
        options: {
            classes: [],
            subjects: []
        },
        activeTab: 'heatmap',
        charts: {
            comparison: null,
            trends: null
        },
        studentCharts: new Map(),
        studentsRows: [],
        studentSort: {
            key: 'status',
            dir: 'desc'
        },
        expandedStudentId: null,
        testsRows: [],
        selectedTestId: null,
        heatmap: {
            dimension: 'subjects',
            weeks: [],
            entities: [],
            rows: [],
            cellStudents: [],
            activeCell: null
        },
        chartLoadPromise: null
    };

    function getRoot() {
        return document.getElementById('advancedAnalyticsRoot');
    }

    function getAuthHeaders() {
        const token = window.ZedlyAuth?.getAuthToken?.();
        if (!token) {
            return {};
        }
        return {
            Authorization: `Bearer ${token}`
        };
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function toNumber(value, fallback = 0) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function formatPercent(value, digits = 1) {
        return `${toNumber(value, 0).toFixed(digits)}%`;
    }

    function formatDate(value) {
        if (!value) return '—';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '—';
        return date.toLocaleDateString('ru-RU');
    }

    function formatDateTime(value) {
        if (!value) return '—';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '—';
        return date.toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function formatMinutes(seconds) {
        if (!Number.isFinite(Number(seconds))) return '0.0';
        return (Number(seconds) / 60).toFixed(1);
    }

    function formatDaysLeft(daysLeft) {
        if (!Number.isFinite(Number(daysLeft))) return '—';
        const value = Number(daysLeft);
        if (value < 0) return `Просрочен (${Math.abs(value)} дн.)`;
        if (value === 0) return 'Сегодня дедлайн';
        if (value === 1) return '1 день';
        return `${value} дн.`;
    }

    function getTrendArrow(delta) {
        if (delta > 0.01) return '↑';
        if (delta < -0.01) return '↓';
        return '→';
    }

    function getStatusBadge(status) {
        if (status === 'risk') return '<span class="teacher-advanced-status risk">зона риска</span>';
        if (status === 'help') return '<span class="teacher-advanced-status help">нужна помощь</span>';
        return '<span class="teacher-advanced-status normal">в норме</span>';
    }

    function getScoreColor(score) {
        const value = toNumber(score, 0);
        if (value < 50) return '#ef4444';
        if (value < 70) return '#f97316';
        if (value < 85) return '#facc15';
        return '#22c55e';
    }

    function scoreCellClass(score) {
        const value = toNumber(score, 0);
        if (value < 50) return 'is-red';
        if (value < 70) return 'is-orange';
        if (value < 85) return 'is-yellow';
        return 'is-green';
    }

    async function ensureChartJs() {
        if (window.Chart) return;
        if (state.chartLoadPromise) {
            await state.chartLoadPromise;
            return;
        }
        state.chartLoadPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
        await state.chartLoadPromise;
    }

    function showAlert(message, title = 'Ошибка') {
        if (window.ZedlyDialog?.alert) {
            return window.ZedlyDialog.alert(message, { title });
        }
        alert(message);
        return Promise.resolve(true);
    }

    function buildQuery(params = {}) {
        const search = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (value === null || value === undefined || value === '') return;
            search.set(key, String(value));
        });
        return search.toString();
    }

    async function apiGet(path, params = {}) {
        const query = buildQuery(params);
        const response = await fetch(`${API_BASE}${path}${query ? `?${query}` : ''}`, {
            method: 'GET',
            credentials: 'include',
            headers: getAuthHeaders()
        });
        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.message || 'Не удалось загрузить данные');
        }
        return response.json();
    }

    async function apiDownload(path, filename, params = {}) {
        const query = buildQuery(params);
        const response = await fetch(`${API_BASE}${path}${query ? `?${query}` : ''}`, {
            method: 'GET',
            credentials: 'include',
            headers: getAuthHeaders()
        });
        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.message || 'Не удалось скачать файл');
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

    function closeExportMenu() {
        const menu = document.getElementById('teacherAdvancedExportMenu');
        if (menu) menu.hidden = true;
    }

    function updateExportMenuState() {
        const testPdfBtn = document.getElementById('teacherAdvancedExportTestPdf');
        if (!testPdfBtn) return;
        const hasSelectedTest = Boolean(state.selectedTestId);
        testPdfBtn.disabled = !hasSelectedTest;
        testPdfBtn.title = hasSelectedTest
            ? 'Скачать PDF отчёт по выбранному тесту'
            : 'Выберите конкретный тест через кнопку "Подробнее"';
    }

    async function handleExportAction(action) {
        if (action === 'summary_pdf') {
            await apiDownload('/export/classes-summary.pdf', `teacher_classes_summary_${Date.now()}.pdf`, getFilterParams());
            return;
        }
        if (action === 'students_excel') {
            await apiDownload('/export/students-results.xlsx', `teacher_students_results_${Date.now()}.xlsx`, getFilterParams());
            return;
        }
        if (action === 'test_pdf') {
            if (!state.selectedTestId) {
                await showAlert('Для этого экспорта выберите конкретный тест (кнопка "Подробнее" во вкладке "По тестам").');
                return;
            }
            await apiDownload(
                `/export/tests/${encodeURIComponent(state.selectedTestId)}/report.pdf`,
                `teacher_test_report_${Date.now()}.pdf`,
                getFilterParams()
            );
        }
    }

    function getFilterParams(extra = {}) {
        const params = {
            period: state.filters.period_key,
            period_key: state.filters.period_key,
            class_id: state.filters.class_id,
            subject_id: state.filters.subject_id,
            ...extra
        };
        if (state.filters.period_key === 'custom') {
            params.date_from = state.filters.date_from;
            params.date_to = state.filters.date_to;
        }
        return params;
    }

    function restoreFilters() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return;
            state.filters = {
                ...DEFAULT_FILTERS,
                ...parsed
            };
        } catch (error) {
            console.warn('Failed to restore advanced filters:', error);
        }
    }

    function saveFilters() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.filters));
    }

    function applyFiltersFromDom() {
        const period = document.getElementById('teacherAdvancedPeriod');
        const dateFrom = document.getElementById('teacherAdvancedDateFrom');
        const dateTo = document.getElementById('teacherAdvancedDateTo');
        const classFilter = document.getElementById('teacherAdvancedClass');
        const subjectFilter = document.getElementById('teacherAdvancedSubject');

        state.filters.period_key = period?.value || 'this_month';
        state.filters.date_from = dateFrom?.value || '';
        state.filters.date_to = dateTo?.value || '';
        state.filters.class_id = classFilter?.value || '';
        state.filters.subject_id = subjectFilter?.value || '';
    }

    function syncFiltersToDom() {
        const period = document.getElementById('teacherAdvancedPeriod');
        const dateFrom = document.getElementById('teacherAdvancedDateFrom');
        const dateTo = document.getElementById('teacherAdvancedDateTo');
        const classFilter = document.getElementById('teacherAdvancedClass');
        const subjectFilter = document.getElementById('teacherAdvancedSubject');

        if (period) period.value = state.filters.period_key || 'this_month';
        if (dateFrom) dateFrom.value = state.filters.date_from || '';
        if (dateTo) dateTo.value = state.filters.date_to || '';
        if (classFilter) classFilter.value = state.filters.class_id || '';
        if (subjectFilter) subjectFilter.value = state.filters.subject_id || '';
        toggleCustomDateFields();
    }

    function toggleCustomDateFields() {
        const wrap = document.getElementById('teacherAdvancedCustomDates');
        const isCustom = state.filters.period_key === 'custom';
        if (!wrap) return;
        wrap.style.display = isCustom ? 'grid' : 'none';
    }

    function renderLayout() {
        const root = getRoot();
        if (!root) return;

        root.innerHTML = `
            <div class="analytics-container teacher-advanced-page">
                <div class="page-header-section teacher-advanced-header">
                    <div>
                        <h1 class="page-main-title">Расширенная аналитика</h1>
                        <p class="page-subtitle">Учитель видит только свои классы и свои тесты</p>
                    </div>
                    <div class="export-dropdown" id="teacherAdvancedExportDropdown">
                        <button class="btn btn-outline" type="button" id="teacherAdvancedExportBtn">Экспорт</button>
                        <div class="export-menu" id="teacherAdvancedExportMenu" hidden>
                            <button class="export-menu-item" type="button" data-export-action="summary_pdf">📄 PDF — сводный отчёт по классам</button>
                            <button class="export-menu-item" type="button" data-export-action="students_excel">📊 Excel — результаты учеников</button>
                            <button class="export-menu-item" type="button" data-export-action="test_pdf" id="teacherAdvancedExportTestPdf">📄 PDF — отчёт по конкретному тесту</button>
                        </div>
                    </div>
                </div>

                <section class="filters teacher-advanced-filters">
                    <div class="filter-group">
                        <label for="teacherAdvancedPeriod">Период</label>
                        <select id="teacherAdvancedPeriod">
                            <option value="this_week">Эта неделя</option>
                            <option value="this_month">Этот месяц</option>
                            <option value="current_quarter">Текущая четверть</option>
                            <option value="academic_year">Учебный год</option>
                            <option value="custom">Произвольный диапазон</option>
                        </select>
                    </div>
                    <div class="teacher-advanced-custom-dates" id="teacherAdvancedCustomDates">
                        <div class="filter-group">
                            <label for="teacherAdvancedDateFrom">Дата от</label>
                            <input type="date" id="teacherAdvancedDateFrom" />
                        </div>
                        <div class="filter-group">
                            <label for="teacherAdvancedDateTo">Дата до</label>
                            <input type="date" id="teacherAdvancedDateTo" />
                        </div>
                    </div>
                    <div class="filter-group">
                        <label for="teacherAdvancedClass">Класс</label>
                        <select id="teacherAdvancedClass">
                            <option value="">Все мои классы</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label for="teacherAdvancedSubject">Предмет</label>
                        <select id="teacherAdvancedSubject">
                            <option value="">Все предметы</option>
                        </select>
                    </div>
                    <button class="btn btn-primary" type="button" id="teacherAdvancedApply">Применить</button>
                    <button class="btn btn-outline" type="button" id="teacherAdvancedSave">Сохранить фильтр</button>
                </section>

                <section class="analytics-grid" id="teacherAdvancedMetrics">
                    <article class="stat-card">
                        <h3>Всего учеников</h3>
                        <div class="stat-value" id="teacherMetricStudents">-</div>
                    </article>
                    <article class="stat-card">
                        <h3>Средний балл</h3>
                        <div class="stat-value" id="teacherMetricAvg">-</div>
                    </article>
                    <article class="stat-card">
                        <h3>Всего тестов пройдено</h3>
                        <div class="stat-value" id="teacherMetricCompleted">-</div>
                    </article>
                    <article class="stat-card">
                        <h3>Всего попыток</h3>
                        <div class="stat-value" id="teacherMetricAttempts">-</div>
                    </article>
                </section>

                <section class="tabs teacher-advanced-tabs" id="teacherAdvancedTabs">
                    <button class="tab active" data-tab="heatmap" type="button">Тепловая карта</button>
                    <button class="tab" data-tab="students" type="button">По ученикам</button>
                    <button class="tab" data-tab="tests" type="button">По тестам</button>
                    <button class="tab" data-tab="comparison" type="button">Сравнение классов</button>
                    <button class="tab" data-tab="trends" type="button">Тренды</button>
                    <button class="tab" data-tab="risk" type="button">Зона риска</button>
                </section>

                <section class="tab-content active" id="heatmap-content">
                    <article class="chart-card">
                        <h2>
                            <span>Средний балл по неделям</span>
                            <div class="teacher-advanced-inline-controls">
                                <select id="teacherHeatmapDimension">
                                    <option value="subjects">Строки: предметы</option>
                                    <option value="classes">Строки: классы</option>
                                </select>
                                <button class="btn btn-outline btn-sm" type="button" id="teacherHeatmapDownloadPng">Скачать PNG</button>
                            </div>
                        </h2>
                        <div class="heatmap-legend">
                            <span class="legend-title">Легенда:</span>
                            <div class="legend-item"><div class="legend-color red"></div><span>0-50%</span></div>
                            <div class="legend-item"><div class="legend-color yellow" style="background:#f97316;"></div><span>50-70%</span></div>
                            <div class="legend-item"><div class="legend-color yellow"></div><span>70-85%</span></div>
                            <div class="legend-item"><div class="legend-color green"></div><span>85-100%</span></div>
                        </div>
                        <div class="heatmap-container">
                            <div id="teacherHeatmapCanvas" class="loading">Загрузка...</div>
                        </div>
                    </article>
                </section>

                <section class="tab-content" id="students-content">
                    <article class="chart-card">
                        <h2>
                            <span>Ученики</span>
                            <div class="teacher-advanced-inline-controls">
                                <select id="teacherStudentsFilter">
                                    <option value="all">Все</option>
                                    <option value="risk">Зона риска</option>
                                    <option value="normal">В норме</option>
                                    <option value="help">Нужна помощь</option>
                                </select>
                            </div>
                        </h2>
                        <div class="table-container">
                            <table class="comparison-table teacher-advanced-table" id="teacherStudentsTable">
                                <thead>
                                    <tr>
                                        <th class="sortable" data-sort="student_name">Имя</th>
                                        <th class="sortable" data-sort="class_name">Класс</th>
                                        <th class="sortable" data-sort="avg_score">Средний балл</th>
                                        <th class="sortable" data-sort="progress">Пройдено/назначено</th>
                                        <th class="sortable" data-sort="best_subject">Лучший предмет</th>
                                        <th class="sortable" data-sort="weak_subject">Слабый предмет</th>
                                        <th class="sortable" data-sort="trend_delta">Тренд</th>
                                        <th class="sortable" data-sort="last_activity_at">Последняя активность</th>
                                        <th class="sortable" data-sort="status">Статус</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody id="teacherStudentsBody"></tbody>
                            </table>
                        </div>
                    </article>
                </section>

                <section class="tab-content" id="tests-content">
                    <article class="chart-card">
                        <h2>Тесты учителя</h2>
                        <div class="table-container">
                            <table class="comparison-table teacher-advanced-table" id="teacherTestsTable">
                                <thead>
                                    <tr>
                                        <th>Название</th>
                                        <th>Предмет</th>
                                        <th>Классы</th>
                                        <th>Статус</th>
                                        <th>Прошли</th>
                                        <th>Средний балл</th>
                                        <th>Среднее время</th>
                                        <th>Создан / дедлайн</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody id="teacherTestsBody"></tbody>
                            </table>
                        </div>
                    </article>
                    <article class="chart-card teacher-advanced-test-details" id="teacherTestDetails" style="display:none;"></article>
                </section>

                <section class="tab-content" id="comparison-content">
                    <article class="chart-card">
                        <h2>
                            <span>Сравнение классов</span>
                            <div class="teacher-advanced-inline-controls">
                                <select id="teacherComparisonMode">
                                    <option value="subjects">График по предметам</option>
                                    <option value="weeks">График по неделям</option>
                                </select>
                            </div>
                        </h2>
                        <div id="teacherComparisonState" class="loading">Загрузка...</div>
                        <div class="table-container" id="teacherComparisonTableWrap"></div>
                        <div class="chart-container small">
                            <canvas id="teacherComparisonChart"></canvas>
                        </div>
                    </article>
                </section>

                <section class="tab-content" id="trends-content">
                    <article class="chart-card">
                        <h2>
                            <span>Тренды среднего балла</span>
                            <div class="teacher-advanced-inline-controls">
                                <select id="teacherTrendsGroupBy">
                                    <option value="classes">Линии по классам</option>
                                    <option value="subjects">Линии по предметам</option>
                                </select>
                            </div>
                        </h2>
                        <div class="chart-container">
                            <canvas id="teacherTrendsChart"></canvas>
                        </div>
                        <div id="teacherTrendsAnomalies" class="teacher-advanced-anomalies"></div>
                    </article>
                </section>

                <section class="tab-content" id="risk-content">
                    <article class="chart-card">
                        <h2>Низкий балл</h2>
                        <div class="table-container">
                            <table class="comparison-table teacher-advanced-table">
                                <thead>
                                    <tr>
                                        <th>Имя</th>
                                        <th>Класс</th>
                                        <th>Средний балл</th>
                                        <th>Динамика</th>
                                    </tr>
                                </thead>
                                <tbody id="teacherRiskLowScoreBody"></tbody>
                            </table>
                        </div>
                    </article>
                    <article class="chart-card">
                        <h2>Резкое падение</h2>
                        <div class="table-container">
                            <table class="comparison-table teacher-advanced-table">
                                <thead>
                                    <tr>
                                        <th>Имя</th>
                                        <th>Класс</th>
                                        <th>Было → стало</th>
                                        <th>Разница</th>
                                    </tr>
                                </thead>
                                <tbody id="teacherRiskDropBody"></tbody>
                            </table>
                        </div>
                    </article>
                    <article class="chart-card">
                        <h2>Неактивные (более 7 дней)</h2>
                        <div class="table-container">
                            <table class="comparison-table teacher-advanced-table">
                                <thead>
                                    <tr>
                                        <th>Имя</th>
                                        <th>Класс</th>
                                        <th>Последняя активность</th>
                                        <th>Пропущено тестов</th>
                                    </tr>
                                </thead>
                                <tbody id="teacherRiskInactiveBody"></tbody>
                            </table>
                        </div>
                    </article>
                </section>
            </div>

            <div class="advanced-modal" id="teacherHeatmapModal" hidden>
                <div class="advanced-modal-backdrop" data-close-heatmap-modal></div>
                <div class="advanced-modal-content">
                    <div class="advanced-modal-header">
                        <h3 id="teacherHeatmapModalTitle">Ученики в ячейке</h3>
                        <div class="teacher-advanced-inline-controls">
                            <button type="button" class="btn btn-outline btn-sm" id="teacherHeatmapDownloadList">Скачать список</button>
                            <button type="button" class="btn btn-outline btn-sm" id="teacherHeatmapModalClose">Закрыть</button>
                        </div>
                    </div>
                    <div class="advanced-modal-body">
                        <div class="table-container">
                            <table class="comparison-table teacher-advanced-table">
                                <thead>
                                    <tr>
                                        <th>Ученик</th>
                                        <th>Класс</th>
                                        <th>Балл</th>
                                        <th>Попыток</th>
                                    </tr>
                                </thead>
                                <tbody id="teacherHeatmapModalBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function renderClassAndSubjectOptions() {
        const classSelect = document.getElementById('teacherAdvancedClass');
        const subjectSelect = document.getElementById('teacherAdvancedSubject');
        if (!classSelect || !subjectSelect) return;

        while (classSelect.options.length > 1) classSelect.remove(1);
        while (subjectSelect.options.length > 1) subjectSelect.remove(1);

        state.options.classes.forEach((item) => {
            const option = document.createElement('option');
            option.value = String(item.id);
            option.textContent = item.name;
            classSelect.appendChild(option);
        });

        state.options.subjects.forEach((item) => {
            const option = document.createElement('option');
            option.value = String(item.id);
            option.textContent = item.name;
            subjectSelect.appendChild(option);
        });

        classSelect.value = state.filters.class_id || '';
        subjectSelect.value = state.filters.subject_id || '';
    }

    async function loadFilterOptions() {
        const payload = await apiGet('/filter-options', getFilterParams());
        state.options.classes = Array.isArray(payload.classes) ? payload.classes : [];
        state.options.subjects = Array.isArray(payload.subjects) ? payload.subjects : [];
        renderClassAndSubjectOptions();
    }

    async function loadOverviewMetrics() {
        const payload = await apiGet('/overview', getFilterParams());
        const metrics = payload.metrics || {};
        const totalStudents = document.getElementById('teacherMetricStudents');
        const avg = document.getElementById('teacherMetricAvg');
        const totalCompleted = document.getElementById('teacherMetricCompleted');
        const totalAttempts = document.getElementById('teacherMetricAttempts');

        if (totalStudents) totalStudents.textContent = Number(metrics.total_students || 0);
        if (avg) avg.textContent = formatPercent(metrics.average_score, 1);
        if (totalCompleted) totalCompleted.textContent = Number(metrics.total_tests_completed || 0);
        if (totalAttempts) totalAttempts.textContent = Number(metrics.total_attempts || 0);
    }

    function switchTab(tab) {
        state.activeTab = tab;
        const root = getRoot();
        if (!root) return;
        root.querySelectorAll('.tab').forEach((item) => {
            item.classList.toggle('active', item.dataset.tab === tab);
        });
        root.querySelectorAll('.tab-content').forEach((item) => {
            item.classList.toggle('active', item.id === `${tab}-content`);
        });

        loadActiveTab().catch((error) => {
            console.error(error);
            showAlert(error.message || 'Не удалось загрузить вкладку');
        });
    }

    function renderHeatmapTable() {
        const container = document.getElementById('teacherHeatmapCanvas');
        if (!container) return;

        const { weeks, entities, rows } = state.heatmap;
        if (!weeks.length || !entities.length) {
            container.innerHTML = '<div class="loading">Нет данных для выбранных фильтров</div>';
            return;
        }

        const map = new Map(
            rows.map((row) => [`${row.entity_id}:${String(row.week_start).slice(0, 10)}`, row])
        );

        let html = `<div class="heatmap teacher-advanced-heatmap-grid" style="grid-template-columns: 220px repeat(${weeks.length}, minmax(74px, 1fr));">`;
        html += '<div class="heatmap-header">Сущность</div>';
        weeks.forEach((weekKey) => {
            const label = formatDate(`${weekKey}T00:00:00`);
            html += `<div class="heatmap-header">${escapeHtml(label)}</div>`;
        });

        entities.forEach((entity) => {
            html += `<div class="heatmap-header">${escapeHtml(entity.name)}</div>`;
            weeks.forEach((weekKey) => {
                const key = `${entity.id}:${weekKey}`;
                const row = map.get(key);
                if (!row) {
                    html += '<div class="heatmap-cell heatmap-empty">-</div>';
                    return;
                }
                const score = toNumber(row.avg_score, 0);
                const color = getScoreColor(score);
                html += `
                    <button
                        type="button"
                        class="heatmap-cell teacher-advanced-heatmap-cell"
                        data-entity-id="${escapeHtml(String(entity.id))}"
                        data-week="${escapeHtml(String(weekKey))}"
                        style="background:${color}; color:#fff;"
                        title="${escapeHtml(entity.name)}: ${score.toFixed(1)}% (${Number(row.attempts || 0)} попыток)"
                    >${score.toFixed(0)}%</button>
                `;
            });
        });

        html += '</div>';
        container.innerHTML = html;

        container.querySelectorAll('.teacher-advanced-heatmap-cell').forEach((button) => {
            button.addEventListener('click', () => {
                const entityId = button.dataset.entityId;
                const weekStart = button.dataset.week;
                if (!entityId || !weekStart) return;
                openHeatmapModal(entityId, weekStart).catch((error) => {
                    console.error(error);
                    showAlert(error.message || 'Не удалось загрузить данные по ячейке');
                });
            });
        });
    }

    async function loadHeatmap() {
        const container = document.getElementById('teacherHeatmapCanvas');
        if (container) container.innerHTML = '<div class="loading">Загрузка...</div>';
        const payload = await apiGet('/heatmap', getFilterParams({
            dimension: state.heatmap.dimension
        }));
        state.heatmap.weeks = Array.isArray(payload.weeks) ? payload.weeks : [];
        state.heatmap.entities = Array.isArray(payload.entities) ? payload.entities : [];
        state.heatmap.rows = Array.isArray(payload.heatmap) ? payload.heatmap : [];
        renderHeatmapTable();
    }

    async function openHeatmapModal(entityId, weekStart) {
        const modal = document.getElementById('teacherHeatmapModal');
        const title = document.getElementById('teacherHeatmapModalTitle');
        const tbody = document.getElementById('teacherHeatmapModalBody');
        if (!modal || !title || !tbody) return;

        tbody.innerHTML = '<tr><td colspan="4" class="loading">Загрузка...</td></tr>';
        modal.hidden = false;
        title.textContent = `Ученики за неделю ${formatDate(`${weekStart}T00:00:00`)}`;

        const payload = await apiGet('/heatmap/cell-students', getFilterParams({
            dimension: state.heatmap.dimension,
            entity_id: entityId,
            week_start: weekStart
        }));
        const students = Array.isArray(payload.students) ? payload.students : [];
        state.heatmap.cellStudents = [...students].sort((a, b) => toNumber(b.avg_score, 0) - toNumber(a.avg_score, 0));
        state.heatmap.activeCell = { entityId, weekStart };

        if (!state.heatmap.cellStudents.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="loading">Нет данных</td></tr>';
            return;
        }

        tbody.innerHTML = state.heatmap.cellStudents.map((item) => `
            <tr>
                <td>${escapeHtml(`${item.first_name || ''} ${item.last_name || ''}`.trim() || String(item.id || '—'))}</td>
                <td>${escapeHtml(item.class_name || '—')}</td>
                <td>${formatPercent(item.avg_score, 1)}</td>
                <td>${Number(item.attempts || 0)}</td>
            </tr>
        `).join('');
    }

    function closeHeatmapModal() {
        const modal = document.getElementById('teacherHeatmapModal');
        if (modal) modal.hidden = true;
    }

    function downloadHeatmapCellList() {
        if (!state.heatmap.cellStudents.length) {
            showAlert('Нет данных для скачивания');
            return;
        }
        const lines = [
            'Ученик,Класс,Балл,Попыток'
        ];
        state.heatmap.cellStudents.forEach((item) => {
            const name = `"${(`${item.first_name || ''} ${item.last_name || ''}`.trim() || String(item.id || '')).replace(/"/g, '""')}"`;
            const className = `"${String(item.class_name || '—').replace(/"/g, '""')}"`;
            const score = toNumber(item.avg_score, 0).toFixed(1);
            const attempts = Number(item.attempts || 0);
            lines.push([name, className, score, attempts].join(','));
        });
        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `heatmap_cell_${Date.now()}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    }

    function downloadHeatmapPng() {
        const { weeks, entities, rows } = state.heatmap;
        if (!weeks.length || !entities.length || !rows.length) {
            showAlert('Нет данных для экспорта PNG');
            return;
        }

        const map = new Map(
            rows.map((row) => [`${row.entity_id}:${String(row.week_start).slice(0, 10)}`, row])
        );
        const cellWidth = 105;
        const cellHeight = 34;
        const firstColWidth = 240;
        const padding = 16;
        const width = padding * 2 + firstColWidth + (weeks.length * cellWidth);
        const height = padding * 2 + cellHeight + (entities.length * cellHeight);

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
        ctx.fillRect(padding, padding, firstColWidth, cellHeight);
        ctx.fillStyle = '#ffffff';
        ctx.fillText('Сущность', padding + 8, padding + (cellHeight / 2));

        weeks.forEach((week, index) => {
            const x = padding + firstColWidth + (index * cellWidth);
            ctx.fillStyle = '#1f2937';
            ctx.fillRect(x, padding, cellWidth, cellHeight);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(formatDate(`${week}T00:00:00`), x + 8, padding + (cellHeight / 2));
        });

        entities.forEach((entity, rowIndex) => {
            const y = padding + cellHeight + (rowIndex * cellHeight);
            ctx.fillStyle = '#f3f4f6';
            ctx.fillRect(padding, y, firstColWidth, cellHeight);
            ctx.fillStyle = '#111827';
            ctx.fillText(entity.name, padding + 8, y + (cellHeight / 2));

            weeks.forEach((week, colIndex) => {
                const x = padding + firstColWidth + (colIndex * cellWidth);
                const row = map.get(`${entity.id}:${week}`);
                if (!row) {
                    ctx.fillStyle = '#e5e7eb';
                    ctx.fillRect(x, y, cellWidth, cellHeight);
                    ctx.fillStyle = '#6b7280';
                    ctx.fillText('-', x + 8, y + (cellHeight / 2));
                    return;
                }
                const score = toNumber(row.avg_score, 0);
                ctx.fillStyle = getScoreColor(score);
                ctx.fillRect(x, y, cellWidth, cellHeight);
                ctx.fillStyle = '#ffffff';
                ctx.fillText(`${score.toFixed(0)}%`, x + 8, y + (cellHeight / 2));
            });
        });

        const url = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = url;
        link.download = `heatmap_${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function sortStudentsRows(rows) {
        const key = state.studentSort.key;
        const dir = state.studentSort.dir === 'asc' ? 1 : -1;
        const sorted = [...rows];
        sorted.sort((a, b) => {
            let left = '';
            let right = '';
            if (key === 'avg_score' || key === 'trend_delta') {
                left = toNumber(a[key], 0);
                right = toNumber(b[key], 0);
            } else if (key === 'progress') {
                left = toNumber(a.completed_tests, 0) / Math.max(1, toNumber(a.assigned_tests, 0));
                right = toNumber(b.completed_tests, 0) / Math.max(1, toNumber(b.assigned_tests, 0));
            } else if (key === 'last_activity_at') {
                left = a.last_activity_at ? new Date(a.last_activity_at).getTime() : 0;
                right = b.last_activity_at ? new Date(b.last_activity_at).getTime() : 0;
            } else if (key === 'status') {
                const order = { risk: 3, help: 2, normal: 1 };
                left = order[a.status] || 0;
                right = order[b.status] || 0;
            } else {
                left = String(a[key] || '').toLowerCase();
                right = String(b[key] || '').toLowerCase();
            }
            if (left === right) return 0;
            return left > right ? dir : -dir;
        });
        return sorted;
    }

    function getFilteredStudents() {
        const filter = document.getElementById('teacherStudentsFilter')?.value || 'all';
        const rows = state.studentsRows.filter((item) => {
            if (filter === 'risk') return item.status === 'risk';
            if (filter === 'normal') return item.status === 'normal';
            if (filter === 'help') return item.status === 'help';
            return true;
        });
        return sortStudentsRows(rows);
    }

    function renderStudentsTable() {
        const tbody = document.getElementById('teacherStudentsBody');
        if (!tbody) return;

        const rows = getFilteredStudents();
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="10" class="loading">Нет данных</td></tr>';
            return;
        }

        let html = '';
        rows.forEach((item) => {
            const trendArrow = getTrendArrow(toNumber(item.trend_delta, 0));
            html += `
                <tr class="teacher-advanced-clickable-row" data-student-id="${escapeHtml(String(item.id))}">
                    <td>${escapeHtml(item.student_name || '—')}</td>
                    <td>${escapeHtml(item.class_name || '—')}</td>
                    <td>${formatPercent(item.avg_score, 1)}</td>
                    <td>${Number(item.completed_tests || 0)} / ${Number(item.assigned_tests || 0)}</td>
                    <td>${escapeHtml(item.best_subject || '—')}</td>
                    <td>${escapeHtml(item.weak_subject || '—')}</td>
                    <td>${trendArrow} ${formatPercent(item.trend_delta, 1)}</td>
                    <td>${formatDateTime(item.last_activity_at)}</td>
                    <td>${getStatusBadge(item.status)}</td>
                    <td><button class="btn btn-outline btn-sm" data-action="toggle-student" data-student-id="${escapeHtml(String(item.id))}" type="button">Подробнее</button></td>
                </tr>
            `;
            if (String(item.id) === String(state.expandedStudentId)) {
                html += `
                    <tr class="teacher-advanced-detail-row">
                        <td colspan="10">
                            <div id="teacherStudentDetail_${escapeHtml(String(item.id))}" class="teacher-advanced-detail-wrap">Загрузка детализации...</div>
                        </td>
                    </tr>
                `;
            }
        });
        tbody.innerHTML = html;
    }

    async function loadStudents() {
        const payload = await apiGet('/students', getFilterParams({ status: 'all' }));
        state.studentsRows = Array.isArray(payload.students) ? payload.students : [];
        renderStudentsTable();
        if (state.expandedStudentId) {
            await loadStudentDetails(state.expandedStudentId);
        }
    }

    function destroyStudentChart(studentId) {
        const existing = state.studentCharts.get(String(studentId));
        if (existing) {
            existing.destroy();
            state.studentCharts.delete(String(studentId));
        }
    }

    async function loadStudentDetails(studentId) {
        const container = document.getElementById(`teacherStudentDetail_${studentId}`);
        if (!container) return;
        container.innerHTML = 'Загрузка...';

        const payload = await apiGet(`/students/${encodeURIComponent(studentId)}/details`, getFilterParams());
        const progress = Array.isArray(payload.progress) ? payload.progress : [];
        const testResults = Array.isArray(payload.test_results) ? payload.test_results : [];
        const weakTopics = Array.isArray(payload.weak_topics) ? payload.weak_topics : [];
        const compare = payload.class_comparison || {};

        const canvasId = `teacherStudentProgress_${studentId}`;
        container.innerHTML = `
            <div class="teacher-advanced-student-detail-grid">
                <div class="chart-container small">
                    <canvas id="${canvasId}"></canvas>
                </div>
                <div>
                    <h4>Слабые темы</h4>
                    <div class="teacher-advanced-list">
                        ${weakTopics.length
                            ? weakTopics.map((topic) => `
                                <div class="list-item">
                                    <div class="list-item-header">
                                        <span class="list-item-title">${escapeHtml(topic.topic || '—')}</span>
                                        <span class="list-item-score error">${formatPercent(topic.wrong_percent, 1)}</span>
                                    </div>
                                    <div class="list-item-meta">Ошибок: ${Number(topic.wrong_count || 0)} из ${Number(topic.total_answers || 0)}</div>
                                </div>
                            `).join('')
                            : '<p class="loading">Нет данных</p>'}
                    </div>
                    <div class="teacher-advanced-compare-box">
                        <div>Ученик: <strong>${formatPercent(compare.student_avg_score, 1)}</strong></div>
                        <div>Класс: <strong>${formatPercent(compare.class_avg_score, 1)}</strong></div>
                        <div>Δ: <strong>${formatPercent(compare.delta, 1)}</strong></div>
                    </div>
                </div>
            </div>
            <div class="table-container">
                <table class="comparison-table teacher-advanced-table">
                    <thead>
                        <tr>
                            <th>Тест</th>
                            <th>Предмет</th>
                            <th>Балл</th>
                            <th>Время (мин)</th>
                            <th>Дата</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${testResults.length
                            ? testResults.map((row) => `
                                <tr>
                                    <td>${escapeHtml(row.test_title || '—')}</td>
                                    <td>${escapeHtml(row.subject_name || '—')}</td>
                                    <td>${formatPercent(row.score, 1)}</td>
                                    <td>${formatMinutes(row.time_spent_seconds)}</td>
                                    <td>${formatDateTime(row.completed_at)}</td>
                                </tr>
                            `).join('')
                            : '<tr><td colspan="5" class="loading">Нет результатов за период</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;

        await ensureChartJs();
        destroyStudentChart(studentId);
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const labels = progress.map((point) => formatDate(point.week_start));
        const values = progress.map((point) => (Number.isFinite(point.avg_score) ? point.avg_score : null));
        const chart = new window.Chart(canvas, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Средний балл',
                    data: values,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.2)',
                    tension: 0.2
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
        state.studentCharts.set(String(studentId), chart);
    }

    async function toggleStudentDetails(studentId) {
        if (String(state.expandedStudentId) === String(studentId)) {
            destroyStudentChart(studentId);
            state.expandedStudentId = null;
            renderStudentsTable();
            return;
        }

        if (state.expandedStudentId) {
            destroyStudentChart(state.expandedStudentId);
        }
        state.expandedStudentId = studentId;
        renderStudentsTable();
        await loadStudentDetails(studentId);
    }

    function renderTestsTable() {
        const tbody = document.getElementById('teacherTestsBody');
        if (!tbody) return;
        if (!state.testsRows.length) {
            tbody.innerHTML = '<tr><td colspan="9" class="loading">Тесты не найдены</td></tr>';
            return;
        }

        tbody.innerHTML = state.testsRows.map((row) => {
            const statusLabel = row.status === 'active'
                ? '<span class="teacher-advanced-status normal">активен</span>'
                : row.status === 'completed'
                    ? '<span class="teacher-advanced-status help">завершён</span>'
                    : '<span class="teacher-advanced-status risk">не назначен</span>';

            return `
                <tr>
                    <td>${escapeHtml(row.title || '—')}</td>
                    <td>${escapeHtml(row.subject_name || '—')}</td>
                    <td>${escapeHtml(row.assigned_classes || '—')}</td>
                    <td>${statusLabel}</td>
                    <td>${Number(row.completed_students || 0)} / ${Number(row.assigned_students || 0)}</td>
                    <td>${formatPercent(row.avg_score, 1)}</td>
                    <td>${toNumber(row.avg_time_minutes, 0).toFixed(1)} мин</td>
                    <td>${formatDate(row.created_at)} / ${formatDate(row.deadline_at)}</td>
                    <td><button type="button" class="btn btn-outline btn-sm" data-action="test-details" data-test-id="${escapeHtml(String(row.id))}">Подробнее</button></td>
                </tr>
            `;
        }).join('');
    }

    async function loadTests() {
        const payload = await apiGet('/tests', getFilterParams());
        state.testsRows = Array.isArray(payload.tests) ? payload.tests : [];
        if (state.selectedTestId) {
            const exists = state.testsRows.some((item) => String(item.id) === String(state.selectedTestId));
            if (!exists) {
                state.selectedTestId = null;
                const details = document.getElementById('teacherTestDetails');
                if (details) {
                    details.style.display = 'none';
                    details.innerHTML = '';
                }
            }
        }
        renderTestsTable();
        updateExportMenuState();
        if (state.selectedTestId) {
            await loadTestDetails(state.selectedTestId);
        }
    }

    function renderHistogramBars(histogram) {
        const bins = [
            { key: '0_20', label: '0-20%' },
            { key: '20_40', label: '20-40%' },
            { key: '40_60', label: '40-60%' },
            { key: '60_80', label: '60-80%' },
            { key: '80_100', label: '80-100%' }
        ];
        const max = Math.max(1, ...bins.map((item) => Number(histogram?.[item.key] || 0)));
        return bins.map((item) => {
            const value = Number(histogram?.[item.key] || 0);
            const width = (value / max) * 100;
            return `
                <div class="teacher-advanced-hist-row">
                    <span>${item.label}</span>
                    <div class="teacher-advanced-hist-bar"><span style="width:${width}%;"></span></div>
                    <strong>${value}</strong>
                </div>
            `;
        }).join('');
    }

    async function loadTestDetails(testId) {
        const container = document.getElementById('teacherTestDetails');
        if (!container) return;
        state.selectedTestId = testId;
        updateExportMenuState();
        container.style.display = 'block';
        container.innerHTML = 'Загрузка детализации теста...';

        const payload = await apiGet(`/tests/${encodeURIComponent(testId)}/details`, getFilterParams());
        const summary = payload.summary || {};
        const byStudents = Array.isArray(payload.results_by_students) ? payload.results_by_students : [];
        const questionAnalysis = Array.isArray(payload.question_analysis) ? payload.question_analysis : [];
        const notCompleted = Array.isArray(payload.not_completed) ? payload.not_completed : [];

        container.innerHTML = `
            <h2>${escapeHtml(payload.test?.title || 'Тест')}</h2>
            <div class="analytics-grid">
                <article class="stat-card">
                    <h3>Всего прошли</h3>
                    <div class="stat-value">${Number(summary.total_completed || 0)}</div>
                </article>
                <article class="stat-card">
                    <h3>Средний балл</h3>
                    <div class="stat-value">${formatPercent(summary.avg_score, 1)}</div>
                </article>
                <article class="stat-card">
                    <h3>Мин / Макс</h3>
                    <div class="stat-value">${formatPercent(summary.min_score, 1)} / ${formatPercent(summary.max_score, 1)}</div>
                </article>
                <article class="stat-card">
                    <h3>Среднее время</h3>
                    <div class="stat-value">${toNumber(summary.avg_time_minutes, 0).toFixed(1)} мин</div>
                </article>
            </div>

            <div class="teacher-advanced-hist-wrap">
                <h3>Распределение баллов</h3>
                ${renderHistogramBars(summary.histogram)}
            </div>

            <div class="teacher-advanced-block-header">
                <h3>Результаты по ученикам</h3>
                <button type="button" class="btn btn-outline btn-sm" id="teacherExportTestExcel">Скачать результаты Excel</button>
            </div>
            <div class="table-container">
                <table class="comparison-table teacher-advanced-table">
                    <thead>
                        <tr>
                            <th>Имя</th>
                            <th>Класс</th>
                            <th>Балл</th>
                            <th>Время</th>
                            <th>Дата</th>
                            <th>Попыток</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${byStudents.length
                            ? byStudents.map((item) => `
                                <tr class="${toNumber(item.score, 0) < 50 ? 'teacher-advanced-row-danger' : ''}">
                                    <td>${escapeHtml(item.student_name || '—')}</td>
                                    <td>${escapeHtml(item.class_name || '—')}</td>
                                    <td>${formatPercent(item.score, 1)}</td>
                                    <td>${formatMinutes(item.time_spent_seconds)} мин</td>
                                    <td>${formatDateTime(item.completed_at)}</td>
                                    <td>${Number(item.attempts_count || 0)}</td>
                                </tr>
                            `).join('')
                            : '<tr><td colspan="6" class="loading">Нет данных</td></tr>'}
                    </tbody>
                </table>
            </div>

            <h3>Анализ вопросов</h3>
            <div class="table-container">
                <table class="comparison-table teacher-advanced-table">
                    <thead>
                        <tr>
                            <th>Вопрос</th>
                            <th>% правильных</th>
                            <th>% неправильных</th>
                            <th>Прогресс</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${questionAnalysis.length
                            ? questionAnalysis.map((item) => `
                                <tr class="${toNumber(item.correct_percent, 0) < 40 ? 'teacher-advanced-row-danger' : ''}">
                                    <td>${escapeHtml(item.question_text || '—')}</td>
                                    <td>${formatPercent(item.correct_percent, 1)}</td>
                                    <td>${formatPercent(item.wrong_percent, 1)}</td>
                                    <td>
                                        <div class="teacher-advanced-progress-mix">
                                            <span class="ok" style="width:${toNumber(item.correct_percent, 0)}%"></span>
                                            <span class="bad" style="width:${toNumber(item.wrong_percent, 0)}%"></span>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')
                            : '<tr><td colspan="4" class="loading">Нет данных</td></tr>'}
                    </tbody>
                </table>
            </div>

            <h3>Кто не прошёл</h3>
            <div class="table-container">
                <table class="comparison-table teacher-advanced-table">
                    <thead>
                        <tr>
                            <th>Ученик</th>
                            <th>Класс</th>
                            <th>Статус</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${notCompleted.length
                            ? notCompleted.map((item) => `
                                <tr class="${toNumber(item.days_left, 0) < 0 ? 'teacher-advanced-row-danger' : ''}">
                                    <td>${escapeHtml(item.student_name || '—')}</td>
                                    <td>${escapeHtml(item.class_name || '—')}</td>
                                    <td>${escapeHtml(formatDaysLeft(item.days_left))}</td>
                                </tr>
                            `).join('')
                            : '<tr><td colspan="3" class="loading">Все ученики прошли тест</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;

        const exportBtn = document.getElementById('teacherExportTestExcel');
        if (exportBtn) {
            exportBtn.onclick = async () => {
                try {
                    await apiDownload(
                        `/tests/${encodeURIComponent(testId)}/results.xlsx`,
                        `test_results_${Date.now()}.xlsx`,
                        getFilterParams()
                    );
                } catch (error) {
                    console.error(error);
                    showAlert(error.message || 'Не удалось скачать Excel');
                }
            };
        }
    }

    async function loadComparison() {
        const mode = document.getElementById('teacherComparisonMode')?.value || 'subjects';
        const stateBox = document.getElementById('teacherComparisonState');
        const wrap = document.getElementById('teacherComparisonTableWrap');
        if (stateBox) stateBox.textContent = 'Загрузка...';
        if (wrap) wrap.innerHTML = '';

        const payload = await apiGet('/comparison', getFilterParams({ chart_mode: mode }));
        if (!payload.enabled) {
            if (stateBox) stateBox.textContent = 'Сравнение доступно только при наличии более одного класса.';
            destroyChart('comparison');
            return;
        }
        if (stateBox) stateBox.textContent = '';

        const classes = Array.isArray(payload.classes) ? payload.classes : [];
        const matrix = Array.isArray(payload.matrix) ? payload.matrix : [];

        if (wrap) {
            let html = `
                <table class="comparison-table teacher-advanced-table">
                    <thead>
                        <tr>
                            <th>Предмет</th>
                            ${classes.map((item) => `<th>${escapeHtml(item.name)}</th>`).join('')}
                            <th>Лучший</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            if (!matrix.length) {
                html += `<tr><td colspan="${classes.length + 2}" class="loading">Нет данных</td></tr>`;
            } else {
                html += matrix.map((row) => {
                    const bestClass = classes.find((item) => String(item.id) === String(row.best_class_id));
                    return `
                        <tr>
                            <td>${escapeHtml(row.subject_name || '—')}</td>
                            ${classes.map((item) => {
                                const value = row.scores?.[String(item.id)];
                                if (!Number.isFinite(value)) {
                                    return '<td>—</td>';
                                }
                                return `<td class="${scoreCellClass(value)}">${formatPercent(value, 1)}</td>`;
                            }).join('')}
                            <td>${escapeHtml(bestClass?.name || '—')}</td>
                        </tr>
                    `;
                }).join('');
            }
            html += '</tbody></table>';
            wrap.innerHTML = html;
        }

        await ensureChartJs();
        destroyChart('comparison');
        const chartPayload = payload.chart || {};
        const labels = Array.isArray(chartPayload.labels) ? chartPayload.labels : [];
        const datasets = Array.isArray(chartPayload.datasets) ? chartPayload.datasets : [];
        const canvas = document.getElementById('teacherComparisonChart');
        if (!canvas) return;

        state.charts.comparison = new window.Chart(canvas, {
            type: 'line',
            data: {
                labels: labels.map((label) => mode === 'weeks' ? formatDate(`${label}T00:00:00`) : label),
                datasets: datasets.map((dataset) => ({
                    label: dataset.label,
                    data: dataset.data,
                    borderColor: dataset.color,
                    backgroundColor: `${dataset.color}33`,
                    tension: 0.2
                }))
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, max: 100 }
                }
            }
        });
    }

    function renderAnomaliesList(anomalies) {
        const container = document.getElementById('teacherTrendsAnomalies');
        if (!container) return;
        if (!anomalies.length) {
            container.innerHTML = '<p class="loading">Аномалий не обнаружено</p>';
            return;
        }
        container.innerHTML = `
            <div class="teacher-advanced-list">
                ${anomalies.map((item) => `
                    <div class="list-item ${item.type === 'down' ? 'risk-item' : ''}">
                        <div class="list-item-header">
                            <span class="list-item-title">${escapeHtml(item.entity_name || '—')}</span>
                            <span class="list-item-score ${item.type === 'down' ? 'error' : 'success'}">${formatPercent(item.delta, 1)}</span>
                        </div>
                        <div class="list-item-meta">${escapeHtml(item.label || '')} · ${formatDate(`${item.week_start}T00:00:00`)}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    async function loadTrends() {
        await ensureChartJs();
        const groupBy = document.getElementById('teacherTrendsGroupBy')?.value || 'classes';
        const payload = await apiGet('/trends', getFilterParams({ group_by: groupBy }));

        const labels = Array.isArray(payload.labels) ? payload.labels : [];
        const series = Array.isArray(payload.series) ? payload.series : [];
        const anomalies = Array.isArray(payload.anomalies) ? payload.anomalies : [];
        renderAnomaliesList(anomalies);

        const labelToIndex = new Map(labels.map((value, index) => [String(value), index]));
        const downPoints = [];
        const upPoints = [];

        const datasets = [];
        series.forEach((entity) => {
            const points = Array.isArray(entity.points) ? entity.points : [];
            const values = labels.map((label) => {
                const found = points.find((item) => String(item.week_start) === String(label));
                return found && Number.isFinite(found.avg_score) ? found.avg_score : null;
            });
            datasets.push({
                label: entity.name,
                data: values,
                borderColor: entity.color,
                backgroundColor: `${entity.color}33`,
                tension: 0.2,
                entityId: String(entity.id),
                isTrendLine: false
            });

            const trendLine = Array.isArray(entity.trend_line) ? entity.trend_line : [];
            datasets.push({
                label: `${entity.name} (тренд)`,
                data: trendLine,
                borderColor: entity.color,
                borderDash: [6, 5],
                pointRadius: 0,
                fill: false,
                tension: 0,
                entityId: String(entity.id),
                isTrendLine: true
            });
        });

        anomalies.forEach((item) => {
            const index = labelToIndex.get(String(item.week_start));
            if (index === undefined) return;
            const source = series.find((entry) => String(entry.id) === String(item.entity_id));
            if (!source) return;
            const point = Array.isArray(source.points)
                ? source.points.find((entry) => String(entry.week_start) === String(item.week_start))
                : null;
            if (!point || !Number.isFinite(point.avg_score)) return;
            const dataPoint = {
                x: formatDate(`${item.week_start}T00:00:00`),
                y: point.avg_score,
                label: `${item.entity_name}: ${item.label}`
            };
            if (item.type === 'down') downPoints.push(dataPoint);
            else upPoints.push(dataPoint);
        });

        if (downPoints.length) {
            datasets.push({
                type: 'scatter',
                label: 'Резкое падение',
                data: downPoints,
                parsing: { xAxisKey: 'x', yAxisKey: 'y' },
                pointBackgroundColor: '#ef4444',
                pointBorderColor: '#ef4444',
                pointRadius: 5,
                showLine: false
            });
        }
        if (upPoints.length) {
            datasets.push({
                type: 'scatter',
                label: 'Резкий рост',
                data: upPoints,
                parsing: { xAxisKey: 'x', yAxisKey: 'y' },
                pointBackgroundColor: '#22c55e',
                pointBorderColor: '#22c55e',
                pointRadius: 5,
                showLine: false
            });
        }

        destroyChart('trends');
        const canvas = document.getElementById('teacherTrendsChart');
        if (!canvas) return;

        state.charts.trends = new window.Chart(canvas, {
            type: 'line',
            data: {
                labels: labels.map((item) => formatDate(`${item}T00:00:00`)),
                datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label(context) {
                                const value = context.parsed?.y;
                                if (!Number.isFinite(value)) {
                                    return context.dataset.label || '';
                                }
                                return `${context.dataset.label}: ${value.toFixed(1)}%`;
                            },
                            afterBody(items) {
                                const first = items.find((item) => item.dataset?.type !== 'scatter' && !item.dataset?.isTrendLine);
                                if (!first) return '';
                                const entityId = String(first.dataset?.entityId || '');
                                const dataset = series.find((entry) => String(entry.id) === entityId);
                                if (!dataset) return '';
                                const point = dataset.points?.[first.dataIndex];
                                const attempts = Number(point?.attempts || 0);
                                return `Тестов за неделю: ${attempts}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100
                    }
                }
            }
        });
    }

    function renderRiskLowScoreRows(rows) {
        const tbody = document.getElementById('teacherRiskLowScoreBody');
        if (!tbody) return;
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="loading">Нет учеников с низким баллом</td></tr>';
            return;
        }
        tbody.innerHTML = rows.map((item) => `
            <tr class="${toNumber(item.avg_score, 0) < 40 ? 'teacher-advanced-row-danger' : ''}">
                <td>${escapeHtml(item.student_name || '—')}</td>
                <td>${escapeHtml(item.class_name || '—')}</td>
                <td>${formatPercent(item.avg_score, 1)}</td>
                <td>${getTrendArrow(toNumber(item.trend_delta, 0))} ${formatPercent(item.trend_delta, 1)}</td>
            </tr>
        `).join('');
    }

    function renderRiskDropRows(rows) {
        const tbody = document.getElementById('teacherRiskDropBody');
        if (!tbody) return;
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="loading">Нет учеников с резким падением</td></tr>';
            return;
        }
        tbody.innerHTML = rows.map((item) => `
            <tr class="${toNumber(item.delta, 0) <= -15 ? 'teacher-advanced-row-danger' : ''}">
                <td>${escapeHtml(item.student_name || '—')}</td>
                <td>${escapeHtml(item.class_name || '—')}</td>
                <td>${formatPercent(item.prev_avg_score, 1)} → ${formatPercent(item.current_avg_score, 1)}</td>
                <td>${formatPercent(item.delta, 1)}</td>
            </tr>
        `).join('');
    }

    function renderRiskInactiveRows(rows) {
        const tbody = document.getElementById('teacherRiskInactiveBody');
        if (!tbody) return;
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="loading">Нет неактивных учеников</td></tr>';
            return;
        }
        tbody.innerHTML = rows.map((item) => `
            <tr class="${toNumber(item.inactive_days, 0) > 7 ? 'teacher-advanced-row-danger' : ''}">
                <td>${escapeHtml(item.student_name || '—')}</td>
                <td>${escapeHtml(item.class_name || '—')}</td>
                <td>${formatDateTime(item.last_activity_at)} (${Number(item.inactive_days || 0)} дн. назад)</td>
                <td>${Number(item.missed_tests || 0)}</td>
            </tr>
        `).join('');
    }

    async function loadRiskZone() {
        const payload = await apiGet('/risk-zone', getFilterParams());
        const blocks = payload.blocks || {};
        renderRiskLowScoreRows(Array.isArray(blocks.low_score) ? blocks.low_score : []);
        renderRiskDropRows(Array.isArray(blocks.score_drop) ? blocks.score_drop : []);
        renderRiskInactiveRows(Array.isArray(blocks.inactive) ? blocks.inactive : []);
    }

    function destroyChart(name) {
        const chart = state.charts[name];
        if (chart) {
            chart.destroy();
            state.charts[name] = null;
        }
    }

    async function loadActiveTab() {
        if (state.activeTab === 'heatmap') {
            await loadHeatmap();
            return;
        }
        if (state.activeTab === 'students') {
            await loadStudents();
            return;
        }
        if (state.activeTab === 'tests') {
            await loadTests();
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
        if (state.activeTab === 'risk') {
            await loadRiskZone();
        }
    }

    async function reloadAll() {
        applyFiltersFromDom();
        if (state.filters.period_key === 'custom' && (!state.filters.date_from || !state.filters.date_to)) {
            await showAlert('Для произвольного диапазона укажите обе даты');
            return;
        }
        closeExportMenu();
        await loadFilterOptions();
        await loadOverviewMetrics();
        await loadActiveTab();
        updateExportMenuState();
    }

    function bindEvents() {
        const root = getRoot();
        if (!root) return;

        root.querySelectorAll('#teacherAdvancedTabs .tab').forEach((button) => {
            button.addEventListener('click', () => switchTab(button.dataset.tab));
        });

        const exportBtn = document.getElementById('teacherAdvancedExportBtn');
        const exportMenu = document.getElementById('teacherAdvancedExportMenu');
        if (exportBtn && exportMenu) {
            exportBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                exportMenu.hidden = !exportMenu.hidden;
            });

            exportMenu.querySelectorAll('[data-export-action]').forEach((item) => {
                item.addEventListener('click', async () => {
                    const action = item.dataset.exportAction;
                    if (!action || item.disabled) return;
                    closeExportMenu();
                    try {
                        await handleExportAction(action);
                    } catch (error) {
                        console.error(error);
                        await showAlert(error.message || 'Не удалось выполнить экспорт');
                    }
                });
            });

            document.addEventListener('click', (event) => {
                const dropdown = document.getElementById('teacherAdvancedExportDropdown');
                if (!dropdown || !dropdown.contains(event.target)) {
                    closeExportMenu();
                }
            });
        }

        const period = document.getElementById('teacherAdvancedPeriod');
        if (period) {
            period.addEventListener('change', () => {
                state.filters.period_key = period.value || 'this_month';
                toggleCustomDateFields();
            });
        }

        const applyBtn = document.getElementById('teacherAdvancedApply');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                reloadAll().catch((error) => {
                    console.error(error);
                    showAlert(error.message || 'Не удалось применить фильтры');
                });
            });
        }

        const saveBtn = document.getElementById('teacherAdvancedSave');
        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                applyFiltersFromDom();
                saveFilters();
                await showAlert('Фильтр сохранён', 'Готово');
            });
        }

        const heatmapDimension = document.getElementById('teacherHeatmapDimension');
        if (heatmapDimension) {
            heatmapDimension.addEventListener('change', () => {
                state.heatmap.dimension = heatmapDimension.value === 'classes' ? 'classes' : 'subjects';
                loadHeatmap().catch((error) => {
                    console.error(error);
                    showAlert(error.message || 'Не удалось загрузить тепловую карту');
                });
            });
        }

        const studentsFilter = document.getElementById('teacherStudentsFilter');
        if (studentsFilter) {
            studentsFilter.addEventListener('change', renderStudentsTable);
        }

        document.querySelectorAll('#teacherStudentsTable .sortable').forEach((header) => {
            header.addEventListener('click', () => {
                const key = header.dataset.sort;
                if (!key) return;
                if (state.studentSort.key === key) {
                    state.studentSort.dir = state.studentSort.dir === 'asc' ? 'desc' : 'asc';
                } else {
                    state.studentSort.key = key;
                    state.studentSort.dir = key === 'student_name' ? 'asc' : 'desc';
                }
                renderStudentsTable();
            });
        });

        const studentsBody = document.getElementById('teacherStudentsBody');
        if (studentsBody) {
            studentsBody.addEventListener('click', (event) => {
                const button = event.target.closest('button[data-action="toggle-student"]');
                if (!button) return;
                const studentId = button.dataset.studentId;
                if (!studentId) return;
                toggleStudentDetails(studentId).catch((error) => {
                    console.error(error);
                    showAlert(error.message || 'Не удалось открыть детализацию ученика');
                });
            });
        }

        const testsBody = document.getElementById('teacherTestsBody');
        if (testsBody) {
            testsBody.addEventListener('click', (event) => {
                const button = event.target.closest('button[data-action="test-details"]');
                if (!button) return;
                const testId = button.dataset.testId;
                if (!testId) return;
                loadTestDetails(testId).catch((error) => {
                    console.error(error);
                    showAlert(error.message || 'Не удалось открыть тест');
                });
            });
        }

        const comparisonMode = document.getElementById('teacherComparisonMode');
        if (comparisonMode) {
            comparisonMode.addEventListener('change', () => {
                loadComparison().catch((error) => {
                    console.error(error);
                    showAlert(error.message || 'Не удалось обновить сравнение');
                });
            });
        }

        const trendsGroup = document.getElementById('teacherTrendsGroupBy');
        if (trendsGroup) {
            trendsGroup.addEventListener('change', () => {
                loadTrends().catch((error) => {
                    console.error(error);
                    showAlert(error.message || 'Не удалось обновить тренды');
                });
            });
        }

        const heatmapPng = document.getElementById('teacherHeatmapDownloadPng');
        if (heatmapPng) heatmapPng.addEventListener('click', downloadHeatmapPng);

        const modalClose = document.getElementById('teacherHeatmapModalClose');
        if (modalClose) modalClose.addEventListener('click', closeHeatmapModal);
        root.querySelectorAll('[data-close-heatmap-modal]').forEach((item) => {
            item.addEventListener('click', closeHeatmapModal);
        });
        const downloadList = document.getElementById('teacherHeatmapDownloadList');
        if (downloadList) downloadList.addEventListener('click', downloadHeatmapCellList);

        updateExportMenuState();
    }

    async function init() {
        const root = getRoot();
        if (!root || root.dataset.teacherAdvancedInitialized === 'true') return;
        root.dataset.teacherAdvancedInitialized = 'true';

        restoreFilters();
        renderLayout();
        renderClassAndSubjectOptions();
        syncFiltersToDom();
        bindEvents();

        try {
            await loadFilterOptions();
            syncFiltersToDom();
            await loadOverviewMetrics();
            await loadActiveTab();
        } catch (error) {
            console.error('Teacher advanced analytics init error:', error);
            await showAlert(error.message || 'Не удалось загрузить страницу');
        }
    }

    window.TeacherAdvancedAnalytics = {
        init
    };
})();
