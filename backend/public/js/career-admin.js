
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
        // Простейшая модалка для создания теста с вопросами
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal modal-large">
                <div class="modal-header">
                    <h2>Создать профтест</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
                </div>
                <div class="modal-body">
                    <form id="createCareerTestForm">
                        <label>Название (RU): <input type="text" name="title_ru" required></label><br>
                        <label>Название (UZ): <input type="text" name="title_uz" required></label><br>
                        <label>Описание (RU): <textarea name="description_ru"></textarea></label><br>
                        <label>Описание (UZ): <textarea name="description_uz"></textarea></label><br>
                        <div id="careerQuestionsBlock"></div>
                        <button type="button" id="addCareerQuestionBtn">Добавить вопрос</button>
                        <br><br>
                        <button type="submit" class="btn btn-primary">Создать тест</button>
                    </form>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const questions = [];
        const questionsBlock = modal.querySelector('#careerQuestionsBlock');
        function renderQuestions() {
            questionsBlock.innerHTML = questions.map((q, i) => `
                <div class="career-question-edit">
                    <b>Вопрос ${i + 1}</b><br>
                    <input type="text" placeholder="Текст вопроса (RU)" value="${q.question_text_ru || ''}" onchange="this._q.question_text_ru=this.value" /><br>
                    <input type="text" placeholder="Текст вопроса (UZ)" value="${q.question_text_uz || ''}" onchange="this._q.question_text_uz=this.value" /><br>
                    <textarea placeholder="Варианты (JSON: [{text_ru,text_uz,value}])" onchange="this._q.options=this.value">${q.options_raw || ''}</textarea><br>
                    <button type="button" onclick="this.parentNode.remove();window.CareerAdminManager._removeQuestion(${i})">Удалить</button>
                </div>
            `).join('');
            // Привязка объектов к DOM
            Array.from(questionsBlock.querySelectorAll('.career-question-edit')).forEach((el, i) => {
                const q = questions[i];
                el.querySelectorAll('input,textarea').forEach(inp => { inp._q = q; });
            });
        }
        CareerAdminManager._removeQuestion = idx => { questions.splice(idx, 1); renderQuestions(); };
        modal.querySelector('#addCareerQuestionBtn').onclick = () => {
            questions.push({
                question_text_ru: '', question_text_uz: '', options_raw: '[{"text_ru":"Да","text_uz":"Ha","value":1},{"text_ru":"Нет","text_uz":"Yo'q","value":0}]' });
            renderQuestions();
            };
            renderQuestions();
            modal.querySelector('#createCareerTestForm').onsubmit = async function (e) {
                e.preventDefault();
                // Собрать данные
                const form = e.target;
                const test = {
                    title_ru: form.title_ru.value,
                    title_uz: form.title_uz.value,
                    description_ru: form.description_ru.value,
                    description_uz: form.description_uz.value,
                    questions: questions.map((q, i) => ({
                        question_text_ru: q.question_text_ru,
                        question_text_uz: q.question_text_uz,
                        options: JSON.parse(q.options_raw || '[]'),
                        order_number: i + 1
                    }))
                };
                try {
                    const res = await fetch('/api/admin/career/tests', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${localStorage.getItem('access_token')}`
                        },
                        body: JSON.stringify(test)
                    });
                    if (!res.ok) throw new Error('Ошибка создания теста');
                    modal.remove();
                    CareerAdminManager.loadTests();
                } catch (err) {
                    alert('Ошибка: ' + err.message);
                }
            };
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
