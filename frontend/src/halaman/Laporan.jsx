// Laporan penjualan.
//   Crew : hari ini saja, dengan filter.
//   Owner: rentang tanggal (≤ 31 hari) + filter yang sama.
//
//   alamat ?dari&sampai ──▶ GET /laporan/harian ──▶ semua transaksi rentang itu
//   alamat ?saluran&bayar&shift&kasir&status&cari ──saringTransaksi──▶ tabel + ringkasan "sesuai filter"
// Kartu angka di atas selalu untuk seluruh rentang; filter hanya memengaruhi tabel transaksi dan ringkasannya.

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSesi } from '../sesi/SesiContext.jsx';
import { useData } from '../komponen/useData.js';
import { Memuat, PesanGalat } from '../komponen/umum.jsx';
import { formatAngka, formatRupiah } from '../komponen/formAngka.js';
import { NAMA_SALURAN, SALURAN } from '../../../logika/saluran.js';
import { bacaFilter, adaFilter, saringTransaksi, ringkasHasil, pilihanDari, rentangCepat, KUNCI_FILTER } from './laporanFilter.js';

// Tanggal hari ini menurut zona Asia/Jakarta, format YYYY-MM-DD (sama seperti mock/backend).
const hariIni = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const jam = (iso) => new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
const tanggalPanjang = (t) => new Date(`${t}T12:00:00+07:00`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const tanggalPendek = (t) => new Date(`${t}T12:00:00+07:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
const LABEL_BAYAR = { tunai: 'Tunai', qris: 'QRIS', aplikasi: 'Dibayar aplikasi' };
const PER_HALAMAN = 100;
const PRESET = [['hari-ini', 'Hari ini'], ['kemarin', 'Kemarin'], ['7-hari', '7 hari'], ['bulan-ini', 'Bulan ini']];

function PilihRentang({ dari, sampai, ubah }) {
  const hari = hariIni();
  const aktif = PRESET.find(([k]) => {
    const r = rentangCepat(k, hari);
    return r.dari === dari && r.sampai === sampai;
  })?.[0];
  return (
    <div className="kartu filter-rentang">
      <div className="pilihan pilihan-kecil" role="group" aria-label="Rentang cepat">
        {PRESET.map(([k, label]) => (
          <button key={k} type="button" className="tombol-pilihan" aria-pressed={aktif === k} onClick={() => ubah(rentangCepat(k, hari))}>{label}</button>
        ))}
      </div>
      <div className="aksi">
        <label>Dari <input type="date" value={dari} max={hari} onChange={(e) => e.target.value && ubah({ dari: e.target.value, sampai: e.target.value > sampai ? e.target.value : sampai })} /></label>
        <label>Sampai <input type="date" value={sampai} min={dari} max={hari} onChange={(e) => e.target.value && ubah({ dari, sampai: e.target.value })} /></label>
        <small className="teks-redup">Maksimal 31 hari</small>
      </div>
    </div>
  );
}

function PilihFilter({ filter, ubah, transaksi }) {
  const pilih = (kunci, label, opsi) => (
    <label className="isian-filter">
      <span>{label}</span>
      <select value={filter[kunci]} onChange={(e) => ubah({ [kunci]: e.target.value })}>
        <option value="">Semua</option>
        {opsi.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
  return (
    <div className="baris-filter" role="search" aria-label="Filter transaksi">
      {pilih('saluran', 'Saluran', SALURAN.map((s) => [s, NAMA_SALURAN[s]]))}
      {pilih('bayar', 'Pembayaran', Object.entries(LABEL_BAYAR))}
      {pilih('shift', 'Shift', pilihanDari(transaksi, 'shift').map((s) => [s, s]))}
      {pilih('kasir', 'Kasir', pilihanDari(transaksi, 'kasir').map((s) => [s, s]))}
      {pilih('status', 'Status', [['sah', 'Tidak batal'], ['batal', 'Batal saja']])}
      <label className="isian-filter isian-cari">
        <span>Cari menu / nomor pesanan</span>
        <input type="search" value={filter.cari} placeholder="mis. thai tea, F-1006" onChange={(e) => ubah({ cari: e.target.value })} />
      </label>
      {adaFilter(filter) && (
        <button type="button" className="tombol-kecil" onClick={() => ubah(Object.fromEntries(KUNCI_FILTER.map((k) => [k, ''])))}>Hapus filter</button>
      )}
    </div>
  );
}

export default function Laporan() {
  const { pengguna } = useSesi();
  const owner = pengguna?.peran === 'owner';
  const [params, setParams] = useSearchParams();
  const [tampil, setTampil] = useState(PER_HALAMAN);

  const hari = hariIni();
  // Crew dikunci ke hari ini, apa pun isi alamatnya.
  const dari = owner ? params.get('dari') ?? hari : hari;
  const sampai = owner ? params.get('sampai') ?? dari : hari;
  const filter = bacaFilter(params);
  const { data, galat, memuat, muatUlang } = useData(`/laporan/harian?dari=${dari}&sampai=${sampai}`);

  // Menulis ke alamat halaman: nilai kosong dihapus supaya alamat tetap pendek.
  const ubah = (perubahan) => {
    const baru = new URLSearchParams(params);
    for (const [k, v] of Object.entries(perubahan)) {
      if (v) baru.set(k, v);
      else baru.delete(k);
    }
    setParams(baru, { replace: true });
    setTampil(PER_HALAMAN);
  };

  const hasil = data ? saringTransaksi(data.transaksi, filter) : [];
  const ringkas = ringkasHasil(hasil);
  const banyakHari = data && data.jumlahHari > 1;

  return (
    <section>
      <h1>{owner ? 'Laporan penjualan' : 'Laporan hari ini'}</h1>
      {owner && <PilihRentang dari={dari} sampai={sampai} ubah={ubah} />}
      {memuat && <Memuat />}
      <PesanGalat galat={galat} ulangi={muatUlang} />
      {data && (
        <>
          <p className="bantuan">
            {banyakHari ? `${tanggalPanjang(data.dari)} – ${tanggalPanjang(data.sampai)} (${data.jumlahHari} hari)` : tanggalPanjang(data.dari)}
          </p>
          <div className="kisi-angka">
            <div className="kartu"><small>Transaksi</small><strong>{data.jumlahTransaksi}</strong></div>
            <div className="kartu"><small>Penjualan</small><strong>{formatRupiah(data.totalPenjualan)}</strong></div>
            <div className="kartu"><small>Tunai</small><strong>{formatRupiah(data.perMetode.tunai)}</strong></div>
            <div className="kartu"><small>QRIS</small><strong>{formatRupiah(data.perMetode.qris)}</strong></div>
            <div className="kartu"><small>Aplikasi</small><strong>{formatRupiah(data.perMetode.aplikasi)}</strong></div>
          </div>

          <h2 className="subjudul">Per saluran</h2>
          <div className="tabel-gulir">
            <table className="tabel-kecil">
              <thead>
                <tr><th>Saluran</th><th className="kanan">Pesanan</th><th className="kanan">Penjualan</th>{owner && <><th className="kanan">Perkiraan komisi</th><th className="kanan">Perkiraan bersih</th></>}<th className="kanan">Batal</th></tr>
              </thead>
              <tbody>
                {Object.entries(data.perSaluran).map(([id, x]) => (
                  <tr key={id}>
                    <td><button type="button" className="tautan tanpa-jarak" onClick={() => ubah({ saluran: filter.saluran === id ? '' : id })} aria-pressed={filter.saluran === id}>{x.nama}</button></td>
                    <td className="kanan">{x.jumlah}</td>
                    <td className="kanan">{formatRupiah(x.total)}</td>
                    {owner && <><td className="kanan">{id === 'toko' ? '–' : formatRupiah(x.perkiraanKomisi)}</td><td className="kanan">{formatRupiah(x.total - x.perkiraanKomisi)}</td></>}
                    <td className="kanan">{x.batal || '–'}</td>
                  </tr>
                ))}
              </tbody>
              {owner && (
                <tfoot>
                  <tr><td><strong>Total</strong></td><td /><td className="kanan"><strong>{formatRupiah(data.totalPenjualan)}</strong></td><td className="kanan">{formatRupiah(data.perkiraanKomisi)}</td><td className="kanan"><strong>{formatRupiah(data.perkiraanBersih)}</strong></td><td /></tr>
                </tfoot>
              )}
            </table>
          </div>
          {owner && <p className="bantuan">Klik nama saluran untuk memfilter transaksinya. Komisi memakai persen di halaman Aplikasi online, jadi hanya perkiraan; angka pasti ada di laporan masing-masing aplikasi.</p>}

          <h2 className="subjudul">Transaksi</h2>
          <PilihFilter filter={filter} ubah={ubah} transaksi={data.transaksi} />
          <p aria-live="polite">
            {adaFilter(filter)
              ? <><strong>Sesuai filter:</strong> {ringkas.jumlah} transaksi · {formatRupiah(ringkas.total)}{ringkas.batal > 0 && ` · ${ringkas.batal} batal`} <small className="teks-redup">(dari {data.transaksi.length})</small></>
              : <>{data.transaksi.length} transaksi{data.transaksi.length !== data.jumlahTransaksi && ` (${data.transaksi.length - data.jumlahTransaksi} batal)`}</>}
          </p>
          {hasil.length === 0 ? (
            <p className="bantuan">{data.transaksi.length === 0 ? 'Belum ada transaksi.' : 'Tidak ada transaksi yang cocok dengan filter.'}</p>
          ) : (
            <div className="tabel-gulir">
              <table>
                <thead><tr><th>{banyakHari ? 'Waktu' : 'Jam'}</th><th>Pesanan</th><th>Saluran</th><th>Shift · kasir</th><th className="kanan">Total</th></tr></thead>
                <tbody>
                  {hasil.slice(0, tampil).map((t) => (
                    <tr key={t.id} className={t.batal ? 'baris-batal' : undefined}>
                      <td>{banyakHari && <>{tanggalPendek(t.tanggal)}<br /></>}{jam(t.pada)}</td>
                      <td>
                        {t.item.map((it, i) => (
                          <div key={i}>{it.qty}× {it.nama} {it.ukuran}{it.toppings.length > 0 && <small> + {it.toppings.map((x) => x.nama).join(', ')}</small>}{it.namaAplikasi && it.namaAplikasi !== it.nama && <small className="teks-redup"> (dari {it.namaAplikasi})</small>}</div>
                        ))}
                      </td>
                      <td>
                        {t.saluran === 'toko' ? LABEL_BAYAR[t.metodeBayar] : <>{t.namaSaluran}<br /><small>{t.nomorPesanan}{t.otomatis ? ' · otomatis' : ''}</small></>}
                        {t.batal && <><br /><span className="lencana lencana-cek">Batal</span> <small>{t.batal.alasan}</small></>}
                      </td>
                      <td>{t.shift ?? '–'}<br /><small>{t.kasir}</small></td>
                      <td className="kanan">{formatRupiah(t.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {hasil.length > tampil && (
            <button type="button" className="tombol-kecil" onClick={() => setTampil(tampil + PER_HALAMAN)}>Tampilkan {Math.min(PER_HALAMAN, hasil.length - tampil)} lagi ({hasil.length - tampil} tersisa)</button>
          )}

          <h2 className="subjudul">Pemakaian bahan menurut resep</h2>
          <p className="bantuan">Untuk seluruh {banyakHari ? 'rentang' : 'hari'} ini, tidak ikut filter. Termasuk pesanan batal, karena bahannya sudah terpakai. Selisih dengan stok fisik ada di detail shift (owner).</p>
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
        </>
      )}
    </section>
  );
}
