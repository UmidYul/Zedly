// SuperAdmin Geo-first Statistics
(function () {
    'use strict';

    const API = '/api';

    const state = {
        period: 30,
        region_code: '',
        city_code: '',
        locations: { regions: [] },
        overview: null,
        charts: {
            region: null,
            schoolType: null,
            coverage: null
        }
    };

    function t(key, fallback, params) {
        const tr = window.ZedlyI18n?.translate?.(key, params);
        return tr && tr !== key ? tr : (fallback || key);
    }

    function getToken() {
        return window.ZedlyAuth?.getAuthToken?.() || 'cookie-session';
    }

    async function apiGet(url) {
        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${getToken()}`
            }
        });

        if (!response.ok) {
            throw new Error(`Request failed: ${response.status}`);
        }
        return response.json();
    }

    function fmtInt(value) {
        const n = Number(value);
        return Number.isFinite(n) ? n.toLocaleString('ru-RU') : '0';
    }

    function fmtPct(value) {
        const n = Number(value);
        return Number.isFinite(n) ? `${n.toFixed(1)}%` : '0.0%';
    }

    function setHtml(id, html) {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
    }

    function buildGeoQuery() {
        const params = new URLSearchParams();
        params.set('period', String(state.period));
        if (state.region_code) params.set('region_code', state.region_code);
        if (state.city_code) params.set('city_code', state.city_code);
        return params.toString();
    }

    function getRegionLabel(code) {
        const region = (state.locations?.regions || []).find((entry) => entry.code === code);
        return region?.name_ru || region?.name_uz || code || t('schools.unknownLocation', 'Не указано');
    }

    function getCityLabel(regionCode, cityCode) {
        const region = (state.locations?.regions || []).find((entry) => entry.code === regionCode);
        const city = region?.cities?.find((entry) => entry.code === cityCode);
        if (city) return city.name_ru || city.name_uz || city.code;
        return cityCode || t('schools.unknownLocation', 'Не указано');
    }

    async function ensureChartLib() {
        if (window.Chart) return;

        await new Promise((resolve, reject) => {
            const existing = document.querySelector('script[data-chartjs="superadmin-geo"]');
            if (existing) {
                existing.addEventListener('load', () => resolve(), { once: true });
                existing.addEventListener('error', () => reject(new Error('Failed to load Chart.js')), { once: true });
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
            script.async = true;
            script.dataset.chartjs = 'superadmin-geo';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load Chart.js'));
            document.head.appendChild(script);
        });
    }

    function destroyCharts() {
        Object.keys(state.charts).forEach((key) => {
            if (state.charts[key]) {
                state.charts[key].destroy();
                state.charts[key] = null;
            }
        });
    }

    function renderLoading() {
        setHtml('superadminStatsCards', `
            <div class="stat-card">
                <div class="stat-content">
                    <div class="stat-label">${t('dashboard.statistics.loading', 'Loading statistics...')}</div>
                    <div class="stat-value">--</div>
                </div>
            </div>
        `);
        setHtml('superadminStatsBreakdown', `<p class="text-secondary">${t('dashboard.statistics.loading', 'Loading statistics...')}</p>`);
        setHtml('superadminStatsCoverage', `<p class="text-secondary">${t('dashboard.statistics.loading', 'Loading statistics...')}</p>`);
    }

    async function loadLocations() {
        const payload = await apiGet(`${API}/superadmin/reference/locations`);
        if (!payload || !Array.isArray(payload.regions)) {
            state.locations = { regions: [] };
            return;
        }
        state.locations = payload;
    }

    function populateRegionSelect() {
        const regionSelect = document.getElementById('superadminStatsRegion');
        if (!regionSelect) return;

        const options = [`<option value="">${t('reports.allRegions', 'Все области')}</option>`];
        (state.locations.regions || []).forEach((region) => {
            const selected = state.region_code === region.code ? 'selected' : '';
            const label = region.name_ru || region.name_uz || region.code;
            options.push(`<option value="${region.code}" ${selected}>${label}</option>`);
        });
        regionSelect.innerHTML = options.join('');
    }

    function populateCitySelect() {
        const citySelect = document.getElementById('superadminStatsCity');
        if (!citySelect) return;

        let cities = [];
        if (state.region_code) {
            const region = (state.locations.regions || []).find((entry) => entry.code === state.region_code);
            cities = Array.isArray(region?.cities) ? region.cities : [];
        }

        const options = [`<option value="">${t('reports.allCities', 'Все города/районы')}</option>`];
        cities.forEach((city) => {
            const selected = state.city_code === city.code ? 'selected' : '';
            const label = city.name_ru || city.name_uz || city.code;
            options.push(`<option value="${city.code}" ${selected}>${label}</option>`);
        });

        citySelect.innerHTML = options.join('');
        citySelect.disabled = !state.region_code;
    }

    async function loadOverview() {
        const data = await apiGet(`${API}/superadmin/analytics/geo/overview?${buildGeoQuery()}`);
        state.overview = data;
    }

    function renderCards() {
        const cardsEl = document.getElementById('superadminStatsCards');
        if (!cardsEl) return;

        const kpis = state.overview?.kpis || {};
        const coverage = state.overview?.coverage || {};

        cardsEl.innerHTML = `
            <div class="stat-card">
                <div class="stat-content">
                    <div class="stat-label">${t('dashboard.stats.schools', 'Schools')}</div>
                    <div class="stat-value">${fmtInt(kpis.schools)}</div>
                    <div class="stat-change positive">${fmtPct(coverage.geo_fill_rate || 0)} ${t('statistics.geoCoverage', 'geo coverage')}</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-content">
                    <div class="stat-label">${t('dashboard.stats.users', 'Users')}</div>
                    <div class="stat-value">${fmtInt(kpis.users)}</div>
                    <div class="stat-change">${t('dashboard.stats.students', 'Students')} / ${t('dashboard.stats.teachers', 'Teachers')}</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-content">
                    <div class="stat-label">${t('dashboard.stats.completedAttempts', 'Completed Attempts')}</div>
                    <div class="stat-value">${fmtInt(kpis.completed_attempts)}</div>
                    <div class="stat-change">${t('dashboard.stats.attempts', 'Attempts')}: ${fmtInt(kpis.attempts)}</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-content">
                    <div class="stat-label">${t('dashboard.stats.avgScore', 'Average Score')}</div>
                    <div class="stat-value">${fmtPct(kpis.avg_score)}</div>
                    <div class="stat-change">${t('reports.completionRate', 'Completion Rate')}: ${fmtPct(kpis.completion_rate)}</div>
                </div>
            </div>
        `;
    }

    function renderCoverageBlock() {
        const coverage = state.overview?.coverage || {};
        setHtml('superadminStatsCoverage', `
            <div class="superadmin-coverage-grid">
                <div class="report-kpi tone-blue">
                    <span>${t('statistics.totalSchools', 'Total schools')}</span>
                    <strong>${fmtInt(coverage.total_schools)}</strong>
                </div>
                <div class="report-kpi tone-green">
                    <span>${t('statistics.geoFilled', 'Geo filled')}</span>
                    <strong>${fmtInt(coverage.geo_filled)}</strong>
                </div>
                <div class="report-kpi tone-orange">
                    <span>${t('statistics.profileFilled', 'Profile filled')}</span>
                    <strong>${fmtInt(coverage.profile_filled)}</strong>
                </div>
                <div class="report-kpi tone-rose">
                    <span>${t('statistics.geoUnknown', 'Unknown geo')}</span>
                    <strong>${fmtInt(coverage.geo_unknown)}</strong>
                </div>
            </div>
        `);
    }

    function renderRegionTable() {
        const rows = Array.isArray(state.overview?.by_region) ? state.overview.by_region : [];
        if (!rows.length) {
            setHtml('superadminStatsBreakdown', `<p class="text-secondary">${t('reports.noData', 'Нет данных')}</p>`);
            return;
        }

        setHtml('superadminStatsBreakdown', `
            <div class="table-responsive">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>${t('schools.region', 'Область')}</th>
                            <th>${t('dashboard.stats.schools', 'Schools')}</th>
                            <th>${t('dashboard.stats.users', 'Users')}</th>
                            <th>${t('dashboard.stats.completedAttempts', 'Completed Attempts')}</th>
                            <th>${t('dashboard.stats.avgScore', 'Average Score')}</th>
                            <th>${t('reports.completionRate', 'Completion Rate')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map((row) => `
                            <tr>
                                <td data-label="${t('schools.region', 'Область')}">${row.region_name_ru || row.region_name_uz || getRegionLabel(row.region_code)}</td>
                                <td data-label="${t('dashboard.stats.schools', 'Schools')}">${fmtInt(row.schools_count)}</td>
                                <td data-label="${t('dashboard.stats.users', 'Users')}">${fmtInt(row.users_total)}</td>
                                <td data-label="${t('dashboard.stats.completedAttempts', 'Completed Attempts')}">${fmtInt(row.completed_attempts)}</td>
                                <td data-label="${t('dashboard.stats.avgScore', 'Average Score')}">${fmtPct(row.avg_score)}</td>
                                <td data-label="${t('reports.completionRate', 'Completion Rate')}">${fmtPct(row.completion_rate)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `);
    }

    async function renderCharts() {
        await ensureChartLib();
        destroyCharts();

        const regionRows = Array.isArray(state.overview?.by_region) ? state.overview.by_region.slice(0, 10) : [];
        const schoolTypeRows = Array.isArray(state.overview?.distributions?.school_type)
            ? state.overview.distributions.school_type
            : [];
        const coverage = state.overview?.coverage || {};

        const regionCanvas = document.getElementById('superadminRegionChart');
        if (regionCanvas && regionRows.length) {
            state.charts.region = new window.Chart(regionCanvas, {
                type: 'bar',
                data: {
                    labels: regionRows.map((row) => row.region_name_ru || row.region_name_uz || getRegionLabel(row.region_code)),
                    datasets: [{
                        label: t('dashboard.stats.avgScore', 'Average Score'),
                        data: regionRows.map((row) => Number(row.avg_score) || 0),
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            suggestedMax: 100
                        }
                    }
                }
            });
        }

        const schoolTypeCanvas = document.getElementById('superadminSchoolTypeChart');
        if (schoolTypeCanvas && schoolTypeRows.length) {
            state.charts.schoolType = new window.Chart(schoolTypeCanvas, {
                type: 'doughnut',
                data: {
                    labels: schoolTypeRows.map((row) => row.value_name_ru || row.value_name_uz || row.value_code),
                    datasets: [{
                        data: schoolTypeRows.map((row) => Number(row.schools_count) || 0)
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false
                }
            });
        }

        const coverageCanvas = document.getElementById('superadminCoverageChart');
        if (coverageCanvas) {
            state.charts.coverage = new window.Chart(coverageCanvas, {
                type: 'doughnut',
                data: {
                    labels: [
                        t('statistics.geoFilled', 'Geo filled'),
                        t('statistics.geoUnknown', 'Unknown geo')
                    ],
                    datasets: [{
                        data: [
                            Number(coverage.geo_filled) || 0,
                            Number(coverage.geo_unknown) || 0
                        ]
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false
                }
            });
        }
    }

    async function refresh() {
        renderLoading();
        await loadOverview();
        renderCards();
        renderCoverageBlock();
        renderRegionTable();
        await renderCharts();
    }

    function bindFilters() {
        const periodEl = document.getElementById('superadminStatsPeriod');
        const regionEl = document.getElementById('superadminStatsRegion');
        const cityEl = document.getElementById('superadminStatsCity');

        if (periodEl) {
            periodEl.addEventListener('change', async () => {
                const parsed = Number.parseInt(String(periodEl.value || '30'), 10);
                state.period = [7, 30, 90, 365].includes(parsed) ? parsed : 30;
                await refresh();
            });
        }

        if (regionEl) {
            regionEl.addEventListener('change', async () => {
                state.region_code = regionEl.value || '';
                state.city_code = '';
                populateCitySelect();
                await refresh();
            });
        }

        if (cityEl) {
            cityEl.addEventListener('change', async () => {
                state.city_code = cityEl.value || '';
                await refresh();
            });
        }
    }

    async function init() {
        if (!document.getElementById('superadminStatsCards')) return;

        try {
            bindFilters();
            await loadLocations();
            populateRegionSelect();
            populateCitySelect();
            await refresh();
        } catch (error) {
            console.error('Superadmin stats init error:', error);
            setHtml('superadminStatsCards', `<p class="text-secondary">${t('dashboard.statistics.errorUnableLoad', 'Unable to load statistics')}</p>`);
            setHtml('superadminStatsBreakdown', '');
            setHtml('superadminStatsCoverage', '');
        }
    }

    window.SuperadminStats = {
        init
    };
})();
