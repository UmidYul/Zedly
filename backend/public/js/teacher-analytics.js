// Teacher Class Analytics
(function () {
    'use strict';

    function t(key, fallback) {
        return window.ZedlyI18n?.translate(key) || fallback || key;
    }

    window.TeacherAnalytics = {
        classes: [],
        selectedClassId: null,

        init: async function () {
            this.bindEvents();
            await this.loadClasses();
        },

        bindEvents: function () {
            const select = document.getElementById('classAnalyticsSelect');
            if (select) {
                select.addEventListener('change', () => {
                    this.selectedClassId = select.value || null;
                    if (this.selectedClassId) {
                        this.loadAnalytics();
                    } else {
                        this.renderEmptyState(t('results.selectClassToView', 'Выберите класс для просмотра аналитики.'));
                    }
                });
            }

            const refreshBtn = document.getElementById('refreshAnalyticsBtn');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', () => {
                    if (this.selectedClassId) {
                        this.loadAnalytics();
                    }
                });
            }

            const assignmentsContainer = document.getElementById('classAnalyticsAssignments');
            if (assignmentsContainer) {
                assignmentsContainer.addEventListener('click', (event) => {
                    const button = event.target.closest('.js-view-assignment-results');
                    if (!button) return;
                    const assignmentId = button.dataset.assignmentId;
                    if (!assignmentId) return;
                    window.location.href = `/teacher-results.html?assignment_id=${encodeURIComponent(assignmentId)}`;
                });
            }
        },

        loadClasses: async function () {
            const select = document.getElementById('classAnalyticsSelect');
            if (!select) return;

            select.innerHTML = `<option value="">${t('results.loadingClasses', 'Загрузка классов...')}</option>`;

            try {
                const token = localStorage.getItem('access_token');
                const response = await fetch('/api/teacher/classes?limit=100', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!response.ok) {
                    throw new Error(t('results.failedLoadClasses', 'Не удалось загрузить классы'));
                }

                const data = await response.json();
                this.classes = data.classes || [];

                if (this.classes.length === 0) {
                    select.innerHTML = `<option value="">${t('results.noClassesAvailable', 'Нет доступных классов')}</option>`;
                    this.renderEmptyState(t('results.noClassesForAnalytics', 'Нет классов для аналитики.'));
                    return;
                }

                select.innerHTML = `<option value="">${t('results.selectClass', 'Выберите класс...')}</option>`;
                this.classes.forEach(cls => {
                    const option = document.createElement('option');
                    option.value = cls.id;
                    option.textContent = `${cls.name} (${cls.grade_level} ${t('results.grade', 'класс')})`;
                    select.appendChild(option);
                });

                this.selectedClassId = this.classes[0].id;
                select.value = this.selectedClassId;
                await this.loadAnalytics();

            } catch (error) {
                console.error('Load classes error:', error);
                select.innerHTML = `<option value="">${t('results.failedLoadClasses', 'Не удалось загрузить классы')}</option>`;
                this.renderEmptyState(t('results.unableLoadClassesTryAgain', 'Не удалось загрузить классы. Попробуйте снова.'));
            }
        },

        loadAnalytics: async function () {
            if (!this.selectedClassId) return;

            this.renderLoading();

            try {
                const token = localStorage.getItem('access_token');
                const response = await fetch(`/api/teacher/classes/${this.selectedClassId}/analytics`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!response.ok) {
                    throw new Error(t('results.failedLoadClassAnalytics', 'Не удалось загрузить аналитику класса'));
                }

                const data = await response.json();
                this.renderAnalytics(data);
            } catch (error) {
                console.error('Load analytics error:', error);
                this.renderEmptyState(error.message || t('results.unableLoadAnalytics', 'Не удалось загрузить аналитику.'));
            }
        },

        renderLoading: function () {
            const stats = document.getElementById('classAnalyticsStats');
            const assignments = document.getElementById('classAnalyticsAssignments');
            const notes = document.getElementById('classAnalyticsNotes');

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

            if (assignments) {
                assignments.innerHTML = `<p style="color: var(--text-secondary);">${t('assignments.loading', 'Загрузка назначений...')}</p>`;
            }

            if (notes) {
                notes.innerHTML = `<p style="color: var(--text-secondary);">${t('results.loadingAnalyticsData', 'Загрузка данных аналитики...')}</p>`;
            }
        },

        renderEmptyState: function (message) {
            const stats = document.getElementById('classAnalyticsStats');
            const assignments = document.getElementById('classAnalyticsAssignments');
            const notes = document.getElementById('classAnalyticsNotes');

            if (stats) {
                stats.innerHTML = '';
            }

            if (assignments) {
                assignments.innerHTML = `<p style="color: var(--text-secondary);">${message}</p>`;
            }

            if (notes) {
                notes.innerHTML = '';
            }
        },

        renderAnalytics: function (data) {
            const stats = document.getElementById('classAnalyticsStats');
            const assignments = document.getElementById('classAnalyticsAssignments');
            const notes = document.getElementById('classAnalyticsNotes');

            const summary = data.stats || {};
            const avgScore = summary.avg_percentage !== null && summary.avg_percentage !== undefined
                ? `${parseFloat(summary.avg_percentage).toFixed(1)}%`
                : '-';

            if (stats) {
                stats.innerHTML = `
                    <div class="stat-card">
                        <div class="stat-content">
                            <div class="stat-label">${t('results.students', 'Ученики')}</div>
                            <div class="stat-value">${summary.student_count || 0}</div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-content">
                            <div class="stat-label">${t('results.activeAssignments', 'Активные назначения')}</div>
                            <div class="stat-value">${summary.active_assignments || 0}</div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-content">
                            <div class="stat-label">${t('results.completedAttempts', 'Завершенные попытки')}</div>
                            <div class="stat-value">${summary.completed_attempts || 0}</div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-content">
                            <div class="stat-label">${t('results.averageScore', 'Средний балл')}</div>
                            <div class="stat-value">${avgScore}</div>
                        </div>
                    </div>
                `;
            }

            if (assignments) {
                const list = data.assignments || [];
                if (list.length === 0) {
                    assignments.innerHTML = `<p style="color: var(--text-secondary);">${t('results.noAssignmentsForClass', 'Для этого класса назначения не найдены.')}</p>`;
                } else {
                    assignments.innerHTML = this.renderAssignmentsTable(list);
                }
            }

            if (notes) {
                const classInfo = data.class || {};
                notes.innerHTML = `
                    <div class="section-header">
                        <h2 class="section-title">${t('results.classNotes', 'Заметки класса')}</h2>
                    </div>
                    <p style="color: var(--text-secondary);">
                        ${classInfo.name || t('results.class', 'Класс')} · ${t('results.grade', 'класс')} ${classInfo.grade_level || '-'} · ${t('results.academicYear', 'Учебный год')} ${classInfo.academic_year || '-'}
                    </p>
                `;
            }
        },

        renderAssignmentsTable: function (assignments) {
            let html = `
                <div class="table-responsive">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>${t('results.colTest', 'Тест')}</th>
                                <th>${t('results.window', 'Период')}</th>
                                <th>${t('results.colStatus', 'Статус')}</th>
                                <th>${t('results.completed', 'Завершено')}</th>
                                <th>${t('results.average', 'Среднее')}</th>
                                <th>${t('results.colActions', 'Действия')}</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            assignments.forEach(item => {
                const windowText = `${this.formatDate(item.start_date)} - ${this.formatDate(item.end_date)}`;
                const statusText = this.getStatusLabel(item);
                const statusClass = item.is_active ? 'status-active' : 'status-inactive';
                const avg = item.avg_percentage !== null && item.avg_percentage !== undefined
                    ? `${parseFloat(item.avg_percentage).toFixed(1)}%`
                    : '-';
                const completed = `${item.completed_attempts || 0} / ${item.total_attempts || 0}`;

                html += `
                    <tr>
                        <td>${this.escapeHtml(item.test_title)}</td>
                        <td>${windowText}</td>
                        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                        <td>${completed}</td>
                        <td>${avg}</td>
                        <td>
                            <button class="btn-icon js-view-assignment-results" data-assignment-id="${this.escapeHtml(item.id)}" title="${t('assignments.viewResults', 'Результаты')}">
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

            return html;
        },

        getStatusLabel: function (assignment) {
            const now = new Date();
            const startDate = assignment.start_date ? new Date(assignment.start_date) : null;
            const endDate = assignment.end_date ? new Date(assignment.end_date) : null;

            if (!assignment.is_active) {
                return t('assignments.statusInactive', 'Неактивно');
            }

            if (startDate && now < startDate) {
                return t('assignments.statusUpcoming', 'Скоро');
            }

            if (endDate && now > endDate) {
                return t('assignments.statusCompleted', 'Завершено');
            }

            return t('assignments.statusActive', 'Активно');
        },

        formatDate: function (dateString) {
            if (!dateString) return '-';
            const date = new Date(dateString);
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            return `${day}.${month}.${year}`;
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
