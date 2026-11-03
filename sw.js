// Service Worker: speichert die App-Dateien, damit sie auch ohne Netz laufen.
// Bei Änderungen an den Dateien CACHE hochzählen, sonst sieht man die alte Version.
const CACHE = 'fitness-tagebuch-v5';
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

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
});

// Nur eigene Dateien aus dem Zwischenspeicher. Anfragen an Open Food Facts und Google gehen direkt ins Netz.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
