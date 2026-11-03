// Galat dari API (mock atau backend asli), bentuknya sama dengan proyek rekrutmen.
//   status 0 + kode 'JARINGAN' = gagal terhubung.
export class ErrorApi extends Error {
  constructor(status, kode, pesan, detail = []) {
    super(pesan);
    this.name = 'ErrorApi';
    this.status = status;
    this.kode = kode;
    this.detail = detail;
  }

  // [{ field: 'nama', pesan: 'Wajib diisi' }] → { nama: 'Wajib diisi' }
  get perField() {
    return Object.fromEntries(this.detail.filter((d) => d.field).map((d) => [d.field, d.pesan]));
  }
}
