// Kedai thai tea (profil "Teh Senja"). Semua angka contoh, bukan ukuran asli usaha mana pun.
import { bahan, sb, r } from './bantu.js';

const cup = r('cup', 1, 'pcs');

export default {
  pengguna: [
    { id: 'owner', nama: 'Pak Budi (owner)', peran: 'owner' },
    { id: 'rina', nama: 'Rina', peran: 'crew' },
    { id: 'dimas', nama: 'Dimas', peran: 'crew' },
    { id: 'sari', nama: 'Sari', peran: 'crew' },
  ],
  bahan: [
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
    bahan('oreo', 'Biskuit oreo', 'keping', [sb('bungkus', 12)], 24),
    bahan('cup', 'Cup', 'pcs', [sb('slop', 50)], 50, true),
  ],
  menu: [
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
  ],
  topping: [
    { id: 'tpArenJelly', nama: 'Aren Jelly', harga: 3000, resep: [r('arenJelly', 50, 'gr')] },
    { id: 'tpBoba', nama: 'Boba', harga: 3000, resep: [r('boba', 1, 'sendok sayur')] },
    { id: 'tpExtraCreamer', nama: 'Extra Creamer', harga: 2000, resep: [r('creamer', 0.5, 'sendok')] },
    { id: 'tpExtraShot', nama: 'Extra Shot', harga: 5000, resep: [r('bijiKopi', 1, 'shot')] },
    { id: 'tpOreo', nama: 'Oreo Crumble', harga: 4000, resep: [r('oreo', 2, 'keping')] },
  ],
  // Stok fisik awal (satuan dasar).
  fisikAwal: {
    creamer: 3000, gula: 25000, airThaiTea: 4000, airGreenTea: 3000, creamerCair: 2000, susuCair: 4000,
    bubukCoklat: 1500, bubukMatcha: 500, bijiKopi: 2000, sirupAren: 750, arenJelly: 2000, boba: 2000, oreo: 48, cup: 200,
  },
  // Bahan yang dipakai kejadian khusus di data demo.
  kejadian: {
    boros: 'creamer',
    salahInput: { bahanId: 'gula', satuan: 'karung', alasan: 'Salah ketik, yang datang 1 karung' },
    hilangMalam: { bahanId: 'bubukCoklat', jumlah: 50 },
  },
};
