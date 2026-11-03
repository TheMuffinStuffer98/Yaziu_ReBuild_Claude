// Service Worker: speichert die App-Dateien, damit sie auch ohne Netz laufen.
// Bei Änderungen an den Dateien CACHE hochzählen, sonst sieht man die alte Version.
const CACHE = 'fitness-tagebuch-v2';
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

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
