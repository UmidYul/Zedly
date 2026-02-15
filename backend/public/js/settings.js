// Settings Page (SuperAdmin + SchoolAdmin read-only)
(function () {
    'use strict';

    const API_SUPERADMIN = '/api/superadmin/notification-defaults';
    const API_SCHOOL_ADMIN = '/api/admin/notification-defaults';
    const ROLES = ['student', 'teacher', 'school_admin', 'superadmin'];
    const ROLE_LABELS = {
        student: 'Student',
        teacher: 'Teacher',
        school_admin: 'School Admin',
        superadmin: 'SuperAdmin'
    };
    const CHANNEL_LABELS = {
        in_app: 'In-App',
        email: 'Email',
        telegram: 'Telegram'
    };
    const CHANNEL_KEYS = ['in_app', 'email', 'telegram'];
    const EVENT_LABELS = {
        new_test: 'New test',
        assignment_deadline: 'Deadline',
        password_reset: 'Pwd reset',
        profile_updates: 'Profile',
        system_updates: 'System',
        welcome: 'Welcome',
        digest_summary: 'Digest'
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
                        <h3 class="section-title">${esc(ROLE_LABELS[role] || role)}</h3>
                        <div style="display:flex;align-items:center;gap:8px;">
                            <label class="text-secondary" for="settingsFrequency_${esc(role)}">Frequency</label>
                            <select id="settingsFrequency_${esc(role)}" data-role="${esc(role)}" data-scope="frequency" ${state.readOnly ? 'disabled' : ''}>
                                <option value="instant" ${row.frequency === 'instant' ? 'selected' : ''}>instant</option>
                                <option value="daily" ${row.frequency === 'daily' ? 'selected' : ''}>daily</option>
                                <option value="weekly" ${row.frequency === 'weekly' ? 'selected' : ''}>weekly</option>
                            </select>
                        </div>
                    </div>
                    <div class="table-responsive">
                        <table class="data-table settings-role-table">
                            <thead>
                                <tr>
                                    <th>Channel \ Event</th>
                                    ${EVENT_KEYS.map((eventKey) => `<th>${esc(EVENT_LABELS[eventKey] || eventKey)}</th>`).join('')}
                                </tr>
                            </thead>
                            <tbody>
                                ${CHANNEL_KEYS.map((channelKey) => `
                                    <tr>
                                        <td><strong>${esc(CHANNEL_LABELS[channelKey] || channelKey)}</strong></td>
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
            saveBtn.textContent = 'Read only';
            return;
        }

        saveBtn.addEventListener('click', async () => {
            try {
                saveBtn.disabled = true;
                saveBtn.textContent = 'Saving...';
                setStatus('Saving defaults...');

                const payload = collectPayload();
                const data = await apiPut(payload);
                state.defaults = data.defaults || {};
                renderMatrix();
                setStatus('Defaults saved');
            } catch (error) {
                console.error('Save notification defaults error:', error);
                setStatus('Failed to save defaults', true);
            } finally {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save defaults';
            }
        });
    }

    async function init() {
        const matrix = document.getElementById('settingsNotificationDefaultsMatrix');
        if (!matrix) return;
        state.role = getCurrentUserRole();
        state.readOnly = state.role !== 'superadmin';

        setStatus('Loading defaults...');
        try {
            const data = await apiGet();
            state.defaults = data.defaults || {};
            renderMatrix();
            bindEvents();
            setStatus('');
        } catch (error) {
            console.error('Load notification defaults error:', error);
            setStatus('Failed to load defaults', true);
        }
    }

    window.SettingsPage = { init };
})();
