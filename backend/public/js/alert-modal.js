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

    const fallbackUiTranslations = {
        ru: {
            'Notification': 'Уведомление',
            'Confirmation': 'Подтверждение',
            'Confirm': 'Подтвердить',
            'Cancel': 'Отмена',
            'OK': 'OK',
            'Temporary password': 'Временный пароль',
            'Copy': 'Копировать',
            'Copied': 'Скопировано',
            'Copy failed': 'Не удалось скопировать',
            'Done': 'Готово',
            'Back to Results': 'Назад к результатам',
            'Back to Dashboard': 'Назад в дашборд',
            'Student Attempt': 'Попытка ученика',
            'Loading attempt details...': 'Загрузка деталей попытки...',
            'Attempt Summary': 'Сводка попытки',
            'Score': 'Балл',
            'Percentage': 'Процент',
            'Time Taken': 'Время',
            'Correct Answers': 'Верных ответов',
            'Student:': 'Ученик:',
            'Test:': 'Тест:',
            'Subject:': 'Предмет:',
            'Submitted:': 'Отправлено:',
            'Questions Review': 'Разбор вопросов',
            'All Questions': 'Все вопросы',
            'Correct': 'Верные',
            'Incorrect': 'Неверные',
            'Question': 'Вопрос',
            'marks': 'балл.',
            'No questions match the current filter.': 'Нет вопросов по текущему фильтру.',
            'Manual Grading': 'Ручная проверка',
            'True': 'Верно',
            'False': 'Неверно',
            'Student Answer:': 'Ответ ученика:',
            'Correct Answer:': 'Правильный ответ:',
            'Correct Answers:': 'Правильные ответы:',
            'Not answered': 'Нет ответа',
            'Blank': 'Пропуск',
            'Empty': 'Пусто',
            'Student Order:': 'Порядок ученика:',
            'Correct Order:': 'Правильный порядок:',
            'Student match:': 'Сопоставление ученика:',
            'Correct:': 'Правильно:',
            'Not matched': 'Не сопоставлено',
            'Failed to load attempt': 'Не удалось загрузить попытку',
            'An error occurred while loading the attempt details.': 'Произошла ошибка при загрузке деталей попытки.',
            'Go Back': 'Назад',
            'Assignment Results': 'Результаты назначения',
            'Loading results...': 'Загрузка результатов...',
            'Test Name': 'Название теста',
            'Class': 'Класс',
            'Date Range': 'Период',
            'Total Students': 'Всего учеников',
            'Completed': 'Завершено',
            'Pending': 'Ожидают',
            'Average Score': 'Средний балл',
            'Student Results': 'Результаты учеников',
            'Failed to load results': 'Не удалось загрузить результаты',
            'An error occurred while loading results.': 'Произошла ошибка при загрузке результатов.',
            'Search students...': 'Поиск учеников...',
            'Export': 'Экспорт',
            'Take Test - Zedly': 'Прохождение теста - Zedly',
            'Loading test...': 'Загрузка теста...',
            'Changes saved': 'Изменения сохранены',
            'Under Development': 'В разработке',
            'Telegram Bot - ZEDLY': 'Telegram Бот - ZEDLY',
            'Username:': 'Логин:',
            'Name:': 'Имя:',
            'ID:': 'ID:',
            'Can Join Groups:': 'Может входить в группы:',
            'Page removed': 'Страница удалена',
            'This page is no longer available.': 'Эта страница больше недоступна.',
            'Go to Dashboard': 'Перейти в дашборд',
            'Teacher': 'Учитель',
            'Student': 'Ученик',
            'Role': 'Роль',
            'User': 'Пользователь'
        },
        uz: {
            'Notification': 'Bildirishnoma',
            'Confirmation': 'Tasdiqlash',
            'Confirm': 'Tasdiqlash',
            'Cancel': 'Bekor qilish',
            'OK': 'OK',
            'Temporary password': 'Vaqtinchalik parol',
            'Copy': 'Nusxalash',
            'Copied': 'Nusxalandi',
            'Copy failed': 'Nusxalab bo\'lmadi',
            'Done': 'Tayyor',
            'Back to Results': 'Natijalarga qaytish',
            'Back to Dashboard': 'Dashboardga qaytish',
            'Student Attempt': 'O\'quvchi urinishi',
            'Loading attempt details...': 'Urinish tafsilotlari yuklanmoqda...',
            'Attempt Summary': 'Urinish xulosasi',
            'Score': 'Ball',
            'Percentage': 'Foiz',
            'Time Taken': 'Vaqt',
            'Correct Answers': 'To\'g\'ri javoblar',
            'Student:': 'O\'quvchi:',
            'Test:': 'Test:',
            'Subject:': 'Fan:',
            'Submitted:': 'Yuborilgan:',
            'Questions Review': 'Savollar tahlili',
            'All Questions': 'Barcha savollar',
            'Correct': 'To\'g\'ri',
            'Incorrect': 'Noto\'g\'ri',
            'Question': 'Savol',
            'marks': 'ball',
            'No questions match the current filter.': 'Joriy filtr bo\'yicha savollar topilmadi.',
            'Manual Grading': 'Qo\'lda tekshirish',
            'True': 'Rost',
            'False': 'Yolg\'on',
            'Student Answer:': 'O\'quvchi javobi:',
            'Correct Answer:': 'To\'g\'ri javob:',
            'Correct Answers:': 'To\'g\'ri javoblar:',
            'Not answered': 'Javob berilmagan',
            'Blank': 'Bo\'sh joy',
            'Empty': 'Bo\'sh',
            'Student Order:': 'O\'quvchi tartibi:',
            'Correct Order:': 'To\'g\'ri tartib:',
            'Student match:': 'O\'quvchi moslash:',
            'Correct:': 'To\'g\'ri:',
            'Not matched': 'Moslanmagan',
            'Failed to load attempt': 'Urinishni yuklab bo\'lmadi',
            'An error occurred while loading the attempt details.': 'Urinish tafsilotlarini yuklashda xatolik yuz berdi.',
            'Go Back': 'Orqaga',
            'Assignment Results': 'Topshiriq natijalari',
            'Loading results...': 'Natijalar yuklanmoqda...',
            'Test Name': 'Test nomi',
            'Class': 'Sinf',
            'Date Range': 'Sana oralig\'i',
            'Total Students': 'Jami o\'quvchilar',
            'Completed': 'Yakunlangan',
            'Pending': 'Kutilmoqda',
            'Average Score': 'O\'rtacha ball',
            'Student Results': 'O\'quvchi natijalari',
            'Failed to load results': 'Natijalarni yuklab bo\'lmadi',
            'An error occurred while loading results.': 'Natijalarni yuklashda xatolik yuz berdi.',
            'Search students...': 'O\'quvchilarni qidirish...',
            'Export': 'Eksport',
            'Take Test - Zedly': 'Test topshirish - Zedly',
            'Loading test...': 'Test yuklanmoqda...',
            'Changes saved': 'O\'zgarishlar saqlandi',
            'Under Development': 'Ishlab chiqilmoqda',
            'Telegram Bot - ZEDLY': 'Telegram Bot - ZEDLY',
            'Username:': 'Login:',
            'Name:': 'Ism:',
            'ID:': 'ID:',
            'Can Join Groups:': 'Guruhlarga qo\'shila oladi:',
            'Page removed': 'Sahifa o\'chirildi',
            'This page is no longer available.': 'Bu sahifa endi mavjud emas.',
            'Go to Dashboard': 'Dashboardga o\'tish',
            'Teacher': 'O\'qituvchi',
            'Student': 'O\'quvchi',
            'Role': 'Rol',
            'User': 'Foydalanuvchi'
        }
    };

    function normalizeText(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function translateLooseText(raw, lang) {
        const dict = fallbackUiTranslations[lang] || fallbackUiTranslations.ru;
        const key = normalizeText(raw);
        return dict[key] || null;
    }

    function applyFallbackTranslations(root) {
        const lang = (localStorage.getItem('zedly-lang') || 'ru') === 'uz' ? 'uz' : 'ru';
        const scope = root || document.body;
        if (!scope) return;

        const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                if (!node || !node.nodeValue) return NodeFilter.FILTER_REJECT;
                const parent = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;
                if (parent.closest('[data-i18n],[data-i18n-placeholder],[data-i18n-title]')) return NodeFilter.FILTER_REJECT;
                const tag = parent.tagName;
                if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return NodeFilter.FILTER_REJECT;
                const trimmed = normalizeText(node.nodeValue);
                if (!trimmed) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });

        const updates = [];
        while (walker.nextNode()) {
            const textNode = walker.currentNode;
            const translated = translateLooseText(textNode.nodeValue, lang);
            if (translated && translated !== normalizeText(textNode.nodeValue)) {
                updates.push({ node: textNode, value: translated });
            }
        }
        updates.forEach((item) => {
            item.node.nodeValue = item.value;
        });

        scope.querySelectorAll?.('input[placeholder], textarea[placeholder], [title]').forEach((el) => {
            if (el.hasAttribute('placeholder')) {
                const translatedPlaceholder = translateLooseText(el.getAttribute('placeholder'), lang);
                if (translatedPlaceholder) el.setAttribute('placeholder', translatedPlaceholder);
            }
            if (el.hasAttribute('title')) {
                const translatedTitle = translateLooseText(el.getAttribute('title'), lang);
                if (translatedTitle) el.setAttribute('title', translatedTitle);
            }
        });
    }

    let fallbackObserver = null;
    let fallbackTimer = null;
    function initFallbackTranslations() {
        if (!document.body) return;
        applyFallbackTranslations(document.body);

        if (fallbackObserver) return;
        fallbackObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        applyFallbackTranslations(node);
                    } else if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
                        applyFallbackTranslations(node.parentElement);
                    }
                });
            }
        });
        fallbackObserver.observe(document.body, { childList: true, subtree: true });

        const schedule = () => {
            clearTimeout(fallbackTimer);
            fallbackTimer = setTimeout(() => applyFallbackTranslations(document.body), 20);
        };
        window.addEventListener('zedly:lang-change', schedule);
        window.addEventListener('zedly:lang-changed', schedule);
    }

    function initGlobalLanguageSwitch() {
        if (!document.body) return;
        const pathname = (window.location && window.location.pathname) ? window.location.pathname : '';
        const isLandingPage = document.body.classList.contains('landing-page')
            || pathname === '/'
            || pathname === '/index.html'
            || !!document.getElementById('landingLangBtn');
        if (isLandingPage) {
            const existingGlobal = document.getElementById('globalLangSwitch');
            if (existingGlobal) existingGlobal.remove();
            return;
        }
        const existingGlobal = document.getElementById('globalLangSwitch');
        const nativeSwitch = document.querySelector('.lang-switch');
        if (nativeSwitch) {
            const style = window.getComputedStyle(nativeSwitch);
            const hiddenByCss = style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) === 0;
            const rect = nativeSwitch.getBoundingClientRect();
            const visibleInViewport = rect.width > 0
                && rect.height > 0
                && rect.bottom > 0
                && rect.right > 0
                && rect.top < window.innerHeight
                && rect.left < window.innerWidth;
            if (!hiddenByCss && visibleInViewport) {
                if (existingGlobal) existingGlobal.remove();
                return;
            }
        }
        if (existingGlobal) return;

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
        document.addEventListener('DOMContentLoaded', () => {
            initGlobalLanguageSwitch();
            initFallbackTranslations();
        });
    } else {
        initGlobalLanguageSwitch();
        initFallbackTranslations();
    }

    window.addEventListener('resize', initGlobalLanguageSwitch);
})();
