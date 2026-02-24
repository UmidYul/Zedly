(function () {
    'use strict';

    const API = '/api';

    const state = {
        monthDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        selectedDate: new Date(),
        assignments: [],
        filtered: [],
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
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function parseStatus(item) {
        const explicit = String(item?.status || item?.assignment_status || '').toLowerCase();
        if (['active', 'upcoming', 'completed', 'inactive'].includes(explicit)) return explicit;

        const now = Date.now();
        const start = new Date(item.start_date).getTime();
        const end = new Date(item.end_date).getTime();
        if (item.is_active === false) return 'inactive';
        if (Number.isNaN(start) || Number.isNaN(end)) return 'inactive';
        if (now < start) return 'upcoming';
        if (now > end) return 'completed';
        return 'active';
    }

    function statusLabel(status) {
        if (status === 'active') return 'Активно';
        if (status === 'upcoming') return 'Предстоит';
        if (status === 'completed') return 'Завершено';
        return 'Неактивно';
    }

    function formatDateTime(value) {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '-';
        return d.toLocaleString('ru-RU', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function formatDateLabel(value) {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '-';
        return d.toLocaleDateString('ru-RU', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    async function loadAssignments() {
        const data = await apiGet(`${API}/student/assignments?status=all`);
        const rows = Array.isArray(data?.assignments) ? data.assignments : [];
        state.assignments = rows.map((row) => ({ ...row, status: parseStatus(row) }));
    }

    function applyFilters() {
        const query = state.search.trim().toLowerCase();
        state.filtered = state.assignments.filter((item) => {
            if (state.statusFilter !== 'all' && item.status !== state.statusFilter) return false;
            if (query) {
                const hay = `${item.test_title || ''} ${item.subject_name || ''}`.toLowerCase();
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
        const firstWeekday = (first.getDay() + 6) % 7;
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
            label.textContent = state.monthDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
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
                `<div class="calendar-mini-event ${ev.status}">${escapeHtml(ev.test_title || 'Тест')}</div>`
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
            container.innerHTML = '<p class="text-secondary">На выбранную дату событий нет</p>';
            return;
        }

        container.innerHTML = events.map((ev) => `
            <div class="calendar-event-card ${ev.status}">
                <div>
                    <strong>${escapeHtml(ev.test_title || 'Тест')}</strong>
                    <p>${escapeHtml(ev.subject_name || 'Без предмета')}</p>
                </div>
                <div class="calendar-event-card-meta">
                    <span>${formatDateTime(ev.start_date)}</span>
                    <span>${statusLabel(ev.status)}</span>
                    <button class="btn btn-outline calendar-open-event" data-id="${ev.id}" type="button">Детали</button>
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
            tbody.innerHTML = '<tr><td colspan="6" class="empty-row">Нет назначений по выбранным фильтрам</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map((ev) => `
            <tr>
                <td data-label="Тест">${escapeHtml(ev.test_title || '-')}</td>
                <td data-label="Предмет">${escapeHtml(ev.subject_name || '-')}</td>
                <td data-label="Начало">${formatDateTime(ev.start_date)}</td>
                <td data-label="Окончание">${formatDateTime(ev.end_date)}</td>
                <td data-label="Статус"><span class="students-band ${ev.status === 'active' ? 'high' : (ev.status === 'upcoming' ? 'mid' : 'risk')}">${statusLabel(ev.status)}</span></td>
                <td data-label="Действия"><button class="btn btn-outline calendar-open-event" data-id="${ev.id}" type="button">Открыть</button></td>
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

    function openEventDetails(assignmentId) {
        const a = state.assignments.find((row) => String(row.id) === String(assignmentId)) || {};
        const attemptsMade = Number(a.attempts_made || 0);
        const bestScore = a.best_score != null ? `${Math.round(Number(a.best_score))}%` : '-';

        openModal(
            a.test_title || 'Событие',
            `
                <div class="calendar-event-details-grid">
                    <div class="report-kpi"><span>Предмет</span><strong>${escapeHtml(a.subject_name || '-')}</strong></div>
                    <div class="report-kpi"><span>Старт</span><strong>${formatDateTime(a.start_date)}</strong></div>
                    <div class="report-kpi"><span>Дедлайн</span><strong>${formatDateTime(a.end_date)}</strong></div>
                    <div class="report-kpi"><span>Статус</span><strong>${statusLabel(a.status || parseStatus(a))}</strong></div>
                    <div class="report-kpi"><span>Попыток</span><strong>${attemptsMade}</strong></div>
                    <div class="report-kpi"><span>Лучший балл</span><strong>${bestScore}</strong></div>
                </div>
                <div class="calendar-event-modal-actions">
                    <button class="btn btn-secondary" type="button" id="calendarGoTestsBtn">Перейти к тестам</button>
                </div>
            `
        );

        const toTests = byId('calendarGoTestsBtn');
        if (toTests) {
            toTests.addEventListener('click', () => {
                window.location.href = `/dashboard?assignment_id=${encodeURIComponent(String(a.id || ''))}#tests`;
                closeModal();
            });
        }
    }

    function toIcsDate(dateLike) {
        const d = new Date(dateLike);
        if (Number.isNaN(d.getTime())) return '';
        return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    }

    function exportIcs() {
        if (!state.filtered.length) {
            alert('Нет событий для экспорта');
            return;
        }
        const lines = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Zedly//StudentCalendar//RU'
        ];
        state.filtered.forEach((ev) => {
            lines.push('BEGIN:VEVENT');
            lines.push(`UID:assignment-${ev.id}@zedly`);
            lines.push(`DTSTAMP:${toIcsDate(new Date())}`);
            lines.push(`DTSTART:${toIcsDate(ev.start_date)}`);
            lines.push(`DTEND:${toIcsDate(ev.end_date)}`);
            lines.push(`SUMMARY:${(ev.test_title || 'Тест').replace(/\n/g, ' ')}`);
            lines.push(`DESCRIPTION:${(`Предмет: ${ev.subject_name || '-'}`).replace(/\n/g, ' ')}`);
            lines.push('END:VEVENT');
        });
        lines.push('END:VCALENDAR');

        const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `student_calendar_${Date.now()}.ics`;
        a.click();
        URL.revokeObjectURL(url);
    }

    function handlePdfExport() {
        const root = byId('calendarPage');
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

        printWindow.document.write(`
            <html>
            <head>
                <title>Student Calendar PDF</title>
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
            await loadAssignments();
            bindEvents();
            refreshView();
        } catch (error) {
            console.error('Student calendar init error:', error);
            const grid = byId('calendarGrid');
            if (grid) grid.innerHTML = '<p class="text-secondary">Не удалось загрузить календарь</p>';
        }
    }

    window.StudentCalendarPage = { init };
})();
