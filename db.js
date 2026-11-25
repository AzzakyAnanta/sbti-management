import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const FILE = process.env.DB_FILE || path.join(process.cwd(), 'data', 'sbti.db');
fs.mkdirSync(path.dirname(FILE), { recursive: true });

export const db = new DatabaseSync(FILE);
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');

export const all = (sql, ...a) => db.prepare(sql).all(...a);
export const get = (sql, ...a) => db.prepare(sql).get(...a);
export const run = (sql, ...a) => db.prepare(sql).run(...a);
export function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

// Urutan sabuk dari terendah ke tertinggi
export const SABUK = [
  { id: 'putih', nama: 'Putih' },
  { id: 'kuning', nama: 'Kuning' },
  { id: 'hijau', nama: 'Hijau' },
  { id: 'biru', nama: 'Biru' },
  { id: 'merah', nama: 'Merah' },
  { id: 'hitam', nama: 'Hitam Polos' },
  { id: 'hitam-1', nama: 'Hitam Strip 1' },
  { id: 'hitam-2', nama: 'Hitam Strip 2' },
  { id: 'hitam-3', nama: 'Hitam Strip 3' },
];

db.exec(`
CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS admin (id INTEGER PRIMARY KEY CHECK (id = 1), pass_hash TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, role TEXT NOT NULL, uid TEXT NOT NULL, expires INTEGER NOT NULL
);

-- Hirarki: wilayah > cabang > unit latihan
CREATE TABLE IF NOT EXISTS wilayah (
  id TEXT PRIMARY KEY, nama TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS cabang (
  id TEXT PRIMARY KEY, nama TEXT NOT NULL,
  wilayah_id TEXT NOT NULL REFERENCES wilayah(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS unit (
  id TEXT PRIMARY KEY, nama TEXT NOT NULL, lokasi TEXT NOT NULL DEFAULT '',
  cabang_id TEXT NOT NULL REFERENCES cabang(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS staff (
  id TEXT PRIMARY KEY, nama TEXT NOT NULL,
  wilayah_id TEXT REFERENCES wilayah(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS murid (
  id TEXT PRIMARY KEY, no_anggota TEXT NOT NULL DEFAULT '', nama TEXT NOT NULL,
  jk TEXT NOT NULL DEFAULT 'Laki-laki', telp TEXT NOT NULL DEFAULT '',
  tgl_gabung TEXT NOT NULL DEFAULT '', aktif INTEGER NOT NULL DEFAULT 1,
  sabuk TEXT NOT NULL DEFAULT 'putih',
  unit_id TEXT REFERENCES unit(id) ON DELETE SET NULL,
  pass_hash TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS murid_nama_uq ON murid(lower(nama));

CREATE TABLE IF NOT EXISTS sabuk_riwayat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  murid_id TEXT NOT NULL REFERENCES murid(id) ON DELETE CASCADE,
  sabuk TEXT NOT NULL, tgl TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sesi (
  id TEXT PRIMARY KEY, tgl TEXT NOT NULL, materi TEXT NOT NULL, pelatih TEXT NOT NULL DEFAULT '',
  unit_id TEXT REFERENCES unit(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS absen (
  sesi_id TEXT NOT NULL REFERENCES sesi(id) ON DELETE CASCADE,
  murid_id TEXT NOT NULL REFERENCES murid(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('hadir','izin','sakit','alpha')),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (sesi_id, murid_id)
);

-- Item materi penilaian (Fisik, Kelincahan, Kekuatan, Jurus)
CREATE TABLE IF NOT EXISTS materi (
  id TEXT PRIMARY KEY, kategori TEXT NOT NULL, nama TEXT NOT NULL, urut INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS nilai (
  sesi_id TEXT NOT NULL REFERENCES sesi(id) ON DELETE CASCADE,
  murid_id TEXT NOT NULL REFERENCES murid(id) ON DELETE CASCADE,
  catatan TEXT NOT NULL DEFAULT '', oleh TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (sesi_id, murid_id)
);
CREATE TABLE IF NOT EXISTS nilai_skor (
  sesi_id TEXT NOT NULL, murid_id TEXT NOT NULL,
  materi_id TEXT NOT NULL REFERENCES materi(id) ON DELETE CASCADE,
  skor REAL NOT NULL,
  PRIMARY KEY (sesi_id, murid_id, materi_id),
  FOREIGN KEY (sesi_id, murid_id) REFERENCES nilai(sesi_id, murid_id) ON DELETE CASCADE
);
`);

// Seed materi awal (hanya kalau tabel masih kosong)
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
if (!get('SELECT 1 AS x FROM materi LIMIT 1')) {
  const SEED = [
    ['Fisik', ['Lari', 'Push up', 'Sit up', 'Back up']],
    ['Kelincahan', ['Reaksi', 'Keseimbangan']],
    ['Kekuatan', ['Daya tahan otot', 'Kelenturan', 'Power']],
    ['Jurus', ['Hafal', 'Menguasai', 'Mahir']],
  ];
  let urut = 0;
  tx(() => {
    for (const [kat, items] of SEED)
      for (const n of items)
        run('INSERT INTO materi(id,kategori,nama,urut) VALUES(?,?,?,?)', `${slug(kat)}_${slug(n)}`, kat, n, ++urut);
  });
}
