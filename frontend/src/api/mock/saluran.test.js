import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { buatMockApi } from './server.js';
import { penyimpananMemori } from './penyimpanan.js';
import { buatKatalog, buatDataDemo } from './dataContoh.js';
import { buatPesananContoh, KODE_TIDAK_DIKENAL } from './pesananContoh.js';
import { JENIS_USAHA } from './katalog/index.js';
import { ErrorApi } from '../ErrorApi.js';

let api;
const panggil = async (alamat, method = 'GET', body, penggunaId = 'rina') => (await api.panggil(alamat, { method, body, penggunaId })).data;
async function galat(janji) {
  try {
    await janji;
  } catch (e) {
    expect(e).toBeInstanceOf(ErrorApi);
    return e;
  }
  throw new Error('Seharusnya melempar galat');
}

const KUNCI = { creamer: 1000, airThaiTea: 4000, airGreenTea: 3000, bubukCoklat: 1000, bubukMatcha: 500, bijiKopi: 1000, cup: 100 };
const buka = () => panggil('/shift/buka', 'POST', { namaShift: 'Pagi', hitungan: KUNCI, kasAwal: 200000 });
const thaiTea = (qty = 1) => [{ menuId: 'thaiTea', ukuran: 'Regular', toppingIds: [], qty }];
// Pesanan aplikasi tetap (tanpa acak) untuk test.
const pesanan = (nomor = 'F-000001', item = [{ kode: 'thaiTea:Regular', nama: 'Thai Tea (Regular)', qty: 2, harga: 14500, topping: [] }]) => ({
  nomorPesanan: nomor, pelanggan: 'Andi', item, total: item.reduce((a, i) => a + i.harga * i.qty, 0),
});

beforeEach(async () => {
  const k = buatKatalog();
  k.pengaturan.hitungSemuaBahan = 'tidak';
  api = buatMockApi({ penyimpanan: penyimpananMemori(), buatDataAwal: () => k, jedaMs: [0, 0], sekarang: () => new Date('2026-11-03T01:00:00Z') });
  await panggil('/opname', 'POST', { hitungan: Object.fromEntries(k.bahan.map((b) => [b.id, 5000])) }, 'owner');
});

describe('pencatatan manual pesanan aplikasi', () => {
  it('ShopeeFood (manual): harga saluran, wajib nomor, dibayar aplikasi, tidak masuk kas', async () => {
    await buka();
    const struk = await panggil('/transaksi', 'POST', { item: thaiTea(), saluran: 'shopeefood', nomorPesanan: 'SF-1', metodeBayar: 'aplikasi' });
    expect(struk.total).toBe(15000); // impas komisi 20%: 12.000 ÷ 0,8
    expect(struk.namaSaluran).toBe('ShopeeFood');
    const tutup = await panggil('/shift/tutup', 'POST', { hitungan: KUNCI, kasAkhir: 200000 });
    const detail = await panggil(`/shift/${tutup.id}`, 'GET', undefined, 'owner');
    expect(detail.hasil.kas.status).toBe('wajar'); // laci tetap 200.000
    expect(detail.perSaluran.shopeefood).toMatchObject({ jumlah: 1, total: 15000 });
  });

  it('aturan bentuk: online wajib nomor & bayar aplikasi; toko tidak boleh nomor atau bayar aplikasi (A-20)', async () => {
    await buka();
    const a = await galat(panggil('/transaksi', 'POST', { item: thaiTea(), saluran: 'shopeefood', metodeBayar: 'qris' }));
    expect(Object.keys(a.perField).sort()).toEqual(['metodeBayar', 'nomorPesanan']);
    const b = await galat(panggil('/transaksi', 'POST', { item: thaiTea(), nomorPesanan: 'X', metodeBayar: 'aplikasi' }));
    expect(Object.keys(b.perField).sort()).toEqual(['metodeBayar', 'nomorPesanan']);
  });

  it('nomor pesanan yang sama ditolak (A-19); saluran otomatis tidak bisa dicatat manual; saluran nonaktif ditolak', async () => {
    await buka();
    const body = { item: thaiTea(), saluran: 'shopeefood', nomorPesanan: 'SF-9', metodeBayar: 'aplikasi' };
    await panggil('/transaksi', 'POST', body);
    expect((await galat(panggil('/transaksi', 'POST', { ...body, nomorPesanan: ' sf-9 ' }))).status).toBe(409);
    expect((await galat(panggil('/transaksi', 'POST', { ...body, saluran: 'gofood' }))).message).toMatch(/masuk otomatis/);
    await panggil('/saluran/shopeefood', 'PUT', { aktif: false, mode: 'manual', komisiPersen: 20 }, 'owner');
    expect((await galat(panggil('/transaksi', 'POST', { ...body, nomorPesanan: 'SF-10' }))).message).toMatch(/belum diaktifkan/);
  });

  it('pesanan manual bisa dibatalkan crew: penjualan tidak dihitung, bahan tetap terpakai', async () => {
    await buka();
    const s = await panggil('/transaksi', 'POST', { item: thaiTea(2), saluran: 'shopeefood', nomorPesanan: 'SF-2', metodeBayar: 'aplikasi' });
    const stokSebelum = (await panggil('/bahan', 'GET', undefined, 'owner')).find((b) => b.id === 'creamer').stok;
    await panggil(`/transaksi/${s.id}/batal`, 'POST', { alasan: 'Driver tidak datang' });
    expect((await galat(panggil(`/transaksi/${s.id}/batal`, 'POST', { alasan: 'lagi' }))).status).toBe(409);
    const lap = await panggil('/laporan/harian');
    expect(lap.totalPenjualan).toBe(0);
    expect(lap.perSaluran.shopeefood).toMatchObject({ jumlah: 0, batal: 1 });
    expect(lap.pemakaian.find((b) => b.bahanId === 'creamer').jumlah).toBe(16);
    expect((await panggil('/bahan', 'GET', undefined, 'owner')).find((b) => b.id === 'creamer').stok).toBe(stokSebelum);
  });

  it('pesanan di toko tidak bisa dibatalkan lewat jalur ini', async () => {
    await buka();
    const s = await panggil('/transaksi', 'POST', { item: thaiTea(), metodeBayar: 'qris' });
    expect((await galat(panggil(`/transaksi/${s.id}/batal`, 'POST', { alasan: 'x' }))).status).toBe(409);
  });
});

describe('pesanan otomatis (simulasi webhook)', () => {
  it('masuk → menunggu; dikirim ulang dengan nomor sama → pesanan yang sama, bukan baru (A-19)', async () => {
    const a = await panggil('/integrasi/gofood/pesanan', 'POST', pesanan());
    const b = await panggil('/integrasi/gofood/pesanan', 'POST', pesanan());
    expect(a.status).toBe('menunggu');
    expect(b).toMatchObject({ id: a.id, duplikat: true });
    expect((await panggil('/pesanan-online')).menunggu).toHaveLength(1);
  });

  it('tanpa shift terbuka pesanan tetap menunggu dan belum bisa diterima (A-22)', async () => {
    const p = await panggil('/integrasi/gofood/pesanan', 'POST', pesanan());
    expect((await galat(panggil(`/pesanan-online/${p.id}/terima`, 'POST'))).message).toMatch(/shift/);
    expect((await panggil('/pesanan-online')).menunggu).toHaveLength(1);
  });

  it('diterima → transaksi dengan harga dari aplikasi, stok berkurang lewat resep, tidak bisa diterima dua kali', async () => {
    await buka();
    const p = await panggil('/integrasi/gofood/pesanan', 'POST', pesanan());
    const { pesanan: hasil, struk } = await panggil(`/pesanan-online/${p.id}/terima`, 'POST');
    expect(hasil.status).toBe('diterima');
    expect(struk).toMatchObject({ saluran: 'gofood', nomorPesanan: 'F-000001', metodeBayar: 'aplikasi', total: 29000 });
    expect(struk.item[0]).toMatchObject({ nama: 'Thai Tea', ukuran: 'Regular', qty: 2, namaAplikasi: 'Thai Tea (Regular)' });
    const lap = await panggil('/laporan/harian');
    expect(lap.pemakaian.find((b) => b.bahanId === 'creamer').jumlah).toBe(16);
    expect((await galat(panggil(`/pesanan-online/${p.id}/terima`, 'POST'))).status).toBe(409);
  });

  it('menu yang belum dikenali tidak bisa diterima sampai owner memetakannya (A-21)', async () => {
    await buka();
    const item = [{ kode: KODE_TIDAK_DIKENAL, nama: 'Paket Berdua', qty: 1, harga: 25000, topping: [] }];
    const p = await panggil('/integrasi/grabfood/pesanan', 'POST', pesanan('GF-1', item));
    expect(p.siapDiterima).toBe(false);
    expect((await galat(panggil(`/pesanan-online/${p.id}/terima`, 'POST'))).message).toMatch(/Paket Berdua/);

    const saluran = (await panggil('/saluran', 'GET', undefined, 'owner')).find((s) => s.id === 'grabfood');
    expect(saluran.belumDikenali.map((x) => x.kode)).toEqual([KODE_TIDAK_DIKENAL]);
    expect((await galat(panggil('/saluran/grabfood/pemetaan', 'PUT', { kode: KODE_TIDAK_DIKENAL, isi: [{ menuId: 'thaiTea', ukuran: 'Jumbo', qty: 2 }] }, 'owner'))).perField).toHaveProperty('isi[0].ukuran');
    await panggil('/saluran/grabfood/pemetaan', 'PUT', { kode: KODE_TIDAK_DIKENAL, isi: [{ menuId: 'thaiTea', ukuran: 'Regular', qty: 2 }] }, 'owner');

    const { struk } = await panggil(`/pesanan-online/${p.id}/terima`, 'POST');
    expect(struk.total).toBe(25000); // harga paket dari aplikasi
    expect(struk.item[0].qty).toBe(2); // 1 paket = 2 Thai Tea → stok berkurang untuk 2 gelas
  });

  it('dibatalkan aplikasi: saat menunggu → tanpa transaksi; setelah diterima → penjualan batal, bahan tetap terpakai', async () => {
    await buka();
    const a = await panggil('/integrasi/gofood/pesanan', 'POST', pesanan('F-A'));
    const b = await panggil('/integrasi/gofood/pesanan', 'POST', pesanan('F-B'));
    await panggil(`/pesanan-online/${b.id}/terima`, 'POST');
    expect((await panggil('/integrasi/gofood/batal', 'POST', { nomorPesanan: 'F-A', alasan: 'Pelanggan batal' })).status).toBe('dibatalkan');
    const batalB = await panggil('/integrasi/gofood/batal', 'POST', { nomorPesanan: 'F-B', alasan: 'Pelanggan batal' });
    expect(batalB).toMatchObject({ status: 'dibatalkan', batal: { sumber: 'aplikasi' } });
    await panggil('/integrasi/gofood/batal', 'POST', { nomorPesanan: 'F-B', alasan: 'kirim ulang' }); // idempoten

    const lap = await panggil('/laporan/harian');
    expect(lap.jumlahTransaksi).toBe(0);
    expect(lap.perSaluran.gofood.batal).toBe(1);
    expect(lap.pemakaian.find((x) => x.bahanId === 'creamer').jumlah).toBe(16); // hanya pesanan B yang dibuat
    expect(a.id).not.toBe(b.id);
  });

  it('ditolak: tidak ada transaksi; status final', async () => {
    await buka();
    const p = await panggil('/integrasi/gofood/pesanan', 'POST', pesanan());
    expect((await panggil(`/pesanan-online/${p.id}/tolak`, 'POST', { alasan: 'Bahan habis' })).status).toBe('ditolak');
    expect((await galat(panggil(`/pesanan-online/${p.id}/terima`, 'POST'))).status).toBe(409);
    expect((await panggil('/laporan/harian')).transaksi).toHaveLength(0);
  });

  it('saluran yang belum tersambung menolak webhook; total yang tidak cocok ditolak skema', async () => {
    expect((await galat(panggil('/integrasi/shopeefood/pesanan', 'POST', pesanan('SF-1')))).message).toMatch(/belum tersambung/);
    expect((await galat(panggil('/integrasi/gofood/pesanan', 'POST', { ...pesanan(), total: 1 }))).perField).toHaveProperty('total');
    expect((await galat(panggil('/integrasi/tokopedia/pesanan', 'POST', pesanan()))).status).toBe(404);
  });

  it('sambungkan (simulasi) mencatat waktu; putus → kembali manual', async () => {
    const s = await panggil('/saluran/shopeefood', 'PUT', { aktif: true, mode: 'otomatis', komisiPersen: 18 }, 'owner');
    expect(s).toMatchObject({ mode: 'otomatis', komisiPersen: 18 });
    expect(s.tersambungPada).toBeTruthy();
    const crew = (await panggil('/saluran')).find((x) => x.id === 'shopeefood');
    expect(crew).not.toHaveProperty('komisiPersen');
    expect((await panggil('/saluran/shopeefood', 'PUT', { aktif: false, mode: 'otomatis', komisiPersen: 18 }, 'owner')).mode).toBe('manual');
    expect((await galat(panggil('/saluran/gofood', 'PUT', { aktif: true, mode: 'otomatis', komisiPersen: 20 }))).status).toBe(403);
  });

  it('shift aktif menyebut jumlah pesanan per aplikasi dan yang menunggu (tanpa rupiah)', async () => {
    await buka();
    const p = await panggil('/integrasi/gofood/pesanan', 'POST', pesanan());
    await panggil('/integrasi/gofood/pesanan', 'POST', pesanan('F-2'));
    await panggil(`/pesanan-online/${p.id}/terima`, 'POST');
    const aktif = await panggil('/shift/aktif');
    expect(aktif.pesananMenunggu).toBe(1);
    expect(aktif.pesananOnline.find((x) => x.saluran === 'gofood')).toEqual({ saluran: 'gofood', nama: 'GoFood', jumlah: 1, batal: 0 });
  });

  it('harga per saluran disimpan owner; kosong = harga toko', async () => {
    const menu = (await panggil('/menu', 'GET', undefined, 'owner')).find((m) => m.id === 'americano');
    const ukuran = menu.ukuran.map((u) => ({ nama: u.nama, harga: u.harga, hargaSaluran: { gofood: 17000 }, resep: u.resep }));
    await panggil('/menu/americano', 'PUT', { nama: menu.nama, kategori: menu.kategori, ukuran, toppingIds: menu.toppingIds }, 'owner');
    await buka();
    await panggil('/saluran/shopeefood', 'PUT', { aktif: true, mode: 'manual', komisiPersen: 20 }, 'owner');
    const item = [{ menuId: 'americano', ukuran: 'Regular', toppingIds: [], qty: 1 }];
    expect((await panggil('/transaksi', 'POST', { item, saluran: 'shopeefood', nomorPesanan: 'S1', metodeBayar: 'aplikasi' })).total).toBe(13000);
    const p = await panggil('/integrasi/gofood/pesanan', 'POST', pesanan('F-9', [{ kode: 'americano:Regular', nama: 'Americano', qty: 1, harga: 17000, topping: [] }]));
    expect(p.hargaBerbeda).toBe(false);
  });
});

describe('pemetaan paket isi campuran', () => {
  const paket = [{ kode: 'PKT-1', nama: 'Paket Ngopi Berdua', qty: 2, harga: 30001, topping: [] }];
  it('1 paket = 1 Thai Tea + 1 Kopi Susu: dua menu tercatat, total tetap persis, stok kedua resep berkurang', async () => {
    await buka();
    const p = await panggil('/integrasi/gofood/pesanan', 'POST', pesanan('F-PK', paket));
    await panggil('/saluran/gofood/pemetaan', 'PUT', { kode: 'PKT-1', isi: [{ menuId: 'thaiTea', ukuran: 'Regular', qty: 1 }, { menuId: 'kopiSusu', ukuran: 'Regular', qty: 1 }] }, 'owner');
    const tampil = (await panggil('/pesanan-online')).menunggu[0];
    expect(tampil.item[0]).toMatchObject({ sumber: 'pemetaan', hargaBerbeda: false, isiKasir: [{ nama: 'Thai Tea', qty: 1 }, { nama: 'Kopi Susu', qty: 1 }] });
    const { struk } = await panggil(`/pesanan-online/${p.id}/terima`, 'POST');
    expect(struk.total).toBe(60002); // 2 paket × 30.001, tidak ada rupiah yang hilang karena pembagian
    expect(struk.item.map((i) => [i.nama, i.qty])).toEqual([['Thai Tea', 2], ['Kopi Susu', 2]]);
    const pakai = (await panggil('/laporan/harian')).pemakaian;
    expect(pakai.find((b) => b.bahanId === 'airThaiTea').jumlah).toBe(300); // 2 × 1 garis bawah
    expect(pakai.find((b) => b.bahanId === 'bijiKopi').jumlah).toBe(36); // 2 × 1 shot
  });
  it('menu dobel di isi paket ditolak; kode hasil sinkron tidak perlu dipetakan; pemetaan bisa dihapus', async () => {
    const dobel = [{ menuId: 'thaiTea', ukuran: 'Regular', qty: 1 }, { menuId: 'thaiTea', ukuran: 'Regular', qty: 1 }];
    expect((await galat(panggil('/saluran/gofood/pemetaan', 'PUT', { kode: 'X', isi: dobel }, 'owner'))).perField).toHaveProperty('isi');
    expect((await galat(panggil('/saluran/gofood/pemetaan', 'PUT', { kode: 'thaiTea:Regular', isi: [dobel[0]] }, 'owner'))).status).toBe(409);
    await panggil('/saluran/gofood/pemetaan', 'PUT', { kode: 'X', isi: [dobel[0]] }, 'owner');
    expect((await panggil('/saluran/gofood/pemetaan/X', 'DELETE', undefined, 'owner')).pemetaan).toEqual([]);
    expect((await galat(panggil('/saluran/gofood/pemetaan/X', 'DELETE', undefined, 'owner'))).status).toBe(404);
  });
});

describe('harga aplikasi massal', () => {
  it('tersimpan untuk menu & topping; satu baris salah → tidak ada yang berubah (atomik)', async () => {
    const body = { menu: [{ id: 'americano', ukuran: [{ nama: 'Regular', hargaSaluran: { gofood: 17000 } }] }], topping: [{ id: 'tpBoba', hargaSaluran: { gofood: 4000, grabfood: 4000 } }] };
    await panggil('/harga-saluran', 'PUT', body, 'owner');
    const menu = await panggil('/menu', 'GET', undefined, 'owner');
    expect(menu.find((m) => m.id === 'americano').ukuran[0].hargaSaluran).toEqual({ gofood: 17000 });
    const salah = { menu: [{ id: 'americano', ukuran: [{ nama: 'Regular', hargaSaluran: { gofood: 99000 } }] }, { id: 'hilang', ukuran: [{ nama: 'R', hargaSaluran: {} }] }], topping: [] };
    expect((await galat(panggil('/harga-saluran', 'PUT', salah, 'owner'))).perField).toHaveProperty('menu[1].id');
    expect((await panggil('/menu', 'GET', undefined, 'owner')).find((m) => m.id === 'americano').ukuran[0].hargaSaluran.gofood).toBe(17000);
    expect((await galat(panggil('/harga-saluran', 'PUT', body))).status).toBe(403);
  });
});

describe('laporan rentang tanggal', () => {
  it('owner bisa rentang ≤ 31 hari; crew hanya hari ini; rentang terbalik ditolak', async () => {
    const lap = await panggil('/laporan/harian?dari=2026-10-30&sampai=2026-11-03', 'GET', undefined, 'owner');
    expect(lap).toMatchObject({ dari: '2026-10-30', sampai: '2026-11-03', jumlahHari: 5 });
    expect((await galat(panggil('/laporan/harian?dari=2026-11-03&sampai=2026-11-01', 'GET', undefined, 'owner'))).perField).toHaveProperty('sampai');
    expect((await galat(panggil('/laporan/harian?dari=2026-09-01&sampai=2026-11-03', 'GET', undefined, 'owner'))).message).toMatch(/terlalu panjang/);
    expect((await galat(panggil('/laporan/harian?dari=2026-11-02&sampai=2026-11-03'))).status).toBe(403);
    expect((await galat(panggil('/laporan/harian?dari=2026-13-01', 'GET', undefined, 'owner'))).status).toBe(400);
  });
  it('transaksi membawa nama shift dan tanggal (untuk filter)', async () => {
    await buka();
    await panggil('/transaksi', 'POST', { item: thaiTea(), metodeBayar: 'qris' });
    expect((await panggil('/laporan/harian')).transaksi[0]).toMatchObject({ shift: 'Pagi', tanggal: '2026-11-03', saluran: 'toko' });
  });
});

describe('paket khusus aplikasi (dirancang di kasir)', () => {
  const PAKET_BERDUA = { kode: 'paket:berdua', nama: 'Paket Berdua', qty: 1, topping: [] };
  const hargaPaket = async (saluran) => (await panggil('/paket')).find((p) => p.id === 'berdua').hargaSaluran[saluran];

  it('pesanan berisi paket kasir langsung dikenali, tanpa pemetaan; isi tercatat dengan nama paket', async () => {
    await buka();
    const harga = await hargaPaket('gofood');
    const p = await panggil('/integrasi/gofood/pesanan', 'POST', pesanan('F-P1', [{ ...PAKET_BERDUA, harga }]));
    expect(p.siapDiterima).toBe(true);
    expect(p.item[0]).toMatchObject({ sumber: 'paket', hargaBerbeda: false, isiKasir: [{ nama: 'Thai Tea' }, { nama: 'Kopi Susu' }] });
    const { struk } = await panggil(`/pesanan-online/${p.id}/terima`, 'POST');
    expect(struk.total).toBe(harga);
    expect(struk.item.map((i) => [i.nama, i.paket])).toEqual([['Thai Tea', 'Paket Berdua'], ['Kopi Susu', 'Paket Berdua']]);
  });

  it('harga di aplikasi beda dengan harga paket di kasir → ditandai; paket nonaktif → tidak dikenali', async () => {
    const p = await panggil('/integrasi/gofood/pesanan', 'POST', pesanan('F-P2', [{ ...PAKET_BERDUA, harga: 1000 }]));
    expect(p.hargaBerbeda).toBe(true);
    const paket = (await panggil('/paket')).find((x) => x.id === 'berdua');
    await panggil('/paket/berdua', 'PUT', { nama: paket.nama, isi: paket.isi.map(({ menuId, ukuran, qty }) => ({ menuId, ukuran, qty })), hargaSaluran: paket.hargaSaluran, aktif: false }, 'owner');
    expect((await panggil('/pesanan-online')).menunggu[0].item[0].masalah).toMatch(/dinonaktifkan/);
  });

  it('dicatat manual (ShopeeFood): paket diurai jadi isinya, total = harga paket; di toko ditolak', async () => {
    await buka();
    const harga = await hargaPaket('shopeefood');
    const item = [{ paketId: 'berdua', qty: 2 }, { menuId: 'americano', ukuran: 'Regular', toppingIds: [], qty: 1 }];
    const struk = await panggil('/transaksi', 'POST', { item, saluran: 'shopeefood', nomorPesanan: 'SF-P', metodeBayar: 'aplikasi' });
    expect(struk.total).toBe(harga * 2 + 16500); // americano 13.000 → impas 16.500
    expect(struk.item.map((i) => i.qty)).toEqual([2, 2, 1]);
    expect((await galat(panggil('/transaksi', 'POST', { item: [{ paketId: 'berdua', qty: 1 }], metodeBayar: 'qris' }))).message).toMatch(/tidak valid/);
    expect((await galat(panggil('/transaksi', 'POST', { item: [{ paketId: 'berdua', menuId: 'thaiTea', qty: 1 }], saluran: 'shopeefood', nomorPesanan: 'X', metodeBayar: 'aplikasi' }))).status).toBe(400);
  });

  it('owner membuat paket: wajib harga minimal satu aplikasi, isi valid, nama unik; crew tidak bisa', async () => {
    const isi = [{ menuId: 'thaiTea', ukuran: 'Large', qty: 2 }];
    expect((await galat(panggil('/paket', 'POST', { nama: 'Duo Large', isi, hargaSaluran: {} }, 'owner'))).perField).toHaveProperty('hargaSaluran');
    expect((await galat(panggil('/paket', 'POST', { nama: 'Duo', isi: [{ menuId: 'thaiTea', ukuran: 'Jumbo', qty: 1 }], hargaSaluran: { gofood: 30000 } }, 'owner'))).perField).toHaveProperty('isi[0].ukuran');
    expect((await galat(panggil('/paket', 'POST', { nama: 'paket berdua', isi, hargaSaluran: { gofood: 30000 } }, 'owner'))).perField).toHaveProperty('nama');
    expect((await galat(panggil('/paket', 'POST', { nama: 'Duo', isi, hargaSaluran: { gofood: 30000 } }))).status).toBe(403);
    const baru = await panggil('/paket', 'POST', { nama: 'Duo Large', isi, hargaSaluran: { gofood: 30000 } }, 'owner');
    expect(baru).toMatchObject({ kode: `paket:${baru.id}`, aktif: true, hargaIsiToko: 30000 });
  });

  it('ukuran menu yang dipakai paket tidak bisa dihapus; kode paket tidak bisa dipetakan; harga massal paket tidak boleh kosong', async () => {
    const m = (await panggil('/menu', 'GET', undefined, 'owner')).find((x) => x.id === 'kopiSusu');
    const tanpaRegular = m.ukuran.filter((u) => u.nama !== 'Regular').map(({ nama, harga, hargaSaluran, resep }) => ({ nama, harga, hargaSaluran, resep }));
    expect((await galat(panggil('/menu/kopiSusu', 'PUT', { nama: m.nama, kategori: m.kategori, ukuran: tanpaRegular, toppingIds: m.toppingIds }, 'owner'))).message).toMatch(/Paket Berdua/);
    expect((await galat(panggil('/saluran/gofood/pemetaan', 'PUT', { kode: 'paket:berdua', isi: [{ menuId: 'thaiTea', ukuran: 'Regular', qty: 1 }] }, 'owner'))).status).toBe(409);
    expect((await galat(panggil('/harga-saluran', 'PUT', { menu: [], topping: [], paket: [{ id: 'berdua', hargaSaluran: {} }] }, 'owner'))).perField).toHaveProperty('paket[0].hargaSaluran');
    const ok = await panggil('/harga-saluran', 'PUT', { menu: [], topping: [], paket: [{ id: 'berdua', hargaSaluran: { grabfood: 31000 } }] }, 'owner');
    expect(ok.paket.find((p) => p.id === 'berdua').hargaSaluran).toEqual({ grabfood: 31000 });
  });
});

describe('pesanan contoh', () => {
  it('total = jumlah item, kode sinkron menu kasir, nomor berawalan per aplikasi', () => {
    const k = buatKatalog();
    let n = 0;
    const acak = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 50; i++) {
      const p = buatPesananContoh({ menu: k.menu, topping: k.topping, saluran: 'grabfood', nomor: i, acak });
      expect(p.total).toBe(p.item.reduce((a, it) => a + it.harga * it.qty, 0));
      expect(p.nomorPesanan.startsWith('GF-')).toBe(true);
      for (const it of p.item) expect(k.menu.some((m) => it.kode.startsWith(`${m.id}:`))).toBe(true);
    }
    expect(() => buatPesananContoh({ menu: k.menu, topping: k.topping, saluran: 'toko', nomor: 1 })).toThrow();
  });
});

describe.each(JENIS_USAHA)('data demo %s: pesanan online', (usaha) => {
  let st;
  beforeAll(async () => {
    st = await buatDataDemo({ usaha, sekarang: new Date('2026-11-03T09:00:00Z') });
  });
  it('±30% dari aplikasi; GoFood & GrabFood lewat pesanan otomatis, ShopeeFood manual', () => {
    const online = st.transaksi.filter((t) => t.saluran !== 'toko');
    expect(online.length / st.transaksi.length).toBeGreaterThan(0.2);
    expect(online.length / st.transaksi.length).toBeLessThan(0.4);
    expect(online.filter((t) => t.saluran === 'shopeefood').every((t) => !t.pesananId)).toBe(true);
    expect(online.filter((t) => t.saluran !== 'shopeefood').every((t) => t.pesananId)).toBe(true);
  });
  it('ada contoh batal, ditolak, dan dua pesanan menunggu (satu menunya belum dikenali)', () => {
    const status = st.pesananMasuk.map((p) => p.status);
    expect(status.filter((s) => s === 'dibatalkan')).toHaveLength(1);
    expect(status.filter((s) => s === 'ditolak')).toHaveLength(1);
    const menunggu = st.pesananMasuk.filter((p) => p.status === 'menunggu');
    expect(menunggu).toHaveLength(2);
    expect(menunggu.some((p) => p.item.some((i) => i.kode === KODE_TIDAK_DIKENAL))).toBe(true);
    expect(st.transaksi.filter((t) => t.batal)).toHaveLength(1);
  });
  it('ada pesanan paket kasir, otomatis dan manual', () => {
    const berPaket = st.transaksi.filter((t) => t.item.some((i) => i.paket));
    expect(berPaket.some((t) => t.pesananId)).toBe(true);
    expect(berPaket.some((t) => t.saluran === 'shopeefood')).toBe(true);
    expect(berPaket.every((t) => t.saluran !== 'toko')).toBe(true);
  });
  it('nomor pesanan unik per saluran', () => {
    const kunci = st.transaksi.filter((t) => t.nomorPesanan).map((t) => `${t.saluran}|${t.nomorPesanan}`);
    expect(new Set(kunci).size).toBe(kunci.length);
  });
});
