(function () {
  'use strict';

  let deferredInstallPrompt = null;

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
      await navigator.serviceWorker.register('/service-worker.js', { scope: '/' });
    } catch (error) {
      console.error('SW register failed:', error);
    }
  }

  function bindInstallButton() {
    const installBtn = document.getElementById('installAppBtn');
    if (!installBtn) return;

    installBtn.addEventListener('click', async () => {
      if (!deferredInstallPrompt) {
        if (window.ZedlyDialog?.alert) {
          await window.ZedlyDialog.alert('Установка доступна в поддерживаемом браузере и только после нескольких посещений сайта.', { title: 'Установка приложения' });
        }
        return;
      }

      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      if (choice.outcome !== 'accepted') {
        console.log('PWA install dismissed');
      }
      deferredInstallPrompt = null;
      installBtn.style.display = 'none';
    });
  }

  function bindPushPermissionButton() {
    const pushBtn = document.getElementById('enablePushBtn');
    if (!pushBtn) return;

    pushBtn.addEventListener('click', async () => {
      if (!('Notification' in window)) return;
      try {
        const perm = await Notification.requestPermission();
        if (perm === 'granted' && navigator.serviceWorker?.controller) {
          navigator.serviceWorker.controller.postMessage({ type: 'push-permission-granted' });
        }
      } catch (error) {
        console.error('Push permission error:', error);
      }
    });
  }

  function wireInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      const installBtn = document.getElementById('installAppBtn');
      if (installBtn) installBtn.style.display = 'inline-flex';
    });

    window.addEventListener('appinstalled', () => {
      deferredInstallPrompt = null;
      const installBtn = document.getElementById('installAppBtn');
      if (installBtn) installBtn.style.display = 'none';
    });
  }

  function init() {
    registerServiceWorker();
    wireInstallPrompt();
    bindInstallButton();
    bindPushPermissionButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
