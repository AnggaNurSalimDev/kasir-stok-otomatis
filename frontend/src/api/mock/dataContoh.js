// Data contoh untuk demo. Semua angka contoh, bukan ukuran asli dari usaha mana pun.
//
// Katalog (bahan, menu, topping) ditulis langsung. Riwayat shift dibuat lewat mock API itu sendiri,
// supaya selisih, toleransi, dan kas dihitung oleh kode yang sama dengan pemakaian sungguhan.

import { buatMockApi } from './server.js';
import { penyimpananMemori } from './penyimpanan.js';

// ---------------------------------------------------------------------------
// Katalog
// ---------------------------------------------------------------------------

const sb = (nama, konversi) => ({ nama, konversi });
const bahan = (id, nama, satuanDasar, satuanBantu, batasMinimum, bahanKunci = false) => ({
  id, nama, satuanDasar, satuanBantu,
  batasMinimumX10: batasMinimum * 10,
  bahanKunci,
  toleransiPersen: 5,
  toleransiMinimumX10: null, // otomatis: mengikuti ketelitian hitung per satuan dasar
  arsip: false,
});

const BAHAN = [
  bahan('creamer', 'Creamer bubuk', 'gr', [sb('sendok', 8), sb('kaleng', 1000)], 500, true),
  bahan('gula', 'Gula pasir', 'gr', [sb('sdt', 8), sb('karung', 25000)], 2000),
  bahan('airThaiTea', 'Air thai tea', 'ml', [sb('garis bawah', 150), sb('garis atas', 220), sb('teko', 2000)], 1500, true),
  bahan('airGreenTea', 'Air green thai tea', 'ml', [sb('garis bawah', 150), sb('garis atas', 220), sb('teko', 2000)], 1500, true),
  bahan('creamerCair', 'Creamer cair', 'ml', [sb('botol', 1000)], 500),
  bahan('susuCair', 'Susu cair', 'ml', [sb('kotak', 1000)], 1000),
  bahan('bubukCoklat', 'Bubuk coklat', 'gr', [sb('sendok', 10), sb('bungkus', 1000)], 300, true),
  bahan('bubukMatcha', 'Bubuk matcha', 'gr', [sb('sendok', 5), sb('bungkus', 500)], 150, true),
  bahan('bijiKopi', 'Biji kopi', 'gr', [sb('shot', 18), sb('bungkus', 1000)], 300, true),
  bahan('sirupAren', 'Sirup gula aren', 'ml', [sb('pump', 10), sb('botol', 750)], 300),
  bahan('arenJelly', 'Aren jelly', 'gr', [sb('wadah', 1000)], 300),
  bahan('boba', 'Boba', 'gr', [sb('sendok sayur', 40), sb('bungkus', 1000)], 400),
  // Satuan dasar non-standar: dihitung per keping.
  bahan('oreo', 'Biskuit oreo', 'keping', [sb('bungkus', 12)], 24),
  bahan('cup', 'Cup', 'pcs', [sb('slop', 50)], 50, true),
];

const r = (bahanId, jumlah, satuan) => ({ bahanId, jumlah, satuan });
const cup = r('cup', 1, 'pcs');

const MENU = [
  {
    id: 'thaiTea', nama: 'Thai Tea', kategori: 'Teh', toppingIds: ['tpArenJelly', 'tpBoba', 'tpExtraCreamer'],
    ukuran: [
      { nama: 'Regular', harga: 12000, resep: [r('creamer', 1, 'sendok'), r('gula', 1, 'sdt'), r('airThaiTea', 1, 'garis bawah'), r('creamerCair', 20, 'ml'), cup] },
      { nama: 'Large', harga: 15000, resep: [r('creamer', 1.5, 'sendok'), r('gula', 1, 'sdt'), r('airThaiTea', 1, 'garis atas'), r('creamerCair', 30, 'ml'), cup] },
    ],
  },
  {
    id: 'greenThaiTea', nama: 'Green Thai Tea', kategori: 'Teh', toppingIds: ['tpArenJelly', 'tpBoba'],
    ukuran: [
      { nama: 'Regular', harga: 13000, resep: [r('creamer', 1, 'sendok'), r('gula', 1, 'sdt'), r('airGreenTea', 1, 'garis bawah'), r('creamerCair', 20, 'ml'), cup] },
      { nama: 'Large', harga: 16000, resep: [r('creamer', 1.5, 'sendok'), r('gula', 1, 'sdt'), r('airGreenTea', 1, 'garis atas'), r('creamerCair', 30, 'ml'), cup] },
    ],
  },
  {
    id: 'coklat', nama: 'Coklat', kategori: 'Non-kopi', toppingIds: ['tpBoba', 'tpOreo'],
    ukuran: [
      { nama: 'Regular', harga: 14000, resep: [r('bubukCoklat', 2, 'sendok'), r('gula', 1, 'sdt'), r('susuCair', 150, 'ml'), cup] },
      { nama: 'Large', harga: 17000, resep: [r('bubukCoklat', 3, 'sendok'), r('gula', 1, 'sdt'), r('susuCair', 220, 'ml'), cup] },
    ],
  },
  {
    id: 'matchaLatte', nama: 'Matcha Latte', kategori: 'Non-kopi', toppingIds: ['tpBoba'],
    ukuran: [
      { nama: 'Regular', harga: 18000, resep: [r('bubukMatcha', 2, 'sendok'), r('gula', 1, 'sdt'), r('susuCair', 150, 'ml'), cup] },
      { nama: 'Large', harga: 22000, resep: [r('bubukMatcha', 3, 'sendok'), r('gula', 1, 'sdt'), r('susuCair', 220, 'ml'), cup] },
    ],
  },
  {
    id: 'kopiSusu', nama: 'Kopi Susu', kategori: 'Kopi', toppingIds: ['tpExtraShot', 'tpArenJelly'],
    ukuran: [
      { nama: 'Regular', harga: 15000, resep: [r('bijiKopi', 1, 'shot'), r('susuCair', 120, 'ml'), r('creamerCair', 15, 'ml'), r('gula', 1, 'sdt'), cup] },
      { nama: 'Large', harga: 19000, resep: [r('bijiKopi', 2, 'shot'), r('susuCair', 180, 'ml'), r('creamerCair', 20, 'ml'), r('gula', 1, 'sdt'), cup] },
    ],
  },
  {
    id: 'kopiSusuAren', nama: 'Kopi Susu Aren', kategori: 'Kopi', toppingIds: ['tpExtraShot', 'tpArenJelly'],
    ukuran: [
      { nama: 'Regular', harga: 17000, resep: [r('bijiKopi', 1, 'shot'), r('susuCair', 120, 'ml'), r('sirupAren', 2, 'pump'), cup] },
      { nama: 'Large', harga: 21000, resep: [r('bijiKopi', 2, 'shot'), r('susuCair', 180, 'ml'), r('sirupAren', 3, 'pump'), cup] },
    ],
  },
  {
    id: 'americano', nama: 'Americano', kategori: 'Kopi', toppingIds: ['tpExtraShot'],
    ukuran: [{ nama: 'Regular', harga: 13000, resep: [r('bijiKopi', 1, 'shot'), cup] }],
  },
  {
    id: 'coklatOreo', nama: 'Coklat Oreo', kategori: 'Non-kopi', toppingIds: ['tpBoba'],
    ukuran: [
      { nama: 'Regular', harga: 17000, resep: [r('bubukCoklat', 2, 'sendok'), r('susuCair', 150, 'ml'), r('oreo', 2, 'keping'), cup] },
      { nama: 'Large', harga: 21000, resep: [r('bubukCoklat', 3, 'sendok'), r('susuCair', 220, 'ml'), r('oreo', 3, 'keping'), cup] },
    ],
  },
];

const TOPPING = [
  { id: 'tpArenJelly', nama: 'Aren Jelly', harga: 3000, resep: [r('arenJelly', 50, 'gr')] },
  { id: 'tpBoba', nama: 'Boba', harga: 3000, resep: [r('boba', 1, 'sendok sayur')] },
  { id: 'tpExtraCreamer', nama: 'Extra Creamer', harga: 2000, resep: [r('creamer', 0.5, 'sendok')] },
  { id: 'tpExtraShot', nama: 'Extra Shot', harga: 5000, resep: [r('bijiKopi', 1, 'shot')] },
  { id: 'tpOreo', nama: 'Oreo Crumble', harga: 4000, resep: [r('oreo', 2, 'keping')] },
];

const PENGGUNA = [
  { id: 'owner', nama: 'Pak Budi (owner)', peran: 'owner' },
  { id: 'rina', nama: 'Rina', peran: 'crew' },
  { id: 'dimas', nama: 'Dimas', peran: 'crew' },
  { id: 'sari', nama: 'Sari', peran: 'crew' },
];

export function buatKatalog() {
  return {
    versi: 1,
    urut: 0,
    pengguna: structuredClone(PENGGUNA),
    bahan: structuredClone(BAHAN),
    menu: structuredClone(MENU),
    topping: structuredClone(TOPPING),
    pengaturan: { shift: [{ nama: 'Pagi' }, { nama: 'Sore' }], hitungKas: true, toleransiKasRupiah: 0, zonaWaktu: 'Asia/Jakarta' },
    stok: Object.fromEntries(BAHAN.map((b) => [b.id, 0])),
    shift: [],
    transaksi: [],
    barangMasuk: [],
    pengeluaranKas: [],
    penyesuaian: [],
    opname: [],
  };
}

// ---------------------------------------------------------------------------
// Generator riwayat (deterministik)
// ---------------------------------------------------------------------------

// Pembangkit acak berbenih tetap (mulberry32): hasil sama setiap dijalankan.
function acakBerbenih(benih) {
  let a = benih >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Jam Asia/Jakarta (UTC+7) → Date. hari = 0 untuk tanggal `mulai`.
function jamJakarta(mulai, hari, jam, menit = 0) {
  const d = new Date(Date.UTC(mulai.getUTCFullYear(), mulai.getUTCMonth(), mulai.getUTCDate() + hari, jam - 7, menit));
  return d;
}

// Kejadian khusus per indeks shift (0 = hari pertama Pagi), supaya demo punya contoh setiap kasus.
const KHUSUS = {
  2: { salahInputGula: true },               // barang masuk gula 2 karung, lalu dikoreksi −1 karung
  4: { boros: { creamer: 0.15 } },            // creamer jauh lebih boros → perlu dicek
  5: { kasHilang: 5000 },                     // kembalian salah → selisih kas
  7: { takaranKurang: 0.08 },                 // takaran kurang dari resep → selisih positif
  9: { tidakDitutup: true },                  // crew lupa tutup shift
};
const HILANG_MALAM = { 5: { bubukCoklat: 500 } }; // ×10: 50 gr hilang antara tutup malam dan buka pagi (setelah shift ke-5)

export function buatDataDemo({ sekarang = new Date(), hari = 6, benih = 2026 } = {}) {
  const acak = acakBerbenih(benih);
  const pilih = (arr) => arr[Math.floor(acak() * arr.length)];
  const antara = (a, b) => a + Math.floor(acak() * (b - a + 1));

  const memori = penyimpananMemori();
  let jam = new Date(sekarang);
  const api = buatMockApi({ penyimpanan: memori, buatDataAwal: buatKatalog, jedaMs: [0, 0], sekarang: () => jam });
  const st = () => JSON.parse(memori.baca());
  const panggil = async (alamat, method, body, penggunaId) => (await api.panggil(alamat, { method, body, penggunaId })).data;

  // Hari pertama = `hari` hari sebelum hari ini (tanggal Jakarta).
  const hariIni = jamJakarta(sekarang, 0, 0);
  const mulai = new Date(hariIni.getTime() - hari * 86400000 + 7 * 3600000);

  // Stok fisik yang "sebenarnya" ada di dapur (×10). Sistem tidak tahu angka ini;
  // crew menghitungnya saat buka/tutup shift.
  const fisik = {
    creamer: 30000, gula: 250000, airThaiTea: 40000, airGreenTea: 30000, creamerCair: 20000, susuCair: 40000,
    bubukCoklat: 15000, bubukMatcha: 5000, bijiKopi: 20000, sirupAren: 7500, arenJelly: 20000, boba: 20000,
    oreo: 480, cup: 2000,
  };
  let kasLaci = 200000;
  const hitung = (ids) => Object.fromEntries(ids.map((id) => [id, Math.round(fisik[id] / 10)])); // dihitung per 1 satuan

  const urutanSatuanBeli = (b) => [...b.satuanBantu].sort((x, y) => y.konversi - x.konversi)[0];

  const jalankan = async () => {
    // Opname awal oleh owner, supaya semua bahan punya stok sistem.
    jam = jamJakarta(mulai, 0, 6, 30);
    await panggil('/opname', 'POST', { hitungan: hitung(Object.keys(fisik)) }, 'owner');

    const crew = ['rina', 'dimas', 'sari'];
    const jumlahShift = hari * 2 + 1; // + shift Pagi hari ini (dibiarkan terbuka)
    for (let i = 0; i < jumlahShift; i++) {
      const d = Math.floor(i / 2);
      const pagi = i % 2 === 0;
      const khusus = KHUSUS[i] ?? {};
      const oleh = pagi ? crew[d % 3] : crew[(d + 1) % 3];
      const kunci = st().bahan.filter((b) => b.bahanKunci && !b.arsip).map((b) => b.id);

      // Buka shift
      jam = jamJakarta(mulai, d, pagi ? 7 : 15, antara(0, 10));
      await panggil('/shift/buka', 'POST', { namaShift: pagi ? 'Pagi' : 'Sore', hitungan: hitung(kunci), kasAwal: kasLaci }, oleh);

      // Barang masuk jika fisik menipis
      const katalog = st();
      for (const b of katalog.bahan) {
        if (fisik[b.id] > b.batasMinimumX10 * 2) continue;
        const beli = urutanSatuanBeli(b);
        jam = new Date(jam.getTime() + 5 * 60000);
        if (khusus.salahInputGula && b.id === 'gula') continue; // ditangani di bawah
        await panggil('/barang-masuk', 'POST', { bahanId: b.id, jumlah: 1, satuan: beli.nama }, oleh);
        fisik[b.id] += beli.konversi * 10;
      }
      if (khusus.salahInputGula) {
        jam = new Date(jam.getTime() + 5 * 60000);
        const salah = await panggil('/barang-masuk', 'POST', { bahanId: 'gula', jumlah: 2, satuan: 'karung' }, oleh);
        fisik.gula += 250000; // yang datang sebenarnya 1 karung
        jam = new Date(jam.getTime() + 30 * 60000);
        await panggil('/barang-masuk', 'POST', { bahanId: 'gula', jumlah: -1, satuan: 'karung', koreksiDari: salah.id, alasan: 'Salah ketik, yang datang 1 karung' }, oleh);
      }

      // Pengeluaran kas sesekali
      if (acak() < 0.4) {
        jam = new Date(jam.getTime() + 10 * 60000);
        await panggil('/pengeluaran-kas', 'POST', { jumlah: 10000, keterangan: 'Beli es batu' }, oleh);
        kasLaci -= 10000;
      }

      // Penjualan
      const hariIniTerbuka = i === jumlahShift - 1;
      const jumlahTrx = hariIniTerbuka ? 6 : antara(14, 24);
      for (let t = 0; t < jumlahTrx; t++) {
        jam = new Date(jam.getTime() + antara(8, 18) * 60000);
        const menu = pilih(katalog.menu);
        const ukuran = pilih(menu.ukuran).nama;
        const toppingIds = menu.toppingIds.length && acak() < 0.4 ? [pilih(menu.toppingIds)] : [];
        const item = [{ menuId: menu.id, ukuran, toppingIds, qty: acak() < 0.2 ? 2 : 1 }];
        const total = item.reduce((a, it) => {
          const u = menu.ukuran.find((x) => x.nama === it.ukuran);
          const tp = it.toppingIds.reduce((s, tid) => s + katalog.topping.find((x) => x.id === tid).harga, 0);
          return a + (u.harga + tp) * it.qty;
        }, 0);
        const tunai = acak() < 0.6;
        const uang = Math.ceil(total / 5000) * 5000 + (acak() < 0.3 ? 5000 : 0);
        await panggil('/transaksi', 'POST', tunai ? { item, metodeBayar: 'tunai', uangDiterima: uang } : { item, metodeBayar: 'qris' }, oleh);
        if (tunai) kasLaci += total;

        // Pemakaian fisik = resep × faktor takaran crew (tidak pernah tepat).
        const trx = st().transaksi.at(-1);
        for (const [id, x10] of Object.entries(trx.pemakaian)) {
          let faktor = 1 + acak() * 0.04; // boros 0–4%, wajar
          if (khusus.boros?.[id]) faktor = 1 + khusus.boros[id];
          if (khusus.takaranKurang) faktor = 1 - khusus.takaranKurang;
          if (id === 'cup' || id === 'oreo') faktor = 1; // barang hitungan tidak meleset
          fisik[id] = Math.max(0, fisik[id] - Math.round(x10 * faktor));
        }
      }
      if (khusus.kasHilang) kasLaci -= khusus.kasHilang;
      if (hariIniTerbuka) break;

      // Tutup shift
      if (!khusus.tidakDitutup) {
        jam = new Date(jam.getTime() + 15 * 60000);
        await panggil('/shift/tutup', 'POST', { hitungan: hitung(kunci), kasAkhir: kasLaci }, oleh);
      }
      for (const [id, x10] of Object.entries(HILANG_MALAM[i] ?? {})) fisik[id] = Math.max(0, fisik[id] - x10);
    }
  };

  return jalankan().then(() => st());
}
