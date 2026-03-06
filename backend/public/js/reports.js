// Reports Center
(function () {
    'use strict';

    const API = '/api';

    const state = {
        role: '',
        period: 30,
        metric: 'avg_score',
        dimension: 'school',
        region_code: '',
        city_code: '',
        locations: { regions: [] },
        overview: null,
        comparison: null,
        geoOverview: null,
        geoTrends: null,
        risk: null,
        riskStudents: [],
        riskPagination: { page: 1, limit: 20, total: 0, has_more: false },
        riskRequestController: null,
        notifications: [],
        notificationsPagination: { page: 1, limit: 20, total: 0, pages: 1 },
        notificationsFilters: {
            channel: '',
            eventKey: '',
            status: '',
            from: '',
            to: ''
        },
        chart: null
    };

    function getToken() {
        return window.ZedlyAuth?.getAuthToken?.() || 'cookie-session';
    }

    function t(key, fallback, params) {
        const tr = window.ZedlyI18n?.translate?.(key, params);
        return tr && tr !== key ? tr : (fallback || key);
    }

    function getCurrentUser() {
        try {
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            return user && typeof user === 'object' ? user : {};
        } catch (error) {
            return {};
        }
    }

    function getUserRole() {
        return getCurrentUser().role || '';
    }

    async function apiGet(url) {
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!response.ok) {
            throw new Error(`Request failed: ${response.status}`);
        }
        return response.json();
    }

    function normalizeCode(value) {
        return String(value || '').trim().toLowerCase();
    }

    async function loadLocationsReference() {
        if (state.role !== 'superadmin') return;
        const payload = await apiGet(`${API}/superadmin/reference/locations`);
        state.locations = payload && Array.isArray(payload.regions) ? payload : { regions: [] };
    }

    function getRegionName(code) {
        if (!code || code === 'unknown') return t('schools.unknownLocation', 'Не указано');
        const region = (state.locations.regions || []).find((entry) => entry.code === code);
        return region?.name_ru || region?.name_uz || code;
    }

    function getCityName(regionCode, cityCode) {
        if (!cityCode || cityCode === 'unknown') return t('schools.unknownLocation', 'Не указано');
        const region = (state.locations.regions || []).find((entry) => entry.code === regionCode);
        const city = region?.cities?.find((entry) => entry.code === cityCode);
        return city?.name_ru || city?.name_uz || cityCode;
    }

    function populateRegionFilter() {
        const select = document.getElementById('reportsRegionFilter');
        if (!select) return;

        const options = [`<option value="">${t('reports.allRegions', 'Все области')}</option>`];
        (state.locations.regions || []).forEach((region) => {
            const selected = state.region_code === region.code ? 'selected' : '';
            options.push(`<option value="${region.code}" ${selected}>${region.name_ru || region.name_uz || region.code}</option>`);
        });
        select.innerHTML = options.join('');
    }

    function populateCityFilter() {
        const select = document.getElementById('reportsCityFilter');
        if (!select) return;

        let cities = [];
        if (state.region_code) {
            const region = (state.locations.regions || []).find((entry) => entry.code === state.region_code);
            cities = Array.isArray(region?.cities) ? region.cities : [];
        }

        const options = [`<option value="">${t('reports.allCities', 'Все города/районы')}</option>`];
        cities.forEach((city) => {
            const selected = state.city_code === city.code ? 'selected' : '';
            options.push(`<option value="${city.code}" ${selected}>${city.name_ru || city.name_uz || city.code}</option>`);
        });
        select.innerHTML = options.join('');
        select.disabled = !state.region_code;
    }

    function fmtInt(value) {
        const n = Number(value);
        return Number.isFinite(n) ? n.toLocaleString('ru-RU') : '0';
    }

    function fmtPct(value) {
        const n = Number(value);
        return Number.isFinite(n) ? `${n.toFixed(1)}%` : '-';
    }

    function setHtml(id, html) {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
    }

    function buildKpiCard(label, value, tone = '') {
        return `
            <div class="report-kpi ${tone}">
                <span>${label}</span>
                <strong>${value}</strong>
            </div>
        `;
    }

    function applyFilters(filters) {
        state.period = Number(filters?.period) || 30;
        state.metric = filters?.metric || 'avg_score';
        state.dimension = filters?.dimension || 'school';
        const period = document.getElementById('reportsPeriodFilter');
        const metric = document.getElementById('reportsMetricFilter');
        const dimension = document.getElementById('reportsDimensionFilter');
        if (period) period.value = String(state.period);
        if (metric) metric.value = state.metric;
        if (dimension) dimension.value = state.dimension;
    }

    function getDimensionLabel(dimension) {
        const map = {
            school: t('reports.dimension.school', 'Школа'),
            region: t('reports.dimension.region', 'Область'),
            city: t('reports.dimension.city', 'Город / район'),
            school_type: t('reports.dimension.schoolType', 'Тип школы'),
            ownership: t('reports.dimension.ownership', 'Собственность'),
            language_model: t('reports.dimension.languageModel', 'Языковая модель'),
            study_shift: t('reports.dimension.studyShift', 'Сменность')
        };
        return map[dimension] || t('reports.name', 'Название');
    }

    function renderSummary() {
        const role = state.role;
        if (role === 'superadmin') {
            const s = state.overview?.stats || {};
            const geoCoverage = state.geoOverview?.coverage || {};
            setHtml('reportsSummaryGrid', [
                buildKpiCard(t('reports.schools', 'Школы'), fmtInt(s.schools), 'tone-blue'),
                buildKpiCard(t('reports.students', 'Ученики'), fmtInt(s.students), 'tone-green'),
                buildKpiCard(t('reports.teachers', 'Учителя'), fmtInt(s.teachers), 'tone-cyan'),
                buildKpiCard(t('reports.tests', 'Тесты'), fmtInt(s.tests), 'tone-orange'),
                buildKpiCard(t('reports.avgScore', 'Средний балл'), fmtPct(s.avg_score), 'tone-violet'),
                buildKpiCard(t('reports.careerTests', 'Профориентационные тесты'), fmtInt(s.career_tests_completed), 'tone-rose'),
                buildKpiCard(t('statistics.geoCoverage', 'Geo coverage'), fmtPct(geoCoverage.geo_fill_rate), 'tone-green'),
                buildKpiCard(t('statistics.profileCoverage', 'Profile coverage'), fmtPct(geoCoverage.profile_fill_rate), 'tone-cyan')
            ].join(''));
            return;
        }

        const o = state.overview?.overview || {};
        setHtml('reportsSummaryGrid', [
            buildKpiCard(t('reports.students', 'Ученики'), fmtInt(o.total_students), 'tone-blue'),
            buildKpiCard(t('reports.teachers', 'Учителя'), fmtInt(o.total_teachers), 'tone-cyan'),
            buildKpiCard(t('reports.classes', 'Классы'), fmtInt(o.total_classes), 'tone-green'),
            buildKpiCard(t('dashboard.stats.subjects', 'Предметы'), fmtInt(o.total_subjects), 'tone-orange'),
            buildKpiCard(t('reports.tests', 'Тесты'), fmtInt(o.total_tests), 'tone-violet'),
            buildKpiCard(t('reports.avgScore', 'Средний балл'), fmtPct(o.average_score), 'tone-rose')
        ].join(''));
    }

    function renderTop() {
        if (state.role === 'superadmin') {
            const top = state.overview?.top_schools || [];
            if (!top.length) {
                setHtml('reportsTopTable', `<p class="text-secondary">${t('reports.noData', 'Нет данных')}</p>`);
                return;
            }
            setHtml('reportsTopTable', `
                <div class="table-responsive">
                    <table class="data-table">
                        <thead><tr><th>${t('reports.school', 'Школа')}</th><th>${t('reports.attempts', 'Попытки')}</th><th>${t('reports.avgScore', 'Средний балл')}</th></tr></thead>
                        <tbody>
                            ${top.map((row) => `
                                <tr>
                                    <td data-label="${t('reports.school', 'Школа')}">${escapeHtml(row.school_name || '-')}</td>
                                    <td data-label="${t('reports.attempts', 'Попытки')}">${fmtInt(row.attempts)}</td>
                                    <td data-label="${t('reports.avgScore', 'Средний балл')}">${fmtPct(row.avg_score)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `);
            return;
        }

        const topClasses = state.overview?.top_classes || [];
        if (!topClasses.length) {
            setHtml('reportsTopTable', `<p class="text-secondary">${t('reports.noData', 'Нет данных')}</p>`);
            return;
        }
        setHtml('reportsTopTable', `
            <div class="table-responsive">
                <table class="data-table">
                    <thead><tr><th>${t('reports.class', 'Класс')}</th><th>${t('reports.students', 'Ученики')}</th><th>${t('reports.attempts', 'Попытки')}</th><th>${t('reports.avgScore', 'Средний балл')}</th></tr></thead>
                    <tbody>
                        ${topClasses.map((row) => `
                            <tr>
                                <td data-label="${t('reports.class', 'Класс')}">${escapeHtml(row.name || '-')}</td>
                                <td data-label="${t('reports.students', 'Ученики')}">${fmtInt(row.student_count)}</td>
                                <td data-label="${t('reports.attempts', 'Попытки')}">${fmtInt(row.total_attempts)}</td>
                                <td data-label="${t('reports.avgScore', 'Средний балл')}">${fmtPct(row.avg_score)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `);
    }

    function renderActivity() {
        const activity = state.overview?.recent_activity || [];
        if (!activity.length) {
            setHtml('reportsActivityList', `<p class="text-secondary">${t('reports.noRecentActivity', 'Нет недавней активности')}</p>`);
            return;
        }

        setHtml('reportsActivityList', `
            <div class="reports-activity-list">
                ${activity.slice(0, 12).map((item) => `
                    <div class="reports-activity-item">
                        <div>
                            <strong>${escapeHtml(item.title || item.type || t('reports.recentActivity', 'Недавняя активность'))}</strong>
                            <p>${escapeHtml(item.subtitle || '')}</p>
                        </div>
                        <span>${new Date(item.date).toLocaleDateString('ru-RU')}</span>
                    </div>
                `).join('')}
            </div>
        `);
    }

    function renderComparison() {
        const rows = state.role === 'superadmin'
            ? (state.comparison?.schools || [])
            : (state.comparison?.data || []);

        if (!rows.length) {
            setHtml('reportsCompareTable', `<p class="text-secondary">${t('reports.noComparisonData', 'Нет данных для сравнения')}</p>`);
            return;
        }

        const first = rows[0] || {};
        const keyValue = Object.prototype.hasOwnProperty.call(first, 'value') ? 'value' : 'avg_score';
        const keyName = Object.prototype.hasOwnProperty.call(first, 'name') ? 'name' : (first.class_name ? 'class_name' : 'name');
        const isPercentMetric = ['avg_score', 'test_completion'].includes(state.metric);
        const nameHeader = state.role === 'superadmin'
            ? getDimensionLabel(state.dimension)
            : t('reports.name', 'Название');

        setHtml('reportsCompareTable', `
            <div class="table-responsive">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>${nameHeader}</th>
                            <th>${t('reports.mainMetric', 'Основная метрика')}</th>
                            <th>${t('common.details', 'Детали')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.slice(0, 50).map((row) => `
                            <tr>
                                <td data-label="${nameHeader}">${escapeHtml(row.dimension_name_ru || row.dimension_name_uz || row[keyName] || row.name_ru || row.subject || '-')}</td>
                                <td data-label="${t('reports.mainMetric', 'Основная метрика')}">${typeof row[keyValue] === 'number' ? (isPercentMetric ? fmtPct(row[keyValue]) : fmtInt(row[keyValue])) : escapeHtml(String(row[keyValue] ?? '-'))}</td>
                                <td data-label="${t('common.details', 'Детали')}">${escapeHtml(buildRowDetails(row))}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `);
    }

    function riskLevelLabel(level) {
        if (level === 'critical') return t('reports.riskCritical', 'Критический');
        if (level === 'high') return t('reports.riskHigh', 'Высокий');
        if (level === 'medium') return t('reports.riskMedium', 'Средний');
        return t('reports.riskSafe', 'Безопасный');
    }

    function buildCompactPaginationHtml(currentPage, totalPages, onClickHandler) {
        const safeTotal = Math.max(1, Number(totalPages) || 1);
        const safeCurrent = Math.min(Math.max(1, Number(currentPage) || 1), safeTotal);
        const pagesToRender = [];
        const pushPage = (page) => {
            if (page >= 1 && page <= safeTotal && !pagesToRender.includes(page)) {
                pagesToRender.push(page);
            }
        };

        pushPage(1);
        for (let i = safeCurrent - 2; i <= safeCurrent + 2; i++) pushPage(i);
        pushPage(safeTotal);
        pagesToRender.sort((a, b) => a - b);

        let html = '';
        if (safeCurrent > 1) {
            html += `<button class="pagination-btn" type="button" data-risk-page="${safeCurrent - 1}" onclick="${onClickHandler}">${t('reports.previous', 'Назад')}</button>`;
        }

        let prevPage = null;
        for (const page of pagesToRender) {
            if (prevPage !== null && page - prevPage > 1) {
                html += '<span class="pagination-ellipsis">...</span>';
            }
            if (page === safeCurrent) {
                html += `<button class="pagination-btn active" type="button">${page}</button>`;
            } else {
                html += `<button class="pagination-btn" type="button" data-risk-page="${page}" onclick="${onClickHandler}">${page}</button>`;
            }
            prevPage = page;
        }

        if (safeCurrent < safeTotal) {
            html += `<button class="pagination-btn" type="button" data-risk-page="${safeCurrent + 1}" onclick="${onClickHandler}">${t('reports.next', 'Далее')}</button>`;
        }

        return html;
    }

    function isNotificationsDiagnosticsEnabled() {
        return state.role === 'superadmin' || state.role === 'school_admin';
    }

    function getNotificationsEndpoint() {
        if (state.role === 'superadmin') return `${API}/superadmin/notifications/logs`;
        if (state.role === 'school_admin') return `${API}/admin/notifications/logs`;
        return '';
    }

    function formatDateTimeLocalToIso(value) {
        if (!value) return '';
        const normalized = String(value).trim();
        if (!normalized) return '';
        const d = new Date(normalized);
        if (Number.isNaN(d.getTime())) return '';
        return d.toISOString();
    }

    function buildNotificationRecipientLabel(row) {
        if (row?.recipient) return String(row.recipient);
        if (row?.channel === 'email') return '-';
        return 'n/a';
    }

    function renderNotificationLogs() {
        const card = document.getElementById('reportsNotificationsCard');
        const tableEl = document.getElementById('reportsNotificationsTable');
        if (!card || !tableEl) return;

        if (!isNotificationsDiagnosticsEnabled()) {
            card.style.display = 'none';
            return;
        }

        card.style.display = '';
        const rows = Array.isArray(state.notifications) ? state.notifications : [];
        if (!rows.length) {
            tableEl.innerHTML = `<p class="text-secondary">${t('reports.noNotificationLogs', 'Нет логов уведомлений для выбранных фильтров.')}</p>`;
            return;
        }

        const pagination = state.notificationsPagination || {};
        const totalPages = Math.max(1, Number(pagination.pages) || 1);
        const currentPage = Math.min(Math.max(1, Number(pagination.page) || 1), totalPages);
        const total = Number(pagination.total) || 0;

        tableEl.innerHTML = `
            <div class="table-responsive">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>${t('common.date', 'Дата')}</th>
                            ${state.role === 'superadmin' ? `<th>${t('reports.school', 'Школа')}</th>` : ''}
                            <th>${t('reports.user', 'Пользователь')}</th>
                            <th>${t('common.role', 'Роль')}</th>
                            <th>${t('common.channel', 'Канал')}</th>
                            <th>${t('common.event', 'Событие')}</th>
                            <th>${t('common.status', 'Статус')}</th>
                            <th>${t('reports.recipient', 'Получатель')}</th>
                            <th>${t('reports.errorField', 'Ошибка')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map((row) => `
                            <tr>
                                <td data-label="${t('common.date', 'Дата')}">${row.created_at ? new Date(row.created_at).toLocaleString('ru-RU') : '-'}</td>
                                ${state.role === 'superadmin' ? `<td data-label="${t('reports.school', 'Школа')}">${escapeHtml(row.school_name || '-')}</td>` : ''}
                                <td data-label="${t('reports.user', 'Пользователь')}">${escapeHtml(`${row.first_name || ''} ${row.last_name || ''}`.trim() || row.username || '-')}</td>
                                <td data-label="${t('common.role', 'Роль')}">${escapeHtml(row.role || '-')}</td>
                                <td data-label="${t('common.channel', 'Канал')}">${escapeHtml(row.channel || '-')}</td>
                                <td data-label="${t('common.event', 'Событие')}">${escapeHtml(row.event_key || '-')}</td>
                                <td data-label="${t('common.status', 'Статус')}">
                                    <span class="reports-notification-status ${(row.status || '').toLowerCase() === 'sent' ? 'sent' : 'failed'}">
                                        ${(String(row.status || '').toLowerCase() === 'sent')
                                            ? t('reports.statusSent', 'Отправлено')
                                            : (String(row.status || '').toLowerCase() === 'failed')
                                                ? t('reports.statusFailed', 'Ошибка')
                                                : escapeHtml(row.status || '-')}
                                    </span>
                                </td>
                                <td data-label="${t('reports.recipient', 'Получатель')}">${escapeHtml(buildNotificationRecipientLabel(row))}</td>
                                <td data-label="${t('reports.errorField', 'Ошибка')}">${escapeHtml(row.error_message || '-')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div class="reports-notification-footer">
                <span class="text-secondary">${t('common.page', 'Страница')} ${fmtInt(currentPage)} / ${fmtInt(totalPages)} В· ${t('common.total', 'Всего')}: ${fmtInt(total)}</span>
                <div class="pagination">
                    ${buildCompactPaginationHtml(currentPage, totalPages, 'window.ReportsManager.goToNotificationPageFromEvent(event)')}
                </div>
            </div>
        `;
    }

    function renderRiskDashboard() {
        const summaryEl = document.getElementById('reportsRiskSummary');
        const tableEl = document.getElementById('reportsRiskTable');
        if (!summaryEl || !tableEl) return;

        if (state.role === 'superadmin') {
            summaryEl.innerHTML = `<p class="text-secondary">${t('reports.riskDashboardUnavailable', 'Риск-дашборд доступен только для администратора школы и учителя.')}</p>`;
            tableEl.innerHTML = '';
            return;
        }

        const summary = state.risk?.summary || {};
        const students = Array.isArray(state.riskStudents) ? state.riskStudents : [];

        summaryEl.innerHTML = `
            <div class="reports-risk-kpi-grid">
                ${buildKpiCard(t('reports.riskCritical', 'Критический'), fmtInt(summary.critical_count), 'tone-rose')}
                ${buildKpiCard(t('reports.riskHigh', 'Высокий'), fmtInt(summary.high_count), 'tone-orange')}
                ${buildKpiCard(t('reports.riskMedium', 'Средний'), fmtInt(summary.medium_count), 'tone-violet')}
                ${buildKpiCard(t('reports.noAttempts', 'Без попыток'), fmtInt(summary.no_data_count), 'tone-cyan')}
            </div>
        `;

        if (!students.length) {
            tableEl.innerHTML = `<p class="text-secondary">${t('reports.noStudentsAtRisk', 'Нет учеников в зоне риска для выбранных фильтров.')}</p>`;
            return;
        }

        tableEl.innerHTML = `
            <div class="table-responsive">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>${t('reports.students', 'Ученики')}</th>
                            <th>${t('reports.class', 'Класс')}</th>
                            <th>${t('reports.score', 'Балл')}</th>
                            <th>${t('reports.attempts', 'Попытки')}</th>
                            <th>${t('reports.risk', 'Риск')}</th>
                            <th>${t('reports.lastAttempt', 'Последняя попытка')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${students.map((row) => `
                            <tr>
                                <td data-label="${t('reports.students', 'Ученики')}">${escapeHtml(`${row.first_name || ''} ${row.last_name || ''}`.trim() || row.username || '-')}</td>
                                <td data-label="${t('reports.class', 'Класс')}">${escapeHtml(row.class_name || '-')}</td>
                                <td data-label="${t('reports.score', 'Балл')}">${fmtPct(row.avg_score)}</td>
                                <td data-label="${t('reports.attempts', 'Попытки')}">${fmtInt(row.attempts_completed)}</td>
                                <td data-label="${t('reports.risk', 'Риск')}"><span class="reports-risk-badge ${escapeHtml(String(row.risk_level || 'safe'))}">${riskLevelLabel(row.risk_level)}</span></td>
                                <td data-label="${t('reports.lastAttempt', 'Последняя попытка')}">${row.last_attempt_at ? new Date(row.last_attempt_at).toLocaleDateString('ru-RU') : '-'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div style="margin-top:12px; display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;">
                <span class="text-secondary">${t('common.page', 'Страница')} ${fmtInt(state.riskPagination.page || 1)} / ${fmtInt(Math.max(1, Math.ceil((state.riskPagination.total || 0) / (state.riskPagination.limit || 20))))} В· ${t('common.total', 'Всего')}: ${fmtInt(state.riskPagination.total || 0)}</span>
                <div style="display:flex; align-items:center; gap:8px;">
                    <label for="reportsRiskLimitSelect" class="text-secondary">${t('common.perPage', 'На странице')}</label>
                    <select id="reportsRiskLimitSelect" class="filter-select" style="width:auto; min-width: 90px;">
                        <option value="20" ${(state.riskPagination.limit || 20) === 20 ? 'selected' : ''}>20</option>
                        <option value="50" ${(state.riskPagination.limit || 20) === 50 ? 'selected' : ''}>50</option>
                        <option value="100" ${(state.riskPagination.limit || 20) === 100 ? 'selected' : ''}>100</option>
                    </select>
                </div>
            </div>
            <div class="pagination">
                ${buildCompactPaginationHtml(
                    state.riskPagination.page || 1,
                    Math.max(1, Math.ceil((state.riskPagination.total || 0) / (state.riskPagination.limit || 20))),
                    'window.ReportsManager.goToRiskPageFromEvent(event)'
                )}
            </div>
        `;

        const limitSelect = document.getElementById('reportsRiskLimitSelect');
        if (limitSelect) {
            limitSelect.addEventListener('change', async (e) => {
                const nextLimit = Number.parseInt(String(e.target.value || '20'), 10);
                if (![20, 50, 100].includes(nextLimit)) return;
                try {
                    state.riskPagination.limit = nextLimit;
                    await loadRiskPage(1, false);
                    renderRiskDashboard();
                } catch (error) {
                    if (error.name === 'AbortError') return;
                    console.error('Risk limit change error:', error);
                }
            });
        }
    }

    function buildRowDetails(row) {
        const parts = [];
        if (row.region_code) parts.push(`${t('schools.region', 'Область')}: ${getRegionName(row.region_code)}`);
        if (row.city_code) parts.push(`${t('schools.city', 'Город / район')}: ${getCityName(row.region_code, row.city_code)}`);
        if (row.attempts !== undefined) parts.push(`${t('reports.attempts', 'Попытки')}: ${fmtInt(row.attempts)}`);
        if (row.total_attempts !== undefined) parts.push(`${t('common.total', 'Всего')}: ${fmtInt(row.total_attempts)}`);
        if (row.student_count !== undefined) parts.push(`${t('reports.students', 'Ученики')}: ${fmtInt(row.student_count)}`);
        if (row.attempt_count !== undefined) parts.push(`${t('reports.attempts', 'Попытки')}: ${fmtInt(row.attempt_count)}`);
        if (row.test_count !== undefined) parts.push(`${t('reports.tests', 'Тесты')}: ${fmtInt(row.test_count)}`);
        if (row.completed !== undefined) parts.push(`${t('dashboard.stats.testsCompleted', 'Завершено')}: ${fmtInt(row.completed)}`);
        return parts.length ? parts.join(' • ') : '-';
    }

    function renderInsights() {
        const insights = [];
        if (state.role === 'superadmin') {
            const summary = state.comparison?.summary || {};
            const geo = state.geoOverview?.coverage || {};
            const topRegion = (state.geoOverview?.by_region || [])[0];
            insights.push(`${t('reports.insights.topPerformer', 'Лучший результат')}: ${summary.top_performer || 'N/A'}`);
            if (summary.average !== undefined) insights.push(`${t('reports.insights.networkAverage', 'Среднее по сети')}: ${summary.average}`);
            if (summary.total_attempts !== undefined) insights.push(`${t('reports.insights.totalAttempts', 'Всего попыток')}: ${fmtInt(summary.total_attempts)}`);
            if (geo.geo_fill_rate !== undefined) insights.push(`${t('statistics.geoCoverage', 'Geo coverage')}: ${fmtPct(geo.geo_fill_rate)}`);
            if (geo.profile_fill_rate !== undefined) insights.push(`${t('statistics.profileCoverage', 'Profile coverage')}: ${fmtPct(geo.profile_fill_rate)}`);
            if (topRegion) {
                insights.push(`${t('statistics.topRegion', 'Топ регион')}: ${topRegion.region_name_ru || topRegion.region_name_uz || topRegion.region_code} (${fmtPct(topRegion.avg_score)})`);
            }
        } else {
            const subjects = state.overview?.subject_performance || [];
            if (subjects.length) {
                const best = subjects.reduce((a, b) => Number(a.avg_score || 0) > Number(b.avg_score || 0) ? a : b);
                const risk = subjects.reduce((a, b) => Number(a.avg_score || 0) < Number(b.avg_score || 0) ? a : b);
                const bestName = best.name_ru || best.name_uz || best.subject || 'N/A';
                const riskName = risk.name_ru || risk.name_uz || risk.subject || 'N/A';
                insights.push(`${t('reports.insights.bestSubject', 'Лучший предмет')}: ${bestName} (${fmtPct(best.avg_score)})`);
                insights.push(`${t('reports.insights.riskSubject', 'Предмет в зоне риска')}: ${riskName} (${fmtPct(risk.avg_score)})`);
            }
            const activity = state.overview?.recent_activity || [];
            insights.push(`${t('reports.insights.activityPoints', 'Точек активности')}: ${fmtInt(activity.length)}`);
        }

        setHtml('reportsInsights', `
            <ul class="reports-insights-list">
                ${insights.map((text) => `<li>${escapeHtml(text)}</li>`).join('')}
            </ul>
        `);
    }

    function renderTrendsChart() {
        const canvas = document.getElementById('reportsTrendsChart');
        if (!canvas || !window.Chart) return;

        const { labels, attemptsSeries, scoreSeries } = buildTrendSeries();
        if (!labels.length) {
            const empty = document.getElementById('reportsTrendsEmpty');
            if (empty) empty.style.display = 'flex';
            if (state.chart) {
                state.chart.destroy();
                state.chart = null;
            }
            return;
        }
        const empty = document.getElementById('reportsTrendsEmpty');
        if (empty) empty.style.display = 'none';
        if (state.chart) {
            state.chart.destroy();
        }

        state.chart = new window.Chart(canvas, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: t('reports.recentActivity', 'Недавняя активность'),
                        data: attemptsSeries,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59,130,246,0.15)',
                        tension: 0.3,
                        yAxisID: 'y'
                    },
                    {
                        label: t('reports.avgScore', 'Средний балл'),
                        data: scoreSeries,
                        borderColor: '#22c55e',
                        backgroundColor: 'rgba(34,197,94,0.15)',
                        tension: 0.3,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: t('reports.recentActivity', 'Недавняя активность') }
                    },
                    y1: {
                        beginAtZero: true,
                        suggestedMax: 100,
                        position: 'right',
                        grid: { drawOnChartArea: false },
                        title: { display: true, text: 'Score %' }
                    }
                }
            }
        });
    }

    function buildTrendSeries() {
        if (state.role === 'superadmin') {
            const map = new Map();
            const trendSeries = Array.isArray(state.geoTrends?.series) ? state.geoTrends.series : [];
            trendSeries.forEach((series) => {
                (series.points || []).forEach((point) => {
                    const key = formatDateOnly(point.date);
                    const prev = map.get(key) || { attempts: 0, scoreSum: 0, scoreCount: 0 };
                    prev.attempts += Number(point.completed_attempts || point.value || 0);
                    if (Number.isFinite(Number(point.value))) {
                        prev.scoreSum += Number(point.value);
                        prev.scoreCount += 1;
                    }
                    map.set(key, prev);
                });
            });

            if (!map.size) {
                const activity = state.overview?.recent_activity || [];
                activity.forEach((item) => {
                    const key = formatDateOnly(item.date);
                    const prev = map.get(key) || { attempts: 0, scoreSum: 0, scoreCount: 0 };
                    prev.attempts += 1;
                    if (Number.isFinite(Number(item.percentage))) {
                        prev.scoreSum += Number(item.percentage);
                        prev.scoreCount += 1;
                    }
                    map.set(key, prev);
                });
            }

            const labels = Array.from(map.keys()).sort((a, b) => new Date(a) - new Date(b));
            const attemptsSeries = labels.map((label) => map.get(label).attempts);
            const scoreSeries = labels.map((label) => {
                const m = map.get(label);
                return m.scoreCount ? Number((m.scoreSum / m.scoreCount).toFixed(2)) : null;
            });
            return { labels, attemptsSeries, scoreSeries };
        }

        const rows = state.overview?.recent_activity || [];
        const sorted = [...rows]
            .map((row) => ({
                date: formatDateOnly(row.date),
                attempts: Number(row.attempts || 0),
                avg: Number(row.avg_score || 0)
            }))
            .sort((a, b) => new Date(a.date) - new Date(b.date));
        return {
            labels: sorted.map((row) => row.date),
            attemptsSeries: sorted.map((row) => row.attempts),
            scoreSeries: sorted.map((row) => Number.isFinite(row.avg) ? Number(row.avg.toFixed(2)) : null)
        };
    }

    function formatDateOnly(value) {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '-';
        return d.toISOString().slice(0, 10);
    }

    async function loadNotificationLogs(page = 1) {
        if (!isNotificationsDiagnosticsEnabled()) {
            state.notifications = [];
            state.notificationsPagination = { page: 1, limit: 20, total: 0, pages: 1 };
            return;
        }

        const endpoint = getNotificationsEndpoint();
        if (!endpoint) return;

        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('limit', String(state.notificationsPagination.limit || 20));
        if (state.notificationsFilters.channel) params.set('channel', state.notificationsFilters.channel);
        if (state.notificationsFilters.eventKey) params.set('event_key', state.notificationsFilters.eventKey);
        if (state.notificationsFilters.status) params.set('status', state.notificationsFilters.status);

        const fromIso = formatDateTimeLocalToIso(state.notificationsFilters.from);
        const toIso = formatDateTimeLocalToIso(state.notificationsFilters.to);
        if (fromIso) params.set('from', fromIso);
        if (toIso) params.set('to', toIso);

        const data = await apiGet(`${endpoint}?${params.toString()}`);
        state.notifications = Array.isArray(data.logs) ? data.logs : [];
        state.notificationsPagination = {
            page: data.pagination?.page || page,
            limit: data.pagination?.limit || (state.notificationsPagination.limit || 20),
            total: data.pagination?.total || 0,
            pages: data.pagination?.pages || 1
        };
    }

    async function loadData() {
        const period = Number(state.period);
        if (state.role === 'superadmin') {
            const periodMap = { 7: 'week', 30: 'month', 90: 'quarter', 365: 'year' };
            const periodKey = periodMap[period] || 'month';
            const geoParams = new URLSearchParams();
            geoParams.set('period', String(period));
            if (state.region_code) geoParams.set('region_code', state.region_code);
            if (state.city_code) geoParams.set('city_code', state.city_code);

            const comparisonParams = new URLSearchParams();
            comparisonParams.set('metric', state.metric);
            comparisonParams.set('period', periodKey);
            comparisonParams.set('dimension', state.dimension || 'school');
            if (state.region_code) comparisonParams.set('region_code', state.region_code);
            if (state.city_code) comparisonParams.set('city_code', state.city_code);

            const trendsParams = new URLSearchParams(geoParams);
            trendsParams.set('metric', 'avg_score');
            trendsParams.set('group_by', state.dimension === 'city' ? 'city' : 'region');

            const [overview, comparison, geoOverview, geoTrends] = await Promise.all([
                apiGet(`${API}/superadmin/dashboard/overview`),
                apiGet(`${API}/superadmin/comparison?${comparisonParams.toString()}`),
                apiGet(`${API}/superadmin/analytics/geo/overview?${geoParams.toString()}`),
                apiGet(`${API}/superadmin/analytics/geo/trends?${trendsParams.toString()}`)
            ]);
            state.overview = overview;
            state.comparison = comparison;
            state.geoOverview = geoOverview;
            state.geoTrends = geoTrends;
            state.risk = null;
            state.riskStudents = [];
            state.riskPagination = { page: 1, limit: 20, total: 0, has_more: false };
            await loadNotificationLogs(1);
            return;
        }

        const [overview, comparison] = await Promise.all([
            apiGet(`${API}/analytics/school/overview?period=${encodeURIComponent(period)}`),
            apiGet(`${API}/analytics/school/comparison?type=classes`)
        ]);
        state.overview = overview;
        state.comparison = comparison;
        state.geoOverview = null;
        state.geoTrends = null;
        await loadRiskPage(1, false);
        await loadNotificationLogs(1);
    }

    async function loadRiskPage(page = 1, append = false) {
        if (state.role === 'superadmin') {
            state.risk = null;
            state.riskStudents = [];
            state.riskPagination = { page: 1, limit: 20, total: 0, has_more: false };
            return;
        }

        if (state.riskRequestController) {
            state.riskRequestController.abort();
        }
        state.riskRequestController = new AbortController();

        const period = Number(state.period) || 30;
        const limit = state.riskPagination.limit || 20;
        try {
            const response = await fetch(`${API}/analytics/school/risk-dashboard?period=${encodeURIComponent(period)}&risk_threshold=60&min_attempts=1&page=${encodeURIComponent(page)}&limit=${encodeURIComponent(limit)}`, {
                headers: { Authorization: `Bearer ${getToken()}` },
                signal: state.riskRequestController.signal
            });
            if (!response.ok) {
                throw new Error(`Request failed: ${response.status}`);
            }
            const risk = await response.json();
            state.risk = risk;
            const incoming = Array.isArray(risk.students) ? risk.students : [];
            state.riskStudents = append ? state.riskStudents.concat(incoming) : incoming;
            state.riskPagination = {
                page: risk.pagination?.page || page,
                limit: risk.pagination?.limit || limit,
                total: risk.pagination?.total || 0,
                has_more: Boolean(risk.pagination?.has_more)
            };
        } finally {
            state.riskRequestController = null;
        }
    }

    async function handleDataExport() {
        if (state.role === 'superadmin') {
            const rows = state.comparison?.schools || [];
            const header = [
                'dimension',
                'dimension_code',
                'name',
                'metric_value',
                'attempts',
                'total',
                'completed',
                'region_code',
                'city_code'
            ];
            const csv = [header.join(',')].concat(rows.map((row) => {
                const val = (input) => `"${String(input ?? '').replace(/"/g, '""')}"`;
                return [
                    val(row.dimension || state.dimension || 'school'),
                    val(row.dimension_code || row.id || ''),
                    val(row.dimension_name_ru || row.name || ''),
                    val(row.value ?? ''),
                    val(row.attempts ?? ''),
                    val(row.total ?? row.total_attempts ?? ''),
                    val(row.completed ?? ''),
                    val(row.region_code ?? ''),
                    val(row.city_code ?? '')
                ].join(',');
            })).join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            downloadBlob(blob, `superadmin_reports_${Date.now()}.csv`);
            return;
        }

        const response = await fetch(`${API}/analytics/export/school`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!response.ok) throw new Error(t('reports.exportFailed', 'Не удалось экспортировать отчеты'));
        const blob = await response.blob();
        downloadBlob(blob, `school_reports_${Date.now()}.xlsx`);
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    function handlePdfExport() {
        const root = document.querySelector('.reports-page');
        if (!root) return;

        const printWindow = window.open('', '_blank', 'width=1200,height=800');
        if (!printWindow) {
            alert(t('reports.popupBlocked', 'Всплывающее окно заблокировано. Разрешите pop-up для экспорта PDF.'));
            return;
        }

        const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
            .map((link) => `<link rel="stylesheet" href="${link.href}">`)
            .join('');
        const clone = root.cloneNode(true);
        const sourceChartCanvas = document.getElementById('reportsTrendsChart');
        const targetChartCanvas = clone.querySelector('#reportsTrendsChart');
        if (sourceChartCanvas && targetChartCanvas) {
            try {
                const image = document.createElement('img');
                image.alt = t('reports.chartAlt', 'График трендов отчетов');
                image.src = sourceChartCanvas.toDataURL('image/png', 1.0);
                image.style.width = '100%';
                image.style.maxHeight = '360px';
                image.style.objectFit = 'contain';
                targetChartCanvas.replaceWith(image);
            } catch (error) {
                // Keep canvas fallback if toDataURL fails.
            }
        }

        printWindow.document.write(`
            <html>
            <head>
                <title>${t('reports.pdfTitle', 'Отчеты PDF')}</title>
                ${styles}
                <style>
                    :root {
                        --bg-main: #f8fafc;
                        --bg-primary: #ffffff;
                        --bg-secondary: #f8fafc;
                        --bg-card: #ffffff;
                        --surface-card: #ffffff;
                        --surface-glass: #ffffff;
                        --text-primary: #0f172a;
                        --text-secondary: #475569;
                        --text-tertiary: #64748b;
                        --text-muted: #64748b;
                        --border: rgba(15, 23, 42, 0.12);
                        --border-light: rgba(15, 23, 42, 0.08);
                        --border-strong: rgba(15, 23, 42, 0.16);
                    }
                    * { color-adjust: exact; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    body {
                        background: #ffffff !important;
                        color: #0f172a !important;
                        padding: 18px;
                    }
                    .reports-page { width: 100% !important; max-width: 100% !important; }
                    .dashboard-section, .card, .surface, .surface-glass {
                        break-inside: avoid;
                        page-break-inside: avoid;
                        box-shadow: none !important;
                        border-color: rgba(15, 23, 42, 0.12) !important;
                        background: #ffffff !important;
                    }
                    .reports-toolbar .btn,
                    .reports-toolbar .toolbar-right,
                    #reportsRefreshBtn,
                    #reportsExportBtn,
                    #reportsPdfBtn {
                        display: none !important;
                    }
                    table, .data-table { border-color: rgba(15, 23, 42, 0.12) !important; }
                    .data-table th {
                        background: #f1f5f9 !important;
                        color: #334155 !important;
                    }
                </style>
            </head>
            <body>${clone.outerHTML}</body>
            </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
        }, 350);
    }

    function bindEvents() {
        const period = document.getElementById('reportsPeriodFilter');
        const metric = document.getElementById('reportsMetricFilter');
        const dimension = document.getElementById('reportsDimensionFilter');
        const region = document.getElementById('reportsRegionFilter');
        const city = document.getElementById('reportsCityFilter');
        const refresh = document.getElementById('reportsRefreshBtn');
        const exportBtn = document.getElementById('reportsExportBtn');
        const pdfBtn = document.getElementById('reportsPdfBtn');
        const notificationsChannel = document.getElementById('reportsNotificationChannel');
        const notificationsEvent = document.getElementById('reportsNotificationEvent');
        const notificationsStatus = document.getElementById('reportsNotificationStatus');
        const notificationsFrom = document.getElementById('reportsNotificationFrom');
        const notificationsTo = document.getElementById('reportsNotificationTo');
        const notificationsLimit = document.getElementById('reportsNotificationLimit');

        if (period) {
            period.addEventListener('change', () => {
                state.period = Number(period.value || 30);
                refreshView();
            });
        }
        if (metric) {
            metric.addEventListener('change', () => {
                state.metric = metric.value || 'avg_score';
                refreshView();
            });
        }
        if (dimension) {
            dimension.addEventListener('change', () => {
                state.dimension = dimension.value || 'school';
                refreshView();
            });
        }
        if (region) {
            region.addEventListener('change', () => {
                state.region_code = normalizeCode(region.value || '');
                state.city_code = '';
                populateCityFilter();
                refreshView();
            });
        }
        if (city) {
            city.addEventListener('change', () => {
                state.city_code = normalizeCode(city.value || '');
                refreshView();
            });
        }
        if (refresh) refresh.addEventListener('click', refreshView);
        if (pdfBtn) pdfBtn.addEventListener('click', handlePdfExport);
        if (exportBtn) {
            exportBtn.addEventListener('click', async () => {
                try {
                    exportBtn.disabled = true;
                    exportBtn.textContent = t('reports.exporting', 'Экспорт...');
                    await handleDataExport();
                } catch (error) {
                    console.error('Export reports error:', error);
                    alert(t('reports.exportFailed', 'Не удалось экспортировать отчеты'));
                } finally {
                    exportBtn.disabled = false;
                    exportBtn.textContent = t('reports.exportData', 'Экспорт данных');
                }
            });
        }

        const onNotificationsFilterChange = async () => {
            if (!isNotificationsDiagnosticsEnabled()) return;
            state.notificationsFilters.channel = notificationsChannel?.value || '';
            state.notificationsFilters.eventKey = notificationsEvent?.value || '';
            state.notificationsFilters.status = notificationsStatus?.value || '';
            state.notificationsFilters.from = notificationsFrom?.value || '';
            state.notificationsFilters.to = notificationsTo?.value || '';
            try {
                setHtml('reportsNotificationsTable', `<p class="text-secondary">${t('reports.loading', 'Загрузка...')}</p>`);
                await loadNotificationLogs(1);
                renderNotificationLogs();
            } catch (error) {
                console.error('Notification logs filter error:', error);
                setHtml('reportsNotificationsTable', `<p class="text-secondary">${t('reports.failedLoadNotificationLogs', 'Не удалось загрузить логи уведомлений.')}</p>`);
            }
        };

        if (notificationsChannel) notificationsChannel.addEventListener('change', onNotificationsFilterChange);
        if (notificationsEvent) notificationsEvent.addEventListener('change', onNotificationsFilterChange);
        if (notificationsStatus) notificationsStatus.addEventListener('change', onNotificationsFilterChange);
        if (notificationsFrom) notificationsFrom.addEventListener('change', onNotificationsFilterChange);
        if (notificationsTo) notificationsTo.addEventListener('change', onNotificationsFilterChange);
        if (notificationsLimit) {
            notificationsLimit.addEventListener('change', async () => {
                const nextLimit = Number.parseInt(String(notificationsLimit.value || '20'), 10);
                if (![20, 50, 100].includes(nextLimit)) return;
                state.notificationsPagination.limit = nextLimit;
                await onNotificationsFilterChange();
            });
        }
    }

    async function refreshView() {
        setHtml('reportsSummaryGrid', `<div class="report-kpi"><span>${t('reports.loading', 'Загрузка...')}</span><strong>-</strong></div>`);
        setHtml('reportsTopTable', `<p class="text-secondary">${t('reports.loading', 'Загрузка...')}</p>`);
        setHtml('reportsActivityList', `<p class="text-secondary">${t('reports.loading', 'Загрузка...')}</p>`);
        setHtml('reportsCompareTable', `<p class="text-secondary">${t('reports.loading', 'Загрузка...')}</p>`);
        setHtml('reportsInsights', `<p class="text-secondary">${t('reports.loading', 'Загрузка...')}</p>`);
        setHtml('reportsRiskSummary', `<p class="text-secondary">${t('reports.loading', 'Загрузка...')}</p>`);
        setHtml('reportsRiskTable', `<p class="text-secondary">${t('reports.loading', 'Загрузка...')}</p>`);
        setHtml('reportsNotificationsTable', `<p class="text-secondary">${t('reports.loading', 'Загрузка...')}</p>`);
        const empty = document.getElementById('reportsTrendsEmpty');
        if (empty) empty.style.display = 'none';

        try {
            await loadData();
            renderSummary();
            renderTop();
            renderActivity();
            renderComparison();
            renderInsights();
            renderTrendsChart();
            renderRiskDashboard();
            renderNotificationLogs();
        } catch (error) {
            console.error('Reports load error:', error);
            setHtml('reportsInsights', `<p class="text-secondary">${t('reports.failedLoad', 'Не удалось загрузить данные отчетов.')}</p>`);
            setHtml('reportsRiskSummary', `<p class="text-secondary">${t('reports.failedLoadRisk', 'Не удалось загрузить риск-дашборд.')}</p>`);
            setHtml('reportsRiskTable', '');
            setHtml('reportsNotificationsTable', `<p class="text-secondary">${t('reports.failedLoadNotificationLogs', 'Не удалось загрузить логи уведомлений.')}</p>`);
        }
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    async function init() {
        if (!document.getElementById('reportsSummaryGrid')) return;
        state.role = getUserRole();
        const metricWrap = document.getElementById('reportsMetricWrap');
        const dimensionWrap = document.getElementById('reportsDimensionWrap');
        const regionWrap = document.getElementById('reportsRegionWrap');
        const cityWrap = document.getElementById('reportsCityWrap');
        const notificationsCard = document.getElementById('reportsNotificationsCard');
        const notificationsLimit = document.getElementById('reportsNotificationLimit');
        if (metricWrap) {
            metricWrap.style.display = state.role === 'superadmin' ? 'block' : 'none';
        }
        if (dimensionWrap) {
            dimensionWrap.style.display = state.role === 'superadmin' ? 'block' : 'none';
        }
        if (regionWrap) {
            regionWrap.style.display = state.role === 'superadmin' ? 'block' : 'none';
        }
        if (cityWrap) {
            cityWrap.style.display = state.role === 'superadmin' ? 'block' : 'none';
        }
        if (notificationsCard) {
            notificationsCard.style.display = isNotificationsDiagnosticsEnabled() ? '' : 'none';
        }
        if (notificationsLimit) {
            notificationsLimit.value = String(state.notificationsPagination.limit || 20);
        }
        if (state.role === 'superadmin') {
            try {
                await loadLocationsReference();
            } catch (error) {
                console.error('Failed to load reports locations reference:', error);
            }
            populateRegionFilter();
            populateCityFilter();
        }
        bindEvents();
        applyFilters({ period: 30, metric: 'avg_score', dimension: 'school' });
        refreshView();
    }

    window.ReportsManager = {
        init,
        goToRiskPageFromEvent: async (event) => {
            const target = event?.currentTarget;
            const page = Number.parseInt(String(target?.dataset?.riskPage || ''), 10);
            if (!Number.isFinite(page) || page < 1) return;
            try {
                await loadRiskPage(page, false);
                renderRiskDashboard();
            } catch (error) {
                if (error.name === 'AbortError') return;
                console.error('Risk page switch error:', error);
            }
        },
        goToNotificationPageFromEvent: async (event) => {
            if (!isNotificationsDiagnosticsEnabled()) return;
            const target = event?.currentTarget;
            const page = Number.parseInt(String(target?.dataset?.riskPage || ''), 10);
            if (!Number.isFinite(page) || page < 1) return;
            try {
                await loadNotificationLogs(page);
                renderNotificationLogs();
            } catch (error) {
                console.error('Notification page switch error:', error);
                setHtml('reportsNotificationsTable', `<p class="text-secondary">${t('reports.failedLoadNotificationLogs', 'Не удалось загрузить логи уведомлений.')}</p>`);
            }
        }
    };
})();
