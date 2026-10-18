/* Sultan Database offline-first service worker.
   First open the app while online; then its shell and Firebase SDK are cached.
   Cloud sync / Google Drive still require internet. */
const CACHE_NAME = 'sultan-offline-v12';
const APP_FILES = [
  './',
  './index.html',
  './manifest.json',
  './sultan-icon-180.png',
  './sultan-icon-192.png',
  './sultan-icon-512.png',
  './sultan-icon-maskable-512.png'
];
const FIREBASE_SDK = [
  'https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore-compat.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // App shell must cache successfully; optional files should not block install.
    await cache.addAll(['./', './index.html', './manifest.json']);
    await Promise.all(APP_FILES.filter(x => !['./','./index.html','./manifest.json'].includes(x)).map(async path => {
      try { await cache.add(path); } catch (_) {}
    }));
    // Cache Firebase SDKs on best effort, so the app can initialize offline after first online use.
    const sdkCache = await caches.open(CACHE_NAME + '-sdk');
    await Promise.all(FIREBASE_SDK.map(async url => {
      try {
        const req = new Request(url, {mode:'cors', credentials:'omit', cache:'reload'});
        const res = await fetch(req);
        if (res && res.ok && (res.type === 'cors' || res.type === 'basic')) await sdkCache.put(req, res);
      } catch (_) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => ![CACHE_NAME, CACHE_NAME + '-sdk'].includes(k)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isFirebaseSdk = FIREBASE_SDK.includes(url.href);
  if (isFirebaseSdk) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME + '-sdk');
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const response = await fetch(req);
        if (response && response.ok) await cache.put(req, response.clone());
        return response;
      } catch (_) {
        return new Response('Firebase SDK not available offline. Open this app online once to cache it.', {status:503, headers:{'Content-Type':'text/plain; charset=utf-8'}});
      }
    })());
    return;
  }
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req) || await cache.match('./index.html');
    if (!navigator.onLine) return cached || new Response('برنامه هنوز آفلاین آماده نشده؛ یک‌بار با اینترنت بازش کنید.', {status:503, headers:{'Content-Type':'text/plain; charset=utf-8'}});
    try {
      const response = await fetch(req);
      if (response && response.ok) cache.put(req, response.clone()).catch(()=>{});
      return response;
    } catch (_) {
      return cached || new Response('برنامه آفلاین در دسترس نیست؛ یک‌بار با اینترنت بازش کنید.', {status:503, headers:{'Content-Type':'text/plain; charset=utf-8'}});
    }
  })());
});
