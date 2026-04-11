const CACHE_NAME = "live-reminder-v1";
const ASSETS = ["/", "/index.html", "/app.js", "/manifest.json"];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});

self.addEventListener("message", e => {
  if (e.data?.type === "SHOW_NOTIFICATION") {
    const { title, body, tag } = e.data;
    self.registration.showNotification(title, {
      body,
      tag,
      icon: "/icon-192.png",
      vibrate: [200, 100, 200],
      requireInteraction: false
    });
  }
});
