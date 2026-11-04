// Pesanan dari aplikasi yang masuk otomatis (GoFood, GrabFood, …).
//
//   pelanggan pesan di aplikasi ─▶ aplikasi kirim ke server kasir (webhook) ─▶ antrean di halaman ini
//                                                                                │ crew tekan Terima
//                                                                                ▼
//                                                          transaksi + stok berkurang lewat resep
//
// Di demo, "aplikasi" diganti panel simulasi yang memanggil endpoint webhook yang sama.

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSesi } from '../sesi/SesiContext.jsx';
import { useData } from '../komponen/useData.js';
import { Memuat, Pesan, PesanGalat } from '../komponen/umum.jsx';
import { RingkasanGalat, useKirim } from '../komponen/form.jsx';
import { formatRupiah } from '../komponen/formAngka.js';
import { buatPesananContoh } from '../api/mock/pesananContoh.js';

const jam = (iso) => new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
const tglJakarta = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(d);
// Hari ini: jam saja. Hari lain: tanggal + jam.
const waktu = (iso) => (tglJakarta(new Date(iso)) === tglJakarta(new Date()) ? jam(iso) : `${new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} ${jam(iso)}`);
// Pembatalan dari aplikasi biasanya terjadi tak lama setelah pesanan dibuat; simulasi dibatasi ke pesanan 2 jam terakhir.
const BATAS_SIMULASI_BATAL_MS = 2 * 60 * 60 * 1000;
const LABEL_STATUS = { menunggu: 'Menunggu', diterima: 'Diterima', ditolak: 'Ditolak', dibatalkan: 'Dibatalkan' };
const ALASAN_TOLAK = ['Bahan habis', 'Toko sibuk', 'Toko mau tutup'];
const JEDA_OTOMATIS_MS = 20000;

// ---------------------------------------------------------------------------
// Simulasi "aplikasi mengirim pesanan" (hanya mode demo)
// ---------------------------------------------------------------------------

function PanelSimulasi({ saluran, onTerkirim }) {
  const { api } = useSesi();
  const menu = useData('/menu');
  const topping = useData('/topping');
  const paket = useData('/paket');
  const [pilih, setPilih] = useState(saluran[0]?.id ?? null);
  const [terakhir, setTerakhir] = useState(null); // { saluran, body, hasil }
  const [otomatis, setOtomatis] = useState(false);
  const kirim = useKirim();

  const tujuan = saluran.some((s) => s.id === pilih) ? pilih : saluran[0]?.id;

  const contoh = (opsi = {}) => buatPesananContoh({ menu: menu.data, topping: topping.data, paket: paket.data ?? [], saluran: tujuan, nomor: Date.now() % 1000000, ...opsi });
  const kirimPesanan = async ({ body, ke = tujuan, diam = false } = {}) => {
    if (!menu.data || !topping.data || !ke) return;
    const isi = body ?? buatPesananContoh({ menu: menu.data, topping: topping.data, paket: paket.data ?? [], saluran: ke, nomor: Date.now() % 1000000 });
    const jalankan = () => api(`/integrasi/${ke}/pesanan`, { method: 'POST', body: isi });
    const hasil = diam ? await jalankan().catch(() => null) : await kirim.jalankan(jalankan);
    if (hasil) {
      setTerakhir({ saluran: ke, body: isi, hasil });
      onTerkirim();
    }
  };
  const kirimRef = useRef(kirimPesanan);
  kirimRef.current = kirimPesanan;

  // "Ramai pesanan": pesanan contoh masuk sendiri selama halaman terbuka.
  useEffect(() => {
    if (!otomatis) return undefined;
    const t = setInterval(() => kirimRef.current({ diam: true }), JEDA_OTOMATIS_MS);
    return () => clearInterval(t);
  }, [otomatis]);

  if (saluran.length === 0) {
    return <Pesan>Belum ada aplikasi yang tersambung. Owner bisa menyambungkannya (simulasi) di halaman Aplikasi online.</Pesan>;
  }
  const siap = Boolean(menu.data && topping.data && paket.data);
  const adaPaket = siap && paket.data.some((p) => p.aktif && Number.isInteger(p.hargaSaluran[tujuan]));

  return (
    <details className="kartu simulasi" open>
      <summary><strong>Simulasi aplikasi</strong> <span className="lencana lencana-cek">demo</span></summary>
      <p className="bantuan">
        Tombol di sini berperan sebagai GoFood/GrabFood: mengirim pesanan ke kasir lewat jalur yang sama dengan sambungan sungguhan.
        Di usaha sungguhan, pesanan masuk sendiri tanpa tombol ini.
      </p>
      <RingkasanGalat galat={kirim.galat} />
      <div className="pilihan pilihan-kecil" role="group" aria-label="Aplikasi pengirim">
        {saluran.map((s) => (
          <button key={s.id} type="button" className="tombol-pilihan" aria-pressed={tujuan === s.id} onClick={() => setPilih(s.id)}>{s.nama}</button>
        ))}
      </div>
      <div className="aksi">
        <button type="button" className="tombol-utama" disabled={!siap || kirim.sedang} onClick={() => kirimPesanan()}>Kirim pesanan contoh</button>
        <button type="button" className="tombol-kecil" disabled={!adaPaket || kirim.sedang} onClick={() => kirimPesanan({ body: contoh({ denganPaket: true }) })}
          title={adaPaket ? undefined : 'Belum ada paket kasir yang dijual di aplikasi ini'}>
          Pesanan berisi paket kasir
        </button>
        <button type="button" className="tombol-kecil" disabled={!siap || kirim.sedang} onClick={() => kirimPesanan({ body: contoh({ denganPaket: false, tidakDikenal: true }) })}>
          Pesanan dengan menu yang dibuat di aplikasi
        </button>
        {terakhir && (
          <button type="button" className="tombol-kecil" disabled={kirim.sedang} onClick={() => kirimPesanan({ body: terakhir.body, ke: terakhir.saluran })}>
            Kirim ulang pesanan terakhir
          </button>
        )}
        <label className="centang">
          <input type="checkbox" checked={otomatis} onChange={(e) => setOtomatis(e.target.checked)} />
          Pesanan masuk sendiri tiap {JEDA_OTOMATIS_MS / 1000} detik
        </label>
      </div>
      {terakhir && (
        <>
          <p aria-live="polite">
            {terakhir.hasil.duplikat
              ? <>Nomor {terakhir.body.nomorPesanan} <strong>sudah ada</strong>, jadi tidak dicatat dua kali. Aplikasi memang kadang mengirim ulang saat jaringan putus.</>
              : <>Pesanan {terakhir.body.nomorPesanan} masuk.</>}
          </p>
          <details>
            <summary>Lihat data yang dikirim aplikasi</summary>
            <pre className="kode">{`POST /integrasi/${terakhir.saluran}/pesanan\n${JSON.stringify(terakhir.body, null, 2)}`}</pre>
          </details>
        </>
      )}
    </details>
  );
}

// ---------------------------------------------------------------------------
// Satu pesanan menunggu
// ---------------------------------------------------------------------------

function KartuPesanan({ p, adaShift, peran, onSelesai }) {
  const { api } = useSesi();
  const kirim = useKirim();
  const [tolak, setTolak] = useState(false);

  const terima = async () => {
    const hasil = await kirim.jalankan(() => api(`/pesanan-online/${p.id}/terima`, { method: 'POST' }));
    if (hasil) onSelesai({ jenis: 'terima', p, struk: hasil.struk });
  };
  const kirimTolak = async (alasan) => {
    const hasil = await kirim.jalankan(() => api(`/pesanan-online/${p.id}/tolak`, { method: 'POST', body: { alasan } }));
    if (hasil) onSelesai({ jenis: 'tolak', p });
  };

  return (
    <article className="kartu kartu-pesanan">
      <div className="judul-aksi">
        <h3>{p.namaSaluran} · {p.nomorPesanan}</h3>
        <small>{jam(p.masukPada)} · {p.pelanggan}</small>
      </div>
      <RingkasanGalat galat={kirim.galat} />
      <ul className="daftar-pesanan">
        {p.item.map((it, i) => (
          <li key={i}>
            <span>
              {it.qty}× {it.nama}
              {it.topping.length > 0 && <small> + {it.topping.map((t) => t.nama).join(', ')}</small>}
              <br />
              {it.masalah
                ? <small className="teks-galat">⚠ {it.masalah}{peran === 'owner' ? <> · <Link to="/owner/aplikasi/pemetaan">kenalkan ke kasir (pemetaan)</Link></> : ' · minta owner memetakannya di Aplikasi online → Pemetaan menu'}</small>
                : <small className="teks-redup">→ resep kasir: {it.isiKasir.map((k) => `${k.qty > 1 || it.isiKasir.length > 1 ? `${k.qty}× ` : ''}${k.nama} ${k.ukuran}`).join(' + ')}{it.sumber === 'paket' ? ' (paket kasir)' : it.sumber === 'pemetaan' ? ' (pemetaan)' : ''}</small>}
            </span>
            <span className="kanan">{formatRupiah(it.harga * it.qty)}</span>
          </li>
        ))}
      </ul>
      {p.catatan && <p><small>Catatan: {p.catatan}</small></p>}
      {p.diLuarJadwal && <p><small className="teks-galat">⚠ Paket dipesan di luar jadwal promo. Tetap bisa diterima karena sudah dibayar di aplikasi{peran === 'owner' ? '; cek apakah menu di aplikasi sudah ikut diperbarui.' : '.'}</small></p>}
      <div className="baris-total"><span>Total di aplikasi</span><strong>{formatRupiah(p.total)}</strong></div>
      {p.hargaBerbeda && peran === 'owner' && <p className="bantuan">Harga di aplikasi berbeda dengan harga {p.namaSaluran} di kasir. Yang dicatat: harga dari aplikasi (yang dibayar pelanggan).</p>}
      {tolak ? (
        <div className="aksi">
          <span>Alasan:</span>
          {ALASAN_TOLAK.map((a) => <button key={a} type="button" className="tombol-kecil" disabled={kirim.sedang} onClick={() => kirimTolak(a)}>{a}</button>)}
          <button type="button" className="tautan" onClick={() => setTolak(false)}>Batal</button>
        </div>
      ) : (
        <div className="aksi">
          <button type="button" className="tombol-utama" disabled={!adaShift || !p.siapDiterima || kirim.sedang} onClick={terima}>{kirim.sedang ? 'Memproses…' : 'Terima'}</button>
          <button type="button" className="tombol-kecil" disabled={kirim.sedang} onClick={() => setTolak(true)}>Tolak</button>
        </div>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Halaman
// ---------------------------------------------------------------------------

export default function PesananOnline() {
  const { api, mode, pengguna } = useSesi();
  const pesanan = useData('/pesanan-online');
  const shift = useData('/shift/aktif');
  const saluran = useData('/saluran');
  const [kabar, setKabar] = useState(null);
  const batal = useKirim();
  const { muatUlang } = pesanan;

  // Di backend asli: notifikasi realtime. Di sini cukup memuat ulang berkala.
  useEffect(() => {
    const t = setInterval(muatUlang, 10000);
    return () => clearInterval(t);
  }, [muatUlang]);

  if (pesanan.memuat || shift.memuat || saluran.memuat) return <Memuat />;
  const galat = pesanan.galat ?? shift.galat ?? saluran.galat;
  if (galat) return <PesanGalat galat={galat} ulangi={() => { pesanan.muatUlang(); shift.muatUlang(); saluran.muatUlang(); }} />;

  const tersambung = saluran.data.filter((s) => s.aktif && s.mode === 'otomatis');
  const adaShift = Boolean(shift.data);
  const selesai = (k) => { setKabar(k); pesanan.muatUlang(); };

  const batalDariAplikasi = async (p) => {
    const hasil = await batal.jalankan(() => api(`/integrasi/${p.saluran}/batal`, { method: 'POST', body: { nomorPesanan: p.nomorPesanan, alasan: 'Dibatalkan pelanggan (simulasi)' } }));
    if (hasil) selesai({ jenis: 'batal', p });
  };

  return (
    <section>
      <h1>Pesanan online</h1>
      <p className="bantuan">
        {tersambung.length
          ? `Tersambung: ${tersambung.map((s) => s.nama).join(', ')}. Pesanan dari aplikasi ini masuk sendiri; tidak perlu diketik ulang.`
          : 'Belum ada aplikasi yang tersambung.'}
        {mode === 'mock' && ' Sambungan di demo ini adalah simulasi.'}
      </p>

      {mode === 'mock' && <PanelSimulasi saluran={tersambung} onTerkirim={() => { setKabar(null); pesanan.muatUlang(); shift.muatUlang(); }} />}

      {!adaShift && (
        <Pesan>
          Belum ada shift yang dibuka. Pesanan tetap menunggu di sini;{' '}
          {pengguna.peran === 'crew' ? <Link to="/crew/shift">buka shift</Link> : 'crew perlu membuka shift'} untuk menerimanya.
        </Pesan>
      )}
      {kabar?.jenis === 'terima' && (
        <Pesan jenis="sukses">
          {kabar.p.namaSaluran} {kabar.p.nomorPesanan} diterima dan tercatat sebagai transaksi. Stok bahan berkurang sesuai resep.
          {kabar.struk.peringatanMinus.length > 0 && <> Stok di sistem untuk {kabar.struk.peringatanMinus.map((b) => b.nama.toLowerCase()).join(', ')} sudah habis atau minus.</>}
        </Pesan>
      )}
      {kabar?.jenis === 'tolak' && <Pesan>{kabar.p.nomorPesanan} ditolak. Tidak ada stok yang berkurang.</Pesan>}
      {kabar?.jenis === 'batal' && <Pesan>{kabar.p.nomorPesanan} dibatalkan dari aplikasi. Penjualan tidak dihitung; bahan tetap tercatat terpakai karena pesanan sudah dibuat.</Pesan>}

      <h2 className="subjudul">Menunggu ({pesanan.data.menunggu.length})</h2>
      {pesanan.data.menunggu.length === 0 ? (
        <p className="bantuan">Tidak ada pesanan yang menunggu.</p>
      ) : (
        <div className="kisi-kartu">
          {pesanan.data.menunggu.map((p) => <KartuPesanan key={p.id} p={p} adaShift={adaShift} peran={pengguna.peran} onSelesai={selesai} />)}
        </div>
      )}

      <h2 className="subjudul">Terakhir diproses</h2>
      <RingkasanGalat galat={batal.galat} />
      {pesanan.data.riwayat.length === 0 ? (
        <p className="bantuan">Belum ada.</p>
      ) : (
        <div className="tabel-gulir">
          <table>
            <thead><tr><th>Masuk</th><th>Pesanan</th><th>Status</th><th className="kanan">Total</th>{mode === 'mock' && <th />}</tr></thead>
            <tbody>
              {pesanan.data.riwayat.map((p) => (
                <tr key={p.id}>
                  <td>{waktu(p.masukPada)}</td>
                  <td>{p.namaSaluran} {p.nomorPesanan}<br /><small>{p.item.map((i) => `${i.qty}× ${i.nama}`).join(', ')}</small></td>
                  <td>
                    <span className={`lencana ${p.status === 'diterima' ? 'lencana-ok' : 'lencana-cek'}`}>{LABEL_STATUS[p.status]}</span>
                    {p.alasan && <><br /><small>{p.alasan}{p.status === 'dibatalkan' && p.transaksiId ? ' · bahan tetap terpakai' : ''}</small></>}
                  </td>
                  <td className="kanan">{formatRupiah(p.total)}</td>
                  {mode === 'mock' && (
                    <td>
                      {p.status === 'diterima' && Date.now() - new Date(p.diprosesPada) < BATAS_SIMULASI_BATAL_MS && (
                        <button type="button" className="tombol-kecil" disabled={batal.sedang} onClick={() => batalDariAplikasi(p)}>Pelanggan batal (simulasi)</button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
