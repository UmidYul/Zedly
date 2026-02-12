(function () {
    'use strict';

    let telegramState = null;
    let statusPollTimer = null;

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

    function stopStatusPolling() {
        if (statusPollTimer) {
            clearInterval(statusPollTimer);
            statusPollTimer = null;
        }
    }

    function closeModal() {
        stopStatusPolling();
        document.getElementById('telegramConnectModal')?.remove();
    }

    function updateModalConnectionState(state) {
        const modal = document.getElementById('telegramConnectModal');
        if (!modal) return;

        const chip = modal.querySelector('.telegram-status-chip');
        const testBtn = modal.querySelector('#tgTestBtn');
        const disconnectBtn = modal.querySelector('#tgDisconnectBtn');
        const statusText = modal.querySelector('#tgLinkStatusText');

        if (chip) {
            chip.classList.remove('connected', 'disconnected');
            chip.classList.add(state.connected ? 'connected' : 'disconnected');
            chip.textContent = state.connected ? 'Подключено' : 'Не подключено';
        }

        if (testBtn) testBtn.disabled = !state.connected;
        if (disconnectBtn) disconnectBtn.disabled = !state.connected;
        if (statusText) {
            statusText.textContent = state.connected
                ? 'Telegram успешно привязан. Можно отправить тест и сохранить настройки.'
                : 'Нажмите кнопку подключения и отправьте /start в боте.';
        }
    }

    function startStatusPolling() {
        stopStatusPolling();
        statusPollTimer = setInterval(async () => {
            try {
                const state = await fetchTelegramStatus();
                updateModalConnectionState(state);
                if (state.connected) {
                    stopStatusPolling();
                }
            } catch (error) {
                console.warn('Telegram status polling failed:', error.message);
            }
        }, 3000);
    }

    async function startTelegramLinkFlow() {
        try {
            const response = await fetch('/api/telegram/me/link/start', {
                method: 'POST'
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'Не удалось начать подключение');
            }

            window.open(data.link, '_blank', 'noopener,noreferrer');
            startStatusPolling();

            const statusText = document.getElementById('tgLinkStatusText');
            if (statusText) {
                statusText.textContent = 'Ожидаем команду /start в Telegram...';
            }
        } catch (error) {
            console.error('Start Telegram link flow error:', error);
            await showMessage(error.message, 'Ошибка');
        }
    }

    async function saveTelegramSettings() {
        const modal = document.getElementById('telegramConnectModal');
        if (!modal) return;

        const prefs = collectPreferences(modal);

        try {
            const response = await fetch('/api/telegram/me/preferences', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ preferences: prefs })
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'Failed to save Telegram settings');
            }

            await fetchTelegramStatus();
            updateModalConnectionState(telegramState);
            await showMessage('Telegram настройки сохранены');
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
            updateModalConnectionState(telegramState);
            await showMessage('Telegram отключен');
        } catch (error) {
            console.error('Disconnect Telegram error:', error);
            await showMessage(error.message, 'Ошибка');
        }
    }

    async function openTelegramModal() {
        try {
            const state = await fetchTelegramStatus();
            const botName = state.bot?.username ? `@${state.bot.username}` : 'бот недоступен';
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
                                Подключение выполняется автоматически через бота ${botName}.<br>
                                Нажмите кнопку ниже, откройте чат и отправьте <code>/start</code>.
                            </p>
                            <div class="telegram-actions-row" style="margin-bottom: 12px;">
                                <button class="btn btn-primary" id="tgLinkBtn" ${state.link_flow_supported ? '' : 'disabled'}>
                                    Подключить через Telegram
                                </button>
                            </div>
                            <p class="telegram-help" id="tgLinkStatusText">
                                ${state.connected
                    ? 'Telegram успешно привязан. Можно отправить тест и сохранить настройки.'
                    : 'Нажмите кнопку подключения и отправьте /start в боте.'}
                            </p>
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
            document.getElementById('tgLinkBtn')?.addEventListener('click', startTelegramLinkFlow);
            document.getElementById('tgSaveBtn')?.addEventListener('click', saveTelegramSettings);
            document.getElementById('tgTestBtn')?.addEventListener('click', sendTestMessage);
            document.getElementById('tgDisconnectBtn')?.addEventListener('click', disconnectTelegram);

            if (!state.connected) {
                startStatusPolling();
            }
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
