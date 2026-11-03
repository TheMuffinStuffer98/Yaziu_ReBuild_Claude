// Service Worker: hält die App-Dateien für den Offline-Betrieb bereit.
// Online werden immer die neuesten Dateien geladen (Netz zuerst), der Zwischenspeicher dient nur als Ersatz.
// CACHE bei jeder Veröffentlichung hochzählen und APP_VERSION in js/app.js gleich setzen.
const CACHE = 'fitness-tagebuch-v9';
const FILES = [
  './',
  './index.html',
  './css/style.css',
  './icons/icon-192.png',
  './icons/apple-touch-icon.png',
  './js/store.js',
  './js/calc.js',
  './js/foods.js',
  './js/parse.js',
  './js/coach.js',
  './js/dishes.js',
  './js/scanner.js',
  './js/vision.js',
  './vendor/zxing.min.js',
  './js/app.js',
  './manifest.webmanifest',
];
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', (e) => {
  // cache: 'reload' umgeht den HTTP-Zwischenspeicher, sonst landen veraltete Dateien im neuen Cache
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(FILES.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Nur eigene Dateien. Anfragen an Open Food Facts und Google gehen direkt ins Netz.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;

  const fromNetwork = fetch(e.request, { cache: 'no-cache' }).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
    }
    return res;
  });
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Zeitüberschreitung')), NETWORK_TIMEOUT_MS));

  e.respondWith(
    Promise.race([fromNetwork, timeout])
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match('./index.html'))),
  );
});
