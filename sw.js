const CACHE_NAME = "cen-biblemaps-release-v1-0-mapfirst";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./manifest.json",
  "./data/places-master.json",
  "./data/map-master.json",
  "./data/place-map-links-master.json",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png"
];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  event.respondWith(caches.match(req).then(cached => cached || fetch(req).catch(() => cached)));
});
