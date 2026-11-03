import { describe, it, expect, vi } from 'vitest';
import { buatKlien } from './klien.js';
import { ErrorApi } from './ErrorApi.js';

const jawaban = (status, json) => ({ status, ok: status >= 200 && status < 300, json: async () => json });

describe('buatKlien: guard', () => {
  it('mode harus mock atau real', () => {
    expect(() => buatKlien({ mode: 'palsu' })).toThrow(/VITE_API_MODE/);
  });
  it('mode real butuh alamat http(s)', () => {
    expect(() => buatKlien({ mode: 'real', apiUrl: 'api.contoh.id' })).toThrow(/VITE_API_URL/);
  });
  it('path harus diawali /', async () => {
    const k = buatKlien({ mode: 'mock', mock: { panggil: vi.fn() } });
    await expect(k.panggil('bahan')).rejects.toThrow(TypeError);
  });
});

describe('mode mock', () => {
  it('meneruskan penggunaId dan salinan body, mengembalikan data', async () => {
    const mock = { panggil: vi.fn(async () => ({ status: 200, data: [1] })) };
    const k = buatKlien({ mode: 'mock', mock, sesi: () => ({ penggunaId: 'rina' }) });
    const body = { a: 1 };
    expect(await k.panggil('/x', { method: 'POST', body })).toEqual([1]);
    const [, opsi] = mock.panggil.mock.calls[0];
    expect(opsi).toEqual({ method: 'POST', body: { a: 1 }, penggunaId: 'rina' });
    expect(opsi.body).not.toBe(body);
  });
});

describe('mode real', () => {
  const buat = (fetchFn, sesi) => buatKlien({ mode: 'real', apiUrl: 'https://api.contoh.id/', fetchFn, sesi });

  it('mengirim token dan JSON, mengembalikan data', async () => {
    const fetchFn = vi.fn(async () => jawaban(200, { data: { ok: true } }));
    const k = buat(fetchFn, () => ({ token: 'abc' }));
    expect(await k.panggil('/bahan', { method: 'POST', body: { nama: 'Gula' } })).toEqual({ ok: true });
    const [url, opsi] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.contoh.id/bahan'); // garis miring ganda dibersihkan
    expect(opsi.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer abc' });
    expect(opsi.body).toBe('{"nama":"Gula"}');
  });
  it('galat backend → ErrorApi dengan detail per field', async () => {
    const k = buat(async () => jawaban(400, { error: { kode: 'VALIDASI', pesan: 'Data tidak valid', detail: [{ field: 'nama', pesan: 'Wajib diisi' }] } }));
    const e = await k.panggil('/bahan').catch((x) => x);
    expect(e).toBeInstanceOf(ErrorApi);
    expect([e.status, e.kode, e.perField]).toEqual([400, 'VALIDASI', { nama: 'Wajib diisi' }]);
  });
  it('gagal terhubung → status 0, kode JARINGAN', async () => {
    const k = buat(async () => {
      throw new TypeError('Failed to fetch');
    });
    const e = await k.panggil('/bahan').catch((x) => x);
    expect([e.status, e.kode]).toEqual([0, 'JARINGAN']);
  });
  it('respons bukan JSON tetap jadi ErrorApi, bukan crash', async () => {
    const k = buat(async () => ({ status: 502, ok: false, json: async () => { throw new SyntaxError(); } }));
    const e = await k.panggil('/bahan').catch((x) => x);
    expect([e.status, e.kode]).toEqual([502, 'TIDAK_DIKENAL']);
  });
  it('204 → null', async () => {
    expect(await buat(async () => ({ status: 204, ok: true })).panggil('/x', { method: 'DELETE' })).toBeNull();
  });
});
