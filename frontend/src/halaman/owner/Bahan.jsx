import { useState } from 'react';
import { useSesi } from '../../sesi/SesiContext.jsx';
import { useData } from '../../komponen/useData.js';
import { Memuat, Pesan, PesanGalat } from '../../komponen/umum.jsx';
import { Isian, RingkasanGalat, useKirim, GalatForm } from '../../komponen/form.jsx';
import { angkaDari, formatAngka } from '../../komponen/formAngka.js';

const SATUAN_UMUM = ['gr', 'ml', 'pcs', 'porsi', 'botol', 'butir', 'keping', 'lembar'];

const formKosong = () => ({
  nama: '', satuanDasar: 'gr', satuanBantu: [], batasMinimum: '0', bahanKunci: false,
  toleransiPersen: '5', toleransiOtomatis: true, toleransiMinimum: '',
});

const keForm = (b) => ({
  nama: b.nama,
  satuanDasar: b.satuanDasar,
  satuanBantu: b.satuanBantu.map((s) => ({ nama: s.nama, konversi: String(s.konversi).replace('.', ',') })),
  batasMinimum: String(b.batasMinimum).replace('.', ','),
  bahanKunci: b.bahanKunci,
  toleransiPersen: String(b.toleransiPersen).replace('.', ','),
  toleransiOtomatis: b.toleransiMinimumOtomatis,
  toleransiMinimum: b.toleransiMinimumOtomatis ? '' : String(b.toleransiMinimum).replace('.', ','),
});

// Form → body API. Angka yang tidak terbaca ditolak di sini, sebelum dikirim.
function keBody(f) {
  const detail = [];
  const angka = (teks, field, label) => {
    const n = angkaDari(teks);
    if (n === null) detail.push({ field, pesan: `${label} wajib angka` });
    return n ?? 0;
  };
  const body = {
    nama: f.nama,
    satuanDasar: f.satuanDasar,
    satuanBantu: f.satuanBantu.map((s, i) => ({ nama: s.nama, konversi: angka(s.konversi, `satuanBantu[${i}].konversi`, `Konversi "${s.nama || `baris ${i + 1}`}"`) })),
    batasMinimum: angka(f.batasMinimum, 'batasMinimum', 'Batas minimum'),
    bahanKunci: f.bahanKunci,
    toleransiPersen: angka(f.toleransiPersen, 'toleransiPersen', 'Toleransi persen'),
  };
  if (!f.toleransiOtomatis) body.toleransiMinimum = angka(f.toleransiMinimum, 'toleransiMinimum', 'Toleransi minimum');
  if (detail.length) throw new GalatForm(detail);
  return body;
}

function FormBahan({ awal, onSelesai, onBatal }) {
  const { api } = useSesi();
  const [f, setF] = useState(() => (awal ? keForm(awal) : formKosong()));
  const kirim = useKirim();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const setSb = (i, perubahan) => setF({ ...f, satuanBantu: f.satuanBantu.map((s, j) => (j === i ? { ...s, ...perubahan } : s)) });
  const pf = kirim.perField;
  const terkunci = Boolean(awal?.dipakaiDi?.length);

  const simpan = async (e) => {
    e.preventDefault();
    const hasil = await kirim.jalankan(() =>
      api(awal ? `/bahan/${awal.id}` : '/bahan', { method: awal ? 'PUT' : 'POST', body: keBody(f) }),
    );
    if (hasil) onSelesai(hasil, awal ? 'Bahan disimpan' : 'Bahan ditambahkan');
  };
  const arsip = async () => {
    const hasil = await kirim.jalankan(() => api(`/bahan/${awal.id}/arsip`, { method: 'PATCH', body: { arsip: !awal.arsip } }));
    if (hasil) onSelesai(hasil, hasil.arsip ? 'Bahan diarsipkan' : 'Bahan diaktifkan lagi');
  };

  return (
    <form className="kartu" onSubmit={simpan} noValidate>
      <h2>{awal ? `Ubah: ${awal.nama}` : 'Bahan baru'}</h2>
      <RingkasanGalat galat={kirim.galat} />

      <div className="baris-isian">
        <Isian label="Nama bahan" galat={pf.nama}>{(p) => <input {...p} value={f.nama} onChange={set('nama')} />}</Isian>
        <Isian
          label="Satuan dasar"
          galat={pf.satuanDasar}
          bantuan={terkunci ? 'Terkunci: bahan sudah dipakai di resep.' : 'Stok disimpan dan dihitung dalam satuan ini.'}
        >
          {(p) => (
            <>
              <input {...p} list="satuan-umum" value={f.satuanDasar} onChange={set('satuanDasar')} disabled={terkunci} />
              <datalist id="satuan-umum">{SATUAN_UMUM.map((s) => <option key={s} value={s} />)}</datalist>
            </>
          )}
        </Isian>
      </div>

      <fieldset>
        <legend>Satuan bantu</legend>
        <p className="bantuan">Satuan takar (sendok, garis gelas) dan satuan beli (kaleng, karung). Wajib punya konversi ke satuan dasar.</p>
        {f.satuanBantu.map((s, i) => {
          const k = angkaDari(s.konversi);
          return (
            <div key={i} className="baris-satuan">
              <span>1</span>
              <input aria-label={`Nama satuan bantu ${i + 1}`} placeholder="sendok" value={s.nama} onChange={(e) => setSb(i, { nama: e.target.value })} aria-invalid={pf[`satuanBantu[${i}].nama`] ? true : undefined} />
              <span>=</span>
              <input aria-label={`Konversi satuan bantu ${i + 1}`} className="angka" inputMode="decimal" placeholder="8" value={s.konversi} onChange={(e) => setSb(i, { konversi: e.target.value })} aria-invalid={pf[`satuanBantu[${i}].konversi`] ? true : undefined} />
              <span>{f.satuanDasar || '…'}</span>
              <button type="button" className="tombol-kecil" aria-label={`Hapus satuan bantu ${i + 1}`} onClick={() => setF({ ...f, satuanBantu: f.satuanBantu.filter((_, j) => j !== i) })}>×</button>
              {(pf[`satuanBantu[${i}].nama`] || pf[`satuanBantu[${i}].konversi`] || (s.konversi && (k === null || k <= 0))) && (
                <small className="teks-galat">{pf[`satuanBantu[${i}].nama`] ?? pf[`satuanBantu[${i}].konversi`] ?? 'Konversi harus angka lebih dari 0'}</small>
              )}
            </div>
          );
        })}
        <button type="button" className="tombol-kecil" onClick={() => setF({ ...f, satuanBantu: [...f.satuanBantu, { nama: '', konversi: '' }] })}>+ Tambah satuan bantu</button>
      </fieldset>

      <div className="baris-isian">
        <Isian label={`Batas minimum (${f.satuanDasar})`} bantuan="Di bawah ini, bahan ditandai hampir habis." galat={pf.batasMinimum}>
          {(p) => <input {...p} className="angka" inputMode="decimal" value={f.batasMinimum} onChange={set('batasMinimum')} />}
        </Isian>
        <label className="centang">
          <input type="checkbox" checked={f.bahanKunci} onChange={set('bahanKunci')} />
          <span>Bahan kunci <small>— wajib dihitung setiap buka dan tutup shift</small></span>
        </label>
      </div>

      <fieldset>
        <legend>Toleransi selisih</legend>
        <p className="bantuan">batas = maks(persen × pemakaian shift, minimum). Di atas batas, shift ditandai "perlu dicek".</p>
        <div className="baris-isian">
          <Isian label="Persen dari pemakaian" galat={pf.toleransiPersen}>
            {(p) => <input {...p} className="angka" inputMode="decimal" value={f.toleransiPersen} onChange={set('toleransiPersen')} />}
          </Isian>
          <div>
            <label className="centang">
              <input type="checkbox" checked={f.toleransiOtomatis} onChange={set('toleransiOtomatis')} />
              <span>Minimum otomatis <small>(gr → 2, ml → 10, lainnya → 0)</small></span>
            </label>
            {!f.toleransiOtomatis && (
              <Isian label={`Minimum (${f.satuanDasar})`} bantuan="Seberapa teliti bahan ini bisa dihitung." galat={pf.toleransiMinimum}>
                {(p) => <input {...p} className="angka" inputMode="decimal" value={f.toleransiMinimum} onChange={set('toleransiMinimum')} />}
              </Isian>
            )}
          </div>
        </div>
        {awal?.saranToleransi ? (
          <Pesan>
            Dari {awal.saranToleransi.jumlahShift} shift terakhir, selisih bahan ini biasanya antara {formatAngka(awal.saranToleransi.p10)}% dan{' '}
            {formatAngka(awal.saranToleransi.p90)}% (median {formatAngka(awal.saranToleransi.median)}%). Ini hanya gambaran; batas yang pantas tetap keputusan Anda.
          </Pesan>
        ) : (
          awal && <p className="bantuan">Saran toleransi muncul setelah ada 10 shift yang menghitung bahan ini.</p>
        )}
      </fieldset>

      {awal?.dipakaiDi?.length > 0 && <p className="bantuan">Dipakai di: {awal.dipakaiDi.join(', ')}</p>}

      <div className="aksi">
        <button type="submit" className="tombol-utama" disabled={kirim.sedang}>{kirim.sedang ? 'Menyimpan…' : 'Simpan'}</button>
        <button type="button" className="tombol-kecil" onClick={onBatal}>Batal</button>
        {awal && (
          <button type="button" className="tombol-kecil kanan" onClick={arsip} disabled={kirim.sedang}>
            {awal.arsip ? 'Aktifkan lagi' : 'Arsipkan'}
          </button>
        )}
      </div>
    </form>
  );
}

export default function Bahan() {
  const { data, galat, memuat, muatUlang } = useData('/bahan');
  const [edit, setEdit] = useState(null); // null | 'baru' | bahan
  const [sukses, setSukses] = useState(null);
  const [tampilArsip, setTampilArsip] = useState(false);

  const selesai = (_, pesan) => {
    setEdit(null);
    setSukses(pesan);
    muatUlang();
  };
  const daftar = (data ?? []).filter((b) => tampilArsip || !b.arsip);

  return (
    <section>
      <div className="judul-aksi">
        <h1>Bahan</h1>
        {!edit && <button type="button" className="tombol-utama" onClick={() => { setSukses(null); setEdit('baru'); }}>+ Bahan baru</button>}
      </div>
      {sukses && !edit && <Pesan jenis="sukses">{sukses}</Pesan>}
      {edit && <FormBahan key={edit === 'baru' ? 'baru' : edit.id} awal={edit === 'baru' ? null : edit} onSelesai={selesai} onBatal={() => setEdit(null)} />}

      {memuat && <Memuat />}
      <PesanGalat galat={galat} ulangi={muatUlang} />
      {data && (
        <>
          <label className="centang">
            <input type="checkbox" checked={tampilArsip} onChange={(e) => setTampilArsip(e.target.checked)} /> Tampilkan yang diarsipkan
          </label>
          <div className="tabel-gulir">
            <table>
              <thead>
                <tr><th>Bahan</th><th>Stok sistem</th><th>Satuan bantu</th><th>Bahan kunci</th><th>Toleransi</th><th aria-label="Aksi" /></tr>
              </thead>
              <tbody>
                {daftar.map((b) => (
                  <tr key={b.id} className={b.arsip ? 'redup' : undefined}>
                    <td>
                      {b.nama} {b.arsip && <small>(arsip)</small>}
                    </td>
                    <td className={b.stok <= 0 || b.hampirHabis ? 'teks-galat' : undefined}>
                      {formatAngka(b.stok)} {b.satuanDasar}
                      {b.stok < 0 ? <small> minus</small> : b.stok === 0 ? <small> habis</small> : b.hampirHabis ? <small> hampir habis</small> : null}
                    </td>
                    <td><small>{b.satuanBantu.map((s) => `${s.nama} = ${formatAngka(s.konversi)} ${b.satuanDasar}`).join(' · ') || '–'}</small></td>
                    <td>{b.bahanKunci ? 'Ya' : '–'}</td>
                    <td>
                      {formatAngka(b.toleransiPersen)}%, min {formatAngka(b.toleransiMinimum)} {b.satuanDasar}
                      {b.toleransiMinimumOtomatis && <small> (otomatis)</small>}
                    </td>
                    <td><button type="button" className="tombol-kecil" onClick={() => { setSukses(null); setEdit(b); }}>Ubah</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
