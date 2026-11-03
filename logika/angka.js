// Presisi tetap: semua jumlah bahan disimpan sebagai bilangan bulat ×10
// (kelipatan 0,1 satuan dasar). Tujuannya menghindari 0.1 + 0.2 = 0.30000000000000004.
//
//   8 gr     → 80
//   0,5 gr   → 5
//   150 ml   → 1500

import { ErrorValidasi } from './galat.js';

const SKALA = 10;
const EPS = 1e-9;

// angka biasa → bilangan bulat ×10. Menolak angka yang lebih halus dari 0,1.
export function keX10(angka, field = 'angka') {
  if (typeof angka !== 'number' || !Number.isFinite(angka)) {
    throw new ErrorValidasi('Angka tidak valid', [{ field, pesan: 'Harus berupa angka' }]);
  }
  const kali = angka * SKALA;
  const bulat = Math.round(kali);
  if (Math.abs(kali - bulat) > EPS) {
    throw new ErrorValidasi('Angka terlalu halus', [
      { field, pesan: `Maksimal 1 angka di belakang koma (dapat ${angka})` },
    ]);
  }
  return bulat;
}

// bilangan bulat ×10 → angka biasa (untuk tampilan).
export function dariX10(x10) {
  if (!Number.isInteger(x10)) throw new TypeError(`dariX10 butuh bilangan bulat, dapat ${x10}`);
  return x10 / SKALA;
}

// Mengalikan dua nilai ×10. Hasil harus tetap kelipatan 0,1.
//   jumlahX10 = 5 (0,5 sendok), konversiX10 = 80 (8 gr) → 40 (4 gr)
//   jumlahX10 = 5 (0,5),        konversiX10 = 3  (0,3) → 0,15 → ditolak
export function kaliX10(aX10, bX10, field = 'angka') {
  const hasil = (aX10 * bX10) / SKALA;
  if (!Number.isInteger(hasil)) {
    throw new ErrorValidasi('Hasil konversi terlalu halus', [
      { field, pesan: `Hasil ${dariX10(aX10)} × ${dariX10(bX10)} lebih halus dari 0,1` },
    ]);
  }
  return hasil;
}
