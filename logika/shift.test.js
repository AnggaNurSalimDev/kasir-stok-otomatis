import { describe, it, expect } from 'vitest';
import { keX10 } from './angka.js';
import { ErrorValidasi } from './galat.js';
import {
  jumlahkanPemakaian, statusToleransi, hitungSelisihShift,
  selisihSerahTerima, buatPenyesuaian, hitungKas, saranToleransi,
} from './shift.js';

const x = keX10; // singkatan: x(8) = 80

function galatDari(fn) {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new Error('Seharusnya melempar galat');
}

// ---------- pemakaian per shift ----------
describe('jumlahkanPemakaian', () => {
  it('menjumlahkan salinan pemakaian semua transaksi', () => {
    const hasil = jumlahkanPemakaian([{ pemakaian: { gula: 80 } }, { pemakaian: { gula: 80, cup: 10 } }]);
    expect(hasil).toEqual({ gula: 160, cup: 10 });
  });
  it('shift tanpa transaksi → kosong', () => {
    expect(jumlahkanPemakaian([])).toEqual({});
  });
  it('menolak transaksi tanpa salinan pemakaian', () => {
    expect(() => jumlahkanPemakaian([{}])).toThrow(TypeError);
  });
});

// ---------- toleransi ----------
describe('statusToleransi', () => {
  const t = (selisih, pakai, persen = 5, minimum = 8) =>
    statusToleransi({ selisihX10: x(selisih), pakaiX10: x(pakai), toleransiPersen: persen, toleransiMinimumX10: x(minimum) });

  it('contoh dokumen: creamer pakai 560, selisih −60 → batas 28, perlu dicek', () => {
    expect(t(-60, 560)).toEqual({ batasX10: x(28), status: 'perlu_dicek', arah: 'kurang' });
  });
  it('contoh dokumen: gula pakai 40, selisih −5 → batas minimum 8, wajar', () => {
    expect(t(-5, 40)).toEqual({ batasX10: x(8), status: 'wajar', arah: 'kurang' });
  });
  it('tepat di batas persen = wajar, 0,1 di atasnya = perlu dicek', () => {
    expect(t(-28, 560).status).toBe('wajar');
    expect(t(-28.1, 560).status).toBe('perlu_dicek');
  });
  it('tepat di batas minimum = wajar, 0,1 di atasnya = perlu dicek', () => {
    expect(t(-8, 40).status).toBe('wajar');
    expect(t(-8.1, 40).status).toBe('perlu_dicek');
  });
  it('selisih positif juga diperiksa', () => {
    expect(t(60, 560)).toMatchObject({ status: 'perlu_dicek', arah: 'lebih' });
  });
  it('shift tanpa pemakaian: hanya minimum yang berlaku', () => {
    expect(t(-8, 0).status).toBe('wajar');
    expect(t(-9, 0).status).toBe('perlu_dicek');
  });
  it('persen desimal (2,5%) dibandingkan tepat', () => {
    // 2,5% × 400 = 10
    expect(t(-10, 400, 2.5, 0).status).toBe('wajar');
    expect(t(-10.1, 400, 2.5, 0).status).toBe('perlu_dicek');
  });
  it('toleransi 0% dan minimum 0: hanya selisih 0 yang wajar (bahan pcs)', () => {
    expect(t(0, 10, 0, 0)).toMatchObject({ status: 'wajar', arah: 'pas' });
    expect(t(-1, 10, 0, 0).status).toBe('perlu_dicek');
  });
  it('menolak persen di luar 0–100 dan minimum negatif', () => {
    expect(() => t(0, 10, 101)).toThrow(ErrorValidasi);
    expect(() => t(0, 10, -1)).toThrow(ErrorValidasi);
    expect(() => statusToleransi({ selisihX10: 0, pakaiX10: 0, toleransiPersen: 5, toleransiMinimumX10: -1 })).toThrow(ErrorValidasi);
  });
});

// ---------- selisih shift ----------
describe('hitungSelisihShift', () => {
  const dasar = {
    bahanKunci: ['creamer', 'gula'],
    hitungAwal: { creamer: x(1200), gula: x(500) },
    hitungAkhir: { creamer: x(1580), gula: x(455) },
    masuk: { creamer: x(1000) },
    pemakaian: { creamer: x(560), gula: x(40) },
    toleransi: { creamer: { persen: 5, minimumX10: x(8) }, gula: { persen: 5, minimumX10: x(8) } },
  };

  it('contoh dokumen: creamer seharusnya 1640, selisih −60, perlu dicek', () => {
    const [creamer, gula] = hitungSelisihShift(dasar);
    expect(creamer).toMatchObject({ seharusnyaX10: x(1640), selisihX10: x(-60), status: 'perlu_dicek', sumberAkhir: 'tutup' });
    // gula: 500 + 0 − 40 = 460, akhir 455 → −5, wajar
    expect(gula).toMatchObject({ seharusnyaX10: x(460), selisihX10: x(-5), status: 'wajar' });
  });

  it('bahan kunci tanpa barang masuk dan tanpa penjualan', () => {
    const [r] = hitungSelisihShift({ ...dasar, bahanKunci: ['gula'], pemakaian: {}, hitungAkhir: { gula: x(500) } });
    expect(r).toMatchObject({ masukX10: 0, pakaiX10: 0, selisihX10: 0, status: 'wajar', arah: 'pas' });
  });

  it('masuk negatif (koreksi barang masuk) tetap dihitung', () => {
    // awal 500 + masuk −100 − pakai 40 = 360
    const [r] = hitungSelisihShift({ ...dasar, bahanKunci: ['gula'], masuk: { gula: x(-100) }, hitungAkhir: { gula: x(360) } });
    expect(r.selisihX10).toBe(0);
  });

  it('shift tidak ditutup: hitungan buka shift berikutnya dipakai, dan ditandai', () => {
    const [r] = hitungSelisihShift({ ...dasar, sumberAkhir: 'buka_berikutnya' });
    expect(r.sumberAkhir).toBe('buka_berikutnya');
  });

  describe('guard (A-11)', () => {
    it('bahan kunci belum dihitung → semua yang kurang dilaporkan', () => {
      const e = galatDari(() => hitungSelisihShift({ ...dasar, hitungAwal: { creamer: x(1200) }, hitungAkhir: {} }));
      expect(e.detail.map((d) => d.field)).toEqual(['hitungAkhir.creamer', 'hitungAwal.gula', 'hitungAkhir.gula']);
    });
    it('hitungan negatif atau bukan bilangan bulat ditolak', () => {
      expect(() => hitungSelisihShift({ ...dasar, hitungAkhir: { creamer: -1, gula: x(455) } })).toThrow(ErrorValidasi);
      expect(() => hitungSelisihShift({ ...dasar, hitungAkhir: { creamer: 1.5, gula: x(455) } })).toThrow(ErrorValidasi);
    });
    it('bahan kunci kosong atau dobel ditolak', () => {
      expect(() => hitungSelisihShift({ ...dasar, bahanKunci: [] })).toThrow(ErrorValidasi);
      expect(() => hitungSelisihShift({ ...dasar, bahanKunci: ['gula', 'gula'] })).toThrow(ErrorValidasi);
    });
    it('toleransi bahan belum ada', () => {
      const e = galatDari(() => hitungSelisihShift({ ...dasar, toleransi: { creamer: dasar.toleransi.creamer } }));
      expect(e.detail[0].field).toBe('toleransi.gula');
    });
    it('sumberAkhir asing ditolak', () => {
      expect(() => hitungSelisihShift({ ...dasar, sumberAkhir: 'tebak' })).toThrow(TypeError);
    });
  });
});

// ---------- serah terima ----------
describe('selisihSerahTerima', () => {
  it('hitung awal − hitung akhir shift sebelumnya', () => {
    expect(selisihSerahTerima({ creamer: x(1580) }, { creamer: x(1550) })).toEqual([
      { bahanId: 'creamer', akhirSebelumnyaX10: x(1580), awalX10: x(1550), selisihX10: x(-30) },
    ]);
  });
  it('shift sebelumnya tidak ditutup → selisih null, bukan 0', () => {
    expect(selisihSerahTerima(null, { creamer: x(1550) })[0].selisihX10).toBeNull();
  });
  it('bahan yang baru dijadikan bahan kunci → null', () => {
    expect(selisihSerahTerima({ creamer: x(1580) }, { gula: x(500) })[0].selisihX10).toBeNull();
  });
});

// ---------- penyesuaian stok (A-15) ----------
describe('buatPenyesuaian', () => {
  it('membuat entri hanya untuk bahan yang berbeda', () => {
    expect(buatPenyesuaian({ creamer: x(1640), gula: x(460) }, { creamer: x(1580), gula: x(460) })).toEqual([
      { bahanId: 'creamer', dariX10: x(1640), keX10: x(1580), perubahanX10: x(-60) },
    ]);
  });
  it('stok sistem minus disesuaikan ke hitungan fisik', () => {
    expect(buatPenyesuaian({ cup: x(-3) }, { cup: x(2) })).toEqual([{ bahanId: 'cup', dariX10: x(-3), keX10: x(2), perubahanX10: x(5) }]);
  });
  it('menolak hitungan negatif', () => {
    expect(() => buatPenyesuaian({}, { cup: -10 })).toThrow(ErrorValidasi);
  });
});

// ---------- kas ----------
describe('hitungKas', () => {
  const dasar = { kasAwal: 200000, penjualanTunai: 350000, pengeluaran: 15000, kasAkhir: 535000 };

  it('pas', () => {
    expect(hitungKas(dasar)).toEqual({ seharusnya: 535000, selisih: 0, status: 'wajar', arah: 'pas' });
  });
  it('kurang Rp 2.000 dengan toleransi 0 → perlu dicek', () => {
    expect(hitungKas({ ...dasar, kasAkhir: 533000 })).toMatchObject({ selisih: -2000, status: 'perlu_dicek', arah: 'kurang' });
  });
  it('kurang Rp 500 dengan toleransi Rp 500 → wajar', () => {
    expect(hitungKas({ ...dasar, kasAkhir: 534500, toleransiRupiah: 500 }).status).toBe('wajar');
  });
  it('menolak rupiah negatif atau pecahan', () => {
    expect(() => hitungKas({ ...dasar, kasAkhir: -1 })).toThrow(ErrorValidasi);
    expect(() => hitungKas({ ...dasar, pengeluaran: 1500.5 })).toThrow(ErrorValidasi);
  });
});

// ---------- saran toleransi ----------
describe('saranToleransi', () => {
  // selisih −1%, −2%, … −10% dari pemakaian 1000 gr
  const riwayat = Array.from({ length: 10 }, (_, i) => ({ pakaiX10: x(1000), selisihX10: x(-(i + 1) * 10) }));

  it('kurang dari 10 shift → null (belum ada saran)', () => {
    expect(saranToleransi(riwayat.slice(0, 9))).toBeNull();
  });
  it('10 shift → sebaran persen selisih', () => {
    expect(saranToleransi(riwayat)).toEqual({ jumlahShift: 10, p10: -10, median: -6, p90: -2 });
  });
  it('shift tanpa pemakaian tidak dihitung', () => {
    expect(saranToleransi([...riwayat.slice(0, 9), { pakaiX10: 0, selisihX10: 0 }])).toBeNull();
  });
});
