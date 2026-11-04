// Logika keranjang kasir (fungsi murni). Harga di sini hanya untuk tampilan;
// total yang sah dihitung server dan tampil di struk.
//
//   item = { menuId, ukuran, toppingIds: [...], qty }   atau paket (khusus aplikasi): { paketId, qty }

import { hargaDi } from '../../../../logika/saluran.js';

const MAKS_QTY = 99;

// Kunci konfigurasi: menu + ukuran + topping (urutan topping tidak berpengaruh).
export const kunciItem = (it) => (it.paketId ? `paket|${it.paketId}` : `${it.menuId}|${it.ukuran}|${[...it.toppingIds].sort().join(',')}`);

function periksaItem(it) {
  const paket = it && typeof it.paketId === 'string';
  if (!it || (!paket && (typeof it.menuId !== 'string' || typeof it.ukuran !== 'string' || !Array.isArray(it.toppingIds)))) {
    throw new TypeError('Item keranjang tidak valid');
  }
  if (!Number.isInteger(it.qty) || it.qty < 1) throw new TypeError(`Qty harus bilangan bulat ≥ 1, dapat ${it.qty}`);
}

// Item dengan konfigurasi sama digabung (qty dijumlah, maksimal 99).
export function tambah(keranjang, item) {
  periksaItem(item);
  const k = kunciItem(item);
  const ada = keranjang.find((x) => kunciItem(x) === k);
  if (ada) return keranjang.map((x) => (x === ada ? { ...x, qty: Math.min(MAKS_QTY, x.qty + item.qty) } : x));
  return [...keranjang, { ...item, ...(item.toppingIds ? { toppingIds: [...item.toppingIds] } : {}), qty: Math.min(MAKS_QTY, item.qty) }];
}

// qty 0 atau kurang = hapus. Di atas 99 dipotong.
export function ubahQty(keranjang, kunci, qty) {
  if (!Number.isInteger(qty)) throw new TypeError(`Qty harus bilangan bulat, dapat ${qty}`);
  if (qty <= 0) return keranjang.filter((x) => kunciItem(x) !== kunci);
  return keranjang.map((x) => (kunciItem(x) === kunci ? { ...x, qty: Math.min(MAKS_QTY, qty) } : x));
}

// Harga satu item di satu saluran: harga ukuran + harga topping. null jika menu/ukuran/topping tidak dikenal
// (misalnya katalog berubah di tempat lain); kasir lalu meminta item itu dihapus.
// Paket hanya punya harga di aplikasi tempat ia dijual; di toko atau aplikasi lain → null.
export function hargaSatuan(item, menuById, toppingById, saluran = 'toko', paketById = new Map()) {
  if (item.paketId) {
    const p = paketById.get(item.paketId);
    const h = saluran === 'toko' || !p?.aktif ? undefined : p.hargaSaluran?.[saluran];
    return Number.isInteger(h) ? h : null;
  }
  const menu = menuById.get(item.menuId);
  const ukuran = menu?.ukuran.find((u) => u.nama === item.ukuran);
  if (!ukuran) return null;
  let harga = hargaDi(ukuran, saluran);
  for (const tid of item.toppingIds) {
    const t = toppingById.get(tid);
    if (!t) return null;
    harga += hargaDi(t, saluran);
  }
  return harga;
}

export function total(keranjang, menuById, toppingById, saluran = 'toko', paketById = new Map()) {
  return keranjang.reduce((jumlah, it) => {
    const h = hargaSatuan(it, menuById, toppingById, saluran, paketById);
    return h === null ? jumlah : jumlah + h * it.qty;
  }, 0);
}

// Pecahan uang yang biasa diterima, untuk tombol cepat: total 23.000 → [23.000 (pas), 25.000, 30.000, 50.000, 100.000]
export function saranUang(totalRupiah) {
  if (!Number.isInteger(totalRupiah) || totalRupiah <= 0) return [];
  const kandidat = [totalRupiah];
  for (const kelipatan of [5000, 10000, 50000, 100000]) kandidat.push(Math.ceil(totalRupiah / kelipatan) * kelipatan);
  return [...new Set(kandidat)].sort((a, b) => a - b).slice(0, 5);
}

export const keBody = (keranjang) =>
  keranjang.map(({ menuId, ukuran, toppingIds, paketId, qty }) => (paketId ? { paketId, qty } : { menuId, ukuran, toppingIds, qty }));
