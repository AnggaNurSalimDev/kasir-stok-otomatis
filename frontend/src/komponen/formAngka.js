// Bantuan angka untuk form. Input selalu disimpan sebagai teks (supaya "1," saat mengetik tidak hilang),
// lalu diubah ke angka saat dikirim.

import { keX10, kaliX10, dariX10 } from '../../../logika/angka.js';

// "1,5" / "1.5" / " 8 " → 1.5 / 1.5 / 8.  Kosong atau bukan angka → null.
// Titik ribuan tidak didukung ("1.000" dibaca 1): field jumlah di sini jarang ribuan dan
// harga memakai angkaBulatDari().
export function angkaDari(teks) {
  if (typeof teks === 'number') return Number.isFinite(teks) ? teks : null;
  if (typeof teks !== 'string') return null;
  const bersih = teks.trim().replace(',', '.');
  if (bersih === '' || !/^-?\d*\.?\d+$/.test(bersih)) return null;
  return Number(bersih);
}

// Rupiah: "15.000" / "15000" / "Rp 15.000" → 15000. Selain digit (dan titik/spasi/Rp) → null.
export function angkaBulatDari(teks) {
  if (typeof teks === 'number') return Number.isInteger(teks) ? teks : null;
  if (typeof teks !== 'string') return null;
  const bersih = teks.replace(/^\s*rp\s*/i, '').replace(/[.\s]/g, '');
  if (!/^\d+$/.test(bersih)) return null;
  return Number(bersih);
}

export const formatAngka = (n) => (n === null || n === undefined ? '–' : Number(n).toLocaleString('id-ID', { maximumFractionDigits: 1 }));
export const formatRupiah = (n) => `Rp ${Number(n).toLocaleString('id-ID')}`;

// Teks bantu di sebelah baris resep: "= 8 gr".
//   bahan = { satuanDasar, satuanBantu: [{ nama, konversi }] }
// Mengembalikan { teks, galat } — galat terisi jika jumlah tidak bisa dihitung.
export function hintKonversi(jumlahTeks, satuan, bahan) {
  if (!bahan) return { teks: '', galat: null };
  const jumlah = angkaDari(jumlahTeks);
  if (jumlah === null) return { teks: '', galat: jumlahTeks?.trim() ? 'Bukan angka' : null };
  if (jumlah <= 0) return { teks: '', galat: 'Harus lebih dari 0' };
  const sama = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const konversi = sama(satuan ?? '', bahan.satuanDasar) ? 1 : bahan.satuanBantu.find((s) => sama(s.nama, satuan ?? ''))?.konversi;
  if (konversi === undefined) return { teks: '', galat: 'Satuan tidak dikenal' };
  try {
    const hasil = dariX10(kaliX10(keX10(jumlah), keX10(konversi)));
    return { teks: `= ${formatAngka(hasil)} ${bahan.satuanDasar}`, galat: null };
  } catch {
    return { teks: '', galat: 'Maksimal 1 angka di belakang koma' };
  }
}
