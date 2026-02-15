const CACHE_NAME = 'zedly-shell-v4';
const APP_SHELL = [
  '/',
  '/dashboard',
  '/css/main.css',
  '/css/dashboard.css',
  '/css/profile.css',
  '/js/i18n.js',
  '/js/theme.js',
  '/js/auth-interceptor.js',
  '/js/dashboard.js',
  '/js/profile.js',
  '/js/mobile-shell.js',
  '/js/pwa.js',
  '/images/zedly_logo_bg.png',
  '/images/pwa-icon-192.png',
  '/images/pwa-icon-512.png',
  '/manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isApi = url.pathname.startsWith('/api/');

  if (isApi) {
    event.respondWith(
      fetch(req).catch(() => new Response(JSON.stringify({
        error: 'offline',
        message: 'Offline mode: API unavailable'
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        fetch(req).then((res) => {
          if (res && res.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(req, res.clone()));
          }
        }).catch(() => {});
        return cached;
      }

      return fetch(req).then((res) => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return res;
      }).catch(() => caches.match('/dashboard'));
    })
  );
});
