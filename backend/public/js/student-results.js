// Student Results Dashboard
(function () {
    'use strict';

    function t(key, fallback) {
        return window.ZedlyI18n?.translate(key) || fallback || key;
    }

    window.StudentResults = {
        results: [],
        filteredResults: [],

        init: async function () {
            this.bindEvents();
            await this.loadResults();
        },

        bindEvents: function () {
            const search = document.getElementById('studentResultsSearch');
            if (search) {
                search.addEventListener('input', (e) => {
                    const term = e.target.value.trim().toLowerCase();
                    if (!term) {
                        this.filteredResults = [...this.results];
                    } else {
                        this.filteredResults = this.results.filter(result =>
                            result.test_title.toLowerCase().includes(term) ||
                            (result.subject_name || '').toLowerCase().includes(term) ||
                            (result.class_name || '').toLowerCase().includes(term)
                        );
                    }
                    this.renderTable();
                });
            }

            const refresh = document.getElementById('studentResultsRefresh');
            if (refresh) {
                refresh.addEventListener('click', () => this.loadResults());
            }

            const table = document.getElementById('studentResultsTable');
            if (table) {
                table.addEventListener('click', (event) => {
                    const button = event.target.closest('.js-view-attempt');
                    if (!button) return;
                    const attemptId = button.dataset.attemptId;
                    if (!attemptId) return;
                    this.viewAttempt(attemptId);
                });
            }
        },

        loadResults: async function () {
            this.renderLoading();

            try {
                const token = localStorage.getItem('access_token');
                const response = await fetch('/api/student/results', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!response.ok) {
                    throw new Error(t('results.failedLoad', 'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ СЂРµР·СѓР»СЊС‚Р°С‚С‹'));
                }

                const data = await response.json();
                this.results = data.results || [];
                this.filteredResults = [...this.results];

                this.renderStats();
                this.renderTable();
            } catch (error) {
                console.error('Load student results error:', error);
                this.renderError(error.message || t('results.unableLoad', 'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ СЂРµР·СѓР»СЊС‚Р°С‚С‹.'));
            }
        },

        renderLoading: function () {
            const stats = document.getElementById('studentResultsStats');
            const table = document.getElementById('studentResultsTable');

            if (stats) {
                stats.innerHTML = `
                    <div class="stat-card">
                        <div class="stat-content">
                            <div class="stat-label">${t('common.loading', 'Р—Р°РіСЂСѓР·РєР°...')}</div>
                            <div class="stat-value">--</div>
                        </div>
                    </div>
                `;
            }

            if (table) {
                table.innerHTML = `<p style="color: var(--text-secondary);">${t('results.loadingResults', 'Р—Р°РіСЂСѓР·РєР° СЂРµР·СѓР»СЊС‚Р°С‚РѕРІ...')}</p>`;
            }
        },

        renderError: function (message) {
            const stats = document.getElementById('studentResultsStats');
            const table = document.getElementById('studentResultsTable');

            if (stats) {
                stats.innerHTML = '';
            }

            if (table) {
                table.innerHTML = `<div class="error-message"><p>${message}</p></div>`;
            }
        },

        renderStats: function () {
            const stats = document.getElementById('studentResultsStats');
            if (!stats) return;

            const total = this.results.length;
            const completed = this.results.filter(r => r.is_completed).length;
            const avg = completed > 0
                ? (this.results.reduce((sum, r) => sum + parseFloat(r.percentage || 0), 0) / completed).toFixed(1)
                : '0.0';
            const passedCount = this.results.filter(r => this.isPassed(r)).length;
            const passRate = completed > 0 ? Math.round((passedCount / completed) * 100) : 0;

            stats.innerHTML = `
                <div class="stat-card">
                    <div class="stat-content">
                        <div class="stat-label">${t('results.testsCompleted', 'РўРµСЃС‚РѕРІ Р·Р°РІРµСЂС€РµРЅРѕ')}</div>
                        <div class="stat-value">${completed}</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-content">
                        <div class="stat-label">${t('results.averageScore', 'РЎСЂРµРґРЅРёР№ Р±Р°Р»Р»')}</div>
                        <div class="stat-value">${avg}%</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-content">
                        <div class="stat-label">${t('results.passRate', 'РџСЂРѕС†РµРЅС‚ СЃРґР°С‡Рё')}</div>
                        <div class="stat-value">${passRate}%</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-content">
                        <div class="stat-label">${t('results.totalAttempts', 'Р’СЃРµРіРѕ РїРѕРїС‹С‚РѕРє')}</div>
                        <div class="stat-value">${total}</div>
                    </div>
                </div>
            `;
        },

        renderTable: function () {
            const table = document.getElementById('studentResultsTable');
            if (!table) return;

            if (this.filteredResults.length === 0) {
                table.innerHTML = `<p style="color: var(--text-secondary);">${t('results.noCompletedTests', 'РџРѕРєР° РЅРµС‚ Р·Р°РІРµСЂС€РµРЅРЅС‹С… С‚РµСЃС‚РѕРІ.')}</p>`;
                return;
            }

            let html = `
                <div class="table-responsive mobile-stack-table">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>${t('results.colTest', 'РўРµСЃС‚')}</th>
                                <th>${t('results.colSubject', 'РџСЂРµРґРјРµС‚')}</th>
                                <th>${t('results.colClass', 'РљР»Р°СЃСЃ')}</th>
                                <th>${t('results.colDate', 'Р”Р°С‚Р°')}</th>
                                <th>${t('results.colScore', 'Р‘Р°Р»Р»')}</th>
                                <th>${t('results.colResult', 'Р РµР·СѓР»СЊС‚Р°С‚')}</th>
                                <th>${t('results.colActions', 'Р”РµР№СЃС‚РІРёСЏ')}</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            this.filteredResults.forEach(result => {
                const percentage = parseFloat(result.percentage || 0);
                const passed = this.isPassed(result);
                const statusClass = passed ? 'status-active' : 'status-warning';
                const statusText = passed ? t('results.passed', 'РЎРґР°РЅРѕ') : t('results.failed', 'РќРµ СЃРґР°РЅРѕ');
                const attemptId = String(result.attempt_id || '');
                const testTitle = this.escapeHtml(result.test_title || '-');
                const className = this.escapeHtml(result.class_name || '-');
                const subjectName = this.escapeHtml(result.subject_name || '-');
                const subjectColor = this.escapeHtml(result.subject_color || '#4A90E2');

                html += `
                    <tr>
                        <td data-label="${this.escapeHtml(t('results.colTest', 'Test'))}">
                            <div class="user-name">${testTitle}</div>
                        </td>
                        <td data-label="${this.escapeHtml(t('results.colSubject', 'Subject'))}">
                            ${result.subject_name ? `
                                <span class="subject-badge" style="background-color: ${subjectColor}20; color: ${subjectColor};">
                                    ${subjectName}
                                </span>
                            ` : '-'}
                        </td>
                        <td data-label="${this.escapeHtml(t('results.colClass', 'Class'))}">${className}</td>
                        <td data-label="${this.escapeHtml(t('results.colDate', 'Date'))}">${this.formatDate(result.submitted_at)}</td>
                        <td data-label="${this.escapeHtml(t('results.colScore', 'Score'))}">${result.score} / ${result.max_score}</td>
                        <td data-label="${this.escapeHtml(t('results.colResult', 'Result'))}">
                            <span class="status-badge ${statusClass}">${percentage.toFixed(1)}% - ${statusText}</span>
                        </td>
                        <td data-label="${this.escapeHtml(t('results.colActions', 'Actions'))}">
                            <button class="btn-icon js-view-attempt" data-attempt-id="${this.escapeHtml(attemptId)}" title="${t('results.viewDetails', 'РџСЂРѕСЃРјРѕС‚СЂ РґРµС‚Р°Р»РµР№')}">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                    <circle cx="12" cy="12" r="3"></circle>
                                </svg>
                            </button>
                        </td>
                    </tr>
                `;
            });

            html += `
                        </tbody>
                    </table>
                </div>
            `;

            table.innerHTML = html;
        },

        viewAttempt: function (attemptId) {
            window.location.href = `/test-results.html?attempt_id=${attemptId}`;
        },

        isPassed: function (result) {
            const percentage = parseFloat(result.percentage || 0);
            const threshold = result.passing_score !== undefined && result.passing_score !== null
                ? parseFloat(result.passing_score)
                : 60;
            return percentage >= threshold;
        },

        formatDate: function (dateString) {
            if (!dateString) return '-';
            const date = new Date(dateString);
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            return `${day}.${month}.${year} ${hours}:${minutes}`;
        },

        escapeHtml: function (value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }
    };
})();


