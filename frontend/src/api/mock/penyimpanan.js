// Tempat mock menyimpan seluruh data. Dua pilihan dengan antarmuka yang sama:
//   { baca(): string | null, tulis(teks: string): void, hapus(): void }

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

// localStorage bisa melempar (mode privat, kuota penuh). Galat baca dianggap "belum ada data";
// galat tulis diteruskan supaya pengguna tahu datanya tidak tersimpan.
export function penyimpananLokal(kunci = 'kasir-demo-v1') {
  return {
    baca: () => {
      try {
        return window.localStorage.getItem(kunci);
      } catch {
        return null;
      }
    },
    tulis: (teks) => window.localStorage.setItem(kunci, teks),
    hapus: () => {
      try {
        window.localStorage.removeItem(kunci);
      } catch {
        /* abaikan */
      }
    },
  };
}
