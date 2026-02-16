const landingTranslations = {
  ru: {
    title: 'ZEDLY — Платформа обучения',
    pill: 'Новая образовательная платформа',
    heroTitle: 'Обучение, которое растёт вместе с вами',
    heroBodyLine1: 'ZEDLY — это единая среда для учеников, учителей и администраторов.',
    heroBodyLine2: 'Тесты, аналитика и управление учебным процессом в одном месте.',
    ctaPrimary: 'Начать сейчас',
    ctaSecondary: 'Подробнее',
    metric1Title: 'Средний балл',
    metric1Note: 'по завершённым попыткам',
    metric2Title: 'Активные классы',
    metric2Note: 'в системе',
    metric3Title: 'Тесты',
    metric3Note: 'всего в платформе',
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
    metric1Title: "O'rtacha ball",
    metric1Note: "yakunlangan urinishlar bo'yicha",
    metric2Title: 'Faol sinflar',
    metric2Note: 'tizimda',
    metric3Title: 'Testlar',
    metric3Note: 'platformadagi jami',
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
const landingMetricValues = document.querySelectorAll('.landing-metric strong');
let landingStats = null;
let currentLandingLang = 'ru';
let landingMetricDisplay = {
  average_score: 0,
  active_classes: 0,
  tests_total: 0
};
let landingAnimationFrameId = null;

function formatCount(value, lang) {
  const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
  const locale = lang === 'uz' ? 'uz-UZ' : 'ru-RU';
  return safe.toLocaleString(locale);
}

function formatPercent(value) {
  const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
  const rounded = Math.round(safe * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text}%`;
}

function setLandingMetricTexts(values) {
  if (!landingMetricValues || landingMetricValues.length < 3 || !values) return;
  landingMetricValues[0].textContent = formatPercent(values.average_score);
  landingMetricValues[1].textContent = formatCount(values.active_classes, currentLandingLang);
  landingMetricValues[2].textContent = formatCount(values.tests_total, currentLandingLang);
}

function animateLandingMetrics(nextValues, durationMs = 900) {
  if (!nextValues) return;

  if (landingAnimationFrameId) {
    cancelAnimationFrame(landingAnimationFrameId);
    landingAnimationFrameId = null;
  }

  const startValues = { ...landingMetricDisplay };
  const targetValues = {
    average_score: Number(nextValues.average_score || 0),
    active_classes: Number(nextValues.active_classes || 0),
    tests_total: Number(nextValues.tests_total || 0)
  };
  const startTime = performance.now();
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  const tick = (time) => {
    const progress = Math.min(1, (time - startTime) / durationMs);
    const eased = easeOutCubic(progress);

    landingMetricDisplay = {
      average_score: startValues.average_score + (targetValues.average_score - startValues.average_score) * eased,
      active_classes: Math.round(startValues.active_classes + (targetValues.active_classes - startValues.active_classes) * eased),
      tests_total: Math.round(startValues.tests_total + (targetValues.tests_total - startValues.tests_total) * eased)
    };

    setLandingMetricTexts(landingMetricDisplay);

    if (progress < 1) {
      landingAnimationFrameId = requestAnimationFrame(tick);
      return;
    }

    landingMetricDisplay = { ...targetValues };
    setLandingMetricTexts(landingMetricDisplay);
    landingAnimationFrameId = null;
  };

  landingAnimationFrameId = requestAnimationFrame(tick);
}

function renderLandingMetrics() {
  if (!landingStats) return;
  if (landingMetricDisplay.average_score === 0 &&
      landingMetricDisplay.active_classes === 0 &&
      landingMetricDisplay.tests_total === 0) {
    setLandingMetricTexts(landingStats);
    return;
  }
  setLandingMetricTexts(landingMetricDisplay);
}

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
  currentLandingLang = lang;
  renderLandingMetrics();
  localStorage.setItem('landing-lang', lang);
};

const savedLandingLang = localStorage.getItem('landing-lang') || 'ru';
applyLandingLang(savedLandingLang);

landingLangBtn.addEventListener('click', () => {
  const nextLang = landingLangBtn.textContent.toLowerCase() === 'ru' ? 'uz' : 'ru';
  applyLandingLang(nextLang);
});

async function loadLandingStats() {
  try {
    const response = await fetch('/api/public/landing-stats', { method: 'GET' });
    if (!response.ok) return;
    const data = await response.json();
    if (!data || !data.stats) return;
    landingStats = {
      average_score: Number(data.stats.average_score || 0),
      active_classes: Number(data.stats.active_classes || 0),
      tests_total: Number(data.stats.tests_total || 0)
    };
    animateLandingMetrics(landingStats);
  } catch (_) {
    // Keep static fallback values from HTML if API is unavailable.
  }
}

loadLandingStats();
