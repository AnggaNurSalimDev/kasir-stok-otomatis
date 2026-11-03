// Diadaptasi dari sistem-rekrutmen (frontend/test/merek.test.js).
import { describe, test, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { campur, hexKeRgb, kontras, sesuaikanKontras, tintaDiAtas } from './warna.js';
import { JENIS_DATA, PROFIL_BAWAAN, pilihIdProfil, validasiProfil, variabelCss } from './profil.js';
import { JENIS_USAHA } from '../api/mock/katalog/index.js';

const FOLDER = join(import.meta.dirname, 'profil');
const semuaProfil = () => readdirSync(FOLDER).map((nama) => [nama, JSON.parse(readFileSync(join(FOLDER, nama), 'utf8'))]);

describe('warna', () => {
  test('hex → rgb dan menolak format lain', () => {
    expect(hexKeRgb('#2b3a8f')).toEqual([43, 58, 143]);
    expect(() => hexKeRgb('#fff')).toThrow();
  });
  test('kontras putih–hitam = 21', () => {
    expect(kontras('#ffffff', '#000000')).toBeCloseTo(21, 5);
  });
  test('campur di ujung-ujungnya mengembalikan warna asal', () => {
    expect(campur('#2b3a8f', '#ffffff', 0)).toBe('#2b3a8f');
    expect(() => campur('#2b3a8f', '#ffffff', 1.5)).toThrow();
  });
  test('tulisan di atas warna gelap = putih, di atas warna terang = gelap', () => {
    expect(tintaDiAtas('#9a3412')).toBe('#ffffff');
    expect(tintaDiAtas('#e0a96d')).not.toBe('#ffffff');
  });
  test('sesuaikanKontras mencapai target', () => {
    expect(kontras(sesuaikanKontras('#9a3412', '#171d27', 4.5), '#171d27')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('validasiProfil', () => {
  test('bukan objek / id rusak → profil bawaan', () => {
    for (const x of [null, 'teh', [], { nama: 'Toko' }, { id: 'Toko Maju' }]) expect(validasiProfil(x).profil).toBe(PROFIL_BAWAAN);
  });
  test('field salah diganti bawaan dan dicatat, field lain tetap dipakai', () => {
    const { profil, masalah } = validasiProfil({ id: 'kedai', nama: 'Kedai', warna: { utama: 'merah', aksen: '#ffcc00' }, data: 'bengkel' });
    expect(profil.warna.utama).toBe(PROFIL_BAWAAN.warna.utama);
    expect(profil.warna.aksen).toBe('#ffcc00');
    expect(profil.data).toBe(PROFIL_BAWAAN.data);
    expect(masalah).toEqual(expect.arrayContaining([expect.stringContaining('warna.utama'), expect.stringContaining('data')]));
  });
  test('field asing dicatat', () => {
    const { masalah } = validasiProfil({ id: 'kedai', warnaa: {}, teks: { judul: 'x' } });
    expect(masalah).toEqual(expect.arrayContaining(['warnaa: field tidak dikenal', 'teks.judul: field tidak dikenal']));
  });
  test('logo dan favicon hanya path lokal, bukan URL luar', () => {
    const { profil, masalah } = validasiProfil({ id: 'kedai', favicon: 'https://contoh.com/a.svg', logo: { gambar: '//contoh.com/a.svg' } });
    expect(profil.favicon).toBe(PROFIL_BAWAAN.favicon);
    expect(profil.logo.gambar).toBe(null);
    expect(masalah.length).toBe(2);
  });
  test('warna utama "tengah" diperingatkan', () => {
    expect(validasiProfil({ id: 'kedai', warna: { utama: '#777777', aksen: '#000000' } }).masalah.some((m) => m.startsWith('warna.utama'))).toBe(true);
  });
});

describe('profil di src/merek/profil', () => {
  test('jenis data di profil sama dengan katalog mock yang tersedia', () => {
    expect([...JENIS_DATA].sort()).toEqual([...JENIS_USAHA].sort());
  });

  test.each(semuaProfil())('%s valid, nama file = id, dan semua teks terbaca', (nama, mentah) => {
    const { profil, masalah } = validasiProfil(mentah);
    expect(masalah).toEqual([]);
    expect(`${profil.id}.json`).toBe(nama);
    const v = variabelCss(profil);
    expect(kontras(v['--di-atas-utama'], v['--utama'])).toBeGreaterThanOrEqual(4.5);
    expect(kontras(v['--tautan'], v['--permukaan'])).toBeGreaterThanOrEqual(4.5);
    expect(kontras(v['--teks'], v['--permukaan'])).toBeGreaterThanOrEqual(7);
    expect(kontras(v['--teks'], v['--utama-pudar'])).toBeGreaterThanOrEqual(4.5); // pilihan aktif
    expect(kontras(v['--galat'], v['--galat-pudar'])).toBeGreaterThanOrEqual(4.5);
    expect(kontras(v['--aksen'], v['--utama'])).toBeGreaterThanOrEqual(3); // garis menu aktif di kepala
  });

  test('setiap jenis data dipakai minimal satu profil', () => {
    const dipakai = new Set(semuaProfil().map(([, m]) => m.data));
    JENIS_DATA.forEach((d) => expect(dipakai.has(d), d).toBe(true));
  });
});

describe('variabelCss', () => {
  test('aksen yang tidak kontras dengan kepala diganti warna tulisan kepala', () => {
    const { profil } = validasiProfil({ id: 'kedai', warna: { utama: '#2b3a8f', aksen: '#2b3a90' } });
    const v = variabelCss(profil);
    expect(v['--aksen']).toBe(v['--di-atas-utama']);
  });
  test('menolak objek yang bukan hasil validasi', () => {
    expect(() => variabelCss({})).toThrow();
  });
});

describe('pilihIdProfil', () => {
  const tersedia = new Set(['teh-senja', 'kopi-lintas']);
  test('di luar mode demo hanya VITE_PROFIL yang berlaku', () => {
    expect(pilihIdProfil({ bawaan: 'kopi-lintas', demo: false, dariUrl: 'teh-senja', dariPenyimpanan: 'teh-senja', tersedia })).toBe('kopi-lintas');
  });
  test('mode demo: ?profil= > localStorage > bawaan; id asing diabaikan', () => {
    expect(pilihIdProfil({ bawaan: 'teh-senja', demo: true, dariUrl: 'kopi-lintas', dariPenyimpanan: null, tersedia })).toBe('kopi-lintas');
    expect(pilihIdProfil({ bawaan: 'teh-senja', demo: true, dariUrl: 'jahat', dariPenyimpanan: 'kopi-lintas', tersedia })).toBe('kopi-lintas');
    expect(pilihIdProfil({ bawaan: 'tidak-ada', demo: true, dariUrl: null, dariPenyimpanan: null, tersedia })).toBe('teh-senja');
  });
});
