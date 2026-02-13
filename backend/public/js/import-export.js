// Import / Export Manager
(function () {
    'use strict';

    const API_URL = '/api/admin';
    const IMPORT_CREDENTIALS_KEY = 'zedly_last_import_credentials_v1';
    let pendingAutoCreatedClasses = [];

    function showAlert(message, title = 'Ошибка') {
        if (window.ZedlyDialog?.alert) {
            return window.ZedlyDialog.alert(message, { title });
        }
        alert(message);
        return Promise.resolve(true);
    }

    const ImportExportManager = {
        init
    };

    function init() {
        const importBtn = document.getElementById('startImportBtn');
        const templateBtn = document.getElementById('downloadTemplateBtn');
        const exportBtn = document.getElementById('exportUsersBtn');
        const resultsContainer = document.getElementById('importResults');

        if (importBtn) {
            importBtn.addEventListener('click', handleImport);
        }

        if (templateBtn) {
            templateBtn.addEventListener('click', downloadTemplate);
        }

        if (exportBtn) {
            exportBtn.addEventListener('click', exportUsers);
        }

        if (resultsContainer) {
            resultsContainer.addEventListener('click', (event) => {
                const target = event.target.closest('[data-action="download-import-credentials"]');
                if (!target) return;
                const payload = getStoredCredentials();
                if (!payload || !Array.isArray(payload.users) || payload.users.length === 0) {
                    showAlert('Нет сохраненных данных импорта');
                    return;
                }
                downloadCredentialsXlsx(payload.users);
            });

            resultsContainer.addEventListener('click', async (event) => {
                const target = event.target.closest('[data-action="assign-homeroom-now"]');
                if (!target) return;
                if (!Array.isArray(pendingAutoCreatedClasses) || pendingAutoCreatedClasses.length === 0) {
                    return;
                }
                await openHomeroomAssignmentModal(pendingAutoCreatedClasses);
            });

            renderSavedCredentialsHint(resultsContainer);
        }
    }

    async function handleImport() {
        const fileInput = document.getElementById('importFile');
        const resultsContainer = document.getElementById('importResults');

        if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
            renderMessage(resultsContainer, 'Выберите файл для импорта', 'warning');
            return;
        }

        const formData = new FormData();
        formData.append('file', fileInput.files[0]);

        renderMessage(resultsContainer, 'Импортируем...', 'info');

        try {
            const response = await fetch(`${API_URL}/import/users`, {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                renderMessage(resultsContainer, data.message || 'Ошибка импорта', 'error');
                return;
            }

            renderImportResults(resultsContainer, data);
        } catch (error) {
            console.error('Import error:', error);
            renderMessage(resultsContainer, 'Ошибка импорта', 'error');
        }
    }

    async function downloadTemplate() {
        try {
            const response = await fetch(`${API_URL}/import/template/users`);
            if (!response.ok) {
                throw new Error('Failed to download template');
            }

            const blob = await response.blob();
            downloadBlob(blob, 'users_import_template.xlsx');
        } catch (error) {
            console.error('Template download error:', error);
            showAlert('Не удалось скачать шаблон');
        }
    }

    async function exportUsers() {
        try {
            const response = await fetch(`${API_URL}/export/users`);
            if (!response.ok) {
                throw new Error('Failed to export users');
            }

            const blob = await response.blob();
            downloadBlob(blob, 'users_export.xlsx');
        } catch (error) {
            console.error('Export error:', error);
            showAlert('Не удалось выгрузить пользователей');
        }
    }

    function renderImportResults(container, data) {
        if (!container) return;
        if (Array.isArray(data.created) && data.created.length > 0) {
            storeCredentials(data.created);
        }
        pendingAutoCreatedClasses = Array.isArray(data.auto_created_classes) ? data.auto_created_classes : [];

        const createdList = (data.created || []).map(user => {
            return `
                <li>
                    <strong>${user.username}</strong> (${user.role}) - OTP: <code>${user.otp_password}</code>
                </li>
            `;
        }).join('');

        const errorList = (data.errors || []).map(err => {
            return `<li>Строка ${err.row}: ${err.message}</li>`;
        }).join('');

        container.innerHTML = `
            <div class="import-summary">
                <div class="import-summary-item">
                    <span>Импортировано:</span>
                    <strong>${data.imported || 0}</strong>
                </div>
                <div class="import-summary-item">
                    <span>Ошибок:</span>
                    <strong>${(data.errors || []).length}</strong>
                </div>
            </div>
            ${createdList ? `
                <div class="import-section">
                    <h3>Созданные пользователи (OTP)</h3>
                    <div style="margin-bottom: 10px;">
                        <button class="btn btn-secondary" type="button" data-action="download-import-credentials">
                            Скачать логины и OTP (XLSX)
                        </button>
                    </div>
                    <ul class="import-list">${createdList}</ul>
                </div>
            ` : ''}
            ${pendingAutoCreatedClasses.length ? `
                <div class="import-section">
                    <h3>Новые классы без классного руководителя</h3>
                    <p>Система создала/активировала классы при импорте. Назначьте классного руководителя сейчас.</p>
                    <div style="margin-bottom: 10px;">
                        <button class="btn btn-primary" type="button" data-action="assign-homeroom-now">
                            Назначить классных руководителей
                        </button>
                    </div>
                    <ul class="import-list">
                        ${pendingAutoCreatedClasses.map(cls => `<li><strong>${cls.name}</strong> (${cls.academic_year || '-'})</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
            ${errorList ? `
                <div class="import-section">
                    <h3>Ошибки</h3>
                    <ul class="import-list import-errors">${errorList}</ul>
                </div>
            ` : ''}
        `;

        if (pendingAutoCreatedClasses.length) {
            setTimeout(() => {
                openHomeroomAssignmentModal(pendingAutoCreatedClasses);
            }, 250);
        }
    }

    function renderMessage(container, message, type) {
        if (!container) return;
        container.innerHTML = `<div class="import-message ${type}">${message}</div>`;
    }

    function storeCredentials(users) {
        try {
            localStorage.setItem(
                IMPORT_CREDENTIALS_KEY,
                JSON.stringify({
                    createdAt: new Date().toISOString(),
                    users: users.map(user => ({
                        username: user.username || '',
                        role: user.role || '',
                        otp_password: user.otp_password || ''
                    }))
                })
            );
        } catch (error) {
            console.warn('Unable to persist import credentials:', error);
        }
    }

    function getStoredCredentials() {
        try {
            const raw = localStorage.getItem(IMPORT_CREDENTIALS_KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (error) {
            console.warn('Unable to read stored import credentials:', error);
            return null;
        }
    }

    function renderSavedCredentialsHint(container) {
        const payload = getStoredCredentials();
        if (!payload || !Array.isArray(payload.users) || payload.users.length === 0) {
            return;
        }
        const dateLabel = new Date(payload.createdAt).toLocaleString('ru-RU');
        container.innerHTML = `
            <div class="import-message info">
                Последний импорт: ${dateLabel}. Доступен файл с логинами и OTP.
                <div style="margin-top: 10px;">
                    <button class="btn btn-secondary" type="button" data-action="download-import-credentials">
                        Скачать логины и OTP (XLSX)
                    </button>
                </div>
            </div>
        `;
    }

    async function downloadCredentialsXlsx(users) {
        try {
            const response = await fetch(`${API_URL}/import/credentials/export`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ users })
            });

            if (!response.ok) {
                throw new Error('Failed to export credentials');
            }

            const blob = await response.blob();
            const disposition = response.headers.get('Content-Disposition') || '';
            const filenameMatch = disposition.match(/filename="([^"]+)"/i);
            const filename = filenameMatch ? filenameMatch[1] : `import_credentials_${new Date().toISOString().slice(0, 10)}.xlsx`;
            downloadBlob(blob, filename);
        } catch (error) {
            console.error('Credentials export error:', error);
            showAlert('Не удалось скачать файл логинов и OTP');
        }
    }

    async function fetchTeachers() {
        const response = await fetch(`${API_URL}/teachers`);
        if (!response.ok) {
            throw new Error('Failed to fetch teachers');
        }
        const data = await response.json();
        return Array.isArray(data.teachers) ? data.teachers : [];
    }

    async function openHomeroomAssignmentModal(classes) {
        let teachers = [];
        try {
            teachers = await fetchTeachers();
        } catch (error) {
            console.error('Failed to load teachers for homeroom modal:', error);
            showAlert('Не удалось загрузить список учителей');
            return;
        }

        if (document.getElementById('homeroomAssignModal')) {
            return;
        }

        const teacherOptions = teachers.map((t) => `<option value="${t.id}">${(t.name || '').trim() || t.email || t.id}</option>`).join('');

        const rows = classes.map((cls) => `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:center;margin-bottom:10px;">
                <div>
                    <strong>${cls.name}</strong>
                    <div style="font-size:12px;opacity:.8;">${cls.academic_year || ''}</div>
                </div>
                <select data-class-id="${cls.id}" style="width:100%;padding:8px;border-radius:8px;">
                    <option value="">Без классрука</option>
                    ${teacherOptions}
                </select>
            </div>
        `).join('');

        const modal = document.createElement('div');
        modal.id = 'homeroomAssignModal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:4000;display:flex;align-items:center;justify-content:center;padding:16px;';
        modal.innerHTML = `
            <div style="width:min(720px,100%);max-height:85vh;overflow:auto;background:var(--bg-primary,#111827);color:var(--text-primary,#f9fafb);border:1px solid var(--border,#374151);border-radius:14px;padding:16px;">
                <h3 style="margin:0 0 6px 0;">Назначение классного руководителя</h3>
                <p style="margin:0 0 14px 0;color:var(--text-secondary,#9ca3af);">Назначьте классрука для новых классов, созданных при импорте.</p>
                ${rows}
                <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">
                    <button type="button" data-action="close-homeroom-modal" class="btn btn-secondary">Позже</button>
                    <button type="button" data-action="save-homeroom-modal" class="btn btn-primary">Сохранить</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.addEventListener('click', async (event) => {
            const closeBtn = event.target.closest('[data-action="close-homeroom-modal"]');
            if (closeBtn || event.target === modal) {
                modal.remove();
                return;
            }

            const saveBtn = event.target.closest('[data-action="save-homeroom-modal"]');
            if (!saveBtn) return;

            const selects = Array.from(modal.querySelectorAll('select[data-class-id]'));
            saveBtn.disabled = true;
            try {
                for (const select of selects) {
                    const classId = select.getAttribute('data-class-id');
                    const teacherId = select.value || null;
                    const response = await fetch(`${API_URL}/classes/${classId}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ homeroom_teacher_id: teacherId })
                    });
                    if (!response.ok) {
                        throw new Error(`Failed to update class ${classId}`);
                    }
                }
                modal.remove();
                showAlert('Классные руководители сохранены', 'Успешно');
            } catch (error) {
                console.error('Save homeroom assignment error:', error);
                showAlert('Не удалось сохранить назначения');
            } finally {
                saveBtn.disabled = false;
            }
        });
    }

    function downloadBlob(blob, filename) {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
    }

    window.ImportExportManager = ImportExportManager;
})();
