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
//   menu disinkron dari kasir ("thaiTea:Large")      → isi = [{ thaiTea, Large, qty 1 }]
//   menu dibuat di aplikasi, sudah dipetakan owner   → isi = pemetaan, misalnya
//        "Paket Berdua" = [{ thaiTea, Regular, 1 }, { kopiSusu, Regular, 1 }]
//   → { isi: [{ menuId, ukuran, qty, toppingIds }] }   (qty per 1 item aplikasi)
//   atau { masalah: '...' }  (jangan pernah menebak: stok akan berkurang dengan resep yang salah)
export function cocokkanItem(item, { menuById, toppingById, pemetaan = {} }) {
  let isi = null;
  const peta = pemetaan[item.kode];
  if (peta) isi = normalkanPemetaan(peta);
  else {
    const i = item.kode.lastIndexOf(':');
    if (i > 0) {
      const menuId = item.kode.slice(0, i);
      const ukuran = item.kode.slice(i + 1);
      if (menuById.get(menuId)?.ukuran.some((u) => u.nama === ukuran)) isi = [{ menuId, ukuran, qty: 1 }];
    }
  }
  if (!isi) return { masalah: 'Menu belum dikenali kasir' };
  for (const k of isi) {
    const menu = menuById.get(k.menuId);
    if (!menu || !menu.ukuran.some((u) => u.nama === k.ukuran)) return { masalah: 'Pemetaan menunjuk menu yang sudah tidak ada' };
  }
  // Topping dari aplikasi menempel ke isi pertama (paket dengan topping jarang; jika tidak diizinkan → masalah).
  const pertama = menuById.get(isi[0].menuId);
  const toppingIds = [];
  for (const t of item.topping ?? []) {
    if (!toppingById.has(t.kode) || !pertama.toppingIds.includes(t.kode)) return { masalah: `Topping "${t.nama}" belum dikenali kasir` };
    toppingIds.push(t.kode);
  }
  return { isi: isi.map((k, j) => ({ menuId: k.menuId, ukuran: k.ukuran, qty: k.qty, toppingIds: j === 0 ? toppingIds : [] })) };
}

// Pemetaan lama { menuId, ukuran, kali } → bentuk baru { isi: [...] }.
export function normalkanPemetaan(p) {
  if (Array.isArray(p?.isi)) return p.isi;
  return [{ menuId: p.menuId, ukuran: p.ukuran, qty: p.kali ?? 1 }];
}

// Membagi satu harga ke beberapa bagian sebanding bobotnya (rupiah bulat, jumlahnya tetap sama persis).
//   bagiHarga(30000, [14000, 16000]) → [14000, 16000]   ·   bagiHarga(25000, [1, 1]) → [12500, 12500]
export function bagiHarga(total, bobot) {
  if (!Number.isInteger(total) || total < 0) throw new TypeError('total wajib rupiah bulat ≥ 0');
  if (!Array.isArray(bobot) || bobot.length === 0 || bobot.some((b) => !(b >= 0))) throw new TypeError('bobot wajib daftar angka ≥ 0');
  const jumlah = bobot.reduce((a, b) => a + b, 0);
  const dasar = jumlah === 0 ? bobot.map(() => 1) : bobot;
  const totalDasar = dasar.reduce((a, b) => a + b, 0);
  const hasil = dasar.map((b) => Math.floor((total * b) / totalDasar));
  hasil[hasil.length - 1] += total - hasil.reduce((a, b) => a + b, 0); // sisa pembulatan ke bagian terakhir
  return hasil;
}

// Kenaikan harga supaya pendapatan bersih setelah komisi sama dengan harga toko:
//   bersih = harga × (1 − komisi)  →  harga = hargaToko ÷ (1 − komisi)
//   komisi 20% → naik 25%, bukan 20% (naik 20% lalu dipotong 20% = 96% dari harga toko).
export function hargaImpas(hargaToko, komisiPersen, kelipatan = 500) {
  if (!Number.isInteger(hargaToko) || hargaToko < 0) throw new TypeError('harga wajib rupiah bulat ≥ 0');
  if (!(komisiPersen >= 0 && komisiPersen < 100)) throw new TypeError('komisi wajib 0 sampai < 100');
  if (!Number.isInteger(kelipatan) || kelipatan < 1) throw new TypeError('kelipatan wajib bilangan bulat ≥ 1');
  return Math.ceil(hargaToko / (1 - komisiPersen / 100) / kelipatan) * kelipatan;
}

// Harga toko + persen, dibulatkan ke atas ke kelipatan.
export function hargaNaik(hargaToko, persen, kelipatan = 500) {
  if (!Number.isInteger(hargaToko) || hargaToko < 0) throw new TypeError('harga wajib rupiah bulat ≥ 0');
  if (!(persen >= 0 && persen <= 300)) throw new TypeError('persen wajib 0–300');
  if (!Number.isInteger(kelipatan) || kelipatan < 1) throw new TypeError('kelipatan wajib bilangan bulat ≥ 1');
  return Math.ceil((hargaToko * (1 + persen / 100)) / kelipatan - 1e-9) * kelipatan;
}
