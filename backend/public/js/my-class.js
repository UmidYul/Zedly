(function () {
    'use strict';

    function t(key, fallback, params) {
        const translated = window.ZedlyI18n?.translate?.(key, params);
        if (!translated || translated === key) {
            return fallback || key;
        }
        return translated;
    }

    function showConfirm(message, title) {
        title = title || t('common.confirmation', 'Подтверждение');
        if (window.ZedlyDialog?.confirm) {
            return window.ZedlyDialog.confirm(message, { title });
        }
        return Promise.resolve(window.confirm(message));
    }

    const state = {
        students: [],
        classes: [],
        activeClassId: null,
        chart: null
    };

    function setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    function showElement(id, show) {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.toggle('hidden', !show);
    }

    function formatPercent(value) {
        const num = Number(value);
        if (!Number.isFinite(num)) return '0%';
        const rounded = Math.round(num * 10) / 10;
        return `${rounded}%`;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    async function loadHomeroomClasses() {
        const response = await fetch('/api/teacher/homeroom-classes', {
            headers: { Authorization: `Bearer ${window.ZedlyAuth?.getAuthToken?.() || 'cookie-session'}` }
        });

        if (!response.ok) {
            return [];
        }

        const data = await response.json();
        return data.classes || [];
    }

    async function loadAnalytics(classId) {
        const response = await fetch(`/api/teacher/classes/${classId}/analytics`, {
            headers: { Authorization: `Bearer ${window.ZedlyAuth?.getAuthToken?.() || 'cookie-session'}` }
        });

        if (!response.ok) {
            throw new Error('Failed to load analytics');
        }

        return response.json();
    }

    function renderSubjectPerformance(items) {
        const container = document.getElementById('subjectPerformance');
        if (!container) return;

        if (!items || items.length === 0) {
            container.innerHTML = `<div class="empty-state">${t('myClass.subjects.noData', 'Нет данных по предметам')}</div>`;
            return;
        }

        container.innerHTML = items.map((item) => {
            const score = Number(item.avg_score) || 0;
            const width = Math.min(Math.max(score, 0), 100);
            return `
                <div class="subject-item">
                    <div>
                        <div class="subject-name">${escapeHtml(item.subject_name || t('myClass.subject', 'Предмет'))}</div>
                        <div class="subject-bar"><span style="width: ${width}%"></span></div>
                    </div>
                    <div class="subject-score">${formatPercent(score)}</div>
                </div>
            `;
        }).join('');
    }

    function renderSubjectChart(items) {
        const canvas = document.getElementById('subjectChart');
        if (!canvas || !window.Chart) return;

        if (!items || items.length === 0) {
            if (state.chart) {
                state.chart.destroy();
                state.chart = null;
            }
            return;
        }

        const values = (items || []).map(item => Math.round(Number(item.avg_score || 0) * 10) / 10);
        const translatedLabels = (items || []).map(item => item.subject_name || t('myClass.subject', 'Предмет'));

        if (state.chart) {
            state.chart.destroy();
        }

        state.chart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: translatedLabels,
                datasets: [{
                    label: t('myClass.chart.avgScore', 'Средний балл (%)'),
                    data: values,
                    backgroundColor: 'rgba(74, 144, 226, 0.5)',
                    borderColor: 'rgba(74, 144, 226, 1)',
                    borderWidth: 1,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.08)'
                        },
                        ticks: {
                            color: '#9CA3AF'
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: '#9CA3AF'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `${ctx.parsed.y}%`
                        }
                    }
                }
            }
        });
    }

    function updateClassSelector() {
        const select = document.getElementById('classSelect');
        const row = document.getElementById('classSelectRow');
        if (!select || !row) return;

        if (state.classes.length <= 1) {
            row.classList.add('hidden');
        } else {
            row.classList.remove('hidden');
        }

        select.innerHTML = state.classes.map((cls) => {
            const gradeSuffix = t('classes.gradeSuffix', 'класс');
            const label = `${cls.name || t('myClass.classFallback', 'Класс')} • ${cls.grade_level || '-'} ${gradeSuffix}`;
            return `<option value="${cls.id}">${label}</option>`;
        }).join('');

        select.value = state.activeClassId || (state.classes[0] && state.classes[0].id) || '';
        select.addEventListener('change', (event) => {
            const newId = event.target.value;
            if (newId) {
                loadClassData(newId);
            }
        });
    }

    function renderStudents(students) {
        const tbody = document.getElementById('studentsTableBody');
        if (!tbody) return;

        if (!students || students.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="empty-row">${t('myClass.students.notFound', 'Ученики не найдены')}</td></tr>`;
            return;
        }

        tbody.innerHTML = students.map((student) => {
            const name = `${student.first_name || ''} ${student.last_name || ''}`.trim() || t('myClass.student.noName', 'Без имени');
            const avg = Number(student.avg_score);
            const profileHref = `student-details.html?id=${encodeURIComponent(student.id)}&class_id=${encodeURIComponent(state.activeClassId || '')}`;
            return `
                <tr>
                    <td data-label="${escapeHtml(t('myClass.col.name', 'Имя'))}">${escapeHtml(name)}</td>
                    <td data-label="${escapeHtml(t('myClass.col.login', 'Логин'))}">${escapeHtml(student.username || '-')}</td>
                    <td data-label="${escapeHtml(t('myClass.col.testsCompleted', 'Тестов пройдено'))}">${student.tests_completed || 0}</td>
                    <td data-label="${escapeHtml(t('myClass.col.avgScore', 'Средний балл'))}">${Number.isFinite(avg) ? formatPercent(avg) : '—'}</td>
                    <td data-label="${escapeHtml(t('myClass.col.actions', 'Действия'))}">
                        <div class="student-actions">
                            <button class="icon-action-btn" type="button" data-action="profile" data-profile-href="${profileHref}" title="${escapeHtml(t('myClass.action.profile', 'Профиль ученика'))}" aria-label="${escapeHtml(t('myClass.action.profile', 'Профиль ученика'))}">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                    <circle cx="12" cy="12" r="3"></circle>
                                </svg>
                            </button>
                            <button class="icon-action-btn danger" type="button" data-action="reset-password" data-student-id="${student.id}" title="${escapeHtml(t('myClass.action.resetPassword', 'Сбросить пароль'))}" aria-label="${escapeHtml(t('myClass.action.resetPassword', 'Сбросить пароль'))}">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="5" y="11" width="14" height="10" rx="2"></rect>
                                    <path d="M8 11V8a4 4 0 0 1 8 0v3"></path>
                                </svg>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function applySearchFilter(query) {
        const value = query.trim().toLowerCase();
        if (!value) {
            renderStudents(state.students);
            return;
        }
        const filtered = state.students.filter((student) => {
            const name = `${student.first_name || ''} ${student.last_name || ''}`.toLowerCase();
            const login = String(student.username || '').toLowerCase();
            return name.includes(value) || login.includes(value);
        });
        renderStudents(filtered);
    }

    async function handleResetPassword(studentId) {
        const confirmed = await showConfirm(t('myClass.reset.confirm', 'Сбросить пароль ученика? Будет выдан временный пароль.'));
        if (!confirmed) return;

        const response = await fetch(`/api/teacher/students/${studentId}/reset-password`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${window.ZedlyAuth?.getAuthToken?.() || 'cookie-session'}` }
        });

        if (!response.ok) {
            if (window.ZedlyDialog?.alert) {
                await window.ZedlyDialog.alert(t('myClass.reset.failed', 'Не удалось сбросить пароль. Попробуйте позже.'), { title: t('common.error', 'Ошибка') });
            } else {
                alert(t('myClass.reset.failed', 'Не удалось сбросить пароль. Попробуйте позже.'));
            }
            return;
        }

        const data = await response.json();
        const studentName = data.user?.name || t('myClass.student.generic', 'ученика');

        if (window.ZedlyDialog?.temporaryPassword) {
            await window.ZedlyDialog.temporaryPassword({
                title: t('myClass.password.title', 'Временный пароль'),
                subtitle: t('myClass.password.subtitle', 'Пароль для {name}:', { name: studentName }),
                password: data.tempPassword || '',
                passwordLabel: t('myClass.password.label', 'Временный пароль'),
                copyText: t('myClass.password.copy', 'Скопировать'),
                hint: t('myClass.password.hint', 'Передайте пароль ученику и попросите сменить его после входа.'),
                okText: t('myClass.password.ok', 'Готово')
            });
            return;
        }

        if (window.ZedlyDialog?.alert) {
            await window.ZedlyDialog.alert(`${studentName}: ${data.tempPassword || '-'}`, { title: t('myClass.password.title', 'Временный пароль') });
        } else {
            alert(t('myClass.password.fallbackAlert', 'Временный пароль для {name}: {password}', { name: studentName, password: data.tempPassword || '-' }));
        }
    }

    async function loadClassData(classId) {
        state.activeClassId = classId;

        const selected = state.classes.find((cls) => String(cls.id) === String(classId));
        const year = selected?.academic_year || '-';
        const gradeLevel = selected?.grade_level || '-';
        setText('className', selected?.name || t('myClass.classFallback', 'Класс'));
        setText('classMeta', t('myClass.meta', 'Учебный год: {year} • Параллель: {gradeLevel}', { year, gradeLevel }));

        const analytics = await loadAnalytics(classId);

        setText('studentCount', analytics.stats?.student_count ?? 0);
        setText('assignmentCount', analytics.stats?.assignments_total ?? 0);
        setText('activeAssignments', analytics.stats?.active_assignments ?? 0);
        setText('avgScore', formatPercent(analytics.stats?.avg_percentage));

        renderSubjectPerformance(analytics.subject_performance || []);
        renderSubjectChart(analytics.subject_performance || []);
        state.students = analytics.students || [];
        renderStudents(state.students);

        const searchInput = document.getElementById('studentSearch');
        if (searchInput) {
            searchInput.value = '';
        }
    }

    async function init() {
        try {
            const root = document.getElementById('myClassPage');
            if (!root) return;

            if (state.chart) {
                state.chart.destroy();
                state.chart = null;
            }
            state.students = [];
            state.classes = [];
            state.activeClassId = null;
            state.classes = await loadHomeroomClasses();
            if (!state.classes.length) {
                showElement('emptyState', true);
                showElement('heroCard', false);
                showElement('analyticsCard', false);
                showElement('studentsCard', false);
                return;
            }

            state.activeClassId = state.classes[0].id;
            updateClassSelector();
            await loadClassData(state.activeClassId);

            const searchInput = document.getElementById('studentSearch');
            if (searchInput) {
                searchInput.addEventListener('input', (e) => applySearchFilter(e.target.value));
            }

            const tableBody = document.getElementById('studentsTableBody');
            if (tableBody) {
                tableBody.addEventListener('click', (event) => {
                    const button = event.target.closest('.icon-action-btn');
                    if (!button) return;

                    const action = button.getAttribute('data-action');
                    if (action === 'profile') {
                        const href = button.getAttribute('data-profile-href');
                        if (href) window.location.href = href;
                        return;
                    }

                    if (action === 'reset-password') {
                        const studentId = button.getAttribute('data-student-id');
                        if (studentId) {
                            handleResetPassword(studentId);
                        }
                    }
                });
            }

        } catch (error) {
            console.error('My class page error:', error);
        }
    }

    window.MyClassPage = { init };
})();
