// Student My Class Page
(function () {
    'use strict';

    function token() {
        return localStorage.getItem('access_token') || '';
    }

    function byId(id) {
        return document.getElementById(id);
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function toNumber(value) {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
    }

    function formatPercent(value) {
        return `${(Math.round(toNumber(value) * 10) / 10).toFixed(1)}%`;
    }

    function formatDate(value) {
        if (!value) return '-';
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '-';
        return d.toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function statusLabel(status) {
        if (status === 'completed') return 'Сдано';
        if (status === 'in_progress') return 'В процессе';
        return 'Не начато';
    }

    function statusClass(status) {
        if (status === 'completed') return 'high';
        if (status === 'in_progress') return 'mid';
        return 'risk';
    }

    function openTestsPage() {
        const testsNav = document.querySelector('.nav-item[data-page="tests"]');
        if (testsNav) {
            testsNav.click();
            return;
        }
        window.location.href = '/dashboard#tests';
    }

    async function loadOverview() {
        const response = await fetch('/api/student/my-class/overview', {
            headers: {
                Authorization: `Bearer ${token()}`
            }
        });

        if (!response.ok) {
            throw new Error('Не удалось загрузить данные класса');
        }

        return response.json();
    }

    function renderClassInfo(data) {
        const cls = data.class || {};
        const me = data.me || {};

        const className = byId('studentMyClassName');
        const classMeta = byId('studentMyClassMeta');
        const rankEl = byId('studentMyClassRank');
        const avgEl = byId('studentMyClassAvg');
        const testsEl = byId('studentMyClassTests');
        const activeAssignEl = byId('studentMyClassActiveAssignments');

        if (className) className.textContent = cls.name || 'Мой класс';
        if (classMeta) {
            const grade = cls.grade_level ? `${cls.grade_level} класс` : 'Класс';
            const year = cls.academic_year || '-';
            const teacher = cls.homeroom_teacher_name || 'Не указан';
            const count = cls.student_count || 0;
            classMeta.textContent = `${grade} | ${year} | Классный руководитель: ${teacher} | ${count} учеников`;
        }

        if (rankEl) {
            rankEl.textContent = me.rank ? `#${me.rank}/${me.total_students || '-'}` : '-';
        }
        if (avgEl) avgEl.textContent = formatPercent(me.avg_score);
        if (testsEl) testsEl.textContent = String(me.tests_completed || 0);
        if (activeAssignEl) activeAssignEl.textContent = String(me.active_assignments || 0);
    }

    function renderAssignments(items) {
        const tbody = byId('studentMyClassAssignmentsBody');
        if (!tbody) return;

        if (!Array.isArray(items) || !items.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-row">Сейчас нет активных назначений</td></tr>';
            return;
        }

        tbody.innerHTML = items.map((item) => `
            <tr>
                <td data-label="Тест">${escapeHtml(item.test_title || '-')}</td>
                <td data-label="Предмет">${escapeHtml(item.subject_name || '-')}</td>
                <td data-label="Дедлайн">${formatDate(item.end_date)}</td>
                <td data-label="Мой статус"><span class="students-band ${statusClass(item.my_status)}">${statusLabel(item.my_status)}</span></td>
                <td data-label="Действие">
                    <button class="btn btn-outline btn-sm" type="button" data-action="open-tests">Открыть</button>
                </td>
            </tr>
        `).join('');

        tbody.querySelectorAll('button[data-action="open-tests"]').forEach((button) => {
            button.addEventListener('click', () => {
                openTestsPage();
            });
        });
    }

    function renderSubjects(items) {
        const container = byId('studentMyClassSubjects');
        if (!container) return;

        if (!Array.isArray(items) || !items.length) {
            container.innerHTML = '<div class="empty-state">Недостаточно данных по предметам</div>';
            return;
        }

        container.innerHTML = items.map((item) => {
            const classAvg = formatPercent(item.class_avg_score);
            const myAvg = formatPercent(item.my_avg_score);
            return `
                <div class="subject-item">
                    <div>
                        <div class="subject-name">${escapeHtml(item.subject_name || 'Предмет')}</div>
                        <div class="text-secondary" style="font-size:0.85rem;">Класс: ${classAvg} | Я: ${myAvg}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderClassmates(items) {
        const tbody = byId('studentMyClassStudentsBody');
        if (!tbody) return;

        if (!Array.isArray(items) || !items.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-row">Список одноклассников пуст</td></tr>';
            return;
        }

        tbody.innerHTML = items.map((item, index) => `
            <tr>
                <td data-label="№" class="classmate-roll">${escapeHtml(item.roll_number || String(index + 1))}</td>
                <td data-label="ФИО" class="classmate-name">
                    <span class="classmate-inline-number">${escapeHtml(item.roll_number || String(index + 1))}.</span>
                    ${escapeHtml(item.full_name || '-')}
                </td>
                <td data-label="Средний балл">${formatPercent(item.avg_score)}</td>
                <td data-label="Тестов пройдено">${toNumber(item.tests_completed)}</td>
            </tr>
        `).join('');
    }

    function showEmptyState(show) {
        const root = byId('studentMyClassPage');
        const empty = byId('studentMyClassEmpty');
        if (!root || !empty) return;

        const sections = root.querySelectorAll('section:not(#studentMyClassEmpty)');
        sections.forEach((section) => section.classList.toggle('hidden', show));
        empty.classList.toggle('hidden', !show);
    }

    async function init() {
        if (!byId('studentMyClassPage')) return;

        try {
            const data = await loadOverview();
            if (!data.has_class) {
                showEmptyState(true);
                return;
            }

            showEmptyState(false);
            renderClassInfo(data);
            renderAssignments(data.assignments || []);
            renderSubjects(data.subjects || []);
            renderClassmates(data.classmates || []);
        } catch (error) {
            console.error('Student my class init error:', error);
            showEmptyState(true);
        }
    }

    window.StudentMyClassPage = { init };
})();
