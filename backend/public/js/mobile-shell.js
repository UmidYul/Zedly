(function () {
  'use strict';

  function initContentTransitions() {
    document.body.classList.add('page-enter');
    requestAnimationFrame(() => document.body.classList.add('page-enter-active'));

    document.addEventListener('click', (event) => {
      const link = event.target.closest('a[href]');
      if (!link) return;
      const href = link.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
      if (link.target === '_blank' || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (!href.startsWith('/')) return;

      event.preventDefault();
      document.body.classList.add('page-leave-active');
      setTimeout(() => {
        window.location.href = href;
      }, 170);
    });

    const container = document.getElementById('dashboardContent');
    if (container) {
      const observer = new MutationObserver(() => {
        container.classList.remove('content-fade-in');
        void container.offsetWidth;
        container.classList.add('content-fade-in');
      });
      observer.observe(container, { childList: true, subtree: false });
    }
  }

  function initPwaButtons() {
    const actions = document.querySelector('.header-actions');
    if (!actions) return;

    if (!document.getElementById('installAppBtn')) {
      const installBtn = document.createElement('button');
      installBtn.id = 'installAppBtn';
      installBtn.className = 'icon-btn pwa-action-btn';
      installBtn.style.display = 'none';
      installBtn.title = 'Install app';
      installBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 21h16"/></svg>';
      actions.prepend(installBtn);
    }

    if (!document.getElementById('enablePushBtn')) {
      const pushBtn = document.createElement('button');
      pushBtn.id = 'enablePushBtn';
      pushBtn.className = 'icon-btn pwa-action-btn';
      pushBtn.title = 'Enable push notifications';
      pushBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';
      actions.prepend(pushBtn);
    }
  }

  function init() {
    document.body.classList.add('mobile-shell-enabled');
    const oldBottomNav = document.getElementById('mobileBottomNav');
    if (oldBottomNav) oldBottomNav.remove();
    initContentTransitions();
    initPwaButtons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
