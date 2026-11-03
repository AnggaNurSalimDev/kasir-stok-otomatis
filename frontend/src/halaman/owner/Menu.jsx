import { useState } from 'react';
import { useSesi } from '../../sesi/SesiContext.jsx';
import { useData } from '../../komponen/useData.js';
import { Memuat, Pesan, PesanGalat } from '../../komponen/umum.jsx';
import { Isian, RingkasanGalat, useKirim, GalatForm } from '../../komponen/form.jsx';
import { angkaBulatDari, formatRupiah } from '../../komponen/formAngka.js';
import EditorResep, { barisKosong, resepKeBody, resepKeBaris } from '../../komponen/EditorResep.jsx';
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

function IsianHargaSaluran({ nilai, onChange, perField, awalanField, hargaToko }) {
  return (
    <div className="baris-isian">
      {SALURAN_ONLINE.map((x) => (
        <Isian key={x} label={`Harga ${NAMA_SALURAN[x]}`} galat={perField[`${awalanField}.${x}`]}>
          {(p) => <input {...p} className="angka" inputMode="numeric" value={nilai[x]} placeholder={hargaToko ? `sama: ${hargaToko}` : 'sama dengan toko'} onChange={(e) => onChange({ ...nilai, [x]: e.target.value })} />}
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
            <p className="bantuan">Kosong = sama dengan harga toko. Stok tetap memakai resep yang sama.</p>
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
// Halaman
// ---------------------------------------------------------------------------

const ringkasResep = (resep, bahanById) =>
  resep.map((r) => `${String(r.jumlah).replace('.', ',')} ${r.satuan} ${bahanById.get(r.bahanId)?.nama.toLowerCase() ?? r.bahanId}`).join(', ');

export default function Menu() {
  const menu = useData('/menu');
  const topping = useData('/topping');
  const bahan = useData('/bahan');
  const [edit, setEdit] = useState(null); // { jenis: 'menu' | 'topping', data: null | objek }
  const [sukses, setSukses] = useState(null);

  const memuat = menu.memuat || topping.memuat || bahan.memuat;
  const galat = menu.galat ?? topping.galat ?? bahan.galat;
  const ulangi = () => { menu.muatUlang(); topping.muatUlang(); bahan.muatUlang(); };

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
          </span>
        )}
      </div>
      {sukses && !edit && <Pesan jenis="sukses">{sukses}</Pesan>}
      {edit?.jenis === 'menu' && (
        <FormMenu key={kunciForm} awal={edit.data} bahan={bahanAktif} topping={topping.data} kategori={kategori} onSelesai={selesai} onBatal={() => setEdit(null)} />
      )}
      {edit?.jenis === 'topping' && <FormTopping key={kunciForm} awal={edit.data} bahan={bahanAktif} onSelesai={selesai} onBatal={() => setEdit(null)} />}

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
