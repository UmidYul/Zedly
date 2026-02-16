// Import / Export Manager
(function () {
    'use strict';

    const API_URL = '/api/admin';
    const IMPORT_CREDENTIALS_KEY = 'zedly_last_import_credentials_v1';
    const EXPORT_META_KEY = 'zedly_last_export_meta_v1';
    let pendingAutoCreatedClasses = [];
    const importProgressState = {
        running: false,
        timer: null,
        value: 0
    };

    function t(key, fallback, params) {
        const tr = window.ZedlyI18n?.translate?.(key, params);
        return tr && tr !== key ? tr : (fallback || key);
    }

    function currentLocale() {
        return (window.ZedlyI18n?.getCurrentLang?.() || 'ru') === 'uz' ? 'uz-UZ' : 'ru-RU';
    }

    function showAlert(message, title = 'Error') {
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
        const importButtons = document.querySelectorAll('.start-import-btn');
        const templateButtons = document.querySelectorAll('.download-template-btn');
        const fileTriggers = document.querySelectorAll('.import-file-trigger');
        const importFileInputs = document.querySelectorAll('.import-file-input');
        const exportBtn = document.getElementById('exportUsersBtn');
        const importTypeSelect = document.getElementById('importType');
        const resultsContainer = document.getElementById('importResults');
        const refreshExportPreviewBtn = document.getElementById('refreshExportPreviewBtn');
        const applyExportFiltersBtn = document.getElementById('applyExportFiltersBtn');
        const resetExportFiltersBtn = document.getElementById('resetExportFiltersBtn');
        const exportSearchInput = document.getElementById('exportSearchInput');
        const exportRoleFilter = document.getElementById('exportRoleFilter');
        const exportStatusFilter = document.getElementById('exportStatusFilter');
        const exportClassFilter = document.getElementById('exportClassFilter');

        if (importBtn) {
            importBtn.addEventListener('click', handleImport);
        }

        if (templateBtn) {
            templateBtn.addEventListener('click', downloadTemplate);
        }

        if (importButtons.length) {
            importButtons.forEach((button) => {
                button.addEventListener('click', () => {
                    const importType = button.dataset.importType || 'student';
                    const input = getImportInputForType(importType);
                    handleImport(importType, input);
                });
            });
        }

        if (templateButtons.length) {
            templateButtons.forEach((button) => {
                button.addEventListener('click', () => {
                    downloadTemplate(button.dataset.importType || 'student');
                });
            });
        }

        if (fileTriggers.length) {
            fileTriggers.forEach((trigger) => {
                trigger.addEventListener('click', () => {
                    const targetId = trigger.dataset.target;
                    if (!targetId) return;
                    const input = document.getElementById(targetId);
                    if (input) input.click();
                });
            });
        }

        if (importFileInputs.length) {
            importFileInputs.forEach((input) => {
                input.addEventListener('change', () => updateFileName(input));
            });
        }

        if (exportBtn) {
            exportBtn.addEventListener('click', exportUsers);
            renderLastExportMeta();
            loadExportClassOptions();
            loadExportPreview();
        }

        if (refreshExportPreviewBtn) {
            refreshExportPreviewBtn.addEventListener('click', loadExportPreview);
        }

        if (applyExportFiltersBtn) {
            applyExportFiltersBtn.addEventListener('click', loadExportPreview);
        }

        if (resetExportFiltersBtn) {
            resetExportFiltersBtn.addEventListener('click', () => {
                if (exportSearchInput) exportSearchInput.value = '';
                if (exportRoleFilter) exportRoleFilter.value = 'all';
                if (exportStatusFilter) exportStatusFilter.value = 'all';
                if (exportClassFilter) exportClassFilter.value = 'all';
                loadExportPreview();
            });
        }

        if (exportSearchInput) {
            exportSearchInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    loadExportPreview();
                }
            });
        }

        if (importTypeSelect) {
            importTypeSelect.addEventListener('change', updateImportHint);
            updateImportHint();
        }

        if (resultsContainer) {
            resultsContainer.addEventListener('click', (event) => {
                const target = event.target.closest('[data-action="download-import-credentials"]');
                if (!target) return;
                const payload = getStoredCredentials();
                if (!payload || !Array.isArray(payload.users) || payload.users.length === 0) {
                    showAlert(t('tools.noSavedImportData', 'Нет сохраненных данных импорта'));
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

    function setImportResultsVisible(container, visible) {
        if (!container) return;
        container.hidden = !visible;
    }

    async function handleImport(importType = null, fileInput = null) {
        if (importProgressState.running) return;

        const resolvedType = importType || (document.getElementById('importType')?.value || 'student');
        const resolvedInput = fileInput || getImportInputForType(resolvedType) || document.getElementById('importFile');
        const resultsContainer = document.getElementById('importResults');

        if (!resolvedInput || !resolvedInput.files || resolvedInput.files.length === 0) {
            renderMessage(resultsContainer, 'Select a file to import', 'warning');
            return;
        }

        const formData = new FormData();
        formData.append('file', resolvedInput.files[0]);
        formData.append('import_type', resolvedType);

        setImportControlsBusy(true);
        startImportProgress(resultsContainer, 'Import in progress...');

        try {
            const response = await fetch(`${API_URL}/import/users`, {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                finishImportProgress(resultsContainer, 100, 'Import finished with errors');
                renderMessage(resultsContainer, data.message || 'Import error', 'error');
                return;
            }

            finishImportProgress(resultsContainer, 100, 'Import completed');
            renderImportResults(resultsContainer, data);
        } catch (error) {
            console.error('Import error:', error);
            finishImportProgress(resultsContainer, 100, 'Import finished with errors');
            renderMessage(resultsContainer, 'Import error', 'error');
        } finally {
            setImportControlsBusy(false);
        }
    }

    function setImportControlsBusy(isBusy) {
        importProgressState.running = !!isBusy;

        document.querySelectorAll('.start-import-btn, #startImportBtn, .download-template-btn, #downloadTemplateBtn, .import-file-trigger')
            .forEach((el) => {
                if (el && typeof el.disabled !== 'undefined') {
                    el.disabled = !!isBusy;
                }
            });

        document.querySelectorAll('.import-file-input').forEach((el) => {
            if (el && typeof el.disabled !== 'undefined') {
                el.disabled = !!isBusy;
            }
        });
    }

    function startImportProgress(container, label) {
        if (!container) return;
        if (importProgressState.timer) {
            clearInterval(importProgressState.timer);
            importProgressState.timer = null;
        }

        importProgressState.value = 8;
        renderProgressCard(container, importProgressState.value, label);

        importProgressState.timer = setInterval(() => {
            if (importProgressState.value >= 92) return;
            importProgressState.value = Math.min(
                92,
                importProgressState.value + Math.max(2, Math.round((100 - importProgressState.value) / 12))
            );
            renderProgressCard(container, importProgressState.value, label);
        }, 260);
    }

    function finishImportProgress(container, percent, label) {
        if (!container) return;
        if (importProgressState.timer) {
            clearInterval(importProgressState.timer);
            importProgressState.timer = null;
        }
        importProgressState.value = Number(percent) || 100;
        renderProgressCard(container, importProgressState.value, label);
    }

    function renderProgressCard(container, percent, label) {
        if (!container) return;
        setImportResultsVisible(container, true);
        const safe = Math.max(0, Math.min(100, Number(percent) || 0));
        container.innerHTML = `
            <div class="progress-card">
                <div class="progress-head">
                    <div class="progress-label">
                        <span class="spinner" style="display:inline-block;"></span>
                        <span>${label || 'Processing...'}</span>
                    </div>
                    <strong>${safe}%</strong>
                </div>
                <div class="progress-track">
                    <div class="progress-fill" style="width:${safe}%"></div>
                </div>
            </div>
        `;
    }

    async function downloadTemplate(importType = null) {
        const resolvedType = importType || (document.getElementById('importType')?.value || 'student');
        try {
            const response = await fetch(`${API_URL}/import/template/users?type=${encodeURIComponent(resolvedType)}`);
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

    function updateImportHint() {
        const importHint = document.getElementById('importHint');
        if (!importHint) return;
        importHint.textContent = '';
    }

    function getImportInputForType(importType) {
        if (importType === 'teacher') {
            return document.getElementById('importFileTeacher');
        }
        if (importType === 'student') {
            return document.getElementById('importFileStudent');
        }
        return null;
    }

    function updateFileName(input) {
        const importType = input?.dataset?.importType;
        if (!importType) return;

        const nameId = importType === 'teacher'
            ? 'importFileTeacherName'
            : 'importFileStudentName';
        const nameEl = document.getElementById(nameId);
        if (!nameEl) return;

        const fileName = input.files && input.files[0]
            ? input.files[0].name
            : t('tools.noFileSelected', 'Файл не выбран');
        nameEl.textContent = fileName;
        nameEl.classList.toggle('has-file', Boolean(input.files && input.files[0]));
    }

    async function exportUsers() {
        const exportBtn = document.getElementById('exportUsersBtn');
        try {
            if (exportBtn) {
                exportBtn.disabled = true;
                exportBtn.textContent = t('tools.preparing', 'Подготовка...');
            }
            setExportStatus(t('tools.exportInProgress', 'Экспорт выполняется...'), 'loading');

            const query = buildExportUsersQuery();
            const response = await fetch(`${API_URL}/export/users${query ? `?${query}` : ''}`);
            if (!response.ok) {
                throw new Error('Failed to export users');
            }

            const blob = await response.blob();
            const filename = `users_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
            downloadBlob(blob, filename);
            persistLastExportMeta({
                filename,
                size: blob.size,
                exportedAt: new Date().toISOString()
            });
            renderLastExportMeta();
            setExportStatus(t('tools.exportComplete', 'Экспорт завершен'), 'success');
        } catch (error) {
            console.error('Export error:', error);
            setExportStatus(t('tools.exportFailed', 'Не удалось выполнить экспорт'), '');
            showAlert(t('tools.failedExportUsers', 'Не удалось экспортировать пользователей'));
        } finally {
            if (exportBtn) {
                exportBtn.disabled = false;
                exportBtn.textContent = t('export.downloadUsers', 'Скачать пользователей');
            }
            const statusChip = document.getElementById('exportStatusChip');
            if (statusChip && !statusChip.classList.contains('success')) {
                setTimeout(() => setExportStatus(t('tools.readyToExport', 'Готово к экспорту'), ''), 2200);
            }
        }
    }

    async function loadExportPreview() {
        const refreshBtn = document.getElementById('refreshExportPreviewBtn');
        const updatedEl = document.getElementById('exportPreviewUpdated');

        try {
            if (refreshBtn) {
                refreshBtn.disabled = true;
                refreshBtn.textContent = t('tools.refreshing', 'Обновление...');
            }

            const [total, students, teachers] = await Promise.all([
                fetchUsersTotal('all'),
                fetchUsersTotal('student'),
                fetchUsersTotal('teacher')
            ]);

            setText('exportTotalUsers', total);
            setText('exportStudentUsers', students);
            setText('exportTeacherUsers', teachers);
            if (updatedEl) {
                updatedEl.textContent = t('tools.updatedAt', 'Обновлено: {time}', {
                    time: new Date().toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' })
                });
            }
        } catch (error) {
            console.error('Export preview load error:', error);
            if (updatedEl) {
                updatedEl.textContent = t('tools.previewFailed', 'Не удалось обновить превью');
            }
        } finally {
            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.textContent = t('tools.refreshPreview', 'Обновить превью');
            }
        }
    }

    async function fetchUsersTotal(role) {
        const query = buildExportUsersQuery(role);
        const response = await fetch(`${API_URL}/users?page=1&limit=1${query ? `&${query}` : ''}`);
        if (!response.ok) {
            throw new Error('Failed to fetch users total');
        }
        const data = await response.json();
        return Number(data?.pagination?.total || 0);
    }

    function getExportFilters() {
        const search = String(document.getElementById('exportSearchInput')?.value || '').trim();
        const role = String(document.getElementById('exportRoleFilter')?.value || 'all');
        const status = String(document.getElementById('exportStatusFilter')?.value || 'all');
        const classId = String(document.getElementById('exportClassFilter')?.value || 'all');
        return { search, role, status, class_id: classId };
    }

    function buildExportUsersQuery(roleOverride = null) {
        const filters = getExportFilters();
        if (roleOverride && roleOverride !== 'all') {
            filters.role = roleOverride;
        } else if (roleOverride === 'all') {
            filters.role = 'all';
        }

        const params = new URLSearchParams();
        if (filters.search) params.set('search', filters.search);
        if (filters.role && filters.role !== 'all') params.set('role', filters.role);
        if (filters.status && filters.status !== 'all') params.set('status', filters.status);
        if (filters.class_id && filters.class_id !== 'all') params.set('class_id', filters.class_id);
        return params.toString();
    }

    async function loadExportClassOptions() {
        const select = document.getElementById('exportClassFilter');
        if (!select) return;

        try {
            const response = await fetch(`${API_URL}/classes?page=1&limit=1000&search=&grade=all`);
            if (!response.ok) return;
            const data = await response.json();
            const classes = Array.isArray(data?.classes) ? data.classes : [];

            while (select.options.length > 1) {
                select.remove(1);
            }

            classes.forEach((cls) => {
                const option = document.createElement('option');
                option.value = String(cls.id);
                option.textContent = cls.name || `#${cls.id}`;
                select.appendChild(option);
            });
        } catch (error) {
            console.warn('Failed to load export class options:', error);
        }
    }

    function persistLastExportMeta(meta) {
        try {
            localStorage.setItem(EXPORT_META_KEY, JSON.stringify(meta));
        } catch (error) {
            console.warn('Unable to persist export metadata:', error);
        }
    }

    function readLastExportMeta() {
        try {
            const raw = localStorage.getItem(EXPORT_META_KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (error) {
            console.warn('Unable to read export metadata:', error);
            return null;
        }
    }

    function renderLastExportMeta() {
        const element = document.getElementById('exportLastMeta');
        if (!element) return;

        const meta = readLastExportMeta();
        if (!meta?.exportedAt) {
            element.textContent = t('tools.exportHistoryEmpty', 'История экспорта пуста.');
            return;
        }

        const dateLabel = new Date(meta.exportedAt).toLocaleString(currentLocale());
        const sizeKb = Number(meta.size || 0) / 1024;
        const prettySize = `${sizeKb >= 1024 ? (sizeKb / 1024).toFixed(2) + ' MB' : Math.max(sizeKb, 0.1).toFixed(1) + ' KB'}`;
        element.textContent = t('tools.lastExportMeta', 'Последний экспорт: {date}. Файл: {file} ({size}).', {
            date: dateLabel,
            file: meta.filename || 'users_export.xlsx',
            size: prettySize
        });
    }

    function setExportStatus(text, type) {
        const chip = document.getElementById('exportStatusChip');
        if (!chip) return;
        chip.textContent = text;
        chip.classList.remove('success', 'loading');
        if (type) {
            chip.classList.add(type);
        }
    }

    function setText(id, value) {
        const element = document.getElementById(id);
        if (!element) return;
        element.textContent = String(value);
    }

    function renderImportResults(container, data) {
        if (!container) return;
        setImportResultsVisible(container, true);
        if (Array.isArray(data.created) && data.created.length > 0) {
            storeCredentials(data.created);
        }
        pendingAutoCreatedClasses = Array.isArray(data.auto_created_classes) ? data.auto_created_classes : [];

        const createdList = (data.created || []).map((user) =>             '<li><strong>' + user.username + '</strong> (' + user.role + (user.class_name ? ' - ' + user.class_name : '') + ') - OTP: <code>' + user.otp_password + '</code></li>'
        ).join('');

        const errorList = (data.errors || []).map((err) =>
            '<li>' + t('tools.rowLabel', 'Строка') + ' ' + err.row + ': ' + err.message + '</li>'
        ).join('');

        const skippedList = (data.skipped_rows || []).map((item) =>
            '<li>' + t('tools.rowLabel', 'Строка') + ' ' + item.row + ': ' + item.reason + '</li>'
        ).join('');

        container.innerHTML =             '<div class="import-summary">' +
                '<div class="import-summary-item"><span>' + t('tools.totalRows', 'Всего строк') + ':</span><strong>' + (data.total_rows || 0) + '</strong></div>' +
                '<div class="import-summary-item"><span>' + t('tools.processedRows', 'Обработано') + ':</span><strong>' + (data.processed_rows || 0) + '</strong></div>' +
                '<div class="import-summary-item"><span>' + t('tools.importedRows', 'Импортировано') + ':</span><strong>' + (data.imported || 0) + '</strong></div>' +
                '<div class="import-summary-item"><span>' + t('tools.skippedRows', 'Пропущено') + ':</span><strong>' + (data.skipped || 0) + '</strong></div>' +
                '<div class="import-summary-item"><span>' + t('tools.errorsCount', 'Ошибки') + ':</span><strong>' + (data.failed || (data.errors || []).length) + '</strong></div>' +
            '</div>' +
            (createdList ? (
                '<div class="import-section">' +
                    '<h3>' + t('tools.createdUsersOtp', 'Созданные пользователи (OTP)') + '</h3>' +
                    '<div style="margin-bottom: 10px;"><button class="btn btn-secondary" type="button" data-action="download-import-credentials">' + t('tools.downloadLoginsOtp', 'Скачать логины и OTP (XLSX)') + '</button></div>' +
                    '<ul class="import-list">' + createdList + '</ul>' +
                '</div>'
            ) : '') +
            (pendingAutoCreatedClasses.length ? (
                '<div class="import-section">' +
                    '<h3>' + t('tools.newClassesNoHomeroom', 'Новые классы без классного руководителя') + '</h3>' +
                    '<p>' + t('tools.selectHomeroomHint', 'Выберите классного руководителя для новых классов. Это можно сделать позже.') + '</p>' +
                    '<div style="margin-bottom: 10px;"><button class="btn btn-primary" type="button" data-action="assign-homeroom-now">' + t('tools.assignHomeroomTeachers', 'Назначить классных руководителей') + '</button></div>' +
                    '<ul class="import-list">' + pendingAutoCreatedClasses.map((cls) => '<li><strong>' + cls.name + '</strong> (' + (cls.academic_year || '-') + ')</li>').join('') + '</ul>' +
                '</div>'
            ) : '') +
            (errorList ? (
                '<div class="import-section"><h3>' + t('tools.errorsCount', 'Ошибки') + '</h3><ul class="import-list import-errors">' + errorList + '</ul>' +
                (data.errors_truncated ? '<p class="text-secondary">' + t('tools.showingFirstErrors', 'Показаны первые 300 ошибок.') + '</p>' : '') + '</div>'
            ) : '') +
            (skippedList ? (
                '<div class="import-section"><h3>' + t('tools.skippedRowsTitle', 'Пропущенные строки') + '</h3><ul class="import-list">' + skippedList + '</ul>' +
                (data.skipped_truncated ? '<p class="text-secondary">' + t('tools.showingFirstSkipped', 'Показаны первые 300 пропущенных строк.') + '</p>' : '') + '</div>'
            ) : '');

        if (pendingAutoCreatedClasses.length) {
            setTimeout(() => {
                openHomeroomAssignmentModal(pendingAutoCreatedClasses);
            }, 250);
        }
    }

    function renderMessage(container, message, type) {
        if (!container) return;
        setImportResultsVisible(container, true);
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
                        otp_password: user.otp_password || '',
                        class_name: user.class_name || ''
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
            if (container) {
                container.innerHTML = '';
                setImportResultsVisible(container, false);
            }
            return;
        }
        setImportResultsVisible(container, true);
        const dateLabel = new Date(payload.createdAt).toLocaleString(currentLocale());
        container.innerHTML =             '<div class="import-message info">' +
                t('tools.lastImportWithFile', 'Последний импорт: {date}. Файл с логинами/OTP доступен.', { date: dateLabel }) +
                '<div style="margin-top: 10px;">' +
                    '<button class="btn btn-secondary" type="button" data-action="download-import-credentials">' + t('tools.downloadLoginsOtp', 'Скачать логины и OTP (XLSX)') + '</button>' +
                '</div>' +
            '</div>';
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
            showAlert(t('tools.failedDownloadOtpFile', 'Не удалось скачать файл с логинами/OTP'));
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
            showAlert(t('tools.failedLoadTeachersList', 'Не удалось загрузить список учителей'));
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
                    <option value="">${t('tools.noHomeroomTeacher', 'Без классного руководителя')}</option>
                    ${teacherOptions}
                </select>
            </div>
        `).join('');

        const modal = document.createElement('div');
        modal.id = 'homeroomAssignModal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:4000;display:flex;align-items:center;justify-content:center;padding:16px;';
        modal.innerHTML = `
            <div style="width:min(720px,100%);max-height:85vh;overflow:auto;background:var(--bg-primary,#111827);color:var(--text-primary,#f9fafb);border:1px solid var(--border,#374151);border-radius:14px;padding:16px;">
                <h3 style="margin:0 0 6px 0;">${t('tools.assignHomeroomTeacher', 'Назначить классного руководителя')}</h3>
                <p style="margin:0 0 14px 0;color:var(--text-secondary,#9ca3af);">${t('tools.assignTeachersAfterImport', 'Назначьте учителей для новых классов после импорта.')}</p>
                ${rows}
                <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">
                    <button type="button" data-action="close-homeroom-modal" class="btn btn-secondary">${t('tools.later', 'Позже')}</button>
                    <button type="button" data-action="save-homeroom-modal" class="btn btn-primary">${t('common.save', 'Сохранить')}</button>
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
                showAlert(t('tools.homeroomSaved', 'Классные руководители назначены'), t('common.success', 'Успех'));
            } catch (error) {
                console.error('Save homeroom assignment error:', error);
                showAlert(t('tools.failedSaveAssignments', 'Не удалось сохранить назначения'));
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


