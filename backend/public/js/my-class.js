(function () {
    'use strict';

    function showConfirm(message, title = 'Подтверждение') {
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

    async function loadHomeroomClasses() {
        const response = await fetch('/api/teacher/homeroom-classes', {
            headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` }
        });

        if (!response.ok) {
            return [];
        }

        const data = await response.json();
        return data.classes || [];
    }

    async function loadAnalytics(classId) {
        const response = await fetch(`/api/teacher/classes/${classId}/analytics`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` }
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
            container.innerHTML = '<div class="empty-state">Нет данных по предметам</div>';
            return;
        }

        container.innerHTML = items.map((item) => {
            const score = Number(item.avg_score) || 0;
            const width = Math.min(Math.max(score, 0), 100);
            return `
                <div class="subject-item">
                    <div>
                        <div class="subject-name">${item.subject_name || 'Предмет'}</div>
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

        const labels = (items || []).map(item => item.subject_name || 'Предмет');
        const values = (items || []).map(item => Math.round(Number(item.avg_score || 0) * 10) / 10);

        if (state.chart) {
            state.chart.destroy();
        }

        state.chart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Средний балл (%)',
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
            const label = `${cls.name || 'Класс'} · ${cls.grade_level || '-'} класс`;
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
            tbody.innerHTML = '<tr><td colspan="5" class="empty-row">Ученики не найдены</td></tr>';
            return;
        }

        tbody.innerHTML = students.map((student) => {
            const name = `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'Без имени';
            const avg = Number(student.avg_score);
            return `
                <tr>
                    <td>${name}</td>
                    <td>${student.username || '-'}</td>
                    <td>${student.tests_completed || 0}</td>
                    <td>${Number.isFinite(avg) ? formatPercent(avg) : '—'}</td>
                    <td>
                        <button class="action-btn" data-student-id="${student.id}">Сбросить пароль</button>
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
        const confirmed = await showConfirm('Сбросить пароль ученика? Будет выдан временный пароль.');
        if (!confirmed) return;

        const response = await fetch(`/api/teacher/students/${studentId}/reset-password`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` }
        });

        if (!response.ok) {
            openPasswordModal('Ошибка', 'Не удалось сбросить пароль. Попробуйте позже.', true);
            return;
        }

        const data = await response.json();
        openPasswordModal(data.user?.name || 'ученика', data.tempPassword);
    }

    function openPasswordModal(name, password, isError = false) {
        const modal = document.getElementById('passwordModal');
        const nameEl = document.getElementById('modalStudentName');
        const passEl = document.getElementById('modalPassword');
        if (!modal || !nameEl || !passEl) return;

        if (isError) {
            nameEl.textContent = 'Ошибка';
            passEl.textContent = password || '—';
        } else {
            nameEl.textContent = `Пароль для ${name}`;
            passEl.textContent = password || '—';
        }

        modal.classList.remove('hidden');
    }

    function closePasswordModal() {
        const modal = document.getElementById('passwordModal');
        if (modal) modal.classList.add('hidden');
    }

    async function loadClassData(classId) {
        state.activeClassId = classId;

        const selected = state.classes.find((cls) => String(cls.id) === String(classId));
        setText('className', selected?.name || 'Класс');
        setText('classMeta', `Учебный год: ${selected?.academic_year || '-'} • Параллель: ${selected?.grade_level || '-'}`);

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
                    const target = event.target;
                    if (target && target.matches('.action-btn')) {
                        const studentId = target.getAttribute('data-student-id');
                        if (studentId) {
                            handleResetPassword(studentId);
                        }
                    }
                });
            }

            const modalClose = document.getElementById('modalClose');
            const modalOk = document.getElementById('modalOk');
            const modalCopy = document.getElementById('modalCopy');
            const modalOverlay = document.getElementById('passwordModal');

            if (modalClose) modalClose.addEventListener('click', closePasswordModal);
            if (modalOk) modalOk.addEventListener('click', closePasswordModal);
            if (modalOverlay) {
                modalOverlay.addEventListener('click', (event) => {
                    if (event.target === modalOverlay) closePasswordModal();
                });
            }
            if (modalCopy) {
                modalCopy.addEventListener('click', async () => {
                    const text = document.getElementById('modalPassword')?.textContent || '';
                    if (!text || text === '—') return;
                    try {
                        await navigator.clipboard.writeText(text);
                        modalCopy.textContent = 'Скопировано';
                        setTimeout(() => { modalCopy.textContent = 'Скопировать'; }, 1200);
                    } catch (error) {
                        modalCopy.textContent = 'Не удалось';
                        setTimeout(() => { modalCopy.textContent = 'Скопировать'; }, 1200);
                    }
                });
            }
        } catch (error) {
            console.error('My class page error:', error);
        }
    }

    window.MyClassPage = { init };
})();
