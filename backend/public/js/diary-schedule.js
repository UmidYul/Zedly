// Schedule page for teacher/student (rich scaffold, API-first + mock fallback)
(function () {
    'use strict';

    const U = window.ZedlyDiaryUtils;
    const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const state = {
        weekStart: getWeekStart(new Date()),
        integrationStatus: 'mock',
        endpoint: '',
        lessons: []
    };

    function getWeekStart(date) {
        const d = new Date(date);
        const day = d.getDay();
        const shift = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + shift);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    function weekLabel() {
        const from = new Date(state.weekStart);
        const to = new Date(state.weekStart);
        to.setDate(to.getDate() + 6);
        return `${from.toLocaleDateString()} - ${to.toLocaleDateString()}`;
    }

    function role() {
        return U.getRole() || 'student';
    }

    function getMockData() {
        const base = new Date(state.weekStart);
        const lessons = [];
        for (let d = 0; d < 5; d += 1) {
            for (let l = 1; l <= 3; l += 1) {
                const day = new Date(base);
                day.setDate(base.getDate() + d);
                lessons.push({
                    id: `${d}-${l}`,
                    weekday_index: d,
                    date: day.toISOString().slice(0, 10),
                    lesson_no: l,
                    start_time: `${String(7 + l).padStart(2, '0')}:30`,
                    end_time: `${String(8 + l).padStart(2, '0')}:15`,
                    subject_name: ['Mathematics', 'Physics', 'History'][l - 1],
                    class_name: ['7A', '8B', '9A'][d % 3],
                    room: `${200 + d * 10 + l}`,
                    teacher_name: ['I. Ivanov', 'S. Akhmedov', 'M. Karimova'][l - 1]
                });
            }
        }
        return { lessons };
    }

    async function loadData() {
        const weekStart = state.weekStart.toISOString().slice(0, 10);
        const endpoint = role() === 'teacher'
            ? `/api/v1/schedule/teacher/me?week_start=${weekStart}`
            : `/api/v1/schedule/student/me?week_start=${weekStart}`;
        const result = await U.fetchWithFallback(endpoint, getMockData, { method: 'GET' });
        state.integrationStatus = result.integrationStatus;
        state.endpoint = result.endpoint;
        state.lessons = Array.isArray(result.data?.lessons) ? result.data.lessons : [];
    }

    function getLessonsForDay(dayIndex) {
        return state.lessons.filter((item) => Number(item.weekday_index) === dayIndex);
    }

    function renderWeekGrid() {
        return `
            <div class="diary-mini-calendar">
                ${DAYS.map((day, idx) => {
                    const lessons = getLessonsForDay(idx);
                    return `
                        <div class="diary-day">
                            <div class="top"><strong>${day}</strong><span>${lessons.length}</span></div>
                            ${lessons.slice(0, 2).map((l) => `
                                <div class="event">${U.escapeHtml(l.start_time)} ${U.escapeHtml(l.subject_name)}</div>
                            `).join('')}
                            ${lessons.length > 2 ? `<div class="event">+${lessons.length - 2} more</div>` : ''}
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    function renderTable() {
        if (!state.lessons.length) return U.renderState('empty', 'No lessons in this week');
        const sorted = [...state.lessons].sort((a, b) => {
            if (a.date === b.date) return Number(a.lesson_no || 0) - Number(b.lesson_no || 0);
            return new Date(a.date) - new Date(b.date);
        });
        return `
            <div class="table-responsive mobile-stack-table">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Lesson</th>
                            <th>Time</th>
                            <th>Subject</th>
                            <th>${role() === 'teacher' ? 'Class' : 'Teacher'}</th>
                            <th>Room</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sorted.map((row) => `
                            <tr>
                                <td>${U.escapeHtml(row.date || '-')}</td>
                                <td>${U.escapeHtml(row.lesson_no ?? '-')}</td>
                                <td>${U.escapeHtml(`${row.start_time || '--:--'} - ${row.end_time || '--:--'}`)}</td>
                                <td>${U.escapeHtml(row.subject_name || row.subject || '-')}</td>
                                <td>${U.escapeHtml(role() === 'teacher' ? (row.class_name || '-') : (row.teacher_name || '-'))}</td>
                                <td>${U.escapeHtml(row.room || '-')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    function render() {
        const root = document.getElementById('scheduleRoot');
        if (!root) return;
        root.innerHTML = `
            ${U.renderIntegrationBadge(state.integrationStatus, state.endpoint)}
            <div class="diary-grid diary-grid-2">
                <article class="diary-panel">
                    <h3>Week overview</h3>
                    <p style="margin-bottom:12px;">${U.escapeHtml(weekLabel())}</p>
                    ${renderWeekGrid()}
                </article>
                <article class="diary-panel">
                    <h3>Highlights</h3>
                    <div class="diary-timeline">
                        <div class="diary-timeline-item"><h4>Total lessons</h4><p>${state.lessons.length}</p></div>
                        <div class="diary-timeline-item"><h4>First lesson</h4><p>${state.lessons[0] ? `${U.escapeHtml(state.lessons[0].date)} ${U.escapeHtml(state.lessons[0].start_time)}` : '-'}</p></div>
                        <div class="diary-timeline-item"><h4>Mode</h4><p>${state.integrationStatus === 'mock' ? 'Fallback data' : 'Live API data'}</p></div>
                    </div>
                </article>
            </div>
            <div class="diary-panel" style="margin-top:14px;">
                ${renderTable()}
            </div>
        `;
    }

    function bindEvents() {
        const prev = document.getElementById('schedulePrevWeekBtn');
        const next = document.getElementById('scheduleNextWeekBtn');
        const today = document.getElementById('scheduleTodayBtn');

        if (prev) {
            prev.onclick = async () => {
                state.weekStart.setDate(state.weekStart.getDate() - 7);
                await loadData();
                render();
            };
        }
        if (next) {
            next.onclick = async () => {
                state.weekStart.setDate(state.weekStart.getDate() + 7);
                await loadData();
                render();
            };
        }
        if (today) {
            today.onclick = async () => {
                state.weekStart = getWeekStart(new Date());
                await loadData();
                render();
            };
        }
    }

    async function init() {
        if (!U) return;
        const root = document.getElementById('scheduleRoot');
        if (!root) return;
        root.innerHTML = U.renderState('loading', 'Loading schedule...');
        bindEvents();
        try {
            await loadData();
            render();
        } catch (error) {
            root.innerHTML = U.renderState('error', error.message || 'Failed to load schedule');
        }
    }

    window.DiarySchedulePage = { init };
})();
