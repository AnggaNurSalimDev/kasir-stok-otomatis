import { describe, it, expect } from 'vitest';
import { MenuBody, BahanBody, keDetail } from './index.js';

describe('keDetail', () => {
  it('path ditulis seperti logika/: ukuran[0].resep[0].jumlah', () => {
    const r = MenuBody.safeParse({ nama: 'X', kategori: 'Y', ukuran: [{ nama: 'R', harga: 1, resep: [{ bahanId: 'a', jumlah: 0, satuan: 'gr' }] }] });
    expect(keDetail(r.error)).toEqual([{ field: 'ukuran[0].resep[0].jumlah', pesan: 'Wajib lebih dari 0' }]);
  });
  it('field asing ditolak (strict)', () => {
    const r = BahanBody.safeParse({ nama: 'Gula', satuanDasar: 'gr', stok: 100 });
    expect(r.success).toBe(false);
  });
  it('default terisi', () => {
    expect(BahanBody.parse({ nama: 'Gula', satuanDasar: 'gr' })).toEqual({
      nama: 'Gula', satuanDasar: 'gr', satuanBantu: [], batasMinimum: 0, bahanKunci: false, toleransiPersen: 5,
    });
  });
});
