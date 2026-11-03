import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { buatMockApi } from './server.js';
import { penyimpananMemori } from './penyimpanan.js';
import { buatKatalog, buatDataDemo } from './dataContoh.js';
import { JENIS_USAHA, KATALOG } from './katalog/index.js';
import { validasiBahan, konversiResep } from '../../../../logika/resep.js';
import { ErrorApi } from '../ErrorApi.js';

let memori, api, jam;
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

// Bahan kunci di katalog: creamer, airThaiTea, airGreenTea, bubukCoklat, bubukMatcha, bijiKopi, cup
const SEMUA_KUNCI = { creamer: 1000, airThaiTea: 4000, airGreenTea: 3000, bubukCoklat: 1000, bubukMatcha: 500, bijiKopi: 1000, cup: 100 };
const bukaPagi = (hitungan = SEMUA_KUNCI, oleh = 'rina') => panggil('/shift/buka', 'POST', { namaShift: 'Pagi', hitungan, kasAwal: 200000 }, oleh);
const thaiTea2 = { item: [{ menuId: 'thaiTea', ukuran: 'Regular', toppingIds: ['tpArenJelly'], qty: 2 }], metodeBayar: 'qris' };

// Test unit memakai mode "hanya bahan kunci" supaya hitungan tetap kecil; mode lain diuji tersendiri.
const katalogUji = (mode = 'tidak') => {
  const k = buatKatalog();
  k.pengaturan.hitungSemuaBahan = mode;
  return k;
};

beforeEach(() => {
  memori = penyimpananMemori();
  jam = new Date('2026-11-03T01:00:00Z'); // 08.00 WIB
  api = buatMockApi({ penyimpanan: memori, buatDataAwal: () => katalogUji(), jedaMs: [0, 0], sekarang: () => jam });
});

describe('akses', () => {
  it('tanpa pengguna → 401, crew ke endpoint owner → 403', async () => {
    expect((await galat(api.panggil('/bahan'))).status).toBe(401);
    expect((await galat(panggil('/shift', 'GET'))).status).toBe(403);
  });
  it('rute tidak ada → 404', async () => {
    expect((await galat(panggil('/tidak-ada'))).kode).toBe('RUTE_TIDAK_ADA');
  });
  it('galat buatan untuk demo', async () => {
    expect((await galat(panggil('/bahan?galat=409'))).status).toBe(409);
  });
});

describe('hitung buta', () => {
  it('crew tidak menerima stok; owner menerima', async () => {
    const crew = await panggil('/bahan');
    expect(crew[0]).not.toHaveProperty('stok');
    const owner = await panggil('/bahan', 'GET', undefined, 'owner');
    expect(owner[0]).toHaveProperty('stok');
  });
  it('tutup shift: crew hanya mendapat konfirmasi, tanpa selisih', async () => {
    await bukaPagi();
    const hasil = await panggil('/shift/tutup', 'POST', { hitungan: SEMUA_KUNCI, kasAkhir: 200000 });
    expect(Object.keys(hasil).sort()).toEqual(['ditutupPada', 'id', 'status']);
  });
});

describe('validasi body (skema zod)', () => {
  it('field asing ditolak', async () => {
    const e = await galat(panggil('/transaksi', 'POST', { ...thaiTea2, diskon: 100 }));
    expect(e.status).toBe(400);
  });
  it('tunai tanpa uang diterima ditolak dengan field yang jelas', async () => {
    await bukaPagi();
    const e = await galat(panggil('/transaksi', 'POST', { item: thaiTea2.item, metodeBayar: 'tunai' }));
    expect(e.perField).toEqual({ uangDiterima: 'Wajib diisi untuk pembayaran tunai' });
  });
});

describe('alur shift', () => {
  it('kasir terkunci sebelum shift dibuka (A-10)', async () => {
    expect((await galat(panggil('/transaksi', 'POST', thaiTea2))).status).toBe(409);
  });

  it('buka shift wajib menghitung semua bahan kunci, tidak lebih', async () => {
    const { cup, ...kurang } = SEMUA_KUNCI;
    expect((await galat(bukaPagi(kurang))).perField).toHaveProperty('hitungan.cup');
    expect((await galat(bukaPagi({ ...SEMUA_KUNCI, gula: 10 }))).perField).toHaveProperty('hitungan.gula');
  });

  it('hanya satu shift terbuka; transaksi mengurangi stok; tutup menghasilkan selisih', async () => {
    await bukaPagi();
    const struk = await panggil('/transaksi', 'POST', thaiTea2);
    expect(struk.total).toBe((12000 + 3000) * 2);
    // 2 × Thai Tea Regular: creamer 16 gr, air thai tea 300 ml, cup 2
    const owner = Object.fromEntries((await panggil('/bahan', 'GET', undefined, 'owner')).map((b) => [b.id, b.stok]));
    expect(owner).toMatchObject({ creamer: 984, airThaiTea: 3700, cup: 98 });

    jam = new Date('2026-11-03T08:00:00Z');
    // creamer fisik 960 → seharusnya 984 → selisih −24 (batas: max(5% × 16 = 0,8, minimum 2) = 2) → perlu dicek
    await panggil('/shift/tutup', 'POST', { hitungan: { ...SEMUA_KUNCI, creamer: 960, airThaiTea: 3700, cup: 98 }, kasAkhir: 200000 }, 'dimas');
    const [ringkas] = await panggil('/shift', 'GET', undefined, 'owner');
    const detail = await panggil(`/shift/${ringkas.id}`, 'GET', undefined, 'owner');
    const creamer = detail.hasil.bahan.find((b) => b.bahanId === 'creamer');
    expect(creamer).toMatchObject({ awal: 1000, pakai: 16, seharusnya: 984, akhir: 960, selisih: -24, batas: 2, status: 'perlu_dicek' });
    expect(detail).toMatchObject({ status: 'ditutup', dibukaOleh: 'Rina', ditutupOleh: 'Dimas' });
    // stok sistem disesuaikan ke hitungan fisik (A-15)
    const sesudah = Object.fromEntries((await panggil('/bahan', 'GET', undefined, 'owner')).map((b) => [b.id, b.stok]));
    expect(sesudah.creamer).toBe(960);
  });

  it('shift lupa ditutup: shift berikutnya menutupnya dengan hitungan buka, serah terima null', async () => {
    await bukaPagi();
    await panggil('/transaksi', 'POST', thaiTea2);
    jam = new Date('2026-11-03T08:00:00Z');
    await panggil('/shift/buka', 'POST', { namaShift: 'Sore', hitungan: { ...SEMUA_KUNCI, creamer: 984 }, kasAwal: 200000 }, 'sari');
    const [baru, lama] = await panggil('/shift', 'GET', undefined, 'owner');
    expect(lama.status).toBe('tidak_ditutup');
    const dLama = await panggil(`/shift/${lama.id}`, 'GET', undefined, 'owner');
    expect(dLama.hasil.sumberAkhir).toBe('buka_berikutnya');
    expect(dLama.hasil.bahan.find((b) => b.bahanId === 'creamer').selisih).toBe(0);
    const dBaru = await panggil(`/shift/${baru.id}`, 'GET', undefined, 'owner');
    expect(dBaru.serahTerima.bahan.every((b) => b.selisih === null)).toBe(true);
  });

  it('selisih serah terima antara tutup dan buka berikutnya', async () => {
    await bukaPagi();
    await panggil('/shift/tutup', 'POST', { hitungan: SEMUA_KUNCI, kasAkhir: 200000 });
    await panggil('/shift/buka', 'POST', { namaShift: 'Sore', hitungan: { ...SEMUA_KUNCI, creamer: 950 }, kasAwal: 195000 }, 'dimas');
    const [baru] = await panggil('/shift', 'GET', undefined, 'owner');
    const d = await panggil(`/shift/${baru.id}`, 'GET', undefined, 'owner');
    expect(d.serahTerima.bahan.find((b) => b.bahanId === 'creamer').selisih).toBe(-50);
    expect(d.serahTerima.kasSelisih).toBe(-5000);
  });

  it('kas: penjualan tunai dan pengeluaran ikut dihitung', async () => {
    await bukaPagi();
    await panggil('/transaksi', 'POST', { item: thaiTea2.item, metodeBayar: 'tunai', uangDiterima: 50000 }); // total 30.000
    await panggil('/pengeluaran-kas', 'POST', { jumlah: 10000, keterangan: 'Es batu' });
    await panggil('/shift/tutup', 'POST', { hitungan: { ...SEMUA_KUNCI, creamer: 984, airThaiTea: 3700, cup: 98 }, kasAkhir: 218000 });
    const [s] = await panggil('/shift', 'GET', undefined, 'owner');
    const d = await panggil(`/shift/${s.id}`, 'GET', undefined, 'owner');
    expect(d.hasil.kas).toEqual({ seharusnya: 220000, selisih: -2000, status: 'perlu_dicek', arah: 'kurang' });
  });
});

describe('transaksi', () => {
  beforeEach(() => bukaPagi());

  it('stok boleh minus: penjualan jalan, ada peringatan tanpa angka (A-08)', async () => {
    // arenJelly stok 0 (belum ada opname di katalog kosong)
    const struk = await panggil('/transaksi', 'POST', thaiTea2);
    expect(struk.peringatanMinus).toContainEqual({ bahanId: 'arenJelly', nama: 'Aren jelly' });
  });
  it('uang kurang ditolak', async () => {
    const e = await galat(panggil('/transaksi', 'POST', { item: thaiTea2.item, metodeBayar: 'tunai', uangDiterima: 20000 }));
    expect(e.perField.uangDiterima).toMatch(/Kurang Rp 10.000/);
  });
  it('request gagal tidak mengubah data (atomik)', async () => {
    const sebelum = memori.baca();
    await galat(panggil('/transaksi', 'POST', { item: [{ menuId: 'thaiTea', ukuran: 'Jumbo', qty: 1 }], metodeBayar: 'qris' }));
    expect(memori.baca()).toBe(sebelum);
  });
});

describe('barang masuk & koreksi (A-12)', () => {
  beforeEach(() => bukaPagi());

  it('satuan bantu dikonversi: 2 karung gula → 50.000 gr', async () => {
    const e = await panggil('/barang-masuk', 'POST', { bahanId: 'gula', jumlah: 2, satuan: 'karung' });
    expect(e).toMatchObject({ jumlahDasar: 50000, satuanDasar: 'gr' });
  });
  it('koreksi wajib alasan, dan tidak boleh membuat jumlah negatif', async () => {
    const asal = await panggil('/barang-masuk', 'POST', { bahanId: 'gula', jumlah: 2, satuan: 'karung' });
    expect((await galat(panggil('/barang-masuk', 'POST', { bahanId: 'gula', jumlah: -1, satuan: 'karung', koreksiDari: asal.id }))).perField).toHaveProperty('alasan');
    await panggil('/barang-masuk', 'POST', { bahanId: 'gula', jumlah: -1, satuan: 'karung', koreksiDari: asal.id, alasan: 'Salah ketik' });
    expect((await galat(panggil('/barang-masuk', 'POST', { bahanId: 'gula', jumlah: -2, satuan: 'karung', koreksiDari: asal.id, alasan: 'x' }))).status).toBe(409);
  });
  it('jumlah negatif tanpa koreksi ditolak', async () => {
    expect((await galat(panggil('/barang-masuk', 'POST', { bahanId: 'gula', jumlah: -1, satuan: 'karung' }))).status).toBe(400);
  });
});

describe('owner: bahan & resep', () => {
  const owner = (alamat, method, body) => panggil(alamat, method, body, 'owner');

  it('toleransi minimum otomatis mengikuti ketelitian hitung per satuan dasar', async () => {
    const bahan = Object.fromEntries((await owner('/bahan', 'GET')).map((b) => [b.id, b]));
    expect(bahan.creamer).toMatchObject({ toleransiMinimum: 2, toleransiMinimumOtomatis: true }); // gr
    expect(bahan.airThaiTea.toleransiMinimum).toBe(10); // ml, bukan 1 garis gelas (150 ml)
    expect(bahan.cup.toleransiMinimum).toBe(0); // pcs dihitung pas
    expect(bahan.oreo.toleransiMinimum).toBe(0); // satuan bebas (keping)
  });
  it('owner bisa mengisi toleransi minimum sendiri', async () => {
    const [creamer] = await owner('/bahan', 'GET');
    const b = await owner('/bahan/creamer', 'PUT', { nama: creamer.nama, satuanDasar: 'gr', satuanBantu: creamer.satuanBantu, bahanKunci: true, toleransiMinimum: 8 });
    expect(b).toMatchObject({ toleransiMinimum: 8, toleransiMinimumOtomatis: false });
  });
  it('satuan dasar terkunci setelah dipakai (A-02)', async () => {
    const [creamer] = await owner('/bahan', 'GET');
    const body = { nama: creamer.nama, satuanDasar: 'kg', satuanBantu: creamer.satuanBantu };
    expect((await galat(owner('/bahan/creamer', 'PUT', body))).status).toBe(409);
  });
  it('satuan bantu yang dipakai resep tidak boleh dihapus', async () => {
    const e = await galat(owner('/bahan/creamer', 'PUT', { nama: 'Creamer bubuk', satuanDasar: 'gr', satuanBantu: [{ nama: 'kaleng', konversi: 1000 }] }));
    expect(e.message).toMatch(/sendok/);
  });
  it('bahan yang dipakai resep tidak bisa diarsipkan (A-09)', async () => {
    expect((await galat(owner('/bahan/creamer/arsip', 'PATCH', { arsip: true }))).status).toBe(409);
  });
  it('resep dengan satuan asing ditolak, field menunjuk barisnya', async () => {
    const e = await galat(owner('/menu', 'POST', {
      nama: 'Es Teh', kategori: 'Teh',
      ukuran: [{ nama: 'Regular', harga: 5000, resep: [{ bahanId: 'gula', jumlah: 1, satuan: 'gelas' }] }],
    }));
    expect(e.detail[0].field).toBe('ukuran[0].resep[0].satuan');
  });
  it('bahan baru dengan satuan bebas', async () => {
    const b = await owner('/bahan', 'POST', { nama: 'Telur', satuanDasar: 'butir', satuanBantu: [{ nama: 'tray', konversi: 30 }] });
    expect(b).toMatchObject({ satuanDasar: 'butir', stok: 0, toleransiPersen: 5, toleransiMinimumOtomatis: true });
  });
});

describe('laporan harian', () => {
  it('crew hanya hari ini', async () => {
    expect((await galat(panggil('/laporan/harian?tanggal=2026-11-01'))).status).toBe(403);
    const lap = await panggil('/laporan/harian');
    expect(lap.tanggal).toBe('2026-11-03');
  });
});

describe.each(JENIS_USAHA)('katalog %s', (usaha) => {
  const K = KATALOG[usaha];
  it('semua bahan dan resep lolos validasi logika/', () => {
    K.bahan.forEach((b) => expect(() => validasiBahan(b), b.id).not.toThrow());
    const idx = new Map(K.bahan.map((b) => [b.id, b]));
    K.menu.forEach((m) => m.ukuran.forEach((u) => expect(() => konversiResep(u.resep, idx, `${m.id} ${u.nama}`)).not.toThrow()));
    K.topping.forEach((t) => expect(() => konversiResep(t.resep, idx, t.id)).not.toThrow());
  });
  it('topping yang dirujuk menu ada; stok fisik awal untuk setiap bahan; bahan kejadian ada', () => {
    const topping = new Set(K.topping.map((t) => t.id));
    K.menu.forEach((m) => m.toppingIds.forEach((t) => expect(topping.has(t), `${m.id} → ${t}`).toBe(true)));
    expect(Object.keys(K.fisikAwal).sort()).toEqual(K.bahan.map((b) => b.id).sort());
    const ids = new Set(K.bahan.map((b) => b.id));
    expect(ids.has(K.kejadian.boros) && ids.has(K.kejadian.salahInput.bahanId) && ids.has(K.kejadian.hilangMalam.bahanId)).toBe(true);
    expect(K.pengguna.filter((p) => p.peran === 'crew').length).toBeGreaterThanOrEqual(2);
    expect(K.pengguna.some((p) => p.id === 'owner' && p.peran === 'owner')).toBe(true);
  });
});

describe.each(JENIS_USAHA)('data demo %s (30 hari)', (usaha) => {
  const sekarang = new Date('2026-11-03T02:00:00Z');
  let st;
  beforeAll(async () => {
    st = await buatDataDemo({ sekarang, usaha });
  });

  it('deterministik: dua kali dibuat hasilnya sama', async () => {
    expect(JSON.stringify(await buatDataDemo({ sekarang, usaha }))).toBe(JSON.stringify(st));
  });

  it('30 hari × 2 shift + shift hari ini yang masih terbuka', () => {
    expect(st.shift).toHaveLength(61);
    expect(st.shift.at(-1).status).toBe('terbuka');
    expect(st.shift.filter((s) => s.status === 'tidak_ditutup')).toHaveLength(1);
    expect(st.transaksi.length).toBeGreaterThan(1000);
    expect(st.opname.length).toBeGreaterThanOrEqual(5); // awal + mingguan
  });

  it('berisi semua kasus yang dijanjikan rencana, dan sebagian besar shift wajar', () => {
    const baris = st.shift.flatMap((s) => s.hasil?.bahan ?? []);
    expect(baris.some((r) => r.status === 'perlu_dicek' && r.arah === 'kurang')).toBe(true);
    expect(baris.some((r) => r.status === 'perlu_dicek' && r.arah === 'lebih')).toBe(true);
    expect(baris.filter((r) => r.status === 'wajar').length / baris.length).toBeGreaterThan(0.95);
    expect(st.shift.some((s) => s.hasil?.kas?.status === 'perlu_dicek')).toBe(true);
    expect(st.shift.some((s) => s.serahTerima?.bahan.some((b) => b.selisihX10 && b.selisihX10 !== 0))).toBe(true);
    expect(st.barangMasuk.some((e) => e.koreksiDari)).toBe(true);
  });

  it('stok sistem tidak ada yang minus di akhir (restok mengikuti pemakaian)', () => {
    expect(Object.entries(st.stok).filter(([, v]) => v < 0)).toEqual([]);
  });

  it('kas pagi kembali ke modal kecuali setelah shift yang lupa ditutup', () => {
    const pagi = st.shift.filter((s, i) => s.nama === 'Pagi' && i > 0 && st.shift[i - 1].status === 'ditutup');
    expect(pagi.every((s) => s.kasAwal <= 200000)).toBe(true);
    const setelahLupa = st.shift.find((s, i) => i > 0 && st.shift[i - 1].status === 'tidak_ditutup');
    expect(setelahLupa.kasAwal).toBeGreaterThan(200000);
  });

  it('tidak ada kejadian di masa depan', () => {
    const semua = [...st.transaksi.map((t) => t.pada), ...st.barangMasuk.map((e) => e.pada), ...st.shift.flatMap((s) => [s.dibukaPada, s.ditutupPada].filter(Boolean))];
    expect(semua.every((p) => new Date(p) <= sekarang)).toBe(true);
  });

  it('saran toleransi muncul untuk bahan kunci', async () => {
    const m = penyimpananMemori();
    m.tulis(JSON.stringify(st));
    const a = buatMockApi({ penyimpanan: m, buatDataAwal: () => buatKatalog(usaha), jedaMs: [0, 0], sekarang: () => sekarang });
    const { data } = await a.panggil('/bahan', { penggunaId: 'owner' });
    const b = data.find((x) => x.id === KATALOG[usaha].kejadian.boros);
    expect(b.saranToleransi.jumlahShift).toBeGreaterThanOrEqual(10);
  });
});

describe('data demo: waktu', () => {
  it('tidak ada kejadian di masa depan, berapa pun jam demo dibuka', async () => {
    for (const iso of ['2026-11-03T00:30:00Z', '2026-11-03T14:00:00Z', '2026-11-02T18:30:00Z']) {
      const sekarang = new Date(iso);
      const st = await buatDataDemo({ sekarang, hari: 6 });
      const semua = [...st.transaksi.map((t) => t.pada), ...st.penyesuaian.map((e) => e.pada), ...st.shift.flatMap((s) => [s.dibukaPada, s.ditutupPada].filter(Boolean))];
      expect(semua.every((p) => new Date(p) <= sekarang), iso).toBe(true);
    }
  });
  it('jenis usaha tak dikenal dan hari terlalu pendek ditolak', async () => {
    await expect(buatDataDemo({ usaha: 'bengkel' })).rejects.toThrow(/tidak dikenal/);
    await expect(buatDataDemo({ hari: 2 })).rejects.toThrow(RangeError);
  });
});

describe('daftar per shift untuk crew', () => {
  it('barang masuk & pengeluaran shift ini; kosong jika tidak ada shift', async () => {
    expect(await panggil('/barang-masuk/shift-ini')).toEqual([]);
    expect(await panggil('/pengeluaran-kas/shift-ini')).toEqual({ hitungKas: true, data: [] });
    await bukaPagi();
    await panggil('/barang-masuk', 'POST', { bahanId: 'gula', jumlah: 1, satuan: 'karung' });
    await panggil('/pengeluaran-kas', 'POST', { jumlah: 10000, keterangan: 'Es batu' });
    const masuk = await panggil('/barang-masuk/shift-ini');
    expect(masuk).toHaveLength(1);
    expect(masuk[0]).toMatchObject({ nama: 'Gula pasir', jumlah: 1, satuan: 'karung', jumlahDasar: 25000, oleh: 'Rina' });
    const keluar = await panggil('/pengeluaran-kas/shift-ini');
    expect(keluar.data[0]).toMatchObject({ jumlah: 10000, keterangan: 'Es batu', oleh: 'Rina' });
  });
});

describe('shift aktif menyebut siapa yang membuka', () => {
  it('dibukaOlehId dan nama', async () => {
    await bukaPagi(SEMUA_KUNCI, 'dimas');
    expect(await panggil('/shift/aktif', 'GET', undefined, 'sari')).toMatchObject({ dibukaOlehId: 'dimas', dibukaOleh: 'Dimas' });
  });
});

describe('hitung semua bahan (pengaturan hitungSemuaBahan)', () => {
  const SEMUA = Object.fromEntries(buatKatalog().bahan.map((b) => [b.id, 100]));
  const pakaiMode = (mode) => {
    api = buatMockApi({ penyimpanan: penyimpananMemori(), buatDataAwal: () => katalogUji(mode), jedaMs: [0, 0], sekarang: () => jam });
  };
  const buka = (nama, hitungan, oleh = 'rina') => panggil('/shift/buka', 'POST', { namaShift: nama, hitungan, kasAwal: 200000 }, oleh);
  const tutup = (hitungan, oleh = 'rina') => panggil('/shift/tutup', 'POST', { hitungan, kasAkhir: 200000 }, oleh);
  const kunciSaja = (n = 100) => Object.fromEntries(Object.keys(SEMUA_KUNCI).map((id) => [id, n]));

  it('outlet: buka Pagi = semua bahan, tutup Pagi = bahan kunci, buka Sore = kunci, tutup Sore = semua', async () => {
    pakaiMode('outlet');
    const p = await panggil('/shift/persiapan');
    expect(p.bahanBuka.Pagi.semua).toBe(true);
    expect(p.bahanBuka.Pagi.bahan).toHaveLength(Object.keys(SEMUA).length);
    expect(p.bahanBuka.Sore.semua).toBe(false);
    // hanya bahan kunci saat buka outlet → ditolak
    expect((await galat(buka('Pagi', kunciSaja()))).perField).toHaveProperty('hitungan.gula');
    await buka('Pagi', SEMUA);
    expect((await panggil('/shift/aktif')).tutupSemuaBahan).toBe(false);
    await tutup(kunciSaja());
    await buka('Sore', kunciSaja(), 'dimas');
    expect((await panggil('/shift/aktif', 'GET', undefined, 'dimas')).bahanTutup).toHaveLength(Object.keys(SEMUA).length);
    await tutup(SEMUA, 'dimas');
  });

  it('outlet: serah terima malam membandingkan semua bahan; selisih shift hanya bahan yang dihitung di awal dan akhir', async () => {
    pakaiMode('outlet');
    await buka('Pagi', SEMUA);
    await tutup(kunciSaja());
    await buka('Sore', kunciSaja(), 'dimas');
    await tutup({ ...SEMUA, gula: 90 }, 'dimas');
    jam = new Date('2026-11-04T00:00:00Z');
    await buka('Pagi', { ...SEMUA, gula: 80 }, 'sari'); // 10 gr gula hilang semalam
    const [pagiBesok, sore] = await panggil('/shift', 'GET', undefined, 'owner');
    const dSore = await panggil(`/shift/${sore.id}`, 'GET', undefined, 'owner');
    expect(dSore.hasil.bahan.map((b) => b.bahanId).sort()).toEqual(Object.keys(SEMUA_KUNCI).sort()); // gula bukan bahan kunci
    const dPagi = await panggil(`/shift/${pagiBesok.id}`, 'GET', undefined, 'owner');
    expect(dPagi.serahTerima.bahan).toHaveLength(Object.keys(SEMUA).length);
    expect(dPagi.serahTerima.bahan.find((b) => b.bahanId === 'gula').selisih).toBe(-10);
  });

  it('setiap_shift: semua bahan di setiap buka dan tutup, selisih untuk semua bahan', async () => {
    pakaiMode('setiap_shift');
    const p = await panggil('/shift/persiapan');
    expect(p.bahanBuka.Sore.semua).toBe(true);
    await buka('Pagi', SEMUA);
    await tutup({ ...SEMUA, gula: 95 });
    const [s] = await panggil('/shift', 'GET', undefined, 'owner');
    const d = await panggil(`/shift/${s.id}`, 'GET', undefined, 'owner');
    expect(d.hasil.bahan).toHaveLength(Object.keys(SEMUA).length);
    expect(d.hasil.bahan.find((b) => b.bahanId === 'gula')).toMatchObject({ selisih: -5, status: 'perlu_dicek' });
  });

  it('pengaturan wajib menyebut mode; mode asing ditolak', async () => {
    const body = { shift: [{ nama: 'Pagi' }], hitungKas: true, toleransiKasRupiah: 0 };
    expect((await galat(panggil('/pengaturan', 'PUT', body, 'owner'))).status).toBe(400);
    expect((await galat(panggil('/pengaturan', 'PUT', { ...body, hitungSemuaBahan: 'kadang' }, 'owner'))).status).toBe(400);
    expect((await panggil('/pengaturan', 'PUT', { ...body, hitungSemuaBahan: 'setiap_shift' }, 'owner')).hitungSemuaBahan).toBe('setiap_shift');
  });
});

describe('buka shift ganda', () => {
  it('orang yang sama membuka lagi dalam 10 menit → 409, shift pertama tetap terbuka', async () => {
    await bukaPagi();
    jam = new Date(jam.getTime() + 60 * 1000);
    expect((await galat(bukaPagi())).status).toBe(409);
    const [s] = await panggil('/shift', 'GET', undefined, 'owner');
    expect(s.status).toBe('terbuka');
  });
  it('orang lain, atau orang yang sama setelah lama (lupa tutup), tetap boleh', async () => {
    await bukaPagi();
    jam = new Date(jam.getTime() + 60 * 1000);
    await panggil('/shift/buka', 'POST', { namaShift: 'Sore', hitungan: SEMUA_KUNCI, kasAwal: 200000 }, 'dimas');
    jam = new Date(jam.getTime() + 12 * 3600 * 1000);
    await panggil('/shift/buka', 'POST', { namaShift: 'Pagi', hitungan: SEMUA_KUNCI, kasAwal: 200000 }, 'dimas');
    const [baru, lama] = await panggil('/shift', 'GET', undefined, 'owner');
    expect([baru.status, lama.status]).toEqual(['terbuka', 'tidak_ditutup']);
  });
});
