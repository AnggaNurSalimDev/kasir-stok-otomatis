// Jadwal promo paket. Fungsi murni.
//
// Waktu ditulis sebagai waktu lokal outlet "YYYY-MM-DDTHH:mm" (sama dengan <input type="datetime-local">),
// dan dibandingkan dengan "sekarang" yang diubah ke waktu lokal zona outlet. Tidak ada hitung selisih jam manual,
// jadi aman untuk zona mana pun.
//
//   jadwal = { mulai?: '2026-11-10T00:00', selesai?: '2026-11-30T23:59', hari?: [5, 6, 0] }   (0 = Minggu)
//   statusPaket(paket, '2026-11-14T03:00:00Z', 'Asia/Jakarta') → { status: 'berlaku', dijual: true }

export const POLA_WAKTU = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
export const NAMA_HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export function waktuValid(s) {
  if (typeof s !== 'string' || !POLA_WAKTU.test(s)) return false;
  const d = new Date(`${s}:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 16) === s; // menolak 2026-02-30, 25:00
}

// ISO → { waktu: 'YYYY-MM-DDTHH:mm', hari: 0–6 } menurut zona.
export function waktuLokal(iso, zona) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new TypeError(`Waktu tidak valid: ${iso}`);
  const bagian = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  const hari = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(bagian.weekday);
  return { waktu: `${bagian.year}-${bagian.month}-${bagian.day}T${bagian.hour}:${bagian.minute}`, hari };
}

// Masalah bentuk jadwal (kosong = aman). Path field mengikuti body: 'jadwal.selesai'.
export function periksaJadwal(jadwal) {
  if (jadwal === undefined || jadwal === null) return [];
  const detail = [];
  if (jadwal.mulai !== undefined && !waktuValid(jadwal.mulai)) detail.push({ field: 'jadwal.mulai', pesan: 'Format waktu YYYY-MM-DDTHH:mm' });
  if (jadwal.selesai !== undefined && !waktuValid(jadwal.selesai)) detail.push({ field: 'jadwal.selesai', pesan: 'Format waktu YYYY-MM-DDTHH:mm' });
  if (waktuValid(jadwal.mulai) && waktuValid(jadwal.selesai) && jadwal.mulai >= jadwal.selesai) {
    detail.push({ field: 'jadwal.selesai', pesan: 'Waktu selesai harus setelah waktu mulai' });
  }
  if (jadwal.hari !== undefined) {
    const h = jadwal.hari;
    if (!Array.isArray(h) || h.length === 0 || h.some((x) => !Number.isInteger(x) || x < 0 || x > 6) || new Set(h).size !== h.length) {
      detail.push({ field: 'jadwal.hari', pesan: 'Pilih hari 0–6 tanpa dobel, atau kosongkan untuk setiap hari' });
    }
  }
  return detail;
}

// Status jual paket pada satu saat.
//   nonaktif  — dimatikan owner
//   terjadwal — belum mulai
//   berakhir  — sudah lewat waktu selesai
//   bukan_hari — dalam rentang, tapi bukan hari promonya
//   berlaku   — dijual sekarang
export function statusPaket(paket, sekarangIso, zona) {
  if (!paket) throw new TypeError('paket wajib diisi');
  if (!paket.aktif) return { status: 'nonaktif', dijual: false };
  const j = paket.jadwal;
  if (!j) return { status: 'berlaku', dijual: true };
  const { waktu, hari } = waktuLokal(sekarangIso, zona);
  if (j.mulai && waktu < j.mulai) return { status: 'terjadwal', dijual: false };
  if (j.selesai && waktu >= j.selesai) return { status: 'berakhir', dijual: false };
  if (j.hari && !j.hari.includes(hari)) return { status: 'bukan_hari', dijual: false };
  return { status: 'berlaku', dijual: true };
}

// "10 Nov 00.00 – 30 Nov 23.59 · Jumat, Sabtu, Minggu" (untuk tampilan).
export function ringkasJadwal(jadwal) {
  if (!jadwal) return 'Setiap hari, tanpa batas waktu';
  const fmt = (s) => {
    const [tgl, jam] = s.split('T');
    const [y, m, d] = tgl.split('-').map(Number);
    const bulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][m - 1];
    return `${d} ${bulan} ${y} ${jam.replace(':', '.')}`;
  };
  const rentang = jadwal.mulai && jadwal.selesai ? `${fmt(jadwal.mulai)} – ${fmt(jadwal.selesai)}`
    : jadwal.mulai ? `Mulai ${fmt(jadwal.mulai)}`
    : jadwal.selesai ? `Sampai ${fmt(jadwal.selesai)}`
    : 'Tanpa batas waktu';
  // Urut Senin → Minggu, seperti kalender kerja.
  const hari = jadwal.hari ? [...jadwal.hari].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((h) => NAMA_HARI[h]).join(', ') : 'setiap hari';
  return `${rentang} · ${hari}`;
}
