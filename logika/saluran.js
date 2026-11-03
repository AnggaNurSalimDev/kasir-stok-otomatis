// Saluran penjualan: di toko atau aplikasi pesan-antar. Fungsi murni, dipakai frontend, mock, dan backend nanti.
//
//   ukuran menu = { nama, harga, hargaSaluran?: { gofood?: 18000, grabfood?: 18000 } }
//   hargaDi(ukuran, 'gofood')   → 18000   (diisi owner)
//   hargaDi(ukuran, 'shopeefood') → harga  (kosong = sama dengan harga toko)

export const SALURAN_ONLINE = ['gofood', 'grabfood', 'shopeefood'];
export const SALURAN = ['toko', ...SALURAN_ONLINE];
export const NAMA_SALURAN = { toko: 'Di toko', gofood: 'GoFood', grabfood: 'GrabFood', shopeefood: 'ShopeeFood' };

export const adalahOnline = (saluran) => SALURAN_ONLINE.includes(saluran);

// Harga sesuatu yang punya { harga, hargaSaluran } (ukuran menu atau topping) di satu saluran.
export function hargaDi(barang, saluran = 'toko') {
  if (!barang || !Number.isInteger(barang.harga)) throw new TypeError('barang wajib punya harga bulat');
  if (!SALURAN.includes(saluran)) throw new TypeError(`Saluran tidak dikenal: ${saluran}`);
  if (saluran === 'toko') return barang.harga;
  const h = barang.hargaSaluran?.[saluran];
  return Number.isInteger(h) ? h : barang.harga;
}

// Perkiraan potongan komisi aplikasi (rupiah bulat). Angka persen dari pengaturan owner, bukan tagihan resmi.
export function perkiraanKomisi(total, persen) {
  if (!Number.isInteger(total) || total < 0) throw new TypeError('total wajib rupiah bulat ≥ 0');
  if (typeof persen !== 'number' || persen < 0 || persen > 100) throw new TypeError('persen wajib 0–100');
  return Math.round((total * persen) / 100);
}

// Kode item yang dikirim aplikasi. Menu yang disinkronkan dari kasir memakai kode "menuId:ukuran";
// menu yang dibuat langsung di aplikasi punya kode lain dan perlu dipetakan owner.
export const kodeMenu = (menuId, ukuran) => `${menuId}:${ukuran}`;

// Mencocokkan satu item aplikasi ke menu kasir.
//   → { menuId, ukuran, kali, toppingIds }   atau   { masalah: '...' }
export function cocokkanItem(item, { menuById, toppingById, pemetaan = {} }) {
  let tujuan = pemetaan[item.kode] ?? null;
  if (!tujuan) {
    const i = item.kode.lastIndexOf(':');
    if (i > 0) {
      const menuId = item.kode.slice(0, i);
      const ukuran = item.kode.slice(i + 1);
      if (menuById.get(menuId)?.ukuran.some((u) => u.nama === ukuran)) tujuan = { menuId, ukuran, kali: 1 };
    }
  }
  if (!tujuan) return { masalah: 'Menu belum dikenali kasir' };
  const menu = menuById.get(tujuan.menuId);
  if (!menu || !menu.ukuran.some((u) => u.nama === tujuan.ukuran)) return { masalah: 'Pemetaan menunjuk menu yang sudah tidak ada' };
  const toppingIds = [];
  for (const t of item.topping ?? []) {
    if (!toppingById.has(t.kode) || !menu.toppingIds.includes(t.kode)) return { masalah: `Topping "${t.nama}" belum dikenali kasir` };
    toppingIds.push(t.kode);
  }
  return { menuId: tujuan.menuId, ukuran: tujuan.ukuran, kali: tujuan.kali ?? 1, toppingIds };
}
