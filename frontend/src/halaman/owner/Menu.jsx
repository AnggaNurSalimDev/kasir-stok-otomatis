import { useEffect, useState } from 'react';
import { useSesi } from '../../sesi/SesiContext.jsx';
import { useData } from '../../komponen/useData.js';
import { Memuat, Pesan, PesanGalat } from '../../komponen/umum.jsx';
import { Isian, RingkasanGalat, useKirim, GalatForm } from '../../komponen/form.jsx';
import { angkaBulatDari, formatRupiah } from '../../komponen/formAngka.js';
import EditorResep, { barisKosong, resepKeBody, resepKeBaris } from '../../komponen/EditorResep.jsx';
import { Link, useLocation } from 'react-router-dom';
import EditorIsiPaket, { isiKosong, isiKeBody, isiKeForm, kalimatIsi, hargaIsiToko } from '../../komponen/EditorIsiPaket.jsx';
import { SALURAN_ONLINE, NAMA_SALURAN } from '../../../../logika/saluran.js';

// ---------------------------------------------------------------------------
// Harga per aplikasi (kosong = sama dengan harga toko)
// ---------------------------------------------------------------------------

const hargaSaluranKeForm = (hs = {}) => Object.fromEntries(SALURAN_ONLINE.map((x) => [x, hs[x] === undefined ? '' : String(hs[x])]));

// { gofood: '14500', grabfood: '' } → { gofood: 14500 } + galat per field
function hargaSaluranKeBody(form, awalanField, label) {
  const hasil = {};
  const detail = [];
  for (const x of SALURAN_ONLINE) {
    const teks = (form?.[x] ?? '').trim();
    if (teks === '') continue;
    const n = angkaBulatDari(teks);
    if (n === null || n < 0) detail.push({ field: `${awalanField}.${x}`, pesan: `${label}: harga ${NAMA_SALURAN[x]} wajib rupiah bulat` });
    else hasil[x] = n;
  }
  return { hargaSaluran: hasil, detail };
}

function IsianHargaSaluran({ nilai, onChange, perField, awalanField, hargaToko, placeholderKosong = 'sama dengan toko' }) {
  return (
    <div className="baris-isian">
      {SALURAN_ONLINE.map((x) => (
        <Isian key={x} label={`Harga ${NAMA_SALURAN[x]}`} galat={perField[`${awalanField}.${x}`]}>
          {(p) => <input {...p} className="angka" inputMode="numeric" value={nilai[x]} placeholder={hargaToko ? `sama: ${hargaToko}` : placeholderKosong} onChange={(e) => onChange({ ...nilai, [x]: e.target.value })} />}
        </Isian>
      ))}
    </div>
  );
}

const ringkasHargaSaluran = (b) => {
  const isi = SALURAN_ONLINE.filter((x) => Number.isInteger(b.hargaSaluran?.[x]) && b.hargaSaluran[x] !== b.harga);
  return isi.length ? isi.map((x) => `${NAMA_SALURAN[x]} ${formatRupiah(b.hargaSaluran[x])}`).join(' · ') : null;
};

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

const ukuranKosong = (nama = 'Regular') => ({ nama, harga: '', hargaSaluran: hargaSaluranKeForm(), resep: [barisKosong()] });

const menuKeForm = (m) => ({
  nama: m.nama,
  kategori: m.kategori,
  toppingIds: m.toppingIds,
  ukuran: m.ukuran.map((u) => ({ nama: u.nama, harga: String(u.harga), hargaSaluran: hargaSaluranKeForm(u.hargaSaluran), resep: resepKeBaris(u.resep) })),
});

function menuKeBody(f) {
  const detail = [];
  const ukuran = f.ukuran.map((u, i) => {
    const harga = angkaBulatDari(u.harga);
    if (harga === null) detail.push({ field: `ukuran[${i}].harga`, pesan: `Harga ${u.nama || `ukuran ${i + 1}`} wajib rupiah bulat` });
    const r = resepKeBody(u.resep, `ukuran[${i}].resep`);
    detail.push(...r.detail.map((d) => ({ ...d, pesan: `${u.nama || `Ukuran ${i + 1}`}: ${d.pesan}` })));
    const hs = hargaSaluranKeBody(u.hargaSaluran, `ukuran[${i}].hargaSaluran`, u.nama || `Ukuran ${i + 1}`);
    detail.push(...hs.detail);
    return { nama: u.nama, harga: harga ?? 0, hargaSaluran: hs.hargaSaluran, resep: r.resep };
  });
  if (detail.length) throw new GalatForm(detail);
  return { nama: f.nama, kategori: f.kategori, ukuran, toppingIds: f.toppingIds };
}

function FormMenu({ awal, bahan, topping, kategori, onSelesai, onBatal }) {
  const { api } = useSesi();
  const [f, setF] = useState(() => (awal ? menuKeForm(awal) : { nama: '', kategori: kategori[0] ?? '', toppingIds: [], ukuran: [ukuranKosong()] }));
  const kirim = useKirim();
  const pf = kirim.perField;
  const setUkuran = (i, perubahan) => setF({ ...f, ukuran: f.ukuran.map((u, j) => (j === i ? { ...u, ...perubahan } : u)) });

  // Ukuran baru menyalin resep ukuran pertama: biasanya hanya beberapa takaran yang berubah.
  const tambahUkuran = () => {
    const sumber = f.ukuran[0];
    const nama = f.ukuran.some((u) => u.nama === 'Large') ? '' : 'Large';
    setF({ ...f, ukuran: [...f.ukuran, sumber ? { nama, harga: '', hargaSaluran: hargaSaluranKeForm(), resep: sumber.resep.map((r) => ({ ...r })) } : ukuranKosong(nama)] });
  };

  const simpan = async (e) => {
    e.preventDefault();
    const hasil = await kirim.jalankan(() => api(awal ? `/menu/${awal.id}` : '/menu', { method: awal ? 'PUT' : 'POST', body: menuKeBody(f) }));
    if (hasil) onSelesai(awal ? 'Menu disimpan' : 'Menu ditambahkan');
  };

  return (
    <form className="kartu" onSubmit={simpan} noValidate>
      <h2>{awal ? `Ubah: ${awal.nama}` : 'Menu baru'}</h2>
      <RingkasanGalat galat={kirim.galat} />
      <div className="baris-isian">
        <Isian label="Nama menu" galat={pf.nama}>{(p) => <input {...p} value={f.nama} onChange={(e) => setF({ ...f, nama: e.target.value })} />}</Isian>
        <Isian label="Kategori" galat={pf.kategori}>
          {(p) => (
            <>
              <input {...p} list="kategori-menu" value={f.kategori} onChange={(e) => setF({ ...f, kategori: e.target.value })} />
              <datalist id="kategori-menu">{kategori.map((k) => <option key={k} value={k} />)}</datalist>
            </>
          )}
        </Isian>
      </div>

      {f.ukuran.map((u, i) => (
        <fieldset key={i}>
          <legend>Ukuran {i + 1}</legend>
          <div className="baris-isian">
            <Isian label="Nama ukuran" galat={pf[`ukuran[${i}].nama`]}>
              {(p) => <input {...p} value={u.nama} placeholder="Regular" onChange={(e) => setUkuran(i, { nama: e.target.value })} />}
            </Isian>
            <Isian label="Harga (Rp)" galat={pf[`ukuran[${i}].harga`]}>
              {(p) => <input {...p} className="angka" inputMode="numeric" value={u.harga} placeholder="12.000" onChange={(e) => setUkuran(i, { harga: e.target.value })} />}
            </Isian>
            {f.ukuran.length > 1 && (
              <button type="button" className="tombol-kecil" onClick={() => setF({ ...f, ukuran: f.ukuran.filter((_, j) => j !== i) })}>Hapus ukuran</button>
            )}
          </div>
          <details className="harga-saluran" open={SALURAN_ONLINE.some((x) => u.hargaSaluran[x] !== '')}>
            <summary>Harga di aplikasi (GoFood, GrabFood, ShopeeFood)</summary>
            <p className="bantuan">Kosong = sama dengan harga toko. Stok tetap memakai resep yang sama. Untuk semua menu sekaligus: <Link to="/owner/aplikasi/harga">tabel harga di aplikasi</Link>.</p>
            <IsianHargaSaluran nilai={u.hargaSaluran} onChange={(hargaSaluran) => setUkuran(i, { hargaSaluran })} perField={pf} awalanField={`ukuran[${i}].hargaSaluran`} hargaToko={u.harga} />
          </details>
          <EditorResep baris={u.resep} onChange={(resep) => setUkuran(i, { resep })} bahan={bahan} perField={pf} awalanField={`ukuran[${i}].resep`} />
        </fieldset>
      ))}
      {pf.ukuran && <small className="teks-galat">{pf.ukuran}</small>}
      {f.ukuran.length < 5 && (
        <button type="button" className="tombol-kecil" onClick={tambahUkuran}>
          + Tambah ukuran {f.ukuran[0] && <small>(resep disalin dari {f.ukuran[0].nama || 'ukuran 1'})</small>}
        </button>
      )}

      <fieldset>
        <legend>Topping yang tersedia</legend>
        {topping.length === 0 && <p className="bantuan">Belum ada topping.</p>}
        <div className="daftar-centang">
          {topping.map((t) => (
            <label key={t.id} className="centang">
              <input
                type="checkbox"
                checked={f.toppingIds.includes(t.id)}
                onChange={(e) => setF({ ...f, toppingIds: e.target.checked ? [...f.toppingIds, t.id] : f.toppingIds.filter((x) => x !== t.id) })}
              />
              {t.nama} <small>+{formatRupiah(t.harga)}</small>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="aksi">
        <button type="submit" className="tombol-utama" disabled={kirim.sedang}>{kirim.sedang ? 'Menyimpan…' : 'Simpan'}</button>
        <button type="button" className="tombol-kecil" onClick={onBatal}>Batal</button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Topping
// ---------------------------------------------------------------------------

function FormTopping({ awal, bahan, onSelesai, onBatal }) {
  const { api } = useSesi();
  const [f, setF] = useState(() =>
    awal
      ? { nama: awal.nama, harga: String(awal.harga), hargaSaluran: hargaSaluranKeForm(awal.hargaSaluran), resep: resepKeBaris(awal.resep) }
      : { nama: '', harga: '', hargaSaluran: hargaSaluranKeForm(), resep: [barisKosong()] },
  );
  const kirim = useKirim();
  const pf = kirim.perField;

  const simpan = async (e) => {
    e.preventDefault();
    const hasil = await kirim.jalankan(() => {
      const harga = angkaBulatDari(f.harga);
      const r = resepKeBody(f.resep, 'resep');
      const hs = hargaSaluranKeBody(f.hargaSaluran, 'hargaSaluran', 'Topping');
      const detail = [...(harga === null ? [{ field: 'harga', pesan: 'Harga wajib rupiah bulat' }] : []), ...hs.detail, ...r.detail];
      if (detail.length) throw new GalatForm(detail);
      return api(awal ? `/topping/${awal.id}` : '/topping', { method: awal ? 'PUT' : 'POST', body: { nama: f.nama, harga, hargaSaluran: hs.hargaSaluran, resep: r.resep } });
    });
    if (hasil) onSelesai(awal ? 'Topping disimpan' : 'Topping ditambahkan');
  };

  return (
    <form className="kartu" onSubmit={simpan} noValidate>
      <h2>{awal ? `Ubah topping: ${awal.nama}` : 'Topping baru'}</h2>
      <RingkasanGalat galat={kirim.galat} />
      <div className="baris-isian">
        <Isian label="Nama topping" galat={pf.nama}>{(p) => <input {...p} value={f.nama} onChange={(e) => setF({ ...f, nama: e.target.value })} />}</Isian>
        <Isian label="Harga tambahan (Rp)" galat={pf.harga}>
          {(p) => <input {...p} className="angka" inputMode="numeric" value={f.harga} onChange={(e) => setF({ ...f, harga: e.target.value })} />}
        </Isian>
      </div>
      <details className="harga-saluran" open={SALURAN_ONLINE.some((x) => f.hargaSaluran[x] !== '')}>
        <summary>Harga di aplikasi</summary>
        <IsianHargaSaluran nilai={f.hargaSaluran} onChange={(hargaSaluran) => setF({ ...f, hargaSaluran })} perField={pf} awalanField="hargaSaluran" hargaToko={f.harga} />
      </details>
      <EditorResep baris={f.resep} onChange={(resep) => setF({ ...f, resep })} bahan={bahan} perField={pf} awalanField="resep" />
      <div className="aksi">
        <button type="submit" className="tombol-utama" disabled={kirim.sedang}>{kirim.sedang ? 'Menyimpan…' : 'Simpan'}</button>
        <button type="button" className="tombol-kecil" onClick={onBatal}>Batal</button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Paket promo (khusus aplikasi)
// ---------------------------------------------------------------------------

function FormPaket({ awal, menu, onSelesai, onBatal }) {
  const { api } = useSesi();
  const [f, setF] = useState(() =>
    awal
      ? { nama: awal.nama, isi: isiKeForm(awal.isi), hargaSaluran: hargaSaluranKeForm(awal.hargaSaluran), aktif: awal.aktif }
      : { nama: '', isi: [isiKosong()], hargaSaluran: hargaSaluranKeForm(), aktif: true },
  );
  const kirim = useKirim();
  const pf = kirim.perField;
  const menuById = new Map(menu.map((m) => [m.id, m]));
  const kalimat = kalimatIsi(f.isi, menuById);
  const pembanding = hargaIsiToko(f.isi, menuById);

  const simpan = async (e) => {
    e.preventDefault();
    const hasil = await kirim.jalankan(() => {
      const isi = isiKeBody(f.isi);
      const hs = hargaSaluranKeBody(f.hargaSaluran, 'hargaSaluran', f.nama || 'Paket');
      const detail = [...isi.detail, ...hs.detail];
      if (Object.keys(hs.hargaSaluran).length === 0 && hs.detail.length === 0) detail.push({ field: 'hargaSaluran', pesan: 'Isi harga minimal di satu aplikasi' });
      if (detail.length) throw new GalatForm(detail);
      return api(awal ? `/paket/${awal.id}` : '/paket', { method: awal ? 'PUT' : 'POST', body: { nama: f.nama, isi: isi.isi, hargaSaluran: hs.hargaSaluran, aktif: f.aktif } });
    });
    if (hasil) onSelesai(awal ? 'Paket disimpan' : 'Paket ditambahkan. Di sambungan sungguhan, paket ikut dikirim ke aplikasi saat menu disinkron.');
  };

  return (
    <form className="kartu" onSubmit={simpan} noValidate>
      <h2>{awal ? `Ubah paket: ${awal.nama}` : 'Paket baru'}</h2>
      <RingkasanGalat galat={kirim.galat} />
      <Isian label="Nama paket" bantuan="Nama yang tampil di aplikasi, misalnya Paket Berdua" galat={pf.nama}>
        {(p) => <input {...p} value={f.nama} onChange={(e) => setF({ ...f, nama: e.target.value })} />}
      </Isian>
      <fieldset>
        <legend>Isi 1 paket (menurut resep kasir)</legend>
        <EditorIsiPaket baris={f.isi} onChange={(isi) => setF({ ...f, isi })} menu={menu} perField={pf} />
        <p className="pratinjau-pemetaan" aria-live="polite">
          {kalimat ? <>1× {f.nama || 'paket ini'} = <strong>{kalimat}</strong>{pembanding > 0 && <> · jika dibeli terpisah di toko {formatRupiah(pembanding)}</>}</> : <span className="teks-redup">Pilih menu untuk melihat isinya.</span>}
        </p>
      </fieldset>
      <fieldset>
        <legend>Harga di aplikasi</legend>
        <p className="bantuan">Paket hanya dijual di aplikasi, tidak di kasir toko. <strong>Kosong = tidak dijual di aplikasi itu.</strong> Isi minimal satu.</p>
        <IsianHargaSaluran nilai={f.hargaSaluran} onChange={(hargaSaluran) => setF({ ...f, hargaSaluran })} perField={pf} awalanField="hargaSaluran" placeholderKosong="tidak dijual" />
        {pf.hargaSaluran && <small className="teks-galat">{pf.hargaSaluran}</small>}
      </fieldset>
      <label className="centang">
        <input type="checkbox" checked={f.aktif} onChange={(e) => setF({ ...f, aktif: e.target.checked })} />
        Aktif (dijual). Matikan saat promo selesai; riwayat penjualan tetap tersimpan.
      </label>
      <div className="aksi">
        <button type="submit" className="tombol-utama" disabled={kirim.sedang}>{kirim.sedang ? 'Menyimpan…' : 'Simpan'}</button>
        <button type="button" className="tombol-kecil" onClick={onBatal}>Batal</button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Halaman
// ---------------------------------------------------------------------------

const ringkasResep = (resep, bahanById) =>
  resep.map((r) => `${String(r.jumlah).replace('.', ',')} ${r.satuan} ${bahanById.get(r.bahanId)?.nama.toLowerCase() ?? r.bahanId}`).join(', ');

export default function Menu() {
  const menu = useData('/menu');
  const topping = useData('/topping');
  const bahan = useData('/bahan');
  const paket = useData('/paket');
  const lokasi = useLocation();
  const [edit, setEdit] = useState(null); // { jenis: 'menu' | 'topping' | 'paket', data: null | objek }
  const [sukses, setSukses] = useState(null);

  const memuat = menu.memuat || topping.memuat || bahan.memuat || paket.memuat;
  const galat = menu.galat ?? topping.galat ?? bahan.galat ?? paket.galat;
  const ulangi = () => { menu.muatUlang(); topping.muatUlang(); bahan.muatUlang(); paket.muatUlang(); };

  // Tautan "Menu & resep → Paket" dari halaman lain: gulir ke bagian paket setelah data tampil.
  useEffect(() => {
    if (!memuat && lokasi.hash === '#paket') document.getElementById('paket')?.scrollIntoView();
  }, [memuat, lokasi.hash]);

  if (memuat) return <Memuat />;
  if (galat) return <PesanGalat galat={galat} ulangi={ulangi} />;

  const bahanAktif = bahan.data.filter((b) => !b.arsip);
  const bahanById = new Map(bahan.data.map((b) => [b.id, b]));
  const toppingById = new Map(topping.data.map((t) => [t.id, t]));
  const kategori = [...new Set(menu.data.map((m) => m.kategori))];
  const selesai = (pesan) => { setEdit(null); setSukses(pesan); ulangi(); };
  const mulai = (jenis, data = null) => { setSukses(null); setEdit({ jenis, data }); };
  const kunciForm = edit ? `${edit.jenis}-${edit.data?.id ?? 'baru'}` : null;

  return (
    <section>
      <div className="judul-aksi">
        <h1>Menu & resep</h1>
        {!edit && (
          <span className="aksi">
            <button type="button" className="tombol-utama" onClick={() => mulai('menu')}>+ Menu baru</button>
            <button type="button" className="tombol-kecil" onClick={() => mulai('topping')}>+ Topping baru</button>
            <button type="button" className="tombol-kecil" onClick={() => mulai('paket')}>+ Paket promo (aplikasi)</button>
          </span>
        )}
      </div>
      <p className="bantuan">Harga GoFood, GrabFood, dan ShopeeFood untuk semua menu bisa diatur sekaligus di <Link to="/owner/aplikasi/harga">Aplikasi online → Harga di aplikasi</Link>.</p>
      {sukses && !edit && <Pesan jenis="sukses">{sukses}</Pesan>}
      {edit?.jenis === 'menu' && (
        <FormMenu key={kunciForm} awal={edit.data} bahan={bahanAktif} topping={topping.data} kategori={kategori} onSelesai={selesai} onBatal={() => setEdit(null)} />
      )}
      {edit?.jenis === 'topping' && <FormTopping key={kunciForm} awal={edit.data} bahan={bahanAktif} onSelesai={selesai} onBatal={() => setEdit(null)} />}
      {edit?.jenis === 'paket' && <FormPaket key={kunciForm} awal={edit.data} menu={menu.data} onSelesai={selesai} onBatal={() => setEdit(null)} />}

      {kategori.map((k) => (
        <div key={k}>
          <h2 className="subjudul">{k}</h2>
          <div className="kisi-kartu">
            {menu.data.filter((m) => m.kategori === k).map((m) => (
              <article key={m.id} className="kartu kartu-menu">
                <div className="judul-aksi">
                  <h3>{m.nama}</h3>
                  <button type="button" className="tombol-kecil" onClick={() => mulai('menu', m)}>Ubah</button>
                </div>
                {m.ukuran.map((u) => (
                  <p key={u.nama}>
                    <strong>{u.nama}</strong> · {formatRupiah(u.harga)}
                    {ringkasHargaSaluran(u) && <><br /><small>{ringkasHargaSaluran(u)}</small></>}
                    <br />
                    <small>{ringkasResep(u.resep, bahanById)}</small>
                  </p>
                ))}
                {m.toppingIds.length > 0 && <small>Topping: {m.toppingIds.map((t) => toppingById.get(t)?.nama ?? t).join(', ')}</small>}
              </article>
            ))}
          </div>
        </div>
      ))}

      <h2 className="subjudul" id="paket">Paket promo (khusus aplikasi)</h2>
      <p className="bantuan">
        Paket dirancang di sini, bukan di aplikasi, supaya pesanannya langsung dikenali kasir dan stok setiap isinya berkurang sendiri.
        Paket tidak muncul di kasir untuk pesanan di toko.
      </p>
      {paket.data.length === 0 && <p className="bantuan">Belum ada paket.</p>}
      <div className="kisi-kartu">
        {paket.data.map((p) => (
          <article key={p.id} className="kartu kartu-menu">
            <div className="judul-aksi">
              <h3>{p.nama}</h3>
              <button type="button" className="tombol-kecil" onClick={() => mulai('paket', p)}>Ubah</button>
            </div>
            {!p.aktif && <span className="lencana lencana-netral">Nonaktif</span>}
            <p><small>{p.isi.map((k) => `${k.qty}× ${k.nama} ${k.ukuran}`).join(' + ')}</small></p>
            <p>
              {SALURAN_ONLINE.map((x) => (Number.isInteger(p.hargaSaluran[x]) ? `${NAMA_SALURAN[x]} ${formatRupiah(p.hargaSaluran[x])}` : null)).filter(Boolean).join(' · ')}
              <br /><small className="teks-redup">Isi jika dibeli terpisah di toko: {formatRupiah(p.hargaIsiToko)}</small>
            </p>
          </article>
        ))}
      </div>

      <h2 className="subjudul">Topping</h2>
      <div className="kisi-kartu">
        {topping.data.map((t) => (
          <article key={t.id} className="kartu kartu-menu">
            <div className="judul-aksi">
              <h3>{t.nama}</h3>
              <button type="button" className="tombol-kecil" onClick={() => mulai('topping', t)}>Ubah</button>
            </div>
            <p>+{formatRupiah(t.harga)}{ringkasHargaSaluran(t) && <><br /><small>{ringkasHargaSaluran(t)}</small></>}<br /><small>{ringkasResep(t.resep, bahanById)}</small></p>
          </article>
        ))}
      </div>
    </section>
  );
}
