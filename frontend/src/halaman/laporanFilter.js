// Filter daftar transaksi laporan (fungsi murni). Nilai filter disimpan di alamat halaman (?saluran=gofood&…),
// jadi laporan yang sudah difilter bisa dibuka ulang atau dikirim ke orang lain.
//
//   transaksi [{ saluran, metodeBayar, shift, kasir, batal, item: [{ nama }] }]
//     ── saringTransaksi(trx, { saluran: 'gofood', status: 'sah', cari: 'thai' }) ──▶ yang cocok saja

export const FILTER_KOSONG = { saluran: '', bayar: '', shift: '', kasir: '', status: '', cari: '' };
export const KUNCI_FILTER = Object.keys(FILTER_KOSONG);

export function bacaFilter(params) {
  return Object.fromEntries(KUNCI_FILTER.map((k) => [k, (params.get(k) ?? '').trim()]));
}

export const adaFilter = (f) => KUNCI_FILTER.some((k) => f[k] !== '');

export function saringTransaksi(transaksi, f) {
  if (!Array.isArray(transaksi)) throw new TypeError('transaksi wajib berupa daftar');
  const cari = f.cari.toLowerCase();
  return transaksi.filter((t) => {
    if (f.saluran && t.saluran !== f.saluran) return false;
    if (f.bayar && t.metodeBayar !== f.bayar) return false;
    if (f.shift && t.shift !== f.shift) return false;
    if (f.kasir && t.kasir !== f.kasir) return false;
    if (f.status === 'sah' && t.batal) return false;
    if (f.status === 'batal' && !t.batal) return false;
    if (cari && !t.item.some((it) => `${it.nama} ${it.ukuran ?? ''} ${it.namaAplikasi ?? ''}`.toLowerCase().includes(cari)) && !(t.nomorPesanan ?? '').toLowerCase().includes(cari)) return false;
    return true;
  });
}

// Ringkasan hasil filter. Transaksi batal dihitung terpisah (bukan penjualan).
export function ringkasHasil(transaksi) {
  const sah = transaksi.filter((t) => !t.batal);
  return { jumlah: sah.length, total: sah.reduce((a, t) => a + t.total, 0), batal: transaksi.length - sah.length };
}

// Pilihan unik untuk dropdown (urut abjad, tanpa kosong).
export const pilihanDari = (transaksi, kunci) => [...new Set(transaksi.map((t) => t[kunci]).filter(Boolean))].sort((a, b) => a.localeCompare(b));

// ---------- rentang tanggal (owner) ----------
// Tanggal YYYY-MM-DD dihitung sebagai tanggal kalender (UTC tengah hari), bebas dari zona waktu perangkat.
const keTanggal = (s) => new Date(`${s}T12:00:00Z`);
const keTeks = (d) => d.toISOString().slice(0, 10);
export const geserHari = (s, n) => {
  const d = keTanggal(s);
  d.setUTCDate(d.getUTCDate() + n);
  return keTeks(d);
};

export function rentangCepat(jenis, hariIni) {
  switch (jenis) {
    case 'hari-ini': return { dari: hariIni, sampai: hariIni };
    case 'kemarin': return { dari: geserHari(hariIni, -1), sampai: geserHari(hariIni, -1) };
    case '7-hari': return { dari: geserHari(hariIni, -6), sampai: hariIni };
    case 'bulan-ini': return { dari: `${hariIni.slice(0, 8)}01`, sampai: hariIni };
    default: throw new TypeError(`Rentang tidak dikenal: ${jenis}`);
  }
}
