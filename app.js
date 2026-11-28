const $ = s => document.querySelector(s),
  v = i => ($('#' + i) || {}).value ?? '',
  E = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const fd = t => t ? new Date(t + 'T00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-';
const fdShort = t => t ? new Date(t + 'T00:00').toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) : '-';
const fm = p => new Date(p + '-01T00:00').toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : '';
const ym = t => (t || '').slice(0, 7);

const SABUK_LIST = [
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
const sabukNama = id => (S.meta?.sabuk || SABUK_LIST).find(x => x.id === id)?.nama || 'Putih';

const KAT_ICONS = { Fisik: '🏃', Kelincahan: '⚡', Kekuatan: '💪', Jurus: '🥋' };
const IC = {
  dash: '▦',
  wilayah: '🗺️',
  anggota: '👥',
  latihan: '🗓️',
  raport: '📄',
  atur: '⚙️',
  web: '🎨',
  absen: '✅',
  nilai: '⭐',
  materi: '📚',
  profil: '👤'
};

let uid, role = null, view = '', sel = null, Q = '', QSabuk = '';
let S = { wilayah: {}, cabang: {}, unit: {}, murid: {}, staff: {}, sesi: {}, absen: {}, nilai: {}, materi: {}, cfg: {}, meta: { sabuk: SABUK_LIST } };
let PUB = { wilayah: {}, cabang: {}, unit: {}, site: {} };
let F = { w: '', c: '', u: '' };
let R = { p: today().slice(0, 7), mode: 'ind', u: '', pelatih: '' };
let absDate = today(), calModalMonth = today().slice(0, 7);

const toast = t => {
  const e = $('#toast');
  e.textContent = t;
  e.style.display = 'block';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (e.style.display = 'none'), 2800);
};

const avg = a => { a = a.filter(x => x != null && !isNaN(x)); return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; };
const f = x => x == null ? '-' : (Math.round(x * 10) / 10).toString().replace('.', ',');

const materiList = () => Object.entries(S.materi || {}).map(([id, m]) => ({ id, ...m }));
const dAvg = n => {
  const validIds = new Set(materiList().map(m => m.id));
  const vals = Object.entries(n?.skor || {})
    .filter(([k, x]) => (!validIds.size || validIds.has(k)) && x !== '' && x != null && !isNaN(x))
    .map(([, x]) => +x);
  return avg(vals);
};

const listWilayah = (src = S) => Object.entries(src.wilayah || {}).map(([id, x]) => ({ id, ...x })).sort((a, b) => a.nama.localeCompare(b.nama));
const listCabang = (wId = '', src = S) => Object.entries(src.cabang || {})
  .map(([id, x]) => ({ id, ...x }))
  .filter(x => !wId || x.wilayah === wId)
  .sort((a, b) => a.nama.localeCompare(b.nama));
const listUnit = (cId = '', wId = '', src = S) => Object.entries(src.unit || {})
  .map(([id, x]) => ({ id, ...x }))
  .filter(x => {
    if (cId) return x.cabang === cId;
    if (wId) return src.cabang?.[x.cabang]?.wilayah === wId;
    return true;
  })
  .sort((a, b) => a.nama.localeCompare(b.nama));

const unitLabel = (uId, src = S) => {
  if (!uId || !src.unit?.[uId]) return '-';
  const u = src.unit[uId];
  const c = src.cabang?.[u.cabang];
  const w = c ? src.wilayah?.[c.wilayah] : null;
  return [u.nama, c?.nama, w?.nama].filter(Boolean).join(' · ');
};

const matchUnitFilter = (uId) => {
  if (!F.w && !F.c && !F.u) return true;
  if (!uId) return false;
  if (F.u) return uId === F.u;
  const u = S.unit?.[uId];
  if (!u) return false;
  if (F.c) return u.cabang === F.c;
  const c = S.cabang?.[u.cabang];
  if (F.w) return c?.wilayah === F.w;
  return true;
};

function filterBarHTML() {
  const ws = listWilayah();
  const cs = listCabang(F.w);
  const us = listUnit(F.c, F.w);
  return `<div class="card row" style="padding:10px 14px">
    <span class="m" style="font-weight:600">Filter:</span>
    <select onchange="F.w=this.value;F.c='';F.u='';render()">
      <option value="">Semua wilayah</option>
      ${ws.map(w => `<option value="${w.id}" ${F.w === w.id ? 'selected' : ''}>${E(w.nama)}</option>`).join('')}
    </select>
    <select onchange="F.c=this.value;F.u='';render()">
      <option value="">Semua cabang</option>
      ${cs.map(c => `<option value="${c.id}" ${F.c === c.id ? 'selected' : ''}>${E(c.nama)}</option>`).join('')}
    </select>
    <select onchange="F.u=this.value;render()">
      <option value="">Semua unit</option>
      ${us.map(u => `<option value="${u.id}" ${F.u === u.id ? 'selected' : ''}>${E(u.nama)}</option>`).join('')}
    </select>
    ${(F.w || F.c || F.u) ? `<button class="b" onclick="F={w:'',c:'',u:''};render()">Reset</button>` : ''}
  </div>`;
}

const sesiList = (filtered = true) => Object.entries(S.sesi || {})
  .map(([id, s]) => ({ id, ...s }))
  .filter(s => !filtered || matchUnitFilter(s.unit))
  .sort((a, b) => b.tgl.localeCompare(a.tgl));

const muridList = (includeInactive = false, filtered = true) => Object.entries(S.murid || {})
  .map(([id, m]) => ({ id, ...m }))
  .filter(m => (includeInactive || m.aktif !== false) && (!filtered || matchUnitFilter(m.unit)))
  .sort((a, b) => a.nama.localeCompare(b.nama));

function rap(u, p) {
  const mUnit = S.murid[u]?.unit || '';
  const ss = Object.entries(S.sesi || {})
    .map(([id, s]) => ({ id, ...s }))
    .filter(s => ym(s.tgl) === p && (!s.unit || s.unit === mUnit))
    .reverse();

  const c = { hadir: 0, izin: 0, sakit: 0, alpha: 0 }, mm = {}, cat = [];
  ss.forEach(s => {
    const a = S.absen[s.id + '_' + u]?.status;
    if (a in c) c[a]++;
    const n = S.nilai[s.id + '_' + u], d = dAvg(n);
    if (d != null) (mm[s.materi] ??= []).push(d);
    if (n?.catatan) cat.push([s.tgl, s.materi, n.catatan]);
  });
  return {
    tot: ss.length,
    c,
    pct: ss.length ? (c.hadir / ss.length) * 100 : null,
    mats: Object.entries(mm).map(([m, a]) => ({ m, n: a.length, r: avg(a) })),
    all: avg(Object.values(mm).flat()),
    cat
  };
}

let entered = false, tab = 'murid', mode = 'login', SHOW_CODE = false;
const LOGO = 'logo.png';
const site = () => {
  const o = S.cfg?.main?.site || PUB.site || {};
  const r = {
    nama: 'SBTI Management System',
    tag: 'Seni Benggala Trisula Indonesia',
    sambutan: 'Sistem absensi, penilaian, dan raport anggota.',
    logo: LOGO
  };
  for (const k in o) if (o[k]) r[k] = o[k];
  return r;
};

function render() {
  const A = $('#app');
  if (!entered) { A.innerHTML = authHTML(); return; }
  const nav = role === 'murid'
    ? [['absen', 'Absen'], ['materi', 'Materi Latihan'], ['nilai', 'Raport Saya'], ['profil', 'Profil']]
    : [['dash', 'Dashboard'], ['wilayah', 'Wilayah & Unit'], ['anggota', 'Anggota'], ['latihan', 'Latihan & Absen'], ['raport', 'Raport'], ['atur', 'Pengaturan'], ['web', 'Ubah Website'], ['profil', 'Profil']];

  if (!nav.some(n => n[0] === view)) view = nav[0][0];
  let V = '';
  try {
    const fn = {
      dash: vDash, wilayah: vWilayah, anggota: vAnggota, latihan: vLatihan,
      raport: vRaport, atur: vAtur, web: vWeb, absen: vAbsen, nilai: vRaport, materi: vMateri, profil: vProfil
    }[view];
    V = fn ? fn() : '';
  } catch (err) {
    console.error(err);
    V = `<div class="card"><b>Terjadi kesalahan tampilan:</b> ${E(err.message)}</div>`;
  }

  A.innerHTML = `<aside>
    <img class="lg" src="${site().logo}">
    <h1>${E(site().nama)}</h1>
    <small>${role === 'pelatih' ? 'Pelatih · ' + E(S.staff[uid]?.nama || '') : E(S.murid[uid]?.nama || 'Murid')}</small>
    ${nav.map(n => `<a class="${view === n[0] ? 'on' : ''}" onclick="go('${n[0]}')">${IC[n[0]]} ${n[1]}</a>`).join('')}
    <a onclick="keluar()">🚪 Keluar</a>
  </aside><main>${V}</main>`;
}

const go = x => { view = x; sel = null; render(); };
const keluar = () => { API('logout', { body: {} }).catch(() => {}); localStorage.removeItem('sbti_token'); location.reload(); };

function authHTML() {
  const s = site();
  let c = '';
  if (tab === 'murid') {
    if (mode === 'daftar') {
      const ws = listWilayah(PUB);
      const cs = listCabang('', PUB);
      const us = listUnit('', '', PUB);
      c = `
        <input id="rn" placeholder="Nama lengkap *" value="${E(v('rn'))}" required>
        <select id="rj">
          <option value="Laki-laki" ${v('rj') === 'Perempuan' ? '' : 'selected'}>Laki-laki</option>
          <option value="Perempuan" ${v('rj') === 'Perempuan' ? 'selected' : ''}>Perempuan</option>
        </select>
        <input id="rt" placeholder="Nomor telepon *" value="${E(v('rt'))}" required>
        <input id="rw" list="wilayah-suggest" placeholder="Wilayah (mis. Tangerang Kota / Jakarta Barat) *" value="${E(v('rw'))}" required>
        <datalist id="wilayah-suggest">${ws.map(w => `<option value="${E(w.nama)}">`).join('')}</datalist>
        <input id="rc" list="cabang-suggest" placeholder="Cabang *" value="${E(v('rc'))}" required>
        <datalist id="cabang-suggest">${cs.map(cb => `<option value="${E(cb.nama)}">`).join('')}</datalist>
        <input id="ru" list="unit-suggest" placeholder="Unit latihan *" value="${E(v('ru'))}" required>
        <datalist id="unit-suggest">${us.map(u => `<option value="${E(u.nama)}">`).join('')}</datalist>
        <select id="rs">${SABUK_LIST.map(sb => `<option value="${sb.id}" ${v('rs') === sb.id ? 'selected' : ''}>Sabuk ${E(sb.nama)}</option>`).join('')}</select>
        <input id="ro" placeholder="No. Anggota (contoh: SBTI-001) *" value="${E(v('ro'))}" required>
        <input id="rp" type="password" placeholder="Buat kata sandi *" required>
        <button class="b p w" onclick="daftar()">Daftar & Masuk</button>
        <p class="m">Sudah punya akun? <a href="#" onclick="mode='login';render();return false">Masuk</a></p>`;
    } else {
      c = `
        <input id="ln" placeholder="Nama lengkap atau nomor anggota">
        <input id="lp" type="password" placeholder="Kata sandi">
        <button class="b p w" onclick="doLogin('murid',{nama:v('ln'),password:v('lp')})">Masuk</button>
        <p class="m">Murid baru? <a href="#" onclick="mode='daftar';render();return false">Daftar dulu</a></p>`;
    }
  } else {
    if (mode === 'daftar') {
      c = `
        <input id="rpn" placeholder="Nama lengkap pelatih *" value="${E(v('rpn'))}" required>
        <input id="rpp" type="${SHOW_CODE ? 'text' : 'password'}" placeholder="Buat kata sandi sendiri *" required>
        <label class="m" style="display:flex;align-items:center;gap:6px;margin:4px 0 10px;cursor:pointer">
          <input type="checkbox" style="width:auto;margin:0" ${SHOW_CODE ? 'checked' : ''} onchange="SHOW_CODE=this.checked;render()"> Tampilkan kata sandi
        </label>
        <button class="b p w" onclick="daftarPelatih()">Daftar & Masuk</button>
        <p class="m">Sudah punya akun pelatih? <a href="#" onclick="mode='login';render();return false">Masuk</a></p>`;
    } else {
      c = `
        <input id="pn" placeholder="Nama lengkap pelatih">
        <input id="pk" type="${SHOW_CODE ? 'text' : 'password'}" placeholder="Kata sandi pelatih">
        <label class="m" style="display:flex;align-items:center;gap:6px;margin:4px 0 10px;cursor:pointer">
          <input type="checkbox" style="width:auto;margin:0" ${SHOW_CODE ? 'checked' : ''} onchange="SHOW_CODE=this.checked;render()"> Tampilkan kata sandi
        </label>
        <button class="b p w" onclick="doLogin('pelatih',{nama:v('pn'),password:v('pk')})">Masuk</button>
        <p class="m">Pelatih baru? <a href="#" onclick="mode='daftar';render();return false">Daftar & buat kata sandi sendiri</a></p>`;
    }
  }

  return `<div class="hero">
    <div class="side"><img class="lg2" src="${s.logo}"><h1>${E(s.nama)}</h1><p>${E(s.tag)}</p><p style="opacity:.9">${E(s.sambutan)}</p></div>
    <div class="box">
      <div class="tabs">${['murid', 'pelatih'].map(x => `<a class="${tab === x ? 'on' : ''}" onclick="tab='${x}';mode='login';render()">${cap(x)}</a>`).join('')}</div>
      ${c}
    </div>
  </div>`;
}

const stat = (a, b) => `<div class="card"><b>${b}</b><span class="m">${a}</span></div>`;

function vDash() {
  const p = today().slice(0, 7);
  const ws = listWilayah(), cs = listCabang(F.w), us = listUnit(F.c, F.w);
  const ms = muridList(false, true), ss = sesiList(true), sp = ss.filter(s => ym(s.tgl) === p);
  const h = sp.reduce((n, s) => n + ms.filter(m => S.absen[s.id + '_' + m.id]?.status === 'hadir').length, 0);
  const td = ss.filter(s => s.tgl === today());

  return `<h2>Dashboard</h2>${filterBarHTML()}
  <div class="stats">${stat('Wilayah', ws.length)}${stat('Cabang', cs.length)}${stat('Unit latihan', us.length)}${stat('Murid aktif', ms.length)}${stat('Latihan bulan ini', sp.length)}${stat('Kehadiran bulan ini', h)}</div>
  <div class="card"><h3 style="margin-top:0">Absensi hari ini · ${fdShort(today())}</h3>
    ${td.length ? td.map(s => {
      const targetMs = s.unit ? ms.filter(m => m.unit === s.unit) : ms;
      const belum = targetMs.filter(m => !S.absen[s.id + '_' + m.id]);
      return `<p><b>${E(s.materi)}</b>${s.jam ? ` <span class="m">(🕒 ${E(s.jam)})</span>` : ''} — sudah absen ${targetMs.length - belum.length} dari ${targetMs.length}</p>`;
    }).join('') : '<p class="m">Belum ada latihan hari ini. Buat latihan di menu Latihan & Absen.</p>'}
  </div>
  <div class="card"><h3 style="margin-top:0">Ringkasan perkembangan (${fm(p)})</h3>
    <div class="tw"><table><tr><th>Nama</th><th>Sabuk</th><th>Unit</th><th>Kehadiran</th><th>Rata-rata nilai</th></tr>
      ${ms.map(m => { const r = rap(m.id, p); return `<tr><td>${E(m.nama)}</td><td>${E(sabukNama(m.sabuk))}</td><td>${E(S.unit[m.unit]?.nama || '-')}</td><td>${f(r.pct)}%</td><td>${f(r.all)}</td></tr>`; }).join('') || '<tr><td colspan="5" class="m">Belum ada murid.</td></tr>'}
    </table></div>
  </div>`;
}

function vWilayah() {
  const ws = listWilayah();
  return `<h2>Wilayah, Cabang & Unit Latihan</h2>
  <div class="card row"><input id="nw" placeholder="Nama wilayah baru (mis. Jawa Barat)" style="flex:1;min-width:220px"><button class="b p" onclick="addWilayah()">+ Tambah Wilayah</button></div>
  ${ws.map(w => {
    const cs = listCabang(w.id);
    return `<div class="card">
      <div class="row" style="justify-content:space-between;margin-bottom:8px">
        <div><b style="font-size:16px">🗺️ ${E(w.nama)}</b> <span class="m">${cs.length} cabang</span></div>
        <div class="row" style="margin:0"><button class="b" onclick="editWilayah('${w.id}')">Ubah</button><button class="b d" onclick="if(confirm('Hapus wilayah ini?'))del('wilayah/${w.id}')">Hapus</button></div>
      </div>
      ${cs.length ? cs.map(c => {
        const us = listUnit(c.id);
        return `<div style="border-left:3px solid #46b0f8;padding:10px 12px;margin:8px 0 8px 8px;background:var(--bg);border-radius:10px">
          <div class="row" style="justify-content:space-between;margin-bottom:6px">
            <div><b>🏢 ${E(c.nama)}</b> <span class="m">${us.length} unit</span></div>
            <div class="row" style="margin:0"><button class="b" onclick="addUnit('${c.id}')">+ Unit</button><button class="b" onclick="editCabang('${c.id}')">Ubah</button><button class="b d" onclick="if(confirm('Hapus cabang ini?'))del('cabang/${c.id}')">Hapus</button></div>
          </div>
          ${us.length ? us.map(u => `<div class="row" style="justify-content:space-between;padding:6px 10px;margin:4px 0 0 12px;background:var(--c);border:1px solid var(--l);border-radius:8px">
            <div>📍 <b>${E(u.nama)}</b> ${u.lokasi ? `<span class="m">· ${E(u.lokasi)}</span>` : ''}</div>
            <div class="row" style="margin:0"><button class="b" onclick="editUnit('${u.id}')">Ubah</button><button class="b d" onclick="if(confirm('Hapus unit ini?'))del('unit/${u.id}')">Hapus</button></div>
          </div>`).join('') : '<p class="m" style="margin:4px 0 0 12px">Belum ada unit latihan.</p>'}
        </div>`;
      }).join('') : '<p class="m">Belum ada cabang.</p>'}
      <button class="b" style="margin-top:8px" onclick="addCabang('${w.id}')">+ Tambah Cabang</button>
    </div>`;
  }).join('') || '<div class="card"><p class="m">Belum ada wilayah.</p></div>'}`;
}

async function addWilayah() { const nama = v('nw').trim(); if (!nama) return toast('Nama wilayah wajib diisi'); await save('wilayah/w' + Date.now(), { nama }); }
function editWilayah(id) { const w = S.wilayah[id]; modal(`<h3 style="margin-top:0">Ubah Wilayah</h3><input id="ew" value="${E(w.nama)}"><div class="btns"><button class="b p" onclick="save('wilayah/${id}',{nama:v('ew').trim()});modal('')">Simpan</button><button class="b" onclick="modal('')">Batal</button></div>`); }
function addCabang(wId) { modal(`<h3 style="margin-top:0">Tambah Cabang</h3><input id="nc" placeholder="Nama cabang"><div class="btns"><button class="b p" onclick="save('cabang/c'+Date.now(),{nama:v('nc').trim(),wilayah:'${wId}'});modal('')">Simpan</button><button class="b" onclick="modal('')">Batal</button></div>`); }
function editCabang(id) { const c = S.cabang[id]; modal(`<h3 style="margin-top:0">Ubah Cabang</h3><input id="ec" value="${E(c.nama)}"><div class="btns"><button class="b p" onclick="save('cabang/${id}',{nama:v('ec').trim(),wilayah:'${c.wilayah}'});modal('')">Simpan</button><button class="b" onclick="modal('')">Batal</button></div>`); }
function addUnit(cId) { modal(`<h3 style="margin-top:0">Tambah Unit Latihan</h3><input id="nu" placeholder="Nama unit"><input id="nl" placeholder="Lokasi (opsional)"><div class="btns"><button class="b p" onclick="save('unit/u'+Date.now(),{nama:v('nu').trim(),lokasi:v('nl').trim(),cabang:'${cId}'});modal('')">Simpan</button><button class="b" onclick="modal('')">Batal</button></div>`); }
function editUnit(id) { const u = S.unit[id]; modal(`<h3 style="margin-top:0">Ubah Unit</h3><input id="eu" value="${E(u.nama)}"><input id="el" value="${E(u.lokasi)}"><div class="btns"><button class="b p" onclick="save('unit/${id}',{nama:v('eu').trim(),lokasi:v('el').trim(),cabang:'${u.cabang}'});modal('')">Simpan</button><button class="b" onclick="modal('')">Batal</button></div>`); }

function vAnggota() {
  const q = Q.toLowerCase();
  const ms = muridList(true, true).filter(m => (m.nama + ' ' + m.noAnggota).toLowerCase().includes(q) && (!QSabuk || m.sabuk === QSabuk));
  return `<h2>Data Anggota</h2>${filterBarHTML()}
  <div class="row"><input placeholder="Cari nama / nomor anggota" value="${E(Q)}" oninput="Q=this.value;render();this.focus()">
    <select onchange="QSabuk=this.value;render()"><option value="">Semua sabuk</option>${SABUK_LIST.map(s => `<option value="${s.id}" ${QSabuk === s.id ? 'selected' : ''}>${E(s.nama)}</option>`).join('')}</select>
    <button class="b p" onclick="mForm('')">+ Tambah Anggota</button>
  </div>
  <div class="card tw"><table><tr><th>No. Anggota</th><th>Nama</th><th>Sabuk</th><th>Unit latihan</th><th>JK</th><th>Telepon</th><th>Status</th><th></th></tr>
    ${ms.map(m => `<tr><td>${E(m.noAnggota)}</td><td>${E(m.nama)}</td><td><b>${E(sabukNama(m.sabuk))}</b></td><td>${E(unitLabel(m.unit))}</td><td>${E(m.jk)}</td><td>${E(m.telp || '-')}</td><td>${m.aktif === false ? 'Nonaktif' : 'Aktif'}</td>
      <td style="white-space:nowrap"><button class="b" onclick="R.mode='ind';R.u='${m.id}';go('raport')">Raport</button> <button class="b" onclick="mForm('${m.id}')">Edit</button> <button class="b" onclick="save('murid/${m.id}',{...S.murid['${m.id}'],aktif:S.murid['${m.id}'].aktif===false})">${m.aktif === false ? 'Aktifkan' : 'Nonaktifkan'}</button> <button class="b d" onclick="if(confirm('Hapus anggota ini?'))del('murid/${m.id}')">Hapus</button></td></tr>`).join('') || '<tr><td colspan="8" class="m">Belum ada anggota.</td></tr>'}
  </table></div>`;
}

const modal = h => { const m = $('#modal'); m.innerHTML = h ? `<div class="card">${h}</div>` : ''; m.style.display = h ? 'flex' : 'none'; };

function mForm(id) {
  const m = S.murid[id] || {}, allUnits = listUnit();
  modal(`<h3 style="margin-top:0">${id ? 'Edit' : 'Tambah'} Anggota</h3>
    <input id="fn" placeholder="Nama lengkap" value="${E(m.nama)}">
    <input id="fo" placeholder="Nomor anggota" value="${E(m.noAnggota || 'SBTI-' + String(Object.keys(S.murid).length + 1).padStart(3, '0'))}">
    <select id="fs" style="width:100%;margin-bottom:8px">${SABUK_LIST.map(s => `<option value="${s.id}" ${(m.sabuk || 'putih') === s.id ? 'selected' : ''}>${E(s.nama)}</option>`).join('')}</select>
    <select id="fu" style="width:100%;margin-bottom:8px"><option value="">-- Pilih Unit Latihan --</option>${allUnits.map(u => `<option value="${u.id}" ${m.unit === u.id ? 'selected' : ''}>${E(unitLabel(u.id))}</option>`).join('')}</select>
    <select id="fj" style="width:100%;margin-bottom:8px"><option ${m.jk === 'Perempuan' ? '' : 'selected'}>Laki-laki</option><option ${m.jk === 'Perempuan' ? 'selected' : ''}>Perempuan</option></select>
    <input id="fg" type="date" value="${m.tglGabung || today()}">
    <input id="ft" placeholder="Nomor telepon" value="${E(m.telp)}">
    <input id="fp" type="password" placeholder="${id ? 'Ganti kata sandi (opsional)' : 'Kata sandi login murid'}">
    <label class="m">Pas Foto Raport (3x4, opsional)</label>
    <input id="ff" type="file" accept="image/*">
    <div class="btns"><button class="b p" onclick="mSave('${id}')">Simpan</button><button class="b" onclick="modal('')">Batal</button></div>`);
}

async function mSave(id) {
  const n = v('fn').trim(); if (!n) return toast('Nama wajib diisi');
  const payload = { ...(S.murid[id] || { aktif: true }), nama: n, noAnggota: v('fo'), sabuk: v('fs'), unit: v('fu'), jk: v('fj'), tglGabung: v('fg'), telp: v('ft') };
  if (v('fp')) payload.password = v('fp');
  const fl = $('#ff')?.files?.[0];
  if (fl) payload.foto = await shrink(fl, 240, 320);
  await save('murid/' + (id || 'm' + Date.now()), payload);
  modal('');
}

function jamOptions(def) {
  const opts = [];
  for (let h = 5; h <= 22; h++) {
    for (const m of ['00', '30']) {
      const t = String(h).padStart(2, '0') + ':' + m;
      opts.push(`<option value="${t}" ${t === def ? 'selected' : ''}>${t}</option>`);
    }
  }
  return opts.join('');
}

function vLatihan() {
  if (sel && S.sesi[sel]) return vSesi();
  const us = listUnit(F.c, F.w), kats = ['Fisik', 'Kelincahan', 'Kekuatan', 'Jurus'];
  return `<h2>Latihan & Absensi</h2>${filterBarHTML()}
  <div class="card"><h3 style="margin-top:0">Buat latihan baru</h3>
    <div class="row">
      <select id="su"><option value="">Pilih unit latihan</option>${us.map(u => `<option value="${u.id}" ${F.u === u.id ? 'selected' : ''}>${E(unitLabel(u.id))}</option>`).join('')}</select>
      <input id="st" type="date" value="${today()}">
      <div style="display:inline-flex;align-items:center;gap:6px">
        <select id="sj1" title="Jam Mulai Latihan">${jamOptions('07:00')}</select>
        <span class="m">s/d</span>
        <select id="sj2" title="Jam Selesai Latihan">${jamOptions('10:00')}</select>
      </div>
    </div>
    <div class="row">${kats.map((k, idx) => `<label style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border:1px solid var(--l);border-radius:8px;cursor:pointer;background:var(--c)"><input type="checkbox" name="skat" value="${k}" ${idx === 0 ? 'checked' : ''} style="margin:0"><span>${KAT_ICONS[k]} ${k}</span></label>`).join('')}</div>
    <div class="row"><input id="sm" placeholder="Keterangan (opsional, mis. Jurus 1–3)" style="flex:1;min-width:220px"><button class="b p" onclick="addSesi()">Simpan Latihan</button></div>
  </div>
  <div class="card tw"><table><tr><th>Tanggal & Jam</th><th>Unit</th><th>Materi</th><th>Hadir</th><th>Dinilai</th><th></th></tr>
    ${sesiList(true).map(s => {
      const hadir = Object.keys(S.absen).filter(x => x.startsWith(s.id + '_') && S.absen[x].status === 'hadir').length;
      const dinilai = Object.keys(S.nilai).filter(x => x.startsWith(s.id + '_')).length;
      return `<tr><td>${fd(s.tgl)}${s.jam ? `<div class="m" style="font-size:12px">🕒 ${E(s.jam)}</div>` : ''}</td><td>${E(S.unit[s.unit]?.nama || 'Semua Unit')}</td><td>${E(s.materi)}</td><td>${hadir}</td><td>${dinilai}</td><td><button class="b" onclick="sel='${s.id}';render()">Buka</button></td></tr>`;
    }).join('') || '<tr><td colspan="6" class="m">Belum ada latihan.</td></tr>'}
  </table></div>`;
}

async function addSesi() {
  const checked = [...document.querySelectorAll('input[name="skat"]:checked')].map(el => el.value);
  const materi = [checked.join(', '), v('sm').trim()].filter(Boolean).join(' — ');
  if (!materi || !v('st')) return toast('Pilih materi atau isi keterangan');
  const jm1 = v('sj1'), jm2 = v('sj2');
  const jam = (jm1 && jm2) ? `${jm1} - ${jm2}` : (jm1 || '');
  await save('sesi/s' + Date.now(), { tgl: v('st'), jam, unit: v('su'), materi, pelatih: S.staff[uid]?.nama || 'Pelatih' });
}

function vSesi() {
  const s = S.sesi[sel], ms = muridList(false, false).filter(m => !s.unit || m.unit === s.unit);
  const [defJ1, defJ2] = (s.jam || '07:00 - 10:00').split(' - ');
  return `<div class="row"><button class="b" onclick="sel=null;render()">← Kembali</button><h2 style="margin:0">${fd(s.tgl)}</h2></div>
  <div class="card"><div class="row">
    <input id="et" type="date" value="${s.tgl}">
    <select id="ej1">${jamOptions((defJ1 || '07:00').trim())}</select>
    <span class="m">s/d</span>
    <select id="ej2">${jamOptions((defJ2 || '10:00').trim())}</select>
    <input id="em" value="${E(s.materi)}" style="flex:1">
    <button class="b p" onclick="save('sesi/${sel}',{...S.sesi['${sel}'],tgl:v('et'),jam:v('ej1')+' - '+v('ej2'),materi:v('em').trim()})">Simpan</button>
    <button class="b d" onclick="if(confirm('Hapus latihan?')){const id=sel;sel=null;del('sesi/'+id)}">Hapus Latihan</button>
  </div></div>
  <div class="card tw"><table><tr><th>Nama</th><th>Sabuk</th><th>Absensi</th><th>Jam Absen</th><th>Rata-rata</th><th></th></tr>
    ${ms.map(m => {
      const ab = S.absen[sel + '_' + m.id], a = ab?.status || '';
      return `<tr><td>${E(m.nama)}</td><td>${E(sabukNama(m.sabuk))}</td><td><select onchange="this.value?save('absen/${sel}_${m.id}',{sesi:'${sel}',uid:'${m.id}',status:this.value}):del('absen/${sel}_${m.id}')"><option value="">Belum absen</option>${['hadir', 'izin', 'sakit', 'alpha'].map(k => `<option value="${k}" ${a === k ? 'selected' : ''}>${cap(k)}</option>`).join('')}</select></td><td class="m">${ab?.waktu ? ab.waktu.slice(11, 16) : '-'}</td><td>${f(dAvg(S.nilai[sel + '_' + m.id]))}</td><td><button class="b" onclick="nForm('${m.id}')">Nilai</button></td></tr>`;
    }).join('') || '<tr><td colspan="6" class="m">Belum ada anggota aktif.</td></tr>'}
  </table></div>`;
}

function nForm(u) {
  const n = S.nilai[sel + '_' + u] || { skor: {} }, byKat = {};
  materiList().forEach(m => (byKat[m.kategori] ??= []).push(m));
  modal(`<h3 style="margin-top:0">Nilai: ${E(S.murid[u].nama)}</h3>
    ${Object.entries(byKat).map(([kat, items]) => `<div style="margin:10px 0 6px;font-weight:700;color:var(--n)">${KAT_ICONS[kat] || ''} ${E(kat)}</div>${items.map(a => `<div class="row" style="justify-content:space-between;margin-bottom:6px"><label class="m">${E(a.nama)}</label><input id="n_${a.id}" type="number" min="0" max="100" value="${n.skor[a.id] ?? ''}" style="width:90px;margin:0"></div>`).join('')}`).join('')}
    <textarea id="nc" rows="3" placeholder="Catatan pelatih">${E(n.catatan)}</textarea>
    <div class="btns"><button class="b p" onclick="nSave('${u}')">Simpan</button><button class="b" onclick="modal('')">Batal</button></div>`);
}

async function nSave(u) {
  const skor = {};
  materiList().forEach(a => { const x = v('n_' + a.id); if (x !== '') skor[a.id] = Math.min(100, Math.max(0, +x)); });
  await save('nilai/' + sel + '_' + u, { sesi: sel, uid: u, skor, catatan: v('nc') });
  modal('');
}

function rptHTML(u, p) {
  const m = S.murid[u], r = rap(u, p);
  const nilaiMurid = Object.values(S.nilai || {}).find(n => n.uid === u && ym(S.sesi?.[n.sesi]?.tgl) === p && n.oleh)?.oleh;
  const pelatihSesi = Object.values(S.sesi || {}).find(s => ym(s.tgl) === p && (!s.unit || s.unit === m.unit) && s.pelatih)?.pelatih;
  const pelatihUnitLain = Object.values(S.sesi || {}).find(s => (!s.unit || s.unit === m.unit) && s.pelatih)?.pelatih;
  const wId = S.cabang?.[S.unit?.[m.unit]?.cabang]?.wilayah || '';
  const daftarStaff = Object.values(S.staff || {});
  const pelatihWilayah = (wId && daftarStaff.find(st => st.wilayah === wId)?.nama) || daftarStaff[0]?.nama;
  const defaultPelatih = (role === 'pelatih' ? S.staff[uid]?.nama : '') || nilaiMurid || pelatihSesi || pelatihUnitLain || pelatihWilayah || '-';
  const namaPelatih = R.pelatih || defaultPelatih;
  const isMob = window.innerWidth <= 640;
  const fw = isMob ? 84 : 112, fh = isMob ? 112 : 148;
  const fotoBox = m.foto
    ? `<img src="${m.foto}" alt="Foto ${E(m.nama)}" style="width:${fw}px;height:${fh}px;object-fit:cover;object-position:center 20%;border:1.5px solid #cbd5e1;border-radius:6px;display:block">`
    : `<div style="width:${fw}px;height:${fh}px;border:1.5px dashed #94a3b8;border-radius:6px;display:flex;align-items:center;justify-content:center;text-align:center;color:#64748b;font-size:11px;padding:4px;background:#f8fafc">Pas Foto<br>3x4</div>`;
  return `<div class="rpt" style="overflow:hidden"><img class="lg" src="${site().logo}"><h2>${E(site().nama)}</h2><p class="m">Raport Penilaian Bulanan · Periode ${fm(p)}</p>
    <div style="display:flex;gap:${isMob ? 12 : 36}px;align-items:flex-start;justify-content:space-between;max-width:760px;margin:0 auto 18px">
      <table style="flex:1;min-width:0;max-width:560px;margin-bottom:0;font-size:${isMob ? 12.5 : 14}px">
        <tr><td width="36%">Nama</td><td style="word-break:break-word"><b>${E(m.nama)}</b></td></tr>
        <tr><td>No. Anggota</td><td>${E(m.noAnggota)}</td></tr>
        <tr><td>Sabuk</td><td>${E(sabukNama(m.sabuk))}</td></tr>
        <tr><td>Unit Latihan</td><td style="word-break:break-word">${E(unitLabel(m.unit))}</td></tr>
        <tr><td>Nama Pelatih</td><td style="word-break:break-word">${E(namaPelatih)}</td></tr>
      </table>
      <div style="flex-shrink:0;padding-top:4px">${fotoBox}</div>
    </div>
    <div style="width:100%;overflow-x:auto">
      <table style="font-size:${isMob ? 11.5 : 14}px"><tr><th>Total</th><th>Hadir</th><th>Izin</th><th>Sakit</th><th>Alpha</th><th>Kehadiran</th></tr><tr><td>${r.tot}</td><td>${r.c.hadir}</td><td>${r.c.izin}</td><td>${r.c.sakit}</td><td>${r.c.alpha}</td><td>${f(r.pct)}%</td></tr></table>
    </div>
    <div style="width:100%;overflow-x:auto">
      <table style="font-size:${isMob ? 12 : 14}px"><tr><th>Materi</th><th>Jumlah penilaian</th><th>Rata-rata</th></tr>${r.mats.map(x => `<tr><td>${E(x.m)}</td><td>${x.n}</td><td>${f(x.r)}</td></tr>`).join('') || '<tr><td colspan="3">Belum ada nilai pada periode ini</td></tr>'}<tr><th colspan="2">Rata-rata keseluruhan</th><th>${f(r.all)}</th></tr></table>
    </div>
    <b>Catatan pelatih</b>${r.cat.length ? r.cat.map(c => `<p style="margin:4px 0">${fd(c[0])} · ${E(c[1])}: ${E(c[2])}</p>`).join('') : '<p>-</p>'}
  </div>`;
}

function rekapHTML(p) {
  const ms = muridList(true, true);
  return `<div class="rpt"><img class="lg" src="${site().logo}"><h2>${E(site().nama)}</h2><p class="m">Rekap Penilaian Anggota · Periode ${fm(p)}</p>
    <table><tr><th>No</th><th>Nama</th><th>Sabuk</th><th>Hadir</th><th>Izin</th><th>Sakit</th><th>Alpha</th><th>Kehadiran</th><th>Rata-rata</th></tr>
      ${ms.map((m, i) => { const r = rap(m.id, p); return `<tr><td>${i + 1}</td><td>${E(m.nama)}</td><td>${E(sabukNama(m.sabuk))}</td><td>${r.c.hadir}</td><td>${r.c.izin}</td><td>${r.c.sakit}</td><td>${r.c.alpha}</td><td>${f(r.pct)}%</td><td>${f(r.all)}</td></tr>`; }).join('')}
    </table></div>`;
}

function vRaport() {
  const staff = role !== 'murid';
  const ms = staff ? muridList(true, true) : [S.murid[uid] ? { id: uid, ...S.murid[uid] } : null].filter(Boolean);
  if (!staff) R = { ...R, mode: 'ind', u: uid };
  if (!R.u || !ms.some(m => m.id === R.u)) R.u = ms[0]?.id || '';
  const daftarPelatih = [...new Set([
    ...Object.values(S.staff || {}).map(x => x.nama).filter(Boolean),
    ...Object.values(S.sesi || {}).map(x => x.pelatih).filter(Boolean)
  ])];
  const mAktif = S.murid[R.u];
  const pelatihSesi = mAktif ? Object.values(S.sesi || {}).find(s => ym(s.tgl) === R.p && (!s.unit || s.unit === mAktif.unit) && s.pelatih)?.pelatih : '';
  const pelatihAktif = R.pelatih || (role === 'pelatih' && S.staff?.[uid]?.nama) || pelatihSesi || daftarPelatih[0] || '';
  if (!R.pelatih && pelatihAktif) R.pelatih = pelatihAktif;
  return `<h2>Raport Bulanan</h2>${staff ? filterBarHTML() : ''}
  <div class="row np"><input type="month" value="${R.p}" onchange="R.p=this.value||R.p;render()">
    ${staff ? `<select onchange="R.mode=this.value;render()"><option value="ind" ${R.mode === 'ind' ? 'selected' : ''}>Raport individu</option><option value="all" ${R.mode === 'all' ? 'selected' : ''}>Rekap seluruh anggota</option></select>
      ${R.mode === 'ind' ? `<select onchange="R.u=this.value;render()">${ms.map(m => `<option value="${m.id}" ${m.id === R.u ? 'selected' : ''}>${E(m.nama)}</option>`).join('')}</select>` : ''}
      <button class="b p" onclick="window.print()">Cetak Raport</button>
      <button class="b" onclick="toast('Pilih Simpan sebagai PDF pada dialog cetak');window.print()">Download PDF</button>` : `<label class="b" style="display:inline-flex;align-items:center;gap:6px;cursor:pointer">📷 Upload Foto Raport<input type="file" accept="image/*" style="display:none" onchange="uploadMyFoto(this.files[0])"></label>`}
    ${R.mode === 'ind' ? `<select title="Pilih Nama Pelatih" onchange="R.pelatih=this.value;render()"><option value="">-- Pilih Pelatih --</option>${daftarPelatih.map(nm => `<option value="${E(nm)}" ${nm === pelatihAktif ? 'selected' : ''}>${E(nm)}</option>`).join('')}</select>` : ''}
  </div>${R.mode === 'all' && staff ? rekapHTML(R.p) : R.u ? rptHTML(R.u, R.p) : '<div class="card">Belum ada anggota.</div>'}`;
}

async function uploadMyFoto(fl) {
  if (!fl) return;
  const foto = await shrink(fl, 240, 320);
  await save('murid/' + uid, { foto });
  toast('Foto raport diperbarui');
}

function addDays(iso, d) {
  const dt = new Date(iso + 'T00:00:00');
  dt.setDate(dt.getDate() + d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function setAbsDate(iso) {
  absDate = iso;
  calModalMonth = iso.slice(0, 7);
  render();
}

function openCalModal() {
  calModalMonth = absDate.slice(0, 7);
  renderCalModal();
}

function shiftCalMonth(delta) {
  const [y, m] = calModalMonth.split('-').map(Number);
  const dt = new Date(y, m - 1 + delta, 1);
  calModalMonth = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
  renderCalModal();
}

function downloadICS() {
  const me = S.murid[uid] || {};
  const list = Object.entries(S.sesi || {}).map(([id, s]) => ({ id, ...s }))
    .filter(s => ym(s.tgl) === calModalMonth && (!s.unit || s.unit === me.unit));
  if (!list.length) return toast('Tidak ada jadwal latihan pada bulan ini');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SBTI Management//ID'];
  list.forEach(s => {
    const d = s.tgl.replace(/-/g, '');
    lines.push('BEGIN:VEVENT', `UID:${s.id}@sbti`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${d}`, `SUMMARY:Latihan SBTI - ${s.materi}${s.jam ? ' (' + s.jam + ')' : ''}`, `DESCRIPTION:Unit: ${unitLabel(me.unit)}`, 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' }));
  a.download = `jadwal-latihan-sbti-${calModalMonth}.ics`;
  a.click();
  toast('File jadwal (.ics) diunduh, buka untuk simpan ke Google Calendar');
}

function renderCalModal() {
  const me = S.murid[uid] || {};
  const sesiDates = new Set(Object.values(S.sesi || {}).filter(s => !s.unit || s.unit === me.unit).map(s => s.tgl));
  const [y, m] = calModalMonth.split('-').map(Number);
  const firstDay = new Date(y, m - 1, 1).getDay();
  const offset = (firstDay + 6) % 7;
  const daysInMonth = new Date(y, m, 0).getDate();
  const hariHdr = ['SEN', 'SEL', 'RAB', 'KAM', 'JUM', 'SAB', 'MIN'];
  let cells = '';
  for (let i = 0; i < offset; i++) cells += '<div></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${calModalMonth}-${String(d).padStart(2, '0')}`;
    const isSel = iso === absDate;
    const isTod = iso === today();
    const hasSesi = sesiDates.has(iso);
    cells += `<button onclick="setAbsDate('${iso}');modal('')" style="border:${isTod && !isSel ? '1px solid #46b0f8' : 'none'};background:${isSel ? '#46b0f8' : 'transparent'};color:${isSel ? '#061529' : '#e2e8f0'};font-weight:${isSel || isTod ? '700' : '500'};border-radius:10px;padding:9px 0;cursor:pointer;position:relative;font-size:14px">
      ${d}
      ${hasSesi ? `<span style="position:absolute;bottom:3px;left:50%;transform:translateX(-50%);width:5px;height:5px;border-radius:50%;background:${isSel ? '#061529' : '#46b0f8'}"></span>` : ''}
    </button>`;
  }
  modal(`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <h3 style="margin:0">Pilih Tanggal</h3>
      <div style="display:flex;gap:12px;align-items:center">
        <a href="#" onclick="setAbsDate('${today()}');modal('');return false" style="color:#46b0f8;font-weight:700;text-decoration:none;font-size:14px">Hari Ini</a>
        <button class="b" style="padding:4px 10px" onclick="modal('')">✕</button>
      </div>
    </div>
    <div onclick="downloadICS()" style="display:flex;align-items:center;gap:14px;padding:12px 14px;border:1px solid var(--l);border-radius:12px;background:var(--bg);cursor:pointer;margin-bottom:16px">
      <div style="width:46px;height:46px;border-radius:12px;background:rgba(70,176,248,.16);display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0">📅</div>
      <div>
        <div style="font-weight:700;font-size:14px">Sync Google Calendar</div>
        <div class="m" style="font-size:12px;margin-top:2px">Simpan jadwal latihan bulan ini ke kalender perangkat Anda</div>
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <button class="b" style="padding:6px 12px" onclick="shiftCalMonth(-1)">‹</button>
      <b style="font-size:15px">${fm(calModalMonth)}</b>
      <button class="b" style="padding:6px 12px" onclick="shiftCalMonth(1)">›</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;text-align:center;margin-bottom:6px">
      ${hariHdr.map(h => `<span class="m" style="font-size:11px;font-weight:700">${h}</span>`).join('')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;text-align:center">${cells}</div>
  `);
}

function vAbsen() {
  const me = S.murid[uid] || {};
  const allMySesi = Object.entries(S.sesi || {}).map(([id, s]) => ({ id, ...s })).filter(s => !s.unit || s.unit === me.unit);
  const sesiDates = new Set(allMySesi.map(s => s.tgl));
  const ss = allMySesi.filter(s => s.tgl === absDate);
  const hariSingkat = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  const weekDays = [-3, -2, -1, 0, 1, 2, 3].map(offset => {
    const iso = addDays(absDate, offset);
    const dt = new Date(iso + 'T00:00:00');
    return { iso, dayName: hariSingkat[dt.getDay()], dateNum: dt.getDate() };
  });
  const isToday = absDate === today();

  return `<h2>Absen Latihan</h2>
  <div class="card"><b>${E(me.nama)}</b> · <span class="m">Sabuk ${E(sabukNama(me.sabuk))} · ${E(unitLabel(me.unit))}</span></div>
  <div class="card" style="padding:16px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <button onclick="openCalModal()" style="background:none;border:none;color:inherit;font-size:16px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:6px;padding:0">
        ${fm(absDate.slice(0, 7))} <span style="font-size:13px;opacity:.8">⌄</span>
      </button>
      <a href="#" onclick="setAbsDate('${today()}');return false" style="color:#46b0f8;font-weight:700;text-decoration:none;font-size:14px">Hari Ini</a>
    </div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;text-align:center">
      ${weekDays.map(w => {
        const active = w.iso === absDate;
        const hasJadwal = sesiDates.has(w.iso);
        return `<div onclick="setAbsDate('${w.iso}')" style="cursor:pointer;padding:10px 4px;border-radius:12px;background:${active ? '#46b0f8' : 'transparent'};color:${active ? '#061529' : 'inherit'};transition:.15s">
          <div style="font-size:12px;opacity:${active ? '0.9' : '0.65'};margin-bottom:6px;font-weight:600">${w.dayName}</div>
          <div style="font-size:16px;font-weight:700">${w.dateNum}</div>
          <div style="height:6px;margin-top:4px;display:flex;justify-content:center;align-items:center">
            ${hasJadwal ? `<span style="width:5px;height:5px;border-radius:50%;background:${active ? '#061529' : '#46b0f8'}"></span>` : ''}
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>
  ${ss.length ? `
    <div style="display:flex;gap:14px;padding:4px 4px 10px;font-weight:600;font-size:13px;opacity:.75">
      <div style="width:62px;flex-shrink:0">Jam</div>
      <div>Materi Latihan</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:14px">
      ${ss.map(s => {
        const ab = S.absen[s.id + '_' + uid], a = ab?.status;
        const [jMulai, jSelesai] = (s.jam || '').split('-').map(x => x.trim());
        const unitNama = S.unit[s.unit]?.nama || S.unit[me.unit]?.nama || 'Semua Unit';
        return `<div style="display:flex;gap:14px;align-items:stretch">
          <div style="width:62px;flex-shrink:0;padding-top:14px;font-weight:700;font-size:14px;line-height:1.8;border-right:2px solid var(--l)">
            <div>${E(jMulai || '--:--')}</div>
            <div style="opacity:.8">${E(jSelesai || '--:--')}</div>
          </div>
          <div class="card" style="flex:1;margin:0;padding:16px">
            <div style="font-size:16px;font-weight:700;margin-bottom:8px">${E(s.materi)}</div>
            <div style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:8px;background:var(--bg);border:1px solid var(--l);font-size:12.5px;margin-bottom:10px">
              📍 ${E(unitNama)}
            </div>
            <div class="m" style="font-size:13px;margin-bottom:10px">${E(s.pelatih || 'Pelatih SBTI')}</div>
            ${isToday
              ? `<div class="btns" style="margin-top:4px">${['hadir', 'izin', 'sakit'].map(k => `<button class="b ${a === k ? 'on' : ''}" onclick="save('absen/${s.id}_${uid}',{sesi:'${s.id}',uid:'${uid}',status:'${k}'})">${cap(k)}</button>`).join('')}</div>`
              : `<div class="m" style="font-size:12px">Absensi mandiri hanya dibuka pada hari latihan berlangsung.</div>`}
            ${a ? `<div style="margin-top:10px;color:#4ade80;font-weight:700;font-size:13.5px;display:flex;align-items:center;gap:6px">✅ Absen Diterima (${cap(a)})</div>` : ''}
          </div>
        </div>`;
      }).join('')}
    </div>
  ` : `<div class="card" style="text-align:center;padding:42px 16px">
    <svg width="84" height="84" viewBox="0 0 84 84" fill="none" style="margin:0 auto 12px;display:block">
      <circle cx="42" cy="42" r="36" fill="#46b0f8" fill-opacity="0.10"/>
      <rect x="20" y="22" width="44" height="38" rx="7" fill="#132c4e" stroke="#46b0f8" stroke-width="2"/>
      <path d="M20 31C20 26.5817 23.5817 23 28 23H56C60.4183 23 64 26.5817 64 31V34H20V31Z" fill="#46b0f8" fill-opacity="0.35"/>
      <line x1="31" y1="18" x2="31" y2="26" stroke="#46b0f8" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="53" y1="18" x2="53" y2="26" stroke="#46b0f8" stroke-width="2.5" stroke-linecap="round"/>
      <rect x="28" y="40" width="6" height="6" rx="1.5" fill="#46b0f8" fill-opacity="0.45"/>
      <rect x="39" y="40" width="6" height="6" rx="1.5" fill="#46b0f8" fill-opacity="0.45"/>
      <rect x="50" y="40" width="6" height="6" rx="1.5" fill="#46b0f8" fill-opacity="0.45"/>
      <rect x="28" y="49" width="6" height="6" rx="1.5" fill="#46b0f8" fill-opacity="0.45"/>
      <circle cx="24" cy="56" r="11" fill="#0b1d36" stroke="#46b0f8" stroke-width="2"/>
      <path d="M24 51V56.5L27.5 58.5" stroke="#46b0f8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <div style="font-weight:600;font-size:15px">Tidak ada jadwal di tanggal ini</div>
    <div class="m" style="font-size:13px;margin-top:4px">${fdShort(absDate)}</div>
  </div>`}`;
}

function vMateri() {
  const me = S.murid[uid] || {};
  const ss = Object.entries(S.sesi || {}).map(([id, s]) => ({ id, ...s })).filter(s => !s.unit || s.unit === me.unit).sort((a, b) => b.tgl.localeCompare(a.tgl));
  return `<h2>Materi Latihan</h2><div class="card">${ss.map(s => `<p style="border-bottom:1px solid var(--l);padding-bottom:8px"><b>${E(s.materi)}</b><br><span class="m">${fd(s.tgl)}${s.jam ? ` · 🕒 ${E(s.jam)}` : ''}</span></p>`).join('') || '<p class="m">Belum ada materi latihan.</p>'}</div>`;
}

function vAtur() {
  const st = Object.entries(S.staff || {});
  return `<h2>Pengaturan</h2>
  <div class="card"><h3 style="margin-top:0">Profil pelatih</h3><div class="row"><input id="nm" value="${E(S.staff[uid]?.nama || '')}"><button class="b p" onclick="save('staff/${uid}',{...S.staff['${uid}'],nama:v('nm').trim()});toast('Nama pelatih disimpan')">Simpan</button></div></div>
  <div class="card"><h3 style="margin-top:0">Daftar pelatih</h3>${st.map(([id, s]) => `<div class="row" style="justify-content:space-between">${E(s.nama)} <button class="b d" onclick="del('staff/${id}')">Hapus</button></div>`).join('') || '<p class="m">Belum ada pelatih.</p>'}</div>`;
}

async function downloadBackup() {
  try {
    const data = await API('backup');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sbti-backup-${today()}.json`;
    a.click();
    toast('File backup berhasil diunduh');
  } catch (e) { toast(e.message); }
}

async function restoreBackup(fl) {
  if (!fl) return;
  try {
    const json = JSON.parse(await fl.text());
    await API('restore', { body: json });
    await load(true);
    toast('Seluruh data berhasil dipulihkan!');
  } catch (e) { toast(e.message || 'Gagal membaca file backup'); }
}

function vProfil() {
  const isMurid = role === 'murid';
  const u = isMurid ? (S.murid[uid] || {}) : (S.staff[uid] || {});
  const subText = isMurid
    ? `${E(u.telp || u.noAnggota || '-')} · Sabuk ${E(sabukNama(u.sabuk))}`
    : `${E(u.telp || 'Pelatih SBTI')}${u.wilayah && S.wilayah[u.wilayah] ? ' · ' + E(S.wilayah[u.wilayah].nama) : ''}`;
  const avatar = u.foto
    ? `<img src="${u.foto}" style="width:76px;height:76px;border-radius:50%;object-fit:cover;object-position:center 20%;border:2.5px solid #46b0f8;display:block">`
    : `<div style="width:76px;height:76px;border-radius:50%;background:rgba(70,176,248,.16);border:2px solid #46b0f8;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:700;color:#46b0f8">${E((u.nama || 'U')[0].toUpperCase())}</div>`;

  return `<h2>Profil Saya</h2>
  <div class="card" style="display:flex;align-items:center;gap:16px;padding:20px;flex-wrap:wrap">
    <div onclick="openAvatarMenu()" style="position:relative;cursor:pointer;flex-shrink:0" title="Klik untuk atur foto profil">
      ${avatar}
      <span style="position:absolute;bottom:0;right:0;width:26px;height:26px;border-radius:50%;background:#46b0f8;color:#061529;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,.35)">📷</span>
    </div>
    <input id="av_cam" type="file" accept="image/*" capture="user" style="display:none" onchange="updateAvatar(this.files[0]);this.value=''">
    <input id="av_gal" type="file" accept="image/*" style="display:none" onchange="updateAvatar(this.files[0]);this.value=''">
    <div style="flex:1;min-width:180px">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <b style="font-size:18px">${E(u.nama || '-')}</b>
        <span style="padding:3px 10px;border-radius:999px;font-size:12px;font-weight:700;background:rgba(34,197,94,.16);color:#4ade80;border:1px solid rgba(74,222,128,.35)">Verified</span>
      </div>
      <div class="m" style="margin-top:5px;font-size:13.5px">${subText}</div>
      ${isMurid ? `<div class="m" style="margin-top:2px;font-size:12.5px">📍 ${E(unitLabel(u.unit))}</div>` : ''}
    </div>
  </div>

  <div style="font-weight:700;font-size:15px;margin:18px 0 10px;opacity:.9">Personal</div>
  <div class="card" style="padding:0;overflow:hidden">
    <div onclick="openInfoProfile()" style="display:flex;align-items:center;justify-content:space-between;padding:16px 18px;cursor:pointer;border-bottom:1px solid var(--l)">
      <div style="display:flex;align-items:center;gap:14px">
        <span style="width:36px;height:36px;border-radius:10px;background:rgba(70,176,248,.14);color:#46b0f8;display:flex;align-items:center;justify-content:center;font-size:18px">👤</span>
        <div>
          <div style="font-weight:600;font-size:15px">Info Profile</div>
          <div class="m" style="font-size:12px;margin-top:2px">Lihat dan ubah data pribadi Anda</div>
        </div>
      </div>
      <span class="m" style="font-size:18px">›</span>
    </div>
    <div onclick="openAccountSettings()" style="display:flex;align-items:center;justify-content:space-between;padding:16px 18px;cursor:pointer">
      <div style="display:flex;align-items:center;gap:14px">
        <span style="width:36px;height:36px;border-radius:10px;background:rgba(70,176,248,.14);color:#46b0f8;display:flex;align-items:center;justify-content:center;font-size:18px">⚙️</span>
        <div>
          <div style="font-weight:600;font-size:15px">Pengaturan Akun</div>
          <div class="m" style="font-size:12px;margin-top:2px">Ubah kata sandi & keamanan akun</div>
        </div>
      </div>
      <span class="m" style="font-size:18px">›</span>
    </div>
  </div>`;
}

function openAvatarMenu() {
  const u = (role === 'murid' ? S.murid[uid] : S.staff[uid]) || {};
  const hasFoto = !!u.foto;
  modal(`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <button class="b" style="padding:4px 10px" onclick="modal('')">✕</button>
      <b style="font-size:16px">Foto profil</b>
      <button class="b d" style="padding:4px 10px;opacity:${hasFoto ? '1' : '0.45'}" onclick="${hasFoto ? 'removeAvatar()' : "toast('Belum ada foto profil untuk dihapus')"}" title="Hapus foto profil">🗑️</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px">
      <div onclick="modal('');$('#av_cam').click()" style="display:flex;align-items:center;gap:14px;padding:12px 14px;border-radius:12px;background:var(--bg);border:1px solid var(--l);cursor:pointer">
        <span style="width:38px;height:38px;border-radius:50%;background:rgba(70,176,248,.16);color:#46b0f8;display:flex;align-items:center;justify-content:center;font-size:18px">📷</span>
        <div><b>Kamera</b><div class="m" style="font-size:12px">Ambil foto langsung dari kamera</div></div>
      </div>
      <div onclick="modal('');$('#av_gal').click()" style="display:flex;align-items:center;gap:14px;padding:12px 14px;border-radius:12px;background:var(--bg);border:1px solid var(--l);cursor:pointer">
        <span style="width:38px;height:38px;border-radius:50%;background:rgba(70,176,248,.16);color:#46b0f8;display:flex;align-items:center;justify-content:center;font-size:18px">🖼️</span>
        <div><b>Galeri</b><div class="m" style="font-size:12px">Pilih foto dari penyimpanan perangkat</div></div>
      </div>
      <div onclick="${hasFoto ? `openPhotoCropper('${u.foto}',async f=>{await save((role==='murid'?'murid/':'staff/')+uid,{foto:f});toast('Foto profil diperbarui')})` : "toast('Pilih foto dari Kamera atau Galeri terlebih dahulu')"}" style="display:flex;align-items:center;gap:14px;padding:12px 14px;border-radius:12px;background:var(--bg);border:1px solid var(--l);cursor:pointer;opacity:${hasFoto ? '1' : '0.6'}">
        <span style="width:38px;height:38px;border-radius:50%;background:rgba(70,176,248,.16);color:#46b0f8;display:flex;align-items:center;justify-content:center;font-size:18px">✂️</span>
        <div><b>Sesuaikan Foto</b><div class="m" style="font-size:12px">Geser, potong, atau putar foto saat ini</div></div>
      </div>
    </div>
  `);
}

async function removeAvatar() {
  await save((role === 'murid' ? 'murid/' : 'staff/') + uid, { foto: '' });
  modal('');
  toast('Foto profil dihapus');
}

async function updateAvatar(fl) {
  if (!fl) return;
  openPhotoCropper(fl, async (foto) => {
    await save((role === 'murid' ? 'murid/' : 'staff/') + uid, { foto });
    toast('Foto profil diperbarui');
  });
}

function openPhotoCropper(srcOrFile, onDone) {
  const img = new Image();
  img.onload = () => {
    let rot = 0;
    const getRotatedCanvas = () => {
      const swap = rot % 180 !== 0;
      const c = document.createElement('canvas');
      c.width = swap ? img.height : img.width;
      c.height = swap ? img.width : img.height;
      const cx = c.getContext('2d');
      cx.translate(c.width / 2, c.height / 2);
      cx.rotate((rot * Math.PI) / 180);
      cx.drawImage(img, -img.width / 2, -img.height / 2);
      return c;
    };

    modal(`
      <div style="text-align:center;margin-bottom:8px;font-weight:700;font-size:15px">Sesuaikan Foto Profil</div>
      <div class="m" style="text-align:center;font-size:12px;margin-bottom:10px">Seret kotak atau tarik sudut putih untuk menyesuaikan</div>
      <div style="display:flex;justify-content:center;background:#050b14;border-radius:12px;padding:8px;touch-action:none">
        <canvas id="wa_cv" width="300" height="340" style="max-width:100%;border-radius:8px;cursor:move;touch-action:none"></canvas>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;padding:0 4px">
        <button class="b" onclick="modal('')" style="color:#4ade80;border-color:transparent;background:transparent;font-weight:700;font-size:15px">Batal</button>
        <button class="b" id="wa_rot" title="Putar 90°" style="font-size:18px;padding:6px 14px;border-radius:999px">↻</button>
        <button class="b" id="wa_done" style="color:#4ade80;border-color:transparent;background:transparent;font-weight:700;font-size:15px">Selesai</button>
      </div>
    `);

    const cv = $('#wa_cv'), ctx = cv.getContext('2d');
    let srcCv = getRotatedCanvas();
    let imgBox = { x: 0, y: 0, w: 300, h: 340, scale: 1 };
    let crop = { x: 40, y: 60, size: 220 };
    let drag = null;

    const resetLayout = () => {
      srcCv = getRotatedCanvas();
      const scale = Math.min(cv.width / srcCv.width, cv.height / srcCv.height);
      const dw = srcCv.width * scale, dh = srcCv.height * scale;
      imgBox = { x: (cv.width - dw) / 2, y: (cv.height - dh) / 2, w: dw, h: dh, scale };
      const sz = Math.min(dw, dh) * 0.85;
      crop = { x: imgBox.x + (dw - sz) / 2, y: imgBox.y + (dh - sz) / 2, size: sz };
    };

    const clampCrop = () => {
      const minSz = 60;
      const maxSz = Math.min(imgBox.w, imgBox.h);
      crop.size = Math.max(minSz, Math.min(maxSz, crop.size));
      crop.x = Math.max(imgBox.x, Math.min(imgBox.x + imgBox.w - crop.size, crop.x));
      crop.y = Math.max(imgBox.y, Math.min(imgBox.y + imgBox.h - crop.size, crop.y));
    };

    const draw = () => {
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(srcCv, imgBox.x, imgBox.y, imgBox.w, imgBox.h);

      ctx.fillStyle = 'rgba(0, 0, 0, 0.58)';
      ctx.fillRect(0, 0, cv.width, crop.y);
      ctx.fillRect(0, crop.y + crop.size, cv.width, cv.height - (crop.y + crop.size));
      ctx.fillRect(0, crop.y, crop.x, crop.size);
      ctx.fillRect(crop.x + crop.size, crop.y, cv.width - (crop.x + crop.size), crop.size);

      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(crop.x, crop.y, crop.size, crop.size);

      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1;
      for (let i = 1; i <= 2; i++) {
        const gx = crop.x + (crop.size * i) / 3;
        const gy = crop.y + (crop.size * i) / 3;
        ctx.beginPath(); ctx.moveTo(gx, crop.y); ctx.lineTo(gx, crop.y + crop.size); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(crop.x, gy); ctx.lineTo(crop.x + crop.size, gy); ctx.stroke();
      }

      const L = 18;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3.5;
      const { x, y, size: s } = crop;
      const corners = [
        [[x, y + L], [x, y], [x + L, y]],
        [[x + s - L, y], [x + s, y], [x + s, y + L]],
        [[x, y + s - L], [x, y + s], [x + L, y + s]],
        [[x + s - L, y + s], [x + s, y + s], [x + s, y + s - L]],
      ];
      corners.forEach(pts => {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        ctx.lineTo(pts[1][0], pts[1][1]);
        ctx.lineTo(pts[2][0], pts[2][1]);
        ctx.stroke();
      });
      const mid = L * 0.7;
      ctx.beginPath();
      ctx.moveTo(x + s / 2 - mid, y); ctx.lineTo(x + s / 2 + mid, y);
      ctx.moveTo(x + s / 2 - mid, y + s); ctx.lineTo(x + s / 2 + mid, y + s);
      ctx.moveTo(x, y + s / 2 - mid); ctx.lineTo(x, y + s / 2 + mid);
      ctx.moveTo(x + s, y + s / 2 - mid); ctx.lineTo(x + s, y + s / 2 + mid);
      ctx.stroke();
    };

    const getPos = e => {
      const r = cv.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      return { x: ((t.clientX - r.left) / r.width) * cv.width, y: ((t.clientY - r.top) / r.height) * cv.height };
    };

    const hitMode = p => {
      const pad = 22;
      const { x, y, size: s } = crop;
      if (Math.hypot(p.x - x, p.y - y) < pad) return 'nw';
      if (Math.hypot(p.x - (x + s), p.y - y) < pad) return 'ne';
      if (Math.hypot(p.x - x, p.y - (y + s)) < pad) return 'sw';
      if (Math.hypot(p.x - (x + s), p.y - (y + s)) < pad) return 'se';
      if (p.x >= x && p.x <= x + s && p.y >= y && p.y <= y + s) return 'move';
      return null;
    };

    const onDown = e => {
      const p = getPos(e);
      const mode = hitMode(p);
      if (!mode) return;
      e.preventDefault();
      drag = { mode, start: p, orig: { ...crop } };
    };

    const onMove = e => {
      if (!drag) return;
      e.preventDefault();
      const p = getPos(e);
      const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
      const o = drag.orig;
      if (drag.mode === 'move') {
        crop.x = o.x + dx;
        crop.y = o.y + dy;
      } else if (drag.mode === 'se') {
        crop.size = o.size + Math.max(dx, dy);
      } else if (drag.mode === 'nw') {
        const d = Math.min(dx, dy);
        crop.x = o.x + d;
        crop.y = o.y + d;
        crop.size = o.size - d;
      } else if (drag.mode === 'ne') {
        const d = Math.max(dx, -dy);
        crop.y = o.y - d;
        crop.size = o.size + d;
      } else if (drag.mode === 'sw') {
        const d = Math.max(-dx, dy);
        crop.x = o.x - d;
        crop.size = o.size + d;
      }
      clampCrop();
      draw();
    };

    const onUp = () => { drag = null; };

    cv.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    cv.addEventListener('touchstart', onDown, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);

    $('#wa_rot').onclick = () => { rot = (rot + 90) % 360; resetLayout(); draw(); };
    $('#wa_done').onclick = async () => {
      const sx = Math.max(0, ((crop.x - imgBox.x) / imgBox.w) * srcCv.width);
      const sy = Math.max(0, ((crop.y - imgBox.y) / imgBox.h) * srcCv.height);
      const sw = Math.min(srcCv.width - sx, (crop.size / imgBox.w) * srcCv.width);
      const sh = Math.min(srcCv.height - sy, (crop.size / imgBox.h) * srcCv.height);
      const out = document.createElement('canvas');
      out.width = 300; out.height = 300;
      out.getContext('2d').drawImage(srcCv, sx, sy, sw, sh, 0, 0, 300, 300);
      modal('');
      await onDone(out.toDataURL('image/jpeg', 0.88));
    };

    resetLayout();
    draw();
  };
  img.src = typeof srcOrFile === 'string' ? srcOrFile : URL.createObjectURL(srcOrFile);
}

function openInfoProfile() {
  if (role === 'murid') {
    const m = S.murid[uid] || {};
    modal(`<h3 style="margin-top:0">Info Profile Anggota</h3>
      <label class="m">Nama Lengkap</label>
      <input id="ip_nama" value="${E(m.nama)}">
      <label class="m">No. Anggota</label>
      <input value="${E(m.noAnggota)}" disabled style="opacity:.7">
      <label class="m">Tingkatan Sabuk</label>
      <input value="${E(sabukNama(m.sabuk))}" disabled style="opacity:.7">
      <label class="m">Unit Latihan</label>
      <input value="${E(unitLabel(m.unit))}" disabled style="opacity:.7">
      <label class="m">Jenis Kelamin</label>
      <select id="ip_jk" style="width:100%;margin-bottom:8px">
        <option value="Laki-laki" ${m.jk === 'Perempuan' ? '' : 'selected'}>Laki-laki</option>
        <option value="Perempuan" ${m.jk === 'Perempuan' ? 'selected' : ''}>Perempuan</option>
      </select>
      <label class="m">Nomor Telepon</label>
      <input id="ip_telp" value="${E(m.telp)}">
      <div class="btns">
        <button class="b p" onclick="saveInfoProfile()">Simpan</button>
        <button class="b" onclick="modal('')">Tutup</button>
      </div>`);
  } else {
    const s = S.staff[uid] || {}, ws = listWilayah();
    modal(`<h3 style="margin-top:0">Info Profile Pelatih</h3>
      <label class="m">Nama Lengkap</label>
      <input id="ip_nama" value="${E(s.nama)}">
      <label class="m">Nomor Telepon</label>
      <input id="ip_telp" placeholder="Nomor telepon pelatih" value="${E(s.telp || '')}">
      <label class="m">Wilayah Tugas</label>
      <select id="ip_wil" style="width:100%;margin-bottom:8px">
        <option value="">-- Pilih Wilayah --</option>
        ${ws.map(w => `<option value="${w.id}" ${s.wilayah === w.id ? 'selected' : ''}>${E(w.nama)}</option>`).join('')}
      </select>
      <div class="btns">
        <button class="b p" onclick="saveInfoProfile()">Simpan</button>
        <button class="b" onclick="modal('')">Tutup</button>
      </div>`);
  }
}

async function saveInfoProfile() {
  const nama = v('ip_nama').trim();
  if (!nama) return toast('Nama lengkap wajib diisi');
  if (role === 'murid') {
    await save('murid/' + uid, { nama, jk: v('ip_jk'), telp: v('ip_telp').trim() });
  } else {
    await save('staff/' + uid, { nama, telp: v('ip_telp').trim(), wilayah: v('ip_wil') });
  }
  modal('');
  toast('Info profil disimpan');
}

function openAccountSettings() {
  modal(`<h3 style="margin-top:0">Pengaturan Akun</h3>
    <p class="m" style="margin-top:0">Ubah kata sandi yang digunakan untuk masuk ke akun Anda.</p>
    <label class="m">Kata Sandi Baru</label>
    <input id="acc_pw1" type="password" placeholder="Masukkan kata sandi baru">
    <label class="m">Ulangi Kata Sandi Baru</label>
    <input id="acc_pw2" type="password" placeholder="Ulangi kata sandi baru">
    <div class="btns">
      <button class="b p" onclick="saveAccountPassword()">Simpan Kata Sandi</button>
      <button class="b" onclick="modal('')">Batal</button>
    </div>`);
}

async function saveAccountPassword() {
  const p1 = v('acc_pw1'), p2 = v('acc_pw2');
  if (!p1) return toast('Kata sandi baru wajib diisi');
  if (p1 !== p2) return toast('Konfirmasi kata sandi tidak cocok');
  await save((role === 'murid' ? 'murid/' : 'staff/') + uid, { password: p1 });
  modal('');
  toast('Kata sandi berhasil diperbarui');
}

function vWeb() {
  const s = site();
  return `<h2>Ubah Website</h2>
  <div class="card" style="max-width:640px">
    <div style="margin-bottom:12px">
      <label class="m" style="display:block;margin-bottom:6px;font-weight:600">Nama Website</label>
      <input id="wn" value="${E(s.nama)}" style="width:100%;display:block;box-sizing:border-box">
    </div>
    <div style="margin-bottom:12px">
      <label class="m" style="display:block;margin-bottom:6px;font-weight:600">Subjudul / Tagline</label>
      <input id="wt" value="${E(s.tag)}" style="width:100%;display:block;box-sizing:border-box">
    </div>
    <div style="margin-bottom:12px">
      <label class="m" style="display:block;margin-bottom:6px;font-weight:600">Teks Sambutan</label>
      <textarea id="ws" rows="3" style="width:100%;display:block;box-sizing:border-box">${E(s.sambutan)}</textarea>
    </div>
    <div style="margin-bottom:14px">
      <label class="m" style="display:block;margin-bottom:6px;font-weight:600">Logo Perguruan (opsional)</label>
      <input id="wl" type="file" accept="image/*" style="width:100%;display:block;box-sizing:border-box">
    </div>
    <div class="btns"><button class="b p" onclick="saveWeb()">Simpan Perubahan</button></div>
  </div>`;
}

function trimBlackBars(img) {
  return { sx: 0, sy: 0, sw: img.width, sh: img.height };
}

const shrink = (fl, w = 256, h = 256) => new Promise(r => {
  const i = new Image();
  i.onload = () => {
    const box = trimBlackBars(i);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const scale = Math.max(w / box.sw, h / box.sh);
    const sw = w / scale;
    const sh = h / scale;
    const sx = box.sx + (box.sw - sw) / 2;
    const sy = box.sy + Math.max(0, (box.sh - sh) * 0.25);
    c.getContext('2d').drawImage(i, sx, sy, sw, sh, 0, 0, w, h);
    r(c.toDataURL('image/jpeg', .85));
  };
  i.src = URL.createObjectURL(fl);
});
async function saveWeb() { const o = { nama: v('wn').trim(), tag: v('wt').trim(), sambutan: v('ws').trim(), logo: S.cfg.main?.site?.logo || '' }; const fl = $('#wl').files[0]; if (fl) o.logo = await shrink(fl); await save('cfg/main', { ...(S.cfg.main || {}), site: o }); toast('Tersimpan'); }

let TOKEN = localStorage.getItem('sbti_token') || '', last = '';
async function API(p, o = {}) {
  const r = await fetch('/api/' + p, { method: o.body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}) }, body: o.body ? JSON.stringify(o.body) : undefined });
  let j = {}; try { j = await r.json(); } catch (e) {}
  if (!r.ok) { const e = new Error(j.error || 'Terjadi kesalahan'); e.code = r.status; throw e; }
  return j;
}
async function save(p, d) { try { await API('set', { body: { path: p, data: d } }); await load(); } catch (e) { toast(e.message); } }
async function del(p) { try { await API('del', { body: { path: p } }); await load(); } catch (e) { toast(e.message); } }
async function load(force) { try { const j = await API('data'), s = JSON.stringify(j.S); S = j.S; if (s !== last || force) { const a = document.activeElement, typing = a && $('#app').contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName); if (force || !typing) { last = s; render(); } } } catch (e) { if (e.code === 401) keluar(); } }
async function begin(j) { TOKEN = j.token; localStorage.setItem('sbti_token', TOKEN); uid = j.uid; role = j.role; entered = true; view = ''; sel = null; await load(true); }
async function doLogin(r, b) { try { await begin(await API('login', { body: { role: r, ...b } })); } catch (e) { toast(e.message); } }
async function daftar() {
  const fields = [
    ['rn', 'Nama lengkap wajib diisi!'],
    ['rj', 'Jenis kelamin wajib dipilih!'],
    ['rt', 'Nomor telepon wajib diisi!'],
    ['rw', 'Wilayah wajib diisi!'],
    ['rc', 'Cabang wajib diisi!'],
    ['ru', 'Unit latihan wajib diisi!'],
    ['rs', 'Tingkatan sabuk wajib dipilih!'],
    ['ro', 'Nomor anggota wajib diisi!'],
    ['rp', 'Kata sandi wajib diisi!']
  ];
  for (const [id, msg] of fields) {
    if (!v(id).trim()) {
      $('#' + id)?.focus();
      return toast(msg);
    }
  }
  try {
    await begin(await API('register', {
      body: {
        nama: v('rn').trim(),
        jk: v('rj').trim(),
        telp: v('rt').trim(),
        wilayah: v('rw').trim(),
        cabang: v('rc').trim(),
        unit: v('ru').trim(),
        sabuk: v('rs').trim(),
        noAnggota: v('ro').trim(),
        password: v('rp')
      }
    }));
  } catch (e) { toast(e.message); }
}
async function daftarPelatih() { try { await begin(await API('register', { body: { role: 'pelatih', nama: v('rpn'), password: v('rpp') } })); } catch (e) { toast(e.message); } }

(async () => {
  try { PUB = await API('public'); S.cfg = { main: { site: PUB.site } }; } catch (e) {}
  if (TOKEN) { try { const m = await API('me'); uid = m.uid; role = m.role; entered = true; await load(true); return; } catch (e) { TOKEN = ''; localStorage.removeItem('sbti_token'); } }
  render();
})();
setInterval(() => { if (entered) load(); }, 10000);
