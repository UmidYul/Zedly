// Global dialog system (alert/confirm/temporary password)
(function () {
    'use strict';

    const nativeAlert = window.alert ? window.alert.bind(window) : null;
    const nativeConfirm = window.confirm ? window.confirm.bind(window) : null;

    const queue = [];
    let isOpen = false;

    function ensureStyles() {
        if (document.getElementById('zedly-alert-modal-style')) return;

        const style = document.createElement('style');
        style.id = 'zedly-alert-modal-style';
        style.textContent = `
            .zedly-alert-backdrop {
                position: fixed;
                inset: 0;
                background: rgba(9, 12, 21, 0.62);
                backdrop-filter: blur(4px);
                z-index: 10000;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
                animation: zedlyAlertFadeIn 0.16s ease-out;
            }

            .zedly-alert-modal {
                width: min(460px, 100%);
                background: var(--bg-card, #151b2d);
                color: var(--text-primary, #f9fafb);
                border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
                border-radius: 16px;
                box-shadow: 0 22px 44px rgba(0, 0, 0, 0.45);
                overflow: hidden;
                animation: zedlyAlertPopIn 0.18s ease-out;
            }

            .zedly-alert-header {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 16px 20px 12px;
                font-weight: 700;
                font-size: 17px;
            }

            .zedly-alert-icon {
                width: 26px;
                height: 26px;
                border-radius: 50%;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                background: rgba(74, 144, 226, 0.2);
                color: var(--primary, #4A90E2);
                font-size: 15px;
                flex-shrink: 0;
            }

            .zedly-alert-body {
                padding: 0 20px 18px;
                color: var(--text-secondary, #d1d5db);
                line-height: 1.45;
                font-size: 15px;
                white-space: pre-wrap;
                word-break: break-word;
            }

            .zedly-alert-actions {
                display: flex;
                justify-content: flex-end;
                gap: 10px;
                padding: 14px 20px 18px;
                border-top: 1px solid var(--border, rgba(255, 255, 255, 0.1));
            }

            .zedly-alert-btn {
                min-width: 96px;
                border: 1px solid transparent;
                border-radius: 10px;
                padding: 9px 16px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: transform 0.08s ease, filter 0.12s ease;
            }

            .zedly-alert-btn:hover {
                filter: brightness(1.06);
            }

            .zedly-alert-btn:active {
                transform: translateY(1px);
            }

            .zedly-alert-btn-primary {
                background: var(--primary, #4A90E2);
                color: #fff;
            }

            .zedly-alert-btn-secondary {
                background: transparent;
                color: var(--text-secondary, #d1d5db);
                border-color: var(--border, rgba(255, 255, 255, 0.12));
            }

            .zedly-password-block {
                margin-top: 10px;
                padding: 12px;
                background: var(--bg-primary, rgba(255, 255, 255, 0.04));
                border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
                border-radius: 10px;
            }

            .zedly-password-label {
                display: block;
                margin-bottom: 8px;
                font-size: 12px;
                color: var(--text-tertiary, #9ca3af);
                text-transform: uppercase;
                letter-spacing: 0.04em;
            }

            .zedly-password-row {
                display: grid;
                grid-template-columns: 1fr auto;
                gap: 8px;
            }

            .zedly-password-input {
                width: 100%;
                border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
                background: var(--bg-secondary, rgba(255, 255, 255, 0.03));
                color: var(--text-primary, #f9fafb);
                border-radius: 8px;
                padding: 8px 10px;
                font-size: 14px;
            }

            .zedly-password-hint {
                margin-top: 10px;
                font-size: 13px;
                color: var(--text-secondary, #d1d5db);
            }

            @keyframes zedlyAlertFadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }

            @keyframes zedlyAlertPopIn {
                from { opacity: 0; transform: translateY(8px) scale(0.98); }
                to { opacity: 1; transform: translateY(0) scale(1); }
            }
        `;

        document.head.appendChild(style);
    }

    async function copyToClipboard(value) {
        const text = String(value || '');
        if (!text) return false;

        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch (error) {
            // Fallback below
        }

        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const copied = document.execCommand('copy');
        textArea.remove();
        return copied;
    }

    function showNext() {
        if (isOpen || queue.length === 0) return;
        isOpen = true;
        showModal(queue.shift());
    }

    function enqueue(item) {
        return new Promise((resolve) => {
            queue.push({ ...item, resolve });
            showNext();
        });
    }

    function closeCurrent(backdrop, item, result, onEsc) {
        if (onEsc) document.removeEventListener('keydown', onEsc);
        if (backdrop && backdrop.parentNode) {
            backdrop.parentNode.removeChild(backdrop);
        }

        if (typeof item.resolve === 'function') {
            item.resolve(result);
        }

        isOpen = false;
        showNext();
    }

    function showModal(item) {
        ensureStyles();

        const backdrop = document.createElement('div');
        backdrop.className = 'zedly-alert-backdrop';

        const modal = document.createElement('div');
        modal.className = 'zedly-alert-modal';
        modal.setAttribute('role', item.type === 'confirm' ? 'dialog' : 'alertdialog');
        modal.setAttribute('aria-modal', 'true');

        const header = document.createElement('div');
        header.className = 'zedly-alert-header';
        header.innerHTML = `<span class="zedly-alert-icon">i</span><span>${item.title || 'Notification'}</span>`;

        const body = document.createElement('div');
        body.className = 'zedly-alert-body';

        const actions = document.createElement('div');
        actions.className = 'zedly-alert-actions';

        const onEsc = (event) => {
            if (event.key !== 'Escape') return;
            if (item.type === 'confirm') {
                closeCurrent(backdrop, item, false, onEsc);
            } else {
                closeCurrent(backdrop, item, true, onEsc);
            }
        };
        document.addEventListener('keydown', onEsc);

        if (item.type === 'password') {
            const subtitle = document.createElement('p');
            subtitle.textContent = String(item.subtitle || item.message || '');
            body.appendChild(subtitle);

            const passwordBlock = document.createElement('div');
            passwordBlock.className = 'zedly-password-block';

            const label = document.createElement('label');
            label.className = 'zedly-password-label';
            label.textContent = item.passwordLabel || 'Temporary password';

            const row = document.createElement('div');
            row.className = 'zedly-password-row';

            const input = document.createElement('input');
            input.className = 'zedly-password-input';
            input.type = 'text';
            input.readOnly = true;
            input.value = String(item.password || '');

            const copyBtn = document.createElement('button');
            copyBtn.type = 'button';
            copyBtn.className = 'zedly-alert-btn zedly-alert-btn-primary';
            copyBtn.textContent = item.copyText || 'Copy';

            copyBtn.addEventListener('click', async () => {
                const copied = await copyToClipboard(input.value);
                const initial = copyBtn.textContent;
                copyBtn.textContent = copied ? (item.copiedText || 'Copied') : (item.copyFailText || 'Copy failed');
                setTimeout(() => {
                    copyBtn.textContent = initial;
                }, 1200);
            });

            row.appendChild(input);
            row.appendChild(copyBtn);
            passwordBlock.appendChild(label);
            passwordBlock.appendChild(row);
            body.appendChild(passwordBlock);

            if (item.hint) {
                const hint = document.createElement('p');
                hint.className = 'zedly-password-hint';
                hint.textContent = String(item.hint);
                body.appendChild(hint);
            }
        } else {
            body.textContent = String(item.message ?? '');
        }

        if (item.type === 'confirm') {
            const cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.className = 'zedly-alert-btn zedly-alert-btn-secondary';
            cancelBtn.textContent = item.cancelText || 'Cancel';
            cancelBtn.addEventListener('click', () => closeCurrent(backdrop, item, false, onEsc));

            const okBtn = document.createElement('button');
            okBtn.type = 'button';
            okBtn.className = 'zedly-alert-btn zedly-alert-btn-primary';
            okBtn.textContent = item.okText || 'Confirm';
            okBtn.addEventListener('click', () => closeCurrent(backdrop, item, true, onEsc));

            actions.appendChild(cancelBtn);
            actions.appendChild(okBtn);

            backdrop.addEventListener('click', (event) => {
                if (event.target === backdrop) closeCurrent(backdrop, item, false, onEsc);
            });
        } else {
            const okBtn = document.createElement('button');
            okBtn.type = 'button';
            okBtn.className = 'zedly-alert-btn zedly-alert-btn-primary';
            okBtn.textContent = item.okText || 'OK';
            okBtn.addEventListener('click', () => closeCurrent(backdrop, item, true, onEsc));
            actions.appendChild(okBtn);

            backdrop.addEventListener('click', (event) => {
                if (event.target === backdrop) closeCurrent(backdrop, item, true, onEsc);
            });
        }

        modal.appendChild(header);
        modal.appendChild(body);
        modal.appendChild(actions);
        backdrop.appendChild(modal);
        document.body.appendChild(backdrop);
    }

    function alertModal(message, options) {
        if (!document || !document.body) {
            if (nativeAlert) nativeAlert(message);
            return Promise.resolve(true);
        }

        return enqueue({
            type: 'alert',
            message,
            title: options?.title,
            okText: options?.okText
        });
    }

    function confirmModal(message, options) {
        if (!document || !document.body) {
            if (nativeConfirm) return Promise.resolve(nativeConfirm(message));
            return Promise.resolve(false);
        }

        return enqueue({
            type: 'confirm',
            message,
            title: options?.title || 'Confirmation',
            okText: options?.okText || 'Confirm',
            cancelText: options?.cancelText || 'Cancel'
        });
    }

    function temporaryPasswordModal(options) {
        if (!document || !document.body) {
            if (nativeAlert) nativeAlert(`${options?.title || 'Temporary password'}: ${options?.password || ''}`);
            return Promise.resolve(true);
        }

        return enqueue({
            type: 'password',
            title: options?.title || 'Temporary password',
            subtitle: options?.subtitle || '',
            password: options?.password || '',
            passwordLabel: options?.passwordLabel || 'Temporary password',
            copyText: options?.copyText || 'Copy',
            copiedText: options?.copiedText || 'Copied',
            copyFailText: options?.copyFailText || 'Copy failed',
            hint: options?.hint || '',
            okText: options?.okText || 'Done'
        });
    }

    window.__nativeAlert = nativeAlert;
    window.__nativeConfirm = nativeConfirm;

    window.ZedlyDialog = {
        alert: alertModal,
        confirm: confirmModal,
        temporaryPassword: temporaryPasswordModal
    };

    // Keep compatibility with existing direct alert() usage.
    window.alert = function (message) {
        alertModal(message);
    };

    function ensureGlobalLangStyles() {
        if (document.getElementById('zedly-global-lang-style')) return;
        const style = document.createElement('style');
        style.id = 'zedly-global-lang-style';
        style.textContent = `
            .global-lang-switch {
                position: fixed;
                top: max(10px, env(safe-area-inset-top));
                right: max(10px, env(safe-area-inset-right));
                z-index: 9500;
                display: inline-flex;
                gap: 6px;
                padding: 4px;
                border-radius: 12px;
                border: 1px solid rgba(148, 163, 184, 0.3);
                background: rgba(15, 23, 42, 0.66);
                backdrop-filter: blur(8px);
                box-shadow: 0 8px 20px rgba(0, 0, 0, 0.24);
            }

            .global-lang-switch .lang-btn {
                min-width: 42px;
                height: 32px;
                border: 1px solid transparent;
                border-radius: 8px;
                padding: 0 10px;
                color: #cbd5e1;
                background: transparent;
                font-size: 12px;
                font-weight: 700;
                cursor: pointer;
            }

            .global-lang-switch .lang-btn.active {
                color: #fff;
                background: linear-gradient(135deg, #4A90E2, #357ABD);
                border-color: rgba(74, 144, 226, 0.8);
            }

            @media (max-width: 768px) {
                .global-lang-switch {
                    top: calc(max(8px, env(safe-area-inset-top)) + 2px);
                    right: max(8px, env(safe-area-inset-right));
                }
            }
        `;
        document.head.appendChild(style);
    }

    function setActiveLangButton(lang, root) {
        root.querySelectorAll('.lang-btn').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.lang === lang);
        });
    }

    function applyLang(lang, root) {
        localStorage.setItem('zedly-lang', lang);
        document.documentElement.setAttribute('lang', lang);
        setActiveLangButton(lang, root);
        if (window.ZedlyI18n?.setLang) {
            window.ZedlyI18n.setLang(lang);
        }
        window.dispatchEvent(new CustomEvent('zedly:lang-change', { detail: { lang } }));
    }

    function ensureI18nLoaded() {
        if (window.ZedlyI18n?.setLang) return;
        if (document.querySelector('script[data-global-i18n-loader]')) return;
        const script = document.createElement('script');
        script.src = '/js/i18n.js';
        script.dataset.globalI18nLoader = 'true';
        script.onload = () => {
            const lang = localStorage.getItem('zedly-lang') || 'ru';
            if (window.ZedlyI18n?.setLang) {
                window.ZedlyI18n.setLang(lang);
            }
        };
        document.head.appendChild(script);
    }

    function initGlobalLanguageSwitch() {
        if (!document.body) return;
        if (document.querySelector('.lang-switch')) return;
        if (document.getElementById('globalLangSwitch')) return;

        ensureGlobalLangStyles();
        ensureI18nLoaded();

        const wrapper = document.createElement('div');
        wrapper.id = 'globalLangSwitch';
        wrapper.className = 'global-lang-switch';
        wrapper.setAttribute('role', 'group');
        wrapper.setAttribute('aria-label', 'Language switch');
        wrapper.innerHTML = `
            <button type="button" class="lang-btn" data-lang="ru">RU</button>
            <button type="button" class="lang-btn" data-lang="uz">UZ</button>
        `;

        const initialLang = localStorage.getItem('zedly-lang') || 'ru';
        setActiveLangButton(initialLang, wrapper);

        wrapper.querySelectorAll('.lang-btn').forEach((btn) => {
            btn.addEventListener('click', () => applyLang(btn.dataset.lang, wrapper));
        });

        document.body.appendChild(wrapper);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initGlobalLanguageSwitch);
    } else {
        initGlobalLanguageSwitch();
    }
})();
