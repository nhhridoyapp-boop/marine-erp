// SAN MARINE ERP service worker.
//  - Versioned app files (/assets/<name>-<hash>.js|css: a changed file always gets a new name) are served cache-first: instant start, works on slow networks.
//  - The home page / other app files are network-first (revalidated, 5 s limit): a new release is picked up as soon as the network answers;
//    the cached copy is used only when offline or very slow, so nobody is stuck on an old version.
//  - Data/API requests are NEVER intercepted or cached: production data is always read live from the server and can never be served stale.
//  - Login (browser storage) is never touched by this file.
const CACHE = 'sanmarine-shell-v4';
const NET_TIMEOUT_MS = 5000;
const MAX_ENTRIES = 160;
const HASHED = /^\/assets\/.+-[A-Za-z0-9_-]{6,}\.(?:js|css|woff2?)$/;

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(['/', '/icon.svg', '/manifest.webmanifest', '/pwa-192x192.png', '/pwa-512x512.png', '/pwa-maskable-512x512.png'].map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {}))))
      .catch(() => {}),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function store(req, res) {
  if (!res || !res.ok) return;
  const c = await caches.open(CACHE);
  await c.put(req, res);
  const keys = await c.keys();
  if (keys.length > MAX_ENTRIES) await Promise.all(keys.slice(0, keys.length - MAX_ENTRIES).map((k) => c.delete(k)));
}

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  // Never keep an HTML page under an asset address (a server "not found" fallback) — it would break the app for good.
  if (res && res.ok && !/text\/html/i.test(res.headers.get('content-type') || '')) store(req, res.clone()).catch(() => {});
  return res;
}

async function networkFirst(req) {
  const net = req.mode === 'navigate' ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(req);
  net.then((res) => { if (res && res.ok) store(req, res.clone()).catch(() => {}); }).catch(() => {});
  const slow = new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), NET_TIMEOUT_MS));
  try {
    return await Promise.race([net, slow]);
  } catch (e) {
    const hit = (await caches.match(req)) || (req.mode === 'navigate' ? await caches.match('/') : undefined);
    if (hit) return hit;
    return net; // nothing cached yet: keep waiting for the network instead of failing
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/functions/') || url.pathname === '/sw.js') return;
  if (url.searchParams.has('sm_v')) return; // the app's "is there a new version?" check always goes straight to the network
  event.respondWith(HASHED.test(url.pathname) ? cacheFirst(req) : networkFirst(req));
});
