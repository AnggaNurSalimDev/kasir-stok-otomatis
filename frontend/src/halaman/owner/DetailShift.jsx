import { Link, useParams } from 'react-router-dom';
import { useData } from '../../komponen/useData.js';
import { Memuat, Pesan, PesanGalat } from '../../komponen/umum.jsx';
import { formatAngka, formatRupiah } from '../../komponen/formAngka.js';

const waktu = (iso) => (iso ? new Date(iso).toLocaleString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–');
const bertanda = (n) => (n > 0 ? `+${formatAngka(n)}` : formatAngka(n));

function Status({ status, arah }) {
  if (status === 'wajar') return <span className="lencana lencana-ok">Wajar</span>;
  return <span className="lencana lencana-cek">Perlu dicek{arah === 'lebih' ? ' (lebih)' : arah === 'kurang' ? ' (kurang)' : ''}</span>;
}

export default function DetailShift() {
  const { id } = useParams();
  const { data: s, galat, memuat, muatUlang } = useData(`/shift/${encodeURIComponent(id)}`);

  if (memuat) return <Memuat />;
  if (galat) return <PesanGalat galat={galat} ulangi={muatUlang} />;

  return (
    <section>
      <p><Link to="/owner">← Riwayat shift</Link></p>
      <h1>Shift {s.nama}, {waktu(s.dibukaPada)}</h1>
      <p>
        Dibuka oleh <strong>{s.dibukaOleh}</strong>
        {s.status === 'ditutup' && <> · ditutup oleh <strong>{s.ditutupOleh}</strong> ({waktu(s.ditutupPada)})</>}
        {' · '}{s.jumlahTransaksi} transaksi, {formatRupiah(s.totalPenjualan)}
      </p>
      {s.perSaluran && (
        <p className="bantuan">
          {Object.values(s.perSaluran).filter((x) => x.jumlah > 0 || x.batal > 0).map((x) => `${x.nama} ${x.jumlah}${x.batal ? ` (+${x.batal} batal)` : ''}`).join(' · ')}
          {' '}— pesanan aplikasi tidak masuk laci kas; pesanan batal tetap memakai bahan.
        </p>
      )}

      {s.status === 'terbuka' && <Pesan>Shift masih berjalan. Selisih dihitung setelah shift ditutup.</Pesan>}
      {s.status === 'tidak_ditutup' && (
        <Pesan jenis="galat">
          Shift ini tidak ditutup. Hitungan akhirnya diambil dari hitungan buka shift berikutnya, jadi selisih di bawah juga mencakup kejadian di antara kedua shift.
        </Pesan>
      )}

      {s.hasil && (
        <>
          <h2 className="subjudul">Selisih bahan kunci</h2>
          <p className="bantuan">seharusnya = awal + masuk − pakai (menurut resep) · selisih = akhir − seharusnya</p>
          <div className="tabel-gulir">
            <table>
              <thead>
                <tr><th>Bahan</th><th className="kanan">Awal</th><th className="kanan">Masuk</th><th className="kanan">Pakai</th><th className="kanan">Seharusnya</th><th className="kanan">Akhir</th><th className="kanan">Selisih</th><th className="kanan">Batas</th><th>Status</th></tr>
              </thead>
              <tbody>
                {s.hasil.bahan.map((r) => (
                  <tr key={r.bahanId}>
                    <td>{r.nama} <small>{r.satuanDasar}</small></td>
                    <td className="kanan">{formatAngka(r.awal)}</td>
                    <td className="kanan">{r.masuk ? bertanda(r.masuk) : '–'}</td>
                    <td className="kanan">{formatAngka(r.pakai)}</td>
                    <td className="kanan">{formatAngka(r.seharusnya)}</td>
                    <td className="kanan">{formatAngka(r.akhir)}</td>
                    <td className={`kanan ${r.status === 'wajar' ? '' : 'teks-galat'}`}>
                      <strong>{bertanda(r.selisih)}</strong>
                      {r.pakai > 0 && r.selisih !== 0 && <small> ({bertanda(Math.round((r.selisih / r.pakai) * 1000) / 10)}%)</small>}
                    </td>
                    <td className="kanan">±{formatAngka(r.batas)}</td>
                    <td><Status status={r.status} arah={r.arah} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="bantuan">
            Kurang = stok fisik lebih sedikit dari seharusnya (boros, tumpah, hilang). Lebih = takaran kurang dari resep, atau ada barang masuk yang tidak dicatat.
          </p>
        </>
      )}

      {s.hasil?.kas && (
        <>
          <h2 className="subjudul">Kas laci</h2>
          <table className="tabel-kecil">
            <tbody>
              <tr><td>Kas awal</td><td className="kanan">{formatRupiah(s.kasAwal)}</td></tr>
              <tr><td>Seharusnya</td><td className="kanan">{formatRupiah(s.hasil.kas.seharusnya)}</td></tr>
              <tr><td>Dihitung</td><td className="kanan">{formatRupiah(s.kasAkhir)}</td></tr>
              <tr>
                <td>Selisih</td>
                <td className={`kanan ${s.hasil.kas.status === 'wajar' ? '' : 'teks-galat'}`}>
                  <strong>{s.hasil.kas.selisih > 0 ? '+' : ''}{formatRupiah(s.hasil.kas.selisih)}</strong> <Status status={s.hasil.kas.status} arah={s.hasil.kas.arah} />
                </td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      {s.serahTerima && (
        <>
          <h2 className="subjudul">Serah terima dari shift sebelumnya</h2>
          <p className="bantuan">Hitungan awal shift ini dibandingkan dengan hitungan akhir shift sebelumnya. Bukan nol = ada yang berubah di antara keduanya, atau salah hitung.</p>
          {s.serahTerima.bahan.every((b) => b.selisih === null) ? (
            <Pesan>Shift sebelumnya tidak ditutup, jadi serah terima tidak bisa dibandingkan.</Pesan>
          ) : (
            <table className="tabel-kecil">
              <thead><tr><th>Bahan</th><th className="kanan">Akhir sebelumnya</th><th className="kanan">Awal shift ini</th><th className="kanan">Selisih</th></tr></thead>
              <tbody>
                {s.serahTerima.bahan.map((b) => (
                  <tr key={b.bahanId}>
                    <td>{b.nama}</td>
                    <td className="kanan">{b.akhirSebelumnya === null ? '–' : formatAngka(b.akhirSebelumnya)}</td>
                    <td className="kanan">{formatAngka(b.awal)}</td>
                    <td className={`kanan ${b.selisih ? 'teks-galat' : ''}`}>{b.selisih === null ? '–' : b.selisih === 0 ? '0' : bertanda(b.selisih)}</td>
                  </tr>
                ))}
                {s.serahTerima.kasSelisih !== null && (
                  <tr><td>Kas laci</td><td /><td /><td className={`kanan ${s.serahTerima.kasSelisih ? 'teks-galat' : ''}`}>{s.serahTerima.kasSelisih ? formatRupiah(s.serahTerima.kasSelisih) : 'Rp 0'}</td></tr>
                )}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}
