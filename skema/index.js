// Skema body request (zod). Dipakai mock sekarang dan Express nanti.
//
// Aturan bentuk:
//   - Semua objek .strict(): field asing → 400 (mencegah salah ketik diam-diam).
//   - Jumlah bahan di API memakai angka biasa dalam satuan dasar (8 = 8 gr).
//     Konversi ke ×10 dilakukan di dalam backend/mock, frontend tidak pernah melihat ×10.
//   - Uang: rupiah, bilangan bulat.
//
// Aturan bisnis lintas data (bahan dipakai resep, shift terbuka, dll.) TIDAK di sini,
// tetapi di logika/ dan handler, karena butuh keadaan data.

import { z } from 'zod';
import { SALURAN, SALURAN_ONLINE } from '../logika/saluran.js';

const teks = (maks) => z.string().trim().min(1, 'Wajib diisi').max(maks, `Maksimal ${maks} karakter`);
const id = z.string().min(1).max(60);
const angkaPositif = z.number({ invalid_type_error: 'Wajib angka' }).finite().positive('Wajib lebih dari 0');
const angkaMinNol = z.number({ invalid_type_error: 'Wajib angka' }).finite().min(0, 'Tidak boleh negatif');
const rupiah = z.number({ invalid_type_error: 'Wajib angka' }).int('Wajib rupiah bulat').min(0, 'Tidak boleh negatif');

// ---------- bahan ----------
export const SatuanBantu = z.object({ nama: teks(30), konversi: angkaPositif }).strict();

export const BahanBody = z
  .object({
    nama: teks(60),
    satuanDasar: teks(20),
    satuanBantu: z.array(SatuanBantu).max(10).default([]),
    batasMinimum: angkaMinNol.default(0),
    bahanKunci: z.boolean().default(false),
    toleransiPersen: angkaMinNol.max(100, 'Maksimal 100').default(5),
    // Kosong → default: satu satuan bantu terkecil, atau 0 jika tidak ada satuan bantu.
    toleransiMinimum: angkaMinNol.optional(),
  })
  .strict();

export const ArsipBody = z.object({ arsip: z.boolean() }).strict();

// ---------- resep, menu, topping ----------
export const BarisResep = z.object({ bahanId: id, jumlah: angkaPositif, satuan: teks(30) }).strict();
const Resep = z.array(BarisResep).min(1, 'Minimal 1 bahan').max(30);

// Harga per aplikasi; saluran yang tidak diisi memakai harga toko.
const HargaSaluran = z.object(Object.fromEntries(SALURAN_ONLINE.map((s) => [s, rupiah.optional()]))).strict();

export const UkuranMenu = z.object({ nama: teks(20), harga: rupiah, hargaSaluran: HargaSaluran.optional(), resep: Resep }).strict();

export const MenuBody = z
  .object({
    nama: teks(60),
    kategori: teks(30),
    ukuran: z.array(UkuranMenu).min(1, 'Minimal 1 ukuran').max(5),
    toppingIds: z.array(id).max(20).default([]),
  })
  .strict()
  .superRefine((m, ctx) => {
    const nama = m.ukuran.map((u) => u.nama.toLowerCase());
    if (new Set(nama).size !== nama.length) ctx.addIssue({ code: 'custom', path: ['ukuran'], message: 'Nama ukuran dobel' });
    if (new Set(m.toppingIds).size !== m.toppingIds.length) ctx.addIssue({ code: 'custom', path: ['toppingIds'], message: 'Topping dobel' });
  });

export const ToppingBody = z.object({ nama: teks(60), harga: rupiah, hargaSaluran: HargaSaluran.optional(), resep: Resep }).strict();

// ---------- pengaturan ----------
export const PengaturanBody = z
  .object({
    shift: z.array(z.object({ nama: teks(20) }).strict()).min(1, 'Minimal 1 shift').max(4, 'Maksimal 4 shift'),
    hitungKas: z.boolean(),
    toleransiKasRupiah: rupiah,
    // tidak: hanya bahan kunci · outlet: semua bahan saat buka & tutup outlet · setiap_shift: semua bahan setiap pergantian
    hitungSemuaBahan: z.enum(['tidak', 'outlet', 'setiap_shift']),
  })
  .strict()
  .superRefine((p, ctx) => {
    const nama = p.shift.map((s) => s.nama.toLowerCase());
    if (new Set(nama).size !== nama.length) ctx.addIssue({ code: 'custom', path: ['shift'], message: 'Nama shift dobel' });
  });

// ---------- shift ----------
// { creamer: 1580, gula: 455 } dalam satuan dasar
const Hitungan = z.record(id, angkaMinNol);

export const BukaShiftBody = z.object({ namaShift: teks(20), hitungan: Hitungan, kasAwal: rupiah.optional() }).strict();
export const TutupShiftBody = z.object({ hitungan: Hitungan, kasAkhir: rupiah.optional() }).strict();
export const OpnameBody = z.object({ hitungan: Hitungan }).strict();

// ---------- transaksi ----------
// Item keranjang: menu biasa { menuId, ukuran, toppingIds, qty } atau paket (khusus aplikasi) { paketId, qty }.
export const ItemKeranjang = z
  .object({ menuId: id.optional(), ukuran: teks(20).optional(), toppingIds: z.array(id).max(10).default([]), paketId: id.optional(), qty: z.number().int().min(1).max(99) })
  .strict()
  .superRefine((it, ctx) => {
    if (it.paketId !== undefined) {
      if (it.menuId !== undefined || it.ukuran !== undefined) ctx.addIssue({ code: 'custom', path: ['paketId'], message: 'Item paket tidak memakai menuId/ukuran' });
      if (it.toppingIds.length) ctx.addIssue({ code: 'custom', path: ['toppingIds'], message: 'Paket tidak bisa diberi topping' });
    } else {
      if (it.menuId === undefined) ctx.addIssue({ code: 'custom', path: ['menuId'], message: 'Wajib diisi' });
      if (it.ukuran === undefined) ctx.addIssue({ code: 'custom', path: ['ukuran'], message: 'Wajib diisi' });
    }
  });

// Pesanan aplikasi yang dicatat manual: saluran online + nomor pesanan + dibayar lewat aplikasi (tidak masuk laci).
export const TransaksiBody = z
  .object({
    item: z.array(ItemKeranjang).min(1, 'Keranjang kosong').max(50),
    saluran: z.enum(SALURAN).default('toko'),
    nomorPesanan: teks(40).optional(),
    metodeBayar: z.enum(['tunai', 'qris', 'aplikasi']),
    uangDiterima: rupiah.optional(),
  })
  .strict()
  .superRefine((t, ctx) => {
    const online = t.saluran !== 'toko';
    if (online && t.metodeBayar !== 'aplikasi') ctx.addIssue({ code: 'custom', path: ['metodeBayar'], message: 'Pesanan aplikasi dibayar lewat aplikasi' });
    if (!online && t.metodeBayar === 'aplikasi') ctx.addIssue({ code: 'custom', path: ['metodeBayar'], message: 'Pesanan di toko dibayar tunai atau QRIS' });
    if (online && t.nomorPesanan === undefined) ctx.addIssue({ code: 'custom', path: ['nomorPesanan'], message: 'Wajib diisi: nomor pesanan dari aplikasi' });
    if (!online && t.nomorPesanan !== undefined) ctx.addIssue({ code: 'custom', path: ['nomorPesanan'], message: 'Nomor pesanan hanya untuk pesanan aplikasi' });
    if (t.metodeBayar === 'tunai' && t.uangDiterima === undefined) {
      ctx.addIssue({ code: 'custom', path: ['uangDiterima'], message: 'Wajib diisi untuk pembayaran tunai' });
    }
    if (t.metodeBayar !== 'tunai' && t.uangDiterima !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['uangDiterima'], message: 'Hanya untuk pembayaran tunai' });
    }
  });

// ---------- barang masuk & kas ----------
// Entri biasa: jumlah > 0. Koreksi: wajib koreksiDari + alasan, jumlah boleh negatif (tidak 0).
export const BarangMasukBody = z
  .object({
    bahanId: id,
    jumlah: z.number({ invalid_type_error: 'Wajib angka' }).finite(),
    satuan: teks(30),
    koreksiDari: id.optional(),
    alasan: teks(200).optional(),
  })
  .strict()
  .superRefine((b, ctx) => {
    if (b.koreksiDari === undefined) {
      if (!(b.jumlah > 0)) ctx.addIssue({ code: 'custom', path: ['jumlah'], message: 'Wajib lebih dari 0' });
      if (b.alasan !== undefined) ctx.addIssue({ code: 'custom', path: ['alasan'], message: 'Alasan hanya untuk koreksi' });
    } else {
      if (b.jumlah === 0) ctx.addIssue({ code: 'custom', path: ['jumlah'], message: 'Koreksi tidak boleh 0' });
      if (b.alasan === undefined) ctx.addIssue({ code: 'custom', path: ['alasan'], message: 'Koreksi wajib menyebut alasan' });
    }
  });

export const PengeluaranKasBody = z
  .object({ jumlah: rupiah.refine((v) => v > 0, 'Wajib lebih dari 0'), keterangan: teks(100) })
  .strict();

export const BatalBody = z.object({ alasan: teks(200) }).strict();

// ---------- saluran online ----------
export const SaluranBody = z
  // Komisi < 100%: di 100% harga impas tidak terhingga (lihat hargaImpas di logika/saluran.js).
  .object({ aktif: z.boolean(), mode: z.enum(['manual', 'otomatis']), komisiPersen: angkaMinNol.max(95, 'Maksimal 95') })
  .strict();

// Pesanan yang dikirim aplikasi (webhook). Bentuk ini sudah dinormalkan: di backend asli, adapter per platform
// menerjemahkan format GoFood/GrabFood ke bentuk ini setelah tanda tangan webhook diverifikasi.
const ItemAplikasi = z
  .object({
    kode: teks(60),
    nama: teks(80),
    qty: z.number().int().min(1).max(99),
    harga: rupiah, // per porsi, sudah termasuk topping
    topping: z.array(z.object({ kode: teks(60), nama: teks(80) }).strict()).max(10).default([]),
  })
  .strict();

export const PesananAplikasiBody = z
  .object({
    nomorPesanan: teks(40),
    pelanggan: teks(40),
    item: z.array(ItemAplikasi).min(1).max(30),
    total: rupiah,
    catatan: teks(200).optional(),
  })
  .strict()
  .superRefine((p, ctx) => {
    const hitung = p.item.reduce((a, it) => a + it.harga * it.qty, 0);
    if (hitung !== p.total) ctx.addIssue({ code: 'custom', path: ['total'], message: `Total ${p.total} tidak sama dengan jumlah item ${hitung}` });
  });

export const PembatalanAplikasiBody = z.object({ nomorPesanan: teks(40), alasan: teks(200) }).strict();

export const TolakPesananBody = z.object({ alasan: teks(200) }).strict();

// "Paket Berdua" (menu yang dibuat di aplikasi) = 1 Thai Tea Regular + 1 Kopi Susu Regular
const IsiPaket = z.object({ menuId: id, ukuran: teks(20), qty: z.number().int().min(1, 'Minimal 1').max(10, 'Maksimal 10') }).strict();
export const PemetaanBody = z
  .object({ kode: teks(60), isi: z.array(IsiPaket).min(1, 'Minimal 1 menu').max(6, 'Maksimal 6 menu') })
  .strict()
  .superRefine((p, ctx) => {
    const k = p.isi.map((i) => `${i.menuId}|${i.ukuran}`);
    if (new Set(k).size !== k.length) ctx.addIssue({ code: 'custom', path: ['isi'], message: 'Menu dan ukuran yang sama ditulis dua kali; gabungkan jumlahnya' });
  });

// Paket promo khusus aplikasi: dirancang di kasir, isinya menu kasir, harga per aplikasi (yang kosong = tidak dijual di sana).
export const PaketBody = z
  .object({
    nama: teks(60),
    isi: z.array(IsiPaket).min(1, 'Minimal 1 menu').max(6, 'Maksimal 6 menu'),
    hargaSaluran: HargaSaluran,
    aktif: z.boolean().default(true),
  })
  .strict()
  .superRefine((p, ctx) => {
    const k = p.isi.map((i) => `${i.menuId}|${i.ukuran}`);
    if (new Set(k).size !== k.length) ctx.addIssue({ code: 'custom', path: ['isi'], message: 'Menu dan ukuran yang sama ditulis dua kali; gabungkan jumlahnya' });
    if (Object.keys(p.hargaSaluran).length === 0) ctx.addIssue({ code: 'custom', path: ['hargaSaluran'], message: 'Isi harga minimal di satu aplikasi (paket hanya dijual di aplikasi)' });
  });

// Simpan harga aplikasi untuk banyak menu sekaligus (satu request, atomik).
export const HargaSaluranMassalBody = z
  .object({
    menu: z.array(z.object({ id, ukuran: z.array(z.object({ nama: teks(20), hargaSaluran: HargaSaluran }).strict()).min(1) }).strict()).max(200),
    topping: z.array(z.object({ id, hargaSaluran: HargaSaluran }).strict()).max(100),
    paket: z.array(z.object({ id, hargaSaluran: HargaSaluran }).strict()).max(100).default([]),
  })
  .strict();

// zod issue → detail format API: [{ field, pesan }]
// Path ditulis sama seperti logika/: ['ukuran', 0, 'resep', 1, 'satuan'] → 'ukuran[0].resep[1].satuan'
export function keDetail(zodError) {
  return zodError.issues.map((i) => ({
    field: i.path.reduce((acc, p) => (typeof p === 'number' ? `${acc}[${p}]` : acc ? `${acc}.${p}` : String(p)), '') || '(body)',
    pesan: i.message,
  }));
}
