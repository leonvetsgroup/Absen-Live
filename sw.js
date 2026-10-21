// Service worker: menyimpan tampilan aplikasi supaya tetap bisa dibuka tanpa sinyal.
// Naikkan VERSI setiap kali file aplikasi diubah agar HP host mengambil versi terbaru.
const VERSI = "absen-live-v5";
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

// ---- Pengingat jadwal (push) ----
// Server mengirim push kosong; teks pesan diambil dari server memakai sid HP ini.
self.window = self;
try { importScripts("config.js"); } catch (e) {}
const API = ((self.ABSEN_CONFIG || {}).APPS_SCRIPT_URL || "").trim();
self.addEventListener("push", e => {
  e.waitUntil((async () => {
    let pesan = [];
    try {
      const c = await caches.open("absen-meta"); const r = await c.match("./__sid"); const sid = r ? await r.text() : "";
      if (sid && API) { const res = await fetch(API + "?action=pesan&sid=" + encodeURIComponent(sid)); const j = await res.json(); pesan = (j && j.data) || []; }
    } catch (err) {}
    if (!pesan.length) pesan = [{ judul: "Pengingat jadwal live", isi: "Kamu punya jadwal live sebentar lagi. Buka aplikasi untuk detailnya.", url: "./#jadwal" }];
    await Promise.all(pesan.map(p => self.registration.showNotification(p.judul, {
      body: p.isi, icon: "icon-192.png", badge: "icon-192.png", tag: p.tag || undefined, renotify: !!p.tag,
      vibrate: [200, 100, 200], data: { url: p.url || "./#jadwal" }
    })));
  })());
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(ws => {
    for (const w of ws) if (w.url.startsWith(self.registration.scope)) { if ("navigate" in w) w.navigate(url).catch(() => {}); return w.focus(); }
    return self.clients.openWindow(url);
  }));
});
