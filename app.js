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
  materi: '📚'
};

let uid, role = null, view = '', sel = null, Q = '', QSabuk = '';
let S = { wilayah: {}, cabang: {}, unit: {}, murid: {}, staff: {}, sesi: {}, absen: {}, nilai: {}, materi: {}, cfg: {}, meta: { sabuk: SABUK_LIST } };
let PUB = { wilayah: {}, cabang: {}, unit: {}, site: {} };
let F = { w: '', c: '', u: '' };
let R = { p: today().slice(0, 7), mode: 'ind', u: '' };

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
    ? [['absen', 'Absen'], ['materi', 'Materi Latihan'], ['nilai', 'Raport Saya']]
    : [['dash', 'Dashboard'], ['wilayah', 'Wilayah & Unit'], ['anggota', 'Anggota'], ['latihan', 'Latihan & Absen'], ['raport', 'Raport'], ['atur', 'Pengaturan'], ['web', 'Ubah Website']];

  if (!nav.some(n => n[0] === view)) view = nav[0][0];
  const V = {
    dash: vDash, wilayah: vWilayah, anggota: vAnggota, latihan: vLatihan,
    raport: vRaport, atur: vAtur, web: vWeb, absen: vAbsen, nilai: vRaport, materi: vMateri
  }[view]();

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
      c = `
        <input id="rn" placeholder="Nama lengkap" value="${E(v('rn'))}">
        <select id="rj">
          <option ${v('rj') === 'Perempuan' ? '' : 'selected'}>Laki-laki</option>
          <option ${v('rj') === 'Perempuan' ? 'selected' : ''}>Perempuan</option>
        </select>
        <input id="rt" placeholder="Nomor telepon (opsional)" value="${E(v('rt'))}">
        <input id="rw" list="wilayah-suggest" placeholder="Wilayah (mis. Tangerang Kota / Jakarta Barat)" value="${E(v('rw'))}">
        <datalist id="wilayah-suggest">${ws.map(w => `<option value="${E(w.nama)}">`).join('')}</datalist>
        <select id="rs">${SABUK_LIST.map(sb => `<option value="${sb.id}">Sabuk ${E(sb.nama)}</option>`).join('')}</select>
        <input id="rp" type="password" placeholder="Buat kata sandi (min. 4 karakter)">
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
    c = `
      <input id="pn" placeholder="Nama Anda">
      <input id="pk" type="${SHOW_CODE ? 'text' : 'password'}" placeholder="Kode akses pelatih">
      <label class="m" style="display:flex;align-items:center;gap:6px;margin:4px 0 10px;cursor:pointer">
        <input type="checkbox" style="width:auto;margin:0" ${SHOW_CODE ? 'checked' : ''} onchange="SHOW_CODE=this.checked;render()"> Tampilkan kode
      </label>
      <button class="b p w" onclick="doLogin('pelatih',{nama:v('pn'),kode:v('pk')})">Masuk</button>
      <p class="m">Masukkan nama dan kode akses pelatih. Huruf besar/kecil dan spasi tidak berpengaruh.</p>`;
  }

  return `<div class="hero">
    <div class="side"><img class="lg2" src="${s.logo}"><h1>${E(s.nama)}</h1><p>${E(s.tag)}</p><p style="opacity:.9">${E(s.sambutan)}</p></div>
    <div class="box">
      <div class="tabs">${['murid', 'pelatih'].map(x => `<a class="${tab === x ? 'on' : ''}" onclick="tab='${x}';render()">${cap(x)}</a>`).join('')}</div>
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
      return `<p><b>${E(s.materi)}</b> — sudah absen ${targetMs.length - belum.length} dari ${targetMs.length}</p>`;
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

function vLatihan() {
  if (sel && S.sesi[sel]) return vSesi();
  const us = listUnit(F.c, F.w), kats = ['Fisik', 'Kelincahan', 'Kekuatan', 'Jurus'];
  return `<h2>Latihan & Absensi</h2>${filterBarHTML()}
  <div class="card"><h3 style="margin-top:0">Buat latihan baru</h3>
    <div class="row"><select id="su"><option value="">Pilih unit latihan</option>${us.map(u => `<option value="${u.id}" ${F.u === u.id ? 'selected' : ''}>${E(unitLabel(u.id))}</option>`).join('')}</select><input id="st" type="date" value="${today()}"></div>
    <div class="row">${kats.map((k, idx) => `<label style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border:1px solid var(--l);border-radius:8px;cursor:pointer;background:var(--c)"><input type="checkbox" name="skat" value="${k}" ${idx === 0 ? 'checked' : ''} style="margin:0"><span>${KAT_ICONS[k]} ${k}</span></label>`).join('')}</div>
    <div class="row"><input id="sm" placeholder="Keterangan (opsional, mis. Jurus 1–3)" style="flex:1;min-width:220px"><button class="b p" onclick="addSesi()">Simpan Latihan</button></div>
  </div>
  <div class="card tw"><table><tr><th>Tanggal</th><th>Unit</th><th>Materi</th><th>Hadir</th><th>Dinilai</th><th></th></tr>
    ${sesiList(true).map(s => {
      const hadir = Object.keys(S.absen).filter(x => x.startsWith(s.id + '_') && S.absen[x].status === 'hadir').length;
      const dinilai = Object.keys(S.nilai).filter(x => x.startsWith(s.id + '_')).length;
      return `<tr><td>${fd(s.tgl)}</td><td>${E(S.unit[s.unit]?.nama || 'Semua Unit')}</td><td>${E(s.materi)}</td><td>${hadir}</td><td>${dinilai}</td><td><button class="b" onclick="sel='${s.id}';render()">Buka</button></td></tr>`;
    }).join('') || '<tr><td colspan="6" class="m">Belum ada latihan.</td></tr>'}
  </table></div>`;
}

async function addSesi() {
  const checked = [...document.querySelectorAll('input[name="skat"]:checked')].map(el => el.value);
  const materi = [checked.join(', '), v('sm').trim()].filter(Boolean).join(' — ');
  if (!materi || !v('st')) return toast('Pilih materi atau isi keterangan');
  await save('sesi/s' + Date.now(), { tgl: v('st'), unit: v('su'), materi, pelatih: S.staff[uid]?.nama || 'Pelatih' });
}

function vSesi() {
  const s = S.sesi[sel], ms = muridList(false, false).filter(m => !s.unit || m.unit === s.unit);
  return `<div class="row"><button class="b" onclick="sel=null;render()">← Kembali</button><h2 style="margin:0">${fd(s.tgl)}</h2></div>
  <div class="card"><div class="row"><input id="et" type="date" value="${s.tgl}"><input id="em" value="${E(s.materi)}" style="flex:1"><button class="b p" onclick="save('sesi/${sel}',{...S.sesi['${sel}'],tgl:v('et'),materi:v('em').trim()})">Simpan</button><button class="b d" onclick="if(confirm('Hapus latihan?')){const id=sel;sel=null;del('sesi/'+id)}">Hapus Latihan</button></div></div>
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
  const pelatihSesi = Object.values(S.sesi || {}).find(s => ym(s.tgl) === p && (!s.unit || s.unit === m.unit) && s.pelatih)?.pelatih;
  const namaPelatih = pelatihSesi || Object.values(S.staff || {})[0]?.nama || '-';
  const fotoBox = m.foto
    ? `<img src="${m.foto}" alt="Foto ${E(m.nama)}" style="width:112px;height:148px;object-fit:cover;border:1.5px solid #cbd5e1;border-radius:6px;display:block">`
    : `<div style="width:112px;height:148px;border:1.5px dashed #94a3b8;border-radius:6px;display:flex;align-items:center;justify-content:center;text-align:center;color:#64748b;font-size:11.5px;padding:6px;background:#f8fafc">Pas Foto<br>3x4</div>`;
  return `<div class="rpt"><img class="lg" src="${site().logo}"><h2>${E(site().nama)}</h2><p class="m">Raport Penilaian Bulanan · Periode ${fm(p)}</p>
    <div style="display:flex;gap:36px;align-items:flex-start;justify-content:space-between;max-width:760px;margin:0 auto 18px">
      <table style="flex:1;max-width:560px;margin-bottom:0">
        <tr><td width="34%">Nama</td><td><b>${E(m.nama)}</b></td></tr>
        <tr><td>No. Anggota</td><td>${E(m.noAnggota)}</td></tr>
        <tr><td>Sabuk</td><td>${E(sabukNama(m.sabuk))}</td></tr>
        <tr><td>Unit Latihan</td><td>${E(unitLabel(m.unit))}</td></tr>
        <tr><td>Nama Pelatih</td><td>${E(namaPelatih)}</td></tr>
      </table>
      <div style="flex-shrink:0;padding-top:4px">${fotoBox}</div>
    </div>
    <table><tr><th>Total latihan</th><th>Hadir</th><th>Izin</th><th>Sakit</th><th>Alpha</th><th>Kehadiran</th></tr><tr><td>${r.tot}</td><td>${r.c.hadir}</td><td>${r.c.izin}</td><td>${r.c.sakit}</td><td>${r.c.alpha}</td><td>${f(r.pct)}%</td></tr></table>
    <table><tr><th>Materi</th><th>Jumlah penilaian</th><th>Rata-rata</th></tr>${r.mats.map(x => `<tr><td>${E(x.m)}</td><td>${x.n}</td><td>${f(x.r)}</td></tr>`).join('') || '<tr><td colspan="3">Belum ada nilai pada periode ini</td></tr>'}<tr><th colspan="2">Rata-rata keseluruhan</th><th>${f(r.all)}</th></tr></table>
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
  return `<h2>Raport Bulanan</h2>${staff ? filterBarHTML() : ''}
  <div class="row np"><input type="month" value="${R.p}" onchange="R.p=this.value||R.p;render()">
    ${staff ? `<select onchange="R.mode=this.value;render()"><option value="ind" ${R.mode === 'ind' ? 'selected' : ''}>Raport individu</option><option value="all" ${R.mode === 'all' ? 'selected' : ''}>Rekap seluruh anggota</option></select>
      ${R.mode === 'ind' ? `<select onchange="R.u=this.value;render()">${ms.map(m => `<option value="${m.id}" ${m.id === R.u ? 'selected' : ''}>${E(m.nama)}</option>`).join('')}</select>` : ''}` : `<label class="b" style="display:inline-flex;align-items:center;gap:6px;cursor:pointer">📷 Upload Foto Raport<input type="file" accept="image/*" style="display:none" onchange="uploadMyFoto(this.files[0])"></label>`}
    <button class="b p" onclick="window.print()">Cetak Raport</button>
    <button class="b" onclick="toast('Pilih Simpan sebagai PDF pada dialog cetak');window.print()">Download PDF</button>
  </div>${R.mode === 'all' && staff ? rekapHTML(R.p) : R.u ? rptHTML(R.u, R.p) : '<div class="card">Belum ada anggota.</div>'}`;
}

async function uploadMyFoto(fl) {
  if (!fl) return;
  const foto = await shrink(fl, 240, 320);
  await save('murid/' + uid, { foto });
  toast('Foto raport diperbarui');
}

function vAbsen() {
  const me = S.murid[uid] || {};
  const ss = Object.entries(S.sesi || {}).map(([id, s]) => ({ id, ...s })).filter(s => s.tgl === today() && (!s.unit || s.unit === me.unit));
  return `<h2>Absen Latihan</h2><div class="card"><b>${E(me.nama)}</b> · <span class="m">Sabuk ${E(sabukNama(me.sabuk))} · ${E(unitLabel(me.unit))}</span></div>
  ${ss.map(s => {
    const ab = S.absen[s.id + '_' + uid], a = ab?.status;
    return `<div class="card"><b>${E(s.materi)}</b><div class="m">${fd(s.tgl)}</div><div class="btns">${['hadir', 'izin', 'sakit'].map(k => `<button class="b ${a === k ? 'on' : ''}" onclick="save('absen/${s.id}_${uid}',{sesi:'${s.id}',uid:'${uid}',status:'${k}'})">${cap(k)}</button>`).join('')}</div>${a ? `<p class="m">Status Anda: <b>${cap(a)}</b></p>` : ''}</div>`;
  }).join('') || '<div class="card">Belum ada latihan hari ini.</div>'}`;
}

function vMateri() {
  const me = S.murid[uid] || {};
  const ss = Object.entries(S.sesi || {}).map(([id, s]) => ({ id, ...s })).filter(s => !s.unit || s.unit === me.unit).sort((a, b) => b.tgl.localeCompare(a.tgl));
  return `<h2>Materi Latihan</h2><div class="card">${ss.map(s => `<p style="border-bottom:1px solid var(--l);padding-bottom:8px"><b>${E(s.materi)}</b><br><span class="m">${fd(s.tgl)}</span></p>`).join('') || '<p class="m">Belum ada materi latihan.</p>'}</div>`;
}

function vAtur() {
  const st = Object.entries(S.staff || {});
  return `<h2>Pengaturan</h2>
  <div class="card"><h3 style="margin-top:0">Profil pelatih</h3><div class="row"><input id="nm" value="${E(S.staff[uid]?.nama || '')}"><button class="b p" onclick="save('staff/${uid}',{...S.staff['${uid}'],nama:v('nm').trim()})">Simpan</button></div></div>
  <div class="card"><h3 style="margin-top:0">Kode akses pelatih</h3><div class="row"><input id="kd" value="${E(S.cfg.main?.kode)}"><button class="b p" onclick="save('cfg/main',{...(S.cfg.main||{}),kode:v('kd').trim()});toast('Tersimpan')">Simpan</button></div></div>
  <div class="card"><h3 style="margin-top:0">Daftar pelatih</h3>${st.map(([id, s]) => `<div class="row" style="justify-content:space-between">${E(s.nama)} <button class="b d" onclick="del('staff/${id}')">Hapus</button></div>`).join('') || '<p class="m">Belum ada pelatih.</p>'}</div>`;
}

function vWeb() {
  const s = site();
  return `<h2>Ubah Website</h2><div class="card">
    <label class="m">Nama website</label><input id="wn" value="${E(s.nama)}" style="width:100%;margin-bottom:8px">
    <label class="m">Tagline</label><input id="wt" value="${E(s.tag)}" style="width:100%;margin-bottom:8px">
    <label class="m">Teks sambutan</label><textarea id="ws" rows="3" style="width:100%;margin-bottom:8px">${E(s.sambutan)}</textarea>
    <label class="m">Ganti logo</label><input id="wl" type="file" accept="image/*" style="width:100%;margin-bottom:8px">
    <div class="btns"><button class="b p" onclick="saveWeb()">Simpan</button><button class="b" onclick="save('cfg/main',{...(S.cfg.main||{}),site:{}})">Kembalikan bawaan</button></div>
  </div>`;
}

const shrink = (fl, w = 256, h = 256) => new Promise(r => { const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(i, 0, 0, w, h); r(c.toDataURL('image/jpeg', .85)); }; i.src = URL.createObjectURL(fl); });
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
async function daftar() { try { await begin(await API('register', { body: { nama: v('rn'), jk: v('rj'), telp: v('rt'), wilayah: v('rw'), sabuk: v('rs'), password: v('rp') } })); } catch (e) { toast(e.message); } }

(async () => {
  try { PUB = await API('public'); S.cfg = { main: { site: PUB.site } }; } catch (e) {}
  if (TOKEN) { try { const m = await API('me'); uid = m.uid; role = m.role; entered = true; await load(true); return; } catch (e) { TOKEN = ''; localStorage.removeItem('sbti_token'); } }
  render();
})();
setInterval(() => { if (entered) load(); }, 10000);
