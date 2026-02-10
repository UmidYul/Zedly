const landingTranslations = {
  ru: {
    title: 'ZEDLY — Платформа обучения',
    pill: 'Новая образовательная платформа',
    heroTitle: 'Обучение, которое растёт вместе с вами',
    heroBodyLine1: 'ZEDLY — это единая среда для учеников, учителей и администраторов.',
    heroBodyLine2: 'Тесты, аналитика и управление учебным процессом в одном месте.',
    ctaPrimary: 'Начать сейчас',
    ctaSecondary: 'Подробнее',
    metric1Title: 'Успеваемость',
    metric1Note: 'рост за семестр',
    metric2Title: 'Активные классы',
    metric2Note: 'в одной системе',
    metric3Title: 'Тесты',
    metric3Note: 'создано учителями',
    featuresTitle: 'Почему ZEDLY',
    feature1Title: 'Аналитика в реальном времени',
    feature1Body: 'Отслеживайте прогресс, вовлечённость и результаты по каждому классу.',
    feature2Title: 'Модули и контрольные',
    feature2Body: 'Готовые и настраиваемые модули для предметов и контрольных работ.',
    feature3Title: 'Единая экосистема',
    feature3Body: 'Ученики, учителя и администраторы работают в одном пространстве.',
    highlightTitle: 'Готовы начать?',
    highlightBody: 'Войдите в систему и начните использовать ZEDLY прямо сейчас.',
    highlightCta: 'Войти в систему',
    footer: '© 2026 ZEDLY. Все права защищены.',
    footerLink: 'Перейти к входу',
    loginLink: 'Вход'
  },
  uz: {
    title: "ZEDLY — Ta'lim platformasi",
    pill: "Yangi ta'lim platformasi",
    heroTitle: "Ta'lim siz bilan birga o'sadi",
    heroBodyLine1: "ZEDLY — o'quvchilar, o'qituvchilar va administratorlar uchun yagona muhit.",
    heroBodyLine2: "Testlar, analitika va ta'lim jarayonini boshqarish bir joyda.",
    ctaPrimary: 'Boshlash',
    ctaSecondary: 'Batafsil',
    metric1Title: 'Natijadorlik',
    metric1Note: "semestr bo'yicha o'sish",
    metric2Title: 'Faol sinflar',
    metric2Note: 'bitta tizimda',
    metric3Title: 'Testlar',
    metric3Note: "o'qituvchilar yaratgan",
    featuresTitle: 'Nega ZEDLY',
    feature1Title: 'Real vaqt analitikasi',
    feature1Body: "Har bir sinf bo'yicha progress va natijalarni kuzating.",
    feature2Title: 'Modullar va nazoratlar',
    feature2Body: 'Fanlar va nazoratlar uchun tayyor va moslanuvchi modullar.',
    feature3Title: 'Yagona ekotizim',
    feature3Body: "O'quvchi, o'qituvchi va administrator bir makonda ishlaydi.",
    highlightTitle: 'Boshlashga tayyormisiz?',
    highlightBody: 'Tizimga kiring va ZEDLY dan foydalanishni boshlang.',
    highlightCta: 'Tizimga kirish',
    footer: '© 2026 ZEDLY. Barcha huquqlar himoyalangan.',
    footerLink: "Kirish sahifasiga o'tish",
    loginLink: 'Kirish'
  }
};

const landingLangBtn = document.getElementById('landingLangBtn');
const landingLoginLink = document.querySelector('.landing-actions .landing-link');

const applyLandingLang = (lang) => {
  const dict = landingTranslations[lang];
  if (!dict) return;
  document.title = dict.title;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (dict[key]) el.textContent = dict[key];
  });
  if (landingLoginLink) landingLoginLink.textContent = dict.loginLink;
  landingLangBtn.textContent = lang.toUpperCase();
  localStorage.setItem('landing-lang', lang);
};

const savedLandingLang = localStorage.getItem('landing-lang') || 'ru';
applyLandingLang(savedLandingLang);

landingLangBtn.addEventListener('click', () => {
  const nextLang = landingLangBtn.textContent.toLowerCase() === 'ru' ? 'uz' : 'ru';
  applyLandingLang(nextLang);
});
