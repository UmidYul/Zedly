(function () {
    'use strict';

    let telegramState = null;

    function showMessage(message, title = 'Информация') {
        if (window.ZedlyDialog?.alert) {
            return window.ZedlyDialog.alert(message, { title });
        }
        alert(message);
    }

    function updateTelegramButton(state) {
        const btn = document.getElementById('telegramConnectBtn');
        if (!btn) return;

        btn.classList.remove('connected', 'disconnected');
        if (state?.connected) {
            btn.classList.add('connected');
            btn.title = 'Telegram: подключено';
        } else {
            btn.classList.add('disconnected');
            btn.title = 'Telegram: не подключено';
        }
    }

    async function fetchTelegramStatus() {
        const response = await fetch('/api/telegram/me/status');
        if (!response.ok) {
            throw new Error('Failed to load Telegram status');
        }
        telegramState = await response.json();
        updateTelegramButton(telegramState);
        return telegramState;
    }

    function renderEventPreferences(events, prefs) {
        return (events || []).map((event) => {
            const checked = prefs?.[event.key] !== false ? 'checked' : '';
            return `
                <label class="telegram-pref-item">
                    <input type="checkbox" class="tg-pref" data-key="${event.key}" ${checked}>
                    <span>
                        <strong>${event.label}</strong>
                        <small>${event.description}</small>
                    </span>
                </label>
            `;
        }).join('');
    }

    function collectPreferences(modal) {
        const prefs = {
            enabled: modal.querySelector('#tgEnabled')?.checked !== false
        };
        modal.querySelectorAll('.tg-pref').forEach((el) => {
            prefs[el.dataset.key] = el.checked;
        });
        return prefs;
    }

    function closeModal() {
        document.getElementById('telegramConnectModal')?.remove();
    }

    async function saveTelegramSettings() {
        const modal = document.getElementById('telegramConnectModal');
        if (!modal) return;

        const telegramId = modal.querySelector('#tgChatId')?.value?.trim();
        const prefs = collectPreferences(modal);
        const isConnected = !!telegramState?.connected;
        const currentId = String(telegramState?.telegram_id || '');
        const hasNewId = telegramId && telegramId !== currentId;

        try {
            let endpoint = '/api/telegram/me/preferences';
            let method = 'PUT';
            let body = { preferences: prefs };

            if (!isConnected || hasNewId) {
                if (!telegramId) {
                    await showMessage('Введите Telegram Chat ID', 'Ошибка');
                    return;
                }
                endpoint = '/api/telegram/me/connect';
                method = 'POST';
                body = {
                    telegram_id: telegramId,
                    preferences: prefs
                };
            }

            const response = await fetch(endpoint, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'Failed to save Telegram settings');
            }

            await fetchTelegramStatus();
            await showMessage('Telegram настройки сохранены');
            closeModal();
        } catch (error) {
            console.error('Save Telegram settings error:', error);
            await showMessage(error.message, 'Ошибка');
        }
    }

    async function sendTestMessage() {
        try {
            const response = await fetch('/api/telegram/me/test', { method: 'POST' });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'Failed to send test message');
            }
            await showMessage('Тестовое сообщение отправлено в Telegram');
        } catch (error) {
            console.error('Send Telegram test error:', error);
            await showMessage(error.message, 'Ошибка');
        }
    }

    async function disconnectTelegram() {
        const confirmed = window.ZedlyDialog?.confirm
            ? await window.ZedlyDialog.confirm('Отключить Telegram уведомления?', { title: 'Подтверждение' })
            : confirm('Отключить Telegram уведомления?');

        if (!confirmed) return;

        try {
            const response = await fetch('/api/telegram/me/disconnect', { method: 'DELETE' });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'Failed to disconnect Telegram');
            }
            await fetchTelegramStatus();
            await showMessage('Telegram отключен');
            closeModal();
        } catch (error) {
            console.error('Disconnect Telegram error:', error);
            await showMessage(error.message, 'Ошибка');
        }
    }

    async function openTelegramModal() {
        try {
            const state = await fetchTelegramStatus();
            const modalHtml = `
                <div class="modal-overlay" id="telegramConnectModal">
                    <div class="modal telegram-modal">
                        <div class="modal-header">
                            <h2>Telegram уведомления</h2>
                            <button class="modal-close" id="telegramModalCloseBtn">&times;</button>
                        </div>
                        <div class="modal-body">
                            <div class="telegram-status-chip ${state.connected ? 'connected' : 'disconnected'}">
                                ${state.connected ? 'Подключено' : 'Не подключено'}
                            </div>
                            <p class="telegram-help">
                                1) Откройте бота: ${state.bot?.username ? `<a class="telegram-link" target="_blank" href="https://t.me/${state.bot.username}">@${state.bot.username}</a>` : 'бот недоступен'}<br>
                                2) Нажмите <code>/start</code><br>
                                3) Вставьте ваш Chat ID ниже
                            </p>
                            <div class="form-group">
                                <label class="form-label">Telegram Chat ID</label>
                                <input id="tgChatId" class="form-input" type="text" value="${state.telegram_id || ''}" placeholder="Например: 123456789">
                            </div>
                            <div class="form-group">
                                <label class="telegram-pref-item">
                                    <input type="checkbox" id="tgEnabled" ${state.preferences?.enabled !== false ? 'checked' : ''}>
                                    <span>
                                        <strong>Включить Telegram уведомления</strong>
                                        <small>Общий переключатель уведомлений для вашей роли</small>
                                    </span>
                                </label>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Уведомления для роли: <strong>${state.role}</strong></label>
                                <div class="telegram-pref-list">
                                    ${renderEventPreferences(state.events, state.preferences)}
                                </div>
                            </div>
                            <div class="telegram-actions-row">
                                <button class="btn btn-primary" id="tgSaveBtn">Сохранить</button>
                                <button class="btn btn-outline" id="tgTestBtn" ${state.connected ? '' : 'disabled'}>Тест</button>
                                <button class="btn btn-danger" id="tgDisconnectBtn" ${state.connected ? '' : 'disabled'}>Отключить</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);

            document.getElementById('telegramModalCloseBtn')?.addEventListener('click', closeModal);
            document.getElementById('telegramConnectModal')?.addEventListener('click', (e) => {
                if (e.target.id === 'telegramConnectModal') closeModal();
            });
            document.getElementById('tgSaveBtn')?.addEventListener('click', saveTelegramSettings);
            document.getElementById('tgTestBtn')?.addEventListener('click', sendTestMessage);
            document.getElementById('tgDisconnectBtn')?.addEventListener('click', disconnectTelegram);
        } catch (error) {
            console.error('Open Telegram modal error:', error);
            await showMessage('Не удалось загрузить настройки Telegram', 'Ошибка');
        }
    }

    function init() {
        const btn = document.getElementById('telegramConnectBtn');
        if (!btn) return;

        btn.addEventListener('click', openTelegramModal);
        fetchTelegramStatus().catch((error) => {
            console.warn('Telegram status preload failed:', error.message);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
