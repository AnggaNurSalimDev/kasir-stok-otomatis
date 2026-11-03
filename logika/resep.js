// Validasi bahan & resep, dan konversi baris resep ke satuan dasar.
//
// Bentuk data:
//   bahan = { id, nama, satuanDasar: 'gr', satuanBantu: [{ nama: 'sendok', konversi: 8 }] }
//   baris resep = { bahanId, jumlah: 1, satuan: 'sendok' }   (satuan = satuan dasar atau satuan bantu)

import { keX10, kaliX10 } from './angka.js';
import { lemparJikaAda } from './galat.js';

const teksKosong = (s) => typeof s !== 'string' || s.trim() === '';
const kunci = (s) => s.trim().toLowerCase();

// A-01: konversi > 0, nama satuan bantu unik per bahan (dan tidak sama dengan satuan dasar).
export function validasiBahan(bahan) {
  const detail = [];
  if (!bahan || typeof bahan !== 'object') {
    lemparJikaAda('Bahan tidak valid', [{ field: 'bahan', pesan: 'Wajib berupa objek' }]);
  }
  if (teksKosong(bahan.id)) detail.push({ field: 'id', pesan: 'Wajib diisi' });
  if (teksKosong(bahan.nama)) detail.push({ field: 'nama', pesan: 'Wajib diisi' });
  if (teksKosong(bahan.satuanDasar)) detail.push({ field: 'satuanDasar', pesan: 'Wajib diisi' });

  const satuanBantu = bahan.satuanBantu ?? [];
  if (!Array.isArray(satuanBantu)) {
    detail.push({ field: 'satuanBantu', pesan: 'Wajib berupa daftar' });
  } else {
    const terpakai = new Set(teksKosong(bahan.satuanDasar) ? [] : [kunci(bahan.satuanDasar)]);
    satuanBantu.forEach((sb, i) => {
      const f = `satuanBantu[${i}]`;
      if (teksKosong(sb?.nama)) {
        detail.push({ field: `${f}.nama`, pesan: 'Wajib diisi' });
      } else if (terpakai.has(kunci(sb.nama))) {
        detail.push({ field: `${f}.nama`, pesan: `Nama "${sb.nama}" sudah dipakai di bahan ini` });
      } else {
        terpakai.add(kunci(sb.nama));
      }
      if (typeof sb?.konversi !== 'number' || !Number.isFinite(sb.konversi) || sb.konversi <= 0) {
        detail.push({ field: `${f}.konversi`, pesan: 'Wajib angka lebih dari 0' });
      } else {
        try {
          keX10(sb.konversi, `${f}.konversi`);
        } catch (e) {
          detail.push(...e.detail);
        }
      }
    });
  }
  lemparJikaAda(`Bahan "${bahan.nama ?? '?'}" tidak valid`, detail);
}

// Mencari konversi (×10) sebuah satuan untuk satu bahan. Satuan dasar = 1.
// Mengembalikan null jika satuan bukan milik bahan itu.
function konversiX10(bahan, satuan) {
  if (teksKosong(satuan)) return null;
  if (kunci(satuan) === kunci(bahan.satuanDasar)) return 10;
  const sb = (bahan.satuanBantu ?? []).find((s) => kunci(s.nama) === kunci(satuan));
  return sb ? keX10(sb.konversi) : null;
}

// A-03, A-04: minimal 1 baris, jumlah > 0, satuan milik bahan, bahan tidak dobel.
// Mengembalikan resep dalam satuan dasar ×10: [{ bahanId, jumlahX10 }]
//   [{ bahanId: 'creamer', jumlah: 1, satuan: 'sendok' }]  →  [{ bahanId: 'creamer', jumlahX10: 80 }]
export function konversiResep(resep, bahanById, label = 'resep') {
  if (!Array.isArray(resep) || resep.length === 0) {
    lemparJikaAda(`${label} tidak valid`, [{ field: label, pesan: 'Minimal berisi 1 bahan' }]);
  }
  const detail = [];
  const sudahAda = new Set();
  const hasil = [];

  resep.forEach((baris, i) => {
    const f = `${label}[${i}]`;
    const bahan = bahanById.get(baris?.bahanId);
    if (!bahan) {
      detail.push({ field: `${f}.bahanId`, pesan: `Bahan "${baris?.bahanId}" tidak ditemukan` });
      return;
    }
    if (sudahAda.has(bahan.id)) {
      detail.push({ field: `${f}.bahanId`, pesan: `Bahan "${bahan.nama}" muncul lebih dari sekali` });
      return;
    }
    sudahAda.add(bahan.id);

    if (typeof baris.jumlah !== 'number' || !Number.isFinite(baris.jumlah) || baris.jumlah <= 0) {
      detail.push({ field: `${f}.jumlah`, pesan: 'Wajib angka lebih dari 0' });
      return;
    }
    const konv = konversiX10(bahan, baris.satuan);
    if (konv === null) {
      detail.push({
        field: `${f}.satuan`,
        pesan: `Satuan "${baris.satuan}" tidak dikenal untuk bahan "${bahan.nama}"`,
      });
      return;
    }
    try {
      hasil.push({ bahanId: bahan.id, jumlahX10: kaliX10(keX10(baris.jumlah, `${f}.jumlah`), konv, `${f}.jumlah`) });
    } catch (e) {
      detail.push(...e.detail);
    }
  });

  lemparJikaAda(`${label} tidak valid`, detail);
  return hasil;
}
