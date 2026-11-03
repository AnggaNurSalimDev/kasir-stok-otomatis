import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSesi } from '../../sesi/SesiContext.jsx';
import { useData } from '../../komponen/useData.js';
import { Memuat, Pesan, PesanGalat } from '../../komponen/umum.jsx';
import { Isian, RingkasanGalat, useKirim, GalatForm } from '../../komponen/form.jsx';
import { angkaDari, formatAngka, hintKonversi } from '../../komponen/formAngka.js';

const jam = (iso) => new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

// Satuan beli (konversi terbesar) dipakai sebagai pilihan awal: barang biasanya datang per karung/kaleng.
// Hasil konversi selalu tampil besar di bawahnya, supaya salah satuan langsung terlihat.
const satuanAwal = (b) => (b ? [...b.satuanBantu].sort((x, y) => y.konversi - x.konversi)[0]?.nama ?? b.satuanDasar : '');

function FormMasuk({ bahan, onSelesai }) {
  const { api } = useSesi();
  const [bahanId, setBahanId] = useState('');
  const [jumlah, setJumlah] = useState('');
  const [satuan, setSatuan] = useState('');
  const kirim = useKirim();
  const b = bahan.find((x) => x.id === bahanId);
  const hint = hintKonversi(jumlah, satuan, b);

  const simpan = async (e) => {
    e.preventDefault();
    const hasil = await kirim.jalankan(() => {
      const n = angkaDari(jumlah);
      const detail = [];
      if (!b) detail.push({ field: 'bahanId', pesan: 'Pilih bahan' });
      if (n === null || n <= 0) detail.push({ field: 'jumlah', pesan: 'Jumlah wajib angka lebih dari 0' });
      if (detail.length) throw new GalatForm(detail);
      return api('/barang-masuk', { method: 'POST', body: { bahanId, jumlah: n, satuan } });
    });
    if (hasil) {
      setJumlah('');
      onSelesai(`${hasil.nama}: +${formatAngka(hasil.jumlah)} ${hasil.satuan} (${formatAngka(hasil.jumlahDasar)} ${hasil.satuanDasar}) dicatat.`);
    }
  };

  return (
    <form className="kartu" onSubmit={simpan} noValidate>
      <RingkasanGalat galat={kirim.galat} />
      <div className="baris-isian">
        <Isian label="Bahan" galat={kirim.perField.bahanId}>
          {(p) => (
            <select {...p} value={bahanId} onChange={(e) => { const x = bahan.find((y) => y.id === e.target.value); setBahanId(e.target.value); setSatuan(satuanAwal(x)); }}>
              <option value="">Pilih bahan…</option>
              {bahan.map((x) => <option key={x.id} value={x.id}>{x.nama}</option>)}
            </select>
          )}
        </Isian>
        <Isian label="Jumlah" galat={kirim.perField.jumlah ?? hint.galat}>
          {(p) => <input {...p} className="angka" inputMode="decimal" autoComplete="off" value={jumlah} onChange={(e) => setJumlah(e.target.value)} />}
        </Isian>
        <Isian label="Satuan">
          {(p) => (
            <select {...p} value={satuan} disabled={!b} onChange={(e) => setSatuan(e.target.value)}>
              {b && [...b.satuanBantu.map((s) => s.nama), b.satuanDasar].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          )}
        </Isian>
      </div>
      {hint.teks && <p className="hasil-konversi">{hint.teks}</p>}
      <div className="aksi">
        <button type="submit" className="tombol-utama" disabled={kirim.sedang}>{kirim.sedang ? 'Menyimpan…' : 'Catat barang masuk'}</button>
      </div>
    </form>
  );
}

// Koreksi dicatat sebagai entri baru (entri lama tidak diubah). Crew cukup menulis jumlah yang benar.
function FormKoreksi({ asal, tercatat, onSelesai, onBatal }) {
  const { api } = useSesi();
  const [benar, setBenar] = useState('');
  const [alasan, setAlasan] = useState('');
  const kirim = useKirim();

  const simpan = async (e) => {
    e.preventDefault();
    const hasil = await kirim.jalankan(() => {
      const n = angkaDari(benar);
      const detail = [];
      if (n === null || n < 0) detail.push({ field: 'jumlah', pesan: 'Jumlah yang benar wajib angka ≥ 0' });
      else if (Math.abs(n - tercatat) < 1e-9) detail.push({ field: 'jumlah', pesan: 'Sama dengan yang sudah tercatat' });
      if (!alasan.trim()) detail.push({ field: 'alasan', pesan: 'Tulis alasan koreksi' });
      if (detail.length) throw new GalatForm(detail);
      const selisih = Math.round((n - tercatat) * 10) / 10;
      return api('/barang-masuk', { method: 'POST', body: { bahanId: asal.bahanId, jumlah: selisih, satuan: asal.satuan, koreksiDari: asal.id, alasan } });
    });
    if (hasil) onSelesai(`Koreksi ${asal.nama} dicatat.`);
  };

  return (
    <form className="kartu" onSubmit={simpan} noValidate>
      <h2>Koreksi: {asal.nama}</h2>
      <p className="bantuan">Tercatat {formatAngka(tercatat)} {asal.satuan}. Entri lama tetap tersimpan; koreksi dicatat sebagai entri baru beserta alasannya.</p>
      <RingkasanGalat galat={kirim.galat} />
      <div className="baris-isian">
        <Isian label={`Jumlah yang benar (${asal.satuan})`} galat={kirim.perField.jumlah}>
          {(p) => <input {...p} className="angka" inputMode="decimal" autoComplete="off" value={benar} onChange={(e) => setBenar(e.target.value)} />}
        </Isian>
        <Isian label="Alasan" galat={kirim.perField.alasan}>
          {(p) => <input {...p} value={alasan} placeholder="Salah ketik, yang datang 1 karung" onChange={(e) => setAlasan(e.target.value)} />}
        </Isian>
      </div>
      <div className="aksi">
        <button type="submit" className="tombol-utama" disabled={kirim.sedang}>Simpan koreksi</button>
        <button type="button" className="tombol-kecil" onClick={onBatal}>Batal</button>
      </div>
    </form>
  );
}

export default function BarangMasuk() {
  const shift = useData('/shift/aktif');
  const bahan = useData('/bahan');
  const daftar = useData(shift.data ? '/barang-masuk/shift-ini' : null);
  const [pesan, setPesan] = useState(null);
  const [koreksi, setKoreksi] = useState(null);

  if (shift.memuat || bahan.memuat) return <Memuat />;
  const galat = shift.galat ?? bahan.galat;
  if (galat) return <PesanGalat galat={galat} ulangi={() => { shift.muatUlang(); bahan.muatUlang(); }} />;
  if (!shift.data) return <Pesan>Barang masuk dicatat per shift. <Link to="/crew/shift">Buka shift</Link> dulu.</Pesan>;

  const entri = daftar.data ?? [];
  // Jumlah bersih entri asli + koreksinya, dalam satuan entri asli.
  const tercatat = (asal) =>
    entri.filter((e) => e.id === asal.id || e.koreksiDari === asal.id).reduce((a, e) => a + e.jumlah, 0);
  const selesai = (teks) => { setPesan(teks); setKoreksi(null); daftar.muatUlang(); };

  return (
    <section className="sempit">
      <h1>Barang masuk</h1>
      <p className="bantuan">Catat barang yang datang atau dibuat (misalnya satu teko air thai tea). Tulis dalam satuan yang biasa dipakai; sistem mengubahnya ke satuan dasar.</p>
      {pesan && <Pesan jenis="sukses">{pesan}</Pesan>}
      {koreksi ? (
        <FormKoreksi key={koreksi.id} asal={koreksi} tercatat={tercatat(koreksi)} onSelesai={selesai} onBatal={() => setKoreksi(null)} />
      ) : (
        <FormMasuk bahan={bahan.data.filter((b) => !b.arsip)} onSelesai={(t) => { setPesan(t); daftar.muatUlang(); }} />
      )}

      <h2 className="subjudul">Shift ini</h2>
      <PesanGalat galat={daftar.galat} ulangi={daftar.muatUlang} />
      {daftar.data && entri.length === 0 && <p className="bantuan">Belum ada barang masuk di shift ini.</p>}
      {entri.length > 0 && (
        <div className="tabel-gulir">
          <table>
            <thead><tr><th>Jam</th><th>Bahan</th><th className="kanan">Jumlah</th><th>Oleh</th><th aria-label="Aksi" /></tr></thead>
            <tbody>
              {entri.map((e) => (
                <tr key={e.id}>
                  <td>{jam(e.pada)}</td>
                  <td>
                    {e.nama}
                    {e.koreksiDari && <><br /><small>Koreksi: {e.alasan}</small></>}
                  </td>
                  <td className="kanan">
                    {e.jumlah > 0 && e.koreksiDari ? '+' : ''}{formatAngka(e.jumlah)} {e.satuan}
                    <br /><small>{formatAngka(e.jumlahDasar)} {e.satuanDasar}</small>
                  </td>
                  <td>{e.oleh}</td>
                  <td>{!e.koreksiDari && <button type="button" className="tombol-kecil" onClick={() => { setPesan(null); setKoreksi(e); }}>Koreksi</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
