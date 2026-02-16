// Reports Center
(function () {
    'use strict';

    const API = '/api';

    const state = {
        role: '',
        period: 30,
        metric: 'avg_score',
        overview: null,
        comparison: null,
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
        return localStorage.getItem('access_token') || '';
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
        const period = document.getElementById('reportsPeriodFilter');
        const metric = document.getElementById('reportsMetricFilter');
        if (period) period.value = String(state.period);
        if (metric) metric.value = state.metric;
    }

    function renderSummary() {
        const role = state.role;
        if (role === 'superadmin') {
            const s = state.overview?.stats || {};
            setHtml('reportsSummaryGrid', [
                buildKpiCard(t('reports.schools', 'РЁРєРѕР»С‹'), fmtInt(s.schools), 'tone-blue'),
                buildKpiCard(t('reports.students', 'РЈС‡РµРЅРёРєРё'), fmtInt(s.students), 'tone-green'),
                buildKpiCard(t('reports.teachers', 'РЈС‡РёС‚РµР»СЏ'), fmtInt(s.teachers), 'tone-cyan'),
                buildKpiCard(t('reports.tests', 'РўРµСЃС‚С‹'), fmtInt(s.tests), 'tone-orange'),
                buildKpiCard(t('reports.avgScore', 'РЎСЂРµРґРЅРёР№ Р±Р°Р»Р»'), fmtPct(s.avg_score), 'tone-violet'),
                buildKpiCard(t('reports.careerTests', 'РџСЂРѕС„РѕСЂРёРµРЅС‚Р°С†РёРѕРЅРЅС‹Рµ С‚РµСЃС‚С‹'), fmtInt(s.career_tests_completed), 'tone-rose')
            ].join(''));
            return;
        }

        const o = state.overview?.overview || {};
        setHtml('reportsSummaryGrid', [
            buildKpiCard(t('reports.students', 'РЈС‡РµРЅРёРєРё'), fmtInt(o.total_students), 'tone-blue'),
            buildKpiCard(t('reports.teachers', 'РЈС‡РёС‚РµР»СЏ'), fmtInt(o.total_teachers), 'tone-cyan'),
            buildKpiCard(t('reports.classes', 'РљР»Р°СЃСЃС‹'), fmtInt(o.total_classes), 'tone-green'),
            buildKpiCard(t('dashboard.stats.subjects', 'РџСЂРµРґРјРµС‚С‹'), fmtInt(o.total_subjects), 'tone-orange'),
            buildKpiCard(t('reports.tests', 'РўРµСЃС‚С‹'), fmtInt(o.total_tests), 'tone-violet'),
            buildKpiCard(t('reports.avgScore', 'РЎСЂРµРґРЅРёР№ Р±Р°Р»Р»'), fmtPct(o.average_score), 'tone-rose')
        ].join(''));
    }

    function renderTop() {
        if (state.role === 'superadmin') {
            const top = state.overview?.top_schools || [];
            if (!top.length) {
                setHtml('reportsTopTable', `<p class="text-secondary">${t('reports.noData', 'РќРµС‚ РґР°РЅРЅС‹С…')}</p>`);
                return;
            }
            setHtml('reportsTopTable', `
                <div class="table-responsive">
                    <table class="data-table">
                        <thead><tr><th>${t('reports.school', 'РЁРєРѕР»Р°')}</th><th>${t('reports.attempts', 'РџРѕРїС‹С‚РєРё')}</th><th>${t('reports.avgScore', 'РЎСЂРµРґРЅРёР№ Р±Р°Р»Р»')}</th></tr></thead>
                        <tbody>
                            ${top.map((row) => `
                                <tr>
                                    <td data-label="${t('reports.school', 'РЁРєРѕР»Р°')}">${escapeHtml(row.school_name || '-')}</td>
                                    <td data-label="${t('reports.attempts', 'РџРѕРїС‹С‚РєРё')}">${fmtInt(row.attempts)}</td>
                                    <td data-label="${t('reports.avgScore', 'РЎСЂРµРґРЅРёР№ Р±Р°Р»Р»')}">${fmtPct(row.avg_score)}</td>
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
            setHtml('reportsTopTable', `<p class="text-secondary">${t('reports.noData', 'РќРµС‚ РґР°РЅРЅС‹С…')}</p>`);
            return;
        }
        setHtml('reportsTopTable', `
            <div class="table-responsive">
                <table class="data-table">
                    <thead><tr><th>${t('reports.class', 'РљР»Р°СЃСЃ')}</th><th>${t('reports.students', 'РЈС‡РµРЅРёРєРё')}</th><th>${t('reports.attempts', 'РџРѕРїС‹С‚РєРё')}</th><th>${t('reports.avgScore', 'РЎСЂРµРґРЅРёР№ Р±Р°Р»Р»')}</th></tr></thead>
                    <tbody>
                        ${topClasses.map((row) => `
                            <tr>
                                <td data-label="${t('reports.class', 'РљР»Р°СЃСЃ')}">${escapeHtml(row.name || '-')}</td>
                                <td data-label="${t('reports.students', 'РЈС‡РµРЅРёРєРё')}">${fmtInt(row.student_count)}</td>
                                <td data-label="${t('reports.attempts', 'РџРѕРїС‹С‚РєРё')}">${fmtInt(row.total_attempts)}</td>
                                <td data-label="${t('reports.avgScore', 'РЎСЂРµРґРЅРёР№ Р±Р°Р»Р»')}">${fmtPct(row.avg_score)}</td>
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
            setHtml('reportsActivityList', `<p class="text-secondary">${t('reports.noRecentActivity', 'РќРµС‚ РЅРµРґР°РІРЅРµР№ Р°РєС‚РёРІРЅРѕСЃС‚Рё')}</p>`);
            return;
        }

        setHtml('reportsActivityList', `
            <div class="reports-activity-list">
                ${activity.slice(0, 12).map((item) => `
                    <div class="reports-activity-item">
                        <div>
                            <strong>${escapeHtml(item.title || item.type || t('reports.recentActivity', 'РќРµРґР°РІРЅСЏСЏ Р°РєС‚РёРІРЅРѕСЃС‚СЊ'))}</strong>
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
            setHtml('reportsCompareTable', `<p class="text-secondary">${t('reports.noComparisonData', 'РќРµС‚ РґР°РЅРЅС‹С… РґР»СЏ СЃСЂР°РІРЅРµРЅРёСЏ')}</p>`);
            return;
        }

        const first = rows[0] || {};
        const keyValue = Object.prototype.hasOwnProperty.call(first, 'value') ? 'value' : 'avg_score';
        const keyName = Object.prototype.hasOwnProperty.call(first, 'name') ? 'name' : (first.class_name ? 'class_name' : 'name');

        setHtml('reportsCompareTable', `
            <div class="table-responsive">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>${t('reports.name', 'РќР°Р·РІР°РЅРёРµ')}</th>
                            <th>${t('reports.mainMetric', 'РћСЃРЅРѕРІРЅР°СЏ РјРµС‚СЂРёРєР°')}</th>
                            <th>${t('common.details', 'Р”РµС‚Р°Р»Рё')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.slice(0, 50).map((row) => `
                            <tr>
                                <td data-label="${t('reports.name', 'РќР°Р·РІР°РЅРёРµ')}">${escapeHtml(row[keyName] || row.name_ru || row.subject || '-')}</td>
                                <td data-label="${t('reports.mainMetric', 'РћСЃРЅРѕРІРЅР°СЏ РјРµС‚СЂРёРєР°')}">${typeof row[keyValue] === 'number' ? fmtPct(row[keyValue]) : escapeHtml(String(row[keyValue] ?? '-'))}</td>
                                <td data-label="${t('common.details', 'Р”РµС‚Р°Р»Рё')}">${escapeHtml(buildRowDetails(row))}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `);
    }

    function riskLevelLabel(level) {
        if (level === 'critical') return t('reports.riskCritical', 'РљСЂРёС‚РёС‡РµСЃРєРёР№');
        if (level === 'high') return t('reports.riskHigh', 'Р’С‹СЃРѕРєРёР№');
        if (level === 'medium') return t('reports.riskMedium', 'РЎСЂРµРґРЅРёР№');
        return t('reports.riskSafe', 'Р‘РµР·РѕРїР°СЃРЅС‹Р№');
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
            html += `<button class="pagination-btn" type="button" data-risk-page="${safeCurrent - 1}" onclick="${onClickHandler}">${t('reports.previous', 'РќР°Р·Р°Рґ')}</button>`;
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
            html += `<button class="pagination-btn" type="button" data-risk-page="${safeCurrent + 1}" onclick="${onClickHandler}">${t('reports.next', 'Р”Р°Р»РµРµ')}</button>`;
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
            tableEl.innerHTML = `<p class="text-secondary">${t('reports.noNotificationLogs', 'РќРµС‚ Р»РѕРіРѕРІ СѓРІРµРґРѕРјР»РµРЅРёР№ РґР»СЏ РІС‹Р±СЂР°РЅРЅС‹С… С„РёР»СЊС‚СЂРѕРІ.')}</p>`;
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
                            <th>${t('common.date', 'Р”Р°С‚Р°')}</th>
                            ${state.role === 'superadmin' ? `<th>${t('reports.school', 'РЁРєРѕР»Р°')}</th>` : ''}
                            <th>${t('reports.user', 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ')}</th>
                            <th>${t('common.role', 'Р РѕР»СЊ')}</th>
                            <th>${t('common.channel', 'РљР°РЅР°Р»')}</th>
                            <th>${t('common.event', 'РЎРѕР±С‹С‚РёРµ')}</th>
                            <th>${t('common.status', 'РЎС‚Р°С‚СѓСЃ')}</th>
                            <th>${t('reports.recipient', 'РџРѕР»СѓС‡Р°С‚РµР»СЊ')}</th>
                            <th>${t('reports.errorField', 'РћС€РёР±РєР°')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map((row) => `
                            <tr>
                                <td data-label="${t('common.date', 'Р”Р°С‚Р°')}">${row.created_at ? new Date(row.created_at).toLocaleString('ru-RU') : '-'}</td>
                                ${state.role === 'superadmin' ? `<td data-label="${t('reports.school', 'РЁРєРѕР»Р°')}">${escapeHtml(row.school_name || '-')}</td>` : ''}
                                <td data-label="${t('reports.user', 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ')}">${escapeHtml(`${row.first_name || ''} ${row.last_name || ''}`.trim() || row.username || '-')}</td>
                                <td data-label="${t('common.role', 'Р РѕР»СЊ')}">${escapeHtml(row.role || '-')}</td>
                                <td data-label="${t('common.channel', 'РљР°РЅР°Р»')}">${escapeHtml(row.channel || '-')}</td>
                                <td data-label="${t('common.event', 'РЎРѕР±С‹С‚РёРµ')}">${escapeHtml(row.event_key || '-')}</td>
                                <td data-label="${t('common.status', 'РЎС‚Р°С‚СѓСЃ')}">
                                    <span class="reports-notification-status ${(row.status || '').toLowerCase() === 'sent' ? 'sent' : 'failed'}">
                                        ${(String(row.status || '').toLowerCase() === 'sent')
                                            ? t('reports.statusSent', 'РћС‚РїСЂР°РІР»РµРЅРѕ')
                                            : (String(row.status || '').toLowerCase() === 'failed')
                                                ? t('reports.statusFailed', 'РћС€РёР±РєР°')
                                                : escapeHtml(row.status || '-')}
                                    </span>
                                </td>
                                <td data-label="${t('reports.recipient', 'РџРѕР»СѓС‡Р°С‚РµР»СЊ')}">${escapeHtml(buildNotificationRecipientLabel(row))}</td>
                                <td data-label="${t('reports.errorField', 'РћС€РёР±РєР°')}">${escapeHtml(row.error_message || '-')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div class="reports-notification-footer">
                <span class="text-secondary">${t('common.page', 'РЎС‚СЂР°РЅРёС†Р°')} ${fmtInt(currentPage)} / ${fmtInt(totalPages)} В· ${t('common.total', 'Р’СЃРµРіРѕ')}: ${fmtInt(total)}</span>
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
            summaryEl.innerHTML = `<p class="text-secondary">${t('reports.riskDashboardUnavailable', 'Р РёСЃРє-РґР°С€Р±РѕСЂРґ РґРѕСЃС‚СѓРїРµРЅ С‚РѕР»СЊРєРѕ РґР»СЏ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂР° С€РєРѕР»С‹ Рё СѓС‡РёС‚РµР»СЏ.')}</p>`;
            tableEl.innerHTML = '';
            return;
        }

        const summary = state.risk?.summary || {};
        const students = Array.isArray(state.riskStudents) ? state.riskStudents : [];

        summaryEl.innerHTML = `
            <div class="reports-risk-kpi-grid">
                ${buildKpiCard(t('reports.riskCritical', 'РљСЂРёС‚РёС‡РµСЃРєРёР№'), fmtInt(summary.critical_count), 'tone-rose')}
                ${buildKpiCard(t('reports.riskHigh', 'Р’С‹СЃРѕРєРёР№'), fmtInt(summary.high_count), 'tone-orange')}
                ${buildKpiCard(t('reports.riskMedium', 'РЎСЂРµРґРЅРёР№'), fmtInt(summary.medium_count), 'tone-violet')}
                ${buildKpiCard(t('reports.noAttempts', 'Р‘РµР· РїРѕРїС‹С‚РѕРє'), fmtInt(summary.no_data_count), 'tone-cyan')}
            </div>
        `;

        if (!students.length) {
            tableEl.innerHTML = `<p class="text-secondary">${t('reports.noStudentsAtRisk', 'РќРµС‚ СѓС‡РµРЅРёРєРѕРІ РІ Р·РѕРЅРµ СЂРёСЃРєР° РґР»СЏ РІС‹Р±СЂР°РЅРЅС‹С… С„РёР»СЊС‚СЂРѕРІ.')}</p>`;
            return;
        }

        tableEl.innerHTML = `
            <div class="table-responsive">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>${t('reports.students', 'РЈС‡РµРЅРёРєРё')}</th>
                            <th>${t('reports.class', 'РљР»Р°СЃСЃ')}</th>
                            <th>${t('reports.score', 'Р‘Р°Р»Р»')}</th>
                            <th>${t('reports.attempts', 'РџРѕРїС‹С‚РєРё')}</th>
                            <th>${t('reports.risk', 'Р РёСЃРє')}</th>
                            <th>${t('reports.lastAttempt', 'РџРѕСЃР»РµРґРЅСЏСЏ РїРѕРїС‹С‚РєР°')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${students.map((row) => `
                            <tr>
                                <td data-label="${t('reports.students', 'РЈС‡РµРЅРёРєРё')}">${escapeHtml(`${row.first_name || ''} ${row.last_name || ''}`.trim() || row.username || '-')}</td>
                                <td data-label="${t('reports.class', 'РљР»Р°СЃСЃ')}">${escapeHtml(row.class_name || '-')}</td>
                                <td data-label="${t('reports.score', 'Р‘Р°Р»Р»')}">${fmtPct(row.avg_score)}</td>
                                <td data-label="${t('reports.attempts', 'РџРѕРїС‹С‚РєРё')}">${fmtInt(row.attempts_completed)}</td>
                                <td data-label="${t('reports.risk', 'Р РёСЃРє')}"><span class="reports-risk-badge ${escapeHtml(String(row.risk_level || 'safe'))}">${riskLevelLabel(row.risk_level)}</span></td>
                                <td data-label="${t('reports.lastAttempt', 'РџРѕСЃР»РµРґРЅСЏСЏ РїРѕРїС‹С‚РєР°')}">${row.last_attempt_at ? new Date(row.last_attempt_at).toLocaleDateString('ru-RU') : '-'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div style="margin-top:12px; display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;">
                <span class="text-secondary">${t('common.page', 'РЎС‚СЂР°РЅРёС†Р°')} ${fmtInt(state.riskPagination.page || 1)} / ${fmtInt(Math.max(1, Math.ceil((state.riskPagination.total || 0) / (state.riskPagination.limit || 20))))} В· ${t('common.total', 'Р’СЃРµРіРѕ')}: ${fmtInt(state.riskPagination.total || 0)}</span>
                <div style="display:flex; align-items:center; gap:8px;">
                    <label for="reportsRiskLimitSelect" class="text-secondary">${t('common.perPage', 'РќР° СЃС‚СЂР°РЅРёС†Рµ')}</label>
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
        if (row.attempts !== undefined) parts.push(`${t('reports.attempts', 'РџРѕРїС‹С‚РєРё')}: ${fmtInt(row.attempts)}`);
        if (row.total_attempts !== undefined) parts.push(`${t('common.total', 'Р’СЃРµРіРѕ')}: ${fmtInt(row.total_attempts)}`);
        if (row.student_count !== undefined) parts.push(`${t('reports.students', 'РЈС‡РµРЅРёРєРё')}: ${fmtInt(row.student_count)}`);
        if (row.attempt_count !== undefined) parts.push(`${t('reports.attempts', 'РџРѕРїС‹С‚РєРё')}: ${fmtInt(row.attempt_count)}`);
        if (row.test_count !== undefined) parts.push(`${t('reports.tests', 'РўРµСЃС‚С‹')}: ${fmtInt(row.test_count)}`);
        if (row.completed !== undefined) parts.push(`${t('dashboard.stats.testsCompleted', 'Р—Р°РІРµСЂС€РµРЅРѕ')}: ${fmtInt(row.completed)}`);
        return parts.length ? parts.join(' В· ') : '-';
    }

    function renderInsights() {
        const insights = [];
        if (state.role === 'superadmin') {
            const summary = state.comparison?.summary || {};
            insights.push(`${t('reports.insights.topPerformer', 'Р›СѓС‡С€РёР№ СЂРµР·СѓР»СЊС‚Р°С‚')}: ${summary.top_performer || 'N/A'}`);
            if (summary.average !== undefined) insights.push(`${t('reports.insights.networkAverage', 'РЎСЂРµРґРЅРµРµ РїРѕ СЃРµС‚Рё')}: ${summary.average}`);
            if (summary.total_attempts !== undefined) insights.push(`${t('reports.insights.totalAttempts', 'Р’СЃРµРіРѕ РїРѕРїС‹С‚РѕРє')}: ${fmtInt(summary.total_attempts)}`);
        } else {
            const subjects = state.overview?.subject_performance || [];
            if (subjects.length) {
                const best = subjects.reduce((a, b) => Number(a.avg_score || 0) > Number(b.avg_score || 0) ? a : b);
                const risk = subjects.reduce((a, b) => Number(a.avg_score || 0) < Number(b.avg_score || 0) ? a : b);
                const bestName = best.name_ru || best.name_uz || best.subject || 'N/A';
                const riskName = risk.name_ru || risk.name_uz || risk.subject || 'N/A';
                insights.push(`${t('reports.insights.bestSubject', 'Р›СѓС‡С€РёР№ РїСЂРµРґРјРµС‚')}: ${bestName} (${fmtPct(best.avg_score)})`);
                insights.push(`${t('reports.insights.riskSubject', 'РџСЂРµРґРјРµС‚ РІ Р·РѕРЅРµ СЂРёСЃРєР°')}: ${riskName} (${fmtPct(risk.avg_score)})`);
            }
            const activity = state.overview?.recent_activity || [];
            insights.push(`${t('reports.insights.activityPoints', 'РўРѕС‡РµРє Р°РєС‚РёРІРЅРѕСЃС‚Рё')}: ${fmtInt(activity.length)}`);
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
                        label: t('reports.recentActivity', 'РќРµРґР°РІРЅСЏСЏ Р°РєС‚РёРІРЅРѕСЃС‚СЊ'),
                        data: attemptsSeries,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59,130,246,0.15)',
                        tension: 0.3,
                        yAxisID: 'y'
                    },
                    {
                        label: t('reports.avgScore', 'РЎСЂРµРґРЅРёР№ Р±Р°Р»Р»'),
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
                        title: { display: true, text: t('reports.recentActivity', 'РќРµРґР°РІРЅСЏСЏ Р°РєС‚РёРІРЅРѕСЃС‚СЊ') }
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
            const activity = state.overview?.recent_activity || [];
            const map = new Map();
            activity.forEach((item) => {
                const key = formatDateOnly(item.date);
                const prev = map.get(key) || { count: 0, scoreSum: 0, scoreCount: 0 };
                prev.count += 1;
                if (Number.isFinite(Number(item.percentage))) {
                    prev.scoreSum += Number(item.percentage);
                    prev.scoreCount += 1;
                }
                map.set(key, prev);
            });
            const labels = Array.from(map.keys()).sort((a, b) => new Date(a) - new Date(b));
            const attemptsSeries = labels.map((label) => map.get(label).count);
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
            const [overview, comparison] = await Promise.all([
                apiGet(`${API}/superadmin/dashboard/overview`),
                apiGet(`${API}/superadmin/comparison?metric=${encodeURIComponent(state.metric)}&period=${encodeURIComponent(periodKey)}`)
            ]);
            state.overview = overview;
            state.comparison = comparison;
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
            const header = ['name', 'value'];
            const csv = [header.join(',')].concat(rows.map((row) => {
                const name = `"${String(row.name || '').replace(/"/g, '""')}"`;
                const value = row.value ?? '';
                return `${name},${value}`;
            })).join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            downloadBlob(blob, `superadmin_reports_${Date.now()}.csv`);
            return;
        }

        const response = await fetch(`${API}/analytics/export/school`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!response.ok) throw new Error(t('reports.exportFailed', 'РќРµ СѓРґР°Р»РѕСЃСЊ СЌРєСЃРїРѕСЂС‚РёСЂРѕРІР°С‚СЊ РѕС‚С‡РµС‚С‹'));
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
            alert(t('reports.popupBlocked', 'Р’СЃРїР»С‹РІР°СЋС‰РµРµ РѕРєРЅРѕ Р·Р°Р±Р»РѕРєРёСЂРѕРІР°РЅРѕ. Р Р°Р·СЂРµС€РёС‚Рµ pop-up РґР»СЏ СЌРєСЃРїРѕСЂС‚Р° PDF.'));
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
                image.alt = t('reports.chartAlt', 'Р“СЂР°С„РёРє С‚СЂРµРЅРґРѕРІ РѕС‚С‡РµС‚РѕРІ');
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
                <title>${t('reports.pdfTitle', 'РћС‚С‡РµС‚С‹ PDF')}</title>
                ${styles}
                <style>
                    body { background: #fff !important; padding: 16px; }
                    .reports-page { width: 100% !important; max-width: 100% !important; }
                    .dashboard-section { break-inside: avoid; page-break-inside: avoid; }
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
        if (refresh) refresh.addEventListener('click', refreshView);
        if (pdfBtn) pdfBtn.addEventListener('click', handlePdfExport);
        if (exportBtn) {
            exportBtn.addEventListener('click', async () => {
                try {
                    exportBtn.disabled = true;
                    exportBtn.textContent = t('reports.exporting', 'Р­РєСЃРїРѕСЂС‚...');
                    await handleDataExport();
                } catch (error) {
                    console.error('Export reports error:', error);
                    alert(t('reports.exportFailed', 'РќРµ СѓРґР°Р»РѕСЃСЊ СЌРєСЃРїРѕСЂС‚РёСЂРѕРІР°С‚СЊ РѕС‚С‡РµС‚С‹'));
                } finally {
                    exportBtn.disabled = false;
                    exportBtn.textContent = t('reports.exportData', 'Р­РєСЃРїРѕСЂС‚ РґР°РЅРЅС‹С…');
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
                setHtml('reportsNotificationsTable', `<p class="text-secondary">${t('reports.loading', 'Р—Р°РіСЂСѓР·РєР°...')}</p>`);
                await loadNotificationLogs(1);
                renderNotificationLogs();
            } catch (error) {
                console.error('Notification logs filter error:', error);
                setHtml('reportsNotificationsTable', `<p class="text-secondary">${t('reports.failedLoadNotificationLogs', 'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ Р»РѕРіРё СѓРІРµРґРѕРјР»РµРЅРёР№.')}</p>`);
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
        setHtml('reportsSummaryGrid', `<div class="report-kpi"><span>${t('reports.loading', 'Р—Р°РіСЂСѓР·РєР°...')}</span><strong>-</strong></div>`);
        setHtml('reportsTopTable', `<p class="text-secondary">${t('reports.loading', 'Р—Р°РіСЂСѓР·РєР°...')}</p>`);
        setHtml('reportsActivityList', `<p class="text-secondary">${t('reports.loading', 'Р—Р°РіСЂСѓР·РєР°...')}</p>`);
        setHtml('reportsCompareTable', `<p class="text-secondary">${t('reports.loading', 'Р—Р°РіСЂСѓР·РєР°...')}</p>`);
        setHtml('reportsInsights', `<p class="text-secondary">${t('reports.loading', 'Р—Р°РіСЂСѓР·РєР°...')}</p>`);
        setHtml('reportsRiskSummary', `<p class="text-secondary">${t('reports.loading', 'Р—Р°РіСЂСѓР·РєР°...')}</p>`);
        setHtml('reportsRiskTable', `<p class="text-secondary">${t('reports.loading', 'Р—Р°РіСЂСѓР·РєР°...')}</p>`);
        setHtml('reportsNotificationsTable', `<p class="text-secondary">${t('reports.loading', 'Р—Р°РіСЂСѓР·РєР°...')}</p>`);
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
            setHtml('reportsInsights', `<p class="text-secondary">${t('reports.failedLoad', 'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РґР°РЅРЅС‹Рµ РѕС‚С‡РµС‚РѕРІ.')}</p>`);
            setHtml('reportsRiskSummary', `<p class="text-secondary">${t('reports.failedLoadRisk', 'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ СЂРёСЃРє-РґР°С€Р±РѕСЂРґ.')}</p>`);
            setHtml('reportsRiskTable', '');
            setHtml('reportsNotificationsTable', `<p class="text-secondary">${t('reports.failedLoadNotificationLogs', 'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ Р»РѕРіРё СѓРІРµРґРѕРјР»РµРЅРёР№.')}</p>`);
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

    function init() {
        if (!document.getElementById('reportsSummaryGrid')) return;
        state.role = getUserRole();
        const metricWrap = document.getElementById('reportsMetricWrap');
        const notificationsCard = document.getElementById('reportsNotificationsCard');
        const notificationsLimit = document.getElementById('reportsNotificationLimit');
        if (metricWrap) {
            metricWrap.style.display = state.role === 'superadmin' ? 'block' : 'none';
        }
        if (notificationsCard) {
            notificationsCard.style.display = isNotificationsDiagnosticsEnabled() ? '' : 'none';
        }
        if (notificationsLimit) {
            notificationsLimit.value = String(state.notificationsPagination.limit || 20);
        }
        bindEvents();
        applyFilters({ period: 30, metric: 'avg_score' });
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
                setHtml('reportsNotificationsTable', `<p class="text-secondary">${t('reports.failedLoadNotificationLogs', 'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ Р»РѕРіРё СѓРІРµРґРѕРјР»РµРЅРёР№.')}</p>`);
            }
        }
    };
})();
