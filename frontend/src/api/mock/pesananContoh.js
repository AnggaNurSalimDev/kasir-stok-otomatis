// Pesanan contoh "seolah dikirim aplikasi" untuk demo dan data demo. Fungsi murni (acak bisa diberi benih).
//
//   menu kasir ──(sinkron menu: kode = "menuId:ukuran")──▶ menu di aplikasi
//                                                            │ pelanggan memesan
//                                                            ▼
//   { nomorPesanan, pelanggan, item: [{ kode, nama, qty, harga, topping }], total }  → POST /integrasi/<saluran>/pesanan

import { hargaDi, kodeMenu, kodePaket, NAMA_SALURAN, SALURAN_ONLINE } from '../../../../logika/saluran.js';

export const AWALAN_NOMOR = { gofood: 'F-', grabfood: 'GF-', shopeefood: 'SF-' };
const PELANGGAN = ['Andi', 'Bella', 'Citra', 'Dewi', 'Eka', 'Fajar', 'Gita', 'Hendra', 'Indah', 'Joko', 'Kiki', 'Lina', 'Maya', 'Nanda'];
const CATATAN = ['Es sedikit', 'Less sugar', 'Tolong dipisah', 'Sedotan 2'];

// Menu yang dibuat owner langsung di aplikasi, bukan dirancang di kasir: kasir belum mengenalinya.
export const KODE_TIDAK_DIKENAL = 'APP-PROMO-GAJIAN';

export function nomorPesanan(saluran, angka) {
  if (!AWALAN_NOMOR[saluran]) throw new TypeError(`Saluran online tidak dikenal: ${saluran}`);
  return `${AWALAN_NOMOR[saluran]}${String(angka).padStart(6, '0')}`;
}

export function buatPesananContoh({ menu, topping, paket = [], saluran, nomor, acak = Math.random, tidakDikenal = false, denganPaket = null }) {
  if (!SALURAN_ONLINE.includes(saluran)) throw new TypeError(`Saluran online tidak dikenal: ${saluran}`);
  if (!Array.isArray(menu) || menu.length === 0) throw new TypeError('Menu kosong');
  const pilih = (arr) => arr[Math.floor(acak() * arr.length)];
  const toppingById = new Map(topping.map((t) => [t.id, t]));

  const item = [];
  const jumlah = acak() < 0.35 ? 2 : 1;
  for (let i = 0; i < jumlah; i++) {
    const m = pilih(menu);
    const u = pilih(m.ukuran);
    const tp = m.toppingIds.length && acak() < 0.4 ? [toppingById.get(pilih(m.toppingIds))].filter(Boolean) : [];
    const kode = kodeMenu(m.id, u.nama);
    if (item.some((x) => x.kode === kode && x.topping.length === tp.length && x.topping.every((t, j) => t.kode === tp[j]?.id))) continue;
    item.push({
      kode,
      nama: m.ukuran.length > 1 ? `${m.nama} (${u.nama})` : m.nama,
      qty: acak() < 0.2 ? 2 : 1,
      harga: hargaDi(u, saluran) + tp.reduce((a, t) => a + hargaDi(t, saluran), 0),
      topping: tp.map((t) => ({ kode: t.id, nama: t.nama })),
    });
  }
  // Paket kasir yang dijual di aplikasi ini (dikirim ke aplikasi saat sinkron menu, jadi kodenya dikenali).
  // dijual: dari GET /paket (status jadwal saat ini); pembuat data demo menyaring sendiri menurut jamnya.
  const paketDijual = paket.filter((p) => p.aktif && p.dijual !== false && Number.isInteger(p.hargaSaluran?.[saluran]));
  if (paketDijual.length && (denganPaket ?? acak() < 0.25)) {
    const p = pilih(paketDijual);
    item.push({ kode: kodePaket(p.id), nama: p.nama, qty: 1, harga: p.hargaSaluran[saluran], topping: [] });
  }
  if (tidakDikenal) {
    const u = menu[0].ukuran[0];
    item.push({ kode: KODE_TIDAK_DIKENAL, nama: 'Promo Gajian (dibuat di aplikasi)', qty: 1, harga: Math.ceil((hargaDi(u, saluran) * 2 * 0.9) / 500) * 500, topping: [] });
  }

  const pesanan = {
    nomorPesanan: nomorPesanan(saluran, nomor),
    pelanggan: pilih(PELANGGAN),
    item,
    total: item.reduce((a, it) => a + it.harga * it.qty, 0),
  };
  if (acak() < 0.15) pesanan.catatan = pilih(CATATAN);
  return pesanan;
}

export const namaSaluran = (s) => NAMA_SALURAN[s] ?? s;
