import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 3999, BASE = `http://localhost:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sbti-'));
const srv = spawn('node', ['server.js'], { env: { ...process.env, PORT, DB_FILE: path.join(dir, 't.db') }, stdio: 'ignore' });
let ok = 0, ko = 0;
const t = (name, cond) => { cond ? ok++ : (ko++, console.log('GAGAL:', name)); };

async function api(p, { tok, body } = {}) {
  const r = await fetch(BASE + '/api/' + p, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { code: r.status, j: await r.json().catch(() => ({})) };
}
const set = (tok, p, data) => api('set', { tok, body: { path: p, data } });
const del = (tok, p) => api('del', { tok, body: { path: p } });

try {
  for (let i = 0; i < 40; i++) { try { await fetch(BASE + '/api/health'); break; } catch { await new Promise(r => setTimeout(r, 100)); } }

  let r = await api('public');
  t('adminReady false di awal', r.j.adminReady === false);
  t('public ada 9 sabuk', r.j.meta.sabuk.length === 9);

  r = await api('setup-admin', { body: { password: '123' } });
  t('password admin pendek ditolak', r.code === 400);
  r = await api('setup-admin', { body: { password: 'admin123' } });
  const A = r.j.token; t('setup admin ok', !!A);
  r = await api('setup-admin', { body: { password: 'admin456' } });
  t('setup admin kedua ditolak', r.code === 403);

  r = await api('data', { tok: A });
  t('12 materi ter-seed', Object.keys(r.j.S.materi).length === 12);
  t('aspek untuk frontend lama ada', r.j.S.cfg.main.aspek.length === 12 && r.j.S.cfg.main.aspek[0].nama.startsWith('Fisik'));
  t('tanpa token ditolak 401', (await api('data')).code === 401);

  // wilayah > cabang > unit
  t('wilayah', (await set(A, 'wilayah/w1', { nama: 'Jawa Barat' })).code === 200);
  t('cabang', (await set(A, 'cabang/c1', { nama: 'Bandung', wilayah: 'w1' })).code === 200);
  t('cabang wilayah ngawur ditolak', (await set(A, 'cabang/c2', { nama: 'X', wilayah: 'nope' })).code === 400);
  t('unit', (await set(A, 'unit/u1', { nama: 'Unit Dago', cabang: 'c1', lokasi: 'GOR Dago' })).code === 200);

  // pelatih
  t('login pelatih sebelum kode dibuat ditolak', (await api('login', { body: { role: 'pelatih', nama: 'Budi', kode: 'x' } })).code === 403);
  t('set kode', (await set(A, 'cfg/main', { kode: 'KODE1' })).code === 200);
  t('kode salah', (await api('login', { body: { role: 'pelatih', nama: 'Budi', kode: 'salah' } })).code === 401);
  r = await api('login', { body: { role: 'pelatih', nama: 'Budi', kode: 'KODE1' } });
  const P = r.j.token; t('login pelatih', !!P);
  r = await api('data', { tok: P });
  t('pelatih tidak lihat kode', r.j.S.cfg.main.kode === undefined);
  t('pelatih bisa tambah wilayah', (await set(P, 'wilayah/w2', { nama: 'Jawa Tengah' })).code === 200);
  t('pelatih tidak bisa hapus wilayah', (await del(P, 'wilayah/w2')).code === 403);
  t('pelatih tidak bisa ubah cfg', (await set(P, 'cfg/main', { kode: 'hack' })).code === 403);

  // murid
  t('murid manual + sabuk + unit', (await set(P, 'murid/m1', { nama: 'Andi', jk: 'Laki-laki', sabuk: 'kuning', unit: 'u1', password: '1234' })).code === 200);
  t('sabuk ngawur ditolak', (await set(P, 'murid/m1', { nama: 'Andi', sabuk: 'ungu' })).code === 400);
  t('nama kembar ditolak', (await set(P, 'murid/m9', { nama: 'andi' })).code === 409);
  t('ganti sabuk', (await set(P, 'murid/m1', { nama: 'Andi', sabuk: 'hijau', unit: 'u1' })).code === 200);
  r = await api('data', { tok: A });
  t('no anggota otomatis', r.j.S.murid.m1.noAnggota === 'SBTI-001');
  t('password tidak bocor', JSON.stringify(r.j).includes('pass') === false);
  t('riwayat sabuk 2 entri', r.j.S.murid.m1.riwayatSabuk.length === 2 && r.j.S.murid.m1.sabuk === 'hijau');
  t('pelatih tidak bisa hapus murid', (await del(P, 'murid/m1')).code === 403);

  r = await api('register', { body: { nama: 'Citra', jk: 'Perempuan', telp: '08123', password: 'abcd', unit: 'u1' } });
  const M = r.j.token, mid = r.j.uid; t('register murid', !!M && r.j.role === 'murid');
  t('register nama kembar ditolak', (await api('register', { body: { nama: 'CITRA', password: 'abcd' } })).code === 409);
  t('login murid', (await api('login', { body: { role: 'murid', nama: 'andi', password: '1234' } })).code === 200);
  t('login murid salah sandi', (await api('login', { body: { role: 'murid', nama: 'Andi', password: 'zzzz' } })).code === 401);

  r = await api('data', { tok: M });
  t('murid hanya lihat dirinya', Object.keys(r.j.S.murid).length === 1 && r.j.S.murid[mid].nama === 'Citra');
  t('murid tidak bisa buat sesi', (await set(M, 'sesi/sx', { tgl: '2026-11-25', materi: 'x' })).code === 403);
  t('murid tidak bisa ubah wilayah', (await set(M, 'wilayah/w9', { nama: 'x' })).code === 403);

  // sesi + absen
  t('sesi', (await set(P, 'sesi/s1', { tgl: '2026-11-25', materi: 'Jurus tunggal', unit: 'u1' })).code === 200);
  t('sesi tanggal jelek ditolak', (await set(P, 'sesi/s2', { tgl: '25-11-2026', materi: 'x' })).code === 400);
  t('murid absen hadir', (await set(M, `absen/s1_${mid}`, { sesi: 's1', uid: mid, status: 'hadir' })).code === 200);
  t('murid absen alpha ditolak', (await set(M, `absen/s1_${mid}`, { status: 'alpha' })).code === 400);
  t('murid absen untuk orang lain ditolak', (await set(M, 'absen/s1_m1', { status: 'hadir' })).code === 403);
  t('pelatih set alpha', (await set(P, 'absen/s1_m1', { status: 'alpha' })).code === 200);
  r = await api('data', { tok: M });
  t('murid cuma lihat absen sendiri', Object.keys(r.j.S.absen).length === 1);
  t('pelatih hapus absen', (await del(P, 'absen/s1_m1')).code === 200);

  // nilai
  t('nilai', (await set(P, 'nilai/s1_m1', { skor: { fisik_lari: 80, jurus_hafal: 150, ngawur: 5, fisik_power: '' }, catatan: 'Bagus' })).code === 200);
  r = await api('data', { tok: A });
  const sk = r.j.S.nilai.s1_m1.skor;
  t('skor tersimpan & dibatasi 0-100', sk.fisik_lari === 80 && sk.jurus_hafal === 100 && !('ngawur' in sk) && !('fisik_power' in sk));
  t('nilai dicatat oleh Budi', r.j.S.nilai.s1_m1.oleh === 'Budi');
  r = await api('data', { tok: M });
  t('murid tidak lihat nilai orang lain', Object.keys(r.j.S.nilai).length === 0);

  // aspek (jalur lama di UI Pengaturan)
  const asp = (await api('data', { tok: A })).j.S.cfg.main.aspek;
  const baru = asp.slice(1).map(a => ({ ...a })); baru.push({ id: 'a999', nama: 'Aspek baru' });
  t('sync aspek', (await set(A, 'cfg/main', { aspek: baru })).code === 200);
  r = await api('data', { tok: A });
  t('materi dihapus & ditambah', !r.j.S.materi.fisik_lari && r.j.S.materi.a999?.kategori === 'Lainnya');
  t('skor ikut terhapus saat materi dihapus', !('fisik_lari' in r.j.S.nilai.s1_m1.skor));

  // cascade
  t('hapus wilayah oleh admin', (await del(A, 'wilayah/w1')).code === 200);
  r = await api('data', { tok: A });
  t('cascade cabang & unit', !r.j.S.cabang.c1 && !r.j.S.unit.u1);
  t('murid & sesi tetap ada, unit kosong', r.j.S.murid.m1.unit === '' && r.j.S.sesi.s1.unit === '');

  // password admin & logout
  t('ganti password admin', (await api('admin-password', { tok: A, body: { password: 'baru1234' } })).code === 200);
  t('login admin password baru', (await api('login', { body: { role: 'admin', password: 'baru1234' } })).code === 200);
  t('login admin password lama gagal', (await api('login', { body: { role: 'admin', password: 'admin123' } })).code === 401);
  await api('logout', { tok: M, body: {} });
  t('token setelah logout mati', (await api('me', { tok: M })).code === 401);

  // static
  const idx = await fetch(BASE + '/');
  t('index.html disajikan', idx.status === 200 && (await idx.text()).includes('SBTI'));
  t('path traversal ditolak', (await fetch(BASE + '/..%2fserver.js')).status === 404);
} catch (e) { ko++; console.log('ERROR TES:', e); }

srv.kill();
console.log(`\n${ok} lulus, ${ko} gagal`);
process.exit(ko ? 1 : 0);
