import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSesi } from '../../sesi/SesiContext.jsx';
import { useProfil } from '../../merek/ProfilContext.jsx';
import { useData } from '../../komponen/useData.js';
import { Memuat, Pesan, PesanGalat } from '../../komponen/umum.jsx';
import { RingkasanGalat, useKirim } from '../../komponen/form.jsx';
import { angkaBulatDari, formatRupiah } from '../../komponen/formAngka.js';
import { tambah, ubahQty, kunciItem, hargaSatuan, total, saranUang, keBody } from './keranjang.js';

// ---------------------------------------------------------------------------
// Panel pilih ukuran & topping
// ---------------------------------------------------------------------------

function PanelPilih({ menu, toppingById, onTambah, onTutup }) {
  const [ukuran, setUkuran] = useState(menu.ukuran[0].nama);
  const [toppingIds, setToppingIds] = useState([]);
  const [qty, setQty] = useState(1);
  const pertama = useRef(null);
  const topping = menu.toppingIds.map((id) => toppingById.get(id)).filter(Boolean);
  const harga = menu.ukuran.find((u) => u.nama === ukuran).harga + toppingIds.reduce((a, id) => a + (toppingById.get(id)?.harga ?? 0), 0);

  // Fokus awal sekali saja; Escape memanggil onTutup terbaru lewat ref (onTutup dibuat ulang tiap render).
  const tutupRef = useRef(onTutup);
  tutupRef.current = onTutup;
  useEffect(() => {
    pertama.current?.focus();
    const esc = (e) => e.key === 'Escape' && tutupRef.current();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);

  return (
    <div className="latar-dialog" onClick={onTutup}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="judul-pilih" onClick={(e) => e.stopPropagation()}>
        <h2 id="judul-pilih">{menu.nama}</h2>

        {menu.ukuran.length > 1 && (
          <fieldset>
            <legend>Ukuran</legend>
            <div className="pilihan">
              {menu.ukuran.map((u, i) => (
                <button key={u.nama} ref={i === 0 ? pertama : undefined} type="button" aria-pressed={ukuran === u.nama} className="tombol-pilihan" onClick={() => setUkuran(u.nama)}>
                  {u.nama}<br /><small>{formatRupiah(u.harga)}</small>
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {topping.length > 0 && (
          <fieldset>
            <legend>Topping</legend>
            <div className="pilihan">
              {topping.map((t) => {
                const dipilih = toppingIds.includes(t.id);
                return (
                  <button key={t.id} type="button" aria-pressed={dipilih} className="tombol-pilihan" onClick={() => setToppingIds(dipilih ? toppingIds.filter((x) => x !== t.id) : [...toppingIds, t.id])}>
                    {t.nama}<br /><small>+{formatRupiah(t.harga)}</small>
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        <div className="baris-qty">
          <span>Jumlah</span>
          <button type="button" className="tombol-qty" aria-label="Kurangi" onClick={() => setQty(Math.max(1, qty - 1))} disabled={qty <= 1}>−</button>
          <strong aria-live="polite">{qty}</strong>
          <button type="button" className="tombol-qty" aria-label="Tambah" onClick={() => setQty(Math.min(99, qty + 1))} disabled={qty >= 99}>+</button>
        </div>

        <div className="aksi">
          <button type="button" ref={menu.ukuran.length > 1 ? undefined : pertama} className="tombol-utama tombol-lebar" onClick={() => onTambah({ menuId: menu.id, ukuran, toppingIds, qty })}>
            Tambah · {formatRupiah(harga * qty)}
          </button>
          <button type="button" className="tombol-kecil" onClick={onTutup}>Batal</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pembayaran
// ---------------------------------------------------------------------------

function Bayar({ totalTampil, onBayar, onKembali, kirim }) {
  const [metode, setMetode] = useState('tunai');
  const [uang, setUang] = useState('');
  const uangAngka = angkaBulatDari(uang);
  const kurang = metode === 'tunai' && (uangAngka === null || uangAngka < totalTampil);

  const bayar = (e) => {
    e.preventDefault();
    if (kurang) return;
    onBayar(metode === 'tunai' ? { metodeBayar: 'tunai', uangDiterima: uangAngka } : { metodeBayar: 'qris' });
  };

  return (
    <form onSubmit={bayar} noValidate>
      <h2>Pembayaran</h2>
      <p className="total-besar">{formatRupiah(totalTampil)}</p>
      <RingkasanGalat galat={kirim.galat} />
      <div className="pilihan">
        {[['tunai', 'Tunai'], ['qris', 'QRIS']].map(([v, l]) => (
          <button key={v} type="button" className="tombol-pilihan" aria-pressed={metode === v} onClick={() => setMetode(v)}>{l}</button>
        ))}
      </div>
      {metode === 'tunai' ? (
        <>
          <label htmlFor="uang-diterima" className="label-tebal">Uang diterima</label>
          <input id="uang-diterima" className="input-besar" inputMode="numeric" autoComplete="off" value={uang} onChange={(e) => setUang(e.target.value)} autoFocus />
          <div className="pilihan pilihan-kecil">
            {saranUang(totalTampil).map((n) => (
              <button key={n} type="button" className="tombol-pilihan" onClick={() => setUang(String(n))}>{n === totalTampil ? 'Uang pas' : formatRupiah(n)}</button>
            ))}
          </div>
          <p className={kurang && uang ? 'teks-galat' : undefined}>
            {uangAngka === null ? 'Masukkan jumlah uang.' : uangAngka < totalTampil ? `Kurang ${formatRupiah(totalTampil - uangAngka)}` : `Kembalian ${formatRupiah(uangAngka - totalTampil)}`}
          </p>
        </>
      ) : (
        <p className="bantuan">Pastikan pembayaran QRIS sudah masuk sebelum menekan Selesai.</p>
      )}
      <div className="aksi">
        <button type="submit" className="tombol-utama tombol-lebar" disabled={kurang || kirim.sedang}>{kirim.sedang ? 'Menyimpan…' : 'Selesai'}</button>
        <button type="button" className="tombol-kecil" onClick={onKembali} disabled={kirim.sedang}>Kembali</button>
      </div>
    </form>
  );
}

function Struk({ struk, onBaru }) {
  const { profil } = useProfil();
  const tombol = useRef(null);
  useEffect(() => tombol.current?.focus(), []);
  return (
    <div>
      <Pesan jenis="sukses">Transaksi tersimpan.</Pesan>
      {struk.peringatanMinus.length > 0 && (
        <Pesan>
          Stok di sistem untuk <strong>{struk.peringatanMinus.map((b) => b.nama.toLowerCase()).join(', ')}</strong> sudah habis atau minus.
          Penjualan tetap tercatat. Jika barangnya memang ada, mungkin ada barang masuk yang belum dicatat.
        </Pesan>
      )}
      <div className="struk" aria-label="Struk">
        <p className="tengah">
          <strong>{profil.nama}</strong>
          {profil.teks.alamat && <><br /><small>{profil.teks.alamat}</small></>}
          <br /><small>{new Date(struk.pada).toLocaleString('id-ID')} · {struk.kasir}</small>
        </p>
        <table>
          <tbody>
            {struk.item.map((it, i) => (
              <tr key={i}>
                <td>
                  {it.qty}× {it.nama} {it.ukuran}
                  {it.toppings.length > 0 && <><br /><small>+ {it.toppings.map((t) => t.nama).join(', ')}</small></>}
                </td>
                <td className="kanan">{formatRupiah(it.subtotal)}</td>
              </tr>
            ))}
            <tr className="garis-atas"><td><strong>Total</strong></td><td className="kanan"><strong>{formatRupiah(struk.total)}</strong></td></tr>
            {struk.metodeBayar === 'tunai' ? (
              <>
                <tr><td>Tunai</td><td className="kanan">{formatRupiah(struk.uangDiterima)}</td></tr>
                <tr><td><strong>Kembalian</strong></td><td className="kanan"><strong>{formatRupiah(struk.kembalian)}</strong></td></tr>
              </>
            ) : (
              <tr><td>QRIS</td><td className="kanan">{formatRupiah(struk.total)}</td></tr>
            )}
          </tbody>
        </table>
        <p className="tengah">{profil.teks.footerStruk}<br /><small>No. {struk.id}</small></p>
      </div>
      <button ref={tombol} type="button" className="tombol-utama tombol-lebar" onClick={onBaru}>Transaksi baru</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Halaman
// ---------------------------------------------------------------------------

export default function Kasir() {
  const { api } = useSesi();
  const shift = useData('/shift/aktif');
  const menu = useData('/menu');
  const topping = useData('/topping');
  const [kategori, setKategori] = useState(null);
  const [pilih, setPilih] = useState(null); // menu yang sedang dipilih ukuran/topping-nya
  const [keranjang, setKeranjang] = useState([]);
  const [tahap, setTahap] = useState('pesan'); // pesan → bayar → struk
  const [struk, setStruk] = useState(null);
  const [lihatKeranjang, setLihatKeranjang] = useState(false); // HP: keranjang dibuka sebagai panel
  const kirim = useKirim();

  const memuat = shift.memuat || menu.memuat || topping.memuat;
  const galat = shift.galat ?? menu.galat ?? topping.galat;
  if (memuat) return <Memuat />;
  if (galat) return <PesanGalat galat={galat} ulangi={() => { shift.muatUlang(); menu.muatUlang(); topping.muatUlang(); }} />;
  if (!shift.data) {
    return <Pesan>Belum ada shift yang dibuka. <Link to="/crew/shift">Buka shift</Link> dulu sebelum memakai kasir.</Pesan>;
  }

  const menuById = new Map(menu.data.map((m) => [m.id, m]));
  const toppingById = new Map(topping.data.map((t) => [t.id, t]));
  const daftarKategori = [...new Set(menu.data.map((m) => m.kategori))];
  const aktif = kategori ?? daftarKategori[0];
  const totalTampil = total(keranjang, menuById, toppingById);
  const jumlahItem = keranjang.reduce((a, it) => a + it.qty, 0);
  const adaItemRusak = keranjang.some((it) => hargaSatuan(it, menuById, toppingById) === null);

  const klikMenu = (m) => {
    // Satu ukuran tanpa topping: langsung masuk keranjang.
    if (m.ukuran.length === 1 && m.toppingIds.length === 0) setKeranjang(tambah(keranjang, { menuId: m.id, ukuran: m.ukuran[0].nama, toppingIds: [], qty: 1 }));
    else setPilih(m);
  };

  const bayar = async (pembayaran) => {
    const hasil = await kirim.jalankan(async () => {
      try {
        return await api('/transaksi', { method: 'POST', body: { item: keBody(keranjang), ...pembayaran } });
      } catch (e) {
        if (e.status === 409) shift.muatUlang(); // misalnya shift baru saja ditutup di perangkat lain
        throw e;
      }
    });
    if (hasil) {
      setStruk(hasil);
      setTahap('struk');
      setKeranjang([]);
      setLihatKeranjang(false);
    }
  };

  const baru = () => { setStruk(null); setTahap('pesan'); kirim.reset(); };

  if (tahap === 'struk') return <section className="sempit"><Struk struk={struk} onBaru={baru} /></section>;

  const panelKeranjang = (
    <aside className={`keranjang ${lihatKeranjang ? 'terbuka' : ''}`} aria-label="Keranjang">
      {tahap === 'bayar' ? (
        <Bayar totalTampil={totalTampil} kirim={kirim} onBayar={bayar} onKembali={() => { kirim.reset(); setTahap('pesan'); }} />
      ) : (
        <>
          <div className="judul-aksi">
            <h2>Pesanan</h2>
            {lihatKeranjang && <button type="button" className="tombol-kecil hanya-hp" onClick={() => setLihatKeranjang(false)}>Tutup</button>}
          </div>
          {keranjang.length === 0 && <p className="bantuan">Belum ada pesanan. Pilih menu.</p>}
          <ul className="daftar-keranjang">
            {keranjang.map((it) => {
              const m = menuById.get(it.menuId);
              const h = hargaSatuan(it, menuById, toppingById);
              const k = kunciItem(it);
              return (
                <li key={k}>
                  <div>
                    <strong>{m?.nama ?? it.menuId}</strong> {it.ukuran}
                    {it.toppingIds.length > 0 && <><br /><small>+ {it.toppingIds.map((id) => toppingById.get(id)?.nama ?? id).join(', ')}</small></>}
                    {h === null && <><br /><small className="teks-galat">Menu berubah, hapus item ini</small></>}
                  </div>
                  <div className="baris-qty">
                    <button type="button" className="tombol-qty" aria-label={`Kurangi ${m?.nama}`} onClick={() => setKeranjang(ubahQty(keranjang, k, it.qty - 1))}>−</button>
                    <strong>{it.qty}</strong>
                    <button type="button" className="tombol-qty" aria-label={`Tambah ${m?.nama}`} onClick={() => setKeranjang(ubahQty(keranjang, k, it.qty + 1))} disabled={it.qty >= 99}>+</button>
                  </div>
                  <span className="kanan">{h === null ? '–' : formatRupiah(h * it.qty)}</span>
                </li>
              );
            })}
          </ul>
          <div className="baris-total"><span>Total</span><strong>{formatRupiah(totalTampil)}</strong></div>
          <div className="aksi">
            <button type="button" className="tombol-utama tombol-lebar" disabled={keranjang.length === 0 || adaItemRusak} onClick={() => setTahap('bayar')}>Bayar</button>
            {keranjang.length > 0 && <button type="button" className="tombol-kecil" onClick={() => setKeranjang([])}>Kosongkan</button>}
          </div>
        </>
      )}
    </aside>
  );

  return (
    <div className="tata-kasir">
      <section className="area-menu">
        <div className="tab-kategori" role="tablist" aria-label="Kategori">
          {daftarKategori.map((k) => (
            <button key={k} type="button" role="tab" aria-selected={k === aktif} onClick={() => setKategori(k)}>{k}</button>
          ))}
        </div>
        <div className="kisi-menu">
          {menu.data.filter((m) => m.kategori === aktif).map((m) => (
            <button key={m.id} type="button" className="tombol-menu" onClick={() => klikMenu(m)} disabled={tahap !== 'pesan'}>
              <strong>{m.nama}</strong>
              <small>{m.ukuran.length > 1 ? `mulai ${formatRupiah(Math.min(...m.ukuran.map((u) => u.harga)))}` : formatRupiah(m.ukuran[0].harga)}</small>
            </button>
          ))}
        </div>
      </section>

      {panelKeranjang}

      {!lihatKeranjang && keranjang.length > 0 && tahap === 'pesan' && (
        <button type="button" className="bilah-keranjang hanya-hp" onClick={() => setLihatKeranjang(true)}>
          <span>{jumlahItem} item</span>
          <strong>{formatRupiah(totalTampil)} · Lihat pesanan</strong>
        </button>
      )}

      {pilih && (
        <PanelPilih
          menu={pilih}
          toppingById={toppingById}
          onTutup={() => setPilih(null)}
          onTambah={(item) => { setKeranjang(tambah(keranjang, item)); setPilih(null); }}
        />
      )}
    </div>
  );
}
