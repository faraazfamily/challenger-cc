// The Challengers service worker: makes the site installable and lets it open offline.
//   - Pages: network first, falling back to the saved app shell when offline.
//   - /assets (hashed JS/CSS), icons, fonts: served from cache, refreshed in the background.
//   - Player photos: cached, capped so the phone's storage does not grow forever.
//   - The API is never cached here: the app keeps its own copy of public data in localStorage,
//     and admin answers must never sit in a cache. Video is skipped (it needs Range requests).
const VERSION = 'v1';
const SHELL = `cc-shell-${VERSION}`;
const STATIC = `cc-static-${VERSION}`;
const PHOTOS = `cc-photos-${VERSION}`;
const MAX_PHOTOS = 60;
const MAX_STATIC = 80;

// Save the app itself while installing. On the very first visit the page has already loaded its
// JS and CSS before this worker takes over, so nothing would pass through the fetch handler below
// and the app could not start offline. The names of those files are read from index.html.
async function saveApp() {
  await (await caches.open(SHELL)).addAll(['/crest.webp', '/crest-sm.webp', '/icon-192.png', '/manifest.json']);
  const res = await fetch('/', { cache: 'no-cache' });
  const html = await res.clone().text();
  const assets = [...new Set(html.match(/\/assets\/[^"'\s]+/g) || [])];
  await (await caches.open(STATIC)).addAll(assets);
  await (await caches.open(SHELL)).put('/', res);
}

self.addEventListener('install', (event) => {
  event.waitUntil(saveApp().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL, STATIC, PHOTOS].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  // any of our caches (the install step saved some files too); ignoreVary because a <script crossorigin>
  // and the install step ask for the same file with different headers
  const hit = await caches.match(request, { ignoreVary: true });
  const refresh = fetch(request).then((res) => {
    if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
    return res;
  }).catch(() => hit || Response.error());
  return hit || refresh;
}

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - max)).map((k) => cache.delete(k)));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(request);
        // keep the latest app shell for offline starts (every route is the same index.html)
        if (res.ok) (await caches.open(SHELL)).put('/', res.clone());
        return res;
      } catch {
        return (await caches.match('/', { ignoreVary: true })) || Response.error();
      }
    })());
    return;
  }

  if (url.pathname.startsWith('/api/')) return;

  if (url.pathname.startsWith('/uploads/')) {
    if (request.destination !== 'image') return;
    event.respondWith(staleWhileRevalidate(request, PHOTOS).finally(() => trim(PHOTOS, MAX_PHOTOS)));
    return;
  }

  const sameOrigin = url.origin === self.location.origin;
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (sameOrigin || fonts) {
    event.respondWith(staleWhileRevalidate(request, STATIC));
    event.waitUntil(trim(STATIC, MAX_STATIC)); // every deploy adds new hashed files; old ones go
  }
});
