// Tempat mock menyimpan seluruh data. Antarmuka:
//   { baca(): string | null, tulis(teks: string): void, hapus(): void }
// Opsional (dipakai pembuat data demo supaya cepat, tanpa JSON):
//   { bacaObjek(): object | null, tulisObjek(objek): void }

export function penyimpananMemori() {
  let isi = null;
  return {
    baca: () => isi,
    tulis: (teks) => {
      isi = teks;
    },
    hapus: () => {
      isi = null;
    },
  };
}

// Menyimpan objek apa adanya. Hanya untuk pembuat data demo (lihat buatMockApi opsi `salin`).
export function penyimpananObjek() {
  let objek = null;
  return {
    bacaObjek: () => objek,
    tulisObjek: (o) => {
      objek = o;
    },
    baca: () => (objek === null ? null : JSON.stringify(objek)),
    tulis: (teks) => {
      objek = JSON.parse(teks);
    },
    hapus: () => {
      objek = null;
    },
  };
}

export const AWALAN_KUNCI = 'kasir-demo-v3:';
const AWALAN_LAMA = /^kasir-demo-v\d+:/;

// localStorage bisa melempar (mode privat, kuota penuh). Galat baca dianggap "belum ada data".
// Kuota penuh saat menulis: data demo profil lain dihapus dulu, lalu dicoba sekali lagi.
export function penyimpananLokal(kunci = `${AWALAN_KUNCI}teh`) {
  const ls = () => window.localStorage;
  // Data demo versi lama tidak dipakai lagi; hapus supaya tidak menghabiskan kuota.
  try {
    Object.keys(ls()).filter((k) => AWALAN_LAMA.test(k) && !k.startsWith(AWALAN_KUNCI)).forEach((k) => ls().removeItem(k));
  } catch {
    /* mode privat */
  }
  return {
    baca: () => {
      try {
        return ls().getItem(kunci);
      } catch {
        return null;
      }
    },
    tulis: (teks) => {
      try {
        ls().setItem(kunci, teks);
      } catch (e) {
        const lain = Object.keys(ls()).filter((k) => k.startsWith(AWALAN_KUNCI) && k !== kunci);
        if (lain.length === 0) throw e;
        lain.forEach((k) => ls().removeItem(k));
        ls().setItem(kunci, teks);
      }
    },
    hapus: () => {
      try {
        ls().removeItem(kunci);
      } catch {
        /* abaikan */
      }
    },
  };
}
