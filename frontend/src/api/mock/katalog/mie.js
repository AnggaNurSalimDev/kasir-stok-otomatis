// Warung mie (profil "Dapur Mie Rasa"). Contoh satuan yang bukan gram/ml:
//   ayam kecap dihitung per PORSI (dimasak sepanci, dibagi porsi), telur & bakso per BUTIR,
//   pangsit per LEMBAR, jeruk per BUAH, mie per GULUNG (satuan bantu dari gram).
// Semua angka contoh.
import { bahan, sb, r } from './bantu.js';

const dasarMie = [r('kuah', 1, 'centong'), r('sawi', 30, 'gr'), r('minyakBawang', 1, 'sdm'), r('kecap', 1, 'sdm'), r('daunBawang', 5, 'gr')];

export default {
  pengguna: [
    { id: 'owner', nama: 'Pak Harun (owner)', peran: 'owner' },
    { id: 'ujang', nama: 'Ujang', peran: 'crew' },
    { id: 'tini', nama: 'Tini', peran: 'crew' },
    { id: 'asep', nama: 'Asep', peran: 'crew' },
  ],
  bahan: [
    bahan('mie', 'Mie basah', 'gr', [sb('gulung', 100), sb('pak', 1000)], 1000, true),
    // Porsi diambil dengan sendok sayur dari panci: hitung fisiknya kira-kira, jadi minimum 1 porsi.
    bahan('ayam', 'Ayam kecap', 'porsi', [sb('panci', 40)], 10, true, 1),
    bahan('kuah', 'Kuah kaldu', 'ml', [sb('centong', 250), sb('panci', 10000)], 3000, true),
    bahan('sawi', 'Sawi hijau', 'gr', [sb('ikat', 250)], 250),
    bahan('telur', 'Telur rebus', 'butir', [sb('tray', 30)], 10, true),
    bahan('bakso', 'Bakso sapi', 'butir', [sb('pak', 50)], 20, true),
    bahan('pangsit', 'Pangsit goreng', 'lembar', [sb('pak', 50)], 20, true),
    bahan('minyakBawang', 'Minyak bawang', 'ml', [sb('sdm', 15), sb('botol', 600)], 150),
    bahan('kecap', 'Kecap manis', 'ml', [sb('sdm', 15), sb('botol', 600)], 150),
    bahan('daunBawang', 'Daun bawang', 'gr', [sb('ikat', 100)], 50),
    bahan('teh', 'Teh seduh', 'ml', [sb('gelas', 250), sb('teko', 3000)], 1000),
    bahan('gula', 'Gula pasir', 'gr', [sb('sdt', 8), sb('karung', 25000)], 2000),
    bahan('jeruk', 'Jeruk peras', 'buah', [sb('kg', 8)], 8),
  ],
  menu: [
    {
      id: 'mieAyam', nama: 'Mie Ayam', kategori: 'Mie', toppingIds: ['tpTelur', 'tpBakso', 'tpPangsit', 'tpMie'],
      ukuran: [
        { nama: 'Biasa', harga: 15000, resep: [r('mie', 1, 'gulung'), r('ayam', 1, 'porsi'), ...dasarMie] },
        { nama: 'Jumbo', harga: 20000, resep: [r('mie', 1.5, 'gulung'), r('ayam', 1.5, 'porsi'), ...dasarMie] },
      ],
    },
    {
      id: 'mieBakso', nama: 'Mie Ayam Bakso', kategori: 'Mie', toppingIds: ['tpTelur', 'tpPangsit'],
      ukuran: [
        { nama: 'Biasa', harga: 20000, resep: [r('mie', 1, 'gulung'), r('ayam', 1, 'porsi'), r('bakso', 4, 'butir'), ...dasarMie] },
        { nama: 'Jumbo', harga: 26000, resep: [r('mie', 1.5, 'gulung'), r('ayam', 1.5, 'porsi'), r('bakso', 5, 'butir'), ...dasarMie] },
      ],
    },
    {
      id: 'mieKomplit', nama: 'Mie Ayam Komplit', kategori: 'Mie', toppingIds: ['tpMie'],
      ukuran: [{ nama: 'Biasa', harga: 27000, resep: [r('mie', 1, 'gulung'), r('ayam', 1, 'porsi'), r('bakso', 3, 'butir'), r('pangsit', 2, 'lembar'), r('telur', 1, 'butir'), ...dasarMie] }],
    },
    {
      id: 'baksoKuah', nama: 'Bakso Kuah', kategori: 'Mie', toppingIds: ['tpTelur', 'tpPangsit'],
      ukuran: [{ nama: 'Biasa', harga: 18000, resep: [r('bakso', 6, 'butir'), r('kuah', 1, 'centong'), r('sawi', 20, 'gr'), r('daunBawang', 5, 'gr')] }],
    },
    { id: 'esTeh', nama: 'Es Teh Manis', kategori: 'Minuman', toppingIds: [], ukuran: [{ nama: 'Gelas', harga: 5000, resep: [r('teh', 1, 'gelas'), r('gula', 2, 'sdt')] }] },
    { id: 'tehHangat', nama: 'Teh Hangat', kategori: 'Minuman', toppingIds: [], ukuran: [{ nama: 'Gelas', harga: 4000, resep: [r('teh', 1, 'gelas'), r('gula', 1.5, 'sdt')] }] },
    { id: 'esJeruk', nama: 'Es Jeruk', kategori: 'Minuman', toppingIds: [], ukuran: [{ nama: 'Gelas', harga: 8000, resep: [r('jeruk', 2, 'buah'), r('gula', 1, 'sdt')] }] },
  ],
  topping: [
    { id: 'tpTelur', nama: 'Telur', harga: 4000, resep: [r('telur', 1, 'butir')] },
    { id: 'tpBakso', nama: 'Bakso (3)', harga: 6000, resep: [r('bakso', 3, 'butir')] },
    { id: 'tpPangsit', nama: 'Pangsit (3)', harga: 4000, resep: [r('pangsit', 3, 'lembar')] },
    { id: 'tpMie', nama: 'Extra Mie', harga: 5000, resep: [r('mie', 1, 'gulung')] },
  ],
  fisikAwal: {
    mie: 5000, ayam: 40, kuah: 10000, sawi: 1000, telur: 30, bakso: 100, pangsit: 50, minyakBawang: 600, kecap: 600,
    daunBawang: 200, teh: 6000, gula: 10000, jeruk: 24,
  },
  kejadian: {
    boros: 'mie',
    salahInput: { bahanId: 'telur', satuan: 'tray', alasan: 'Yang datang 1 tray, bukan 2' },
    hilangMalam: { bahanId: 'bakso', jumlah: 5 },
  },
};
