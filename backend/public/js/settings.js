// Settings Page (SuperAdmin + SchoolAdmin read-only)
(function () {
    'use strict';

    const API_SUPERADMIN = '/api/superadmin/notification-defaults';
    const API_SCHOOL_ADMIN = '/api/admin/notification-defaults';
    const ROLES = ['student', 'teacher', 'school_admin', 'superadmin'];
    const ROLE_LABELS = {
        student: 'settings.role.student',
        teacher: 'settings.role.teacher',
        school_admin: 'settings.role.school_admin',
        superadmin: 'settings.role.superadmin'
    };
    const CHANNEL_LABELS = {
        in_app: 'settings.channel.in_app',
        email: 'settings.channel.email',
        telegram: 'settings.channel.telegram'
    };
    const CHANNEL_KEYS = ['in_app', 'email', 'telegram'];
    const EVENT_LABELS = {
        new_test: 'settings.event.new_test',
        assignment_deadline: 'settings.event.assignment_deadline',
        password_reset: 'settings.event.password_reset',
        profile_updates: 'settings.event.profile_updates',
        system_updates: 'settings.event.system_updates',
        welcome: 'settings.event.welcome',
        digest_summary: 'settings.event.digest_summary'
    };
    const EVENT_KEYS = [
        'new_test',
        'assignment_deadline',
        'password_reset',
        'profile_updates',
        'system_updates',
        'welcome',
        'digest_summary'
    ];

    const state = {
        defaults: {},
        role: '',
        readOnly: true
    };

    function getCurrentUserRole() {
        try {
            const raw = localStorage.getItem('user');
            if (!raw) return '';
            const parsed = JSON.parse(raw);
            return String(parsed?.role || '');
        } catch (_) {
            return '';
        }
    }

    function getApiEndpoint() {
        return state.role === 'superadmin' ? API_SUPERADMIN : API_SCHOOL_ADMIN;
    }

    function getToken() {
        return localStorage.getItem('access_token') || '';
    }

    function t(key, fallback, params) {
        const tr = window.ZedlyI18n?.translate?.(key, params);
        return tr && tr !== key ? tr : (fallback || key);
    }

    async function apiGet() {
        const response = await fetch(getApiEndpoint(), {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!response.ok) throw new Error(`Request failed: ${response.status}`);
        return response.json();
    }

    async function apiPut(payload) {
        const response = await fetch(getApiEndpoint(), {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(`Request failed: ${response.status}`);
        return response.json();
    }

    function esc(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function normalizeRoleDefaults(roleData) {
        const channels = {};
        const events = {};
        const matrix = {};
        for (const key of CHANNEL_KEYS) channels[key] = !!roleData?.channels?.[key];
        for (const key of EVENT_KEYS) events[key] = !!roleData?.events?.[key];
        for (const channelKey of CHANNEL_KEYS) {
            matrix[channelKey] = {};
            for (const eventKey of EVENT_KEYS) {
                const explicit = roleData?.matrix?.[channelKey]?.[eventKey];
                if (explicit !== undefined) {
                    matrix[channelKey][eventKey] = !!explicit;
                } else {
                    matrix[channelKey][eventKey] = channels[channelKey] && events[eventKey];
                }
            }
        }
        const frequency = ['instant', 'daily', 'weekly'].includes(String(roleData?.frequency || 'instant'))
            ? String(roleData.frequency)
            : 'instant';
        return { channels, events, matrix, frequency };
    }

    function setStatus(text, isError = false) {
        const el = document.getElementById('settingsNotificationDefaultsStatus');
        if (!el) return;
        el.textContent = text || '';
        el.style.color = isError ? '#ef4444' : 'var(--text-secondary)';
    }

    function renderMatrix() {
        const wrap = document.getElementById('settingsNotificationDefaultsMatrix');
        if (!wrap) return;

        let html = '<div class="settings-role-grid">';

        for (const role of ROLES) {
            const row = normalizeRoleDefaults(state.defaults[role] || {});
            html += `
                <div class="dashboard-section settings-role-card">
                    <div class="section-header">
                        <h3 class="section-title">${esc(t(ROLE_LABELS[role] || role, role))}</h3>
                        <div style="display:flex;align-items:center;gap:8px;">
                            <label class="text-secondary" for="settingsFrequency_${esc(role)}">${t('settings.notificationDefaults.frequency', 'Частота')}</label>
                            <select id="settingsFrequency_${esc(role)}" data-role="${esc(role)}" data-scope="frequency" ${state.readOnly ? 'disabled' : ''}>
                                <option value="instant" ${row.frequency === 'instant' ? 'selected' : ''}>${t('settings.notificationDefaults.instant', 'мгновенно')}</option>
                                <option value="daily" ${row.frequency === 'daily' ? 'selected' : ''}>${t('settings.notificationDefaults.daily', 'ежедневно')}</option>
                                <option value="weekly" ${row.frequency === 'weekly' ? 'selected' : ''}>${t('settings.notificationDefaults.weekly', 'еженедельно')}</option>
                            </select>
                        </div>
                    </div>
                    <div class="table-responsive">
                        <table class="data-table settings-role-table">
                            <thead>
                                <tr>
                                    <th>${t('settings.notificationDefaults.matrixAxis', 'Канал \\ Событие')}</th>
                                    ${EVENT_KEYS.map((eventKey) => `<th>${esc(t(EVENT_LABELS[eventKey] || eventKey, eventKey))}</th>`).join('')}
                                </tr>
                            </thead>
                            <tbody>
                                ${CHANNEL_KEYS.map((channelKey) => `
                                    <tr>
                                        <td><strong>${esc(t(CHANNEL_LABELS[channelKey] || channelKey, channelKey))}</strong></td>
                                        ${EVENT_KEYS.map((eventKey) => `
                                            <td>
                                                <input
                                                    type="checkbox"
                                                    data-role="${esc(role)}"
                                                    data-scope="matrix"
                                                    data-channel="${esc(channelKey)}"
                                                    data-event="${esc(eventKey)}"
                                                    ${row.matrix[channelKey][eventKey] ? 'checked' : ''}
                                                    ${state.readOnly ? 'disabled' : ''}
                                                >
                                            </td>
                                        `).join('')}
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        html += '</div>';
        wrap.innerHTML = html;
    }

    function deriveChannelsEventsFromMatrix(matrix) {
        const channels = {};
        const events = {};

        for (const channelKey of CHANNEL_KEYS) {
            channels[channelKey] = EVENT_KEYS.some((eventKey) => !!matrix[channelKey]?.[eventKey]);
        }
        for (const eventKey of EVENT_KEYS) {
            events[eventKey] = CHANNEL_KEYS.some((channelKey) => !!matrix[channelKey]?.[eventKey]);
        }

        return { channels, events };
    }

    function collectPayload() {
        const defaults = {};
        for (const role of ROLES) {
            defaults[role] = { channels: {}, events: {}, matrix: {}, frequency: 'instant' };
            for (const channelKey of CHANNEL_KEYS) {
                defaults[role].matrix[channelKey] = {};
                for (const eventKey of EVENT_KEYS) {
                    defaults[role].matrix[channelKey][eventKey] = false;
                }
            }
        }

        document.querySelectorAll('#settingsNotificationDefaultsMatrix input[type="checkbox"][data-scope="matrix"]').forEach((el) => {
            const role = String(el.getAttribute('data-role') || '');
            const channel = String(el.getAttribute('data-channel') || '');
            const eventKey = String(el.getAttribute('data-event') || '');
            if (!defaults[role] || !defaults[role].matrix[channel] || !eventKey) return;
            defaults[role].matrix[channel][eventKey] = !!el.checked;
        });

        document.querySelectorAll('#settingsNotificationDefaultsMatrix select[data-scope="frequency"]').forEach((el) => {
            const role = String(el.getAttribute('data-role') || '');
            const value = String(el.value || 'instant');
            if (!defaults[role]) return;
            defaults[role].frequency = ['instant', 'daily', 'weekly'].includes(value) ? value : 'instant';
        });

        for (const role of ROLES) {
            const reduced = deriveChannelsEventsFromMatrix(defaults[role].matrix);
            defaults[role].channels = reduced.channels;
            defaults[role].events = reduced.events;
        }

        return { defaults };
    }

    function bindEvents() {
        const saveBtn = document.getElementById('settingsSaveNotificationDefaultsBtn');
        if (!saveBtn) return;
        if (state.readOnly) {
            saveBtn.disabled = true;
            saveBtn.textContent = t('settings.notificationDefaults.readOnly', 'Только просмотр');
            return;
        }

        saveBtn.addEventListener('click', async () => {
            try {
                saveBtn.disabled = true;
                saveBtn.textContent = t('common.saving', 'Сохранение...');
                setStatus(t('settings.notificationDefaults.saving', 'Сохранение настроек...'));

                const payload = collectPayload();
                const data = await apiPut(payload);
                state.defaults = data.defaults || {};
                renderMatrix();
                setStatus(t('settings.notificationDefaults.saved', 'Настройки сохранены'));
            } catch (error) {
                console.error('Save notification defaults error:', error);
                setStatus(t('settings.notificationDefaults.failedSave', 'Не удалось сохранить настройки'), true);
            } finally {
                saveBtn.disabled = false;
                saveBtn.textContent = t('settings.notificationDefaults.saveDefaults', 'Сохранить настройки');
            }
        });
    }

    async function init() {
        const matrix = document.getElementById('settingsNotificationDefaultsMatrix');
        if (!matrix) return;
        state.role = getCurrentUserRole();
        state.readOnly = state.role !== 'superadmin';

        setStatus(t('settings.notificationDefaults.loading', 'Загрузка настроек...'));
        try {
            const data = await apiGet();
            state.defaults = data.defaults || {};
            renderMatrix();
            bindEvents();
            setStatus('');
        } catch (error) {
            console.error('Load notification defaults error:', error);
            setStatus(t('settings.notificationDefaults.failedLoad', 'Не удалось загрузить настройки'), true);
        }
    }

    window.SettingsPage = { init };
})();
