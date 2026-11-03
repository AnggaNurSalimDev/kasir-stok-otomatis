/*
 * Profil usaha: satu file JSON → tampilan seluruh aplikasi + data demo yang dipakai.
 * Diadaptasi dari sistem-rekrutmen (frontend/src/merek/profil.js).
 *
 *   profil/<id>.json ──validasiProfil──▶ { profil, masalah[] }
 *                                          │
 *                         variabelCss ◀────┘
 *                              │
 *          { '--utama': '#…', '--radius': '10px', … } ──terapkanProfil──▶ <html style="…">
 *
 * Field yang salah tidak membuat aplikasi mati: diganti nilai bawaan dan dicatat di `masalah`.
 *
 * Bedanya dengan rekruter: `data` memilih katalog demo (bahan, menu, satuan) di mode mock,
 * dan teks profil dipakai di halaman masuk dan struk.
 */

import { campur, hexValid, kontras, sesuaikanKontras, tintaDiAtas } from './warna.js';

export const HURUF = {
  jakarta: "'Plus Jakarta Sans Variable', system-ui, -apple-system, 'Segoe UI', sans-serif",
  fraunces: "'Fraunces Variable', Georgia, 'Times New Roman', serif",
  grotesk: "'Space Grotesk Variable', system-ui, -apple-system, 'Segoe UI', sans-serif",
};

export const SUDUT = {
  tajam: { kecil: '2px', besar: '3px' },
  sedang: { kecil: '6px', besar: '10px' },
  bulat: { kecil: '10px', besar: '16px' },
};

export const KERAPATAN = {
  rapat: { dasar: '93.75%', lebar: '1040px' },
  normal: { dasar: '100%', lebar: '1100px' },
  lega: { dasar: '106.25%', lebar: '1180px' },
};

// Jenis data demo yang tersedia (katalog di api/mock/katalog). Dicek test supaya selalu sama.
export const JENIS_DATA = ['teh', 'kopi', 'mie'];

// Warna netral dan warna status. Status (galat/sukses) sengaja tidak ikut warna merek:
// "perlu dicek" harus terbaca sama di semua usaha.
const TEMA = {
  terang: {
    '--halaman': '#f3f5f8',
    '--permukaan': '#ffffff',
    '--panel': '#f6f8fa',
    '--teks': '#1b2333',
    '--redup': '#4b5568',
    '--garis': '#d8dde6',
    '--galat': '#b42318',
    '--galat-pudar': '#fdecea',
    '--sukses': '#1f7a4d',
    '--sukses-pudar': '#e3f2ea',
    '--bayangan': 'rgba(16, 24, 40, 0.08)',
  },
  gelap: {
    '--halaman': '#0f141c',
    '--permukaan': '#171d27',
    '--panel': '#1c2330',
    '--teks': '#e8ecf2',
    '--redup': '#a3adbd',
    '--garis': '#2c3443',
    '--galat': '#f07a70',
    '--galat-pudar': '#3a1714',
    '--sukses': '#5cc98f',
    '--sukses-pudar': '#12301f',
    '--bayangan': 'rgba(0, 0, 0, 0.4)',
  },
};

export const PROFIL_BAWAAN = Object.freeze({
  id: 'kasir',
  nama: 'Kasir Stok Otomatis',
  logo: Object.freeze({ teks: 'Kasir Stok Otomatis', gambar: null }),
  favicon: '/favicon.svg',
  warna: Object.freeze({ utama: '#0b6e4f', aksen: '#fde68a' }),
  huruf: 'jakarta',
  gaya: Object.freeze({ tema: 'terang', sudut: 'sedang', kerapatan: 'normal' }),
  teks: Object.freeze({
    slogan: 'Stok bahan berkurang otomatis sesuai resep, apa pun satuannya.',
    alamat: null,
    footerStruk: 'Terima kasih',
  }),
  data: 'teh',
  fiktif: false,
});

const POLA_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const KUNCI = ['id', 'nama', 'logo', 'favicon', 'warna', 'huruf', 'gaya', 'teks', 'data', 'fiktif'];

const objekBiasa = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const teksPendek = (x, maks) => typeof x === 'string' && x.trim().length > 0 && x.length <= maks;

/** Path di folder public (diawali satu "/"), bukan URL luar. */
export function pathPublik(x) {
  return typeof x === 'string' && /^\/(?!\/)[\w\-./]+$/.test(x) && !x.includes('..');
}

function ambil(mentah, kunci, cek, bawaan, masalah, pesan, jalur) {
  if (!(kunci in mentah)) return bawaan;
  if (cek(mentah[kunci])) return mentah[kunci];
  masalah.push(`${jalur}${kunci}: ${pesan}`);
  return bawaan;
}

function validasiBagian(mentah, bawaan, aturan, jalur, masalah) {
  if (mentah === undefined) return { ...bawaan };
  if (!objekBiasa(mentah)) {
    masalah.push(`${jalur.slice(0, -1)}: harus objek`);
    return { ...bawaan };
  }
  for (const k of Object.keys(mentah)) if (!(k in aturan)) masalah.push(`${jalur}${k}: field tidak dikenal`);
  const hasil = {};
  for (const [k, [cek, pesan]] of Object.entries(aturan)) hasil[k] = ambil(mentah, k, cek, bawaan[k], masalah, pesan, jalur);
  return hasil;
}

/** @returns {{ profil: object, masalah: string[] }} profil selalu lengkap dan aman dipakai. */
export function validasiProfil(mentah) {
  const masalah = [];
  const B = PROFIL_BAWAAN;
  if (!objekBiasa(mentah)) return { profil: B, masalah: ['profil harus objek JSON'] };

  for (const k of Object.keys(mentah)) if (!KUNCI.includes(k)) masalah.push(`${k}: field tidak dikenal`);

  // id wajib dan tidak diganti bawaan: dua profil ber-id sama akan saling menimpa data demonya.
  if (!(typeof mentah.id === 'string' && POLA_ID.test(mentah.id))) {
    return { profil: B, masalah: [...masalah, 'id: wajib, huruf kecil/angka/tanda hubung (contoh "kedai-maju")'] };
  }

  const nama = ambil(mentah, 'nama', (x) => teksPendek(x, 60), B.nama, masalah, '1–60 karakter', '');
  const profil = {
    id: mentah.id,
    nama,
    favicon: ambil(mentah, 'favicon', pathPublik, B.favicon, masalah, 'path di folder public (contoh "/merek/kedai.svg")', ''),
    huruf: ambil(mentah, 'huruf', (x) => x in HURUF, B.huruf, masalah, `salah satu: ${Object.keys(HURUF).join(', ')}`, ''),
    data: ambil(mentah, 'data', (x) => JENIS_DATA.includes(x), B.data, masalah, `salah satu: ${JENIS_DATA.join(', ')}`, ''),
    fiktif: ambil(mentah, 'fiktif', (x) => typeof x === 'boolean', false, masalah, 'true/false', ''),
    logo: validasiBagian(
      mentah.logo,
      { ...B.logo, teks: nama.length <= 40 ? nama : B.logo.teks },
      {
        teks: [(x) => teksPendek(x, 40), '1–40 karakter'],
        gambar: [(x) => x === null || pathPublik(x), 'null atau path di folder public'],
      },
      'logo.',
      masalah,
    ),
    warna: validasiBagian(mentah.warna, B.warna, { utama: [hexValid, 'format #rrggbb'], aksen: [hexValid, 'format #rrggbb'] }, 'warna.', masalah),
    gaya: validasiBagian(
      mentah.gaya,
      B.gaya,
      {
        tema: [(x) => x in TEMA, 'terang | gelap'],
        sudut: [(x) => x in SUDUT, 'tajam | sedang | bulat'],
        kerapatan: [(x) => x in KERAPATAN, 'rapat | normal | lega'],
      },
      'gaya.',
      masalah,
    ),
    teks: validasiBagian(
      mentah.teks,
      B.teks,
      {
        slogan: [(x) => teksPendek(x, 160), '1–160 karakter'],
        alamat: [(x) => x === null || teksPendek(x, 120), 'null atau 1–120 karakter'],
        footerStruk: [(x) => teksPendek(x, 80), '1–80 karakter'],
      },
      'teks.',
      masalah,
    ),
  };

  // Invariant keterbacaan: tulisan di atas warna utama (kepala, tombol) minimal 4.5:1.
  const diAtas = tintaDiAtas(profil.warna.utama);
  if (kontras(diAtas, profil.warna.utama) < 4.5) {
    masalah.push(`warna.utama: ${profil.warna.utama} terlalu "tengah": tulisan putih maupun hitam di atasnya kurang terbaca (< 4.5:1).`);
  }
  return { profil, masalah };
}

/** Profil → variabel CSS. Klien cukup menulis dua warna; turunannya dihitung dengan cek kontras. */
export function variabelCss(profil) {
  if (!objekBiasa(profil) || !objekBiasa(profil.warna) || !objekBiasa(profil.gaya)) {
    throw new TypeError('variabelCss butuh profil hasil validasiProfil');
  }
  const tema = TEMA[profil.gaya.tema];
  const sudut = SUDUT[profil.gaya.sudut];
  const rapat = KERAPATAN[profil.gaya.kerapatan];
  if (!tema || !sudut || !rapat || !HURUF[profil.huruf]) throw new TypeError('gaya profil tidak dikenal');

  const { utama, aksen } = profil.warna;
  const permukaan = tema['--permukaan'];
  const diAtasUtama = tintaDiAtas(utama);
  return {
    ...tema,
    '--utama': utama,
    '--utama-gelap': campur(utama, '#000000', 0.2),
    '--utama-pudar': campur(utama, permukaan, 0.85),
    '--di-atas-utama': diAtasUtama,
    // Teks/garis berwarna utama di atas permukaan (tautan, pilihan aktif, fokus).
    '--tautan': sesuaikanKontras(utama, permukaan, 4.5),
    // Aksen dipakai di atas kepala berwarna utama; kalau tidak kontras, pakai warna tulisan kepala.
    '--aksen': kontras(aksen, utama) >= 3 ? aksen : diAtasUtama,
    '--huruf': HURUF[profil.huruf],
    '--radius-kecil': sudut.kecil,
    '--radius': sudut.besar,
    '--ukuran-dasar': rapat.dasar,
    '--lebar-isi': rapat.lebar,
  };
}

/** Id profil saat aplikasi dibuka. Di luar mode demo hanya `bawaan` (VITE_PROFIL) yang berlaku. */
export function pilihIdProfil({ bawaan, demo, dariUrl, dariPenyimpanan, tersedia }) {
  if (!(tersedia instanceof Set) || tersedia.size === 0) throw new TypeError('tersedia harus Set id profil yang tidak kosong');
  const awal = tersedia.has(bawaan) ? bawaan : [...tersedia][0];
  if (!demo) return awal;
  if (tersedia.has(dariUrl)) return dariUrl;
  if (tersedia.has(dariPenyimpanan)) return dariPenyimpanan;
  return awal;
}
