import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { db, all, get, run, tx, SABUK } from './db.js';

const PORT = +process.env.PORT || 3000;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.resolve(process.env.STATIC_DIR || path.join(HERE, 'public'));
const CORS_ORIGIN = process.env.CORS_ORIGIN || '';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const TZ_OFFSET = +(process.env.TZ_OFFSET ?? 7);
const SESSION_DAYS = 30;
const DEFAULT_KODE_PELATIH = process.env.KODE_PELATIH || '1414';

class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const bad = m => new HttpError(400, m);
const forbidden = () => new HttpError(403, 'Anda tidak punya izin untuk aksi ini');

const str = (x, max = 200) => String(x ?? '').trim().slice(0, max);
const idOk = /^[A-Za-z0-9_-]{1,64}$/;
const dateOk = /^\d{4}-\d{2}-\d{2}$/;
const today = () => new Date(Date.now() + TZ_OFFSET * 36e5).toISOString().slice(0, 10);
const SABUK_IDS = SABUK.map(s => s.id);

/* ---------- auth ---------- */
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
function hashPw(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex');
}
function checkPw(pw, stored) {
  if (!stored) return false;
  const [salt, h] = stored.split(':');
  const a = Buffer.from(h, 'hex'), b = crypto.scryptSync(pw, salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const safeEq = (a, b) => crypto.timingSafeEqual(Buffer.from(sha(String(a).toLowerCase().replace(/\s+/g, ''))), Buffer.from(sha(String(b).toLowerCase().replace(/\s+/g, ''))));

function newSession(role, uid) {
  const t = crypto.randomBytes(32).toString('hex');
  run('INSERT INTO sessions(token_hash,role,uid,expires) VALUES(?,?,?,?)', sha(t), role, uid, Date.now() + SESSION_DAYS * 864e5);
  return t;
}
function tokenOf(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
}
function auth(req) {
  const t = tokenOf(req);
  if (!t) return null;
  const r = get('SELECT role,uid,expires FROM sessions WHERE token_hash=?', sha(t));
  if (!r || r.expires < Date.now()) return null;
  return { role: r.role, uid: r.uid };
}
const need = (a, ...roles) => {
  if (!a) throw new HttpError(401, 'Sesi berakhir, silakan masuk lagi');
  if (roles.length && !roles.includes(a.role)) throw forbidden();
  return a;
};
const isPelatih = a => a.role === 'pelatih';

const fails = new Map();
const ipOf = req => (TRUST_PROXY && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '?';
function guard(req) {
  const e = fails.get(ipOf(req));
  if (e && Date.now() - e.t < 5 * 60e3 && e.c >= 10) throw new HttpError(429, 'Terlalu banyak percobaan gagal, coba lagi 5 menit lagi');
}
function failed(req) {
  const ip = ipOf(req), e = fails.get(ip);
  if (!e || Date.now() - e.t >= 5 * 60e3) fails.set(ip, { t: Date.now(), c: 1 }); else e.c++;
}
setInterval(() => {
  const n = Date.now();
  for (const [k, e] of fails) if (n - e.t > 5 * 60e3) fails.delete(k);
  run('DELETE FROM sessions WHERE expires<?', n);
}, 10 * 60e3).unref();

/* ---------- config (kv) ---------- */
const kvGet = k => { const r = get('SELECT v FROM kv WHERE k=?', k); try { return r ? JSON.parse(r.v) : null; } catch { return null; } };
const kvSet = (k, v) => run('INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v', k, JSON.stringify(v));
const kvDel = k => run('DELETE FROM kv WHERE k=?', k);

if (!kvGet('kode')) kvSet('kode', DEFAULT_KODE_PELATIH);

function struktur() {
  const S = { wilayah: {}, cabang: {}, unit: {} };
  for (const r of all('SELECT * FROM wilayah ORDER BY nama COLLATE NOCASE')) S.wilayah[r.id] = { nama: r.nama };
  for (const r of all('SELECT * FROM cabang ORDER BY nama COLLATE NOCASE')) S.cabang[r.id] = { nama: r.nama, wilayah: r.wilayah_id };
  for (const r of all('SELECT * FROM unit ORDER BY nama COLLATE NOCASE')) S.unit[r.id] = { nama: r.nama, cabang: r.cabang_id, lokasi: r.lokasi };
  return S;
}

function buildS(a) {
  const staff = isPelatih(a);
  const S = {
    ...struktur(), staff: {}, murid: {}, sesi: {}, absen: {}, nilai: {}, materi: {},
    cfg: {}, meta: { sabuk: SABUK },
  };

  if (staff) for (const r of all('SELECT * FROM staff ORDER BY nama COLLATE NOCASE'))
    S.staff[r.id] = { nama: r.nama, wilayah: r.wilayah_id || '' };

  const rw = {};
  for (const r of all('SELECT murid_id,sabuk,tgl FROM sabuk_riwayat ORDER BY id'))
    (rw[r.murid_id] ??= []).push({ sabuk: r.sabuk, tgl: r.tgl });
  const mrows = staff ? all('SELECT * FROM murid ORDER BY nama COLLATE NOCASE') : all('SELECT * FROM murid WHERE id=?', a.uid);
  for (const r of mrows) S.murid[r.id] = {
    nama: r.nama, noAnggota: r.no_anggota, jk: r.jk, telp: r.telp, tglGabung: r.tgl_gabung,
    aktif: !!r.aktif, sabuk: r.sabuk, unit: r.unit_id || '', riwayatSabuk: rw[r.id] || [],
  };

  for (const r of all('SELECT * FROM sesi ORDER BY tgl DESC,id DESC'))
    S.sesi[r.id] = { tgl: r.tgl, materi: r.materi, pelatih: r.pelatih, unit: r.unit_id || '' };

  const own = staff ? [] : [a.uid];
  for (const r of staff ? all('SELECT * FROM absen') : all('SELECT * FROM absen WHERE murid_id=?', ...own))
    S.absen[`${r.sesi_id}_${r.murid_id}`] = { sesi: r.sesi_id, uid: r.murid_id, status: r.status, waktu: r.updated_at };

  const sk = {};
  for (const r of staff ? all('SELECT * FROM nilai_skor') : all('SELECT * FROM nilai_skor WHERE murid_id=?', ...own))
    (sk[`${r.sesi_id}_${r.murid_id}`] ??= {})[r.materi_id] = r.skor;
  for (const r of staff ? all('SELECT * FROM nilai') : all('SELECT * FROM nilai WHERE murid_id=?', ...own)) {
    const k = `${r.sesi_id}_${r.murid_id}`;
    S.nilai[k] = { sesi: r.sesi_id, uid: r.murid_id, skor: sk[k] || {}, catatan: r.catatan, oleh: r.oleh };
  }

  for (const r of all('SELECT * FROM materi ORDER BY urut,rowid')) S.materi[r.id] = { kategori: r.kategori, nama: r.nama };

  const main = { site: kvGet('site') || {} };
  if (staff) main.kode = kvGet('kode') || DEFAULT_KODE_PELATIH;
  S.cfg.main = main;
  return S;
}

const refs = (table, id) => !id || get(`SELECT 1 AS x FROM ${table} WHERE id=?`, id);

function nextNoAnggota() {
  let max = 0;
  for (const r of all("SELECT no_anggota FROM murid WHERE no_anggota LIKE 'SBTI-%'")) {
    const n = parseInt(r.no_anggota.slice(5), 10);
    if (n > max) max = n;
  }
  return 'SBTI-' + String(max + 1).padStart(3, '0');
}

function saveMurid(id, d, { allowPw = true } = {}) {
  const ex = get('SELECT * FROM murid WHERE id=?', id);
  const nama = str(d.nama, 100);
  if (!nama) throw bad('Nama wajib diisi');
  const unit = str(d.unit, 64) || null;
  if (unit && !refs('unit', unit)) throw bad('Unit latihan tidak ditemukan');
  const sabuk = d.sabuk === undefined ? (ex?.sabuk || 'putih') : d.sabuk;
  if (!SABUK_IDS.includes(sabuk)) throw bad('Sabuk tidak valid');
  const jk = d.jk === 'Perempuan' ? 'Perempuan' : 'Laki-laki';
  const tgl = dateOk.test(d.tglGabung || '') ? d.tglGabung : (ex?.tgl_gabung || today());
  const pass = allowPw && typeof d.password === 'string' && d.password.length >= 4 ? hashPw(d.password) : (ex?.pass_hash ?? null);
  const no = str(d.noAnggota, 30) || ex?.no_anggota || nextNoAnggota();
  const aktif = d.aktif === false ? 0 : 1;
  run(`INSERT INTO murid(id,no_anggota,nama,jk,telp,tgl_gabung,aktif,sabuk,unit_id,pass_hash) VALUES(?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET no_anggota=excluded.no_anggota,nama=excluded.nama,jk=excluded.jk,telp=excluded.telp,
       tgl_gabung=excluded.tgl_gabung,aktif=excluded.aktif,sabuk=excluded.sabuk,unit_id=excluded.unit_id,pass_hash=excluded.pass_hash`,
    id, no, nama, jk, str(d.telp, 30), tgl, aktif, sabuk, unit, pass);
  if (!ex || ex.sabuk !== sabuk) run('INSERT INTO sabuk_riwayat(murid_id,sabuk,tgl) VALUES(?,?,?)', id, sabuk, today());
}

const SET = {
  murid(a, key, d) { need(a, 'pelatih'); saveMurid(key, d); },
  staff(a, key, d) {
    need(a, 'pelatih');
    const nama = str(d.nama, 100);
    if (!nama) throw bad('Nama wajib diisi');
    const w = str(d.wilayah, 64) || null;
    run(`INSERT INTO staff(id,nama,wilayah_id) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET nama=excluded.nama,wilayah_id=excluded.wilayah_id`, key, nama, w);
  },
  sesi(a, key, d) {
    need(a, 'pelatih');
    const ex = get('SELECT * FROM sesi WHERE id=?', key);
    const tgl = str(d.tgl, 10), materi = str(d.materi, 200);
    if (!dateOk.test(tgl) || !materi) throw bad('Tanggal dan materi wajib diisi');
    const unit = d.unit === undefined ? (ex?.unit_id ?? null) : (str(d.unit, 64) || null);
    if (unit && !refs('unit', unit)) throw bad('Unit latihan tidak ditemukan');
    const pelatih = str(d.pelatih, 100) || ex?.pelatih || '';
    run(`INSERT INTO sesi(id,tgl,materi,pelatih,unit_id) VALUES(?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET tgl=excluded.tgl,materi=excluded.materi,pelatih=excluded.pelatih,unit_id=excluded.unit_id`,
      key, tgl, materi, pelatih, unit);
  },
  absen(a, key, d) {
    need(a);
    const i = key.indexOf('_');
    if (i < 1) throw bad('Path absen tidak valid');
    const sid = key.slice(0, i), uid = key.slice(i + 1);
    const status = String(d.status || '');
    if (a.role === 'murid') {
      if (uid !== a.uid) throw forbidden();
      if (!['hadir', 'izin', 'sakit'].includes(status)) throw bad('Status absen tidak valid');
    } else if (!['hadir', 'izin', 'sakit', 'alpha'].includes(status)) throw bad('Status absen tidak valid');
    if (!refs('sesi', sid) || !refs('murid', uid)) throw bad('Sesi atau anggota tidak ditemukan');
    run(`INSERT INTO absen(sesi_id,murid_id,status,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP)
         ON CONFLICT(sesi_id,murid_id) DO UPDATE SET status=excluded.status,updated_at=CURRENT_TIMESTAMP`, sid, uid, status);
  },
  nilai(a, key, d) {
    need(a, 'pelatih');
    const i = key.indexOf('_');
    if (i < 1) throw bad('Path nilai tidak valid');
    const sid = key.slice(0, i), uid = key.slice(i + 1);
    if (!refs('sesi', sid) || !refs('murid', uid)) throw bad('Sesi atau anggota tidak ditemukan');
    const valid = new Set(all('SELECT id FROM materi').map(r => r.id));
    run(`INSERT INTO nilai(sesi_id,murid_id,catatan,oleh,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)
         ON CONFLICT(sesi_id,murid_id) DO UPDATE SET catatan=excluded.catatan,oleh=excluded.oleh,updated_at=CURRENT_TIMESTAMP`,
      sid, uid, str(d.catatan, 1000), get('SELECT nama FROM staff WHERE id=?', a.uid)?.nama || 'Pelatih');
    run('DELETE FROM nilai_skor WHERE sesi_id=? AND murid_id=?', sid, uid);
    for (const [mid, val] of Object.entries(d.skor || {})) {
      if (!valid.has(mid) || val === '' || val === null) continue;
      const x = Number(val);
      if (!Number.isFinite(x)) continue;
      run('INSERT INTO nilai_skor(sesi_id,murid_id,materi_id,skor) VALUES(?,?,?,?)', sid, uid, mid, Math.min(100, Math.max(0, x)));
    }
  },
  wilayah(a, key, d) {
    need(a, 'pelatih');
    const nama = str(d.nama, 100);
    if (!nama) throw bad('Nama wilayah wajib diisi');
    run('INSERT INTO wilayah(id,nama) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET nama=excluded.nama', key, nama);
  },
  cabang(a, key, d) {
    need(a, 'pelatih');
    const ex = get('SELECT * FROM cabang WHERE id=?', key);
    const nama = str(d.nama, 100), w = str(d.wilayah, 64) || ex?.wilayah_id;
    if (!nama || !w || !refs('wilayah', w)) throw bad('Wilayah atau nama cabang tidak valid');
    run('INSERT INTO cabang(id,nama,wilayah_id) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET nama=excluded.nama,wilayah_id=excluded.wilayah_id', key, nama, w);
  },
  unit(a, key, d) {
    need(a, 'pelatih');
    const ex = get('SELECT * FROM unit WHERE id=?', key);
    const nama = str(d.nama, 100), c = str(d.cabang, 64) || ex?.cabang_id;
    if (!nama || !c || !refs('cabang', c)) throw bad('Cabang atau nama unit tidak valid');
    run(`INSERT INTO unit(id,nama,lokasi,cabang_id) VALUES(?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET nama=excluded.nama,lokasi=excluded.lokasi,cabang_id=excluded.cabang_id`,
      key, nama, str(d.lokasi ?? ex?.lokasi, 200), c);
  },
  cfg(a, key, d) {
    need(a, 'pelatih');
    if (key !== 'main') throw bad('Konfigurasi tidak dikenal');
    if (d.site !== undefined) {
      const s = d.site || {}, o = {};
      for (const k of ['nama', 'tag', 'sambutan']) if (s[k]) o[k] = str(s[k], 300);
      if (s.logo) {
        if (typeof s.logo !== 'string' || s.logo.length > 400_000) throw bad('Logo terlalu besar');
        o.logo = s.logo;
      }
      Object.keys(o).length ? kvSet('site', o) : kvDel('site');
    }
    if (d.kode !== undefined && str(d.kode, 64)) kvSet('kode', str(d.kode, 64));
  },
};

const DEL = {
  murid(a, key) { need(a, 'pelatih'); run('DELETE FROM murid WHERE id=?', key); run('DELETE FROM sessions WHERE role=? AND uid=?', 'murid', key); },
  staff(a, key) { need(a, 'pelatih'); run('DELETE FROM staff WHERE id=?', key); run('DELETE FROM sessions WHERE role=? AND uid=?', 'pelatih', key); },
  sesi(a, key) { need(a, 'pelatih'); run('DELETE FROM sesi WHERE id=?', key); },
  absen(a, key) {
    need(a, 'pelatih');
    const i = key.indexOf('_');
    if (i > 0) run('DELETE FROM absen WHERE sesi_id=? AND murid_id=?', key.slice(0, i), key.slice(i + 1));
  },
  nilai(a, key) {
    need(a, 'pelatih');
    const i = key.indexOf('_');
    if (i > 0) run('DELETE FROM nilai WHERE sesi_id=? AND murid_id=?', key.slice(0, i), key.slice(i + 1));
  },
  wilayah(a, key) { need(a, 'pelatih'); run('DELETE FROM wilayah WHERE id=?', key); },
  cabang(a, key) { need(a, 'pelatih'); run('DELETE FROM cabang WHERE id=?', key); },
  unit(a, key) { need(a, 'pelatih'); run('DELETE FROM unit WHERE id=?', key); },
};

function parsePath(p) {
  const [col, key, ...rest] = String(p || '').split('/');
  if (rest.length || !col || !key) throw bad('Path tidak valid');
  if (col === 'absen' || col === 'nilai') {
    const i = key.indexOf('_');
    if (i < 1 || !idOk.test(key.slice(0, i)) || !idOk.test(key.slice(i + 1))) throw bad('Path tidak valid');
  } else if (!idOk.test(key)) throw bad('ID tidak valid');
  return [col, key];
}

function dbError(e) {
  if (e instanceof HttpError) return e;
  const m = String(e?.message || '');
  if (m.includes('UNIQUE')) return new HttpError(409, 'Nama sudah dipakai anggota lain');
  if (m.includes('FOREIGN KEY')) return bad('Data yang dirujuk tidak ditemukan');
  console.error(e);
  return new HttpError(500, 'Terjadi kesalahan pada server');
}

const sessionOut = (role, uid) => ({ token: newSession(role, uid), uid, role });

const ROUTES = {
  'GET /api/health': () => ({ ok: true }),
  'GET /api/public': () => ({ site: kvGet('site') || {}, ...struktur(), meta: { sabuk: SABUK } }),

  'POST /api/login'(req, a, b) {
    guard(req);
    const fail = msg => { failed(req); throw new HttpError(401, msg); };
    if (b.role === 'pelatih') {
      const nama = str(b.nama, 100), kode = kvGet('kode') || DEFAULT_KODE_PELATIH;
      if (!nama) throw bad('Nama wajib diisi');
      if (!safeEq(str(b.kode, 64), kode)) fail('Kode akses pelatih salah');
      let s = get('SELECT id FROM staff WHERE lower(nama)=lower(?)', nama);
      if (!s) { s = { id: 'p' + Date.now().toString(36) + crypto.randomBytes(2).toString('hex') }; run('INSERT INTO staff(id,nama) VALUES(?,?)', s.id, nama); }
      return sessionOut('pelatih', s.id);
    }
    if (b.role === 'murid') {
      const q = str(b.nama, 100);
      const rows = all('SELECT id,pass_hash,aktif FROM murid WHERE lower(nama)=lower(?) OR lower(no_anggota)=lower(?)', q, q);
      const m = rows.find(r => checkPw(String(b.password || ''), r.pass_hash));
      if (!m) fail('Nama/No. Anggota atau kata sandi salah');
      if (!m.aktif) throw new HttpError(403, 'Akun Anda dinonaktifkan, hubungi pelatih');
      return sessionOut('murid', m.id);
    }
    throw bad('Peran tidak valid');
  },

  'POST /api/register'(req, a, b) {
    guard(req);
    const nama = str(b.nama, 100), pw = String(b.password || ''), wilayahNama = str(b.wilayah, 100);
    if (!nama) throw bad('Nama wajib diisi');
    if (!wilayahNama) throw bad('Nama wilayah wajib diisi');
    if (pw.length < 4) throw bad('Kata sandi minimal 4 karakter');
    const id = 'm' + Date.now().toString(36) + crypto.randomBytes(2).toString('hex');
    tx(() => {
      let w = get('SELECT id FROM wilayah WHERE lower(nama)=lower(?)', wilayahNama);
      if (!w) {
        const wid = 'w' + Date.now().toString(36) + crypto.randomBytes(2).toString('hex');
        run('INSERT INTO wilayah(id,nama) VALUES(?,?)', wid, wilayahNama);
      }
      saveMurid(id, { nama, jk: b.jk, telp: b.telp, sabuk: b.sabuk || 'putih', password: pw });
    });
    return sessionOut('murid', id);
  },

  'GET /api/me'(req, a) { need(a); return { uid: a.uid, role: a.role }; },
  'GET /api/data'(req, a) { need(a); return { S: buildS(a) }; },
  'POST /api/set'(req, a, b) {
    need(a);
    const [col, key] = parsePath(b.path);
    if (!SET[col]) throw bad('Koleksi tidak dikenal');
    if (typeof b.data !== 'object' || !b.data) throw bad('Data tidak valid');
    tx(() => SET[col](a, key, b.data));
    return { ok: true };
  },
  'POST /api/del'(req, a, b) {
    need(a);
    const [col, key] = parsePath(b.path);
    if (!DEL[col]) throw forbidden();
    tx(() => DEL[col](a, key));
    return { ok: true };
  },
  'POST /api/logout'(req, a) { if (a) run('DELETE FROM sessions WHERE token_hash=?', sha(tokenOf(req))); return { ok: true }; },
};

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json',
};

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > 2_000_000) { reject(new HttpError(413, 'Data terlalu besar')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!n) return resolve({});
      try { const j = JSON.parse(Buffer.concat(chunks).toString('utf8')); resolve(j && typeof j === 'object' ? j : {}); }
      catch { reject(bad('JSON tidak valid')); }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  if (!['GET', 'HEAD'].includes(req.method) || !fs.existsSync(PUB)) return false;
  let p;
  try { p = decodeURIComponent(pathname); } catch { return false; }
  if (p.endsWith('/')) p += 'index.html';
  const f = path.normalize(path.join(PUB, p));
  if (f !== PUB && !f.startsWith(PUB + path.sep)) return false;
  if (!fs.existsSync(f) || !fs.statSync(f).isFile()) return false;
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  if (req.method === 'HEAD') return res.end(), true;
  fs.createReadStream(f).pipe(res);
  return true;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  if (CORS_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  }
  const { pathname } = new URL(req.url, 'http://x');
  if (!pathname.startsWith('/api/')) {
    if (serveStatic(req, res, pathname)) return;
    return send(res, 404, { error: 'Tidak ditemukan' });
  }
  try {
    const h = ROUTES[`${req.method} ${pathname.replace(/\/$/, '')}`];
    if (!h) throw new HttpError(404, 'Endpoint tidak ditemukan');
    const body = req.method === 'POST' ? await readBody(req) : {};
    send(res, 200, h(req, auth(req), body) ?? {});
  } catch (e) {
    const err = dbError(e);
    send(res, err.code, { error: err.message });
  }
});

server.listen(PORT, () => console.log(`SBTI backend jalan di http://localhost:${PORT}  (DB: ${db.location?.() ?? 'sqlite'})`));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { server.close(() => { try { db.close(); } catch {} process.exit(0); }); });