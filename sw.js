// joetay.com service worker — minimal offline support.
// Bump CACHE_NAME when the precache list materially changes.
const CACHE_NAME = 'joetay-static-v1';

// Tiny precache — only the resources a visitor needs to see SOMETHING useful
// when their connection drops. Bigger pages still load over the network, just
// fall back to the cached homepage if completely offline.
const PRECACHE = [
  '/',
  '/index.html',
  '/valuation.html',
  '/404.html',
  '/apple-touch-icon.png',
  '/site.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Only intercept same-origin GETs — everything else (POST to submit-lead,
  // gtag/Meta/Calendly third-party scripts, image CDN) passes through.
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Network-first with cache fallback. Stay-fresh-when-online; degrade
  // gracefully when offline.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Successful navigation — opportunistically update cache for offline reuse.
        if (response && response.ok && event.request.mode === 'navigate') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/index.html')))
  );
});
