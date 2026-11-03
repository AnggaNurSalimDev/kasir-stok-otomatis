// Penyingkat untuk menulis katalog demo.

export const sb = (nama, konversi) => ({ nama, konversi });
export const r = (bahanId, jumlah, satuan) => ({ bahanId, jumlah, satuan });

// toleransiMinimum: null = otomatis (gr → 2, ml → 10, lainnya → 0). Isi angka (satuan dasar) untuk menimpa.
export const bahan = (id, nama, satuanDasar, satuanBantu, batasMinimum, bahanKunci = false, toleransiMinimum = null) => ({
  id,
  nama,
  satuanDasar,
  satuanBantu,
  batasMinimumX10: Math.round(batasMinimum * 10),
  bahanKunci,
  toleransiPersen: 5,
  toleransiMinimumX10: toleransiMinimum === null ? null : Math.round(toleransiMinimum * 10),
  arsip: false,
});
