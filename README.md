# SBTI Backend

Backend + database untuk SBTI Management System. Tanpa dependency (tidak perlu `npm install`),
database SQLite bawaan Node 22.13+. Frontend lama (`public/`) langsung jalan tanpa diubah.

## Jalanin lokal
```
node server.js        # buka http://localhost:3000
npm test              # 59 tes otomatis
```
Pertama kali buka tab **Admin** → buat password admin. Lalu isi **Pengaturan → Kode akses pelatih**.

## Deploy
Frontend dan backend jalan dalam satu service (backend nyajiin folder `public/`), jadi tidak butuh Netlify lagi.
**Penting:** SQLite itu file, jadi hosting harus punya *persistent disk/volume*, kalau tidak data hilang tiap restart.
- Railway / Fly.io / Render (paket berbayar dengan Disk) / VPS: mount volume lalu set `DB_FILE=/data/sbti.db`.
- Dockerfile sudah disediakan.

Environment variable (semua opsional): `PORT`, `DB_FILE`, `TZ_OFFSET` (default 7 = WIB),
`TRUST_PROXY=1` (kalau di belakang proxy), `CORS_ORIGIN` (kalau frontend di domain lain).

### Kalau frontend tetap di Netlify
Isi `netlify.toml` jadi:
```
[build]
  publish = "."

[[redirects]]
  from = "/api/*"
  to = "https://URL-BACKEND-LU/api/:splat"
  status = 200
  force = true
```
(hapus `functions` dan `@netlify/blobs`, tidak dipakai lagi)

## Struktur data
- **Wilayah → Cabang → Unit latihan** (hapus wilayah = cabang & unit di dalamnya ikut terhapus; murid/sesi tetap ada, unit-nya jadi kosong)
- **Murid**: sabuk (putih, kuning, hijau, biru, merah, hitam polos, hitam strip 1/2/3), unit latihan, riwayat kenaikan sabuk otomatis
- **Materi penilaian** (skor 0–100): Fisik (Lari, Push up, Sit up, Back up), Kelincahan (Reaksi, Keseimbangan),
  Kekuatan (Daya tahan otot, Kelenturan, Power), Jurus (Hafal, Menguasai, Mahir). Admin bisa tambah/ubah/hapus.
- Sesi latihan (bisa dikaitkan ke unit), absen (hadir/izin/sakit/alpha), nilai per murid per sesi

## Hak akses
| | Admin | Pelatih | Murid |
|---|---|---|---|
| Tambah/ubah wilayah, cabang, unit | ✅ | ✅ | ❌ |
| Hapus wilayah, cabang, unit | ✅ | ❌ | ❌ |
| Tambah/ubah murid, sabuk, sesi, absen, nilai | ✅ | ✅ | ❌ |
| Hapus murid / sesi / pelatih | ✅ | ❌ | ❌ |
| Pengaturan, kode akses, materi | ✅ | ❌ | ❌ |
| Absen sendiri (hadir/izin/sakit) & lihat data sendiri | – | – | ✅ |

## API
Semua lewat `/api/*` dengan header `Authorization: Bearer <token>`:
`public`, `setup-admin`, `login`, `register`, `me`, `data`, `set {path,data}`, `del {path}`, `admin-password`, `logout`.
Path `set`/`del`: `wilayah/<id>`, `cabang/<id>`, `unit/<id>`, `murid/<id>`, `staff/<id>`, `sesi/<id>`,
`absen/<sesi>_<murid>`, `nilai/<sesi>_<murid>`, `materi/<id>`, `cfg/main`.
