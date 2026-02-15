// Student Leaderboard Page
(function () {
    'use strict';

    function t(key, fallback) {
        return window.ZedlyI18n?.translate(key) || fallback || key;
    }

    function formatPercent(value) {
        const num = Number(value);
        if (!Number.isFinite(num)) {
            return '0.0';
        }
        return (Math.round(num * 10) / 10).toFixed(1);
    }

    function getCurrentUserId() {
        const raw = localStorage.getItem('user_data') || localStorage.getItem('user');
        if (!raw) return null;
        try {
            const data = JSON.parse(raw);
            return data.id || data.user?.id || null;
        } catch (error) {
            return null;
        }
    }

    window.StudentLeaderboard = {
        scope: 'class',
        currentUserId: null,

        init: function () {
            this.currentUserId = getCurrentUserId();
            this.bindEvents();
            this.loadFilters();
            this.loadLeaderboard();
        },

        bindEvents: function () {
            const scopeSelect = document.getElementById('leaderboardScope');
            const refresh = document.getElementById('leaderboardRefresh');

            if (scopeSelect) {
                scopeSelect.addEventListener('change', () => {
                    this.scope = scopeSelect.value;
                    this.toggleFilters();
                    this.loadLeaderboard();
                });
            }

            const classSelect = document.getElementById('leaderboardClass');
            if (classSelect) {
                classSelect.addEventListener('change', () => this.loadLeaderboard());
            }

            const subjectSelect = document.getElementById('leaderboardSubject');
            if (subjectSelect) {
                subjectSelect.addEventListener('change', () => this.loadLeaderboard());
            }

            if (refresh) {
                refresh.addEventListener('click', () => this.loadLeaderboard());
            }
        },

        toggleFilters: function () {
            const classSelect = document.getElementById('leaderboardClass');
            const subjectSelect = document.getElementById('leaderboardSubject');

            if (classSelect) {
                classSelect.style.display = this.scope === 'class' ? 'inline-block' : 'none';
            }
            if (subjectSelect) {
                subjectSelect.style.display = this.scope === 'subject' ? 'inline-block' : 'none';
            }
        },

        loadFilters: async function () {
            try {
                const token = localStorage.getItem('access_token');
                const [classesResponse, subjectsResponse] = await Promise.all([
                    fetch('/api/student/classes', {
                        headers: { 'Authorization': `Bearer ${token}` }
                    }),
                    fetch('/api/student/subjects', {
                        headers: { 'Authorization': `Bearer ${token}` }
                    })
                ]);

                if (classesResponse.ok) {
                    const data = await classesResponse.json();
                    this.renderClassOptions(data.classes || []);
                }

                if (subjectsResponse.ok) {
                    const data = await subjectsResponse.json();
                    this.renderSubjectOptions(data.subjects || []);
                }
            } catch (error) {
                console.error('Load leaderboard filters error:', error);
            }
        },

        renderClassOptions: function (classes) {
            const select = document.getElementById('leaderboardClass');
            if (!select) return;

            if (!classes.length) {
                select.innerHTML = '';
                return;
            }

            select.innerHTML = classes.map(cls => `
                <option value="${cls.id}">${cls.name}${cls.grade_level ? ` · ${cls.grade_level}` : ''}</option>
            `).join('');
        },

        renderSubjectOptions: function (subjects) {
            const select = document.getElementById('leaderboardSubject');
            if (!select) return;

            if (!subjects.length) {
                select.innerHTML = '';
                return;
            }

            select.innerHTML = subjects.map(subject => `
                <option value="${subject.id}">${subject.name}</option>
            `).join('');
        },

        loadLeaderboard: async function () {
            this.renderLoading();

            try {
                const token = localStorage.getItem('access_token');
                const params = new URLSearchParams({ scope: this.scope });

                const classSelect = document.getElementById('leaderboardClass');
                if (this.scope === 'class' && classSelect && classSelect.value) {
                    params.set('class_id', classSelect.value);
                }

                const subjectSelect = document.getElementById('leaderboardSubject');
                if (this.scope === 'subject' && subjectSelect && subjectSelect.value) {
                    params.set('subject_id', subjectSelect.value);
                }

                const response = await fetch(`/api/student/leaderboard?${params.toString()}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!response.ok) {
                    throw new Error(t('leaderboard.failedLoad', 'Не удалось загрузить рейтинг'));
                }

                const data = await response.json();
                this.renderStats(data.user_rank, data.leaderboard || []);
                this.renderTable(data.leaderboard || []);
            } catch (error) {
                console.error('Load leaderboard error:', error);
                this.renderError(error.message || t('leaderboard.unableLoad', 'Не удалось загрузить рейтинг.'));
            }
        },

        renderLoading: function () {
            const stats = document.getElementById('leaderboardStats');
            const table = document.getElementById('leaderboardTable');

            if (stats) {
                stats.innerHTML = `
                    <div class="stat-card">
                        <div class="stat-content">
                            <div class="stat-label">${t('common.loading', 'Загрузка...')}</div>
                            <div class="stat-value">--</div>
                        </div>
                    </div>
                `;
            }

            if (table) {
                table.innerHTML = `<p style="color: var(--text-secondary);">${t('leaderboard.loading', 'Загрузка рейтинга...')}</p>`;
            }
        },

        renderError: function (message) {
            const stats = document.getElementById('leaderboardStats');
            const table = document.getElementById('leaderboardTable');

            if (stats) {
                stats.innerHTML = '';
            }

            if (table) {
                table.innerHTML = `<div class="error-message"><p>${message}</p></div>`;
            }
        },

        renderStats: function (userRank, leaderboard) {
            const stats = document.getElementById('leaderboardStats');
            if (!stats) return;

            const topScore = leaderboard.length > 0 ? formatPercent(leaderboard[0].avg_score) : '0.0';
            const count = leaderboard.length;

            stats.innerHTML = `
                <div class="stat-card">
                    <div class="stat-content">
                        <div class="stat-label">${t('leaderboard.yourRank', 'Ваше место')}</div>
                        <div class="stat-value">${userRank || '-'}</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-content">
                        <div class="stat-label">${t('leaderboard.topScore', 'Лучший балл')}</div>
                        <div class="stat-value">${topScore}%</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-content">
                        <div class="stat-label">${t('leaderboard.participants', 'Участники')}</div>
                        <div class="stat-value">${count}</div>
                    </div>
                </div>
            `;
        },

        renderTable: function (leaderboard) {
            const table = document.getElementById('leaderboardTable');
            if (!table) return;

            if (!leaderboard.length) {
                table.innerHTML = `<p style="color: var(--text-secondary);">${t('leaderboard.noData', 'Пока нет данных рейтинга.')}</p>`;
                return;
            }

            const rows = leaderboard.map(entry => {
                const isCurrentUser = this.currentUserId && entry.id === this.currentUserId;
                const name = entry.name || entry.username || '-';
                return `
                    <tr ${isCurrentUser ? 'style="font-weight: 700;"' : ''}>
                        <td>${entry.rank}</td>
                        <td>${name}</td>
                        <td>${entry.attempts || 0}</td>
                        <td>${formatPercent(entry.avg_score)}%</td>
                    </tr>
                `;
            }).join('');

            table.innerHTML = `
                <div class="table-responsive">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>${t('leaderboard.colRank', 'Место')}</th>
                                <th>${t('leaderboard.colStudent', 'Ученик')}</th>
                                <th>${t('leaderboard.colAttempts', 'Попытки')}</th>
                                <th>${t('leaderboard.colAvgScore', 'Средний балл')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                </div>
            `;
        }
    };
})();
