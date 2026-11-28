import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { db, all, get, run, tx, SABUK } from './db.js';

const PORT = +process.env.PORT || 3000;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.resolve(process.env.STATIC_DIR || HERE);
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

try { db.exec('ALTER TABLE staff ADD COLUMN pass_hash TEXT'); } catch {}
try { db.exec("ALTER TABLE staff ADD COLUMN telp TEXT NOT NULL DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE staff ADD COLUMN foto TEXT NOT NULL DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE sesi ADD COLUMN jam TEXT NOT NULL DEFAULT ''"); } catch {}
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

  for (const r of all('SELECT * FROM staff ORDER BY nama COLLATE NOCASE'))
    S.staff[r.id] = { nama: r.nama, wilayah: r.wilayah_id || '', telp: r.telp || '', foto: r.foto || '' };

  const rw = {};
  for (const r of all('SELECT murid_id,sabuk,tgl FROM sabuk_riwayat ORDER BY id'))
    (rw[r.murid_id] ??= []).push({ sabuk: r.sabuk, tgl: r.tgl });
  const mrows = staff ? all('SELECT * FROM murid ORDER BY nama COLLATE NOCASE') : all('SELECT * FROM murid WHERE id=?', a.uid);
  for (const r of mrows) S.murid[r.id] = {
    nama: r.nama, noAnggota: r.no_anggota, jk: r.jk, telp: r.telp, tglGabung: r.tgl_gabung,
    aktif: !!r.aktif, sabuk: r.sabuk, unit: r.unit_id || '', foto: r.foto || '', riwayatSabuk: rw[r.id] || [],
  };

  for (const r of all('SELECT * FROM sesi ORDER BY tgl DESC,id DESC'))
    S.sesi[r.id] = { tgl: r.tgl, jam: r.jam || '', materi: r.materi, pelatih: r.pelatih, unit: r.unit_id || '' };

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
  const pass = allowPw && typeof d.password === 'string' && d.password.length >= 1 ? hashPw(d.password) : (ex?.pass_hash ?? null);
  const no = str(d.noAnggota, 30) || ex?.no_anggota || nextNoAnggota();
  const aktif = d.aktif === false ? 0 : 1;
  const foto = typeof d.foto === 'string' && d.foto.length <= 400_000 ? d.foto : (ex?.foto || '');
  run(`INSERT INTO murid(id,no_anggota,nama,jk,telp,tgl_gabung,aktif,sabuk,unit_id,foto,pass_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET no_anggota=excluded.no_anggota,nama=excluded.nama,jk=excluded.jk,telp=excluded.telp,
       tgl_gabung=excluded.tgl_gabung,aktif=excluded.aktif,sabuk=excluded.sabuk,unit_id=excluded.unit_id,foto=excluded.foto,pass_hash=excluded.pass_hash`,
    id, no, nama, jk, str(d.telp, 30), tgl, aktif, sabuk, unit, foto, pass);
  if (!ex || ex.sabuk !== sabuk) run('INSERT INTO sabuk_riwayat(murid_id,sabuk,tgl) VALUES(?,?,?)', id, sabuk, today());
}

const SET = {
  murid(a, key, d) {
    if (a.role === 'murid') {
      if (key !== a.uid) throw forbidden();
      const ex = get('SELECT * FROM murid WHERE id=?', key);
      if (!ex) throw bad('Akun tidak ditemukan');
      const nama = d.nama !== undefined ? str(d.nama, 100) : ex.nama;
      if (!nama) throw bad('Nama wajib diisi');
      const jk = d.jk !== undefined ? (d.jk === 'Perempuan' ? 'Perempuan' : 'Laki-laki') : ex.jk;
      const telp = d.telp !== undefined ? str(d.telp, 30) : ex.telp;
      const foto = typeof d.foto === 'string' && d.foto.length <= 400_000 ? d.foto : (ex.foto || '');
      const pass = typeof d.password === 'string' && d.password.length >= 1 ? hashPw(d.password) : ex.pass_hash;
      run('UPDATE murid SET nama=?,jk=?,telp=?,foto=?,pass_hash=? WHERE id=?', nama, jk, telp, foto, pass, key);
      return;
    }
    need(a, 'pelatih');
    saveMurid(key, d);
  },

  wilayah(a, key, d) {
    need(a, 'pelatih');
    const nama = str(d.nama, 100); if (!nama) throw bad('Nama wilayah wajib diisi');
    run('INSERT INTO wilayah(id,nama) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET nama=excluded.nama', key, nama);
  },

  cabang(a, key, d) {
    need(a, 'pelatih');
    const nama = str(d.nama, 100), w = str(d.wilayah, 64);
    if (!nama || !w) throw bad('Nama cabang dan wilayah wajib diisi');
    if (!refs('wilayah', w)) throw bad('Wilayah tidak ditemukan');
    run('INSERT INTO cabang(id,nama,wilayah_id) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET nama=excluded.nama,wilayah_id=excluded.wilayah_id', key, nama, w);
  },

  unit(a, key, d) {
    need(a, 'pelatih');
    const nama = str(d.nama, 100), c = str(d.cabang, 64);
    if (!nama || !c) throw bad('Nama unit dan cabang wajib diisi');
    if (!refs('cabang', c)) throw bad('Cabang tidak ditemukan');
    run('INSERT INTO unit(id,nama,lokasi,cabang_id) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET nama=excluded.nama,lokasi=excluded.lokasi,cabang_id=excluded.cabang_id',
      key, nama, str(d.lokasi, 200), c);
  },

  sesi(a, key, d) {
    need(a, 'pelatih');
    const materi = str(d.materi, 200), tgl = str(d.tgl, 20), jam = str(d.jam, 30);
    if (!materi || !dateOk.test(tgl)) throw bad('Tanggal dan materi latihan wajib valid');
    const unit = str(d.unit, 64) || null;
    if (unit && !refs('unit', unit)) throw bad('Unit latihan tidak ditemukan');
    const pelaku = str(d.pelatih, 100) || get('SELECT nama FROM staff WHERE id=?', a.uid)?.nama || '';
    run('INSERT INTO sesi(id,tgl,jam,materi,pelatih,unit_id) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET tgl=excluded.tgl,jam=excluded.jam,materi=excluded.materi,pelatih=excluded.pelatih,unit_id=excluded.unit_id',
      key, tgl, jam, materi, pelaku, unit);
  },

  absen(a, key, d) {
    const i = key.indexOf('_'); if (i < 1) throw bad('Kunci absensi tidak valid');
    const sesi = key.slice(0, i), uid = key.slice(i + 1);
    const s = get('SELECT id,tgl FROM sesi WHERE id=?', sesi);
    if (!s) throw bad('Sesi latihan tidak ditemukan');
    if (!get('SELECT 1 AS x FROM murid WHERE id=?', uid)) throw bad('Anggota tidak ditemukan');

    if (a.role === 'murid') {
      if (uid !== a.uid) throw forbidden();
      if (!['hadir', 'izin', 'sakit'].includes(d.status)) throw bad('Status absensi tidak valid');
      if (s.tgl !== today()) throw bad('Absensi mandiri hanya dibuka pada hari latihan berlangsung');
    } else {
      need(a, 'pelatih');
      if (!['hadir', 'izin', 'sakit', 'alpha'].includes(d.status)) throw bad('Status absensi tidak valid');
    }
    const waktu = new Date(Date.now() + TZ_OFFSET * 36e5).toISOString();
    run(`INSERT INTO absen(sesi_id,murid_id,status,updated_at) VALUES(?,?,?,?)
         ON CONFLICT(sesi_id,murid_id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at`,
      sesi, uid, d.status, waktu);
  },

  nilai(a, key, d) {
    need(a, 'pelatih');
    const i = key.indexOf('_'); if (i < 1) throw bad('Kunci nilai tidak valid');
    const sesi = key.slice(0, i), uid = key.slice(i + 1);
    if (!get('SELECT 1 AS x FROM sesi WHERE id=?', sesi) || !get('SELECT 1 AS x FROM murid WHERE id=?', uid))
      throw bad('Sesi atau anggota tidak ditemukan');
    const oleh = get('SELECT nama FROM staff WHERE id=?', a.uid)?.nama || 'Pelatih';
    tx(() => {
      run(`INSERT INTO nilai(sesi_id,murid_id,catatan,oleh,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)
           ON CONFLICT(sesi_id,murid_id) DO UPDATE SET catatan=excluded.catatan,oleh=excluded.oleh,updated_at=CURRENT_TIMESTAMP`,
        sesi, uid, str(d.catatan, 1000), oleh);
      run('DELETE FROM nilai_skor WHERE sesi_id=? AND murid_id=?', sesi, uid);
      for (const [mid, raw] of Object.entries(d.skor || {})) {
        if (!idOk.test(mid) || !refs('materi', mid)) continue;
        const v = Number(raw);
        if (!Number.isFinite(v) || v < 0 || v > 100) throw bad('Nilai harus angka 0–100');
        run('INSERT INTO nilai_skor(sesi_id,murid_id,materi_id,skor) VALUES(?,?,?,?)', sesi, uid, mid, v);
      }
    });
  },

  materi(a, key, d) {
    need(a, 'pelatih');
    const nama = str(d.nama, 80), kat = str(d.kategori, 40) || 'Umum';
    if (!nama) throw bad('Nama materi wajib diisi');
    const max = get('SELECT COALESCE(MAX(urut),0) AS m FROM materi')?.m || 0;
    run('INSERT INTO materi(id,kategori,nama,urut) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET kategori=excluded.kategori,nama=excluded.nama',
      key, kat, nama, max + 1);
  },

  staff(a, key, d) {
    need(a, 'pelatih');
    const ex = get('SELECT * FROM staff WHERE id=?', key);
    if (!ex) throw bad('Pelatih tidak ditemukan');
    const nama = d.nama !== undefined ? str(d.nama, 100) : ex.nama;
    if (!nama) throw bad('Nama pelatih wajib diisi');
    const w = d.wilayah !== undefined ? (str(d.wilayah, 64) || null) : ex.wilayah_id;
    if (w && !refs('wilayah', w)) throw bad('Wilayah tidak ditemukan');
    const telp = d.telp !== undefined ? str(d.telp, 30) : (ex.telp || '');
    const foto = typeof d.foto === 'string' && d.foto.length <= 400_000 ? d.foto : (ex.foto || '');
    const pass = typeof d.password === 'string' && d.password.length >= 1 ? hashPw(d.password) : ex.pass_hash;
    run('UPDATE staff SET nama=?,wilayah_id=?,telp=?,foto=?,pass_hash=? WHERE id=?', nama, w, telp, foto, pass, key);
  },

  cfg(a, key, d) {
    need(a, 'pelatih');
    if (key !== 'main' || typeof d !== 'object' || !d) throw bad('Konfigurasi tidak valid');
    if (typeof d.kode === 'string' && d.kode.trim().length >= 3) kvSet('kode', d.kode.trim().slice(0, 64));
    if (d.site && typeof d.site === 'object') {
      const logo = typeof d.site.logo === 'string' && d.site.logo.length <= 400_000 ? d.site.logo : '';
      kvSet('site', {
        nama: str(d.site.nama, 80),
        tag: str(d.site.tag, 120),
        sambutan: str(d.site.sambutan, 300),
        logo,
      });
    }
  },
};

const DEL_TABLE = { wilayah: 'wilayah', cabang: 'cabang', unit: 'unit', murid: 'murid', sesi: 'sesi', materi: 'materi', staff: 'staff' };

/* ---------- routes ---------- */
function sessionOut(role, uid) {
  const token = newSession(role, uid);
  return { token, role, uid };
}

const ROUTES = {
  'GET /api/public': () => ({ ...struktur(), site: kvGet('site') || {}, sabuk: SABUK }),

  'POST /api/login': (req, b) => {
    guard(req);
    const role = b.role;
    if (role === 'murid') {
      const q = str(b.nama, 100), pw = String(b.password || '');
      if (!q || !pw) throw bad('Nama/nomor anggota dan kata sandi wajib diisi');
      const m = get('SELECT * FROM murid WHERE LOWER(nama)=LOWER(?) OR LOWER(no_anggota)=LOWER(?)', q, q);
      if (!m || !checkPw(pw, m.pass_hash)) { failed(req); throw new HttpError(401, 'Nama/nomor anggota atau kata sandi salah'); }
      if (!m.aktif) throw new HttpError(403, 'Akun Anda dinonaktifkan, hubungi pelatih');
      return sessionOut('murid', m.id);
    }
    if (role === 'pelatih') {
      const nama = str(b.nama, 100), pw = String(b.password || '');
      if (!nama || !pw) throw bad('Nama pelatih dan kata sandi wajib diisi');
      const s = get('SELECT * FROM staff WHERE LOWER(nama)=LOWER(?)', nama);
      if (!s || !s.pass_hash || !checkPw(pw, s.pass_hash)) { failed(req); throw new HttpError(401, 'Nama pelatih atau kata sandi salah'); }
      return sessionOut('pelatih', s.id);
    }
    throw bad('Peran tidak dikenali');
  },

  'POST /api/register': (_req, b) => {
    if (b.role === 'pelatih') {
      const nama = str(b.nama, 100), pw = String(b.password || '');
      if (!nama) throw bad('Nama lengkap pelatih wajib diisi');
      if (!pw) throw bad('Kata sandi wajib diisi');
      if (get('SELECT 1 AS x FROM staff WHERE LOWER(nama)=LOWER(?)', nama))
        throw bad('Nama pelatih sudah terdaftar, silakan masuk di tab Masuk');
      const id = 'p' + crypto.randomBytes(6).toString('hex');
      run('INSERT INTO staff(id,nama,pass_hash) VALUES(?,?,?)', id, nama, hashPw(pw));
      return sessionOut('pelatih', id);
    }
    const nama = str(b.nama, 100), pw = String(b.password || '');
    const jk = str(b.jk, 20), telp = str(b.telp, 30);
    const wilayahNama = str(b.wilayah, 100), cabangNama = str(b.cabang, 100), unitNama = str(b.unit, 100);
    const sabuk = str(b.sabuk, 30), noAnggota = str(b.noAnggota, 30);
    if (!nama || !jk || !telp || !wilayahNama || !cabangNama || !unitNama || !sabuk || !noAnggota || !pw)
      throw bad('Semua kolom pendaftaran wajib diisi');
    if (jk !== 'Laki-laki' && jk !== 'Perempuan') throw bad('Jenis kelamin tidak valid');
    if (!SABUK_IDS.includes(sabuk)) throw bad('Tingkatan sabuk tidak valid');
    if (get('SELECT 1 AS x FROM murid WHERE LOWER(nama)=LOWER(?)', nama))
      throw bad('Nama sudah terdaftar, silakan masuk');
    if (get('SELECT 1 AS x FROM murid WHERE LOWER(no_anggota)=LOWER(?)', noAnggota))
      throw bad('Nomor anggota sudah terdaftar, gunakan nomor lain');

    let w = get('SELECT id FROM wilayah WHERE LOWER(nama)=LOWER(?)', wilayahNama);
    if (!w) {
      const wId = 'w' + crypto.randomBytes(6).toString('hex');
      run('INSERT INTO wilayah(id,nama) VALUES(?,?)', wId, wilayahNama);
      w = { id: wId };
    }
    let c = get('SELECT id FROM cabang WHERE LOWER(nama)=LOWER(?) AND wilayah_id=?', cabangNama, w.id);
    if (!c) {
      const cId = 'c' + crypto.randomBytes(6).toString('hex');
      run('INSERT INTO cabang(id,nama,wilayah_id) VALUES(?,?,?)', cId, cabangNama, w.id);
      c = { id: cId };
    }
    let u = get('SELECT id FROM unit WHERE LOWER(nama)=LOWER(?) AND cabang_id=?', unitNama, c.id);
    if (!u) {
      const uId = 'u' + crypto.randomBytes(6).toString('hex');
      run('INSERT INTO unit(id,nama,lokasi,cabang_id) VALUES(?,?,?,?)', uId, unitNama, '', c.id);
      u = { id: uId };
    }

    const id = 'm' + crypto.randomBytes(6).toString('hex');
    saveMurid(id, { nama, noAnggota, jk, telp, unit: u.id, sabuk, password: pw });
    return sessionOut('murid', id);
  },

  'GET /api/me': req => {
    const a = need(auth(req));
    return { role: a.role, uid: a.uid };
  },

  'POST /api/logout': req => {
    const t = tokenOf(req);
    if (t) run('DELETE FROM sessions WHERE token_hash=?', sha(t));
    return { ok: true };
  },

  'GET /api/data': req => ({ S: buildS(need(auth(req))) }),

  'GET /api/backup': req => {
    need(auth(req), 'pelatih');
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      wilayah: all('SELECT * FROM wilayah'),
      cabang: all('SELECT * FROM cabang'),
      unit: all('SELECT * FROM unit'),
      staff: all('SELECT * FROM staff'),
      murid: all('SELECT * FROM murid'),
      sabuk_riwayat: all('SELECT * FROM sabuk_riwayat'),
      sesi: all('SELECT * FROM sesi'),
      absen: all('SELECT * FROM absen'),
      materi: all('SELECT * FROM materi'),
      nilai: all('SELECT * FROM nilai'),
      nilai_skor: all('SELECT * FROM nilai_skor'),
      kv: all('SELECT * FROM kv'),
    };
  },

  'POST /api/restore': (req, b) => {
    need(auth(req), 'pelatih');
    if (!b || typeof b !== 'object' || !Array.isArray(b.wilayah)) throw bad('Format file backup tidak valid');
    tx(() => {
      run('DELETE FROM nilai_skor'); run('DELETE FROM nilai'); run('DELETE FROM absen');
      run('DELETE FROM sesi'); run('DELETE FROM sabuk_riwayat'); run('DELETE FROM murid');
      run('DELETE FROM unit'); run('DELETE FROM cabang'); run('DELETE FROM wilayah');
      for (const r of (b.wilayah || [])) run('INSERT INTO wilayah(id,nama,created_at) VALUES(?,?,?)', r.id, r.nama, r.created_at || '');
      for (const r of (b.cabang || [])) run('INSERT INTO cabang(id,nama,wilayah_id) VALUES(?,?,?)', r.id, r.nama, r.wilayah_id);
      for (const r of (b.unit || [])) run('INSERT INTO unit(id,nama,lokasi,cabang_id) VALUES(?,?,?,?)', r.id, r.nama, r.lokasi || '', r.cabang_id);
      for (const r of (b.staff || [])) run('INSERT OR IGNORE INTO staff(id,nama,wilayah_id,telp,foto,pass_hash) VALUES(?,?,?,?,?,?)', r.id, r.nama, r.wilayah_id || null, r.telp || '', r.foto || '', r.pass_hash || null);
      for (const r of (b.murid || [])) run('INSERT INTO murid(id,no_anggota,nama,jk,telp,tgl_gabung,aktif,sabuk,unit_id,foto,pass_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?)', r.id, r.no_anggota, r.nama, r.jk || 'Laki-laki', r.telp || '', r.tgl_gabung || '', r.aktif ?? 1, r.sabuk || 'putih', r.unit_id || null, r.foto || '', r.pass_hash || null);
      for (const r of (b.sabuk_riwayat || [])) run('INSERT INTO sabuk_riwayat(murid_id,sabuk,tgl) VALUES(?,?,?)', r.murid_id, r.sabuk, r.tgl);
      for (const r of (b.sesi || [])) run('INSERT INTO sesi(id,tgl,jam,materi,pelatih,unit_id) VALUES(?,?,?,?,?,?)', r.id, r.tgl, r.jam || '', r.materi, r.pelatih || '', r.unit_id || null);
      for (const r of (b.absen || [])) run('INSERT INTO absen(sesi_id,murid_id,status,updated_at) VALUES(?,?,?,?)', r.sesi_id, r.murid_id, r.status, r.updated_at || '');
      if (Array.isArray(b.materi) && b.materi.length) {
        run('DELETE FROM materi');
        for (const r of b.materi) run('INSERT INTO materi(id,kategori,nama,urut) VALUES(?,?,?,?)', r.id, r.kategori, r.nama, r.urut || 0);
      }
      for (const r of (b.nilai || [])) run('INSERT INTO nilai(sesi_id,murid_id,catatan,oleh,updated_at) VALUES(?,?,?,?,?)', r.sesi_id, r.murid_id, r.catatan || '', r.oleh || '', r.updated_at || '');
      for (const r of (b.nilai_skor || [])) run('INSERT INTO nilai_skor(sesi_id,murid_id,materi_id,skor) VALUES(?,?,?,?)', r.sesi_id, r.murid_id, r.materi_id, r.skor);
      for (const r of (b.kv || [])) run('INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v', r.k, r.v);
    });
    return { ok: true };
  },

  'POST /api/set': (req, b) => {
    const a = need(auth(req));
    const p = str(b.path, 140), s = p.indexOf('/');
    if (s < 1) throw bad('Path tidak valid');
    const col = p.slice(0, s), key = p.slice(s + 1);
    if (!idOk.test(key) || !SET[col]) throw bad('Target tidak valid');
    SET[col](a, key, b.data || {});
    return { ok: true };
  },

  'POST /api/del': (req, b) => {
    const a = need(auth(req));
    const p = str(b.path, 140), s = p.indexOf('/');
    if (s < 1) throw bad('Path tidak valid');
    const col = p.slice(0, s), key = p.slice(s + 1);
    if (!idOk.test(key)) throw bad('Kunci tidak valid');

    if (col === 'absen') {
      const i = key.indexOf('_'); if (i < 1) throw bad('Kunci tidak valid');
      const sesi = key.slice(0, i), uid = key.slice(i + 1);
      if (a.role === 'murid') {
        if (uid !== a.uid) throw forbidden();
        const sr = get('SELECT tgl FROM sesi WHERE id=?', sesi);
        if (!sr || sr.tgl !== today()) throw bad('Absensi hanya bisa dibatalkan pada hari yang sama');
      } else need(a, 'pelatih');
      run('DELETE FROM absen WHERE sesi_id=? AND murid_id=?', sesi, uid);
      return { ok: true };
    }
    need(a, 'pelatih');
    const t = DEL_TABLE[col]; if (!t) throw bad('Target tidak valid');
    if (col === 'staff' && key === a.uid) throw bad('Tidak bisa menghapus akun Anda sendiri yang sedang aktif');
    run(`DELETE FROM ${t} WHERE id=?`, key);
    return { ok: true };
  },
};

/* ---------- HTTP server & static files ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};
const ALLOWED_STATIC = new Set(['/index.html', '/app.js', '/style.css', '/logo.png']);

function readBody(req) {
  return new Promise((res, rej) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 800_000) { req.destroy(); rej(new HttpError(413, 'Data terlalu besar')); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return res({});
      try { res(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { rej(bad('Format JSON tidak valid')); }
    });
    req.on('error', rej);
  });
}

function cors(req, res) {
  if (!CORS_ORIGIN) return;
  const o = req.headers.origin;
  if (CORS_ORIGIN === '*' || o === CORS_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN === '*' ? '*' : o);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Vary', 'Origin');
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    const fn = ROUTES[`${req.method} ${url.pathname}`];
    try {
      if (!fn) throw new HttpError(404, 'Endpoint tidak ditemukan');
      const body = req.method === 'POST' ? await readBody(req) : {};
      const out = await fn(req, body);
      const data = JSON.stringify(out);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(data);
    } catch (e) {
      const code = e instanceof HttpError ? e.code : 500;
      if (code === 500) console.error(e);
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: code === 500 ? 'Terjadi kesalahan pada server' : e.message }));
    }
    return;
  }

  let p = url.pathname === '/' ? '/index.html' : url.pathname;
  if (!ALLOWED_STATIC.has(p)) { res.writeHead(404); res.end('Not found'); return; }
  const file = path.join(PUB, p);
  if (!file.startsWith(PUB)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
});

server.listen(PORT, () => console.log(`SBTI Management System aktif di http://localhost:${PORT}`));
