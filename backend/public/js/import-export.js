// Import / Export Manager
(function () {
    'use strict';

    const API_URL = '/api/admin';
    const IMPORT_CREDENTIALS_KEY = 'zedly_last_import_credentials_v1';

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
                downloadCredentialsCsv(payload.users, payload.createdAt);
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
                            Скачать логины и OTP (CSV)
                        </button>
                    </div>
                    <ul class="import-list">${createdList}</ul>
                </div>
            ` : ''}
            ${errorList ? `
                <div class="import-section">
                    <h3>Ошибки</h3>
                    <ul class="import-list import-errors">${errorList}</ul>
                </div>
            ` : ''}
        `;
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
                        Скачать логины и OTP (CSV)
                    </button>
                </div>
            </div>
        `;
    }

    function downloadCredentialsCsv(users, createdAt) {
        const rows = [
            ['username', 'otp_password', 'role'],
            ...users.map((user) => [user.username || '', user.otp_password || '', user.role || ''])
        ];
        const csv = rows
            .map((row) => row.map(csvEscape).join(','))
            .join('\n');

        const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
        const date = createdAt ? new Date(createdAt) : new Date();
        const datePart = Number.isNaN(date.getTime())
            ? new Date().toISOString().slice(0, 10)
            : date.toISOString().slice(0, 10);
        downloadBlob(blob, `import_credentials_${datePart}.csv`);
    }

    function csvEscape(value) {
        const text = String(value ?? '');
        if (/[",\n]/.test(text)) {
            return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
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
