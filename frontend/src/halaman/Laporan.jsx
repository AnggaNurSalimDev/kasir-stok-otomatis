import { useState } from 'react';
import { useSesi } from '../sesi/SesiContext.jsx';
import { useData } from '../komponen/useData.js';
import { Memuat, PesanGalat } from '../komponen/umum.jsx';
import { formatAngka, formatRupiah } from '../komponen/formAngka.js';

// Tanggal hari ini menurut zona Asia/Jakarta, format YYYY-MM-DD (sama seperti mock/backend).
const hariIni = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const jam = (iso) => new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
const tanggalPanjang = (t) => new Date(`${t}T12:00:00+07:00`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

// Crew: hanya hari ini. Owner: bisa memilih tanggal.
export default function Laporan() {
  const { pengguna } = useSesi();
  const owner = pengguna?.peran === 'owner';
  const [tanggal, setTanggal] = useState(hariIni);
  const { data, galat, memuat, muatUlang } = useData(`/laporan/harian?tanggal=${tanggal}`);

  return (
    <section>
      <div className="judul-aksi">
        <h1>{owner ? 'Laporan harian' : 'Laporan hari ini'}</h1>
        {owner && (
          <label className="aksi">
            Tanggal
            <input type="date" value={tanggal} max={hariIni()} onChange={(e) => e.target.value && setTanggal(e.target.value)} />
          </label>
        )}
      </div>
      {memuat && <Memuat />}
      <PesanGalat galat={galat} ulangi={muatUlang} />
      {data && (
        <>
          <p className="bantuan">{tanggalPanjang(data.tanggal)}</p>
          <div className="kisi-angka">
            <div className="kartu"><small>Transaksi</small><strong>{data.jumlahTransaksi}</strong></div>
            <div className="kartu"><small>Penjualan</small><strong>{formatRupiah(data.totalPenjualan)}</strong></div>
            <div className="kartu"><small>Tunai</small><strong>{formatRupiah(data.perMetode.tunai)}</strong></div>
            <div className="kartu"><small>QRIS</small><strong>{formatRupiah(data.perMetode.qris)}</strong></div>
          </div>

          <h2 className="subjudul">Pemakaian bahan menurut resep</h2>
          <p className="bantuan">Dihitung dari transaksi. Selisih dengan stok fisik ada di detail shift (owner).</p>
          {data.pemakaian.length === 0 ? (
            <p className="bantuan">Belum ada pemakaian.</p>
          ) : (
            <div className="tabel-gulir">
              <table className="tabel-kecil">
                <thead><tr><th>Bahan</th><th className="kanan">Terpakai</th></tr></thead>
                <tbody>
                  {[...data.pemakaian].sort((a, b) => a.nama.localeCompare(b.nama)).map((b) => (
                    <tr key={b.bahanId}><td>{b.nama}</td><td className="kanan">{formatAngka(b.jumlah)} {b.satuanDasar}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h2 className="subjudul">Transaksi</h2>
          {data.transaksi.length === 0 ? (
            <p className="bantuan">Belum ada transaksi.</p>
          ) : (
            <div className="tabel-gulir">
              <table>
                <thead><tr><th>Jam</th><th>Pesanan</th><th>Bayar</th><th>Kasir</th><th className="kanan">Total</th></tr></thead>
                <tbody>
                  {data.transaksi.map((t) => (
                    <tr key={t.id}>
                      <td>{jam(t.pada)}</td>
                      <td>
                        {t.item.map((it, i) => (
                          <div key={i}>{it.qty}× {it.nama} {it.ukuran}{it.toppings.length > 0 && <small> + {it.toppings.map((x) => x.nama).join(', ')}</small>}</div>
                        ))}
                      </td>
                      <td>{t.metodeBayar === 'tunai' ? 'Tunai' : 'QRIS'}</td>
                      <td>{t.kasir}</td>
                      <td className="kanan">{formatRupiah(t.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
