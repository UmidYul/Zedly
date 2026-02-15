// SuperAdmin Settings Page
(function () {
    'use strict';

    const API = '/api/superadmin/notification-defaults';
    const ROLES = ['student', 'teacher', 'school_admin', 'superadmin'];
    const ROLE_LABELS = {
        student: 'Student',
        teacher: 'Teacher',
        school_admin: 'School Admin',
        superadmin: 'SuperAdmin'
    };
    const CHANNEL_KEYS = ['in_app', 'email', 'telegram'];
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
        defaults: {}
    };

    function getToken() {
        return localStorage.getItem('access_token') || '';
    }

    async function apiGet() {
        const response = await fetch(API, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!response.ok) throw new Error(`Request failed: ${response.status}`);
        return response.json();
    }

    async function apiPut(payload) {
        const response = await fetch(API, {
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
        for (const key of CHANNEL_KEYS) channels[key] = !!roleData?.channels?.[key];
        for (const key of EVENT_KEYS) events[key] = !!roleData?.events?.[key];
        const frequency = ['instant', 'daily', 'weekly'].includes(String(roleData?.frequency || 'instant'))
            ? String(roleData.frequency)
            : 'instant';
        return { channels, events, frequency };
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

        let html = '<div class="table-responsive"><table class="data-table">';
        html += '<thead><tr><th>Role</th>';
        for (const key of CHANNEL_KEYS) html += `<th>Channel: ${esc(key)}</th>`;
        for (const key of EVENT_KEYS) html += `<th>Event: ${esc(key)}</th>`;
        html += '<th>Frequency</th></tr></thead><tbody>';

        for (const role of ROLES) {
            const row = normalizeRoleDefaults(state.defaults[role] || {});
            html += `<tr><td><strong>${esc(ROLE_LABELS[role] || role)}</strong></td>`;
            for (const key of CHANNEL_KEYS) {
                html += `<td><input type="checkbox" data-role="${esc(role)}" data-scope="channels" data-key="${esc(key)}" ${row.channels[key] ? 'checked' : ''}></td>`;
            }
            for (const key of EVENT_KEYS) {
                html += `<td><input type="checkbox" data-role="${esc(role)}" data-scope="events" data-key="${esc(key)}" ${row.events[key] ? 'checked' : ''}></td>`;
            }
            html += `<td>
                <select data-role="${esc(role)}" data-scope="frequency">
                    <option value="instant" ${row.frequency === 'instant' ? 'selected' : ''}>instant</option>
                    <option value="daily" ${row.frequency === 'daily' ? 'selected' : ''}>daily</option>
                    <option value="weekly" ${row.frequency === 'weekly' ? 'selected' : ''}>weekly</option>
                </select>
            </td>`;
            html += '</tr>';
        }

        html += '</tbody></table></div>';
        wrap.innerHTML = html;
    }

    function collectPayload() {
        const defaults = {};
        for (const role of ROLES) {
            defaults[role] = { channels: {}, events: {}, frequency: 'instant' };
        }

        document.querySelectorAll('#settingsNotificationDefaultsMatrix input[type="checkbox"]').forEach((el) => {
            const role = String(el.getAttribute('data-role') || '');
            const scope = String(el.getAttribute('data-scope') || '');
            const key = String(el.getAttribute('data-key') || '');
            if (!defaults[role] || !defaults[role][scope] || !key) return;
            defaults[role][scope][key] = !!el.checked;
        });

        document.querySelectorAll('#settingsNotificationDefaultsMatrix select[data-scope="frequency"]').forEach((el) => {
            const role = String(el.getAttribute('data-role') || '');
            const value = String(el.value || 'instant');
            if (!defaults[role]) return;
            defaults[role].frequency = ['instant', 'daily', 'weekly'].includes(value) ? value : 'instant';
        });

        return { defaults };
    }

    function bindEvents() {
        const saveBtn = document.getElementById('settingsSaveNotificationDefaultsBtn');
        if (!saveBtn) return;

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
