// Data contoh untuk demo. Semua angka contoh, bukan ukuran asli dari usaha mana pun.
//
// Katalog (bahan, menu, topping) ditulis di katalog/<usaha>.js. Riwayat shift dibuat lewat
// mock API itu sendiri, supaya selisih, toleransi, dan kas dihitung oleh kode yang sama
// dengan pemakaian sungguhan.
//
//   katalog/<usaha>.js ──buatKatalog──▶ state kosong (stok 0, tanpa riwayat)
//                                           │
//          buatDataDemo: simulasi hari demi hari lewat api.panggil(...)
//          (stok "fisik" disimulasikan terpisah; crew menghitungnya saat buka/tutup shift)
//                                           ▼
//                                 state lengkap 30 hari

import { buatMockApi } from './server.js';
import { penyimpananObjek } from './penyimpanan.js';
import { KATALOG } from './katalog/index.js';
import { buatPesananContoh, nomorPesanan } from './pesananContoh.js';
import { hargaImpas } from '../../../../logika/saluran.js';
import { statusPaket, waktuLokal } from '../../../../logika/jadwal.js';

const ZONA = 'Asia/Jakarta';
// Tanggal lokal n hari dari sekarang + jam → "YYYY-MM-DDTHH:mm"
const tanggalRelatif = (sekarang, n, jam) => `${waktuLokal(new Date(sekarang.getTime() + n * 86400000).toISOString(), ZONA).waktu.slice(0, 10)}T${jam}`;

const MODAL_LACI = 200000;
// Paket yang dijual pada jam itu (jadwal promo), untuk pesanan contoh.
const paketBerlaku = (paket, jam) => paket.map((p) => ({ ...p, dijual: statusPaket(p, jam.toISOString(), ZONA).dijual }));
// Satuan yang dihitung pas (tidak ada takaran yang meleset).
const SATUAN_HITUNGAN = new Set(['pcs', 'keping', 'butir', 'lembar', 'buah']);

// Harga di aplikasi contoh: impas dengan komisi contoh 20% (harga ÷ 0,8, dibulatkan ke atas Rp 500),
// jadi pendapatan bersih per menu sama dengan di toko.
const KOMISI_CONTOH = 20;
const hargaSaluran = (harga) => ({ gofood: hargaImpas(harga, KOMISI_CONTOH), grabfood: hargaImpas(harga, KOMISI_CONTOH), shopeefood: hargaImpas(harga, KOMISI_CONTOH) });

export function buatKatalog(usaha = 'teh', sekarang = new Date()) {
  const k = KATALOG[usaha];
  if (!k) throw new TypeError(`Jenis usaha tidak dikenal: ${usaha}`);
  const menu = structuredClone(k.menu).map((m) => ({ ...m, ukuran: m.ukuran.map((u) => ({ ...u, hargaSaluran: hargaSaluran(u.harga) })) }));
  const topping = structuredClone(k.topping).map((t) => ({ ...t, hargaSaluran: hargaSaluran(t.harga) }));
  // Paket promo: harga isi di toko dikurangi 10%, lalu impas komisi. Hanya dijual di aplikasi.
  const hargaToko = (mId, uk) => menu.find((m) => m.id === mId).ukuran.find((u) => u.nama === uk).harga;
  const paket = structuredClone(k.paket ?? []).map(({ jadwalRelatif, ...p }) => {
    const promo = Math.round(p.isi.reduce((a, i) => a + hargaToko(i.menuId, i.ukuran) * i.qty, 0) * 0.9);
    const jadwal = jadwalRelatif
      ? { mulai: tanggalRelatif(sekarang, jadwalRelatif.mulaiHari, '00:00'), selesai: tanggalRelatif(sekarang, jadwalRelatif.selesaiHari, '23:59') }
      : p.jadwal ?? null;
    return { ...p, hargaSaluran: hargaSaluran(promo), aktif: true, jadwal };
  });
  const sejak = new Date(sekarang.getTime() - 40 * 86400000).toISOString();
  return {
    versi: 4,
    usaha,
    urut: 0,
    pengguna: structuredClone(k.pengguna),
    bahan: structuredClone(k.bahan),
    menu,
    topping,
    paket,
    pengaturan: {
      shift: [{ nama: 'Pagi' }, { nama: 'Sore' }], hitungKas: true, toleransiKasRupiah: 0, hitungSemuaBahan: 'outlet', zonaWaktu: 'Asia/Jakarta',
      // GoFood & GrabFood "tersambung" (simulasi), ShopeeFood dicatat manual. Komisi = angka contoh.
      saluran: {
        gofood: { aktif: true, mode: 'otomatis', komisiPersen: KOMISI_CONTOH, tersambungPada: sejak },
        grabfood: { aktif: true, mode: 'otomatis', komisiPersen: KOMISI_CONTOH, tersambungPada: sejak },
        shopeefood: { aktif: true, mode: 'manual', komisiPersen: KOMISI_CONTOH, tersambungPada: null },
      },
    },
    pesananMasuk: [],
    pemetaan: {},
    stok: Object.fromEntries(k.bahan.map((b) => [b.id, 0])),
    shift: [],
    transaksi: [],
    barangMasuk: [],
    pengeluaranKas: [],
    penyesuaian: [],
    opname: [],
  };
}

// Pembangkit acak berbenih tetap (mulberry32): hasil sama setiap dijalankan.
function acakBerbenih(benih) {
  let a = benih >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Tanggal `mulai` + `hari`, jam WIB (UTC+7) → Date.
function jamJakarta(mulai, hari, jam, menit = 0) {
  return new Date(Date.UTC(mulai.getUTCFullYear(), mulai.getUTCMonth(), mulai.getUTCDate() + hari, jam - 7, menit));
}

// Kejadian khusus per indeks shift (0 = hari pertama Pagi), supaya demo punya contoh setiap kasus.
// Bahan yang terlibat diambil dari katalog.kejadian.
function jadwalKejadian(jumlahShift) {
  const jadwal = {};
  const pasang = (i, k) => {
    // Data pendek (test) tetap memuat semua kasus: indeks dipotong ke shift terakhir yang ditutup.
    const j = Math.min(i, jumlahShift - 2);
    jadwal[j] = { ...jadwal[j], ...k };
  };
  pasang(6, { salahInput: true });
  pasang(9, { boros: 0.15 });
  pasang(11, { kasHilang: 5000 });
  pasang(15, { hilangMalam: true });
  pasang(21, { takaranKurang: 0.08 });
  pasang(27, { tidakDitutup: true });
  pasang(44, { boros: 0.12 });
  pasang(12, { batalAplikasi: true });
  pasang(18, { tolakOnline: true });
  return jadwal;
}

/**
 * @param {{ sekarang?: Date, hari?: number, benih?: number, usaha?: keyof KATALOG }} opsi
 * @returns {Promise<object>} state mock lengkap
 */
export async function buatDataDemo({ sekarang = new Date(), hari = 30, benih = 2026, usaha = 'teh' } = {}) {
  if (!Number.isInteger(hari) || hari < 4) throw new RangeError('hari minimal 4 supaya semua kasus muat');
  const K = KATALOG[usaha];
  if (!K) throw new TypeError(`Jenis usaha tidak dikenal: ${usaha}`);

  const acak = acakBerbenih(benih);
  const pilih = (arr) => arr[Math.floor(acak() * arr.length)];
  const antara = (a, b) => a + Math.floor(acak() * (b - a + 1));

  // Mode cepat: state dipegang sebagai objek (tanpa JSON) dan tidak disalin per panggilan.
  // Aman di sini karena galat apa pun saat membuat data demo adalah bug dan langsung dilempar.
  const memori = penyimpananObjek();
  let jam = new Date(sekarang);
  const api = buatMockApi({ penyimpanan: memori, buatDataAwal: () => buatKatalog(usaha, sekarang), jedaMs: [0, 0], sekarang: () => jam, salin: false });
  const st = () => memori.bacaObjek();
  const panggil = async (alamat, method, body, penggunaId) => (await api.panggil(alamat, { method, body, penggunaId })).data;
  const maju = (menit) => (jam = new Date(jam.getTime() + menit * 60000));

  const hariIni = jamJakarta(sekarang, 0, 0);
  const mulai = new Date(hariIni.getTime() - hari * 86400000 + 7 * 3600000);

  // Stok fisik "sebenarnya" di dapur (×10). Sistem tidak tahu angka ini.
  const fisik = Object.fromEntries(Object.entries(K.fisikAwal).map(([id, n]) => [id, Math.round(n * 10)]));
  let kasLaci = MODAL_LACI;
  const pakaiTerakhir = {}; // ×10, pemakaian satu shift terbesar sejauh ini, per bahan
  const hitung = (ids) => Object.fromEntries(ids.map((id) => [id, Math.round(fisik[id] / 10)])); // dihitung per 1 satuan

  let nomorUrut = 100230; // nomor pesanan aplikasi
  const crew = K.pengguna.filter((p) => p.peran === 'crew').map((p) => p.id);
  const satuanBeli = (b) => [...b.satuanBantu].sort((x, y) => y.konversi - x.konversi)[0];

  // Opname awal oleh owner, supaya semua bahan punya stok sistem.
  jam = jamJakarta(mulai, 0, 6, 30);
  await panggil('/opname', 'POST', { hitungan: hitung(Object.keys(fisik)) }, 'owner');

  const jumlahShift = hari * 2 + 1; // + shift Pagi hari ini (dibiarkan terbuka)
  const KHUSUS = jadwalKejadian(jumlahShift);
  const kj = K.kejadian;

  for (let i = 0; i < jumlahShift; i++) {
    const d = Math.floor(i / 2);
    const pagi = i % 2 === 0;
    const khusus = KHUSUS[i] ?? {};
    const hariIniTerbuka = i === jumlahShift - 1;
    const oleh = pagi ? crew[d % crew.length] : crew[(d + 1) % crew.length];

    // Buka shift. Shift hari ini tidak boleh dibuka di masa depan (demo bisa dibuka jam berapa pun).
    jam = jamJakarta(mulai, d, pagi ? 7 : 15, antara(0, 10));
    if (hariIniTerbuka && jam.getTime() > sekarang.getTime() - 60 * 60000) jam = new Date(sekarang.getTime() - 60 * 60000);
    const namaShift = pagi ? 'Pagi' : 'Sore';
    // Bahan yang dihitung mengikuti pengaturan (buka outlet = semua bahan), sama seperti di layar crew.
    const persiapan = await panggil('/shift/persiapan', 'GET', undefined, oleh);
    await panggil('/shift/buka', 'POST', { namaShift, hitungan: hitung(persiapan.bahanBuka[namaShift].bahan.map((b) => b.id)), kasAwal: kasLaci }, oleh);

    // Stok opname mingguan (Pagi hari ke-7, 14, …): semua bahan, termasuk yang bukan bahan kunci.
    if (pagi && d > 0 && d % 7 === 0 && !hariIniTerbuka) {
      maju(5);
      await panggil('/opname', 'POST', { hitungan: hitung(st().bahan.filter((b) => !b.arsip).map((b) => b.id)) }, oleh);
    }

    // Barang masuk jika fisik tidak cukup untuk satu shift lagi (perkiraan: pemakaian shift terbesar sejauh ini × 1,5).
    // Di hari-hari awal riwayat pemakaian belum ada, jadi restok juga dimulai saat fisik turun di bawah separuh stok awal.
    for (const b of st().bahan) {
      const target = Math.max(b.batasMinimumX10 * 2, Math.round((pakaiTerakhir[b.id] ?? 0) * 1.5), Math.round((K.fisikAwal[b.id] ?? 0) * 5));
      if (fisik[b.id] > target) continue;
      if (khusus.salahInput && b.id === kj.salahInput.bahanId) continue; // ditangani di bawah
      const beli = satuanBeli(b);
      const konversiX10 = Math.round(beli.konversi * 10);
      const jumlah = Math.max(1, Math.ceil((target * 1.5 - fisik[b.id]) / konversiX10));
      maju(5);
      await panggil('/barang-masuk', 'POST', { bahanId: b.id, jumlah, satuan: beli.nama }, oleh);
      fisik[b.id] += jumlah * konversiX10;
    }
    if (khusus.salahInput) {
      const { bahanId, satuan, alasan } = kj.salahInput;
      const konversi = st().bahan.find((b) => b.id === bahanId).satuanBantu.find((s) => s.nama === satuan).konversi;
      maju(5);
      const salah = await panggil('/barang-masuk', 'POST', { bahanId, jumlah: 2, satuan }, oleh);
      fisik[bahanId] += Math.round(konversi * 10); // yang datang sebenarnya 1
      maju(30);
      await panggil('/barang-masuk', 'POST', { bahanId, jumlah: -1, satuan, koreksiDari: salah.id, alasan }, oleh);
    }

    // Pengeluaran kas sesekali
    if (acak() < 0.35) {
      maju(10);
      await panggil('/pengeluaran-kas', 'POST', { jumlah: pilih([5000, 10000, 15000]), keterangan: pilih(['Beli es batu', 'Beli gas', 'Parkir kurir', 'Beli plastik']) }, oleh);
      kasLaci -= st().pengeluaranKas.at(-1).jumlah;
    }

    // Penjualan, disebar rata sepanjang jam shift (Pagi 07–15, Sore 15–22).
    const katalog = st();
    const jumlahTrx = hariIniTerbuka ? 6 : antara(14, 24) + (d % 7 >= 5 ? 6 : 0); // akhir pekan lebih ramai
    const awalJual = jam.getTime() + 10 * 60000;
    const akhirShift = jamJakarta(mulai, d, pagi ? 14 : 21, 30).getTime();
    const akhirJual = hariIniTerbuka ? Math.min(akhirShift, sekarang.getTime() - 2 * 60000) : akhirShift;
    const jarak = Math.max(0, akhirJual - awalJual) / jumlahTrx;
    let sudahBatal = false;
    let sudahTolak = false;
    for (let t = 0; t < jumlahTrx; t++) {
      jam = new Date(awalJual + t * jarak + acak() * jarak * 0.8);
      // ±30% pesanan dari aplikasi: GoFood & GrabFood masuk otomatis, ShopeeFood dicatat manual.
      const r = acak();
      const saluran = r < 0.7 ? 'toko' : r < 0.82 ? 'gofood' : r < 0.92 ? 'grabfood' : 'shopeefood';

      if (saluran === 'gofood' || saluran === 'grabfood') {
        const pesanan = buatPesananContoh({ menu: katalog.menu, topping: katalog.topping, paket: paketBerlaku(katalog.paket, jam), saluran, nomor: ++nomorUrut, acak });
        const masuk = await panggil(`/integrasi/${saluran}/pesanan`, 'POST', pesanan, oleh);
        maju(1);
        if (khusus.tolakOnline && !sudahTolak) {
          sudahTolak = true;
          await panggil(`/pesanan-online/${masuk.id}/tolak`, 'POST', { alasan: 'Antrean terlalu panjang' }, oleh);
          continue; // tidak dibuat: stok fisik tidak berkurang
        }
        await panggil(`/pesanan-online/${masuk.id}/terima`, 'POST', undefined, oleh);
        if (khusus.batalAplikasi && !sudahBatal) {
          sudahBatal = true; // minuman sudah dibuat, lalu pelanggan membatalkan di aplikasi
          maju(4);
          await panggil(`/integrasi/${saluran}/batal`, 'POST', { nomorPesanan: pesanan.nomorPesanan, alasan: 'Dibatalkan pelanggan' }, oleh);
        }
      } else {
        const item = [];
        const jumlahBaris = acak() < 0.3 ? 2 : 1;
        for (let n = 0; n < jumlahBaris; n++) {
          const menu = pilih(katalog.menu);
          const toppingIds = menu.toppingIds.length && acak() < 0.4 ? [pilih(menu.toppingIds)] : [];
          const baru = { menuId: menu.id, ukuran: pilih(menu.ukuran).nama, toppingIds, qty: acak() < 0.2 ? 2 : 1 };
          if (!item.some((x) => x.menuId === baru.menuId && x.ukuran === baru.ukuran && x.toppingIds.join() === baru.toppingIds.join())) item.push(baru);
        }
        if (saluran === 'shopeefood') {
          // Sebagian pesanan ShopeeFood memakai paket kasir (dicatat manual dari tablet).
          const pk = katalog.paket.filter((p) => statusPaket(p, jam.toISOString(), ZONA).dijual && Number.isInteger(p.hargaSaluran.shopeefood));
          if (pk.length && acak() < 0.25) item.push({ paketId: pilih(pk).id, qty: 1 });
          await panggil('/transaksi', 'POST', { item, saluran, nomorPesanan: nomorPesanan('shopeefood', ++nomorUrut), metodeBayar: 'aplikasi' }, oleh);
        } else {
          const total = item.reduce((a, it) => {
            const m = katalog.menu.find((x) => x.id === it.menuId);
            const tp = it.toppingIds.reduce((s, tid) => s + katalog.topping.find((x) => x.id === tid).harga, 0);
            return a + (m.ukuran.find((u) => u.nama === it.ukuran).harga + tp) * it.qty;
          }, 0);
          const tunai = acak() < 0.55;
          const uang = Math.ceil(total / 5000) * 5000 + (acak() < 0.3 ? 5000 : 0);
          await panggil('/transaksi', 'POST', tunai ? { item, metodeBayar: 'tunai', uangDiterima: uang } : { item, metodeBayar: 'qris' }, oleh);
          if (tunai) kasLaci += total;
        }
      }

      // Pemakaian fisik = resep × faktor takaran crew (tidak pernah tepat).
      const trx = st().transaksi.at(-1);
      for (const [id, x10] of Object.entries(trx.pemakaian)) {
        const satuan = katalog.bahan.find((b) => b.id === id).satuanDasar;
        let faktor = 1 + acak() * 0.04; // boros 0–4%, wajar
        if (khusus.boros && id === kj.boros) faktor = 1 + khusus.boros;
        if (khusus.takaranKurang) faktor = 1 - khusus.takaranKurang;
        if (SATUAN_HITUNGAN.has(satuan)) faktor = 1; // barang hitungan tidak meleset
        fisik[id] -= Math.round(x10 * faktor);
        // Invariant simulasi: dapur tidak bisa memakai bahan yang tidak ada. Jika ini terjadi, restok di atas kurang.
        if (fisik[id] < 0) throw new Error(`Data demo ${usaha}: stok fisik ${id} habis di shift ${i}; perbesar fisikAwal atau restok`);
      }
    }
    if (hariIniTerbuka) {
      // Dua pesanan baru saja masuk dan belum diterima; satu berisi menu yang dibuat langsung di aplikasi.
      jam = new Date(sekarang.getTime() - 3 * 60000);
      await panggil('/integrasi/gofood/pesanan', 'POST', buatPesananContoh({ menu: katalog.menu, topping: katalog.topping, paket: paketBerlaku(katalog.paket, jam), saluran: 'gofood', nomor: ++nomorUrut, acak }), oleh);
      jam = new Date(sekarang.getTime() - 60000);
      await panggil('/integrasi/grabfood/pesanan', 'POST', buatPesananContoh({ menu: katalog.menu, topping: katalog.topping, paket: paketBerlaku(katalog.paket, jam), saluran: 'grabfood', nomor: ++nomorUrut, acak, tidakDikenal: true }), oleh);
    }
    if (khusus.kasHilang) kasLaci -= khusus.kasHilang;
    const trxShift = st().transaksi.filter((t) => t.shiftId === st().shift.at(-1).id);
    for (const b of st().bahan) pakaiTerakhir[b.id] = Math.max(pakaiTerakhir[b.id] ?? 0, trxShift.reduce((a, t) => a + (t.pemakaian[b.id] ?? 0), 0));
    if (hariIniTerbuka) break;

    // Akhir hari: uang disetor ke owner, laci disisakan modal (dicatat sebagai pengeluaran kas).
    if (!pagi && !khusus.tidakDitutup && kasLaci > MODAL_LACI) {
      maju(10);
      await panggil('/pengeluaran-kas', 'POST', { jumlah: kasLaci - MODAL_LACI, keterangan: 'Setor ke owner' }, oleh);
      kasLaci = MODAL_LACI;
    }

    if (!khusus.tidakDitutup) {
      maju(15);
      const aktif = await panggil('/shift/aktif', 'GET', undefined, oleh);
      await panggil('/shift/tutup', 'POST', { hitungan: hitung(aktif.bahanTutup.map((b) => b.id)), kasAkhir: kasLaci }, oleh);
    }
    if (khusus.hilangMalam) {
      const { bahanId, jumlah } = kj.hilangMalam;
      fisik[bahanId] = Math.max(0, fisik[bahanId] - Math.round(jumlah * 10));
    }
  }

  return memori.bacaObjek();
}
