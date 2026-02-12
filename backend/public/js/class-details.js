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
        const classData = await classRes.json();
        document.getElementById('className').textContent = classData.name;
        document.getElementById('classInfo').textContent = `Год: ${classData.academic_year}, Класс: ${classData.grade_level}, Классный руководитель: ${classData.homeroom_teacher_name || 'Не назначен'}`;

        // Получить предметы и учителей
        const subjRes = await fetch(`${apiBase}/classes/${classId}/subjects`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        let subjects = [];
        if (subjRes.ok) {
            subjects = await subjRes.json();
        }
        const subjBody = document.getElementById('subjectsTableBody');
        subjBody.innerHTML = subjects.map(s => `<tr><td>${s.subject_name}</td><td>${s.teacher_name}</td></tr>`).join('');

        // Получить учеников
        const studRes = await fetch(`${apiBase}/classes/${classId}/students`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        let students = [];
        if (studRes.ok) {
            students = await studRes.json();
        }
        const studBody = document.getElementById('studentsTableBody');
        studBody.innerHTML = students.map(st => `<tr><td>${st.name}</td><td>${st.login}</td><td><a href="student-details.html?id=${st.id}">Страница ученика</a></td></tr>`).join('');
    }

    window.addEventListener('DOMContentLoaded', loadClassDetails);
})();
