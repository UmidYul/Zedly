// Global alert/confirm modal replacement
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

    function closeCurrent(backdrop, item, result) {
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
        header.innerHTML = `<span class="zedly-alert-icon">i</span><span>${item.title || 'Уведомление'}</span>`;

        const body = document.createElement('div');
        body.className = 'zedly-alert-body';
        body.textContent = String(item.message ?? '');

        const actions = document.createElement('div');
        actions.className = 'zedly-alert-actions';

        const okBtn = document.createElement('button');
        okBtn.type = 'button';
        okBtn.className = 'zedly-alert-btn zedly-alert-btn-primary';
        okBtn.textContent = item.okText || 'OK';

        const onEsc = (event) => {
            if (event.key !== 'Escape') return;
            document.removeEventListener('keydown', onEsc);
            closeCurrent(backdrop, item, item.type === 'confirm' ? false : true);
        };

        document.addEventListener('keydown', onEsc);

        okBtn.addEventListener('click', () => {
            document.removeEventListener('keydown', onEsc);
            closeCurrent(backdrop, item, true);
        });

        if (item.type === 'confirm') {
            const cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.className = 'zedly-alert-btn zedly-alert-btn-secondary';
            cancelBtn.textContent = item.cancelText || 'Отмена';

            cancelBtn.addEventListener('click', () => {
                document.removeEventListener('keydown', onEsc);
                closeCurrent(backdrop, item, false);
            });

            backdrop.addEventListener('click', (event) => {
                if (event.target === backdrop) {
                    document.removeEventListener('keydown', onEsc);
                    closeCurrent(backdrop, item, false);
                }
            });

            actions.appendChild(cancelBtn);
        } else {
            backdrop.addEventListener('click', (event) => {
                if (event.target === backdrop) {
                    document.removeEventListener('keydown', onEsc);
                    closeCurrent(backdrop, item, true);
                }
            });
        }

        actions.appendChild(okBtn);
        modal.appendChild(header);
        modal.appendChild(body);
        modal.appendChild(actions);
        backdrop.appendChild(modal);
        document.body.appendChild(backdrop);

        (item.type === 'confirm' ? actions.querySelector('.zedly-alert-btn-secondary') : okBtn).focus();
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
            title: options?.title || 'Подтверждение',
            okText: options?.okText || 'Подтвердить',
            cancelText: options?.cancelText || 'Отмена'
        });
    }

    window.__nativeAlert = nativeAlert;
    window.__nativeConfirm = nativeConfirm;

    window.ZedlyDialog = {
        alert: alertModal,
        confirm: confirmModal
    };

    // Keep compatibility with existing code
    window.alert = function (message) {
        alertModal(message);
    };
})();
