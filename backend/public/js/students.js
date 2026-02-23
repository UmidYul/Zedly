// Students Page (Teacher)
(function () {
    'use strict';

    const API = '/api';
    const PAGE_SIZE = 12;

    const state = {
        classes: [],
        homeroomClassId: null,
        selectedClassId: '',
        students: [],
        filtered: [],
        search: '',
        status: 'all',
        progress: 'all',
        sort: 'name_asc',
        page: 1,
        selectedIds: new Set()
    };

    function token() {
        return window.ZedlyAuth?.getAuthToken?.() || 'cookie-session';
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
            let message = `POST ${url} failed`;
            try {
                const payload = await response.json();
                message = payload.message || message;
            } catch (error) {
                // ignore
            }
            throw new Error(message);
        }

        return response.json();
    }

    function byId(id) {
        return document.getElementById(id);
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function safeName(student) {
        return `${student.first_name || ''} ${student.last_name || ''}`.trim() || student.username || '-';
    }

    function toNumber(value) {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
    }

    function formatPercent(value) {
        return `${Math.round(toNumber(value))}%`;
    }

    function formatDateTime(value) {
        if (!value) return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '-';
        const dd = String(date.getDate()).padStart(2, '0');
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const yyyy = date.getFullYear();
        const hh = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        return `${dd}.${mm}.${yyyy} ${hh}:${min}`;
    }

    function scoreBand(score) {
        const n = toNumber(score);
        if (n >= 85) return 'high';
        if (n >= 60) return 'mid';
        return 'risk';
    }

    function studentStatus(student) {
        return student.is_active ? 'active' : 'inactive';
    }

    function statusLabel(status) {
        return status === 'active' ? 'Активен' : 'Неактивен';
    }

    function canResetPasswords() {
        return !!state.selectedClassId
            && !!state.homeroomClassId
            && String(state.selectedClassId) === String(state.homeroomClassId);
    }

    function updateSubtitle() {
        const subtitle = byId('studentsPageSubtitle');
        if (!subtitle) return;
        if (!state.selectedClassId) {
            subtitle.textContent = 'Выберите класс для просмотра учеников';
            return;
        }
        const selectedClass = state.classes.find((item) => String(item.id) === String(state.selectedClassId));
        const className = selectedClass?.name || 'Класс';
        subtitle.textContent = `${className}: ${state.students.length} учеников`;
    }

    async function loadFilters() {
        const [classesRes, homeroomRes] = await Promise.all([
            apiGet(`${API}/teacher/classes?page=1&limit=100`),
            apiGet(`${API}/teacher/homeroom-class`).catch(() => null)
        ]);

        state.classes = classesRes.classes || [];
        state.homeroomClassId = homeroomRes?.class?.id ? String(homeroomRes.class.id) : null;

        const classSelect = byId('studentsClassFilter');
        if (!classSelect) return;

        classSelect.innerHTML = state.classes
            .map((cls) => `<option value="${cls.id}">${escapeHtml(cls.name)}</option>`)
            .join('');

        if (state.classes.length > 0) {
            const homeroomId = state.homeroomClassId ? String(state.homeroomClassId) : '';
            const hasHomeroom = homeroomId && state.classes.some((cls) => String(cls.id) === homeroomId);
            state.selectedClassId = hasHomeroom ? homeroomId : String(state.classes[0].id);
            classSelect.value = state.selectedClassId;
        } else {
            state.selectedClassId = '';
        }
    }

    async function loadClassAnalytics() {
        if (!state.selectedClassId) {
            state.students = [];
            state.filtered = [];
            state.selectedIds.clear();
            state.page = 1;
            updateSubtitle();
            renderKpi();
            renderTable();
            updateBulkControls();
            return;
        }

        const data = await apiGet(`${API}/teacher/classes/${encodeURIComponent(state.selectedClassId)}/analytics`);
        state.students = (data.students || []).map((student, index) => ({
            ...student,
            journal_no: student.roll_number || String(index + 1),
            tests_completed: toNumber(student.tests_completed),
            avg_score: toNumber(student.avg_score),
            last_attempt_at: student.last_attempt_at || null,
            is_active: Boolean(student.enrollment_active) && Boolean(student.user_active)
        }));

        state.selectedIds.clear();
        state.page = 1;
        updateSubtitle();
        applyFiltersAndRender();
    }

    function applyFiltersAndRender() {
        const searchText = state.search.trim().toLowerCase();
        const status = state.status;
        const progress = state.progress;

        let rows = state.students.filter((student) => {
            const haystack = `${safeName(student)} ${student.username || ''}`.toLowerCase();
            if (searchText && !haystack.includes(searchText)) return false;
            if (status !== 'all' && studentStatus(student) !== status) return false;
            if (progress === 'with_attempts' && toNumber(student.tests_completed) <= 0) return false;
            if (progress === 'no_attempts' && toNumber(student.tests_completed) > 0) return false;
            return true;
        });

        rows.sort((a, b) => {
            if (state.sort === 'score_desc') return toNumber(b.avg_score) - toNumber(a.avg_score);
            if (state.sort === 'last_activity_desc') return new Date(b.last_attempt_at || 0) - new Date(a.last_attempt_at || 0);
            return safeName(a).localeCompare(safeName(b), 'ru');
        });

        state.filtered = rows;
        state.page = Math.max(1, Math.min(state.page, Math.max(1, Math.ceil(rows.length / PAGE_SIZE))));
        renderKpi();
        renderTable();
        updateBulkControls();
    }

    function renderKpi() {
        const total = state.students.length;
        const active = state.students.filter((student) => studentStatus(student) === 'active').length;
        const risk = state.students.filter((student) => scoreBand(student.avg_score) === 'risk').length;

        const totalEl = byId('studentsKpiTotal');
        const activeEl = byId('studentsKpiActive');
        const riskEl = byId('studentsKpiRisk');
        if (totalEl) totalEl.textContent = String(total);
        if (activeEl) activeEl.textContent = String(active);
        if (riskEl) riskEl.textContent = String(risk);
    }

    function pagedRows() {
        const start = (state.page - 1) * PAGE_SIZE;
        return state.filtered.slice(start, start + PAGE_SIZE);
    }

    function renderTable() {
        const tbody = byId('studentsTableBody');
        if (!tbody) return;

        const rows = pagedRows();
        const pageStartIndex = (state.page - 1) * PAGE_SIZE;
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="9" class="empty-row">Нет данных по выбранным фильтрам</td></tr>';
            renderPagination();
            syncSelectAllCheckbox();
            return;
        }

        tbody.innerHTML = rows.map((student, index) => {
            const id = String(student.id);
            const rowNumber = pageStartIndex + index + 1;
            const status = studentStatus(student);
            const checked = state.selectedIds.has(id) ? 'checked' : '';
            const profileHref = `student-details.html?id=${encodeURIComponent(id)}&class_id=${encodeURIComponent(state.selectedClassId || '')}`;

            return `
                <tr>
                    <td class="bulk-checkbox-cell" data-label="Выбор">
                        <input type="checkbox" class="students-row-check" data-id="${id}" ${checked}>
                    </td>
                    <td data-label="№">${rowNumber}</td>
                    <td data-label="ФИО">${escapeHtml(safeName(student))}</td>
                    <td data-label="Логин">${escapeHtml(student.username || '-')}</td>
                    <td data-label="Тестов пройдено">${toNumber(student.tests_completed)}</td>
                    <td data-label="Средний балл"><strong>${formatPercent(student.avg_score)}</strong></td>
                    <td data-label="Последняя активность">${formatDateTime(student.last_attempt_at)}</td>
                    <td data-label="Статус"><span class="students-band ${status === 'active' ? 'high' : 'risk'}">${statusLabel(status)}</span></td>
                    <td data-label="Действия">
                        <div class="table-actions">
                            <a class="btn-icon" href="${profileHref}" title="Профиль" aria-label="Профиль">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                    <circle cx="12" cy="7" r="4"></circle>
                                </svg>
                            </a>
                            ${canResetPasswords() ? `
                            <button class="btn-icon btn-danger students-action-btn" data-action="reset" data-id="${id}" type="button" title="Сбросить пароль" aria-label="Сбросить пароль">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                </svg>
                            </button>` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        renderPagination();
        syncSelectAllCheckbox();
    }

    function renderPagination() {
        const container = byId('studentsPagination');
        if (!container) return;

        const totalPages = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
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

    function syncSelectAllCheckbox() {
        const selectAll = byId('studentsSelectAll');
        if (!selectAll) return;

        const rows = pagedRows();
        if (!rows.length) {
            selectAll.checked = false;
            selectAll.indeterminate = false;
            selectAll.disabled = true;
            return;
        }

        selectAll.disabled = false;
        const ids = rows.map((student) => String(student.id));
        const checkedCount = ids.filter((id) => state.selectedIds.has(id)).length;
        selectAll.checked = checkedCount > 0 && checkedCount === ids.length;
        selectAll.indeterminate = checkedCount > 0 && checkedCount < ids.length;
    }

    function updateBulkControls() {
        const bulkBtn = byId('studentsBulkResetBtn');
        if (!bulkBtn) return;

        const allowed = canResetPasswords();
        const hasSelected = state.selectedIds.size > 0;
        bulkBtn.disabled = !allowed || !hasSelected;
        bulkBtn.title = allowed
            ? ''
            : 'Массовый сброс доступен только для вашего классного класса';
    }

    async function resetStudentPassword(studentId) {
        const confirmed = window.ZedlyDialog?.confirm
            ? await window.ZedlyDialog.confirm('Сбросить пароль этому ученику?', { title: 'Подтверждение' })
            : confirm('Сбросить пароль этому ученику?');
        if (!confirmed) return;

        const classId = state.selectedClassId ? String(state.selectedClassId) : '';
        if (!classId) {
            throw new Error('Выберите класс');
        }

        return apiPost(
            `${API}/teacher/students/${encodeURIComponent(studentId)}/reset-password?class_id=${encodeURIComponent(classId)}`,
            {}
        );
    }

    async function bulkResetPasswords() {
        if (!canResetPasswords()) return;
        const ids = Array.from(state.selectedIds);
        if (!ids.length) return;

        const confirmed = window.ZedlyDialog?.confirm
            ? await window.ZedlyDialog.confirm(`Сбросить пароли для выбранных учеников (${ids.length})?`, { title: 'Подтверждение' })
            : confirm(`Сбросить пароли для выбранных учеников (${ids.length})?`);
        if (!confirmed) return;

        let success = 0;
        for (const id of ids) {
            try {
                await apiPost(
                    `${API}/teacher/students/${encodeURIComponent(id)}/reset-password?class_id=${encodeURIComponent(state.selectedClassId)}`,
                    {}
                );
                success += 1;
            } catch (error) {
                // continue resetting for others
            }
        }

        state.selectedIds.clear();
        renderTable();
        updateBulkControls();

        const message = `Сброшено паролей: ${success} из ${ids.length}`;
        if (window.ZedlyDialog?.alert) {
            await window.ZedlyDialog.alert(message, { title: 'Готово' });
        } else {
            alert(message);
        }
    }

    function exportCsv() {
        if (!state.filtered.length) {
            alert('Нет данных для экспорта');
            return;
        }

        const header = ['journal_no', 'full_name', 'username', 'tests_completed', 'avg_score', 'last_activity', 'status'];
        const lines = [header.join(',')].concat(state.filtered.map((student) => {
            const cols = [
                student.journal_no || '-',
                safeName(student),
                student.username || '',
                toNumber(student.tests_completed),
                toNumber(student.avg_score).toFixed(1),
                formatDateTime(student.last_attempt_at),
                statusLabel(studentStatus(student))
            ];
            return cols.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',');
        }));

        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `students_${Date.now()}.csv`;
        anchor.click();
        URL.revokeObjectURL(url);
    }

    function bindEvents() {
        const classFilter = byId('studentsClassFilter');
        const search = byId('studentsSearchInput');
        const statusFilter = byId('studentsStatusFilter');
        const progressFilter = byId('studentsProgressFilter');
        const sortFilter = byId('studentsSortFilter');
        const refreshBtn = byId('studentsRefreshBtn');
        const exportBtn = byId('studentsExportBtn');
        const tbody = byId('studentsTableBody');
        const pagination = byId('studentsPagination');
        const selectAll = byId('studentsSelectAll');
        const bulkResetBtn = byId('studentsBulkResetBtn');
        const modalClose = byId('studentsModalClose');
        const modalOk = byId('studentsModalOk');
        const modal = byId('studentsDetailModal');

        if (classFilter) {
            classFilter.addEventListener('change', async () => {
                state.selectedClassId = classFilter.value;
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

        if (statusFilter) {
            statusFilter.addEventListener('change', () => {
                state.status = statusFilter.value;
                state.page = 1;
                applyFiltersAndRender();
            });
        }

        if (progressFilter) {
            progressFilter.addEventListener('change', () => {
                state.progress = progressFilter.value;
                state.page = 1;
                applyFiltersAndRender();
            });
        }

        if (sortFilter) {
            sortFilter.addEventListener('change', () => {
                state.sort = sortFilter.value;
                state.page = 1;
                applyFiltersAndRender();
            });
        }

        if (refreshBtn) {
            refreshBtn.addEventListener('click', loadClassAnalytics);
        }

        if (exportBtn) {
            exportBtn.addEventListener('click', exportCsv);
        }

        if (tbody) {
            tbody.addEventListener('click', async (event) => {
                const actionButton = event.target.closest('.students-action-btn');
                if (!actionButton) return;

                const action = actionButton.dataset.action;
                const id = actionButton.dataset.id;
                if (!action || !id) return;

                if (action === 'reset') {
                    try {
                        const payload = await resetStudentPassword(id);
                        const userName = payload.user?.name || payload.user?.username || 'Ученик';
                        const tempPassword = payload.tempPassword || '-';

                        if (window.ZedlyDialog?.temporaryPassword) {
                            await window.ZedlyDialog.temporaryPassword({
                                title: 'Временный пароль',
                                subtitle: `Пароль для ${userName}:`,
                                password: tempPassword,
                                passwordLabel: 'Временный пароль',
                                copyText: 'Скопировать',
                                hint: 'Передайте пароль ученику и попросите сменить после входа.',
                                okText: 'Готово'
                            });
                        } else {
                            alert(`Временный пароль: ${tempPassword}`);
                        }
                    } catch (error) {
                        if (window.ZedlyDialog?.alert) {
                            await window.ZedlyDialog.alert(error.message || 'Не удалось сбросить пароль', { title: 'Ошибка' });
                        } else {
                            alert(error.message || 'Не удалось сбросить пароль');
                        }
                    }
                }
            });

            tbody.addEventListener('change', (event) => {
                const checkbox = event.target.closest('.students-row-check');
                if (!checkbox) return;
                const id = String(checkbox.dataset.id || '');
                if (!id) return;

                if (checkbox.checked) state.selectedIds.add(id);
                else state.selectedIds.delete(id);

                syncSelectAllCheckbox();
                updateBulkControls();
            });
        }

        if (selectAll) {
            selectAll.addEventListener('change', () => {
                const visibleIds = pagedRows().map((student) => String(student.id));
                if (selectAll.checked) {
                    visibleIds.forEach((id) => state.selectedIds.add(id));
                } else {
                    visibleIds.forEach((id) => state.selectedIds.delete(id));
                }
                renderTable();
                updateBulkControls();
            });
        }

        if (bulkResetBtn) {
            bulkResetBtn.addEventListener('click', bulkResetPasswords);
        }

        if (pagination) {
            pagination.addEventListener('click', (event) => {
                const pageButton = event.target.closest('[data-page]');
                if (!pageButton) return;
                const nextPage = Number(pageButton.dataset.page || state.page);
                state.page = nextPage;
                renderTable();
                updateBulkControls();
            });
        }

        if (modalClose) modalClose.addEventListener('click', () => byId('studentsDetailModal')?.classList.add('hidden'));
        if (modalOk) modalOk.addEventListener('click', () => byId('studentsDetailModal')?.classList.add('hidden'));
        if (modal) {
            modal.addEventListener('click', (event) => {
                if (event.target === modal) modal.classList.add('hidden');
            });
        }
    }

    async function init() {
        if (!byId('studentsPage')) return;
        try {
            await loadFilters();
            bindEvents();
            await loadClassAnalytics();
        } catch (error) {
            console.error('Students page init error:', error);
            alert('Не удалось инициализировать страницу "Ученики"');
        }
    }

    window.StudentsPage = { init };
})();
