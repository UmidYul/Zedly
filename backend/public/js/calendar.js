// Calendar Page (Teacher)
(function () {
    'use strict';

    const API = '/api';

    function looksLikeMojibake(value) {
        if (typeof value !== 'string' || value.length < 4) return false;
        const chunks = value.match(/(?:Р.|С.)/g) || [];
        return chunks.length >= 3 && chunks.length / value.length > 0.2;
    }

    function t(key, fallback, params) {
        const translated = window.ZedlyI18n?.translate?.(key, params);
        if (!translated || translated === key || looksLikeMojibake(translated)) {
            return fallback || key;
        }
        return translated;
    }

    function getCurrentLang() {
        return window.ZedlyI18n?.getCurrentLang?.() || 'ru';
    }

    function getLocale() {
        return getCurrentLang() === 'uz' ? 'uz-UZ' : 'ru-RU';
    }

    const state = {
        monthDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        selectedDate: new Date(),
        classes: [],
        assignments: [],
        filtered: [],
        classFilter: 'all',
        statusFilter: 'all',
        search: ''
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

    function byId(id) {
        return document.getElementById(id);
    }

    function escapeHtml(v) {
        return String(v || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function dayKey(dateLike) {
        const d = new Date(dateLike);
        if (Number.isNaN(d.getTime())) return '';
        return d.toISOString().slice(0, 10);
    }

    function formatMonthYearLabel(dateLike) {
        const d = new Date(dateLike);
        if (Number.isNaN(d.getTime())) return '-';
        const year = String(d.getFullYear());
        const month = t(`calendar.month.${d.getMonth()}`, String(d.getMonth() + 1));
        return t('calendar.monthYear', '{month} {year}', { month, year });
    }

    function formatLongDateLabel(dateLike) {
        const d = new Date(dateLike);
        if (Number.isNaN(d.getTime())) return '-';
        const day = String(d.getDate());
        const year = String(d.getFullYear());
        const month = t(`calendar.month.${d.getMonth()}`, String(d.getMonth() + 1));
        const weekdayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][d.getDay()] || 'mon';
        const weekday = t(`calendar.weekdayLong.${weekdayKey}`, weekdayKey);
        return t('calendar.fullDate', '{weekday}, {day} {month} {year}', { weekday, day, month, year });
    }

    function parseStatus(item) {
        const now = Date.now();
        const start = new Date(item.start_date).getTime();
        const end = new Date(item.end_date).getTime();
        if (!item.is_active) return 'inactive';
        if (now < start) return 'upcoming';
        if (now > end) return 'completed';
        return 'active';
    }

    function statusLabel(status) {
        if (status === 'active') return t('calendar.statusLabel.active', 'Активно');
        if (status === 'upcoming') return t('calendar.statusLabel.upcoming', 'Предстоит');
        if (status === 'completed') return t('calendar.statusLabel.completed', 'Завершено');
        return t('calendar.statusLabel.inactive', 'Неактивно');
    }

    function formatDateTime(value) {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '-';
        return d.toLocaleString(getLocale(), {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function formatDateLabel(value) {
        return formatLongDateLabel(value);
    }

    async function loadClasses() {
        const data = await apiGet(`${API}/teacher/classes?page=1&limit=100`);
        state.classes = data.classes || [];
        const select = byId('calendarClassFilter');
        if (!select) return;
        select.innerHTML = `<option value="all">${escapeHtml(t('calendar.filter.allClasses', 'Все классы'))}</option>` + state.classes
            .map((cls) => `<option value="${cls.id}">${escapeHtml(cls.name)}</option>`)
            .join('');
    }

    async function loadAssignmentsAllPages() {
        const limit = 100;
        const first = await apiGet(`${API}/teacher/assignments?page=1&limit=${limit}&search=&class_id=all&status=all`);
        let rows = first.assignments || [];
        const pages = Number(first.pagination?.pages || 1);
        if (pages > 1) {
            const requests = [];
            for (let p = 2; p <= pages; p += 1) {
                requests.push(apiGet(`${API}/teacher/assignments?page=${p}&limit=${limit}&search=&class_id=all&status=all`));
            }
            const chunks = await Promise.all(requests);
            chunks.forEach((chunk) => {
                rows = rows.concat(chunk.assignments || []);
            });
        }
        state.assignments = rows.map((row) => ({ ...row, status: parseStatus(row) }));
    }

    function applyFilters() {
        const query = state.search.trim().toLowerCase();
        state.filtered = state.assignments.filter((item) => {
            if (state.classFilter !== 'all' && String(item.class_id) !== String(state.classFilter)) return false;
            if (state.statusFilter !== 'all' && item.status !== state.statusFilter) return false;
            if (query) {
                const hay = `${item.test_title || ''} ${item.class_name || ''} ${item.subject_name || ''}`.toLowerCase();
                if (!hay.includes(query)) return false;
            }
            return true;
        });
    }

    function renderKpi() {
        const total = state.filtered.length;
        const active = state.filtered.filter((x) => x.status === 'active').length;
        const upcoming = state.filtered.filter((x) => x.status === 'upcoming').length;
        const completed = state.filtered.filter((x) => x.status === 'completed').length;
        const set = (id, val) => {
            const el = byId(id);
            if (el) el.textContent = String(val);
        };
        set('calendarKpiTotal', total);
        set('calendarKpiActive', active);
        set('calendarKpiUpcoming', upcoming);
        set('calendarKpiCompleted', completed);
    }

    function getMonthGridStartEnd() {
        const first = new Date(state.monthDate.getFullYear(), state.monthDate.getMonth(), 1);
        const last = new Date(state.monthDate.getFullYear(), state.monthDate.getMonth() + 1, 0);
        const firstWeekday = (first.getDay() + 6) % 7; // Monday=0
        const start = new Date(first);
        start.setDate(first.getDate() - firstWeekday);
        const lastWeekday = (last.getDay() + 6) % 7;
        const end = new Date(last);
        end.setDate(last.getDate() + (6 - lastWeekday));
        return { start, end };
    }

    function getEventsForDay(day) {
        const key = dayKey(day);
        const d = new Date(`${key}T00:00:00`);
        return state.filtered.filter((item) => {
            const start = new Date(item.start_date);
            const end = new Date(item.end_date);
            const from = new Date(start.getFullYear(), start.getMonth(), start.getDate());
            const to = new Date(end.getFullYear(), end.getMonth(), end.getDate());
            return d >= from && d <= to;
        });
    }

    function renderMonthGrid() {
        const label = byId('calendarMonthLabel');
        if (label) {
            label.textContent = formatMonthYearLabel(state.monthDate);
        }

        const grid = byId('calendarGrid');
        if (!grid) return;

        const { start, end } = getMonthGridStartEnd();
        const cells = [];
        const iter = new Date(start);
        while (iter <= end) {
            const sameMonth = iter.getMonth() === state.monthDate.getMonth();
            const today = dayKey(iter) === dayKey(new Date());
            const selected = dayKey(iter) === dayKey(state.selectedDate);
            const events = getEventsForDay(iter);
            const badge = events.length ? `<span class="calendar-day-count">${events.length}</span>` : '';
            const topEvents = events.slice(0, 2).map((ev) =>
                `<div class="calendar-mini-event ${ev.status}">${escapeHtml(ev.test_title || t('studentOverview.fallbackTest', 'Тест'))}</div>`
            ).join('');

            cells.push(`
                <button class="calendar-day ${sameMonth ? '' : 'muted'} ${today ? 'today' : ''} ${selected ? 'selected' : ''}" data-date="${dayKey(iter)}" type="button">
                    <div class="calendar-day-head"><span>${iter.getDate()}</span>${badge}</div>
                    <div class="calendar-day-events-mini">${topEvents}</div>
                </button>
            `);
            iter.setDate(iter.getDate() + 1);
        }

        grid.innerHTML = cells.join('');
    }

    function renderSelectedDayEvents() {
        const label = byId('calendarSelectedDateLabel');
        if (label) label.textContent = formatDateLabel(state.selectedDate);

        const container = byId('calendarDayEvents');
        if (!container) return;
        const events = getEventsForDay(state.selectedDate)
            .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));

        if (!events.length) {
            container.innerHTML = `<p class="text-secondary">${t('calendar.dayEvents.none', 'На выбранную дату событий нет')}</p>`;
            return;
        }

        container.innerHTML = events.map((ev) => `
            <div class="calendar-event-card ${ev.status}">
                <div>
                    <strong>${escapeHtml(ev.test_title || t('studentOverview.fallbackTest', 'Тест'))}</strong>
                    <p>${escapeHtml(ev.class_name || '-')} · ${escapeHtml(ev.subject_name || t('calendar.subject.none', 'Без предмета'))}</p>
                </div>
                <div class="calendar-event-card-meta">
                    <span>${formatDateTime(ev.start_date)}</span>
                    <span>${statusLabel(ev.status)}</span>
                    <button class="btn btn-outline calendar-open-event" data-id="${ev.id}" type="button">${escapeHtml(t('calendar.details', 'Детали'))}</button>
                </div>
            </div>
        `).join('');
    }

    function renderUpcomingTable() {
        const tbody = byId('calendarUpcomingTableBody');
        if (!tbody) return;
        const now = Date.now();
        const rows = [...state.filtered]
            .sort((a, b) => new Date(a.start_date) - new Date(b.start_date))
            .filter((x) => new Date(x.end_date).getTime() >= now - (7 * 24 * 3600 * 1000))
            .slice(0, 20);

        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="7" class="empty-row">${escapeHtml(t('calendar.upcoming.none', 'Нет назначений по выбранным фильтрам'))}</td></tr>`;
            return;
        }

        tbody.innerHTML = rows.map((ev) => `
            <tr>
                <td data-label="${escapeHtml(t('calendar.col.test', 'Тест'))}">${escapeHtml(ev.test_title || '-')}</td>
                <td data-label="${escapeHtml(t('calendar.col.class', 'Класс'))}">${escapeHtml(ev.class_name || '-')}</td>
                <td data-label="${escapeHtml(t('calendar.col.subject', 'Предмет'))}">${escapeHtml(ev.subject_name || '-')}</td>
                <td data-label="${escapeHtml(t('calendar.col.start', 'Начало'))}">${formatDateTime(ev.start_date)}</td>
                <td data-label="${escapeHtml(t('calendar.col.end', 'Окончание'))}">${formatDateTime(ev.end_date)}</td>
                <td data-label="${escapeHtml(t('common.status', 'Статус'))}"><span class="students-band ${ev.status === 'active' ? 'high' : (ev.status === 'upcoming' ? 'mid' : 'risk')}">${statusLabel(ev.status)}</span></td>
                <td data-label="${escapeHtml(t('common.actions', 'Действия'))}"><button class="btn btn-outline calendar-open-event" data-id="${ev.id}" type="button">${escapeHtml(t('calendar.open', 'Открыть'))}</button></td>
            </tr>
        `).join('');
    }

    function refreshView() {
        applyFilters();
        renderKpi();
        renderMonthGrid();
        renderSelectedDayEvents();
        renderUpcomingTable();
    }

    function openModal(title, bodyHtml) {
        const overlay = byId('calendarEventModal');
        const titleEl = byId('calendarEventModalTitle');
        const bodyEl = byId('calendarEventModalBody');
        if (!overlay || !titleEl || !bodyEl) return;
        titleEl.textContent = title;
        bodyEl.innerHTML = bodyHtml;
        overlay.classList.remove('hidden');
    }

    function closeModal() {
        const overlay = byId('calendarEventModal');
        if (overlay) overlay.classList.add('hidden');
    }

    async function openEventDetails(assignmentId) {
        try {
            openModal(t('calendar.event.title', 'Событие'), `<p class="text-secondary">${t('common.loading', 'Загрузка...')}</p>`);
            const data = await apiGet(`${API}/teacher/assignments/${encodeURIComponent(assignmentId)}`);
            const a = data.assignment || {};
            const students = data.students || [];
            const done = students.filter((s) => Number(s.attempts_made || 0) > 0).length;
            const passed = students.filter((s) => Number(s.best_score || 0) >= Number(a.passing_score || 0)).length;

            openModal(
                a.test_title || t('calendar.event.title', 'Событие'),
                `
                    <div class="calendar-event-details-grid">
                        <div class="report-kpi"><span>${escapeHtml(t('calendar.details.class', 'Класс'))}</span><strong>${escapeHtml(a.class_name || '-')}</strong></div>
                        <div class="report-kpi"><span>${escapeHtml(t('calendar.details.subject', 'Предмет'))}</span><strong>${escapeHtml(a.subject_name || '-')}</strong></div>
                        <div class="report-kpi"><span>${escapeHtml(t('calendar.details.start', 'Старт'))}</span><strong>${formatDateTime(a.start_date)}</strong></div>
                        <div class="report-kpi"><span>${escapeHtml(t('calendar.details.deadline', 'Дедлайн'))}</span><strong>${formatDateTime(a.end_date)}</strong></div>
                        <div class="report-kpi"><span>${escapeHtml(t('calendar.details.progress', 'Прогресс'))}</span><strong>${done}/${students.length}</strong></div>
                        <div class="report-kpi"><span>${escapeHtml(t('calendar.details.passed', 'Сдали'))}</span><strong>${passed}</strong></div>
                    </div>
                    <div class="table-responsive">
                        <table class="data-table">
                            <thead><tr><th>${escapeHtml(t('calendar.details.table.student', 'Ученик'))}</th><th>${escapeHtml(t('calendar.details.table.attempts', 'Попытки'))}</th><th>${escapeHtml(t('calendar.details.table.bestScore', 'Лучший балл'))}</th><th>${escapeHtml(t('common.status', 'Статус'))}</th></tr></thead>
                            <tbody>
                                ${students.slice(0, 20).map((s) => `
                                    <tr>
                                        <td>${escapeHtml(s.student_name || '-')}</td>
                                        <td>${Number(s.attempts_made || 0)}</td>
                                        <td>${s.best_score != null ? `${Math.round(Number(s.best_score))}%` : '-'}</td>
                                        <td>${Number(s.attempts_made || 0) === 0
                                            ? escapeHtml(t('calendar.studentStatus.notStarted', 'Не начал'))
                                            : (Number(s.best_score || 0) >= Number(a.passing_score || 0)
                                                ? escapeHtml(t('calendar.studentStatus.passed', 'Сдал'))
                                                : escapeHtml(t('calendar.studentStatus.inProgress', 'В процессе'))
                                            )
                                        }</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    <div class="calendar-event-modal-actions">
                        <button class="btn btn-secondary" type="button" id="calendarGoAssignmentsBtn">${escapeHtml(t('calendar.goAssignments', 'Перейти в Назначения'))}</button>
                    </div>
                `
            );

            const toAssignments = byId('calendarGoAssignmentsBtn');
            if (toAssignments) {
                toAssignments.addEventListener('click', () => {
                    window.location.hash = 'assignments';
                    closeModal();
                });
            }
        } catch (error) {
            openModal(t('calendar.event.title', 'Событие'), `<p class="text-secondary">${escapeHtml(error.message || t('calendar.failedLoadDetails', 'Не удалось загрузить детали'))}</p>`);
        }
    }

    function toIcsDate(dateLike) {
        const d = new Date(dateLike);
        if (Number.isNaN(d.getTime())) return '';
        return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    }

    function exportIcs() {
        if (!state.filtered.length) {
            alert(t('calendar.export.noEvents', 'Нет событий для экспорта'));
            return;
        }
        const lines = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            `PRODID:-//Zedly//Calendar//${getCurrentLang().toUpperCase()}`
        ];
        state.filtered.forEach((ev) => {
            lines.push('BEGIN:VEVENT');
            lines.push(`UID:assignment-${ev.id}@zedly`);
            lines.push(`DTSTAMP:${toIcsDate(new Date())}`);
            lines.push(`DTSTART:${toIcsDate(ev.start_date)}`);
            lines.push(`DTEND:${toIcsDate(ev.end_date)}`);
            lines.push(`SUMMARY:${(ev.test_title || t('studentOverview.fallbackTest', 'Тест')).replace(/\n/g, ' ')}`);
            lines.push(`DESCRIPTION:${(`${t('calendar.ics.class', 'Класс')}: ${ev.class_name || '-'}, ${t('calendar.ics.subject', 'Предмет')}: ${ev.subject_name || '-'}`).replace(/\n/g, ' ')}`);
            lines.push('END:VEVENT');
        });
        lines.push('END:VCALENDAR');

        const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `calendar_${Date.now()}.ics`;
        a.click();
        URL.revokeObjectURL(url);
    }

    function handlePdfExport() {
        const root = byId('calendarPage');
        if (!root) return;

        const printWindow = window.open('', '_blank', 'width=1200,height=800');
        if (!printWindow) {
            alert(t('calendar.pdf.popupBlocked', 'Popup blocked. Allow popups to export PDF.'));
            return;
        }

        const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
            .map((link) => `<link rel="stylesheet" href="${link.href}">`)
            .join('');
        const clone = root.cloneNode(true);

        printWindow.document.write(`
            <html>
            <head>
                <title>${escapeHtml(t('calendar.pdf.windowTitleTeacher', 'Calendar PDF'))}</title>
                ${styles}
                <style>
                    :root {
                        --bg-main: #f8fafc;
                        --bg-primary: #ffffff;
                        --bg-secondary: #f8fafc;
                        --bg-card: #ffffff;
                        --surface-card: #ffffff;
                        --surface-glass: #ffffff;
                        --text-primary: #0f172a;
                        --text-secondary: #475569;
                        --text-tertiary: #64748b;
                        --text-muted: #64748b;
                        --border: rgba(15, 23, 42, 0.12);
                        --border-light: rgba(15, 23, 42, 0.08);
                        --border-strong: rgba(15, 23, 42, 0.16);
                    }
                    * { color-adjust: exact; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    body {
                        background: #fff !important;
                        color: #0f172a !important;
                        padding: 16px;
                    }
                    .calendar-page { width: 100% !important; max-width: 100% !important; }
                    .dashboard-section,
                    .card,
                    .surface,
                    .surface-glass {
                        break-inside: avoid;
                        page-break-inside: avoid;
                        box-shadow: none !important;
                        border-color: rgba(15, 23, 42, 0.12) !important;
                        background: #ffffff !important;
                    }
                    #calendarPrevBtn,
                    #calendarNextBtn,
                    #calendarTodayBtn,
                    #calendarExportIcsBtn,
                    #calendarPdfBtn {
                        display: none !important;
                    }
                    table, .data-table { border-color: rgba(15, 23, 42, 0.12) !important; }
                    .data-table th {
                        background: #f1f5f9 !important;
                        color: #334155 !important;
                    }
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
        const prev = byId('calendarPrevBtn');
        const next = byId('calendarNextBtn');
        const today = byId('calendarTodayBtn');
        const classFilter = byId('calendarClassFilter');
        const statusFilter = byId('calendarStatusFilter');
        const search = byId('calendarSearchInput');
        const exportBtn = byId('calendarExportIcsBtn');
        const pdfBtn = byId('calendarPdfBtn');
        const grid = byId('calendarGrid');
        const dayEvents = byId('calendarDayEvents');
        const table = byId('calendarUpcomingTableBody');

        if (prev) {
            prev.addEventListener('click', () => {
                state.monthDate = new Date(state.monthDate.getFullYear(), state.monthDate.getMonth() - 1, 1);
                refreshView();
            });
        }
        if (next) {
            next.addEventListener('click', () => {
                state.monthDate = new Date(state.monthDate.getFullYear(), state.monthDate.getMonth() + 1, 1);
                refreshView();
            });
        }
        if (today) {
            today.addEventListener('click', () => {
                const now = new Date();
                state.monthDate = new Date(now.getFullYear(), now.getMonth(), 1);
                state.selectedDate = now;
                refreshView();
            });
        }
        if (classFilter) {
            classFilter.addEventListener('change', () => {
                state.classFilter = classFilter.value;
                refreshView();
            });
        }
        if (statusFilter) {
            statusFilter.addEventListener('change', () => {
                state.statusFilter = statusFilter.value;
                refreshView();
            });
        }
        if (search) {
            search.addEventListener('input', () => {
                state.search = search.value || '';
                refreshView();
            });
        }
        if (exportBtn) exportBtn.addEventListener('click', exportIcs);
        if (pdfBtn) pdfBtn.addEventListener('click', handlePdfExport);

        if (grid) {
            grid.addEventListener('click', (e) => {
                const day = e.target.closest('.calendar-day');
                if (!day) return;
                const value = day.dataset.date;
                if (!value) return;
                state.selectedDate = new Date(`${value}T00:00:00`);
                refreshView();
            });
        }

        const eventClickHandler = (e) => {
            const btn = e.target.closest('.calendar-open-event');
            if (!btn) return;
            const id = btn.dataset.id;
            if (id) openEventDetails(id);
        };
        if (dayEvents) dayEvents.addEventListener('click', eventClickHandler);
        if (table) table.addEventListener('click', eventClickHandler);

        const closeBtn = byId('calendarEventModalClose');
        const okBtn = byId('calendarEventModalOk');
        const overlay = byId('calendarEventModal');
        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (okBtn) okBtn.addEventListener('click', closeModal);
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) closeModal();
            });
        }
    }

    async function init() {
        if (!byId('calendarPage')) return;
        try {
            await Promise.all([loadClasses(), loadAssignmentsAllPages()]);
            bindEvents();
            refreshView();
        } catch (error) {
            console.error('Calendar init error:', error);
            const grid = byId('calendarGrid');
            if (grid) grid.innerHTML = `<p class="text-secondary">${t('calendar.failedLoad', 'Не удалось загрузить календарь')}</p>`;
        }
    }

    window.CalendarPage = { init };
})();
