// Class Details Page Logic
(function () {
    'use strict';

    // Получить id класса из URL
    function getClassId() {
        const params = new URLSearchParams(window.location.search);
        return params.get('id');
    }

    // Основная функция
    async function loadClassDetails() {
        const classId = getClassId();
        if (!classId) {
            document.getElementById('className').textContent = 'Класс не найден';
            return;
        }

        // Получить токен
        const token = localStorage.getItem('access_token');
        // Получить роль пользователя
        let userRole = 'teacher';
        const userDataStr = localStorage.getItem('user');
        if (userDataStr) {
            try {
                const userData = JSON.parse(userDataStr);
                userRole = userData.role || 'teacher';
            } catch (e) { }
        }
        const apiBase = userRole === 'school_admin' ? '/api/admin' : `/api/${userRole}`;

        // Получить инфу о классе
        const classRes = await fetch(`${apiBase}/classes/${classId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!classRes.ok) {
            document.getElementById('className').textContent = 'Ошибка загрузки класса';
            return;
        }
        const payload = await classRes.json();

        // Normalize class object (some endpoints return { class: {...} }, some return the class directly)
        const classObj = payload && payload.class ? payload.class : payload || {};

        // Set header values safely
        const classNameEl = document.getElementById('className');
        const classInfoEl = document.getElementById('classInfo');
        classNameEl.textContent = classObj.name || classObj.class_name || 'Класс';
        classInfoEl.textContent = `Год: ${classObj.academic_year || '-'}, Класс: ${classObj.grade_level || '-'}, Классный руководитель: ${classObj.homeroom_teacher_name || classObj.homeroom_name || 'Не назначен'}`;

        // If the payload already includes subjects/students (teacher route), use them; otherwise fetch separately
        let subjects = [];
        let students = [];

        if (Array.isArray(payload.subjects)) {
            subjects = payload.subjects;
        } else {
            const subjRes = await fetch(`${apiBase}/classes/${classId}/subjects`, {
                headers: { 'Authorization': `Bearer ${token}` }
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
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (studRes.ok) {
                const studPayload = await studRes.json();
                students = Array.isArray(studPayload) ? studPayload : (studPayload.students || []);
            }
        }

        // Render subjects
        const subjBody = document.getElementById('subjectsTableBody');
        if (!subjects || subjects.length === 0) {
            subjBody.innerHTML = '<tr><td colspan="2" class="empty-row">Нет предметов</td></tr>';
        } else {
            subjBody.innerHTML = subjects.map(s => {
                const subjName = s.subject_name || s.name || s.name_ru || s.name_uz || '';
                const teacherName = s.teacher_name || (s.first_name ? `${s.first_name} ${s.last_name || ''}` : '') || '';
                return `<tr><td>${escapeHtml(subjName)}</td><td>${escapeHtml(teacherName)}</td></tr>`;
            }).join('');
        }

        // Render students
        const studBody = document.getElementById('studentsTableBody');
        if (!students || students.length === 0) {
            studBody.innerHTML = '<tr><td colspan="3" class="empty-row">Нет учеников</td></tr>';
        } else {
            studBody.innerHTML = students.map(st => {
                const name = st.name || st.full_name || `${st.first_name || ''} ${st.last_name || ''}`.trim();
                const login = st.login || st.username || '';
                return `<tr><td>${escapeHtml(name)}</td><td>${escapeHtml(login)}</td><td><a href="student-details.html?id=${st.id}">Страница ученика</a></td></tr>`;
            }).join('');
        }

        // small helper to avoid XSS when injecting text
        function escapeHtml(text) {
            if (text === null || text === undefined) return '';
            return String(text)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }
    }

    window.addEventListener('DOMContentLoaded', loadClassDetails);
})();
