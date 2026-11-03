// Galat validasi dengan bentuk yang sama seperti format error API:
// { kode: 'VALIDASI', pesan, detail: [{ field, pesan }] }
export class ErrorValidasi extends Error {
  constructor(pesan, detail = []) {
    super(pesan);
    this.name = 'ErrorValidasi';
    this.kode = 'VALIDASI';
    this.detail = detail;
  }
}

// Lempar ErrorValidasi jika ada minimal satu masalah.
export function lemparJikaAda(pesan, detail) {
  if (detail.length > 0) throw new ErrorValidasi(pesan, detail);
}
