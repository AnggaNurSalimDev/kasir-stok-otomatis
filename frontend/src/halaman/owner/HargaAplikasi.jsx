// Owner: harga GoFood/GrabFood/ShopeeFood untuk semua menu dan topping dalam satu tabel.
//
//   menu + topping ──▶ baris { harga toko, nilai: { gofood: '15000', grabfood: '', … } }
//                        │  isi manual, atau bantuan: "impas komisi" / "naik X%" / "kosongkan"
//                        ▼
//   PUT /harga-saluran (semua sekaligus, atomik) — kosong = sama dengan harga toko

import { useMemo, useState } from 'react';
import { useSesi } from '../../sesi/SesiContext.jsx';
import { useData } from '../../komponen/useData.js';
import { Memuat, Pesan, PesanGalat } from '../../komponen/umum.jsx';
import { RingkasanGalat, useKirim, GalatForm } from '../../komponen/form.jsx';
import { angkaBulatDari, angkaDari, formatRupiah } from '../../komponen/formAngka.js';
import { SALURAN_ONLINE, hargaImpas, hargaNaik } from '../../../../logika/saluran.js';

const KELIPATAN = [100, 500, 1000];
const teksHarga = (n) => (Number.isInteger(n) ? String(n) : '');

// Paket: kolom harga toko berisi harga isinya jika dibeli terpisah (pembanding), kolom kosong = tidak dijual di sana.
function barisDari(menu, topping, paket = []) {
  const nilaiDari = (b) => Object.fromEntries(SALURAN_ONLINE.map((s) => [s, teksHarga(b.hargaSaluran?.[s])]));
  return [
    ...menu.flatMap((m) => m.ukuran.map((u) => ({ kunci: `m|${m.id}|${u.nama}`, jenis: 'menu', id: m.id, nama: m.nama, ukuran: u.nama, kategori: m.kategori, harga: u.harga, nilai: nilaiDari(u) }))),
    ...topping.map((t) => ({ kunci: `t|${t.id}`, jenis: 'topping', id: t.id, nama: t.nama, ukuran: null, kategori: 'Topping', harga: t.harga, nilai: nilaiDari(t) })),
    ...paket.map((p) => ({ kunci: `p|${p.id}`, jenis: 'paket', id: p.id, nama: p.nama, ukuran: null, kategori: 'Paket promo (khusus aplikasi)', harga: p.hargaIsiToko, nilai: nilaiDari(p), aktif: p.aktif })),
  ];
}

// Baris tabel → body PUT /harga-saluran. Kolom kosong tidak dikirim (= harga toko).
function keBody(baris) {
  const detail = [];
  const hargaSaluran = (b, i) => {
    const hasil = {};
    for (const s of SALURAN_ONLINE) {
      const t = b.nilai[s].trim();
      if (t === '') continue;
      const n = angkaBulatDari(t);
      if (n === null || n < 0) detail.push({ field: `${i}.${s}`, pesan: `${b.nama}${b.ukuran ? ` ${b.ukuran}` : ''}: harga wajib rupiah bulat` });
      else hasil[s] = n;
    }
    return hasil;
  };
  const menu = new Map();
  const topping = [];
  const paket = [];
  baris.forEach((b, i) => {
    if (b.jenis === 'paket') {
      const hs = hargaSaluran(b, i);
      if (Object.keys(hs).length === 0 && !detail.some((d) => d.field.startsWith(`${i}.`))) detail.push({ field: `${i}.paket`, pesan: `${b.nama}: isi harga minimal di satu aplikasi (atau nonaktifkan paketnya di Menu & resep)` });
      paket.push({ id: b.id, hargaSaluran: hs });
    } else if (b.jenis === 'menu') {
      if (!menu.has(b.id)) menu.set(b.id, { id: b.id, ukuran: [] });
      menu.get(b.id).ukuran.push({ nama: b.ukuran, hargaSaluran: hargaSaluran(b, i) });
    } else topping.push({ id: b.id, hargaSaluran: hargaSaluran(b, i) });
  });
  if (detail.length) throw new GalatForm(detail);
  return { menu: [...menu.values()], topping, paket };
}

function Penjelasan({ contoh, komisi, namaSaluran }) {
  const naik20 = hargaNaik(contoh, komisi, 1);
  const bersihNaik = Math.round(naik20 * (1 - komisi / 100));
  const impas = hargaImpas(contoh, komisi, 1);
  return (
    <details className="kartu penjelasan">
      <summary><strong>Kenapa harga di aplikasi biasanya lebih mahal, dan berapa yang pas?</strong></summary>
      <p>Aplikasi memotong komisi dari harga jual. Contoh dengan komisi {namaSaluran} {String(komisi).replace('.', ',')}% (angka di tab Sambungan) dan menu seharga {formatRupiah(contoh)}:</p>
      <pre className="alur">{`Naik ${komisi}%   ${formatRupiah(contoh)} → ${formatRupiah(naik20)}, dipotong ${komisi}% → bersih ${formatRupiah(bersihNaik)}  (masih kurang dari harga toko)
Impas      ${formatRupiah(contoh)} ÷ ${(1 - komisi / 100).toLocaleString('id-ID')} = ${formatRupiah(impas)}, dipotong ${komisi}% → bersih ${formatRupiah(contoh)}  (sama dengan di toko)`}</pre>
      <p>Tombol <strong>Saran impas</strong> mengisi harga ini untuk semua menu, dibulatkan ke atas. Harga di bawah impas ditandai ⚠: pendapatan bersihnya lebih kecil dari penjualan di toko. Itu boleh saja (misalnya untuk promo), asal disengaja.</p>
      <p className="bantuan">Ongkos lain dari aplikasi (biaya layanan, promo yang ditanggung toko) tidak ikut dihitung. Komisi sebenarnya lihat kontrak masing-masing aplikasi.</p>
    </details>
  );
}

export default function HargaAplikasi({ saluran }) {
  const { api } = useSesi();
  const menu = useData('/menu');
  const topping = useData('/topping');
  const paket = useData('/paket');
  const [baris, setBaris] = useState(null);
  // Data hasil simpan terakhir. Dipakai langsung supaya tabel tidak sempat menampilkan harga lama selagi data dimuat ulang.
  const [tersimpan, setTersimpan] = useState(null);
  const [kelipatan, setKelipatan] = useState(500);
  const [persen, setPersen] = useState({});
  const kirim = useKirim();

  const awal = useMemo(() => {
    if (tersimpan) return barisDari(tersimpan.menu, tersimpan.topping, tersimpan.paket);
    return menu.data && topping.data && paket.data ? barisDari(menu.data, topping.data, paket.data) : null;
  }, [tersimpan, menu.data, topping.data, paket.data]);
  const isi = baris ?? awal;

  if (!awal && (menu.memuat || topping.memuat || paket.memuat)) return <Memuat />;
  const galat = menu.galat ?? topping.galat ?? paket.galat;
  if (galat) return <PesanGalat galat={galat} ulangi={() => { menu.muatUlang(); topping.muatUlang(); paket.muatUlang(); }} />;

  const kolom = saluran.filter((s) => s.aktif);
  if (kolom.length === 0) return <Pesan>Belum ada aplikasi yang dipakai. Aktifkan dulu di tab Sambungan.</Pesan>;

  const komisiDi = (s) => kolom.find((k) => k.id === s)?.komisiPersen ?? 0;
  const ubahSel = (kunci, s, v) => setBaris(isi.map((b) => (b.kunci === kunci ? { ...b, nilai: { ...b.nilai, [s]: v } } : b)));
  // Isi cepat hanya untuk menu & topping: harga paket promo sengaja diatur per paket.
  const isiKolom = (s, fn) => setBaris(isi.map((b) => (b.jenis === 'paket' ? b : { ...b, nilai: { ...b.nilai, [s]: fn(b) } })));
  const berubah = isi.filter((b, i) => SALURAN_ONLINE.some((s) => b.nilai[s].trim() !== awal[i].nilai[s])).length;

  const simpan = async () => {
    const hasil = await kirim.jalankan(() => api('/harga-saluran', { method: 'PUT', body: keBody(isi) }), 'Harga di aplikasi tersimpan. Berlaku untuk pesanan berikutnya.');
    if (hasil) {
      setTersimpan(hasil);
      setBaris(null);
    }
  };

  const contoh = (tersimpan?.menu ?? menu.data)[0]?.ukuran[0]?.harga ?? 12000;
  let kategoriSebelum = null;

  return (
    <>
      <p className="bantuan">
        Harga yang dipakai saat crew mencatat pesanan aplikasi di kasir, dan harga yang dikirim ke aplikasi saat menu disinkron (di sambungan sungguhan).
        Kolom kosong = sama dengan harga toko (untuk paket promo: tidak dijual di aplikasi itu). Stok tetap memakai resep yang sama, apa pun salurannya.
      </p>
      <Penjelasan contoh={contoh} komisi={komisiDi(kolom[0].id)} namaSaluran={kolom[0].nama} />

      <div className="kartu">
        <strong>Isi cepat per aplikasi</strong>
        <div className="aksi">
          <label>Bulatkan ke atas ke
            <select value={kelipatan} onChange={(e) => setKelipatan(Number(e.target.value))}>
              {KELIPATAN.map((k) => <option key={k} value={k}>{formatRupiah(k)}</option>)}
            </select>
          </label>
        </div>
        {kolom.map((s) => (
          <div key={s.id} className="aksi baris-isi-cepat">
            <strong>{s.nama}</strong>
            <button type="button" className="tombol-kecil" onClick={() => isiKolom(s.id, (b) => String(hargaImpas(b.harga, komisiDi(s.id), kelipatan)))}>
              Saran impas (komisi {String(s.komisiPersen).replace('.', ',')}%)
            </button>
            <label>Naik
              <input className="angka input-persen" inputMode="decimal" value={persen[s.id] ?? ''} placeholder="20" aria-label={`Persen kenaikan ${s.nama}`} onChange={(e) => setPersen({ ...persen, [s.id]: e.target.value })} />%
            </label>
            <button type="button" className="tombol-kecil" disabled={!(angkaDari(persen[s.id] ?? '') >= 0)}
              onClick={() => isiKolom(s.id, (b) => String(hargaNaik(b.harga, angkaDari(persen[s.id]), kelipatan)))}>
              Terapkan
            </button>
            <button type="button" className="tombol-kecil" onClick={() => isiKolom(s.id, () => '')}>Kosongkan (= harga toko)</button>
          </div>
        ))}
        <p className="bantuan">Isi cepat hanya mengubah tabel di bawah (menu & topping, bukan paket promo). Belum tersimpan sampai menekan Simpan.</p>
      </div>

      <RingkasanGalat galat={kirim.galat} />
      {kirim.sukses && !berubah && <Pesan jenis="sukses">{kirim.sukses}</Pesan>}

      <div className="tabel-gulir">
        <table className="tabel-harga">
          <thead>
            <tr><th>Menu</th><th className="kanan">Harga toko</th>{kolom.map((s) => <th key={s.id}>{s.nama}</th>)}</tr>
          </thead>
          <tbody>
            {isi.map((b, i) => {
              const judul = b.kategori !== kategoriSebelum;
              kategoriSebelum = b.kategori;
              return [
                judul && <tr key={`k-${b.kategori}`} className="baris-kategori"><td colSpan={2 + kolom.length}>{b.kategori}</td></tr>,
                <tr key={b.kunci}>
                  <td>{b.nama}{b.ukuran && <small> {b.ukuran}</small>}{b.jenis === 'paket' && !b.aktif && <small className="teks-redup"> (nonaktif)</small>}</td>
                  <td className="kanan">{b.jenis === 'paket' ? <small className="teks-redup">isi di toko<br />{formatRupiah(b.harga)}</small> : formatRupiah(b.harga)}</td>
                  {kolom.map((s) => {
                    const teks = b.nilai[s.id];
                    const n = teks.trim() === '' ? null : angkaBulatDari(teks);
                    const salah = teks.trim() !== '' && (n === null || n < 0);
                    const bersih = n === null ? null : Math.round(n * (1 - s.komisiPersen / 100));
                    const rugi = b.jenis !== 'paket' && bersih !== null && !salah && bersih < b.harga;
                    return (
                      <td key={s.id}>
                        <input
                          className="angka" inputMode="numeric" value={teks} placeholder={b.jenis === 'paket' ? 'tidak dijual' : String(b.harga)}
                          aria-label={`Harga ${s.nama} ${b.nama}${b.ukuran ? ` ${b.ukuran}` : ''}`} aria-invalid={salah || undefined}
                          onChange={(e) => ubahSel(b.kunci, s.id, e.target.value)}
                        />
                        {salah && <small className="teks-galat">Wajib angka bulat</small>}
                        {rugi && <small className="teks-galat" title="Pendapatan bersih setelah komisi lebih kecil dari harga toko">⚠ bersih {formatRupiah(bersih)}</small>}
                        {isi[i].nilai[s.id].trim() !== awal[i].nilai[s.id] && <small className="teks-redup">diubah</small>}
                      </td>
                    );
                  })}
                </tr>,
              ];
            })}
          </tbody>
        </table>
      </div>

      <div className="aksi bilah-simpan">
        <button type="button" className="tombol-utama" disabled={!berubah || kirim.sedang} onClick={simpan}>{kirim.sedang ? 'Menyimpan…' : `Simpan ${berubah || ''} perubahan`.replace('  ', ' ')}</button>
        {berubah > 0 && <button type="button" className="tombol-kecil" onClick={() => { setBaris(null); kirim.reset(); }}>Batalkan perubahan</button>}
      </div>
    </>
  );
}
