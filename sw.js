// Service worker: menyimpan tampilan aplikasi supaya tetap bisa dibuka tanpa sinyal.
// Naikkan VERSI setiap kali file aplikasi diubah agar HP host mengambil versi terbaru.
const VERSI = "absen-live-v4";
const FILE = ["./", "./index.html", "./app.js", "./config.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSI).then(c => c.addAll(FILE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSI).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // Apps Script selalu lewat jaringan
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(VERSI).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match("./index.html")))
  );
});
