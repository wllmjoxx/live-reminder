const CACHE_NAME = "live-reminder-kill-v123"; // Ubah nama cache supaya browser tahu ini versi pemusnah
const ASSETS = ["./index.html"]; // Cukup arahkan ke index.html baru yang kosong/pesan error

self.addEventListener("install", e => {
  self.skipWaiting(); // Langsung paksa SW baru untuk menggantikan SW lama yang nangkring
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k))) // HAPUS SEMUA CACHE TANPA TERKECUALI
    ).then(() => {
      self.clients.claim(); // Ambil alih semua tab/client yang sedang terbuka
      // Paksa semua client/tab untuk reload otomatis ke halaman terbaru
      return self.clients.matchAll({ type: "window" }).then(clients => {
        clients.forEach(client => client.navigate(client.url));
      });
    })
  );
});

self.addEventListener("fetch", e => {
  // Langsung bypass cache, paksa ambil dari network agar mendeteksi kalau halaman sudah mati/404
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});