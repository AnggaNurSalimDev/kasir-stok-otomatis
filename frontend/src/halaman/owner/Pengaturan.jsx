import { useState } from 'react';
import { useSesi } from '../../sesi/SesiContext.jsx';
import { useData } from '../../komponen/useData.js';
import { Memuat, Pesan, PesanGalat } from '../../komponen/umum.jsx';
import { Isian, RingkasanGalat, useKirim, GalatForm } from '../../komponen/form.jsx';
import { angkaBulatDari } from '../../komponen/formAngka.js';

function FormPengaturan({ awal, onSelesai }) {
  const { api } = useSesi();
  const [f, setF] = useState({
    shift: awal.shift.map((s) => s.nama),
    hitungKas: awal.hitungKas,
    toleransiKasRupiah: String(awal.toleransiKasRupiah),
    hitungSemuaBahan: awal.hitungSemuaBahan ?? 'tidak',
  });
  const kirim = useKirim();
  const pf = kirim.perField;

  const simpan = async (e) => {
    e.preventDefault();
    const hasil = await kirim.jalankan(() => {
      const toleransi = angkaBulatDari(f.toleransiKasRupiah);
      if (toleransi === null) throw new GalatForm([{ field: 'toleransiKasRupiah', pesan: 'Wajib rupiah bulat' }]);
      // Hanya field yang boleh diubah; zonaWaktu tidak dikirim (body strict).
      return api('/pengaturan', { method: 'PUT', body: { shift: f.shift.map((nama) => ({ nama })), hitungKas: f.hitungKas, toleransiKasRupiah: toleransi, hitungSemuaBahan: f.hitungSemuaBahan } });
    }, 'Pengaturan disimpan. Berlaku mulai shift yang dibuka berikutnya.');
    if (hasil) onSelesai();
  };

  return (
    <form className="kartu" onSubmit={simpan} noValidate>
      <RingkasanGalat galat={kirim.galat} />
      {kirim.sukses && <Pesan jenis="sukses">{kirim.sukses}</Pesan>}

      <fieldset>
        <legend>Shift per hari</legend>
        {f.shift.map((nama, i) => (
          <div key={i} className="baris-satuan">
            <span>{i + 1}.</span>
            <input aria-label={`Nama shift ${i + 1}`} value={nama} aria-invalid={pf[`shift[${i}].nama`] ? true : undefined} onChange={(e) => setF({ ...f, shift: f.shift.map((s, j) => (j === i ? e.target.value : s)) })} />
            {f.shift.length > 1 && (
              <button type="button" className="tombol-kecil" aria-label={`Hapus shift ${i + 1}`} onClick={() => setF({ ...f, shift: f.shift.filter((_, j) => j !== i) })}>×</button>
            )}
            {pf[`shift[${i}].nama`] && <small className="teks-galat">{pf[`shift[${i}].nama`]}</small>}
          </div>
        ))}
        {pf.shift && <small className="teks-galat">{pf.shift}</small>}
        {f.shift.length < 4 && <button type="button" className="tombol-kecil" onClick={() => setF({ ...f, shift: [...f.shift, ''] })}>+ Tambah shift</button>}
      </fieldset>

      <fieldset>
        <legend>Hitung stok saat buka dan tutup shift</legend>
        {[
          ['tidak', 'Bahan kunci saja', 'Paling cepat. Bahan lain dihitung lewat stok opname.'],
          ['outlet', 'Semua bahan saat buka dan tutup outlet', `Shift pertama (${f.shift[0] || '…'}) dibuka dan shift terakhir (${f.shift.at(-1) || '…'}) ditutup dengan menghitung semua bahan. Pergantian shift di tengah hari tetap bahan kunci. Kehilangan di malam hari terlihat untuk semua bahan.`],
          ['setiap_shift', 'Semua bahan setiap pergantian shift', 'Paling teliti: selisih setiap bahan bisa ditunjuk ke satu shift. Cocok untuk outlet dengan sedikit bahan.'],
        ].map(([nilai, judul, bantuan]) => (
          <label key={nilai} className="centang">
            <input type="radio" name="hitungSemuaBahan" value={nilai} checked={f.hitungSemuaBahan === nilai} onChange={() => setF({ ...f, hitungSemuaBahan: nilai })} />
            <span>{judul}<br /><small>{bantuan}</small></span>
          </label>
        ))}
        <p className="bantuan">Bahan kunci dipilih di halaman Bahan. Selisih per shift dihitung untuk bahan yang dihitung saat buka dan saat tutup shift itu.</p>
      </fieldset>

      <fieldset>
        <legend>Kas laci</legend>
        <label className="centang">
          <input type="checkbox" checked={f.hitungKas} onChange={(e) => setF({ ...f, hitungKas: e.target.checked })} />
          Hitung kas saat buka dan tutup shift
        </label>
        {f.hitungKas && (
          <Isian label="Toleransi selisih kas (Rp)" bantuan="0 = setiap selisih ditandai. Naikkan sedikit jika sering ada kembalian receh." galat={pf.toleransiKasRupiah}>
            {(p) => <input {...p} className="angka" inputMode="numeric" value={f.toleransiKasRupiah} onChange={(e) => setF({ ...f, toleransiKasRupiah: e.target.value })} />}
          </Isian>
        )}
      </fieldset>

      <div className="aksi">
        <button type="submit" className="tombol-utama" disabled={kirim.sedang}>{kirim.sedang ? 'Menyimpan…' : 'Simpan'}</button>
      </div>
    </form>
  );
}

export default function Pengaturan() {
  const { data, galat, memuat, muatUlang } = useData('/pengaturan');
  return (
    <section>
      <h1>Pengaturan</h1>
      {memuat && <Memuat />}
      <PesanGalat galat={galat} ulangi={muatUlang} />
      {data && <FormPengaturan awal={data} onSelesai={muatUlang} />}
    </section>
  );
}
