import { describe, it, expect } from 'vitest';
import { keX10, dariX10, kaliX10 } from './angka.js';
import { validasiBahan, konversiResep } from './resep.js';
import { hitungPemakaian, cekStokMinus } from './pemakaian.js';
import { ErrorValidasi } from './galat.js';

// ---------- data contoh (angka contoh, bukan ukuran asli) ----------
const bahan = [
  { id: 'creamer', nama: 'Creamer bubuk', satuanDasar: 'gr', satuanBantu: [{ nama: 'sendok', konversi: 8 }, { nama: 'kaleng', konversi: 1000 }] },
  { id: 'gula', nama: 'Gula pasir', satuanDasar: 'gr', satuanBantu: [{ nama: 'sdt', konversi: 8 }, { nama: 'karung', konversi: 25000 }] },
  { id: 'airThaiTea', nama: 'Air thai tea', satuanDasar: 'ml', satuanBantu: [{ nama: 'garis bawah', konversi: 150 }, { nama: 'garis atas', konversi: 220 }, { nama: 'teko', konversi: 2000 }] },
  { id: 'creamerCair', nama: 'Creamer cair', satuanDasar: 'ml', satuanBantu: [] },
  { id: 'arenJelly', nama: 'Aren jelly', satuanDasar: 'gr', satuanBantu: [] },
  { id: 'cup', nama: 'Cup', satuanDasar: 'pcs', satuanBantu: [] },
];

const thaiTea = {
  id: 'thaiTea',
  nama: 'Thai Tea',
  toppingIds: ['arenJelly', 'extraCreamer'],
  ukuran: [
    {
      nama: 'Regular', harga: 12000,
      resep: [
        { bahanId: 'creamer', jumlah: 1, satuan: 'sendok' },
        { bahanId: 'gula', jumlah: 1, satuan: 'sdt' },
        { bahanId: 'airThaiTea', jumlah: 1, satuan: 'garis bawah' },
        { bahanId: 'creamerCair', jumlah: 20, satuan: 'ml' },
        { bahanId: 'cup', jumlah: 1, satuan: 'pcs' },
      ],
    },
    {
      nama: 'Large', harga: 15000,
      resep: [
        { bahanId: 'creamer', jumlah: 1.5, satuan: 'sendok' },
        { bahanId: 'gula', jumlah: 1, satuan: 'sdt' }, // gula tidak ikut membesar
        { bahanId: 'airThaiTea', jumlah: 1, satuan: 'garis atas' },
        { bahanId: 'creamerCair', jumlah: 30, satuan: 'ml' },
        { bahanId: 'cup', jumlah: 1, satuan: 'pcs' },
      ],
    },
  ],
};

const topping = [
  { id: 'arenJelly', nama: 'Aren Jelly', harga: 3000, resep: [{ bahanId: 'arenJelly', jumlah: 50, satuan: 'gr' }] },
  { id: 'extraCreamer', nama: 'Extra Creamer', harga: 2000, resep: [{ bahanId: 'creamer', jumlah: 0.5, satuan: 'sendok' }] },
  { id: 'boba', nama: 'Boba', harga: 3000, resep: [{ bahanId: 'arenJelly', jumlah: 1, satuan: 'gr' }] },
];

const katalog = { bahan, menu: [thaiTea], topping };
const bahanById = new Map(bahan.map((b) => [b.id, b]));

// Mengubah hasil ×10 ke angka biasa supaya test mudah dibaca.
const biasa = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, dariX10(v)]));

function galatDari(fn) {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new Error('Seharusnya melempar galat');
}

// ---------- angka ----------
describe('angka ×10', () => {
  it('menghindari galat pecahan 0.1 + 0.2', () => {
    expect(dariX10(keX10(0.1) + keX10(0.2))).toBe(0.3);
  });
  it('menolak angka lebih halus dari 0,1', () => {
    expect(() => keX10(0.15)).toThrow(ErrorValidasi);
  });
  it('menolak NaN dan Infinity', () => {
    expect(() => keX10(NaN)).toThrow(ErrorValidasi);
    expect(() => keX10(Infinity)).toThrow(ErrorValidasi);
  });
  it('kaliX10 menolak hasil lebih halus dari 0,1', () => {
    expect(kaliX10(5, 80)).toBe(40); // 0,5 × 8 = 4
    expect(() => kaliX10(5, 3)).toThrow(ErrorValidasi); // 0,5 × 0,3 = 0,15
  });
});

// ---------- bahan (A-01) ----------
describe('validasiBahan', () => {
  it('menerima bahan contoh', () => {
    bahan.forEach((b) => expect(() => validasiBahan(b)).not.toThrow());
  });
  it('menolak konversi 0 atau negatif', () => {
    const e = galatDari(() => validasiBahan({ id: 'x', nama: 'X', satuanDasar: 'gr', satuanBantu: [{ nama: 'sendok', konversi: 0 }] }));
    expect(e.detail[0].field).toBe('satuanBantu[0].konversi');
  });
  it('menolak satuan bantu tanpa konversi', () => {
    expect(() => validasiBahan({ id: 'x', nama: 'X', satuanDasar: 'gr', satuanBantu: [{ nama: 'sendok' }] })).toThrow(ErrorValidasi);
  });
  it('menolak nama satuan bantu dobel (tanpa membedakan huruf besar)', () => {
    const e = galatDari(() =>
      validasiBahan({ id: 'x', nama: 'X', satuanDasar: 'gr', satuanBantu: [{ nama: 'Sendok', konversi: 8 }, { nama: 'sendok ', konversi: 9 }] }),
    );
    expect(e.detail[0].pesan).toMatch(/sudah dipakai/);
  });
  it('menolak satuan bantu yang sama dengan satuan dasar', () => {
    expect(() => validasiBahan({ id: 'x', nama: 'X', satuanDasar: 'gr', satuanBantu: [{ nama: 'GR', konversi: 1 }] })).toThrow(ErrorValidasi);
  });
});

// ---------- resep (A-03, A-04) ----------
describe('konversiResep', () => {
  it('mengubah satuan bantu ke satuan dasar ×10', () => {
    expect(konversiResep([{ bahanId: 'creamer', jumlah: 1, satuan: 'sendok' }], bahanById)).toEqual([{ bahanId: 'creamer', jumlahX10: 80 }]);
  });
  it('satuan dasar dipakai langsung', () => {
    expect(konversiResep([{ bahanId: 'creamerCair', jumlah: 20, satuan: 'ml' }], bahanById)).toEqual([{ bahanId: 'creamerCair', jumlahX10: 200 }]);
  });
  it('menolak resep kosong', () => {
    expect(() => konversiResep([], bahanById)).toThrow(ErrorValidasi);
  });
  it('menolak satuan yang bukan milik bahan itu', () => {
    const e = galatDari(() => konversiResep([{ bahanId: 'creamerCair', jumlah: 1, satuan: 'sendok' }], bahanById));
    expect(e.detail[0].pesan).toMatch(/tidak dikenal/);
  });
  it('menolak bahan yang sama dua kali dalam satu resep', () => {
    const e = galatDari(() =>
      konversiResep([{ bahanId: 'gula', jumlah: 1, satuan: 'sdt' }, { bahanId: 'gula', jumlah: 5, satuan: 'gr' }], bahanById),
    );
    expect(e.detail[0].pesan).toMatch(/lebih dari sekali/);
  });
  it('menolak jumlah 0 dan bahan yang tidak ada, sekaligus', () => {
    const e = galatDari(() =>
      konversiResep([{ bahanId: 'gula', jumlah: 0, satuan: 'sdt' }, { bahanId: 'garam', jumlah: 1, satuan: 'gr' }], bahanById),
    );
    expect(e.detail).toHaveLength(2);
  });
});

// ---------- hitung pemakaian ----------
describe('hitungPemakaian', () => {
  it('contoh dokumen: 2 × Thai Tea Regular + Aren Jelly', () => {
    const hasil = hitungPemakaian([{ menuId: 'thaiTea', ukuran: 'Regular', toppingIds: ['arenJelly'], qty: 2 }], katalog);
    expect(biasa(hasil)).toEqual({ creamer: 16, gula: 16, airThaiTea: 300, creamerCair: 40, cup: 2, arenJelly: 100 });
  });

  it('Large memakai resepnya sendiri, bukan dikali faktor', () => {
    const hasil = hitungPemakaian([{ menuId: 'thaiTea', ukuran: 'Large', qty: 1 }], katalog);
    expect(biasa(hasil)).toEqual({ creamer: 12, gula: 8, airThaiTea: 220, creamerCair: 30, cup: 1 });
  });

  it('bahan yang sama dari menu dan topping dijumlahkan', () => {
    // creamer: 1 sendok (8 gr) + extra 0,5 sendok (4 gr) = 12 gr per gelas, ×3 = 36 gr
    const hasil = hitungPemakaian([{ menuId: 'thaiTea', ukuran: 'Regular', toppingIds: ['extraCreamer'], qty: 3 }], katalog);
    expect(dariX10(hasil.creamer)).toBe(36);
  });

  it('beberapa baris keranjang dijumlahkan per bahan', () => {
    const hasil = hitungPemakaian(
      [
        { menuId: 'thaiTea', ukuran: 'Regular', qty: 1 },
        { menuId: 'thaiTea', ukuran: 'Large', toppingIds: ['arenJelly'], qty: 1 },
      ],
      katalog,
    );
    expect(biasa(hasil)).toEqual({ creamer: 20, gula: 16, airThaiTea: 370, creamerCair: 50, cup: 2, arenJelly: 50 });
  });

  it('hasil selalu bilangan bulat ×10 (tidak ada sisa pecahan)', () => {
    const hasil = hitungPemakaian([{ menuId: 'thaiTea', ukuran: 'Large', toppingIds: ['extraCreamer'], qty: 7 }], katalog);
    Object.values(hasil).forEach((v) => expect(Number.isInteger(v)).toBe(true));
    expect(dariX10(hasil.creamer)).toBe(112); // (12 + 4) × 7
  });

  describe('guard', () => {
    it('keranjang kosong', () => {
      expect(() => hitungPemakaian([], katalog)).toThrow(/Keranjang/);
    });
    it('qty 0, negatif, dan pecahan ditolak', () => {
      for (const qty of [0, -1, 1.5, '2']) {
        expect(() => hitungPemakaian([{ menuId: 'thaiTea', ukuran: 'Regular', qty }], katalog)).toThrow(ErrorValidasi);
      }
    });
    it('menu atau ukuran tidak ada', () => {
      expect(() => hitungPemakaian([{ menuId: 'kopi', ukuran: 'Regular', qty: 1 }], katalog)).toThrow(ErrorValidasi);
      expect(() => hitungPemakaian([{ menuId: 'thaiTea', ukuran: 'Jumbo', qty: 1 }], katalog)).toThrow(ErrorValidasi);
    });
    it('topping tidak diizinkan untuk menu itu', () => {
      const e = galatDari(() => hitungPemakaian([{ menuId: 'thaiTea', ukuran: 'Regular', toppingIds: ['boba'], qty: 1 }], katalog));
      expect(e.detail[0].pesan).toMatch(/tidak tersedia/);
    });
    it('topping dobel ditolak', () => {
      expect(() =>
        hitungPemakaian([{ menuId: 'thaiTea', ukuran: 'Regular', toppingIds: ['arenJelly', 'arenJelly'], qty: 1 }], katalog),
      ).toThrow(ErrorValidasi);
    });
    it('semua masalah dilaporkan sekaligus, dengan field yang menunjuk barisnya', () => {
      const e = galatDari(() =>
        hitungPemakaian(
          [
            { menuId: 'thaiTea', ukuran: 'Regular', qty: 0 },
            { menuId: 'kopi', ukuran: 'Regular', qty: 1 },
          ],
          katalog,
        ),
      );
      expect(e.detail.map((d) => d.field)).toEqual(['keranjang[0].qty', 'keranjang[1].menuId']);
    });
    it('resep menu yang rusak tetap ketahuan saat menghitung', () => {
      const rusak = { ...thaiTea, ukuran: [{ nama: 'Regular', harga: 1, resep: [{ bahanId: 'creamer', jumlah: 1, satuan: 'gelas' }] }] };
      const e = galatDari(() => hitungPemakaian([{ menuId: 'thaiTea', ukuran: 'Regular', qty: 1 }], { ...katalog, menu: [rusak] }));
      expect(e.message).toBe('Thai Tea Regular tidak valid');
      expect(e.detail[0].pesan).toMatch(/Satuan "gelas" tidak dikenal/);
    });
  });
});

// ---------- stok minus (A-08) ----------
describe('cekStokMinus', () => {
  it('menandai bahan yang akan minus, tidak memblokir', () => {
    const pemakaian = hitungPemakaian([{ menuId: 'thaiTea', ukuran: 'Regular', qty: 2 }], katalog);
    const stok = { creamer: keX10(10), gula: keX10(500), airThaiTea: keX10(2000), creamerCair: keX10(1000), cup: keX10(50) };
    expect(cekStokMinus(stok, pemakaian)).toEqual([{ bahanId: 'creamer', stokX10: 100, sesudahX10: -60 }]);
  });
  it('stok tepat habis bukan minus', () => {
    expect(cekStokMinus({ gula: 160 }, { gula: 160 })).toEqual([]);
  });
  it('bahan yang belum punya catatan stok dianggap 0', () => {
    expect(cekStokMinus({}, { cup: 10 })).toEqual([{ bahanId: 'cup', stokX10: 0, sesudahX10: -10 }]);
  });
});
