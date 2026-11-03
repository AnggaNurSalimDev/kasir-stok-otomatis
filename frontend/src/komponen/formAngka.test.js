import { describe, it, expect } from 'vitest';
import { angkaDari, angkaBulatDari, hintKonversi } from './formAngka.js';

const creamer = { satuanDasar: 'gr', satuanBantu: [{ nama: 'sendok', konversi: 8 }, { nama: 'kaleng', konversi: 1000 }] };

describe('angkaDari', () => {
  it('menerima koma dan titik desimal', () => {
    expect([angkaDari('1,5'), angkaDari('1.5'), angkaDari(' 8 '), angkaDari('.5')]).toEqual([1.5, 1.5, 8, 0.5]);
  });
  it('kosong, huruf, dan dua koma → null', () => {
    expect([angkaDari(''), angkaDari('abc'), angkaDari('1,2,3'), angkaDari(undefined), angkaDari(NaN)]).toEqual([null, null, null, null, null]);
  });
});

describe('angkaBulatDari', () => {
  it('rupiah dengan titik ribuan dan "Rp"', () => {
    expect([angkaBulatDari('15.000'), angkaBulatDari('Rp 15.000'), angkaBulatDari('15000')]).toEqual([15000, 15000, 15000]);
  });
  it('desimal dan negatif → null', () => {
    expect([angkaBulatDari('15,5'), angkaBulatDari('-100'), angkaBulatDari('')]).toEqual([null, null, null]);
  });
});

describe('hintKonversi', () => {
  it('"1 sendok creamer" → "= 8 gr"', () => {
    expect(hintKonversi('1', 'sendok', creamer)).toEqual({ teks: '= 8 gr', galat: null });
  });
  it('desimal dan satuan dasar', () => {
    expect(hintKonversi('1,5', 'sendok', creamer).teks).toBe('= 12 gr');
    expect(hintKonversi('20', 'gr', creamer).teks).toBe('= 20 gr');
  });
  it('galat yang jelas', () => {
    expect(hintKonversi('0', 'sendok', creamer).galat).toBe('Harus lebih dari 0');
    expect(hintKonversi('x', 'sendok', creamer).galat).toBe('Bukan angka');
    expect(hintKonversi('1', 'gelas', creamer).galat).toBe('Satuan tidak dikenal');
    expect(hintKonversi('0,15', 'gr', creamer).galat).toMatch(/1 angka di belakang koma/);
  });
  it('isian masih kosong → tanpa galat', () => {
    expect(hintKonversi('', 'sendok', creamer)).toEqual({ teks: '', galat: null });
  });
});
