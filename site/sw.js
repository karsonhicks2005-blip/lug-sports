// LUG My Team service worker.
// - App shell (page, icons, photos): cached, refreshed in the background.
// - data/data.json (scores, schedules): always tries the network first so scores are fresh;
//   falls back to the last copy after 4 seconds or when offline.
// - data/logos.json and data/reg.json: network first too, so new logos show on the next open.
const CACHE = "lug-my-team-v3";
const SHELL = [
  "./", "./index.html", "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png", "./icons/apple-touch-icon.png",
  "./img/lug-logo.png", "./img/hero-hockey.jpg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Cache key ignores the ?t= cache-buster the app adds.
function keyOf(req) { const u = new URL(req.url); u.searchParams.delete("t"); return u.toString(); }

function networkFirst(req, ms) {
  const key = keyOf(req);
  return caches.open(CACHE).then((c) => {
    const net = fetch(req).then((r) => { if (r.ok) c.put(key, r.clone()); return r; });
    const timeout = new Promise((res) => setTimeout(() => c.match(key).then((hit) => hit && res(hit)), ms));
    return Promise.race([net, timeout]).catch(() => c.match(key).then((hit) => hit || Promise.reject(new Error("offline"))));
  });
}
function staleWhileRevalidate(req) {
  const key = keyOf(req);
  return caches.open(CACHE).then((c) => c.match(key).then((hit) => {
    const net = fetch(req).then((r) => { if (r.ok) c.put(key, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
}

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin === location.origin) {
    if (/\/data\/[a-z]+\.json$/.test(url.pathname)) e.respondWith(networkFirst(e.request, 4000));
    else if (url.pathname.endsWith("/") || url.pathname.endsWith("/index.html")) e.respondWith(networkFirst(e.request, 3000));
    else e.respondWith(staleWhileRevalidate(e.request));
  } else if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(staleWhileRevalidate(e.request));
  }
});
