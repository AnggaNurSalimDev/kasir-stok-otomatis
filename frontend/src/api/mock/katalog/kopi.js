// Kedai kopi (profil "Kopi Lintas"). Ukuran bebas nama: Panas / Dingin memakai cup berbeda.
// Croissant dijual per pcs (barang jadi), bukan diracik. Semua angka contoh.
import { bahan, sb, r } from './bantu.js';

const panas = r('cupPanas', 1, 'pcs');
const dingin = r('cupDingin', 1, 'pcs');

export default {
  pengguna: [
    { id: 'owner', nama: 'Bu Laras (owner)', peran: 'owner' },
    { id: 'yoga', nama: 'Yoga', peran: 'crew' },
    { id: 'nadia', nama: 'Nadia', peran: 'crew' },
    { id: 'bima', nama: 'Bima', peran: 'crew' },
  ],
  bahan: [
    bahan('bijiKopi', 'Biji kopi', 'gr', [sb('shot', 18), sb('bungkus', 1000)], 400, true),
    bahan('susuCair', 'Susu cair', 'ml', [sb('kotak', 1000)], 2000, true),
    bahan('sirupAren', 'Sirup gula aren', 'ml', [sb('pump', 10), sb('botol', 750)], 300),
    bahan('sirupVanila', 'Sirup vanila', 'ml', [sb('pump', 10), sb('botol', 750)], 200),
    bahan('sirupKaramel', 'Sirup karamel', 'ml', [sb('pump', 10), sb('botol', 750)], 200),
    bahan('bubukCoklat', 'Bubuk coklat', 'gr', [sb('sendok', 10), sb('bungkus', 1000)], 300, true),
    bahan('skm', 'Susu kental manis', 'gr', [sb('sdm', 20), sb('kaleng', 370)], 370),
    bahan('croissant', 'Croissant', 'pcs', [sb('box', 12)], 6, true),
    bahan('cupPanas', 'Cup panas', 'pcs', [sb('slop', 50)], 50, true),
    bahan('cupDingin', 'Cup dingin', 'pcs', [sb('slop', 50)], 50, true),
  ],
  menu: [
    { id: 'espresso', nama: 'Espresso', kategori: 'Kopi', toppingIds: ['tpExtraShot'], ukuran: [{ nama: 'Panas', harga: 15000, resep: [r('bijiKopi', 1, 'shot'), panas] }] },
    {
      id: 'americano', nama: 'Americano', kategori: 'Kopi', toppingIds: ['tpExtraShot'],
      ukuran: [
        { nama: 'Panas', harga: 18000, resep: [r('bijiKopi', 1, 'shot'), panas] },
        { nama: 'Dingin', harga: 20000, resep: [r('bijiKopi', 2, 'shot'), dingin] },
      ],
    },
    {
      id: 'kopiSusu', nama: 'Kopi Susu', kategori: 'Kopi', toppingIds: ['tpExtraShot', 'tpKaramel'],
      ukuran: [
        { nama: 'Panas', harga: 20000, resep: [r('bijiKopi', 1, 'shot'), r('susuCair', 150, 'ml'), r('skm', 1, 'sdm'), panas] },
        { nama: 'Dingin', harga: 22000, resep: [r('bijiKopi', 2, 'shot'), r('susuCair', 180, 'ml'), r('skm', 1, 'sdm'), dingin] },
      ],
    },
    {
      id: 'kopiAren', nama: 'Kopi Susu Aren', kategori: 'Kopi', toppingIds: ['tpExtraShot'],
      ukuran: [{ nama: 'Dingin', harga: 24000, resep: [r('bijiKopi', 2, 'shot'), r('susuCair', 180, 'ml'), r('sirupAren', 3, 'pump'), dingin] }],
    },
    {
      id: 'cappuccino', nama: 'Cappuccino', kategori: 'Kopi', toppingIds: ['tpExtraShot', 'tpVanila'],
      ukuran: [{ nama: 'Panas', harga: 24000, resep: [r('bijiKopi', 1, 'shot'), r('susuCair', 150, 'ml'), panas] }],
    },
    {
      id: 'latteVanila', nama: 'Latte Vanila', kategori: 'Kopi', toppingIds: ['tpExtraShot'],
      ukuran: [
        { nama: 'Panas', harga: 26000, resep: [r('bijiKopi', 1, 'shot'), r('susuCair', 200, 'ml'), r('sirupVanila', 2, 'pump'), panas] },
        { nama: 'Dingin', harga: 28000, resep: [r('bijiKopi', 2, 'shot'), r('susuCair', 200, 'ml'), r('sirupVanila', 3, 'pump'), dingin] },
      ],
    },
    {
      id: 'coklat', nama: 'Coklat', kategori: 'Non-kopi', toppingIds: ['tpKaramel'],
      ukuran: [
        { nama: 'Panas', harga: 22000, resep: [r('bubukCoklat', 3, 'sendok'), r('susuCair', 200, 'ml'), panas] },
        { nama: 'Dingin', harga: 24000, resep: [r('bubukCoklat', 3, 'sendok'), r('susuCair', 200, 'ml'), dingin] },
      ],
    },
    { id: 'croissant', nama: 'Croissant Butter', kategori: 'Pastry', toppingIds: [], ukuran: [{ nama: 'Pcs', harga: 22000, resep: [r('croissant', 1, 'pcs')] }] },
  ],
  topping: [
    { id: 'tpExtraShot', nama: 'Extra Shot', harga: 6000, resep: [r('bijiKopi', 1, 'shot')] },
    { id: 'tpKaramel', nama: 'Sirup Karamel', harga: 4000, resep: [r('sirupKaramel', 2, 'pump')] },
    { id: 'tpVanila', nama: 'Sirup Vanila', harga: 4000, resep: [r('sirupVanila', 2, 'pump')] },
  ],
  // Paket promo khusus aplikasi (harga di aplikasi dibuat saat katalog disiapkan).
  paket: [
    { id: 'ngopiBerdua', nama: 'Paket Ngopi Berdua', isi: [{ menuId: 'kopiSusu', ukuran: 'Dingin', qty: 2 }, { menuId: 'croissant', ukuran: 'Pcs', qty: 1 }] },
  ],
  fisikAwal: {
    bijiKopi: 3000, susuCair: 8000, sirupAren: 750, sirupVanila: 750, sirupKaramel: 750, bubukCoklat: 1000, skm: 740,
    croissant: 24, cupPanas: 150, cupDingin: 150,
  },
  kejadian: {
    boros: 'susuCair',
    salahInput: { bahanId: 'susuCair', satuan: 'kotak', alasan: 'Salah hitung karton, yang datang 1 kotak' },
    hilangMalam: { bahanId: 'croissant', jumlah: 2 },
  },
};
