const CACHE_NAME = "live-reminder-v6";
const ASSETS = ["./", "./index.html", "./app.js", "./manifest.json", "./icon-192.png"];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll(ASSETS))
      .catch(() => {}) // jangan fail kalau ada asset yg ga ada
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
  if (e.request.url.includes("script.google.com") ||
      e.request.url.includes("ntfy.sh")) {
    e.respondWith(fetch(e.request).catch(() => new Response("")));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});

self.addEventListener("push", e => {
  const data = e.data?.json?.() || {};
  e.waitUntil(
    self.registration.showNotification(data.title || "Live Reminder", {
      body   : data.message || data.body || "",
      icon   : "./icon-192.png",  // relative to SW scope = /live-reminder/icon-192.png ✓
      badge  : "./icon-192.png",
      vibrate: [200, 100, 200],
    })
  );
});


self.addEventListener("message", e => {
  if (e.data?.type === "SHOW_NOTIFICATION") {
    const { title, body, tag, urgent } = e.data;
    self.registration.showNotification(title, {
      body,
      tag,
      icon   : "./icon-192.png",
      badge  : "./icon-192.png",
      vibrate: urgent ? [300, 100, 300, 100, 300] : [200, 100, 200],
      requireInteraction: false,
    });
  }
});
