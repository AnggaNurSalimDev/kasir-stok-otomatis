import { describe, it, expect } from 'vitest';
import { saringTransaksi, ringkasHasil, bacaFilter, adaFilter, pilihanDari, rentangCepat, geserHari, FILTER_KOSONG } from './laporanFilter.js';

const trx = [
  { saluran: 'toko', metodeBayar: 'tunai', shift: 'Pagi', kasir: 'Rina', batal: null, total: 12000, item: [{ nama: 'Thai Tea', ukuran: 'Regular' }] },
  { saluran: 'gofood', metodeBayar: 'aplikasi', shift: 'Sore', kasir: 'Dimas', batal: null, total: 30000, nomorPesanan: 'F-100610', item: [{ nama: 'Kopi Susu', ukuran: 'Large', namaAplikasi: 'Paket Ngopi' }] },
  { saluran: 'gofood', metodeBayar: 'aplikasi', shift: 'Sore', kasir: 'Dimas', batal: { alasan: 'x' }, total: 15000, item: [{ nama: 'Thai Tea', ukuran: 'Large' }] },
];
const f = (x) => ({ ...FILTER_KOSONG, ...x });

describe('saringTransaksi', () => {
  it('tanpa filter = semua', () => expect(saringTransaksi(trx, FILTER_KOSONG)).toHaveLength(3));
  it('saluran, bayar, shift, kasir', () => {
    expect(saringTransaksi(trx, f({ saluran: 'gofood' }))).toHaveLength(2);
    expect(saringTransaksi(trx, f({ bayar: 'tunai' }))).toHaveLength(1);
    expect(saringTransaksi(trx, f({ shift: 'Sore', kasir: 'Dimas' }))).toHaveLength(2);
  });
  it('status sah / batal', () => {
    expect(saringTransaksi(trx, f({ status: 'sah' }))).toHaveLength(2);
    expect(saringTransaksi(trx, f({ status: 'batal' }))).toHaveLength(1);
  });
  it('cari: nama menu, ukuran, nama di aplikasi, atau nomor pesanan (tanpa beda huruf besar)', () => {
    expect(saringTransaksi(trx, f({ cari: 'thai' }))).toHaveLength(2);
    expect(saringTransaksi(trx, f({ cari: 'paket' }))).toHaveLength(1);
    expect(saringTransaksi(trx, f({ cari: 'f-1006' }))).toHaveLength(1);
    expect(saringTransaksi(trx, f({ cari: 'large', saluran: 'gofood', status: 'sah' }))).toHaveLength(1);
  });
  it('input bukan daftar ditolak', () => expect(() => saringTransaksi(null, FILTER_KOSONG)).toThrow());
});

describe('ringkasan & pilihan', () => {
  it('batal tidak masuk penjualan', () => expect(ringkasHasil(trx)).toEqual({ jumlah: 2, total: 42000, batal: 1 }));
  it('pilihan unik dan urut', () => expect(pilihanDari(trx, 'kasir')).toEqual(['Dimas', 'Rina']));
  it('filter dari alamat halaman', () => {
    const p = new URLSearchParams('saluran=gofood&cari=%20thai%20');
    expect(bacaFilter(p)).toEqual(f({ saluran: 'gofood', cari: 'thai' }));
    expect(adaFilter(bacaFilter(p))).toBe(true);
    expect(adaFilter(bacaFilter(new URLSearchParams()))).toBe(false);
  });
});

describe('rentang tanggal', () => {
  it('preset dihitung dari tanggal kalender, melewati batas bulan', () => {
    expect(rentangCepat('kemarin', '2026-11-01')).toEqual({ dari: '2026-10-31', sampai: '2026-10-31' });
    expect(rentangCepat('7-hari', '2026-11-03')).toEqual({ dari: '2026-10-28', sampai: '2026-11-03' });
    expect(rentangCepat('bulan-ini', '2026-11-03')).toEqual({ dari: '2026-11-01', sampai: '2026-11-03' });
    expect(geserHari('2026-03-01', -1)).toBe('2026-02-28');
    expect(() => rentangCepat('tahun-ini', '2026-11-03')).toThrow();
  });
});
