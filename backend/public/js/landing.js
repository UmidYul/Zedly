(function () {
  'use strict';

  const landingMetricValues = document.querySelectorAll('.landing-metric strong');
  const landingFeedbackForm = document.getElementById('landingFeedbackForm');
  const landingFeedbackStatus = document.getElementById('landingFeedbackStatus');

  let landingStats = null;
  let landingMetricDisplay = {
    total_users: 0,
    total_schools: 0,
    total_classes: 0
  };
  let landingAnimationFrameId = null;

  function getLang() {
    if (window.ZedlyI18n && typeof window.ZedlyI18n.getCurrentLang === 'function') {
      return window.ZedlyI18n.getCurrentLang();
    }
    return localStorage.getItem('zedly-lang') || document.documentElement.lang || 'ru';
  }

  function t(key, fallback) {
    if (window.ZedlyI18n && typeof window.ZedlyI18n.translate === 'function') {
      return window.ZedlyI18n.translate(key);
    }
    return fallback || key;
  }

  function formatCount(value) {
    const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
    if (safe >= 1000) {
      const thousands = Math.floor(safe / 1000);
      return `${thousands}K+`;
    }
    const locale = getLang() === 'uz' ? 'uz-UZ' : 'ru-RU';
    return safe.toLocaleString(locale);
  }

  function setLandingMetricTexts(values) {
    if (!landingMetricValues || landingMetricValues.length < 3 || !values) return;
    landingMetricValues[0].textContent = formatCount(values.total_users);
    landingMetricValues[1].textContent = formatCount(values.total_schools);
    landingMetricValues[2].textContent = formatCount(values.total_classes);
  }

function animateLandingMetrics(nextValues, durationMs = 900) {
  if (!nextValues) return;

  if (landingAnimationFrameId) {
    cancelAnimationFrame(landingAnimationFrameId);
    landingAnimationFrameId = null;
  }

  const startValues = { ...landingMetricDisplay };
  const targetValues = {
    total_users: Number(nextValues.total_users || 0),
    total_schools: Number(nextValues.total_schools || 0),
    total_classes: Number(nextValues.total_classes || 0)
  };
  const startTime = performance.now();
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  const tick = (time) => {
    const progress = Math.min(1, (time - startTime) / durationMs);
    const eased = easeOutCubic(progress);

    landingMetricDisplay = {
      total_users: Math.round(startValues.total_users + (targetValues.total_users - startValues.total_users) * eased),
      total_schools: Math.round(startValues.total_schools + (targetValues.total_schools - startValues.total_schools) * eased),
      total_classes: Math.round(startValues.total_classes + (targetValues.total_classes - startValues.total_classes) * eased)
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
  if (
    landingMetricDisplay.total_users === 0 &&
    landingMetricDisplay.total_schools === 0 &&
    landingMetricDisplay.total_classes === 0
  ) {
    setLandingMetricTexts(landingStats);
    return;
  }
  setLandingMetricTexts(landingMetricDisplay);
}

function initLandingFaqMotion() {
  const faqItems = document.querySelectorAll('.landing-faq-item');
  if (!faqItems.length) return;

  const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;

  const expand = (item, content) => {
    item.setAttribute('open', '');
    item.dataset.animating = 'true';

    content.style.overflow = 'hidden';
    content.style.height = '0px';
    content.style.opacity = '0';
    content.style.marginTop = '0px';
    content.style.transition = 'none';

    requestAnimationFrame(() => {
      const targetHeight = content.scrollHeight;
      content.style.transition = 'height 320ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease, margin-top 320ms cubic-bezier(0.22, 1, 0.36, 1)';
      content.style.height = `${targetHeight}px`;
      content.style.opacity = '1';
      content.style.marginTop = '10px';
    });

    const onDone = (event) => {
      if (event.propertyName !== 'height') return;
      content.style.height = 'auto';
      content.style.overflow = 'visible';
      content.style.transition = '';
      item.dataset.animating = 'false';
      content.removeEventListener('transitionend', onDone);
    };
    content.addEventListener('transitionend', onDone);
  };

  const collapse = (item, content) => {
    item.dataset.animating = 'true';

    const startHeight = content.offsetHeight;
    content.style.overflow = 'hidden';
    content.style.height = `${startHeight}px`;
    content.style.opacity = '1';
    content.style.marginTop = '10px';
    content.style.transition = 'none';

    requestAnimationFrame(() => {
      content.style.transition = 'height 280ms cubic-bezier(0.4, 0, 0.2, 1), opacity 180ms ease, margin-top 280ms cubic-bezier(0.4, 0, 0.2, 1)';
      content.style.height = '0px';
      content.style.opacity = '0';
      content.style.marginTop = '0px';
    });

    const onDone = (event) => {
      if (event.propertyName !== 'height') return;
      item.removeAttribute('open');
      content.style.transition = '';
      content.style.overflow = '';
      content.style.height = '';
      content.style.opacity = '';
      content.style.marginTop = '';
      item.dataset.animating = 'false';
      content.removeEventListener('transitionend', onDone);
    };
    content.addEventListener('transitionend', onDone);
  };

  faqItems.forEach((item) => {
    const summary = item.querySelector('summary');
    const content = item.querySelector('p');
    if (!summary || !content) return;

    item.dataset.animating = 'false';

    item.addEventListener('click', (event) => {
      if (event.target && event.target.closest('p')) return;

      event.preventDefault();
      if (item.dataset.animating === 'true') return;

      if (item.hasAttribute('open')) {
        collapse(item, content);
        return;
      }

      expand(item, content);
    });
  });
}

function initLandingFeatureCards() {
  const cards = document.querySelectorAll('.landing-card');
  if (!cards.length) return;

  const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const maxTilt = 6;

  cards.forEach((card) => {
    card.addEventListener('pointerenter', () => {
      card.classList.add('is-interactive');
    });

    card.addEventListener('pointermove', (event) => {
      const rect = card.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const px = (x / rect.width) * 100;
      const py = (y / rect.height) * 100;

      card.style.setProperty('--spot-x', `${px}%`);
      card.style.setProperty('--spot-y', `${py}%`);

      if (prefersReducedMotion) return;
      const tiltX = ((y / rect.height) - 0.5) * -maxTilt;
      const tiltY = ((x / rect.width) - 0.5) * maxTilt;
      card.style.transform = `perspective(900px) rotateX(${tiltX.toFixed(2)}deg) rotateY(${tiltY.toFixed(2)}deg) translateY(-3px)`;
    });

    card.addEventListener('pointerleave', () => {
      card.classList.remove('is-interactive');
      card.style.transform = '';
    });

    card.addEventListener('focus', () => {
      card.classList.add('is-interactive');
    });

    card.addEventListener('blur', () => {
      card.classList.remove('is-interactive');
      card.style.transform = '';
    });

    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        card.classList.toggle('is-interactive');
      }
    });
  });
}

if (landingFeedbackForm) {
  landingFeedbackForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = String(document.getElementById('feedbackName')?.value || '').trim();
    const email = String(document.getElementById('feedbackEmail')?.value || '').trim();
    const message = String(document.getElementById('feedbackMessage')?.value || '').trim();
    const lang = getLang();

    if (landingFeedbackStatus) landingFeedbackStatus.textContent = t('feedbackSending', 'Отправка...');

    try {
      const response = await fetch('/api/public/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          message,
          lang
        })
      });

      if (!response.ok) {
        throw new Error('feedback_failed');
      }

      if (landingFeedbackStatus) landingFeedbackStatus.textContent = t('feedbackSuccess');
      landingFeedbackForm.reset();
    } catch (_) {
      if (landingFeedbackStatus) landingFeedbackStatus.textContent = t('feedbackError');
    }
  });
}

async function loadLandingStats() {
  try {
    const response = await fetch('/api/public/landing-stats', { method: 'GET' });
    if (!response.ok) return;
    const data = await response.json();
    if (!data || !data.stats) return;
    landingStats = {
      total_users: Number(data.stats.total_users || 0),
      total_schools: Number(data.stats.total_schools || 0),
      total_classes: Number(data.stats.total_classes || 0)
    };
    animateLandingMetrics(landingStats);
  } catch (_) {
    // Keep static fallback values from HTML if API is unavailable.
  }
}

loadLandingStats();
initLandingFaqMotion();
initLandingFeatureCards();

window.addEventListener('zedly:lang-changed', () => {
  renderLandingMetrics();
});
})();
