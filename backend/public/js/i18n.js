// i18n - Internationalization
(function () {
    'use strict';

    const LANG_KEY = 'zedly-lang';
    const DEFAULT_LANG = 'ru';

    // Translations
    const translations = {
        ru: {
            login: 'Войти',
            'hero.title': 'Современная образовательная платформа для школ Узбекистана',
            'hero.description': 'Мониторинг прогресса учеников, создание тестов, аналитика и профориентация в одной платформе',
            'hero.getStarted': 'Начать работу',
            'hero.learnMore': 'Узнать больше',
            'features.title': 'Возможности платформы',
            'features.students.title': 'Для учеников',
            'features.students.item1': 'Прохождение тестов и контрольных работ',
            'features.students.item2': 'Тест на профориентацию',
            'features.students.item3': 'Таблица лидеров и рейтинги',
            'features.students.item4': 'Отслеживание прогресса',
            'features.teachers.title': 'Для учителей',
            'features.teachers.item1': 'Конструктор тестов (9 типов вопросов)',
            'features.teachers.item2': 'Аналитика по классам и ученикам',
            'features.teachers.item3': 'Визуализация результатов',
            'features.teachers.item4': 'Массовое назначение тестов',
            'features.admins.title': 'Для администраторов',
            'features.admins.item1': 'Управление пользователями и классами',
            'features.admins.item2': 'Импорт данных из Excel',
            'features.admins.item3': 'Статистика по школе',
            'features.admins.item4': 'Audit-логи и безопасность',
            'features.analytics.title': 'Аналитика',
            'features.analytics.item1': 'Графики и диаграммы',
            'features.analytics.item2': 'Heatmap успеваемости',
            'features.analytics.item3': 'Автоматические отчеты',
            'features.analytics.item4': 'Экспорт в Excel',
            'stats.questionTypes': 'Типов вопросов',
            'stats.roles': 'Роли пользователей',
            'stats.languages': 'Языка интерфейса',
            'stats.available': 'Доступность',
            'cta.title': 'Готовы начать?',
            'cta.description': 'Присоединяйтесь к современной образовательной платформе',
            'cta.button': 'Войти в систему',
            'footer.description': 'Образовательная платформа для Узбекистана',
            'footer.product': 'Продукт',
            'footer.features': 'Возможности',
            'footer.login': 'Вход',
            'footer.support': 'Поддержка',
            'footer.rights': 'Все права защищены',
            // Login page
            'login.welcome': 'Добро пожаловать',
            'login.subtitle': 'Современная образовательная платформа для школ Узбекистана',
            'login.feature1': 'Безопасная аутентификация',
            'login.feature2': 'Доступ для всех ролей',
            'login.feature3': '24/7 Поддержка',
            'login.title': 'Вход в систему',
            'login.username': 'Логин',
            'login.usernamePlaceholder': 'Введите логин',
            'login.password': 'Пароль',
            'login.passwordPlaceholder': 'Введите пароль',
            'login.remember': 'Запомнить меня',
            'login.submit': 'Войти',
            'login.backHome': '← Вернуться на главную',
            'login.error.empty': 'Пожалуйста, заполните все поля',
            'login.error.usernameShort': 'Логин должен содержать минимум 3 символа',
            'login.error.passwordShort': 'Пароль должен содержать минимум 6 символов',
            'login.error.failed': 'Неверный логин или пароль',
            'login.error.network': 'Ошибка сети. Попробуйте позже'
        },
        uz: {
            login: 'Kirish',
            'hero.title': 'O\'zbekiston maktablari uchun zamonaviy ta\'lim platformasi',
            'hero.description': 'O\'quvchilar taraqqiyotini kuzatish, testlar yaratish, analitika va kasbga yo\'naltirish bir platformada',
            'hero.getStarted': 'Boshlash',
            'hero.learnMore': 'Ko\'proq bilish',
            'features.title': 'Platforma imkoniyatlari',
            'features.students.title': 'O\'quvchilar uchun',
            'features.students.item1': 'Testlar va nazorat ishlaridan o\'tish',
            'features.students.item2': 'Kasbga yo\'naltirish testi',
            'features.students.item3': 'Yetakchilar jadvali va reytinglar',
            'features.students.item4': 'Taraqqiyotni kuzatish',
            'features.teachers.title': 'O\'qituvchilar uchun',
            'features.teachers.item1': 'Testlar konstruktori (9 turdagi savollar)',
            'features.teachers.item2': 'Sinflar va o\'quvchilar bo\'yicha analitika',
            'features.teachers.item3': 'Natijalarni vizualizatsiya qilish',
            'features.teachers.item4': 'Ommaviy testlar tayinlash',
            'features.admins.title': 'Administratorlar uchun',
            'features.admins.item1': 'Foydalanuvchilar va sinflarni boshqarish',
            'features.admins.item2': 'Excel dan ma\'lumotlar import qilish',
            'features.admins.item3': 'Maktab bo\'yicha statistika',
            'features.admins.item4': 'Audit-loglar va xavfsizlik',
            'features.analytics.title': 'Analitika',
            'features.analytics.item1': 'Grafiklar va diagrammalar',
            'features.analytics.item2': 'Muvaffaqiyat heatmap',
            'features.analytics.item3': 'Avtomatik hisobotlar',
            'features.analytics.item4': 'Excel ga eksport',
            'stats.questionTypes': 'Savol turlari',
            'stats.roles': 'Foydalanuvchi rollari',
            'stats.languages': 'Interfeys tillari',
            'stats.available': 'Mavjudlik',
            'cta.title': 'Boshlashga tayyormisiz?',
            'cta.description': 'Zamonaviy ta\'lim platformasiga qo\'shiling',
            'cta.button': 'Tizimga kirish',
            'footer.description': 'O\'zbekiston uchun ta\'lim platformasi',
            'footer.product': 'Mahsulot',
            'footer.features': 'Imkoniyatlar',
            'footer.login': 'Kirish',
            'footer.support': 'Qo\'llab-quvvatlash',
            'footer.rights': 'Barcha huquqlar himoyalangan',
            // Login page
            'login.welcome': 'Xush kelibsiz',
            'login.subtitle': 'O\'zbekiston maktablari uchun zamonaviy ta\'lim platformasi',
            'login.feature1': 'Xavfsiz autentifikatsiya',
            'login.feature2': 'Barcha rollar uchun kirish',
            'login.feature3': '24/7 Qo\'llab-quvvatlash',
            'login.title': 'Tizimga kirish',
            'login.username': 'Login',
            'login.usernamePlaceholder': 'Login kiriting',
            'login.password': 'Parol',
            'login.passwordPlaceholder': 'Parol kiriting',
            'login.remember': 'Eslab qolish',
            'login.submit': 'Kirish',
            'login.backHome': '← Bosh sahifaga qaytish',
            'login.error.empty': 'Iltimos, barcha maydonlarni to\'ldiring',
            'login.error.usernameShort': 'Login kamida 3 ta belgidan iborat bo\'lishi kerak',
            'login.error.passwordShort': 'Parol kamida 6 ta belgidan iborat bo\'lishi kerak',
            'login.error.failed': 'Login yoki parol noto\'g\'ri',
            'login.error.network': 'Tarmoq xatosi. Keyinroq urinib ko\'ring'
        }
    };

    // Export translations for use in other scripts
    window.translations = translations;

    // Get current language
    function getCurrentLang() {
        return localStorage.getItem(LANG_KEY) || DEFAULT_LANG;
    }

    // Set language
    function setLang(lang) {
        if (!translations[lang]) {
            console.warn(`Language '${lang}' not found. Falling back to '${DEFAULT_LANG}'`);
            lang = DEFAULT_LANG;
        }

        localStorage.setItem(LANG_KEY, lang);
        document.documentElement.lang = lang;
        translatePage(lang);
        updateLangButtons(lang);
    }

    // Translate page
    function translatePage(lang) {
        // Translate text content
        const elements = document.querySelectorAll('[data-i18n]');
        elements.forEach(element => {
            const key = element.getAttribute('data-i18n');
            const translation = translations[lang][key];
            if (translation) {
                element.textContent = translation;
            }
        });

        // Translate placeholders
        const placeholderElements = document.querySelectorAll('[data-i18n-placeholder]');
        placeholderElements.forEach(element => {
            const key = element.getAttribute('data-i18n-placeholder');
            const translation = translations[lang][key];
            if (translation) {
                element.placeholder = translation;
            }
        });
    }

    // Update language buttons
    function updateLangButtons(lang) {
        const langButtons = document.querySelectorAll('.lang-btn');
        langButtons.forEach(btn => {
            const btnLang = btn.getAttribute('data-lang');
            if (btnLang === lang) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    // Initialize i18n
    function initI18n() {
        const currentLang = getCurrentLang();
        setLang(currentLang);

        // Add event listeners to language buttons
        const langButtons = document.querySelectorAll('.lang-btn');
        langButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const lang = btn.getAttribute('data-lang');
                setLang(lang);
            });
        });
    }

    // Run on DOM load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initI18n);
    } else {
        initI18n();
    }

    // Export for use in other scripts
    window.ZedlyI18n = {
        setLang,
        getCurrentLang,
        translate: (key, lang) => {
            lang = lang || getCurrentLang();
            return translations[lang][key] || key;
        }
    };
})();
