// Form hitung buta: crew mengisi hasil hitungan fisik tanpa melihat angka sistem.
// Dua tahap karena hitungan tidak bisa diubah setelah dikirim (A-12): isi → periksa → kirim.
//
//   bahan = [{ id, nama, satuanDasar }]
//   onKirim({ hitungan: { creamer: 1580 }, kas }) → Promise
import { useState } from 'react';
import { Isian, RingkasanGalat, useKirim, GalatForm } from './form.jsx';
import { angkaDari, angkaBulatDari, formatAngka, formatRupiah } from './formAngka.js';

export default function FormHitung({ bahan, labelKas, tambahan, validasiTambahan, onKirim, labelKirim, judul = 'Hitung bahan kunci' }) {
  const [nilai, setNilai] = useState(() => Object.fromEntries(bahan.map((b) => [b.id, ''])));
  const [kas, setKas] = useState('');
  const [periksa, setPeriksa] = useState(null); // null = sedang mengisi; objek = ringkasan siap kirim
  const kirim = useKirim();
  const pf = { ...kirim.perField };

  const lanjut = (e) => {
    e.preventDefault();
    kirim.reset();
    const detail = [...(validasiTambahan?.() ?? [])];
    const hitungan = {};
    for (const b of bahan) {
      const n = angkaDari(nilai[b.id]);
      if (n === null) detail.push({ field: `hitungan.${b.id}`, pesan: `${b.nama}: wajib diisi angka` });
      else if (n < 0) detail.push({ field: `hitungan.${b.id}`, pesan: `${b.nama}: tidak boleh negatif` });
      else hitungan[b.id] = n;
    }
    let kasAngka;
    if (labelKas) {
      kasAngka = angkaBulatDari(kas);
      if (kasAngka === null) detail.push({ field: 'kas', pesan: `${labelKas}: wajib rupiah bulat` });
    }
    if (detail.length) {
      kirim.jalankan(() => Promise.reject(new GalatForm(detail)));
      return;
    }
    setPeriksa({ hitungan, kas: kasAngka });
  };

  const kirimSekarang = async () => {
    const hasil = await kirim.jalankan(() => onKirim(periksa));
    if (hasil === undefined) setPeriksa(null); // gagal: kembali ke form supaya galat bisa diperbaiki
  };

  if (periksa) {
    return (
      <div className="kartu">
        <h2>Periksa sekali lagi</h2>
        <p className="bantuan">Setelah dikirim, hitungan tidak bisa diubah.</p>
        <table>
          <tbody>
            {bahan.map((b) => (
              <tr key={b.id}><td>{b.nama}</td><td className="kanan">{formatAngka(periksa.hitungan[b.id])} {b.satuanDasar}</td></tr>
            ))}
            {labelKas && <tr><td>{labelKas}</td><td className="kanan">{formatRupiah(periksa.kas)}</td></tr>}
          </tbody>
        </table>
        <div className="aksi">
          <button type="button" className="tombol-utama" onClick={kirimSekarang} disabled={kirim.sedang}>{kirim.sedang ? 'Mengirim…' : labelKirim}</button>
          <button type="button" className="tombol-kecil" onClick={() => setPeriksa(null)} disabled={kirim.sedang}>Ubah lagi</button>
        </div>
      </div>
    );
  }

  return (
    <form className="kartu" onSubmit={lanjut} noValidate>
      <RingkasanGalat galat={kirim.galat} />
      {tambahan}
      <fieldset>
        <legend>{judul}</legend>
        <p className="bantuan">Timbang atau ukur isi wadah, lalu tulis angkanya. Angka di sistem sengaja tidak ditampilkan.</p>
        <div className="kisi-hitung">
          {bahan.map((b) => (
            <Isian key={b.id} label={`${b.nama} (${b.satuanDasar})`} galat={pf[`hitungan.${b.id}`]}>
              {(p) => <input {...p} className="angka" inputMode="decimal" autoComplete="off" value={nilai[b.id]} onChange={(e) => setNilai({ ...nilai, [b.id]: e.target.value })} />}
            </Isian>
          ))}
        </div>
      </fieldset>
      {labelKas && (
        <fieldset>
          <legend>Kas laci</legend>
          <Isian label={`${labelKas} (Rp)`} bantuan="Hitung semua uang di laci." galat={pf.kas ?? pf.kasAwal ?? pf.kasAkhir}>
            {(p) => <input {...p} className="angka" inputMode="numeric" autoComplete="off" value={kas} onChange={(e) => setKas(e.target.value)} />}
          </Isian>
        </fieldset>
      )}
      <div className="aksi">
        <button type="submit" className="tombol-utama">Lanjut periksa</button>
      </div>
    </form>
  );
}
