import { describe, it, expect } from 'vitest';
import { waktuValid, waktuLokal, periksaJadwal, statusPaket, ringkasJadwal } from './jadwal.js';

const Z = 'Asia/Jakarta';
const paket = (jadwal, aktif = true) => ({ aktif, jadwal });

describe('waktuLokal & waktuValid', () => {
  it('UTC → waktu lokal Jakarta (+7), termasuk ganti hari', () => {
    expect(waktuLokal('2026-11-13T18:30:00Z', Z)).toEqual({ waktu: '2026-11-14T01:30', hari: 6 }); // Sabtu dini hari
    expect(waktuLokal('2026-11-13T16:59:00Z', Z)).toEqual({ waktu: '2026-11-13T23:59', hari: 5 });
  });
  it('tanggal mustahil ditolak', () => {
    expect(waktuValid('2026-11-10T00:00')).toBe(true);
    expect(waktuValid('2026-02-30T10:00')).toBe(false);
    expect(waktuValid('2026-11-10T24:00')).toBe(false);
    expect(waktuValid('2026-11-10 10:00')).toBe(false);
  });
});

describe('periksaJadwal', () => {
  it('selesai harus setelah mulai; hari 0–6 tanpa dobel', () => {
    expect(periksaJadwal(undefined)).toEqual([]);
    expect(periksaJadwal({ mulai: '2026-11-10T00:00', selesai: '2026-11-10T00:00' }).map((d) => d.field)).toEqual(['jadwal.selesai']);
    expect(periksaJadwal({ hari: [5, 5] }).map((d) => d.field)).toEqual(['jadwal.hari']);
    expect(periksaJadwal({ hari: [] }).map((d) => d.field)).toEqual(['jadwal.hari']);
    expect(periksaJadwal({ hari: [7] })).toHaveLength(1);
    expect(periksaJadwal({ mulai: '2026-11-10T00:00', selesai: '2026-11-30T23:59', hari: [5, 6, 0] })).toEqual([]);
  });
});

describe('statusPaket', () => {
  const j = { mulai: '2026-11-10T00:00', selesai: '2026-11-30T23:59', hari: [5, 6, 0] };
  it('nonaktif menang atas jadwal; tanpa jadwal = berlaku', () => {
    expect(statusPaket(paket(j, false), '2026-11-14T03:00:00Z', Z).status).toBe('nonaktif');
    expect(statusPaket(paket(undefined), '2026-11-14T03:00:00Z', Z)).toEqual({ status: 'berlaku', dijual: true });
  });
  it('sebelum mulai, setelah selesai, bukan harinya, dan berlaku', () => {
    expect(statusPaket(paket(j), '2026-11-09T16:59:00Z', Z).status).toBe('terjadwal'); // 9 Nov 23.59 WIB
    expect(statusPaket(paket(j), '2026-11-09T17:00:00Z', Z).status).toBe('bukan_hari'); // 10 Nov 00.00 WIB, Selasa
    expect(statusPaket(paket(j), '2026-11-13T17:00:00Z', Z)).toEqual({ status: 'berlaku', dijual: true }); // Sabtu 14 Nov
    expect(statusPaket(paket(j), '2026-11-30T16:59:00Z', Z).status).toBe('berakhir'); // 30 Nov 23.59 WIB = selesai
  });
});

describe('ringkasJadwal', () => {
  it('kalimat ringkas, hari urut Senin → Minggu', () => {
    expect(ringkasJadwal({ mulai: '2026-11-10T00:00', selesai: '2026-11-30T23:59', hari: [0, 5, 6] })).toBe('10 Nov 2026 00.00 – 30 Nov 2026 23.59 · Jumat, Sabtu, Minggu');
    expect(ringkasJadwal({ selesai: '2026-12-01T00:00' })).toBe('Sampai 1 Des 2026 00.00 · setiap hari');
    expect(ringkasJadwal(undefined)).toBe('Setiap hari, tanpa batas waktu');
  });
});
