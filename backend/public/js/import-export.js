// Import / Export Manager
(function () {
    'use strict';

    const API_URL = '/api/admin';

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

        if (importBtn) {
            importBtn.addEventListener('click', handleImport);
        }

        if (templateBtn) {
            templateBtn.addEventListener('click', downloadTemplate);
        }

        if (exportBtn) {
            exportBtn.addEventListener('click', exportUsers);
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
