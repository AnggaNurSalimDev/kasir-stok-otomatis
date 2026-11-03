// Menghitung pemakaian bahan dari keranjang. Fungsi murni: tanpa localStorage, tanpa React.
//
// Alur bentuk data:
//   1. keranjang  [{ menuId, ukuran, toppingIds, qty }]
//   2. → baris resep per item (menu ukuran itu + setiap topping)
//   3. → satuan dasar ×10      [{ bahanId, jumlahX10 }]
//   4. → × qty, dijumlah per bahan
//   5. → { creamer: 160, gula: 160, airThaiTea: 3000, ... }   (×10: 160 = 16 gr)

import { konversiResep } from './resep.js';
import { lemparJikaAda } from './galat.js';

// katalog = { bahan: [...], menu: [...], topping: [...] }
//   menu    = { id, nama, ukuran: [{ nama, harga, resep }], toppingIds: [...] }  (topping yang diizinkan)
//   topping = { id, nama, harga, resep }
export function buatIndeks(katalog) {
  if (!katalog || !Array.isArray(katalog.bahan) || !Array.isArray(katalog.menu) || !Array.isArray(katalog.topping)) {
    throw new TypeError('katalog wajib berisi daftar bahan, menu, dan topping');
  }
  return {
    bahanById: new Map(katalog.bahan.map((b) => [b.id, b])),
    menuById: new Map(katalog.menu.map((m) => [m.id, m])),
    toppingById: new Map(katalog.topping.map((t) => [t.id, t])),
  };
}

// A-06 + keberadaan menu/ukuran/topping. Mengembalikan daftar masalah (kosong = aman).
function periksaItem(item, i, indeks) {
  const f = `keranjang[${i}]`;
  const detail = [];
  const menu = indeks.menuById.get(item?.menuId);
  if (!menu) return [{ field: `${f}.menuId`, pesan: `Menu "${item?.menuId}" tidak ditemukan` }];

  if (!Number.isInteger(item.qty) || item.qty < 1) {
    detail.push({ field: `${f}.qty`, pesan: 'Wajib bilangan bulat minimal 1' });
  }
  if (!menu.ukuran?.some((u) => u.nama === item.ukuran)) {
    detail.push({ field: `${f}.ukuran`, pesan: `Ukuran "${item.ukuran}" tidak ada di menu "${menu.nama}"` });
  }
  const toppingIds = item.toppingIds ?? [];
  if (!Array.isArray(toppingIds)) {
    detail.push({ field: `${f}.toppingIds`, pesan: 'Wajib berupa daftar' });
    return detail;
  }
  if (new Set(toppingIds).size !== toppingIds.length) {
    detail.push({ field: `${f}.toppingIds`, pesan: 'Topping yang sama dipilih lebih dari sekali' });
  }
  toppingIds.forEach((tid, j) => {
    if (!indeks.toppingById.has(tid)) {
      detail.push({ field: `${f}.toppingIds[${j}]`, pesan: `Topping "${tid}" tidak ditemukan` });
    } else if (!(menu.toppingIds ?? []).includes(tid)) {
      detail.push({ field: `${f}.toppingIds[${j}]`, pesan: `Topping "${tid}" tidak tersedia untuk "${menu.nama}"` });
    }
  });
  return detail;
}

// Mengembalikan { [bahanId]: jumlahX10 } — total pemakaian satuan dasar ×10.
// Bahan yang sama dari menu dan topping dijumlahkan (A-04 hanya berlaku di dalam satu resep).
export function hitungPemakaian(keranjang, katalog) {
  if (!Array.isArray(keranjang) || keranjang.length === 0) {
    lemparJikaAda('Keranjang tidak valid', [{ field: 'keranjang', pesan: 'Keranjang kosong' }]);
  }
  const indeks = buatIndeks(katalog);

  // Periksa semua item dulu, supaya semua masalah dilaporkan sekaligus.
  lemparJikaAda('Pesanan tidak valid', keranjang.flatMap((item, i) => periksaItem(item, i, indeks)));

  const total = new Map();
  keranjang.forEach((item, i) => {
    const menu = indeks.menuById.get(item.menuId);
    const ukuran = menu.ukuran.find((u) => u.nama === item.ukuran);
    const sumber = [
      konversiResep(ukuran.resep, indeks.bahanById, `${menu.nama} ${ukuran.nama}`),
      ...(item.toppingIds ?? []).map((tid) => {
        const t = indeks.toppingById.get(tid);
        return konversiResep(t.resep, indeks.bahanById, `topping ${t.nama}`);
      }),
    ];
    for (const resep of sumber) {
      for (const { bahanId, jumlahX10 } of resep) {
        total.set(bahanId, (total.get(bahanId) ?? 0) + jumlahX10 * item.qty);
      }
    }
  });

  // Invariant: hasil selalu bilangan bulat positif.
  for (const [id, x10] of total) {
    if (!Number.isInteger(x10) || x10 <= 0) throw new Error(`Invariant gagal: pemakaian ${id} = ${x10}`);
  }
  return Object.fromEntries(total);
}

// A-08: stok boleh minus, tapi kasir perlu tahu bahan mana yang akan minus.
//   stokX10 = { gula: 100 }, pemakaian = { gula: 160 } → [{ bahanId: 'gula', stokX10: 100, sesudahX10: -60 }]
export function cekStokMinus(stokX10, pemakaian) {
  if (!stokX10 || typeof stokX10 !== 'object') throw new TypeError('stokX10 wajib berupa objek');
  return Object.entries(pemakaian)
    .map(([bahanId, pakai]) => {
      const stok = stokX10[bahanId] ?? 0;
      return { bahanId, stokX10: stok, sesudahX10: stok - pakai };
    })
    .filter((b) => b.sesudahX10 < 0);
}
