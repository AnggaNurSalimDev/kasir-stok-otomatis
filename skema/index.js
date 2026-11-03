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

export const UkuranMenu = z.object({ nama: teks(20), harga: rupiah, resep: Resep }).strict();

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

export const ToppingBody = z.object({ nama: teks(60), harga: rupiah, resep: Resep }).strict();

// ---------- pengaturan ----------
export const PengaturanBody = z
  .object({
    shift: z.array(z.object({ nama: teks(20) }).strict()).min(1, 'Minimal 1 shift').max(4, 'Maksimal 4 shift'),
    hitungKas: z.boolean(),
    toleransiKasRupiah: rupiah,
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
export const ItemKeranjang = z
  .object({ menuId: id, ukuran: teks(20), toppingIds: z.array(id).max(10).default([]), qty: z.number().int().min(1).max(99) })
  .strict();

export const TransaksiBody = z
  .object({
    item: z.array(ItemKeranjang).min(1, 'Keranjang kosong').max(50),
    metodeBayar: z.enum(['tunai', 'qris']),
    uangDiterima: rupiah.optional(),
  })
  .strict()
  .superRefine((t, ctx) => {
    if (t.metodeBayar === 'tunai' && t.uangDiterima === undefined) {
      ctx.addIssue({ code: 'custom', path: ['uangDiterima'], message: 'Wajib diisi untuk pembayaran tunai' });
    }
    if (t.metodeBayar === 'qris' && t.uangDiterima !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['uangDiterima'], message: 'Tidak dipakai untuk QRIS' });
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

// zod issue → detail format API: [{ field, pesan }]
// Path ditulis sama seperti logika/: ['ukuran', 0, 'resep', 1, 'satuan'] → 'ukuran[0].resep[1].satuan'
export function keDetail(zodError) {
  return zodError.issues.map((i) => ({
    field: i.path.reduce((acc, p) => (typeof p === 'number' ? `${acc}[${p}]` : acc ? `${acc}.${p}` : String(p)), '') || '(body)',
    pesan: i.message,
  }));
}
