(function () {
    'use strict';

    const state = {
        role: null,
        interests: [],
        questions: [],
        subjects: []
    };

    function token() {
        return window.ZedlyAuth?.getAuthToken?.() || 'cookie-session';
    }

    async function api(url, options = {}) {
        const response = await fetch(url, {
            ...options,
            headers: {
                Authorization: `Bearer ${token()}`,
                'Content-Type': 'application/json',
                ...(options.headers || {})
            }
        });

        let payload = {};
        try {
            payload = await response.json();
        } catch (_) {
            payload = {};
        }

        if (!response.ok) {
            throw new Error(payload.message || `Request failed: ${response.status}`);
        }

        return payload;
    }

    async function alertMessage(message, title = 'Информация') {
        if (window.ZedlyDialog?.alert) {
            return window.ZedlyDialog.alert(message, { title });
        }
        alert(message);
        return Promise.resolve();
    }

    async function confirmMessage(message, title = 'Подтверждение') {
        if (window.ZedlyDialog?.confirm) {
            return window.ZedlyDialog.confirm(message, { title });
        }
        return Promise.resolve(confirm(message));
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    async function loadRole() {
        const me = await api('/api/auth/me');
        state.role = me?.user?.role || null;
    }

    function rootApi() {
        return '/api/psychologist';
    }

    async function loadSubjects() {
        try {
            const data = await api(`${rootApi()}/subjects`);
            state.subjects = Array.isArray(data.subjects) ? data.subjects : [];
        } catch (_) {
            state.subjects = [];
        }
    }

    async function showFormModal(config) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';

            const fieldsHtml = (config.fields || []).map((field) => {
                const value = field.value ?? '';
                const label = escapeHtml(field.label || field.name);
                const name = escapeHtml(field.name);
                const fieldClass = field.type === 'textarea'
                    ? 'career-admin-field full'
                    : 'career-admin-field';
                if (field.type === 'textarea') {
                    return `<div class="${fieldClass}"><label class="form-label">${label}</label><textarea data-name="${name}" class="form-input" rows="4">${escapeHtml(value)}</textarea></div>`;
                }
                if (field.type === 'select') {
                    const options = (field.options || []).map((opt) => {
                        const selected = String(opt.value) === String(value) ? 'selected' : '';
                        return `<option value="${escapeHtml(opt.value)}" ${selected}>${escapeHtml(opt.label)}</option>`;
                    }).join('');
                    return `<div class="${fieldClass}"><label class="form-label">${label}</label><select data-name="${name}" class="form-input">${options}</select></div>`;
                }
                if (field.type === 'checkbox') {
                    const checked = value ? 'checked' : '';
                    return `<div class="${fieldClass} full"><label class="form-label"><input data-name="${name}" type="checkbox" ${checked}> ${label}</label></div>`;
                }
                if (field.type === 'checklist') {
                    const selected = new Set(Array.isArray(value) ? value.map(String) : []);
                    const options = Array.isArray(field.options) ? field.options : [];
                    const searchId = `${name}-search`;
                    const listHtml = options.map((opt) => {
                        const optValue = String(opt.value);
                        const checked = selected.has(optValue) ? 'checked' : '';
                        return `
                            <label class="career-admin-checklist-item">
                                <input data-name="${name}" type="checkbox" value="${escapeHtml(optValue)}" ${checked}>
                                <span>${escapeHtml(opt.label)}</span>
                            </label>
                        `;
                    }).join('');
                    return `
                        <div class="career-admin-field full">
                            <label class="form-label">${label}</label>
                            <input id="${searchId}" data-checklist-search="${name}" class="form-input career-admin-checklist-search" type="text" placeholder="Поиск предмета...">
                            <div class="career-admin-checklist" data-checklist-list="${name}">
                                ${listHtml || '<div class="empty-state">Список предметов пуст</div>'}
                            </div>
                        </div>
                    `;
                }
                const type = field.type === 'number' ? 'number' : 'text';
                return `<div class="${fieldClass}"><label class="form-label">${label}</label><input data-name="${name}" class="form-input" type="${type}" value="${escapeHtml(value)}"></div>`;
            }).join('');

            overlay.innerHTML = `
                <div class="modal career-admin-modal">
                    <div class="modal-header career-admin-modal-header">
                        <h3 class="modal-title">${escapeHtml(config.title || 'Форма')}</h3>
                        <button class="modal-close" type="button">&times;</button>
                    </div>
                    <div class="modal-body career-admin-modal-body">
                        <div class="career-admin-form-grid">
                            ${fieldsHtml}
                        </div>
                    </div>
                    <div class="modal-footer career-admin-modal-footer">
                        <button type="button" class="btn btn-outline" data-action="cancel">Отмена</button>
                        <button type="button" class="btn btn-primary" data-action="submit">${escapeHtml(config.submitText || 'Сохранить')}</button>
                    </div>
                </div>
            `;

            const close = (result = null) => {
                overlay.remove();
                resolve(result);
            };

            overlay.addEventListener('click', (event) => {
                if (event.target === overlay) close(null);
            });

            overlay.querySelector('.modal-close')?.addEventListener('click', () => close(null));
            overlay.querySelector('[data-action="cancel"]')?.addEventListener('click', () => close(null));

            overlay.querySelectorAll('[data-checklist-search]').forEach((searchInput) => {
                searchInput.addEventListener('input', () => {
                    const targetName = searchInput.getAttribute('data-checklist-search');
                    const list = overlay.querySelector(`[data-checklist-list="${targetName}"]`);
                    if (!list) return;
                    const term = String(searchInput.value || '').trim().toLowerCase();
                    list.querySelectorAll('.career-admin-checklist-item').forEach((item) => {
                        const text = item.textContent.toLowerCase();
                        item.style.display = !term || text.includes(term) ? '' : 'none';
                    });
                });
            });

            overlay.querySelector('[data-action="submit"]')?.addEventListener('click', () => {
                const values = {};
                (config.fields || []).forEach((field) => {
                    if (field.type === 'checkbox') {
                        const input = overlay.querySelector(`[data-name="${field.name}"]`);
                        if (!input) return;
                        values[field.name] = !!input.checked;
                    } else if (field.type === 'checklist') {
                        const checked = Array.from(
                            overlay.querySelectorAll(`[data-name="${field.name}"]:checked`)
                        ).map((node) => String(node.value || '').trim()).filter(Boolean);
                        values[field.name] = checked;
                    } else if (field.type === 'number') {
                        const input = overlay.querySelector(`[data-name="${field.name}"]`);
                        if (!input) return;
                        values[field.name] = Number(input.value || 0);
                    } else {
                        const input = overlay.querySelector(`[data-name="${field.name}"]`);
                        if (!input) return;
                        values[field.name] = String(input.value || '').trim();
                    }
                });
                close(values);
            });

            document.body.appendChild(overlay);
        });
    }

    async function loadInterests() {
        const container = document.getElementById('careerInterestsTable');
        if (!container) return;
        container.innerHTML = '<div class="empty-state">Загрузка направлений...</div>';
        try {
            const data = await api(`${rootApi()}/career/interests`);
            state.interests = Array.isArray(data.interests) ? data.interests : [];
            renderInterests();
        } catch (error) {
            container.innerHTML = `<p style="color: var(--danger, #ef4444);">${escapeHtml(error.message || 'Ошибка загрузки направлений')}</p>`;
        }
    }

    async function loadQuestions() {
        const container = document.getElementById('careerQuestionsTable');
        if (!container) return;
        container.innerHTML = '<div class="empty-state">Загрузка вопросов...</div>';
        try {
            const data = await api(`${rootApi()}/career/questions`);
            state.questions = Array.isArray(data.questions) ? data.questions : [];
            renderQuestions();
        } catch (error) {
            container.innerHTML = `<p style="color: var(--danger, #ef4444);">${escapeHtml(error.message || 'Ошибка загрузки вопросов')}</p>`;
        }
    }

    function renderInterests() {
        const container = document.getElementById('careerInterestsTable');
        if (!container) return;

        if (!state.interests.length) {
            container.innerHTML = '<div class="empty-state">Направления не добавлены</div>';
            return;
        }

        const rows = state.interests.map((interest) => `
            <tr>
                <td>${escapeHtml(interest.name_ru || '-')}</td>
                <td>${escapeHtml(interest.name_uz || '-')}</td>
                <td>${Array.isArray(interest.subjects) ? interest.subjects.length : 0}</td>
                <td>
                    <div class="table-actions">
                        <button class="btn btn-outline btn-sm" data-action="edit-interest" data-id="${interest.id}" type="button">Редактировать</button>
                        <button class="btn btn-danger btn-sm" data-action="delete-interest" data-id="${interest.id}" type="button">Удалить</button>
                    </div>
                </td>
            </tr>
        `).join('');

        container.innerHTML = `
            <div class="table-responsive">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Название (RU)</th>
                            <th>Название (UZ)</th>
                            <th>Предметы</th>
                            <th>Действия</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    }

    function resolveInterestName(interestId) {
        const interest = state.interests.find((item) => String(item.id) === String(interestId));
        return interest?.name_ru || interest?.name_uz || '-';
    }

    function renderQuestions() {
        const container = document.getElementById('careerQuestionsTable');
        if (!container) return;

        if (!state.questions.length) {
            container.innerHTML = '<div class="empty-state">Вопросы не добавлены</div>';
            return;
        }

        const rows = state.questions.map((question) => `
            <tr>
                <td>${Number(question.order_no || 0)}</td>
                <td>${escapeHtml(resolveInterestName(question.interest_id))}</td>
                <td>${escapeHtml(question.text_ru || '-')}</td>
                <td>${escapeHtml(question.text_uz || '-')}</td>
                <td>${question.is_active ? 'Активен' : 'Неактивен'}</td>
                <td>
                    <div class="table-actions">
                        <button class="btn btn-outline btn-sm" data-action="edit-question" data-id="${question.id}" type="button">Редактировать</button>
                        <button class="btn btn-danger btn-sm" data-action="delete-question" data-id="${question.id}" type="button">Удалить</button>
                    </div>
                </td>
            </tr>
        `).join('');

        container.innerHTML = `
            <div class="table-responsive">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Направление</th>
                            <th>Текст (RU)</th>
                            <th>Текст (UZ)</th>
                            <th>Статус</th>
                            <th>Действия</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    }

    async function handleAddInterest() {
        const subjectOptions = state.subjects.map((subject) => {
            const primary = subject.name_ru || subject.name_uz || '-';
            const secondary = subject.name_uz && subject.name_uz !== primary ? ` / ${subject.name_uz}` : '';
            const code = subject.code ? ` [${subject.code}]` : '';
            return {
                value: primary,
                label: `${primary}${secondary}${code}`
            };
        });

        const values = await showFormModal({
            title: 'Новое направление',
            submitText: 'Сохранить',
            fields: [
                { name: 'name_ru', label: 'Название (RU)' },
                { name: 'name_uz', label: 'Название (UZ)' },
                { name: 'description_ru', label: 'Описание (RU)', type: 'textarea' },
                { name: 'description_uz', label: 'Описание (UZ)', type: 'textarea' },
                { name: 'subjects', label: 'Предметы школы', type: 'checklist', value: [], options: subjectOptions }
            ]
        });
        if (!values) return;

        if (!values.name_ru && !values.name_uz) {
            await alertMessage('Укажите название хотя бы на одном языке', 'Ошибка');
            return;
        }

        try {
            await api(`${rootApi()}/career/interests`, {
                method: 'POST',
                body: JSON.stringify({
                    ...values,
                    subjects: Array.isArray(values.subjects) ? values.subjects : [],
                    subject_keywords: Array.isArray(values.subjects) ? values.subjects : []
                })
            });
            await loadInterests();
        } catch (error) {
            await alertMessage(error.message || 'Не удалось добавить направление', 'Ошибка');
        }
    }

    async function handleEditInterest(interestId) {
        const interest = state.interests.find((item) => String(item.id) === String(interestId));
        if (!interest) return;

        const selectedSubjects = Array.isArray(interest.subjects) ? interest.subjects : [];
        const subjectOptions = state.subjects.map((subject) => {
            const primary = subject.name_ru || subject.name_uz || '-';
            const secondary = subject.name_uz && subject.name_uz !== primary ? ` / ${subject.name_uz}` : '';
            const code = subject.code ? ` [${subject.code}]` : '';
            return {
                value: primary,
                label: `${primary}${secondary}${code}`
            };
        });

        const values = await showFormModal({
            title: 'Редактирование направления',
            submitText: 'Сохранить',
            fields: [
                { name: 'name_ru', label: 'Название (RU)', value: interest.name_ru || '' },
                { name: 'name_uz', label: 'Название (UZ)', value: interest.name_uz || '' },
                { name: 'description_ru', label: 'Описание (RU)', type: 'textarea', value: interest.description_ru || '' },
                { name: 'description_uz', label: 'Описание (UZ)', type: 'textarea', value: interest.description_uz || '' },
                { name: 'subjects', label: 'Предметы школы', type: 'checklist', value: selectedSubjects, options: subjectOptions }
            ]
        });
        if (!values) return;

        try {
            await api(`${rootApi()}/career/interests/${encodeURIComponent(interestId)}`, {
                method: 'PUT',
                body: JSON.stringify({
                    ...values,
                    subjects: Array.isArray(values.subjects) ? values.subjects : [],
                    subject_keywords: Array.isArray(values.subjects) ? values.subjects : []
                })
            });
            await loadInterests();
            await loadQuestions();
        } catch (error) {
            await alertMessage(error.message || 'Не удалось обновить направление', 'Ошибка');
        }
    }

    async function handleDeleteInterest(interestId) {
        const ok = await confirmMessage('Удалить направление?', 'Подтверждение');
        if (!ok) return;
        try {
            await api(`${rootApi()}/career/interests/${encodeURIComponent(interestId)}`, { method: 'DELETE' });
            await loadInterests();
            await loadQuestions();
        } catch (error) {
            await alertMessage(error.message || 'Не удалось удалить направление', 'Ошибка');
        }
    }

    async function handleAddQuestion() {
        if (!state.interests.length) {
            await alertMessage('Сначала добавьте хотя бы одно направление', 'Внимание');
            return;
        }

        const values = await showFormModal({
            title: 'Новый вопрос профориентации',
            submitText: 'Сохранить',
            fields: [
                {
                    name: 'interest_id',
                    label: 'Направление',
                    type: 'select',
                    options: state.interests.map((interest) => ({
                        value: interest.id,
                        label: interest.name_ru || interest.name_uz || interest.id
                    }))
                },
                { name: 'text_ru', label: 'Текст вопроса (RU)', type: 'textarea' },
                { name: 'text_uz', label: 'Текст вопроса (UZ)', type: 'textarea' },
                { name: 'order_no', label: 'Порядок', type: 'number', value: state.questions.length + 1 },
                { name: 'is_active', label: 'Активный', type: 'checkbox', value: true }
            ]
        });
        if (!values) return;

        if (!values.interest_id || (!values.text_ru && !values.text_uz)) {
            await alertMessage('Заполните направление и текст вопроса', 'Ошибка');
            return;
        }

        try {
            await api(`${rootApi()}/career/questions`, {
                method: 'POST',
                body: JSON.stringify(values)
            });
            await loadQuestions();
        } catch (error) {
            await alertMessage(error.message || 'Не удалось добавить вопрос', 'Ошибка');
        }
    }

    async function handleEditQuestion(questionId) {
        const question = state.questions.find((item) => String(item.id) === String(questionId));
        if (!question) return;

        const values = await showFormModal({
            title: 'Редактирование вопроса',
            submitText: 'Сохранить',
            fields: [
                {
                    name: 'interest_id',
                    label: 'Направление',
                    type: 'select',
                    value: question.interest_id,
                    options: state.interests.map((interest) => ({
                        value: interest.id,
                        label: interest.name_ru || interest.name_uz || interest.id
                    }))
                },
                { name: 'text_ru', label: 'Текст вопроса (RU)', type: 'textarea', value: question.text_ru || '' },
                { name: 'text_uz', label: 'Текст вопроса (UZ)', type: 'textarea', value: question.text_uz || '' },
                { name: 'order_no', label: 'Порядок', type: 'number', value: Number(question.order_no || 1) },
                { name: 'is_active', label: 'Активный', type: 'checkbox', value: !!question.is_active }
            ]
        });
        if (!values) return;

        try {
            await api(`${rootApi()}/career/questions/${encodeURIComponent(questionId)}`, {
                method: 'PUT',
                body: JSON.stringify(values)
            });
            await loadQuestions();
        } catch (error) {
            await alertMessage(error.message || 'Не удалось обновить вопрос', 'Ошибка');
        }
    }

    async function handleDeleteQuestion(questionId) {
        const ok = await confirmMessage('Удалить вопрос?', 'Подтверждение');
        if (!ok) return;
        try {
            await api(`${rootApi()}/career/questions/${encodeURIComponent(questionId)}`, { method: 'DELETE' });
            await loadQuestions();
        } catch (error) {
            await alertMessage(error.message || 'Не удалось удалить вопрос', 'Ошибка');
        }
    }

    function bindEvents() {
        document.getElementById('addCareerInterestBtn')?.addEventListener('click', handleAddInterest);
        document.getElementById('addCareerQuestionBtn')?.addEventListener('click', handleAddQuestion);

        document.getElementById('careerInterestsTable')?.addEventListener('click', (event) => {
            const btn = event.target.closest('[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;
            const id = btn.dataset.id;
            if (action === 'edit-interest') handleEditInterest(id);
            if (action === 'delete-interest') handleDeleteInterest(id);
        });

        document.getElementById('careerQuestionsTable')?.addEventListener('click', (event) => {
            const btn = event.target.closest('[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;
            const id = btn.dataset.id;
            if (action === 'edit-question') handleEditQuestion(id);
            if (action === 'delete-question') handleDeleteQuestion(id);
        });
    }

    async function init() {
        const interestsContainer = document.getElementById('careerInterestsTable');
        const questionsContainer = document.getElementById('careerQuestionsTable');
        if (!interestsContainer || !questionsContainer) return;

        await loadRole();
        if (state.role !== 'psychologist') {
            interestsContainer.innerHTML = '<div class="empty-state">Раздел доступен для роли психолога</div>';
            questionsContainer.innerHTML = '';
            const addInterestBtn = document.getElementById('addCareerInterestBtn');
            const addQuestionBtn = document.getElementById('addCareerQuestionBtn');
            if (addInterestBtn) addInterestBtn.style.display = 'none';
            if (addQuestionBtn) addQuestionBtn.style.display = 'none';
            return;
        }

        bindEvents();
        await loadSubjects();
        await loadInterests();
        await loadQuestions();
    }

    window.CareerAdminManager = { init };
})();
