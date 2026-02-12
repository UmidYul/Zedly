
// CareerAdminManager: Handles SchoolAdmin career test management and analytics UI
const CareerAdminManager = {
    init() {
        // Initialize event listeners for add/edit/delete test buttons
        const addBtn = document.getElementById('addCareerTestBtn');
        if (addBtn) {
            addBtn.addEventListener('click', CareerAdminManager.openCreateTestModal);
        }
        CareerAdminManager.loadTests();
        CareerAdminManager.loadAnalytics();
    },

    async loadTests() {
        const table = document.getElementById('careerTestsTable');
        if (!table) return;
        table.innerHTML = '<div class="spinner"></div>';
        try {
            const res = await fetch('/api/admin/career/tests', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
            });
            if (!res.ok) throw new Error('Failed to load tests');
            const data = await res.json();
            table.innerHTML = CareerAdminManager.renderTestsTable(data.tests || []);
        } catch (e) {
            table.innerHTML = `<p style="color: var(--danger);">Ошибка загрузки тестов</p>`;
        }
    },

    renderTestsTable(tests) {
        if (!tests.length) {
            return '<p data-i18n="career.noTests">Нет созданных тестов. Нажмите "Создать тест".</p>';
        }
        return `<table class="data-table"><thead><tr><th>Название</th><th>Статус</th><th>Вопросов</th><th>Действия</th></tr></thead><tbody>${tests.map(test => `
            <tr>
                <td>${test.title}</td>
                <td>${test.published ? 'Опубликован' : 'Черновик'}</td>
                <td>${test.questions_count}</td>
                <td>
                    <button class="btn btn-xs btn-secondary" onclick="CareerAdminManager.editTest('${test.id}')">Редактировать</button>
                    <button class="btn btn-xs btn-danger" onclick="CareerAdminManager.deleteTest('${test.id}')">Удалить</button>
                </td>
            </tr>
        `).join('')}</tbody></table>`;
    },

    openCreateTestModal() {
        alert('Окно создания теста (реализовать модал)');
    },

    editTest(id) {
        alert('Окно редактирования теста: ' + id);
    },

    deleteTest(id) {
        if (confirm('Удалить тест?')) {
            // TODO: API call to delete
            alert('Тест удалён (реализовать API)');
        }
    },

    async loadAnalytics() {
        const analytics = document.getElementById('careerAnalytics');
        if (!analytics) return;
        analytics.innerHTML = '<div class="spinner"></div>';
        try {
            const res = await fetch('/api/admin/career/analytics', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
            });
            if (!res.ok) throw new Error('Failed to load analytics');
            const data = await res.json();
            analytics.innerHTML = CareerAdminManager.renderAnalytics(data);
        } catch (e) {
            analytics.innerHTML = `<p style="color: var(--danger);">Ошибка загрузки аналитики</p>`;
        }
    },

    renderAnalytics(data) {
        // Placeholder: implement Chart.js analytics rendering
        return `<div>Аналитика профориентации (реализовать графики и таблицы)</div>`;
    }
};

window.CareerAdminManager = CareerAdminManager;
