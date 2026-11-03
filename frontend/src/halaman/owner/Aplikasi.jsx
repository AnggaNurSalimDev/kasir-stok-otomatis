// Owner: aplikasi pesan-antar. Aktif/tidak, dicatat manual atau tersambung otomatis (simulasi di demo),
// perkiraan komisi, dan pemetaan menu yang dibuat langsung di aplikasi.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSesi } from '../../sesi/SesiContext.jsx';
import { useData } from '../../komponen/useData.js';
import { Memuat, Pesan, PesanGalat } from '../../komponen/umum.jsx';
import { Isian, RingkasanGalat, useKirim, GalatForm } from '../../komponen/form.jsx';
import { angkaDari, angkaBulatDari } from '../../komponen/formAngka.js';

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
          <Isian label="Perkiraan komisi (%)" bantuan="Untuk perkiraan pendapatan bersih di laporan. Cek angka sebenarnya di kontrak aplikasi." galat={pf.komisiPersen}>
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

function FormPemetaan({ saluran, item, menu, onSimpan }) {
  const { api } = useSesi();
  const [f, setF] = useState({ menuId: '', ukuran: '', kali: '1' });
  const kirim = useKirim();
  const m = menu.find((x) => x.id === f.menuId);

  const simpan = async (e) => {
    e.preventDefault();
    const hasil = await kirim.jalankan(() => {
      const kali = angkaBulatDari(f.kali);
      const detail = [];
      if (!f.menuId) detail.push({ field: 'menuId', pesan: 'Pilih menu' });
      if (!f.ukuran) detail.push({ field: 'ukuran', pesan: 'Pilih ukuran' });
      if (kali === null || kali < 1) detail.push({ field: 'kali', pesan: 'Minimal 1' });
      if (detail.length) throw new GalatForm(detail);
      return api(`/saluran/${saluran.id}/pemetaan`, { method: 'PUT', body: { kode: item.kode, menuId: f.menuId, ukuran: f.ukuran, kali } });
    });
    if (hasil) onSimpan();
  };

  return (
    <form className="kartu" onSubmit={simpan} noValidate>
      <p><strong>{item.nama}</strong> <small>({saluran.nama} · kode {item.kode})</small></p>
      <RingkasanGalat galat={kirim.galat} />
      <div className="baris-isian">
        <Isian label="Sama dengan menu kasir" galat={kirim.perField.menuId}>
          {(p) => (
            <select {...p} value={f.menuId} onChange={(e) => setF({ ...f, menuId: e.target.value, ukuran: menu.find((x) => x.id === e.target.value)?.ukuran[0].nama ?? '' })}>
              <option value="">Pilih menu…</option>
              {menu.map((x) => <option key={x.id} value={x.id}>{x.nama}</option>)}
            </select>
          )}
        </Isian>
        <Isian label="Ukuran" galat={kirim.perField.ukuran}>
          {(p) => (
            <select {...p} value={f.ukuran} onChange={(e) => setF({ ...f, ukuran: e.target.value })} disabled={!m}>
              {m?.ukuran.map((u) => <option key={u.nama} value={u.nama}>{u.nama}</option>)}
            </select>
          )}
        </Isian>
        <Isian label="Isi per pesanan" bantuan="Paket berisi 2 gelas → 2" galat={kirim.perField.kali}>
          {(p) => <input {...p} className="angka" inputMode="numeric" value={f.kali} onChange={(e) => setF({ ...f, kali: e.target.value })} />}
        </Isian>
      </div>
      <button type="submit" className="tombol-utama" disabled={kirim.sedang}>Simpan pemetaan</button>
    </form>
  );
}

export default function Aplikasi() {
  const { mode } = useSesi();
  const saluran = useData('/saluran');
  const menu = useData('/menu');
  if (saluran.memuat || menu.memuat) return <Memuat />;
  const galat = saluran.galat ?? menu.galat;
  if (galat) return <PesanGalat galat={galat} ulangi={() => { saluran.muatUlang(); menu.muatUlang(); }} />;

  const belum = saluran.data.flatMap((s) => s.belumDikenali.map((item) => ({ s, item })));
  const pemetaan = saluran.data.flatMap((s) => s.pemetaan.map((p) => ({ s, p })));

  return (
    <section>
      <h1>Aplikasi pesan-antar</h1>
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
Menu aplikasi dicocokkan ke resep kasir   (menu yang dibuat di aplikasi → dipetakan owner sekali)
        │
        ▼
Crew tekan Terima → transaksi + stok bahan berkurang otomatis, tanpa mengetik ulang`}</pre>

      <div className="kisi-kartu">
        {saluran.data.map((s) => <KartuSaluran key={s.id} s={s} onSimpan={saluran.muatUlang} />)}
      </div>

      <h2 className="subjudul">Menu yang belum dikenali ({belum.length})</h2>
      <p className="bantuan">
        Menu yang dikirim dari kasir ke aplikasi langsung dikenali. Menu yang dibuat langsung di aplikasi (misalnya paket) perlu dipetakan sekali ke resep kasir,
        supaya stok berkurang dengan benar. Sebelum dipetakan, pesanannya tidak bisa diterima.
      </p>
      {belum.length === 0 && <p className="bantuan">Semua menu di pesanan yang menunggu sudah dikenali.</p>}
      {belum.map(({ s, item }) => <FormPemetaan key={`${s.id}-${item.kode}`} saluran={s} item={item} menu={menu.data} onSimpan={saluran.muatUlang} />)}

      {pemetaan.length > 0 && (
        <>
          <h2 className="subjudul">Pemetaan tersimpan</h2>
          <div className="tabel-gulir">
            <table className="tabel-kecil">
              <thead><tr><th>Aplikasi</th><th>Kode menu aplikasi</th><th>Resep kasir</th></tr></thead>
              <tbody>
                {pemetaan.map(({ s, p }) => (
                  <tr key={`${s.id}-${p.kode}`}><td>{s.nama}</td><td>{p.kode}</td><td>{p.kali > 1 ? `${p.kali}× ` : ''}{p.namaMenu} {p.ukuran}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
