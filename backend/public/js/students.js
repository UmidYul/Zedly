// Students Page (Teacher)
(function () {
    'use strict';

    const API = '/api';
    const PAGE_SIZE = 10;

    const state = {
        classes: [],
        homeroomClassId: null,
        subjects: [],
        selectedClassId: '',
        selectedSubjectId: '',
        students: [],
        assignments: [],
        subjectPerformance: [],
        filtered: [],
        search: '',
        scoreBand: 'all',
        sort: 'score_desc',
        page: 1,
        charts: {
            subject: null,
            assignments: null
        }
    };

    function token() {
        return localStorage.getItem('access_token') || '';
    }

    async function apiGet(url) {
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${token()}` }
        });
        if (!response.ok) throw new Error(`GET ${url} failed: ${response.status}`);
        return response.json();
    }

    async function apiPost(url, body) {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body || {})
        });
        if (!response.ok) {
            let msg = `POST ${url} failed`;
            try {
                const data = await response.json();
                msg = data.message || msg;
            } catch (error) {
                // ignore json parse failure
            }
            throw new Error(msg);
        }
        return response.json();
    }

    function byId(id) {
        return document.getElementById(id);
    }

    function setText(id, value) {
        const el = byId(id);
        if (el) el.textContent = value;
    }

    function formatPercent(value) {
        const n = Number(value || 0);
        return `${Math.round(n)}%`;
    }

    function safeName(student) {
        return `${student.first_name || ''} ${student.last_name || ''}`.trim() || student.username || '—';
    }

    function scoreBand(score) {
        const n = Number(score || 0);
        if (n >= 85) return 'high';
        if (n >= 60) return 'mid';
        return 'risk';
    }

    function scoreBandLabel(score) {
        const b = scoreBand(score);
        if (b === 'high') return 'Сильный';
        if (b === 'mid') return 'Средний';
        return 'Риск';
    }

    function escapeHtml(v) {
        return String(v || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    async function loadFilters() {
        const [classesRes, subjectsRes, homeroomRes] = await Promise.all([
            apiGet(`${API}/teacher/classes?page=1&limit=100`),
            apiGet(`${API}/teacher/subjects`),
            apiGet(`${API}/teacher/homeroom-class`).catch(() => null)
        ]);
        state.classes = classesRes.classes || [];
        state.subjects = subjectsRes.subjects || [];
        state.homeroomClassId = homeroomRes?.class?.id ? String(homeroomRes.class.id) : null;

        const classSelect = byId('studentsClassFilter');
        const subjectSelect = byId('studentsSubjectFilter');
        if (classSelect) {
            classSelect.innerHTML = '<option value="">Выберите класс</option>' +
                state.classes.map((cls) =>
                    `<option value="${cls.id}">${escapeHtml(cls.name)}</option>`
                ).join('');
        }
        if (subjectSelect) {
            subjectSelect.innerHTML = '<option value="">Все предметы</option>' +
                state.subjects.map((s) =>
                    `<option value="${s.id}">${escapeHtml(s.name)}</option>`
                ).join('');
        }
    }

    async function loadClassAnalytics() {
        if (!state.selectedClassId) {
            state.students = [];
            state.assignments = [];
            state.subjectPerformance = [];
            applyFiltersAndRender();
            return;
        }
        const params = new URLSearchParams();
        if (state.selectedSubjectId) params.set('subject_id', state.selectedSubjectId);
        const data = await apiGet(`${API}/teacher/classes/${state.selectedClassId}/analytics?${params.toString()}`);
        state.students = (data.students || []).map((s) => ({ ...s, class_name: data.class?.name || '' }));
        state.assignments = data.assignments || [];
        state.subjectPerformance = data.subject_performance || [];
        state.page = 1;
        applyFiltersAndRender();
    }

    function applyFiltersAndRender() {
        const query = state.search.trim().toLowerCase();
        const scoreFilter = state.scoreBand;
        const selectedClass = state.classes.find((c) => String(c.id) === String(state.selectedClassId));
        const className = selectedClass?.name || '—';

        let rows = state.students.filter((student) => {
            const haystack = `${safeName(student)} ${student.username || ''}`.toLowerCase();
            if (query && !haystack.includes(query)) return false;
            if (scoreFilter !== 'all' && scoreBand(student.avg_score) !== scoreFilter) return false;
            return true;
        });

        rows.forEach((r) => {
            r.class_name = className;
        });

        rows.sort((a, b) => {
            if (state.sort === 'score_desc') return Number(b.avg_score || 0) - Number(a.avg_score || 0);
            if (state.sort === 'score_asc') return Number(a.avg_score || 0) - Number(b.avg_score || 0);
            if (state.sort === 'tests_desc') return Number(b.tests_completed || 0) - Number(a.tests_completed || 0);
            return safeName(a).localeCompare(safeName(b), 'ru');
        });

        state.filtered = rows;
        renderKpi();
        renderCharts();
        renderTable();
        renderInsights();
    }

    function renderKpi() {
        const total = state.filtered.length;
        const completed = state.filtered.reduce((acc, s) => acc + Number(s.tests_completed || 0), 0);
        const avg = total ? state.filtered.reduce((acc, s) => acc + Number(s.avg_score || 0), 0) / total : 0;
        const risk = state.filtered.filter((s) => scoreBand(s.avg_score) === 'risk').length;

        setText('studentsKpiTotal', String(total));
        setText('studentsKpiAvg', formatPercent(avg));
        setText('studentsKpiCompleted', String(completed));
        setText('studentsKpiRisk', String(risk));
    }

    function renderCharts() {
        renderSubjectChart();
        renderAssignmentsChart();
    }

    function renderSubjectChart() {
        const canvas = byId('studentsSubjectChart');
        if (!canvas || !window.Chart) return;
        const labels = state.subjectPerformance.map((x) => x.subject_name || '—');
        const values = state.subjectPerformance.map((x) => Number(x.avg_score || 0));

        if (state.charts.subject) state.charts.subject.destroy();
        state.charts.subject = new window.Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Средний балл',
                    data: values,
                    borderWidth: 1,
                    borderColor: 'rgba(59,130,246,0.9)',
                    backgroundColor: 'rgba(59,130,246,0.35)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, max: 100 }
                }
            }
        });
    }

    function renderAssignmentsChart() {
        const canvas = byId('studentsAssignmentsChart');
        if (!canvas || !window.Chart) return;
        const src = [...state.assignments].slice(0, 12).reverse();
        const labels = src.map((x) => (x.test_title || 'Тест').slice(0, 24));
        const values = src.map((x) => Number(x.avg_percentage || 0));

        if (state.charts.assignments) state.charts.assignments.destroy();
        state.charts.assignments = new window.Chart(canvas, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Средний балл',
                    data: values,
                    borderColor: '#22c55e',
                    backgroundColor: 'rgba(34,197,94,0.18)',
                    tension: 0.28,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, max: 100 }
                }
            }
        });
    }

    function getPagedRows() {
        const start = (state.page - 1) * PAGE_SIZE;
        return state.filtered.slice(start, start + PAGE_SIZE);
    }

    function renderTable() {
        const tbody = byId('studentsTableBody');
        if (!tbody) return;
        const canResetPasswords = !!state.selectedClassId
            && !!state.homeroomClassId
            && String(state.selectedClassId) === String(state.homeroomClassId);

        const pageRows = getPagedRows();
        if (!pageRows.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty-row">Нет данных по выбранным фильтрам</td></tr>';
            renderPagination();
            return;
        }

        tbody.innerHTML = pageRows.map((s) => {
            const studentId = String(s.id);
            return `
                <tr>
                    <td data-label="Ученик">${escapeHtml(safeName(s))}</td>
                    <td data-label="Логин">${escapeHtml(s.username || '-')}</td>
                    <td data-label="Класс">${escapeHtml(s.class_name || '-')}</td>
                    <td data-label="Тесты">${Number(s.tests_completed || 0)}</td>
                    <td data-label="Средний балл"><strong>${formatPercent(s.avg_score)}</strong></td>
                    <td data-label="Статус"><span class="students-band ${scoreBand(s.avg_score)}">${scoreBandLabel(s.avg_score)}</span></td>
                    <td data-label="Действия">
                        <div class="table-actions">
                            <button class="btn btn-outline students-action-btn" data-action="report" data-id="${studentId}" type="button">Отчет</button>
                            ${canResetPasswords
                                ? `<button class="btn btn-secondary students-action-btn" data-action="reset" data-id="${studentId}" type="button">Сброс пароля</button>`
                                : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        renderPagination();
    }
    function renderPagination() {
        const container = byId('studentsPagination');
        if (!container) return;
        const totalPages = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
        state.page = Math.min(state.page, totalPages);

        if (totalPages <= 1) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = `
            <button class="btn btn-outline" type="button" ${state.page === 1 ? 'disabled' : ''} data-page="${state.page - 1}">Назад</button>
            <span>Страница ${state.page} из ${totalPages}</span>
            <button class="btn btn-outline" type="button" ${state.page >= totalPages ? 'disabled' : ''} data-page="${state.page + 1}">Вперед</button>
        `;
    }

    function renderInsights() {
        const el = byId('studentsInsights');
        if (!el) return;
        if (!state.filtered.length) {
            el.innerHTML = '<li>Выберите класс, чтобы увидеть аналитику.</li>';
            return;
        }

        const top = state.filtered[0];
        const weakest = [...state.filtered].sort((a, b) => Number(a.avg_score || 0) - Number(b.avg_score || 0))[0];
        const riskCount = state.filtered.filter((s) => scoreBand(s.avg_score) === 'risk').length;
        const activeCount = state.filtered.filter((s) => Number(s.tests_completed || 0) >= 3).length;

        el.innerHTML = `
            <li>Лучший результат: ${escapeHtml(safeName(top))} (${formatPercent(top.avg_score)})</li>
            <li>Требует внимания: ${escapeHtml(safeName(weakest))} (${formatPercent(weakest.avg_score)})</li>
            <li>Ученики в зоне риска: ${riskCount}</li>
            <li>Активных по тестам (>=3): ${activeCount}</li>
        `;
    }

    function openModal(title, html) {
        const overlay = byId('studentsDetailModal');
        const titleEl = byId('studentsModalTitle');
        const bodyEl = byId('studentsModalBody');
        if (!overlay || !titleEl || !bodyEl) return;
        titleEl.textContent = title;
        bodyEl.innerHTML = html;
        overlay.classList.remove('hidden');
    }

    function closeModal() {
        const overlay = byId('studentsDetailModal');
        if (overlay) overlay.classList.add('hidden');
    }

    async function openStudentReport(studentId) {
        try {
            openModal('Отчет ученика', '<p class="text-secondary">Загрузка...</p>');
            const report = await apiGet(`${API}/analytics/student/${encodeURIComponent(studentId)}/report`);
            const overall = report.overall || {};
            const ranking = report.ranking || {};
            const strengths = report.strengths || [];
            const weaknesses = report.weaknesses || [];
            const student = report.student || {};

            openModal(
                `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'Отчет ученика',
                `
                    <div class="students-report-grid">
                        <div class="report-kpi"><span>Попыток</span><strong>${Number(overall.total_attempts || 0)}</strong></div>
                        <div class="report-kpi"><span>Средний балл</span><strong>${formatPercent(overall.avg_score)}</strong></div>
                        <div class="report-kpi"><span>Лучший</span><strong>${formatPercent(overall.max_score)}</strong></div>
                        <div class="report-kpi"><span>Ранг в классе</span><strong>${ranking.rank || '-'} / ${ranking.total_students || '-'}</strong></div>
                    </div>
                    <div class="students-report-block">
                        <h4>Сильные стороны</h4>
                        <ul>${strengths.map((x) => `<li>${escapeHtml(x.subject)}: ${formatPercent(x.avg_score)}</li>`).join('') || '<li>Недостаточно данных</li>'}</ul>
                    </div>
                    <div class="students-report-block">
                        <h4>Зоны роста</h4>
                        <ul>${weaknesses.map((x) => `<li>${escapeHtml(x.subject)}: ${formatPercent(x.avg_score)}</li>`).join('') || '<li>Недостаточно данных</li>'}</ul>
                    </div>
                `
            );
        } catch (error) {
            openModal('Отчет ученика', `<p class="text-secondary">${escapeHtml(error.message || 'Не удалось загрузить отчет')}</p>`);
        }
    }

    async function resetStudentPassword(studentId) {
        const confirmed = window.ZedlyDialog?.confirm
            ? await window.ZedlyDialog.confirm('Сбросить пароль этому ученику?', { title: 'Подтверждение' })
            : confirm('Сбросить пароль этому ученику?');
        if (!confirmed) return;

        try {
            const classId = state.selectedClassId ? String(state.selectedClassId) : '';
            if (!classId) {
                throw new Error('Выберите класс');
            }
            const data = await apiPost(
                `${API}/teacher/students/${encodeURIComponent(studentId)}/reset-password?class_id=${encodeURIComponent(classId)}`,
                {}
            );
            const userName = data.user?.name || data.user?.username || 'Ученик';

            if (window.ZedlyDialog?.temporaryPassword) {
                await window.ZedlyDialog.temporaryPassword({
                    title: 'Временный пароль',
                    subtitle: `Пароль для ${userName}:`,
                    password: data.tempPassword || '',
                    passwordLabel: 'Временный пароль',
                    copyText: 'Скопировать',
                    hint: 'Передайте пароль ученику и попросите сменить после входа.',
                    okText: 'Готово'
                });
            } else {
                openModal(
                    'Временный пароль',
                    `
                        <p>${escapeHtml(userName)}</p>
                        <div class="password-box">${escapeHtml(data.tempPassword || '-')}</div>
                        <p class="text-secondary">Передайте пароль ученику и попросите сменить после входа.</p>
                    `
                );
            }
        } catch (error) {
            if (window.ZedlyDialog?.alert) {
                await window.ZedlyDialog.alert(error.message || 'Не удалось сбросить пароль', { title: 'Ошибка' });
            } else {
                alert(error.message || 'Не удалось сбросить пароль');
            }
        }
    }
    function exportCsv() {
        const base = state.filtered;
        if (!base.length) {
            alert('Нет данных для экспорта');
            return;
        }
        const header = ['name', 'username', 'class', 'tests_completed', 'avg_score', 'status'];
        const lines = [header.join(',')].concat(base.map((s) => {
            const cols = [
                safeName(s),
                s.username || '',
                s.class_name || '',
                Number(s.tests_completed || 0),
                Number(s.avg_score || 0).toFixed(1),
                scoreBandLabel(s.avg_score)
            ];
            return cols.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',');
        }));
        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `students_${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    function handlePdfExport() {
        const root = byId('studentsPage');
        if (!root) return;

        const printWindow = window.open('', '_blank', 'width=1200,height=800');
        if (!printWindow) {
            alert('Popup blocked. Allow popups to export PDF.');
            return;
        }

        const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
            .map((link) => `<link rel="stylesheet" href="${link.href}">`)
            .join('');

        const clone = root.cloneNode(true);
        ['studentsSubjectChart', 'studentsAssignmentsChart'].forEach((id) => {
            const sourceCanvas = byId(id);
            const targetCanvas = clone.querySelector(`#${id}`);
            if (!sourceCanvas || !targetCanvas) return;
            try {
                const image = document.createElement('img');
                image.alt = `${id} chart`;
                image.src = sourceCanvas.toDataURL('image/png', 1.0);
                image.style.width = '100%';
                image.style.maxHeight = '360px';
                image.style.objectFit = 'contain';
                targetCanvas.replaceWith(image);
            } catch (error) {
                // keep canvas fallback if rendering export image fails
            }
        });

        printWindow.document.write(`
            <html>
            <head>
                <title>Students PDF</title>
                ${styles}
                <style>
                    body { background: #fff !important; padding: 16px; }
                    .students-page { width: 100% !important; max-width: 100% !important; }
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
        const classFilter = byId('studentsClassFilter');
        const subjectFilter = byId('studentsSubjectFilter');
        const search = byId('studentsSearchInput');
        const scoreBandFilter = byId('studentsScoreBandFilter');
        const sortFilter = byId('studentsSortFilter');
        const refresh = byId('studentsRefreshBtn');
        const exportBtn = byId('studentsExportBtn');
        const pdfBtn = byId('studentsPdfBtn');
        const tbody = byId('studentsTableBody');
        const pagination = byId('studentsPagination');

        if (classFilter) {
            classFilter.addEventListener('change', async () => {
                state.selectedClassId = classFilter.value;
                await loadClassAnalytics();
            });
        }

        if (subjectFilter) {
            subjectFilter.addEventListener('change', async () => {
                state.selectedSubjectId = subjectFilter.value;
                await loadClassAnalytics();
            });
        }

        if (search) {
            search.addEventListener('input', () => {
                state.search = search.value || '';
                state.page = 1;
                applyFiltersAndRender();
            });
        }

        if (scoreBandFilter) {
            scoreBandFilter.addEventListener('change', () => {
                state.scoreBand = scoreBandFilter.value;
                state.page = 1;
                applyFiltersAndRender();
            });
        }

        if (sortFilter) {
            sortFilter.addEventListener('change', () => {
                state.sort = sortFilter.value;
                applyFiltersAndRender();
            });
        }

        if (refresh) refresh.addEventListener('click', loadClassAnalytics);
        if (exportBtn) exportBtn.addEventListener('click', exportCsv);
        if (pdfBtn) pdfBtn.addEventListener('click', handlePdfExport);

        if (tbody) {

            tbody.addEventListener('click', async (e) => {
                const btn = e.target.closest('.students-action-btn');
                if (!btn) return;
                const id = btn.dataset.id;
                const action = btn.dataset.action;
                if (!id || !action) return;
                if (action === 'report') await openStudentReport(id);
                if (action === 'reset') await resetStudentPassword(id);
            });
        }

        if (pagination) {
            pagination.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-page]');
                if (!btn) return;
                const nextPage = Number(btn.dataset.page || state.page);
                state.page = nextPage;
                renderTable();
            });
        }

        const modalClose = byId('studentsModalClose');
        const modalOk = byId('studentsModalOk');
        const modal = byId('studentsDetailModal');
        if (modalClose) modalClose.addEventListener('click', closeModal);
        if (modalOk) modalOk.addEventListener('click', closeModal);
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeModal();
            });
        }
    }

    async function init() {
        if (!byId('studentsPage')) return;
        try {
            await loadFilters();
            bindEvents();
            applyFiltersAndRender();
        } catch (error) {
            console.error('Students page init error:', error);
            alert('Не удалось инициализировать страницу Ученики');
        }
    }

    window.StudentsPage = { init };
})();
