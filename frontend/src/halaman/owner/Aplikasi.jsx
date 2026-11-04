// Owner: aplikasi pesan-antar, dibagi tiga tab:
//   /owner/aplikasi            Sambungan  — aktif/tidak, manual atau tersambung (simulasi), komisi
//   /owner/aplikasi/harga      Harga      — harga GoFood/GrabFood/ShopeeFood untuk semua menu (HargaAplikasi.jsx)
//   /owner/aplikasi/pemetaan   Pemetaan   — menu yang dibuat langsung di aplikasi → resep kasir

import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useSesi } from '../../sesi/SesiContext.jsx';
import { useData } from '../../komponen/useData.js';
import { Memuat, Pesan, PesanGalat } from '../../komponen/umum.jsx';
import { Isian, RingkasanGalat, useKirim, GalatForm } from '../../komponen/form.jsx';
import { angkaDari, angkaBulatDari } from '../../komponen/formAngka.js';
import HargaAplikasi from './HargaAplikasi.jsx';

// Cara menyambungkan sungguhan (per November 2026, dari dokumentasi publik platform). Periksa lagi saat mendaftar.
const CARA = {
  gofood: [
    'Owner masuk ke developer.gobiz.com dengan email owner akun GoBiz (akun GoFood harus sudah aktif).',
    'Buat integrasi, lalu buat App ID dan Secret. Simpan Secret; developer memasangnya di server kasir.',
    'Uji di sandbox (outlet uji), lalu ajukan verifikasi ke GoBiz sebelum dipakai sungguhan.',
  ],
  grabfood: [
    'Developer mendaftar Partner Development Account di developer.grab.com.',
    'Layanan kasir harus disetujui Grab secara tertulis; setiap outlet memverifikasi diri sebagai merchant GrabFood.',
    'Uji di lingkungan staging, lalu aktifkan untuk outlet.',
  ],
  shopeefood: [
    'ShopeeFood hanya tersambung ke aplikasi kasir dari penyedia yang sudah bekerja sama dengan ShopeeFood; tidak ada pendaftaran mandiri untuk developer.',
    'Merchant menghubungi tim Sales ShopeeFood untuk pendaftaran. Menurut Pusat Bantuan Shopee, integrasi API-nya tidak dikenakan biaya tambahan dari ShopeeFood.',
    'Sebelum kasir ini menjadi mitra ShopeeFood: dicatat manual, atau lewat agregator yang sudah bermitra (berbayar).',
  ],
};

// ---------------------------------------------------------------------------
// Tab: Sambungan
// ---------------------------------------------------------------------------

function KartuSaluran({ s, onSimpan }) {
  const { api, mode } = useSesi();
  const [f, setF] = useState({ aktif: s.aktif, mode: s.mode, komisiPersen: String(s.komisiPersen).replace('.', ',') });
  const kirim = useKirim();
  const pf = kirim.perField;

  const simpan = async (perubahan = {}) => {
    const isi = { ...f, ...perubahan };
    setF(isi);
    const hasil = await kirim.jalankan(() => {
      const komisi = angkaDari(isi.komisiPersen);
      if (komisi === null) throw new GalatForm([{ field: 'komisiPersen', pesan: 'Wajib angka 0–100' }]);
      return api(`/saluran/${s.id}`, { method: 'PUT', body: { aktif: isi.aktif, mode: isi.mode, komisiPersen: komisi } });
    }, 'Disimpan');
    if (hasil) onSimpan();
  };

  const tersambung = s.aktif && s.mode === 'otomatis';
  return (
    <article className="kartu">
      <div className="judul-aksi">
        <h3>{s.nama}</h3>
        <span className={`lencana ${tersambung ? 'lencana-ok' : 'lencana-netral'}`}>
          {!s.aktif ? 'Tidak dipakai' : tersambung ? `Tersambung${mode === 'mock' ? ' (simulasi)' : ''}` : 'Dicatat manual'}
        </span>
      </div>
      {tersambung && s.tersambungPada && <small>Sejak {new Date(s.tersambungPada).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</small>}
      <RingkasanGalat galat={kirim.galat} />
      {kirim.sukses && <Pesan jenis="sukses">{kirim.sukses}</Pesan>}

      <label className="centang">
        <input type="checkbox" checked={f.aktif} onChange={(e) => simpan({ aktif: e.target.checked })} disabled={kirim.sedang} />
        Usaha ini berjualan di {s.nama}
      </label>
      {f.aktif && (
        <>
          <Isian label="Perkiraan komisi (%)" bantuan="Dipakai untuk perkiraan pendapatan bersih dan saran harga. Cek angka sebenarnya di kontrak aplikasi." galat={pf.komisiPersen}>
            {(p) => <input {...p} className="angka" inputMode="decimal" value={f.komisiPersen} onChange={(e) => setF({ ...f, komisiPersen: e.target.value })} onBlur={() => angkaDari(f.komisiPersen) !== s.komisiPersen && simpan()} />}
          </Isian>
          <div className="aksi">
            {tersambung ? (
              <button type="button" className="tombol-kecil" disabled={kirim.sedang} onClick={() => simpan({ mode: 'manual' })}>Putuskan, catat manual</button>
            ) : (
              <button type="button" className="tombol-utama" disabled={kirim.sedang} onClick={() => simpan({ mode: 'otomatis' })}>
                Sambungkan{mode === 'mock' ? ' (simulasi)' : ''}
              </button>
            )}
          </div>
          <p className="bantuan">
            {tersambung
              ? 'Pesanan masuk sendiri ke halaman Pesanan online. Crew tidak mencatatnya di kasir, supaya tidak dobel.'
              : 'Crew memilih saluran ini di kasir dan menyalin nomor pesanan dari tablet aplikasi.'}
          </p>
        </>
      )}
      <details>
        <summary>Cara menyambungkan sungguhan</summary>
        <ol>{CARA[s.id].map((c) => <li key={c}>{c}</li>)}</ol>
      </details>
    </article>
  );
}

function TabSambungan({ saluran, muatUlang }) {
  const { mode } = useSesi();
  return (
    <>
      {mode === 'mock' && (
        <Pesan>
          Ini demo: sambungan ke GoFood dan GrabFood di bawah adalah <strong>simulasi</strong>. Alur, aturan, dan data yang masuk sama dengan sambungan
          sungguhan; yang belum ada hanya pendaftaran di platform dan server yang menerima pesanan. Coba kirim pesanan contoh di{' '}
          <Link to="/owner/pesanan-online">Pesanan online</Link>.
        </Pesan>
      )}
      <pre className="alur" aria-label="Alur pesanan otomatis">{`Pelanggan pesan di GoFood
        │
        ▼
GoFood mengirim pesanan ke server kasir   (nomor sama dikirim ulang → tidak dicatat dua kali)
        │
        ▼
Menu aplikasi dicocokkan ke resep kasir   (menu yang dibuat di aplikasi → lihat tab Pemetaan menu)
        │
        ▼
Crew tekan Terima → transaksi + stok bahan berkurang otomatis, tanpa mengetik ulang`}</pre>
      <div className="kisi-kartu">
        {saluran.map((s) => <KartuSaluran key={s.id} s={s} onSimpan={muatUlang} />)}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Tab: Pemetaan menu
// ---------------------------------------------------------------------------

function PenjelasanPemetaan({ terbuka }) {
  return (
    <details className="kartu penjelasan" open={terbuka}>
      <summary><strong>Apa itu pemetaan menu?</strong></summary>
      <p>
        Kasir mengurangi stok berdasarkan <strong>resep</strong>. Jadi setiap menu yang dipesan lewat aplikasi harus jelas: menu ini memakai resep kasir yang mana?
      </p>
      <ul>
        <li><strong>Menu yang dikirim dari kasir ke aplikasi</strong> (misalnya Thai Tea Large) langsung dikenali. Tidak perlu diatur apa-apa.</li>
        <li><strong>Menu yang dibuat langsung di aplikasi</strong>, misalnya <em>Paket Berdua</em> atau <em>Promo Gajian</em>, tidak dikenali kasir: kasir tidak tahu isinya.</li>
      </ul>
      <p>Pemetaan artinya <strong>memberi tahu kasir isi menu itu, cukup sekali</strong>:</p>
      <pre className="alur">{`Pesanan GoFood:   1× Paket Berdua                (menu buatan di aplikasi)
                         │
                         │  pemetaan (diisi owner sekali)
                         ▼
Resep kasir:      1× Thai Tea Regular   +   1× Kopi Susu Regular
                         │                          │
Stok berkurang:   creamer, air thai tea…     biji kopi, susu cair…`}</pre>
      <p>
        Setelah dipetakan, setiap pesanan Paket Berdua berikutnya langsung dikenali dan stoknya berkurang sendiri.
        Sebelum dipetakan, pesanan yang berisi menu itu <strong>tidak bisa diterima</strong> crew. Ini disengaja: lebih baik menunggu sebentar daripada stok berkurang dengan resep yang salah.
      </p>
      <p className="bantuan">Harga paket tetap mengikuti harga di aplikasi (yang dibayar pelanggan). Pemetaan hanya menentukan bahan yang terpakai.</p>
    </details>
  );
}

const isiKosong = () => ({ menuId: '', ukuran: '', qty: '1' });

function FormPemetaan({ saluran, item, menu, onSimpan }) {
  const { api } = useSesi();
  const [isi, setIsi] = useState([isiKosong()]);
  const kirim = useKirim();
  const pf = kirim.perField;
  const ubahBaris = (i, perubahan) => setIsi(isi.map((b, j) => (j === i ? { ...b, ...perubahan } : b)));
  const menuById = new Map(menu.map((m) => [m.id, m]));

  // Kalimat pratinjau dari isian yang sudah lengkap: "1× Paket Berdua = 1× Thai Tea Regular + 1× Kopi Susu Regular"
  const lengkap = isi.filter((b) => b.menuId && b.ukuran && angkaBulatDari(b.qty) >= 1);
  const kalimat = lengkap.map((b) => `${angkaBulatDari(b.qty)}× ${menuById.get(b.menuId)?.nama} ${b.ukuran}`).join(' + ');

  const simpan = async (e) => {
    e.preventDefault();
    const hasil = await kirim.jalankan(() => {
      const detail = [];
      const body = isi.map((b, i) => {
        const qty = angkaBulatDari(b.qty);
        if (!b.menuId) detail.push({ field: `isi[${i}].menuId`, pesan: `Baris ${i + 1}: pilih menu` });
        if (b.menuId && !b.ukuran) detail.push({ field: `isi[${i}].ukuran`, pesan: `Baris ${i + 1}: pilih ukuran` });
        if (qty === null || qty < 1) detail.push({ field: `isi[${i}].qty`, pesan: `Baris ${i + 1}: jumlah minimal 1` });
        return { menuId: b.menuId, ukuran: b.ukuran, qty: qty ?? 0 };
      });
      if (detail.length) throw new GalatForm(detail);
      return api(`/saluran/${saluran.id}/pemetaan`, { method: 'PUT', body: { kode: item.kode, isi: body } });
    });
    if (hasil) onSimpan(`${item.nama} sekarang dikenali kasir.`);
  };

  return (
    <form className="kartu" onSubmit={simpan} noValidate>
      <div className="judul-aksi">
        <h3>{item.nama}</h3>
        <small>{saluran.nama} · kode di aplikasi: {item.kode}</small>
      </div>
      <p>Isi <strong>1 {item.nama}</strong> menurut resep kasir:</p>
      <RingkasanGalat galat={kirim.galat} />
      {isi.map((b, i) => {
        const m = menuById.get(b.menuId);
        return (
          <div key={i} className="baris-isi-paket">
            <Isian label="Jumlah" galat={pf[`isi[${i}].qty`]}>
              {(p) => <input {...p} className="angka" inputMode="numeric" value={b.qty} onChange={(e) => ubahBaris(i, { qty: e.target.value })} />}
            </Isian>
            <Isian label="Menu kasir" galat={pf[`isi[${i}].menuId`]}>
              {(p) => (
                <select {...p} value={b.menuId} onChange={(e) => ubahBaris(i, { menuId: e.target.value, ukuran: menuById.get(e.target.value)?.ukuran[0].nama ?? '' })}>
                  <option value="">Pilih menu…</option>
                  {menu.map((x) => <option key={x.id} value={x.id}>{x.nama}</option>)}
                </select>
              )}
            </Isian>
            <Isian label="Ukuran" galat={pf[`isi[${i}].ukuran`]}>
              {(p) => (
                <select {...p} value={b.ukuran} onChange={(e) => ubahBaris(i, { ukuran: e.target.value })} disabled={!m}>
                  {!m && <option value="">–</option>}
                  {m?.ukuran.map((u) => <option key={u.nama} value={u.nama}>{u.nama}</option>)}
                </select>
              )}
            </Isian>
            {isi.length > 1 && <button type="button" className="tombol-kecil" aria-label={`Hapus baris ${i + 1}`} onClick={() => setIsi(isi.filter((_, j) => j !== i))}>Hapus</button>}
          </div>
        );
      })}
      {pf.isi && <small className="teks-galat">{pf.isi}</small>}
      {isi.length < 6 && <button type="button" className="tombol-kecil" onClick={() => setIsi([...isi, isiKosong()])}>+ Tambah menu lain di paket ini</button>}
      <p className="pratinjau-pemetaan" aria-live="polite">
        {kalimat ? <>1× {item.nama} = <strong>{kalimat}</strong></> : <span className="teks-redup">Pilih menu untuk melihat hasilnya.</span>}
      </p>
      <button type="submit" className="tombol-utama" disabled={kirim.sedang}>{kirim.sedang ? 'Menyimpan…' : 'Simpan pemetaan'}</button>
    </form>
  );
}

function TabPemetaan({ saluran, menu, muatUlang }) {
  const { api } = useSesi();
  const [kabar, setKabar] = useState(null);
  const hapus = useKirim();
  const belum = saluran.flatMap((s) => s.belumDikenali.map((item) => ({ s, item })));
  const tersimpan = saluran.flatMap((s) => s.pemetaan.map((p) => ({ s, p })));
  const selesai = (pesan) => { setKabar(pesan); muatUlang(); };

  return (
    <>
      <PenjelasanPemetaan terbuka={tersimpan.length === 0} />
      {kabar && <Pesan jenis="sukses">{kabar} Pesanan yang menunggu sekarang bisa diterima di <Link to="/owner/pesanan-online">Pesanan online</Link>.</Pesan>}

      <h2 className="subjudul">Perlu dipetakan ({belum.length})</h2>
      {belum.length === 0 ? (
        <p className="bantuan">Tidak ada. Semua menu di pesanan yang menunggu sudah dikenali kasir. Menu baru yang dibuat di aplikasi akan muncul di sini saat pertama kali dipesan.</p>
      ) : (
        belum.map(({ s, item }) => <FormPemetaan key={`${s.id}-${item.kode}`} saluran={s} item={item} menu={menu} onSimpan={selesai} />)
      )}

      <h2 className="subjudul">Sudah dipetakan</h2>
      <RingkasanGalat galat={hapus.galat} />
      {tersimpan.length === 0 ? (
        <p className="bantuan">Belum ada.</p>
      ) : (
        <div className="tabel-gulir">
          <table className="tabel-kecil">
            <thead><tr><th>Aplikasi</th><th>Menu di aplikasi</th><th>Isi menurut resep kasir</th><th /></tr></thead>
            <tbody>
              {tersimpan.map(({ s, p }) => (
                <tr key={`${s.id}-${p.kode}`}>
                  <td>{s.nama}</td>
                  <td>{p.nama}<br /><small className="teks-redup">{p.kode}</small></td>
                  <td>{p.isi.map((k) => `${k.qty}× ${k.nama} ${k.ukuran}`).join(' + ')}</td>
                  <td>
                    <button type="button" className="tombol-kecil" disabled={hapus.sedang}
                      onClick={async () => { if (await hapus.jalankan(() => api(`/saluran/${s.id}/pemetaan/${encodeURIComponent(p.kode)}`, { method: 'DELETE' }))) selesai(`Pemetaan ${p.nama} dihapus.`); }}>
                      Hapus
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="bantuan">Isi paket berubah? Hapus pemetaannya; saat paket itu dipesan lagi, ia muncul di "Perlu dipetakan" untuk diisi ulang.</p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Halaman
// ---------------------------------------------------------------------------

export default function Aplikasi({ tab = 'sambungan' }) {
  const saluran = useData('/saluran');
  const menu = useData('/menu');
  if (saluran.memuat || menu.memuat) return <Memuat />;
  const galat = saluran.galat ?? menu.galat;
  if (galat) return <PesanGalat galat={galat} ulangi={() => { saluran.muatUlang(); menu.muatUlang(); }} />;
  const jumlahBelum = saluran.data.reduce((a, s) => a + s.belumDikenali.length, 0);

  return (
    <section>
      <h1>Aplikasi pesan-antar</h1>
      <nav className="tab-sub" aria-label="Bagian aplikasi online">
        <NavLink to="/owner/aplikasi" end>Sambungan</NavLink>
        <NavLink to="/owner/aplikasi/harga">Harga di aplikasi</NavLink>
        <NavLink to="/owner/aplikasi/pemetaan">Pemetaan menu{jumlahBelum > 0 && <span className="lencana lencana-cek">{jumlahBelum}</span>}</NavLink>
      </nav>
      {tab === 'sambungan' && <TabSambungan saluran={saluran.data} muatUlang={saluran.muatUlang} />}
      {tab === 'harga' && <HargaAplikasi saluran={saluran.data} />}
      {tab === 'pemetaan' && <TabPemetaan saluran={saluran.data} menu={menu.data} muatUlang={saluran.muatUlang} />}
    </section>
  );
}

