// Service worker : cache-first sur tous les fichiers statiques.
// Changer VERSION à chaque mise à jour des fichiers pour forcer le rafraîchissement.
const VERSION = 'calories-v2';
const FILES = [
  './', 'index.html', 'style.css', 'app.js', 'scan.js',
  'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
  'vendor/barcode-detector.js', 'vendor/zxing_reader.wasm', // lib de scan + binaire wasm
];

// Installation : pré-cache de tous les fichiers
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

// Activation : suppression des anciens caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Requêtes : cache d'abord, réseau sinon.
// Les requêtes externes (API Open Food Facts) passent directement au réseau.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request))
  );
});
