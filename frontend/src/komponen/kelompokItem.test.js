import { describe, it, expect } from 'vitest';
import { kelompokkanItem } from './kelompokItem.js';

describe('kelompokkanItem', () => {
  it('isi paket digabung jadi satu baris; subtotal dijumlah; menu biasa tetap', () => {
    const k = { ke: 0, nama: 'Paket Berdua', qty: 2, jenis: 'paket' };
    const hasil = kelompokkanItem([
      { nama: 'Thai Tea', subtotal: 13455, kelompok: k },
      { nama: 'Kopi Susu', subtotal: 17045, kelompok: k },
      { nama: 'Americano', subtotal: 16500 },
    ]);
    expect(hasil.map((h) => h.jenis)).toEqual(['kelompok', 'menu']);
    expect(hasil[0]).toMatchObject({ nama: 'Paket Berdua', qty: 2, subtotal: 30500 });
    expect(hasil[0].isi).toHaveLength(2);
  });
  it('dua baris berbeda dengan nama sama tetap terpisah (beda ke)', () => {
    const hasil = kelompokkanItem([
      { nama: 'A', subtotal: 1, kelompok: { ke: 0, nama: 'P', qty: 1 } },
      { nama: 'A', subtotal: 1, kelompok: { ke: 1, nama: 'P', qty: 1 } },
    ]);
    expect(hasil).toHaveLength(2);
  });
  it('bukan daftar ditolak', () => expect(() => kelompokkanItem(null)).toThrow());
});
