// Selisih shift, toleransi, serah terima, penyesuaian stok, dan kas. Fungsi murni.
//
// Satuan:
//   - jumlah bahan: bilangan bulat ×10 satuan dasar (80 = 8 gr), sama seperti pemakaian.js
//   - toleransiPersen: angka biasa, maks 1 angka di belakang koma (5 atau 2,5)
//   - uang: rupiah, bilangan bulat

import { keX10 } from './angka.js';
import { ErrorValidasi, lemparJikaAda } from './galat.js';

const bulatMinNol = (v) => Number.isInteger(v) && v >= 0;

// ---------------------------------------------------------------------------
// Pemakaian teoretis satu shift = jumlah salinan pemakaian di setiap transaksi.
//   [{ pemakaian: { gula: 80 } }, { pemakaian: { gula: 80, cup: 10 } }] → { gula: 160, cup: 10 }
export function jumlahkanPemakaian(daftarTransaksi) {
  if (!Array.isArray(daftarTransaksi)) throw new TypeError('daftarTransaksi wajib berupa daftar');
  const total = {};
  daftarTransaksi.forEach((t, i) => {
    if (!t?.pemakaian || typeof t.pemakaian !== 'object') {
      throw new TypeError(`transaksi[${i}] tidak punya salinan pemakaian`);
    }
    for (const [id, x10] of Object.entries(t.pemakaian)) {
      if (!Number.isInteger(x10) || x10 <= 0) throw new TypeError(`transaksi[${i}].pemakaian.${id} tidak valid: ${x10}`);
      total[id] = (total[id] ?? 0) + x10;
    }
  });
  return total;
}

// ---------------------------------------------------------------------------
// Toleransi (bagian 5 rencana).
//   batas = max(persen × pemakaian, minimum)
//
// Perbandingan memakai bilangan bulat supaya tepat di batas:
//   |selisih| ≤ persen/100 × pakai   ⇔   |selisih| × 1000 ≤ persenX10 × pakai
export function statusToleransi({ selisihX10, pakaiX10, toleransiPersen, toleransiMinimumX10 }) {
  const detail = [];
  if (!Number.isInteger(selisihX10)) detail.push({ field: 'selisihX10', pesan: 'Wajib bilangan bulat' });
  if (!bulatMinNol(pakaiX10)) detail.push({ field: 'pakaiX10', pesan: 'Wajib bilangan bulat ≥ 0' });
  if (typeof toleransiPersen !== 'number' || !(toleransiPersen >= 0 && toleransiPersen <= 100)) {
    detail.push({ field: 'toleransiPersen', pesan: 'Wajib 0–100' });
  }
  if (!bulatMinNol(toleransiMinimumX10)) detail.push({ field: 'toleransiMinimumX10', pesan: 'Wajib bilangan bulat ≥ 0' });
  lemparJikaAda('Data toleransi tidak valid', detail);

  const persenX10 = keX10(toleransiPersen, 'toleransiPersen');
  const mutlak = Math.abs(selisihX10);
  const dalamPersen = mutlak * 1000 <= persenX10 * pakaiX10;
  const dalamMinimum = mutlak <= toleransiMinimumX10;

  return {
    // Untuk tampilan saja (dibulatkan ke bawah); status memakai perbandingan tepat di atas.
    batasX10: Math.max(Math.floor((persenX10 * pakaiX10) / 1000), toleransiMinimumX10),
    status: dalamPersen || dalamMinimum ? 'wajar' : 'perlu_dicek',
    // kurang = stok fisik lebih sedikit dari seharusnya (boros/hilang)
    // lebih  = stok fisik lebih banyak (takaran kurang, atau barang masuk tidak dicatat)
    arah: selisihX10 < 0 ? 'kurang' : selisihX10 > 0 ? 'lebih' : 'pas',
  };
}

// ---------------------------------------------------------------------------
// Selisih per bahan kunci dalam satu shift (bagian 4 rencana).
//   seharusnya = awal + masuk − pakai
//   selisih    = akhir − seharusnya
//
// input:
//   bahanKunci   ['creamer', ...]
//   hitungAwal   { creamer: 12000 }     (hitung buta saat buka shift)
//   hitungAkhir  { creamer: 15800 }     (hitung buta saat tutup shift)
//   masuk        { creamer: 10000 }     (jumlah bersih barang masuk; koreksi bisa membuatnya negatif)
//   pemakaian    { creamer: 5600 }      (dari jumlahkanPemakaian)
//   toleransi    { creamer: { persen: 5, minimumX10: 80 } }
//   sumberAkhir  'tutup' | 'buka_berikutnya'  (shift tidak ditutup → pakai hitungan buka shift berikutnya)
export function hitungSelisihShift({ bahanKunci, hitungAwal, hitungAkhir, masuk = {}, pemakaian = {}, toleransi, sumberAkhir = 'tutup' }) {
  if (!Array.isArray(bahanKunci) || bahanKunci.length === 0) {
    lemparJikaAda('Bahan kunci tidak valid', [{ field: 'bahanKunci', pesan: 'Minimal 1 bahan kunci' }]);
  }
  if (new Set(bahanKunci).size !== bahanKunci.length) {
    lemparJikaAda('Bahan kunci tidak valid', [{ field: 'bahanKunci', pesan: 'Ada bahan kunci yang dobel' }]);
  }
  if (!['tutup', 'buka_berikutnya'].includes(sumberAkhir)) {
    throw new TypeError(`sumberAkhir tidak dikenal: ${sumberAkhir}`);
  }
  for (const [nama, obj] of Object.entries({ hitungAwal, hitungAkhir, masuk, pemakaian, toleransi })) {
    if (!obj || typeof obj !== 'object') throw new TypeError(`${nama} wajib berupa objek`);
  }

  // A-11: setiap bahan kunci wajib dihitung, angka ≥ 0.
  const detail = [];
  for (const id of bahanKunci) {
    if (!bulatMinNol(hitungAwal[id])) detail.push({ field: `hitungAwal.${id}`, pesan: 'Wajib diisi, angka ≥ 0' });
    if (!bulatMinNol(hitungAkhir[id])) detail.push({ field: `hitungAkhir.${id}`, pesan: 'Wajib diisi, angka ≥ 0' });
    if (id in masuk && !Number.isInteger(masuk[id])) detail.push({ field: `masuk.${id}`, pesan: 'Wajib bilangan bulat' });
    if (id in pemakaian && !bulatMinNol(pemakaian[id])) detail.push({ field: `pemakaian.${id}`, pesan: 'Wajib bilangan bulat ≥ 0' });
    if (!toleransi[id]) detail.push({ field: `toleransi.${id}`, pesan: 'Toleransi bahan belum ada' });
  }
  lemparJikaAda('Hitungan shift belum lengkap', detail);

  return bahanKunci.map((id) => {
    const awalX10 = hitungAwal[id];
    const masukX10 = masuk[id] ?? 0;
    const pakaiX10 = pemakaian[id] ?? 0;
    const akhirX10 = hitungAkhir[id];
    const seharusnyaX10 = awalX10 + masukX10 - pakaiX10;
    const selisihX10 = akhirX10 - seharusnyaX10;
    const t = toleransi[id];
    return {
      bahanId: id,
      awalX10, masukX10, pakaiX10, akhirX10, seharusnyaX10, selisihX10,
      ...statusToleransi({ selisihX10, pakaiX10, toleransiPersen: t.persen, toleransiMinimumX10: t.minimumX10 }),
      sumberAkhir,
    };
  });
}

// ---------------------------------------------------------------------------
// Selisih serah terima = hitung awal shift ini − hitung akhir shift sebelumnya.
// Bukan nol → ada yang berubah di antara dua hitungan, atau salah satunya salah hitung.
// Bahan yang tidak dihitung di salah satu sisi (mis. baru dijadikan bahan kunci) → null.
export function selisihSerahTerima(hitungAkhirSebelumnya, hitungAwalSekarang) {
  if (!hitungAwalSekarang || typeof hitungAwalSekarang !== 'object') throw new TypeError('hitungAwalSekarang wajib berupa objek');
  return Object.entries(hitungAwalSekarang).map(([id, awal]) => {
    const akhir = hitungAkhirSebelumnya?.[id];
    return {
      bahanId: id,
      akhirSebelumnyaX10: akhir ?? null,
      awalX10: awal,
      selisihX10: Number.isInteger(akhir) ? awal - akhir : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Penyesuaian stok sistem ke hasil hitung fisik (A-15). Tidak menimpa diam-diam:
// menghasilkan entri yang disimpan, hanya untuk bahan yang angkanya berbeda.
//   stokSistem { creamer: 16400 }, hitungan { creamer: 15800 }
//   → [{ bahanId: 'creamer', dariX10: 16400, keX10: 15800, perubahanX10: -600 }]
export function buatPenyesuaian(stokSistemX10, hitunganX10) {
  if (!stokSistemX10 || typeof stokSistemX10 !== 'object') throw new TypeError('stokSistemX10 wajib berupa objek');
  if (!hitunganX10 || typeof hitunganX10 !== 'object') throw new TypeError('hitunganX10 wajib berupa objek');
  return Object.entries(hitunganX10)
    .map(([id, fisik]) => {
      if (!bulatMinNol(fisik)) throw new ErrorValidasi('Hitungan tidak valid', [{ field: id, pesan: 'Wajib angka ≥ 0' }]);
      const sistem = stokSistemX10[id] ?? 0; // stok sistem boleh minus (A-08)
      return { bahanId: id, dariX10: sistem, keX10: fisik, perubahanX10: fisik - sistem };
    })
    .filter((p) => p.perubahanX10 !== 0);
}

// ---------------------------------------------------------------------------
// Kas laci (bagian 6). Penjualan QRIS tidak masuk laci, jadi tidak ikut.
//   seharusnya = awal + penjualan tunai − pengeluaran
//   selisih    = akhir − seharusnya
export function hitungKas({ kasAwal, penjualanTunai, pengeluaran, kasAkhir, toleransiRupiah = 0 }) {
  const detail = [];
  for (const [field, v] of Object.entries({ kasAwal, penjualanTunai, pengeluaran, kasAkhir, toleransiRupiah })) {
    if (!bulatMinNol(v)) detail.push({ field, pesan: 'Wajib rupiah bulat ≥ 0' });
  }
  lemparJikaAda('Data kas tidak valid', detail);

  const seharusnya = kasAwal + penjualanTunai - pengeluaran;
  const selisih = kasAkhir - seharusnya;
  return {
    seharusnya,
    selisih,
    status: Math.abs(selisih) <= toleransiRupiah ? 'wajar' : 'perlu_dicek',
    arah: selisih < 0 ? 'kurang' : selisih > 0 ? 'lebih' : 'pas',
  };
}

// ---------------------------------------------------------------------------
// Saran toleransi dari riwayat (bagian 5). Hanya saran: owner yang memutuskan.
// Selisih dinyatakan sebagai persen dari pemakaian; shift tanpa pemakaian dilewati.
// Mengembalikan null jika shift yang bisa dipakai < 10.
export const MIN_SHIFT_SARAN = 10;

export function saranToleransi(riwayat) {
  if (!Array.isArray(riwayat)) throw new TypeError('riwayat wajib berupa daftar');
  const persen = riwayat
    .filter((r) => Number.isInteger(r?.pakaiX10) && r.pakaiX10 > 0 && Number.isInteger(r?.selisihX10))
    .map((r) => (r.selisihX10 / r.pakaiX10) * 100)
    .sort((a, b) => a - b);
  if (persen.length < MIN_SHIFT_SARAN) return null;

  // Persentil nearest-rank: nilai ke-ceil(p × n) dari data terurut.
  const persentil = (p) => persen[Math.max(0, Math.ceil(p * persen.length) - 1)];
  const satuDesimal = (v) => Math.round(v * 10) / 10;
  return {
    jumlahShift: persen.length,
    p10: satuDesimal(persentil(0.1)),
    median: satuDesimal(persentil(0.5)),
    p90: satuDesimal(persentil(0.9)),
  };
}
