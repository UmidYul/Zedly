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
            'login.error.network': 'Ошибка сети. Попробуйте позже',
            // Dashboard
            'dashboard.title': 'Dashboard',
            'dashboard.logout': 'Выйти',
            'dashboard.profile': 'Профиль',
            'dashboard.settings': 'Настройки',
            'dashboard.nav.main': 'Основное',
            'dashboard.nav.analytics': 'Аналитика',
            'dashboard.nav.system': 'Система',
            'dashboard.nav.tools': 'Инструменты',
            'dashboard.nav.learning': 'Обучение',
            'dashboard.nav.resources': 'Ресурсы',
            'dashboard.nav.overview': 'Обзор',
            'dashboard.nav.schools': 'Школы',
            'dashboard.nav.users': 'Пользователи',
            'dashboard.nav.classes': 'Классы',
            'dashboard.nav.subjects': 'Предметы',
            'dashboard.nav.tests': 'Тесты',
            'dashboard.nav.myTests': 'Мои тесты',
            'dashboard.nav.statistics': 'Статистика',
            'dashboard.nav.reports': 'Отчеты',
            'dashboard.nav.settings': 'Настройки',
            'dashboard.nav.audit': 'Аудит',
            'dashboard.nav.import': 'Импорт',
            'dashboard.nav.export': 'Экспорт',
            'dashboard.nav.results': 'Результаты',
            'dashboard.nav.students': 'Ученики',
            'dashboard.nav.library': 'Библиотека',
            'dashboard.nav.calendar': 'Календарь',
            'dashboard.nav.progress': 'Прогресс',
            'dashboard.nav.career': 'Профориентация',
            'dashboard.nav.leaderboard': 'Рейтинг',
            'School Admins': 'Администраторы школ',
            'School Comparison': 'Сравнение школ',
            // Notifications
            'notifications.title': 'Уведомления',
            'notifications.markAllRead': 'Отметить все прочитанными',
            'notifications.markRead': 'Отметить прочитанным',
            'notifications.empty': 'Нет уведомлений',
            'notifications.viewAll': 'Посмотреть все',
            'notifications.passwordReset': 'Пароль сброшен',
            'notifications.passwordResetFor': 'Пароль сброшен для {name}',
            'time.justNow': 'Только что',
            'time.minutesAgo': 'мин. назад',
            'time.hoursAgo': 'ч. назад',
            'time.daysAgo': 'дн. назад',
            // User Management
            'users.title': 'Управление пользователями',
            'users.addUser': 'Добавить пользователя',
            'users.search': 'Поиск пользователей...',
            'users.role': 'Роль',
            'users.school': 'Школа',
            'users.allRoles': 'Все роли',
            'users.allSchools': 'Все школы',
            'users.name': 'Имя',
            'users.email': 'Email',
            'users.phone': 'Телефон',
            'users.status': 'Статус',
            'users.actions': 'Действия',
            'users.active': 'Активный',
            'users.inactive': 'Неактивный',
            'users.resetPassword': 'Сбросить пароль',
            'users.edit': 'Редактировать',
            'users.delete': 'Удалить',
            'users.viewProfile': 'Профиль',
            'users.tempPassword': 'Временный пароль',
            'users.passwordReset': 'Пароль сброшен',
            'users.passwordResetSuccess': 'Временный пароль был отправлен пользователю',
            'users.confirmReset': 'Вы уверены, что хотите сбросить пароль для этого пользователя?',
            'users.confirmResetPassword': 'Вы уверены, что хотите сбросить пароль для {name}?',
            'users.tempPasswordFor': 'Временный пароль для {name}:',
            'users.copyPassword': 'Копировать пароль',
            'users.userMustChangePassword': '⚠️ Пользователь должен сменить этот пароль при первом входе',
            'users.passwordCopied': 'Пароль скопирован в буфер обмена',
            'users.resetPasswordFailed': 'Не удалось сбросить пароль',
            'users.fullName': 'ФИО',
            'users.login': 'Логин',
            'users.generated': 'Сгенерирован',
            'users.cancel': 'Отмена',
            'users.save': 'Сохранить',
            'users.close': 'Закрыть',
            // Change Password
            'changePassword.title': 'Смена пароля',
            'changePassword.subtitle': 'Создайте новый надежный пароль',
            'changePassword.warning': 'Вы используете временный пароль. Пожалуйста, создайте новый постоянный пароль для продолжения работы в системе.',
            'changePassword.oldPassword': 'Текущий пароль',
            'changePassword.oldPasswordPlaceholder': 'Введите временный пароль',
            'changePassword.newPassword': 'Новый пароль',
            'changePassword.newPasswordPlaceholder': 'Введите новый пароль',
            'changePassword.confirmPassword': 'Подтверждение пароля',
            'changePassword.confirmPasswordPlaceholder': 'Повторите новый пароль',
            'changePassword.requirements': 'Требования к паролю:',
            'changePassword.reqLength': 'Минимум 8 символов',
            'changePassword.reqUppercase': 'Хотя бы одна заглавная буква (A-Z)',
            'changePassword.reqLowercase': 'Хотя бы одна строчная буква (a-z)',
            'changePassword.reqNumber': 'Хотя бы одна цифра (0-9)',
            'changePassword.reqMatch': 'Пароли совпадают',
            'changePassword.submit': 'Изменить пароль',
            'changePassword.submitting': 'Изменение...',
            'changePassword.success': 'Пароль успешно изменен! Перенаправление...',
            'changePassword.error.allReqs': 'Пожалуйста, убедитесь, что все требования выполнены',
            'changePassword.error.mismatch': 'Пароли не совпадают',
            'changePassword.error.failed': 'Не удалось изменить пароль',
            'changePassword.error.network': 'Произошла ошибка. Пожалуйста, попробуйте снова.',
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
            'login.error.network': 'Tarmoq xatosi. Keyinroq urinib ko\'ring',
            // Dashboard
            'dashboard.title': 'Dashboard',
            'dashboard.logout': 'Chiqish',
            'dashboard.profile': 'Profil',
            'dashboard.settings': 'Sozlamalar',
            'dashboard.nav.main': 'Asosiy',
            'dashboard.nav.analytics': 'Analitika',
            'dashboard.nav.system': 'Sistema',
            'dashboard.nav.tools': 'Vositalar',
            'dashboard.nav.learning': 'O\'qish',
            'dashboard.nav.resources': 'Resurslar',
            'dashboard.nav.overview': 'Umumiy ko\'rinish',
            'dashboard.nav.schools': 'Maktablar',
            'dashboard.nav.users': 'Foydalanuvchilar',
            'dashboard.nav.classes': 'Sinflar',
            'dashboard.nav.subjects': 'Fanlar',
            'dashboard.nav.tests': 'Testlar',
            'dashboard.nav.myTests': 'Mening testlarim',
            'dashboard.nav.statistics': 'Statistika',
            'dashboard.nav.reports': 'Hisobotlar',
            'dashboard.nav.settings': 'Sozlamalar',
            'dashboard.nav.audit': 'Audit',
            'dashboard.nav.import': 'Import',
            'dashboard.nav.export': 'Eksport',
            'dashboard.nav.results': 'Natijalar',
            'dashboard.nav.students': 'O\'quvchilar',
            'dashboard.nav.library': 'Kutubxona',
            'dashboard.nav.calendar': 'Taqvim',
            'dashboard.nav.progress': 'Taraqqiyot',
            'dashboard.nav.career': 'Kasbga yo\'naltirish',
            'dashboard.nav.leaderboard': 'Reyting',
            'School Admins': 'Maktab administratorlari',
            'School Comparison': 'Maktablarni solishtirish',
            // Notifications
            'notifications.title': 'Bildirishnomalar',
            'notifications.markAllRead': 'Hammasini o\'qilgan deb belgilash',
            'notifications.markRead': 'O\'qilgan deb belgilash',
            'notifications.empty': 'Bildirishnomalar yo\'q',
            'notifications.viewAll': 'Barchasini ko\'rish',
            'notifications.passwordReset': 'Parol tiklandi',
            'notifications.passwordResetFor': '{name} uchun parol tiklandi',
            'time.justNow': 'Hozirgina',
            'time.minutesAgo': 'daq. oldin',
            'time.hoursAgo': 's. oldin',
            'time.daysAgo': 'kun oldin',
            // User Management
            'users.title': 'Foydalanuvchilarni boshqarish',
            'users.addUser': 'Foydalanuvchi qo\'shish',
            'users.search': 'Foydalanuvchilarni qidirish...',
            'users.role': 'Rol',
            'users.school': 'Maktab',
            'users.allRoles': 'Barcha rollar',
            'users.allSchools': 'Barcha maktablar',
            'users.name': 'Ism',
            'users.email': 'Email',
            'users.phone': 'Telefon',
            'users.status': 'Holat',
            'users.actions': 'Amallar',
            'users.active': 'Faol',
            'users.inactive': 'Nofaol',
            'users.resetPassword': 'Parolni tiklash',
            'users.edit': 'Tahrirlash',
            'users.delete': 'O\'chirish',
            'users.viewProfile': 'Profil',
            'users.tempPassword': 'Vaqtinchalik parol',
            'users.passwordReset': 'Parol tiklandi',
            'users.passwordResetSuccess': 'Vaqtinchalik parol foydalanuvchiga yuborildi',
            'users.confirmReset': 'Ushbu foydalanuvchi uchun parolni tiklashni xohlaysizmi?',
            'users.confirmResetPassword': '{name} uchun parolni tiklashni xohlaysizmi?',
            'users.tempPasswordFor': '{name} uchun vaqtinchalik parol:',
            'users.copyPassword': 'Parolni nusxalash',
            'users.userMustChangePassword': '⚠️ Foydalanuvchi birinchi kirishda ushbu parolni o\'zgartirishi kerak',
            'users.passwordCopied': 'Parol nusxalandi',
            'users.resetPasswordFailed': 'Parolni tiklab bo\'lmadi',
            'users.fullName': 'F.I.Sh',
            'users.login': 'Login',
            'users.generated': 'Yaratildi',
            'users.cancel': 'Bekor qilish',
            'users.save': 'Saqlash',
            'users.close': 'Yopish',
            // Change Password
            'changePassword.title': 'Parolni o\'zgartirish',
            'changePassword.subtitle': 'Yangi ishonchli parol yarating',
            'changePassword.warning': 'Siz vaqtinchalik parol ishlatmoqdasiz. Iltimos, tizimda ishlashni davom ettirish uchun yangi doimiy parol yarating.',
            'changePassword.oldPassword': 'Joriy parol',
            'changePassword.oldPasswordPlaceholder': 'Vaqtinchalik parolni kiriting',
            'changePassword.newPassword': 'Yangi parol',
            'changePassword.newPasswordPlaceholder': 'Yangi parolni kiriting',
            'changePassword.confirmPassword': 'Parolni tasdiqlash',
            'changePassword.confirmPasswordPlaceholder': 'Yangi parolni qayta kiriting',
            'changePassword.requirements': 'Parol talablari:',
            'changePassword.reqLength': 'Kamida 8 ta belgi',
            'changePassword.reqUppercase': 'Kamida bitta bosh harf (A-Z)',
            'changePassword.reqLowercase': 'Kamida bitta kichik harf (a-z)',
            'changePassword.reqNumber': 'Kamida bitta raqam (0-9)',
            'changePassword.reqMatch': 'Parollar mos keladi',
            'changePassword.submit': 'Parolni o\'zgartirish',
            'changePassword.submitting': 'O\'zgartirilmoqda...',
            'changePassword.success': 'Parol muvaffaqiyatli o\'zgartirildi! Yo\'naltirilmoqda...',
            'changePassword.error.allReqs': 'Iltimos, barcha talablar bajarilganligiga ishonch hosil qiling',
            'changePassword.error.mismatch': 'Parollar mos kelmaydi',
            'changePassword.error.failed': 'Parolni o\'zgartirish amalga oshmadi',
            'changePassword.error.network': 'Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.',
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

        // Translate titles (tooltips)
        const titleElements = document.querySelectorAll('[data-i18n-title]');
        titleElements.forEach(element => {
            const key = element.getAttribute('data-i18n-title');
            const translation = translations[lang][key];
            if (translation) {
                element.title = translation;
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
