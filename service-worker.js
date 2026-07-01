/* KahanDekhu service worker
 - Precaches the app shell so it installs & opens offline.
 - Navigation: network-first, falling back to the cached shell when offline.
 - API calls (your TMDB Worker) are always network — never cached here
 (the Worker already does its own edge caching).
 */
const CACHE = 'kahandekhu-v5';
const SHELL = [
    './',
    './index.html',
    './qrcode.min.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
    './icon-512-maskable.png',
    './screenshot-mobile.png',
    './screenshot-wide.png'
];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
                caches.keys().then((keys) =>
                                   Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
                                   ).then(() => self.clients.claim())
                );
});

self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (req.method !== 'GET') return;
    
    const url = new URL(req.url);
    
    // Never cache cross-origin API/image calls (TMDB Worker, TMDB image CDN, fonts CDN handle themselves)
    if (url.origin !== self.location.origin) return;
    
    // Navigations: network-first, fall back to cached shell offline.
    if (req.mode === 'navigate') {
        e.respondWith(
                      fetch(req).catch(() => caches.match('./index.html'))
                      );
        return;
    }
    
    // Same-origin static assets: cache-first.
    e.respondWith(
                  caches.match(req).then((hit) => hit || fetch(req).then((res) => {
                      const copy = res.clone();
                      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
                      return res;
                  }).catch(() => hit))
                  );
});

// --- Web push: show the "now streaming" notification ---
self.addEventListener('push', (e) => {
    let data = {};
    try { data = e.data ? e.data.json() : {}; } catch (_) { data = { title: 'KahanDekhu', body: (e.data && e.data.text()) || '' }; }
    const title = data.title || 'KahanDekhu';
    const options = {
        body: data.body || '',
        icon: './icon-192.png',
        badge: './icon-192.png',
        tag: data.tag || 'kahandekhu',
        data: { url: data.url || './index.html' }
    };
    e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (e) => {
    e.notification.close();
    const url = (e.notification.data && e.notification.data.url) || './index.html';
    e.waitUntil(
                clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
                    for (const c of cs) { if ('focus' in c) return c.focus(); }
                    return clients.openWindow(url);
                })
                );
});
