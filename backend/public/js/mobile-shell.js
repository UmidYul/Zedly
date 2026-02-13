(function () {
  'use strict';

  const iconPathByPage = {
    overview: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"/>',
    profile: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    tests: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>',
    classes: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    subjects: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'
  };

  function getCurrentKey() {
    if (window.location.pathname.includes('profile.html')) return 'profile';
    const hash = (window.location.hash || '').replace('#', '').trim();
    return hash || 'overview';
  }

  function buildBottomNav() {
    const sidebarNav = document.getElementById('sidebarNav');
    if (!sidebarNav) return;

    let nav = document.getElementById('mobileBottomNav');
    if (!nav) {
      nav = document.createElement('nav');
      nav.id = 'mobileBottomNav';
      nav.className = 'mobile-bottom-nav';
      document.body.appendChild(nav);
    }

    const items = Array.from(sidebarNav.querySelectorAll('.nav-item'));
    if (!items.length) {
      nav.innerHTML = '';
      return;
    }

    const profileItem = items.find((item) => item.dataset.page === 'profile');
    const core = items.filter((item) => item.dataset.page !== 'profile').slice(0, 4);
    const selected = profileItem ? [core[0], core[1], profileItem, core[2], core[3]].filter(Boolean) : core;

    nav.innerHTML = selected.map((item) => {
      const page = item.dataset.page || 'overview';
      const label = (item.querySelector('span')?.textContent || page).trim();
      const href = item.getAttribute('href') || '#overview';
      const path = iconPathByPage[page] || iconPathByPage.overview;
      return `
        <a class="mobile-nav-item" data-page="${page}" href="${href}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${path}</svg>
          <span>${label}</span>
        </a>
      `;
    }).join('');

    syncBottomNavActive();
  }

  function syncBottomNavActive() {
    const current = getCurrentKey();
    document.querySelectorAll('#mobileBottomNav .mobile-nav-item').forEach((item) => {
      item.classList.toggle('active', item.dataset.page === current);
    });
  }

  function bindBottomNavClicks() {
    document.addEventListener('click', (event) => {
      const link = event.target.closest('#mobileBottomNav .mobile-nav-item');
      if (!link) return;

      const href = link.getAttribute('href') || '';
      if (href.startsWith('#')) {
        event.preventDefault();
        const target = document.querySelector(`#sidebarNav .nav-item[data-page="${link.dataset.page}"]`);
        if (target) target.click();
      }
    });
  }

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
    initContentTransitions();
    bindBottomNavClicks();
    initPwaButtons();

    const sidebarNav = document.getElementById('sidebarNav');
    if (sidebarNav) {
      const observer = new MutationObserver(() => {
        buildBottomNav();
      });
      observer.observe(sidebarNav, { childList: true, subtree: true });
    }

    window.addEventListener('hashchange', syncBottomNavActive);
    window.addEventListener('popstate', syncBottomNavActive);
    document.addEventListener('click', () => setTimeout(syncBottomNavActive, 0));

    setTimeout(buildBottomNav, 150);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
