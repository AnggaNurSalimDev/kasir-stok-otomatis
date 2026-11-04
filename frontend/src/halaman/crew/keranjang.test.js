import { describe, it, expect } from 'vitest';
import { tambah, ubahQty, kunciItem, hargaSatuan, total, saranUang, keBody } from './keranjang.js';

const menuById = new Map([
  ['thaiTea', { id: 'thaiTea', ukuran: [{ nama: 'Regular', harga: 12000 }, { nama: 'Large', harga: 15000 }] }],
]);
const toppingById = new Map([
  ['jelly', { id: 'jelly', harga: 3000 }],
  ['boba', { id: 'boba', harga: 3000 }],
]);
const item = (o = {}) => ({ menuId: 'thaiTea', ukuran: 'Regular', toppingIds: [], qty: 1, ...o });

describe('tambah', () => {
  it('konfigurasi sama digabung, urutan topping tidak berpengaruh', () => {
    let k = tambah([], item({ toppingIds: ['jelly', 'boba'] }));
    k = tambah(k, item({ toppingIds: ['boba', 'jelly'], qty: 2 }));
    expect(k).toHaveLength(1);
    expect(k[0].qty).toBe(3);
  });
  it('ukuran atau topping berbeda = baris berbeda', () => {
    let k = tambah([], item());
    k = tambah(k, item({ ukuran: 'Large' }));
    k = tambah(k, item({ toppingIds: ['jelly'] }));
    expect(k).toHaveLength(3);
  });
  it('qty maksimal 99', () => {
    expect(tambah([item({ qty: 98 })], item({ qty: 5 }))[0].qty).toBe(99);
  });
  it('tidak mengubah keranjang lama (immutable)', () => {
    const lama = [item()];
    tambah(lama, item());
    expect(lama[0].qty).toBe(1);
  });
  it('item rusak ditolak', () => {
    expect(() => tambah([], item({ qty: 0 }))).toThrow(TypeError);
    expect(() => tambah([], { menuId: 'x' })).toThrow(TypeError);
  });
});

describe('ubahQty', () => {
  const k = [item()];
  it('ubah, hapus saat 0, potong di 99', () => {
    expect(ubahQty(k, kunciItem(k[0]), 4)[0].qty).toBe(4);
    expect(ubahQty(k, kunciItem(k[0]), 0)).toEqual([]);
    expect(ubahQty(k, kunciItem(k[0]), 150)[0].qty).toBe(99);
  });
  it('qty pecahan ditolak', () => {
    expect(() => ubahQty(k, kunciItem(k[0]), 1.5)).toThrow(TypeError);
  });
});

describe('harga', () => {
  it('ukuran + topping, dikali qty', () => {
    const k = [item({ toppingIds: ['jelly'], qty: 2 }), item({ ukuran: 'Large' })];
    expect(hargaSatuan(k[0], menuById, toppingById)).toBe(15000);
    expect(total(k, menuById, toppingById)).toBe(45000);
  });
  it('item yang tidak dikenal katalog → null, tidak ikut total', () => {
    const k = [item({ ukuran: 'Jumbo' }), item()];
    expect(hargaSatuan(k[0], menuById, toppingById)).toBeNull();
    expect(total(k, menuById, toppingById)).toBe(12000);
  });
});

describe('saranUang', () => {
  it('uang pas + pecahan yang lazim', () => {
    expect(saranUang(23000)).toEqual([23000, 25000, 30000, 50000, 100000]);
    expect(saranUang(50000)).toEqual([50000, 100000]);
  });
  it('total tidak valid → kosong', () => {
    expect(saranUang(0)).toEqual([]);
    expect(saranUang(12.5)).toEqual([]);
  });
});

it('keBody hanya membawa field kontrak', () => {
  expect(keBody([{ ...item(), harga: 1, nama: 'x' }])).toEqual([{ menuId: 'thaiTea', ukuran: 'Regular', toppingIds: [], qty: 1 }]);
});

describe('harga per saluran', () => {
  it('memakai harga aplikasi jika diisi, harga toko jika kosong', async () => {
    const { hargaSatuan: h, total: t } = await import('./keranjang.js');
    const menuById = new Map([['m', { id: 'm', ukuran: [{ nama: 'R', harga: 10000, hargaSaluran: { gofood: 12000 } }] }]]);
    const toppingById = new Map([['tp', { id: 'tp', harga: 2000 }]]);
    const item = { menuId: 'm', ukuran: 'R', toppingIds: ['tp'], qty: 2 };
    expect(h(item, menuById, toppingById)).toBe(12000);
    expect(h(item, menuById, toppingById, 'gofood')).toBe(14000);
    expect(t([item], menuById, toppingById, 'shopeefood')).toBe(24000);
  });
});

describe('item paket', () => {
  it('kunci, harga per aplikasi (null di toko / tidak dijual), dan body', async () => {
    const k = await import('./keranjang.js');
    const paketById = new Map([['duo', { id: 'duo', aktif: true, hargaSaluran: { gofood: 30000 } }]]);
    const isi = k.tambah(k.tambah([], { paketId: 'duo', qty: 1 }), { paketId: 'duo', qty: 2 });
    expect(isi).toEqual([{ paketId: 'duo', qty: 3 }]);
    expect(k.hargaSatuan(isi[0], new Map(), new Map(), 'gofood', paketById)).toBe(30000);
    expect(k.hargaSatuan(isi[0], new Map(), new Map(), 'toko', paketById)).toBeNull();
    expect(k.hargaSatuan(isi[0], new Map(), new Map(), 'grabfood', paketById)).toBeNull();
    expect(k.total(isi, new Map(), new Map(), 'gofood', paketById)).toBe(90000);
    expect(k.keBody(isi)).toEqual([{ paketId: 'duo', qty: 3 }]);
    expect(() => k.tambah([], { paketId: 1, qty: 1 })).toThrow();
  });
});
