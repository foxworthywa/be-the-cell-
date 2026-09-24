// Be the Cell service worker (LAB_UI §9.3). The build stamps the cache name.
// Cache-first for the versioned shell; every URL is relative, because GitHub
// Pages serves the app under /be-the-cell-/. The app makes no other requests.
const CACHE = 'btc-__BUILD_HASH__';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icons/icon.svg',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon-180.png'];

self.addEventListener('install', (e) => e.waitUntil(
  caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))));

self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('btc-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim())));

self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  if (r.mode === 'navigate') {
    // Only the app's own page comes from the cache; other pages (tools/codes.html) go to the network.
    const scope = new URL(self.registration.scope).pathname, path = new URL(r.url).pathname;
    if (path !== scope && path !== scope + 'index.html') return;
    e.respondWith(caches.match('./index.html').then((hit) => hit || fetch(r)));
    return;
  }
  e.respondWith(caches.match(r, { ignoreSearch: true }).then((hit) => hit || fetch(r)));
});

// The page asks for this only after the student taps Reload on the update banner.
self.addEventListener('message', (e) => { if (e.data === 'skip-waiting') self.skipWaiting(); });
