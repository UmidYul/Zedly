// Student overview page
(function () {
    'use strict';

    function looksLikeMojibake(value) {
        if (typeof value !== 'string' || value.length < 4) return false;
        const chunks = value.match(/(?:Р.|С.)/g) || [];
        return chunks.length >= 3 && chunks.length / value.length > 0.2;
    }

    function t(key, fallback) {
        const translated = window.ZedlyI18n?.translate?.(key);
        if (!translated || translated === key || looksLikeMojibake(translated)) {
            return fallback || key;
        }
        return translated;
    }

    function toNumber(value, fallback = 0) {
        const num = Number(value);
        return Number.isFinite(num) ? num : fallback;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatPercent(value) {
        const safe = clamp(toNumber(value, 0), 0, 100);
        return `${(Math.round(safe * 10) / 10).toFixed(1)}%`;
    }

    function formatDate(value) {
        if (!value) return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    }

    function getGreetingByHour(hour) {
        if (hour < 12) return 'Доброе утро';
        if (hour < 18) return 'Добрый день';
        return 'Добрый вечер';
    }

    function getScoreToneClass(score) {
        const safe = toNumber(score, 0);
        if (safe < 50) return 'is-low';
        if (safe <= 75) return 'is-mid';
        return 'is-high';
    }

    async function showAlert(message, title = 'Информация') {
        if (window.ZedlyDialog?.alert) {
            await window.ZedlyDialog.alert(message, { title });
            return;
        }
        window.alert(message);
    }

    window.StudentOverviewPage = {
        state: {
            data: null,
            loading: false
        },

        init: async function () {
            this.bindEvents();
            await this.loadOverview();
        },

        bindEvents: function () {
            const root = document.getElementById('studentOverviewPage');
            if (!root || root.dataset.bound === '1') return;
            root.dataset.bound = '1';

            root.addEventListener('click', (event) => {
                const startButton = event.target.closest('.js-student-overview-start');
                if (!startButton) return;
                const assignmentId = startButton.dataset.assignmentId;
                if (!assignmentId) return;
                this.startAssignment(assignmentId, startButton);
            });
        },

        loadOverview: async function () {
            this.state.loading = true;
            this.renderLoading();

            try {
                const token = window.ZedlyAuth?.getAuthToken?.() || 'cookie-session';
                const response = await fetch('/api/student/dashboard/overview', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!response.ok) {
                    throw new Error(t('dashboard.stats.loadError', 'Не удалось загрузить данные обзора'));
                }

                this.state.data = await response.json();
                this.renderAll();
            } catch (error) {
                console.error('Student overview load error:', error);
                this.renderError(error.message || 'Не удалось загрузить обзор.');
            } finally {
                this.state.loading = false;
            }
        },

        renderLoading: function () {
            const ids = [
                'studentOverviewSubjectProgress',
                'studentOverviewRecommendedTest',
                'studentOverviewLastActivity'
            ];

            ids.forEach((id) => {
                const el = document.getElementById(id);
                if (!el) return;
                el.innerHTML = '<p class="text-secondary">Загрузка...</p>';
            });

            this.renderGreeting();
            this.renderRecentBadge();
        },

        renderError: function (message) {
            const ids = [
                'studentOverviewSubjectProgress',
                'studentOverviewRecommendedTest',
                'studentOverviewLastActivity'
            ];

            ids.forEach((id) => {
                const el = document.getElementById(id);
                if (!el) return;
                el.innerHTML = `<div class="error-message"><p>${escapeHtml(message)}</p></div>`;
            });

            this.renderGreeting();
            this.renderRecentBadge();
        },

        renderAll: function () {
            this.renderGreeting();
            this.renderSubjectProgress();
            this.renderRecommendedTest();
            this.renderLastActivity();
            this.renderRecentBadge();
        },

        renderGreeting: function () {
            const greetingEl = document.getElementById('studentOverviewGreeting');
            const dateEl = document.getElementById('studentOverviewDate');

            const now = new Date();
            const hour = now.getHours();
            const greeting = getGreetingByHour(hour);

            const rawName = String(document.getElementById('userName')?.textContent || '').trim();
            const firstName = rawName.split(/\s+/)[0] || '';

            if (greetingEl) {
                greetingEl.textContent = `${greeting}, ${firstName || 'ученик'}`;
            }

            if (dateEl) {
                const formattedDate = now.toLocaleDateString('ru-RU', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                });
                dateEl.textContent = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);
            }
        },

        renderSubjectProgress: function () {
            const container = document.getElementById('studentOverviewSubjectProgress');
            if (!container) return;

            const rows = Array.isArray(this.state.data?.subject_progress)
                ? [...this.state.data.subject_progress]
                    .sort((a, b) => {
                        const scoreDiff = toNumber(b?.avg_score, 0) - toNumber(a?.avg_score, 0);
                        if (Math.abs(scoreDiff) > 0.0001) return scoreDiff;
                        const attemptsDiff = toNumber(b?.attempts, 0) - toNumber(a?.attempts, 0);
                        if (attemptsDiff !== 0) return attemptsDiff;
                        return String(a?.subject_name || '').localeCompare(String(b?.subject_name || ''), 'ru');
                    })
                    .slice(0, 5)
                : [];

            if (!rows.length) {
                container.innerHTML = '<p class="text-secondary">Нет данных по предметам.</p>';
                return;
            }

            const html = rows.map((row) => {
                const score = clamp(toNumber(row.avg_score, 0), 0, 100);
                const toneClass = getScoreToneClass(score);
                return `
                    <div class="student-overview-subject-item ${toneClass}">
                        <div class="student-overview-subject-top">
                            <span>${escapeHtml(row.subject_name || 'Предмет')}</span>
                            <span>${formatPercent(score)}</span>
                        </div>
                        <div class="student-overview-progress-track">
                            <span style="width:${score}%;"></span>
                        </div>
                    </div>
                `;
            }).join('');

            container.innerHTML = `<div class="student-overview-subject-list">${html}</div>`;
        },

        renderRecommendedTest: function () {
            const container = document.getElementById('studentOverviewRecommendedTest');
            if (!container) return;

            const recommendation = this.state.data?.recommended_test || null;
            if (!recommendation) {
                container.innerHTML = '<p class="text-secondary">Сейчас нет подходящей рекомендации для тренировки.</p>';
                return;
            }

            container.innerHTML = `
                <div class="student-overview-recommend-card">
                    <div class="student-overview-recommend-topic">${escapeHtml(recommendation.topic_name || 'Тема')}</div>
                    <h3 class="student-overview-recommend-title">${escapeHtml(recommendation.test_title || 'Тест')}</h3>
                    <p class="student-overview-recommend-reason">${escapeHtml(recommendation.reason || '')}</p>
                    <div class="student-overview-recommend-actions">
                        <button class="btn btn-primary js-student-overview-start" data-assignment-id="${escapeHtml(recommendation.assignment_id || '')}" type="button">
                            Начать тренировку
                        </button>
                    </div>
                </div>
            `;
        },

        renderLastActivity: function () {
            const container = document.getElementById('studentOverviewLastActivity');
            if (!container) return;

            const rows = Array.isArray(this.state.data?.last_activity)
                ? this.state.data.last_activity
                : [];

            if (!rows.length) {
                container.innerHTML = '<p class="text-secondary">Пока нет пройденных тестов.</p>';
                return;
            }

            const body = rows.slice(0, 5).map((row) => {
                const score = clamp(toNumber(row.percentage, 0), 0, 100);
                return `
                    <tr>
                        <td>${escapeHtml(row.test_title || 'Тест')}</td>
                        <td>${escapeHtml(row.subject_name || '-')}</td>
                        <td><span class="student-overview-score-badge ${getScoreToneClass(score)}">${formatPercent(score)}</span></td>
                        <td>${formatDate(row.completed_at)}</td>
                    </tr>
                `;
            }).join('');

            container.innerHTML = `
                <div class="table-responsive">
                    <table class="data-table student-overview-activity-table">
                        <thead>
                            <tr>
                                <th>Название</th>
                                <th>Предмет</th>
                                <th>Балл</th>
                                <th>Дата</th>
                            </tr>
                        </thead>
                        <tbody>${body}</tbody>
                    </table>
                </div>
            `;
        },

        renderRecentBadge: function () {
            const wrap = document.getElementById('studentOverviewBadgeWrap');
            const container = document.getElementById('studentOverviewBadge');
            if (!wrap || !container) return;

            const badge = this.state.data?.recent_badge || null;
            if (!badge) {
                wrap.style.display = 'none';
                container.innerHTML = '';
                return;
            }

            wrap.style.display = '';
            container.innerHTML = `
                <div class="student-overview-badge-card">
                    <div class="student-overview-badge-icon">${escapeHtml(badge.icon || '🏆')}</div>
                    <div>
                        <div class="student-overview-badge-title">Поздравляем! Новый значок: ${escapeHtml(badge.title || '')}</div>
                        <div class="student-overview-badge-date">Получен: ${formatDate(badge.unlocked_at)}</div>
                    </div>
                </div>
            `;
        },

        startAssignment: async function (assignmentId, buttonEl) {
            const safeId = String(assignmentId || '').trim();
            if (!safeId) return;

            if (buttonEl) {
                if (!buttonEl.dataset.originalText) {
                    buttonEl.dataset.originalText = buttonEl.textContent || 'Начать';
                }
                buttonEl.disabled = true;
                buttonEl.textContent = 'Запуск...';
            }

            try {
                const token = window.ZedlyAuth?.getAuthToken?.() || 'cookie-session';
                const response = await fetch('/api/student/attempts', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ assignment_id: safeId })
                });

                let payload = {};
                try {
                    payload = await response.json();
                } catch (error) {
                    payload = {};
                }

                if (!response.ok) {
                    if (payload?.attempt_id) {
                        window.location.href = `/student-attempt.html?attempt_id=${encodeURIComponent(String(payload.attempt_id))}`;
                        return;
                    }
                    throw new Error(payload?.message || 'Не удалось начать тест');
                }

                const attemptId = payload?.attempt_id;
                if (!attemptId) {
                    throw new Error('Не удалось открыть попытку теста');
                }

                window.location.href = `/student-attempt.html?attempt_id=${encodeURIComponent(String(attemptId))}`;
            } catch (error) {
                console.error('Start test from overview error:', error);
                await showAlert(error.message || 'Не удалось начать тест', 'Ошибка');
                if (buttonEl) {
                    buttonEl.disabled = false;
                    buttonEl.textContent = buttonEl.dataset.originalText || 'Начать';
                }
            }
        }
    };
})();
