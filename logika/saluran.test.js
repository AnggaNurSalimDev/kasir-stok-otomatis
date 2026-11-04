import { describe, it, expect } from 'vitest';
import { hargaDi, perkiraanKomisi, cocokkanItem, kodeMenu, bagiHarga, hargaImpas, hargaNaik } from './saluran.js';

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
      .toEqual({ isi: [{ menuId: 'thaiTea', ukuran: 'Large', qty: 1, toppingIds: ['boba'] }] });
  });
  it('kode asing butuh pemetaan; paket bisa berisi beberapa menu; bentuk lama { kali } tetap terbaca', () => {
    const menuById = new Map([...indeks.menuById, ['kopi', { id: 'kopi', ukuran: [{ nama: 'Regular' }], toppingIds: [] }]]);
    expect(cocokkanItem({ kode: 'PAKET' }, indeks).masalah).toBeTruthy();
    const isi = [{ menuId: 'thaiTea', ukuran: 'Regular', qty: 1 }, { menuId: 'kopi', ukuran: 'Regular', qty: 1 }];
    expect(cocokkanItem({ kode: 'PAKET' }, { ...indeks, menuById, pemetaan: { PAKET: { isi } } }).isi.map((k) => k.menuId)).toEqual(['thaiTea', 'kopi']);
    expect(cocokkanItem({ kode: 'PAKET' }, { ...indeks, pemetaan: { PAKET: { menuId: 'thaiTea', ukuran: 'Regular', kali: 2 } } }).isi)
      .toEqual([{ menuId: 'thaiTea', ukuran: 'Regular', qty: 2, toppingIds: [] }]);
  });
  it('ukuran tidak ada, topping tidak diizinkan, atau pemetaan basi → masalah, bukan tebakan', () => {
    expect(cocokkanItem({ kode: 'thaiTea:Jumbo' }, indeks).masalah).toBeTruthy();
    expect(cocokkanItem({ kode: 'thaiTea:Regular', topping: [{ kode: 'oreo', nama: 'Oreo' }] }, indeks).masalah).toMatch(/Oreo/);
    expect(cocokkanItem({ kode: 'X' }, { ...indeks, pemetaan: { X: { menuId: 'hilang', ukuran: 'Regular' } } }).masalah).toMatch(/sudah tidak ada/);
  });
});

describe('bagiHarga', () => {
  it('sebanding bobot, jumlah tetap persis', () => {
    expect(bagiHarga(30000, [14000, 16000])).toEqual([14000, 16000]);
    expect(bagiHarga(25000, [1, 1])).toEqual([12500, 12500]);
    const h = bagiHarga(10001, [1, 1, 1]);
    expect(h.reduce((a, b) => a + b, 0)).toBe(10001);
    expect(bagiHarga(9000, [0, 0])).toEqual([4500, 4500]);
    expect(() => bagiHarga(100, [])).toThrow();
  });
});

describe('hargaImpas & hargaNaik', () => {
  it('impas: komisi 20% → harga ÷ 0,8 (naik 25%), dibulatkan ke atas', () => {
    expect(hargaImpas(12000, 20)).toBe(15000);
    expect(hargaImpas(13000, 20)).toBe(16500); // 16.250 → 16.500
    expect(hargaImpas(12000, 0)).toBe(12000);
    expect(() => hargaImpas(12000, 100)).toThrow();
  });
  it('naik persen dibulatkan ke atas ke kelipatan', () => {
    expect(hargaNaik(12000, 20)).toBe(14500);
    expect(hargaNaik(12500, 20)).toBe(15000);
    expect(hargaNaik(12000, 15, 1000)).toBe(14000);
    expect(() => hargaNaik(12000, -1)).toThrow();
  });
});
