(function () {
    'use strict';

    function getClassId() {
        const params = new URLSearchParams(window.location.search);
        return params.get('id');
    }

    function safeText(value, fallback = '-') {
        if (value === null || value === undefined || value === '') {
            return fallback;
        }
        return String(value);
    }

    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    async function loadClassDetails() {
        const classId = getClassId();
        if (!classId) {
            document.getElementById('className').textContent = 'Класс не найден';
            document.getElementById('classInfo').textContent = 'В URL отсутствует идентификатор класса.';
            return;
        }

        const token = localStorage.getItem('access_token');
        let userRole = 'teacher';
        let currentUserId = '';

        const userDataStr = localStorage.getItem('user');
        if (userDataStr) {
            try {
                const userData = JSON.parse(userDataStr);
                userRole = userData.role || 'teacher';
                currentUserId = userData.id || '';
            } catch (error) {
                userRole = 'teacher';
                currentUserId = '';
            }
        }

        const apiBase = userRole === 'school_admin' ? '/api/admin' : `/api/${userRole}`;

        const classRes = await fetch(`${apiBase}/classes/${classId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!classRes.ok) {
            document.getElementById('className').textContent = 'Ошибка загрузки класса';
            document.getElementById('classInfo').textContent = 'Не удалось получить данные о классе.';
            return;
        }

        const payload = await classRes.json();
        const classObj = payload && payload.class ? payload.class : payload || {};

        const className = safeText(classObj.name || classObj.class_name, 'Класс');
        const academicYear = safeText(classObj.academic_year);
        const gradeLevel = safeText(classObj.grade_level);
        const homeroom = safeText(classObj.homeroom_teacher_name || classObj.homeroom_name, 'Не назначен');
        const isTeacher = userRole === 'teacher';
        const isHomeroomTeacher = isTeacher && String(classObj.homeroom_teacher_id || '') === String(currentUserId || '');
        const canViewStudentLogin = !isTeacher || isHomeroomTeacher;

        document.getElementById('className').textContent = className;
        document.getElementById('classInfo').textContent = `Учебный год: ${academicYear} • Параллель: ${gradeLevel} • Классный руководитель: ${homeroom}`;

        let subjects = [];
        let students = [];

        if (Array.isArray(payload.subjects)) {
            subjects = payload.subjects;
        } else {
            const subjRes = await fetch(`${apiBase}/classes/${classId}/subjects`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (subjRes.ok) {
                const subjPayload = await subjRes.json();
                subjects = Array.isArray(subjPayload) ? subjPayload : (subjPayload.subjects || []);
            }
        }

        if (Array.isArray(payload.students)) {
            students = payload.students;
        } else {
            const studRes = await fetch(`${apiBase}/classes/${classId}/students`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (studRes.ok) {
                const studPayload = await studRes.json();
                students = Array.isArray(studPayload) ? studPayload : (studPayload.students || []);
            }
        }

        document.getElementById('subjectCount').textContent = String(subjects.length);
        document.getElementById('studentCount').textContent = String(students.length);

        const subjBody = document.getElementById('subjectsTableBody');
        if (!subjects.length) {
            subjBody.innerHTML = '<tr><td colspan="2" class="empty-row">Предметы пока не назначены</td></tr>';
        } else {
            subjBody.innerHTML = subjects.map((subject) => {
                const subjName = subject.subject_name || subject.name || subject.name_ru || subject.name_uz || '';
                const teacherName = subject.teacher_name || (subject.first_name ? `${subject.first_name} ${subject.last_name || ''}` : '') || 'Не назначен';
                return `<tr><td>${escapeHtml(subjName)}</td><td>${escapeHtml(teacherName)}</td></tr>`;
            }).join('');
        }

        const studBody = document.getElementById('studentsTableBody');
        const studentsHeadRow = document.querySelector('.students-section thead tr');
        if (studentsHeadRow) {
            studentsHeadRow.innerHTML = canViewStudentLogin
                ? '<th>Имя</th><th>Логин</th><th>Действия</th>'
                : '<th>Имя</th><th>Действия</th>';
        }

        if (!students.length) {
            studBody.innerHTML = `<tr><td colspan="${canViewStudentLogin ? 3 : 2}" class="empty-row">В классе пока нет учеников</td></tr>`;
        } else {
            studBody.innerHTML = students.map((student) => {
                const name = student.name || student.full_name || `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'Без имени';
                const login = student.login || student.username || '—';
                const profileHref = `student-details.html?id=${encodeURIComponent(student.id)}&class_id=${encodeURIComponent(classId)}`;
                if (canViewStudentLogin) {
                    return `
                        <tr>
                            <td>${escapeHtml(name)}</td>
                            <td>${escapeHtml(login)}</td>
                            <td class="actions-cell"><a href="${profileHref}">Профиль ученика</a></td>
                        </tr>
                    `;
                }
                return `
                    <tr>
                        <td>${escapeHtml(name)}</td>
                        <td class="actions-cell"><a href="${profileHref}">Профиль ученика</a></td>
                    </tr>
                `;
            }).join('');
        }
    }

    window.addEventListener('DOMContentLoaded', loadClassDetails);
})();
