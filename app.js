/* Absen Live — aplikasi host Yayasan Sahabat Leo */
(() => {
const CFG = window.ABSEN_CONFIG || {};
const URL_API = String(CFG.APPS_SCRIPT_URL || "").trim();
const K = { profil: "absenLive.profil", antrean: "absenLive.antrean", config: "absenLive.config", draft: "absenLive.draft" };
const ANGKA = [
  ["views", "Penayangan", "Views / tayangan"],
  ["unik", "Penonton unik", "Unique viewers"],
  ["puncak", "Puncak penonton", "Penonton terbanyak bersamaan"],
  ["tonton", "Rata-rata tonton (detik)", "Average watch time"],
  ["follower", "Follower baru", "New followers"],
  ["komentator", "Penonton berkomentar", "Viewers who commented"],
  ["like", "Like", "Likes"],
  ["share", "Share", "Shares"],
  ["gifter", "Pemberi gift", "Gifters"],
  ["diamond", "Diamond", "Diamonds"]
];
const BLN = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
const HARI = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const muat = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (e) { return d; } };
const simpan = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
const pad = n => String(n).padStart(2, "0");
const hariIni = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
const tglPanjang = t => { if (!t) return ""; const [y,m,d] = t.split("-").map(Number); const dt = new Date(y, m-1, d); return `${HARI[dt.getDay()]}, ${d} ${BLN[m-1]} ${y}`; };
const slot = j => { if (!j) return ""; const h = +j.split(":")[0]; return h<5?"dini hari":h<11?"pagi":h<15?"siang":h<18?"sore":"malam"; };
const durasi = (m, s) => { if (!m || !s) return null; const [a,b] = m.split(":").map(Number), [c,d] = s.split(":").map(Number); let x = (c*60+d)-(a*60+b); if (x <= 0) x += 1440; return x; };
const fmtDur = mnt => mnt == null ? "" : (mnt >= 60 ? `${Math.floor(mnt/60)} jam ${mnt%60 ? (mnt%60)+" mnt" : ""}`.trim() : `${mnt} mnt`);
const nf = new Intl.NumberFormat("id-ID");
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)).replace(/-/g, "").slice(0, 13);
const normAkun = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

let profil = muat(K.profil, null);
let config = muat(K.config, { komunitas: [], akun: {}, host: [] });
let antrean = muat(K.antrean, []);
let draft = muat(K.draft, null);
let layar = "absen";
let hasil = null;          // hasil kiriman terakhir
let sesiHari = null;       // sesi yang sudah tercatat di server untuk akun+tanggal draft
let sesiKunci = "";
let mengirim = false;

$("#yayasan").textContent = CFG.NAMA_YAYASAN || "Yayasan Sahabat Leo";

/* ---------------- jaringan ---------------- */
const GAS = !!(window.google && google.script && google.script.run); // berjalan di dalam Apps Script
function apiSiap() { return GAS || /^https:\/\/script\.google(usercontent)?\.com\//.test(URL_API); }
async function panggil(method, params, body) {
  const j = await panggilMentah(method, params, body);
  if (j && (j.kode === "sesi_habis" || j.kode === "nonaktif")) sesiBerakhir(j.pesan);
  return j;
}
async function panggilMentah(method, params, body) {
  if (GAS) return new Promise((ok, no) => {
    const t = setTimeout(() => { const e = new Error("Waktu habis."); e.offline = true; no(e); }, 30000);
    const r = google.script.run
      .withSuccessHandler(v => { clearTimeout(t); ok(v); })
      .withFailureHandler(() => { clearTimeout(t); const e = new Error("Tidak ada sambungan ke server."); e.offline = true; no(e); });
    if (method === "GET") r.apiGet(params); else r.apiPost(body);
  });
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 30000);
  try {
    let res;
    if (method === "GET") {
      const q = new URLSearchParams(params).toString();
      res = await fetch(URL_API + "?" + q, { signal: ctrl.signal });
    } else {
      // text/plain menghindari preflight CORS di Apps Script
      res = await fetch(URL_API, { method: "POST", body: JSON.stringify(body), signal: ctrl.signal });
    }
    const j = await res.json();
    return j;
  } catch (e) {
    const err = new Error("Tidak ada sambungan ke server."); err.offline = true; throw err;
  } finally { clearTimeout(t); }
}
function setNet() {
  const n = $("#net"); const on = navigator.onLine;
  n.textContent = on ? (antrean.length ? `${antrean.length} menunggu` : "Online") : "Offline";
  n.className = "net" + (on && !antrean.length ? "" : " off");
  const b = $("#qBadge"); if (b) { b.hidden = !antrean.length; b.textContent = antrean.length; }
}
addEventListener("online", () => { setNet(); kirimAntrean(); });
addEventListener("offline", setNet);

async function kirimAntrean() {
  if (!antrean.length || !navigator.onLine || !profil || !profil.token) return;
  const sisa = [];
  for (const item of antrean) {
    try {
      const r = await panggil("POST", null, { action: "absen", token: profil.token, data: item.data, paksa: item.paksa });
      if (r.ok) continue;
      if (r.kode === "sesi_habis" || r.kode === "nonaktif") { sisa.push(item); continue; }
      if (r.kode === "duplikat") { item.gagal = r.pesan; sisa.push(item); continue; }
      item.gagal = r.pesan; sisa.push(item);
    } catch (e) { sisa.push(item); }
  }
  const terkirim = antrean.length - sisa.length;
  antrean = sisa; simpanAntrean(); setNet();
  if (terkirim) toastInline(`${terkirim} absen dari antrean berhasil dikirim.`);
  if (layar === "riwayat") render();
}
function simpanAntrean() {
  if (!simpan(K.antrean, antrean)) {
    // Penyimpanan HP penuh: buang foto bukti dari antrean, simpan datanya saja.
    antrean.forEach(a => { delete a.data.buktiBase64; a.tanpaBukti = true; });
    simpan(K.antrean, antrean);
  }
}
let toastT;
function toastInline(msg) {
  let t = $("#toast"); if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "note good"; t.style.cssText = "position:fixed;left:16px;right:16px;bottom:calc(80px + env(safe-area-inset-bottom,0px));z-index:9;max-width:600px;margin:0 auto;font-weight:600"; document.body.appendChild(t); }
  t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 3500);
}

/* ---------------- render ---------------- */
function render() {
  setNet();
  const app = $("#app");
  if (!apiSiap()) { $("#nav").hidden = true; app.innerHTML = vBelumSiap(); return; }
  if (!profil || !profil.token || !profil.host) { $("#nav").hidden = true; app.innerHTML = vMasuk(); pasangMasuk(); return; }
  $("#nav").hidden = false;
  document.querySelectorAll("#nav [data-go]").forEach(b => b.setAttribute("aria-current", b.dataset.go === layar ? "page" : "false"));
  if (layar === "absen") { app.innerHTML = hasil ? vSelesai() : vAbsen(); hasil ? pasangSelesai() : pasangAbsen(); }
  else if (layar === "riwayat") { app.innerHTML = vRiwayat(); pasangRiwayat(); }
  else { app.innerHTML = vProfil(); pasangProfil(); }
}
document.querySelectorAll("#nav [data-go]").forEach(b => b.onclick = () => { layar = b.dataset.go; if (layar === "absen") hasil = null; render(); scrollTo(0, 0); });

function vBelumSiap() {
  return `<div class="card"><h2>Aplikasi belum dihubungkan</h2><p class="muted">Admin perlu mengisi alamat Apps Script di file <b>config.js</b>. Lihat README bagian "Langkah 2".</p></div>`;
}

/* ---------- login ---------- */
let pesanMasuk = "";
function sesiBerakhir(pesan) {
  if (!profil || !profil.token) return;
  profil = { ...profil, token: "" }; simpan(K.profil, profil);
  pesanMasuk = pesan || "Sesi login berakhir. Silakan login lagi."; hasil = null; render();
}
function vMasuk() {
  const p = profil || {};
  return `<form class="card" id="fMasuk" novalidate autocomplete="on">
    <div><h2>Masuk</h2><p class="muted small">Pakai username dan password yang diberikan admin ${esc(CFG.NAMA_YAYASAN || "yayasan")}.</p></div>
    ${pesanMasuk ? `<div class="note warn">${esc(pesanMasuk)}</div>` : ""}
    <div class="field"><label for="mUser">Username</label><input id="mUser" value="${esc(p.username || "")}" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false"></div>
    <div class="field"><label for="mPass">Password</label><input id="mPass" type="password" autocomplete="current-password"></div>
    <label class="small" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="mLihat" style="width:auto;min-height:0"> Tampilkan password</label>
    ${antrean.length ? `<div class="note">${antrean.length} absen tersimpan di HP ini dan akan dikirim setelah kamu masuk.</div>` : ""}
    <p class="small" id="mErr" style="color:var(--bad)" hidden></p>
    <button class="btn primary" type="submit" id="mBtn">Masuk</button>
    <p class="small muted">Lupa password? Minta admin melakukan reset.</p>
  </form>${vPasang()}`;
}
function pasangMasuk() {
  pasangTombolPasang();
  const f = $("#fMasuk"), err = $("#mErr"), btn = $("#mBtn");
  $("#mLihat").onchange = e => { $("#mPass").type = e.target.checked ? "text" : "password"; };
  f.onsubmit = async e => {
    e.preventDefault(); err.hidden = true;
    const username = $("#mUser").value.trim().toLowerCase(), password = $("#mPass").value;
    if (!username || !password) { err.textContent = "Isi username dan password."; err.hidden = false; return; }
    btn.disabled = true; btn.textContent = "Memeriksa…";
    try {
      const r = await panggilMentah("POST", null, { action: "login", username, password });
      if (!r.ok) { err.textContent = r.pesan || "Gagal masuk."; err.hidden = false; btn.disabled = false; btn.textContent = "Masuk"; return; }
      terimaProfil(r, r.token);
      pesanMasuk = ""; layar = "absen"; render(); kirimAntrean();
    } catch (e2) { err.textContent = "Tidak ada sambungan. Coba lagi saat ada sinyal."; err.hidden = false; btn.disabled = false; btn.textContent = "Masuk"; }
  };
}
function terimaProfil(r, token) {
  config = { komunitas: r.komunitas || [], akun: r.akun || {} }; simpan(K.config, config);
  const pr = r.profil || {};
  const lama = profil && profil.username === pr.username ? profil : {};
  const akunList = config.akun[pr.komunitas] || [];
  profil = { username: pr.username, host: pr.host, komunitas: pr.komunitas, token: token || (profil && profil.token) || "",
    akun: lama.akun || pr.akun || akunList[0] || "", lokasi: lama.lokasi || pr.lokasi || "" };
  simpan(K.profil, profil);
}

/* ---------- form absen ---------- */
function draftBaru() {
  return { tanggal: hariIni(), mulai: "", selesai: "", akun: profil.akun || "", lokasi: profil.lokasi || "", tema: "", catatan: "", bukti: "", ...Object.fromEntries(ANGKA.map(a => [a[0], ""])) };
}
function vAbsen() {
  if (!draft) draft = draftBaru();
  const d = draft; const akunList = (config.akun || {})[profil.komunitas] || [];
  const adaAngka = ANGKA.some(a => d[a[0]] !== "");
  return `<form class="card" id="fAbsen" novalidate>
    <div><h2>Absen setelah live</h2><p class="muted small">${esc(profil.host)} · ${esc(profil.komunitas)}</p></div>
    <div class="grid">
      <div class="field full"><label for="aTgl">Tanggal live <span class="req">*</span></label><input type="date" id="aTgl" value="${esc(d.tanggal)}" max="${hariIni()}"></div>
      <div class="field"><label for="aMulai">Jam mulai <span class="req">*</span></label><input type="time" id="aMulai" value="${esc(d.mulai)}"></div>
      <div class="field"><label for="aSelesai">Jam selesai <span class="req">*</span></label><input type="time" id="aSelesai" value="${esc(d.selesai)}"></div>
      <div class="field full"><label for="aAkun">Akun TikTok yang dipakai</label>
        ${akunList.length ? `<select id="aAkun">${akunList.map(a => `<option${a === d.akun ? " selected" : ""}>${esc(a)}</option>`).join("")}<option value="__lain"${d.akun && !akunList.includes(d.akun) ? " selected" : ""}>Akun lain…</option></select>
        <input id="aAkunLain" placeholder="tulis nama akun" value="${esc(d.akun && !akunList.includes(d.akun) ? d.akun : "")}" ${d.akun && !akunList.includes(d.akun) ? "" : "hidden"}>`
        : `<input id="aAkunLain" value="${esc(d.akun)}" placeholder="mis. lulacathouse">`}
      </div>
      <div class="field full"><label for="aLok">Lokasi live <span class="req">*</span></label><input id="aLok" value="${esc(d.lokasi)}" placeholder="mis. Shelter Lula, Bandung"></div>
      <div class="field full"><div class="note" id="sesiInfo">${vSesiInfo()}</div></div>
      <div class="field full"><label for="aTema">Kucing atau tema yang ditampilkan</label><input id="aTema" value="${esc(d.tema)}" placeholder="mis. anak kucing siap adopsi, update Oyen"></div>
    </div>
    <details ${adaAngka ? "open" : ""}><summary>Performa live (dari ringkasan TikTok)</summary>
      <p class="small muted" style="margin:8px 0 12px">Setelah live selesai, TikTok menampilkan ringkasan. Salin angkanya ke sini. Yang tidak ada boleh dikosongkan.</p>
      <div class="grid">${ANGKA.map(([k, l, h]) => `<div class="field"><label for="n_${k}">${l}</label><input type="number" inputmode="numeric" min="0" step="1" id="n_${k}" value="${esc(d[k])}"><span class="hint">${h}</span></div>`).join("")}</div>
      <div class="field" style="margin-top:12px"><label for="aBukti">Foto/screenshot ringkasan live</label><input type="file" id="aBukti" accept="image/*"><span class="hint">Opsional, sebagai bukti untuk admin.</span></div>
      ${d.bukti ? `<img class="thumb" src="${d.bukti}" alt="Pratinjau bukti"><button class="btn ghost" type="button" id="hapusBukti">Hapus foto</button>` : ""}
    </details>
    <div class="field"><label for="aCatatan">Catatan atau kendala</label><textarea id="aCatatan" placeholder="mis. sinyal putus 10 menit, banyak yang tanya cara adopsi">${esc(d.catatan)}</textarea></div>
    <div class="note warn" id="aErr" hidden></div>
    <button class="btn primary" type="submit" id="aKirim">${mengirim ? "Mengirim…" : "Kirim absen"}</button>
  </form>`;
}
function vSesiInfo() {
  const d = draft;
  if (!d.mulai) return "Isi jam mulai untuk melihat ini sesi ke berapa hari ini.";
  const list = (sesiHari || []).filter(s => !(s.host?.toLowerCase() === profil.host.toLowerCase() && s.mulai === d.mulai));
  const semua = [...list.map(s => ({ ...s, me: false })), { host: profil.host, mulai: d.mulai, selesai: d.selesai, me: true }].sort((a, b) => (a.mulai || "").localeCompare(b.mulai || ""));
  const ke = semua.findIndex(s => s.me) + 1;
  const dur = durasi(d.mulai, d.selesai);
  return `<b>Sesi ke-${ke}</b> dari ${semua.length} sesi hari itu (${slot(d.mulai)}${dur ? `, ${fmtDur(dur)}` : ""}).${sesiHari === null ? ` <span class="muted">Mengecek sesi lain…</span>` : ""}
    <div class="sesi" style="margin-top:8px">${semua.map((s, i) => `<div class="row${s.me ? " me" : ""}"><span class="no">${i + 1}</span><span>${esc(s.mulai)}–${esc(s.selesai || "?")}</span><span class="muted">${s.me ? "kamu" : esc(s.host)}</span></div>`).join("")}</div>`;
}
function akunDraft() {
  const sel = $("#aAkun"), lain = $("#aAkunLain");
  if (sel && sel.value !== "__lain") return sel.value;
  return (lain?.value || "").trim().replace(/^@/, "");
}
let cekT;
function cekSesi() {
  const kunci = `${normAkun(draft.akun) || "k:" + profil.komunitas}|${draft.tanggal}`;
  if (kunci === sesiKunci) return;
  sesiKunci = kunci; sesiHari = null; updSesi();
  clearTimeout(cekT);
  cekT = setTimeout(async () => {
    try {
      const r = await panggil("GET", { action: "hari", token: profil.token, akun: draft.akun, tanggal: draft.tanggal });
      if (kunci !== sesiKunci) return;
      sesiHari = r.ok ? r.data : [];
    } catch (e) { sesiHari = []; }
    // sertakan antrean lokal yang belum terkirim
    antrean.forEach(a => { const x = a.data; if (`${normAkun(x.akun) || "k:" + x.komunitas}|${x.tanggal}` === kunci) sesiHari.push({ host: x.host, mulai: x.mulai, selesai: x.selesai }); });
    updSesi();
  }, 400);
}
function updSesi() { const el = $("#sesiInfo"); if (el) el.innerHTML = vSesiInfo(); }
function simpanDraft() { simpan(K.draft, draft); }

function pasangAbsen() {
  const f = $("#fAbsen"); if (!f) return;
  const ikat = (id, k, cb) => { const el = $("#" + id); if (!el) return; const up = () => { draft[k] = el.value; simpanDraft(); cb && cb(); }; el.addEventListener("input", up); el.addEventListener("change", up); };
  ikat("aTgl", "tanggal", cekSesi); ikat("aMulai", "mulai", updSesi); ikat("aSelesai", "selesai", updSesi);
  ikat("aLok", "lokasi"); ikat("aTema", "tema"); ikat("aCatatan", "catatan");
  ANGKA.forEach(([k]) => ikat("n_" + k, k));
  const sel = $("#aAkun"), lain = $("#aAkunLain");
  const updAkun = () => { if (sel) lain.hidden = sel.value !== "__lain"; draft.akun = akunDraft(); simpanDraft(); cekSesi(); };
  if (sel) sel.addEventListener("change", updAkun);
  if (lain) lain.addEventListener("change", updAkun);
  const fb = $("#aBukti");
  fb.addEventListener("change", async () => {
    const file = fb.files[0]; if (!file) return;
    try { draft.bukti = await kecilkan(file); simpanDraft(); render(); }
    catch (e) { tampilErr("Foto tidak bisa dibaca. Coba pilih screenshot lain."); }
  });
  const hb = $("#hapusBukti"); if (hb) hb.onclick = () => { draft.bukti = ""; simpanDraft(); render(); };
  draft.akun = akunDraft(); cekSesi();
  f.onsubmit = e => { e.preventDefault(); kirim(false); };
}
function tampilErr(msg, html) { const el = $("#aErr"); el.innerHTML = html || esc(msg); el.hidden = false; el.scrollIntoView({ behavior: "smooth", block: "center" }); }

async function kirim(paksa) {
  if (mengirim) return;
  const d = draft; d.akun = akunDraft();
  const kurang = [];
  if (!d.tanggal) kurang.push("tanggal"); if (!d.mulai) kurang.push("jam mulai"); if (!d.selesai) kurang.push("jam selesai"); if (!d.lokasi.trim()) kurang.push("lokasi live");
  if (kurang.length) return tampilErr("Lengkapi dulu: " + kurang.join(", ") + ".");
  if (d.tanggal > hariIni()) return tampilErr("Tanggal live tidak boleh di masa depan.");
  for (const [k, l] of ANGKA) if (d[k] !== "" && (isNaN(+d[k]) || +d[k] < 0)) return tampilErr(`${l} harus angka 0 atau lebih.`);
  d.id = d.id || uid();
  const data = { id: d.id, host: profil.host, komunitas: profil.komunitas, akun: d.akun, lokasi: d.lokasi.trim(), tanggal: d.tanggal, mulai: d.mulai, selesai: d.selesai, tema: d.tema.trim(), catatan: d.catatan.trim(), ...Object.fromEntries(ANGKA.map(([k]) => [k, d[k]])) };
  if (d.bukti) data.buktiBase64 = d.bukti;
  mengirim = true; const btn = $("#aKirim"); btn.disabled = true; btn.textContent = "Mengirim…";
  try {
    if (!navigator.onLine) throw Object.assign(new Error(), { offline: true });
    const r = await panggil("POST", null, { action: "absen", token: profil.token, data, paksa });
    mengirim = false;
    if (!r.ok) {
      btn.disabled = false; btn.textContent = "Kirim absen";
      if (r.kode === "duplikat") return tampilErr("", `${esc(r.pesan)} Kalau ini sesi live yang berbeda, ubah jam mulainya, atau <button type="button" class="btn dark" id="paksa" style="margin-top:8px;width:100%">Tetap kirim</button>`), ($("#paksa").onclick = () => kirim(true));
      return tampilErr(r.pesan || "Absen belum tersimpan. Coba lagi.");
    }
    hasil = { ...data, ...r, buktiBase64: undefined, online: true };
  } catch (e) {
    mengirim = false;
    antrean.push({ data, paksa, waktu: new Date().toISOString() }); simpanAntrean();
    hasil = { ...data, buktiBase64: undefined, online: false };
  }
  profil = { ...profil, akun: d.akun || profil.akun, lokasi: d.lokasi.trim() || profil.lokasi }; simpan(K.profil, profil);
  draft = null; localStorage.removeItem(K.draft); sesiKunci = "";
  render(); scrollTo(0, 0);
}

function vSelesai() {
  const h = hasil; const dur = durasi(h.mulai, h.selesai);
  if (!h.online) return `<div class="card done"><h2>Tersimpan di HP</h2><p>Belum ada sinyal, jadi absen ${esc(tglPanjang(h.tanggal))} jam ${esc(h.mulai)}–${esc(h.selesai)} disimpan dulu di HP ini. Aplikasi akan mengirimnya otomatis saat ada sinyal. Jangan hapus data browser sebelum terkirim.</p><button class="btn dark" type="button" id="lagi">Selesai</button></div>`;
  return `<div class="card done">
    <p class="small" style="font-weight:700;color:var(--good)">Absen terkirim${h.ulang ? " (sudah tercatat sebelumnya)" : ""}</p>
    <div><span class="big">Sesi ${h.sesiKe || "?"}</span> <span class="muted">dari ${h.jumlahSesi || "?"} sesi hari itu</span></div>
    <p>${esc(tglPanjang(h.tanggal))} · ${esc(h.mulai)}–${esc(h.selesai)} (${slot(h.mulai)}${dur ? ", " + fmtDur(dur) : ""})<br>${esc(h.akun || profil.komunitas)} · ${esc(h.lokasi)}</p>
    ${h.sesiHari?.length > 1 ? `<div class="sesi" style="width:100%">${h.sesiHari.map(s => `<div class="row${s.ke === h.sesiKe ? " me" : ""}"><span class="no">${s.ke}</span><span>${esc(s.mulai)}–${esc(s.selesai)}</span><span class="muted">${esc(s.host)}</span></div>`).join("")}</div>` : ""}
    <p class="small">Terima kasih sudah live untuk kucing-kucing, ${esc(profil.host)}!</p>
    <button class="btn dark" type="button" id="lagi">Absen sesi lain</button></div>`;
}
function pasangSelesai() { $("#lagi").onclick = () => { hasil = null; render(); }; }

/* ---------- riwayat ---------- */
let riwayat = null, riwayatErr = "";
function vRiwayat() {
  const ant = antrean.map((a, i) => ({ ...a.data, _q: i, _gagal: a.gagal, _tanpaBukti: a.tanpaBukti }));
  let h = `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><h2>Riwayat live saya</h2><button class="btn" type="button" id="muatUlang">Muat ulang</button></div>`;
  if (ant.length) h += `<div class="note warn">${ant.length} absen belum terkirim. ${navigator.onLine ? `<button class="btn dark" type="button" id="kirimSek" style="margin-top:8px;width:100%">Kirim sekarang</button>` : "Akan dikirim otomatis saat ada sinyal."}</div>`;
  h += `</div>`;
  const kartu = (r, q) => `<div class="item"><div class="h"><b>${esc(tglPanjang(r.tanggal))}</b>${q ? `<span class="pill wait">Menunggu</span>` : `<span class="pill ok">Sesi ${esc(r.sesiKe || "?")}/${esc(r.jumlahSesi || "?")}</span>`}</div>
    <div class="small">${esc(r.mulai)}–${esc(r.selesai)} · ${esc(r.akun || r.komunitas)} · ${esc(r.lokasi)}</div>
    ${r.tema ? `<div class="small muted">${esc(r.tema)}</div>` : ""}
    ${ANGKA.some(([k]) => r[k] !== "" && r[k] != null) ? `<div class="nums">${ANGKA.filter(([k]) => r[k] !== "" && r[k] != null).map(([k, l]) => `<span>${l}: <b>${nf.format(+r[k])}</b></span>`).join("")}</div>` : ""}
    ${q && r._gagal ? `<div class="small" style="color:var(--bad)">${esc(r._gagal)}</div>` : ""}
    ${q ? `<button class="btn ghost" type="button" data-hapusq="${r._q}">Batalkan absen ini</button>` : ""}</div>`;
  h += ant.map(r => kartu(r, true)).join("");
  if (riwayat === null) h += `<div class="card center"><p class="muted">${riwayatErr ? esc(riwayatErr) : "Memuat riwayat…"}</p></div>`;
  else if (!riwayat.length && !ant.length) h += `<div class="card center"><p class="muted">Belum ada absen. Setelah live pertama, absenmu muncul di sini.</p></div>`;
  else {
    const bulan = hariIni().slice(0, 7); const ini = riwayat.filter(r => String(r.tanggal).startsWith(bulan));
    const menit = ini.reduce((s, r) => s + (+r.durasiMenit || 0), 0);
    h += `<div class="card"><div class="grid"><div><div class="small muted">Live bulan ini</div><b style="font-size:22px;font-family:var(--display)">${ini.length} sesi</b></div><div><div class="small muted">Total durasi</div><b style="font-size:22px;font-family:var(--display)">${fmtDur(menit) || "0 mnt"}</b></div></div></div>`;
    h += riwayat.map(r => kartu(r, false)).join("");
  }
  return h;
}
async function muatRiwayat() {
  riwayatErr = "";
  try { const r = await panggil("GET", { action: "riwayat", token: profil.token, limit: 50 }); if (r.ok) riwayat = r.data; else { riwayat = null; riwayatErr = r.pesan; } }
  catch (e) { riwayat = null; riwayatErr = "Tidak ada sambungan. Riwayat muncul lagi saat ada sinyal."; }
  if (layar === "riwayat") render();
}
function pasangRiwayat() {
  $("#muatUlang").onclick = () => { riwayat = null; render(); muatRiwayat(); };
  const ks = $("#kirimSek"); if (ks) ks.onclick = () => kirimAntrean();
  document.querySelectorAll("[data-hapusq]").forEach(b => b.onclick = () => {
    if (b.dataset.yakin) { antrean.splice(+b.dataset.hapusq, 1); simpanAntrean(); render(); return; }
    b.dataset.yakin = "1"; b.textContent = "Ketuk lagi untuk membatalkan"; b.style.color = "var(--bad)";
  });
  if (riwayat === null && !riwayatErr) muatRiwayat();
}

/* ---------- profil ---------- */
function vProfil() {
  const akunList = (config.akun || {})[profil.komunitas] || [];
  return `<div class="card"><h2>${esc(profil.host)}</h2>
    <p class="muted small">Username: <b>${esc(profil.username)}</b> · Komunitas: <b>${esc(profil.komunitas)}</b><br>Nama dan komunitas diatur oleh admin.</p></div>
  <form class="card" id="fProfil" novalidate><h3>Isian otomatis di form absen</h3>
    <div class="field"><label for="pAkun">Akun TikTok yang biasa dipakai</label><input id="pAkun" list="dlAkunP" value="${esc(profil.akun || "")}"><datalist id="dlAkunP">${akunList.map(a => `<option value="${esc(a)}">`).join("")}</datalist></div>
    <div class="field"><label for="pLok">Lokasi live yang biasa dipakai</label><input id="pLok" value="${esc(profil.lokasi || "")}"></div>
    <p class="small" id="pMsg" hidden></p>
    <button class="btn primary" type="submit">Simpan</button>
  </form>
  <form class="card" id="fPw" novalidate><h3>Ganti password</h3>
    <div class="field"><label for="pwLama">Password lama</label><input id="pwLama" type="password" autocomplete="current-password"></div>
    <div class="field"><label for="pwBaru">Password baru (minimal 6 karakter)</label><input id="pwBaru" type="password" autocomplete="new-password"></div>
    <p class="small" id="pwMsg" hidden></p>
    <button class="btn" type="submit" id="pwBtn">Ganti password</button>
  </form>
  <div class="card"><button class="btn ghost" type="button" id="segarkan">Perbarui data dari admin</button>
    <button class="btn ghost" type="button" id="keluar">Keluar dari akun</button></div>
  ${vPasang()}
  <p class="small muted" style="text-align:center">Absen Live · data dikirim ke Google Sheet yayasan</p>`;
}
function pasangProfil() {
  pasangTombolPasang();
  const tulis = (el, t, ok) => { el.textContent = t; el.style.color = ok ? "var(--good)" : "var(--bad)"; el.hidden = false; };
  $("#fProfil").onsubmit = e => {
    e.preventDefault();
    profil = { ...profil, akun: $("#pAkun").value.trim().replace(/^@/, ""), lokasi: $("#pLok").value.trim() };
    simpan(K.profil, profil); draft = null; tulis($("#pMsg"), "Tersimpan. Dipakai di absen berikutnya.", true);
  };
  $("#fPw").onsubmit = async e => {
    e.preventDefault(); const m = $("#pwMsg"), b = $("#pwBtn");
    const lama = $("#pwLama").value, baru = $("#pwBaru").value;
    if (!lama || baru.length < 6) return tulis(m, "Isi password lama dan password baru minimal 6 karakter.");
    b.disabled = true; b.textContent = "Menyimpan…";
    try {
      const r = await panggil("POST", null, { action: "ganti_password", token: profil.token, lama, baru });
      b.disabled = false; b.textContent = "Ganti password";
      if (!r.ok) return tulis(m, r.pesan);
      profil = { ...profil, token: r.token }; simpan(K.profil, profil);
      $("#pwLama").value = ""; $("#pwBaru").value = ""; tulis(m, "Password berhasil diganti.", true);
    } catch (e2) { b.disabled = false; b.textContent = "Ganti password"; tulis(m, "Tidak ada sambungan."); }
  };
  $("#segarkan").onclick = async () => {
    try { const r = await panggil("GET", { action: "config", token: profil.token }); if (r.ok) { terimaProfil(r); render(); toastInline("Data diperbarui."); } }
    catch (e) { toastInline("Tidak ada sambungan."); }
  };
  const k = $("#keluar");
  k.onclick = () => {
    if (!k.dataset.yakin) { k.dataset.yakin = "1"; k.textContent = antrean.length ? `Ada ${antrean.length} absen belum terkirim dan akan terhapus. Ketuk lagi untuk tetap keluar` : "Ketuk lagi untuk keluar"; k.style.color = "var(--bad)"; return; }
    [K.profil, K.draft, K.antrean, K.config].forEach(x => localStorage.removeItem(x));
    profil = { username: profil.username }; simpan(K.profil, profil); draft = null; antrean = []; riwayat = null; pesanMasuk = ""; render();
  };
}

/* ---------- foto ---------- */
function kecilkan(file) {
  return new Promise((ok, no) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1280; let { width: w, height: h } = img; const s = Math.min(1, max / Math.max(w, h)); w = Math.round(w * s); h = Math.round(h * s);
      const c = document.createElement("canvas"); c.width = w; c.height = h; c.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url); ok(c.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = () => { URL.revokeObjectURL(url); no(new Error("gambar")); };
    img.src = url;
  });
}

/* ---------- pasang aplikasi ke layar utama ---------- */
let installEvt = null, panduanBuka = false;
const UA = navigator.userAgent || "";
const isIOS = /iPhone|iPad|iPod/i.test(UA) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isAndroid = /Android/i.test(UA);
const diAppLain = /FBAN|FBAV|Instagram|Line\/|WhatsApp|; wv\)/i.test(UA);          // browser bawaan aplikasi chat/sosmed
const iosBukanSafari = isIOS && /CriOS|FxiOS|EdgiOS|OPiOS/i.test(UA);
function sudahTerpasang() {
  return (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
}
addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; segarkanPasang(); });
addEventListener("appinstalled", () => { installEvt = null; toastInline("Aplikasi terpasang. Buka dari ikon Absen Live di layar HP."); segarkanPasang(); });
function langkahPasang() {
  if (isIOS && iosBukanSafari) return ["Salin alamat halaman ini.", "Buka aplikasi <b>Safari</b> dan tempel alamatnya.", "Ketuk tombol <b>Bagikan</b> (kotak dengan panah ke atas).", "Pilih <b>Tambahkan ke Layar Utama</b> → <b>Tambah</b>."];
  if (isIOS) return ["Ketuk tombol <b>Bagikan</b> (kotak dengan panah ke atas) di bagian bawah Safari.", "Gulir ke bawah, pilih <b>Tambahkan ke Layar Utama</b>.", "Ketuk <b>Tambah</b> di kanan atas.", "Buka aplikasi dari ikon <b>Absen Live</b> di layar HP."];
  if (diAppLain) return ["Ketuk <b>titik tiga</b> di kanan atas.", "Pilih <b>Buka di Chrome</b> (atau <b>Buka di browser</b>).", "Di Chrome, ketuk tombol <b>Pasang</b> yang muncul di halaman ini."];
  if (isAndroid) return ["Ketuk <b>titik tiga</b> di kanan atas Chrome.", "Pilih <b>Instal aplikasi</b> atau <b>Tambahkan ke layar utama</b>.", "Ketuk <b>Instal</b>, lalu buka dari ikon <b>Absen Live</b>."];
  return ["Buka alamat ini di HP dengan <b>Chrome</b> (Android) atau <b>Safari</b> (iPhone).", "Ikuti tombol atau panduan pasang yang muncul di halaman login."];
}
function vPasang() {
  if (sudahTerpasang()) return "";
  const otomatis = !!installEvt;
  return `<div class="card" id="kartuPasang" style="background:var(--accent-soft);border-color:transparent;gap:10px">
    <div style="display:flex;align-items:center;gap:12px">
      <img src="icon-192.png" alt="" width="44" height="44" style="border-radius:11px;flex:none">
      <div style="flex:1;min-width:0"><b>Pasang aplikasi Absen Live</b><div class="small muted">Supaya bisa dibuka langsung dari layar HP, seperti aplikasi biasa.</div></div>
      <button class="btn dark" type="button" id="btnPasang" style="flex:none">${otomatis ? "Pasang" : (panduanBuka ? "Tutup" : "Cara pasang")}</button>
    </div>
    ${!otomatis && panduanBuka ? `<ol class="small" style="margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px">${langkahPasang().map(l => `<li>${l}</li>`).join("")}</ol>
      ${isIOS && iosBukanSafari || diAppLain ? `<button class="btn" type="button" id="salinAlamat">Salin alamat halaman ini</button>` : ""}` : ""}
  </div>`;
}
function segarkanPasang() {
  const k = $("#kartuPasang");
  if (k) { const t = document.createElement("div"); t.innerHTML = vPasang(); const baru = t.firstElementChild; baru ? k.replaceWith(baru) : k.remove(); pasangTombolPasang(); }
}
function pasangTombolPasang() {
  const b = $("#btnPasang"); if (!b) return;
  b.onclick = async () => {
    if (installEvt) {
      installEvt.prompt();
      try { const r = await installEvt.userChoice; if (r && r.outcome === "accepted") installEvt = null; } catch (e) {}
      segarkanPasang(); return;
    }
    panduanBuka = !panduanBuka; segarkanPasang();
  };
  const sa = $("#salinAlamat"); if (sa) sa.onclick = async () => {
    try { await navigator.clipboard.writeText(location.href.split("#")[0]); toastInline("Alamat disalin."); } catch (e) { toastInline(location.href.split("#")[0]); }
  };
}

/* ---------- mulai ---------- */
if (!GAS && "serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
render();
if (profil && profil.token && apiSiap() && navigator.onLine) {
  kirimAntrean();
  panggil("GET", { action: "config", token: profil.token }).then(r => { if (r.ok) { terimaProfil(r); if (layar === "profil") render(); } }).catch(() => {});
}
})();
