import { describe, it, expect } from 'vitest';
import { hargaDi, perkiraanKomisi, cocokkanItem, kodeMenu } from './saluran.js';

const ukuran = { nama: 'Regular', harga: 12000, hargaSaluran: { gofood: 14500 } };

describe('hargaDi', () => {
  it('toko = harga; saluran terisi = harganya; kosong = harga toko', () => {
    expect(hargaDi(ukuran, 'toko')).toBe(12000);
    expect(hargaDi(ukuran, 'gofood')).toBe(14500);
    expect(hargaDi(ukuran, 'shopeefood')).toBe(12000);
    expect(hargaDi({ harga: 5000 }, 'grabfood')).toBe(5000);
  });
  it('saluran asing dan harga tidak bulat ditolak', () => {
    expect(() => hargaDi(ukuran, 'tokopedia')).toThrow();
    expect(() => hargaDi({ harga: 1.5 }, 'toko')).toThrow();
  });
});

describe('perkiraanKomisi', () => {
  it('dibulatkan ke rupiah; batas persen dijaga', () => {
    expect(perkiraanKomisi(14500, 20)).toBe(2900);
    expect(perkiraanKomisi(10001, 20)).toBe(2000);
    expect(() => perkiraanKomisi(100, 120)).toThrow();
    expect(() => perkiraanKomisi(-1, 20)).toThrow();
  });
});

describe('cocokkanItem', () => {
  const menu = { id: 'thaiTea', ukuran: [{ nama: 'Regular' }, { nama: 'Large' }], toppingIds: ['boba'] };
  const indeks = { menuById: new Map([['thaiTea', menu]]), toppingById: new Map([['boba', {}], ['oreo', {}]]) };
  it('kode sinkron "menuId:ukuran" langsung dikenali', () => {
    expect(cocokkanItem({ kode: kodeMenu('thaiTea', 'Large'), topping: [{ kode: 'boba', nama: 'Boba' }] }, indeks))
      .toEqual({ menuId: 'thaiTea', ukuran: 'Large', kali: 1, toppingIds: ['boba'] });
  });
  it('kode asing butuh pemetaan; pemetaan bisa berisi kelipatan (paket)', () => {
    expect(cocokkanItem({ kode: 'PAKET' }, indeks).masalah).toBeTruthy();
    expect(cocokkanItem({ kode: 'PAKET' }, { ...indeks, pemetaan: { PAKET: { menuId: 'thaiTea', ukuran: 'Regular', kali: 2 } } }))
      .toMatchObject({ menuId: 'thaiTea', kali: 2 });
  });
  it('ukuran tidak ada, topping tidak diizinkan, atau pemetaan basi → masalah, bukan tebakan', () => {
    expect(cocokkanItem({ kode: 'thaiTea:Jumbo' }, indeks).masalah).toBeTruthy();
    expect(cocokkanItem({ kode: 'thaiTea:Regular', topping: [{ kode: 'oreo', nama: 'Oreo' }] }, indeks).masalah).toMatch(/Oreo/);
    expect(cocokkanItem({ kode: 'X' }, { ...indeks, pemetaan: { X: { menuId: 'hilang', ukuran: 'Regular' } } }).masalah).toMatch(/sudah tidak ada/);
  });
});
