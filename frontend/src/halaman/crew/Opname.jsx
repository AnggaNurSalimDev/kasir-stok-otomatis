import { useState } from 'react';
import { useSesi } from '../../sesi/SesiContext.jsx';
import { useData } from '../../komponen/useData.js';
import { Memuat, Pesan, PesanGalat } from '../../komponen/umum.jsx';
import FormHitung from '../../komponen/FormHitung.jsx';

// Hitung lengkap semua bahan (bukan hanya bahan kunci). Hitung buta: angka sistem tidak ditampilkan.
export default function Opname() {
  const { api } = useSesi();
  const bahan = useData('/bahan');
  const [selesai, setSelesai] = useState(null);
  const [putaran, setPutaran] = useState(0);

  if (bahan.memuat) return <Memuat />;
  if (bahan.galat) return <PesanGalat galat={bahan.galat} ulangi={bahan.muatUlang} />;
  const aktif = bahan.data.filter((b) => !b.arsip);

  return (
    <section className="sempit">
      <h1>Stok opname</h1>
      <p className="bantuan">
        Hitung semua {aktif.length} bahan, termasuk yang tidak dihitung saat ganti shift. Disarankan seminggu sekali.
        Setelah dikirim, stok di sistem disamakan dengan hitunganmu, dan selisihnya tercatat untuk owner.
      </p>
      {selesai ? (
        <>
          <Pesan jenis="sukses">Opname {selesai.jumlahBahan} bahan tersimpan. Terima kasih!</Pesan>
          <button type="button" className="tombol-kecil" onClick={() => { setSelesai(null); setPutaran((n) => n + 1); }}>Opname lagi</button>
        </>
      ) : (
        <FormHitung
          key={putaran}
          bahan={aktif}
          judul="Hitung semua bahan"
          labelKirim="Kirim opname"
          onKirim={async ({ hitungan }) => {
            const hasil = await api('/opname', { method: 'POST', body: { hitungan } });
            setSelesai(hasil);
            return hasil;
          }}
        />
      )}
    </section>
  );
}
