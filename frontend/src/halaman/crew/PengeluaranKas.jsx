import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSesi } from '../../sesi/SesiContext.jsx';
import { useData } from '../../komponen/useData.js';
import { Memuat, Pesan, PesanGalat } from '../../komponen/umum.jsx';
import { Isian, RingkasanGalat, useKirim, GalatForm } from '../../komponen/form.jsx';
import { angkaBulatDari, formatRupiah } from '../../komponen/formAngka.js';

const KETERANGAN_UMUM = ['Beli es batu', 'Beli gas', 'Beli plastik', 'Parkir kurir', 'Setor ke owner'];
const jam = (iso) => new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

export default function PengeluaranKas() {
  const { api } = useSesi();
  const shift = useData('/shift/aktif');
  const daftar = useData(shift.data ? '/pengeluaran-kas/shift-ini' : null);
  const [jumlah, setJumlah] = useState('');
  const [keterangan, setKeterangan] = useState('');
  const [pesan, setPesan] = useState(null);
  const kirim = useKirim();

  if (shift.memuat || daftar.memuat) return <Memuat />;
  if (shift.galat) return <PesanGalat galat={shift.galat} ulangi={shift.muatUlang} />;
  if (!shift.data) return <Pesan>Pengeluaran kas dicatat per shift. <Link to="/crew/shift">Buka shift</Link> dulu.</Pesan>;
  if (!shift.data.hitungKas) return <Pesan>Hitung kas tidak aktif di shift ini, jadi pengeluaran kas tidak perlu dicatat.</Pesan>;

  const entri = daftar.data?.data ?? [];
  const total = entri.reduce((a, p) => a + p.jumlah, 0);

  const simpan = async (e) => {
    e.preventDefault();
    const hasil = await kirim.jalankan(() => {
      const n = angkaBulatDari(jumlah);
      const detail = [];
      if (n === null || n <= 0) detail.push({ field: 'jumlah', pesan: 'Jumlah wajib rupiah bulat lebih dari 0' });
      if (!keterangan.trim()) detail.push({ field: 'keterangan', pesan: 'Tulis untuk apa uangnya' });
      if (detail.length) throw new GalatForm(detail);
      return api('/pengeluaran-kas', { method: 'POST', body: { jumlah: n, keterangan: keterangan.trim() } });
    });
    if (hasil) {
      setPesan(`${formatRupiah(hasil.jumlah)} untuk "${hasil.keterangan}" dicatat.`);
      setJumlah('');
      setKeterangan('');
      daftar.muatUlang();
    }
  };

  return (
    <section className="sempit">
      <h1>Pengeluaran kas</h1>
      <p className="bantuan">Uang yang diambil dari laci selama shift. Tanpa catatan ini, kas akan terlihat kurang saat tutup shift. Catatan tidak bisa dihapus.</p>
      {pesan && <Pesan jenis="sukses">{pesan}</Pesan>}
      <form className="kartu" onSubmit={simpan} noValidate>
        <RingkasanGalat galat={kirim.galat} />
        <div className="baris-isian">
          <Isian label="Jumlah (Rp)" galat={kirim.perField.jumlah}>
            {(p) => <input {...p} className="angka" inputMode="numeric" autoComplete="off" value={jumlah} onChange={(e) => setJumlah(e.target.value)} />}
          </Isian>
          <Isian label="Untuk apa" galat={kirim.perField.keterangan}>
            {(p) => (
              <>
                <input {...p} list="keterangan-kas" value={keterangan} onChange={(e) => setKeterangan(e.target.value)} />
                <datalist id="keterangan-kas">{KETERANGAN_UMUM.map((k) => <option key={k} value={k} />)}</datalist>
              </>
            )}
          </Isian>
        </div>
        <div className="aksi">
          <button type="submit" className="tombol-utama" disabled={kirim.sedang}>{kirim.sedang ? 'Menyimpan…' : 'Catat pengeluaran'}</button>
        </div>
      </form>

      <h2 className="subjudul">Shift ini · {formatRupiah(total)}</h2>
      <PesanGalat galat={daftar.galat} ulangi={daftar.muatUlang} />
      {entri.length === 0 ? (
        <p className="bantuan">Belum ada pengeluaran di shift ini.</p>
      ) : (
        <table>
          <thead><tr><th>Jam</th><th>Untuk</th><th className="kanan">Jumlah</th><th>Oleh</th></tr></thead>
          <tbody>
            {entri.map((p) => (
              <tr key={p.id}><td>{jam(p.pada)}</td><td>{p.keterangan}</td><td className="kanan">{formatRupiah(p.jumlah)}</td><td>{p.oleh}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
