// Mock API: "backend palsu" di browser yang mematuhi kontrak yang sama dengan backend asli nanti.
//
//   const api = buatMockApi({ penyimpanan, buatDataAwal })
//   await api.panggil('/transaksi', { method: 'POST', body, penggunaId })
//     → { status: 201, data: {...} }   atau melempar ErrorApi
//
// Prinsip:
//   - Setiap request atomik: data disalin, diubah, lalu disimpan hanya jika berhasil.
//   - Body divalidasi dengan skema zod (skema/), aturan bisnis dengan logika/.
//   - Di dalam: jumlah bahan ×10. Di luar (respons): angka biasa dalam satuan dasar.
//   - Crew tidak pernah menerima angka stok (hitung buta).

import { ErrorApi } from '../ErrorApi.js';
import * as S from '../../../../skema/index.js';
import { keX10, dariX10 } from '../../../../logika/angka.js';
import { ErrorValidasi } from '../../../../logika/galat.js';
import { validasiBahan, konversiResep } from '../../../../logika/resep.js';
import { hitungPemakaian, cekStokMinus } from '../../../../logika/pemakaian.js';
import {
  jumlahkanPemakaian, hitungSelisihShift, selisihSerahTerima,
  buatPenyesuaian, hitungKas, saranToleransi,
} from '../../../../logika/shift.js';

const H = dariX10;
const galat = (status, kode, pesan, detail) => new ErrorApi(status, kode, pesan, detail);
const konflik = (pesan) => galat(409, 'KONFLIK', pesan);
const tidakAda = (apa = 'Data') => galat(404, 'TIDAK_DITEMUKAN', `${apa} tidak ditemukan`);
const validasi = (pesan, detail) => galat(400, 'VALIDASI', pesan, detail);

// ===========================================================================
// Bantuan data
// ===========================================================================

export function tanggalLokal(iso, zona) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

const indeksBahan = (st) => new Map(st.bahan.map((b) => [b.id, b]));
const cariBahan = (st, id) => st.bahan.find((b) => b.id === id);
const shiftTerbuka = (st) => st.shift.find((s) => s.status === 'terbuka') ?? null;
const namaPengguna = (st, id) => (id ? st.pengguna.find((p) => p.id === id)?.nama ?? id : null);

function wajibShiftTerbuka(st) {
  const s = shiftTerbuka(st);
  if (!s) throw konflik('Belum ada shift yang dibuka. Buka shift dulu.');
  return s;
}

// Resep mana saja (menu & topping) yang memakai bahan ini.
function pemakaiResep(st, bahanId) {
  const hasil = [];
  for (const m of st.menu) {
    for (const u of m.ukuran) {
      for (const r of u.resep) if (r.bahanId === bahanId) hasil.push({ label: `${m.nama} ${u.nama}`, satuan: r.satuan });
    }
  }
  for (const t of st.topping) {
    for (const r of t.resep) if (r.bahanId === bahanId) hasil.push({ label: `topping ${t.nama}`, satuan: r.satuan });
  }
  return hasil;
}

// Toleransi minimum efektif (×10). null = otomatis, mengikuti ketelitian hitung fisik yang umum:
//   gr → 2 gr (timbangan dapur), ml → 10 ml (gelas takar), satuan lain (pcs, keping, ...) → 0 (dihitung pas).
// Sengaja BUKAN "satu satuan takar": garis gelas = 150 ml jauh lebih besar dari 5% pemakaian satu shift,
// sehingga boros 15% pun tetap terlihat wajar (ditemukan saat membuat data demo).
const MINIMUM_OTOMATIS_X10 = { gr: 20, ml: 100 };
export function toleransiMinimumX10(bahan) {
  if (bahan.toleransiMinimumX10 !== null) return bahan.toleransiMinimumX10;
  return MINIMUM_OTOMATIS_X10[bahan.satuanDasar.trim().toLowerCase()] ?? 0;
}

// { creamer: 1580 } (angka biasa) → { creamer: 15800 } (×10), dan harus tepat berisi idWajib.
function hitunganKeX10(hitungan, idWajib, st) {
  const detail = [];
  const wajib = new Set(idWajib);
  for (const id of idWajib) {
    if (!(id in hitungan)) detail.push({ field: `hitungan.${id}`, pesan: `${cariBahan(st, id)?.nama ?? id} belum dihitung` });
  }
  for (const id of Object.keys(hitungan)) {
    if (!wajib.has(id)) detail.push({ field: `hitungan.${id}`, pesan: 'Bahan ini tidak termasuk yang dihitung' });
  }
  if (detail.length) throw validasi('Hitungan tidak lengkap', detail);
  const hasil = {};
  for (const id of idWajib) hasil[id] = keX10(hitungan[id], `hitungan.${id}`);
  return hasil;
}

function terapkanPenyesuaian(st, ctx, sumber, refId, hitunganX10) {
  const daftar = buatPenyesuaian(st.stok, hitunganX10);
  for (const p of daftar) {
    st.stok[p.bahanId] = p.keX10;
    st.penyesuaian.push({ id: ctx.id('sesuai'), sumber, refId, oleh: ctx.pengguna.id, pada: ctx.pada, ...p });
  }
  return daftar;
}

function angkaKeTampilan(obj) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v === null ? null : H(v)]));
}

// ===========================================================================
// Tampilan (respons). Hanya fungsi ini yang menentukan apa yang keluar.
// ===========================================================================

function riwayatSelisih(st, bahanId) {
  return st.shift
    .flatMap((s) => s.hasil?.bahan ?? [])
    .filter((r) => r.bahanId === bahanId)
    .map((r) => ({ pakaiX10: r.pakaiX10, selisihX10: r.selisihX10 }));
}

function tampilBahan(st, b, peran) {
  const dasar = { id: b.id, nama: b.nama, satuanDasar: b.satuanDasar, satuanBantu: b.satuanBantu, bahanKunci: b.bahanKunci, arsip: b.arsip };
  if (peran !== 'owner') return dasar; // hitung buta: crew tidak menerima stok
  const stokX10 = st.stok[b.id] ?? 0;
  return {
    ...dasar,
    stok: H(stokX10),
    batasMinimum: H(b.batasMinimumX10),
    hampirHabis: stokX10 <= b.batasMinimumX10,
    toleransiPersen: b.toleransiPersen,
    toleransiMinimum: H(toleransiMinimumX10(b)),
    toleransiMinimumOtomatis: b.toleransiMinimumX10 === null,
    dipakaiDi: pemakaiResep(st, b.id).map((p) => p.label),
    saranToleransi: saranToleransi(riwayatSelisih(st, b.id)),
  };
}

function tampilHasilBaris(st, r) {
  const b = cariBahan(st, r.bahanId);
  return {
    bahanId: r.bahanId, nama: b?.nama ?? r.bahanId, satuanDasar: b?.satuanDasar ?? '',
    awal: H(r.awalX10), masuk: H(r.masukX10), pakai: H(r.pakaiX10), seharusnya: H(r.seharusnyaX10),
    akhir: H(r.akhirX10), selisih: H(r.selisihX10), batas: H(r.batasX10), status: r.status, arah: r.arah,
  };
}

function tampilShiftRingkas(st, s) {
  return {
    id: s.id, nama: s.nama, status: s.status,
    dibukaOleh: namaPengguna(st, s.dibukaOleh), dibukaPada: s.dibukaPada,
    ditutupOleh: namaPengguna(st, s.ditutupOleh), ditutupPada: s.ditutupPada,
    hitungKas: s.hitungKas,
    bahanKunci: s.bahanKunci.map((id) => {
      const b = cariBahan(st, id);
      return { id, nama: b?.nama ?? id, satuanDasar: b?.satuanDasar ?? '' };
    }),
  };
}

function tampilShiftLengkap(st, s) {
  const trx = st.transaksi.filter((t) => t.shiftId === s.id);
  return {
    ...tampilShiftRingkas(st, s),
    jumlahTransaksi: trx.length,
    totalPenjualan: trx.reduce((a, t) => a + t.total, 0),
    kasAwal: s.kasAwal,
    kasAkhir: s.kasAkhir,
    serahTerima: s.serahTerima && {
      dariShiftId: s.serahTerima.dariShiftId,
      bahan: s.serahTerima.bahan.map((r) => ({
        bahanId: r.bahanId, nama: cariBahan(st, r.bahanId)?.nama ?? r.bahanId,
        akhirSebelumnya: r.akhirSebelumnyaX10 === null ? null : H(r.akhirSebelumnyaX10),
        awal: H(r.awalX10), selisih: r.selisihX10 === null ? null : H(r.selisihX10),
      })),
      kasSelisih: s.serahTerima.kasSelisih,
    },
    hasil: s.hasil && {
      sumberAkhir: s.hasil.sumberAkhir,
      bahan: s.hasil.bahan.map((r) => tampilHasilBaris(st, r)),
      kas: s.hasil.kas,
    },
  };
}

function ringkasStatusShift(s) {
  const bahan = s.hasil?.bahan ?? [];
  return { jumlahPerluDicek: bahan.filter((r) => r.status === 'perlu_dicek').length, statusKas: s.hasil?.kas?.status ?? null };
}

function tampilBarangMasuk(st, e) {
  const b = cariBahan(st, e.bahanId);
  return {
    id: e.id, shiftId: e.shiftId, oleh: namaPengguna(st, e.oleh), pada: e.pada,
    bahanId: e.bahanId, nama: b?.nama ?? e.bahanId,
    jumlah: e.jumlah, satuan: e.satuan, jumlahDasar: H(e.jumlahX10), satuanDasar: b?.satuanDasar ?? '',
    koreksiDari: e.koreksiDari, alasan: e.alasan,
  };
}

// ===========================================================================
// Inti shift
// ===========================================================================

// Menghitung hasil shift (selisih bahan + kas) dan menandai shift selesai.
function finalisasiShift(st, ctx, shift, akhirX10, kasAkhir, sumberAkhir) {
  const trx = st.transaksi.filter((t) => t.shiftId === shift.id);
  const masuk = {};
  for (const e of st.barangMasuk.filter((e) => e.shiftId === shift.id)) masuk[e.bahanId] = (masuk[e.bahanId] ?? 0) + e.jumlahX10;

  // Bahan kunci yang dihitung di kedua sisi (bisa berkurang jika owner mengubah bahan kunci di tengah jalan).
  const dihitung = shift.bahanKunci.filter((id) => id in akhirX10);
  const toleransi = Object.fromEntries(
    dihitung.map((id) => {
      const b = cariBahan(st, id);
      return [id, { persen: b.toleransiPersen, minimumX10: toleransiMinimumX10(b) }];
    }),
  );
  const bahan = dihitung.length
    ? hitungSelisihShift({
        bahanKunci: dihitung,
        hitungAwal: shift.hitungAwal,
        hitungAkhir: akhirX10,
        masuk,
        pemakaian: jumlahkanPemakaian(trx),
        toleransi,
        sumberAkhir,
      })
    : [];

  let kas = null;
  if (shift.hitungKas && kasAkhir !== null && kasAkhir !== undefined) {
    kas = hitungKas({
      kasAwal: shift.kasAwal,
      penjualanTunai: trx.filter((t) => t.metodeBayar === 'tunai').reduce((a, t) => a + t.total, 0),
      pengeluaran: st.pengeluaranKas.filter((p) => p.shiftId === shift.id).reduce((a, p) => a + p.jumlah, 0),
      kasAkhir,
      toleransiRupiah: st.pengaturan.toleransiKasRupiah,
    });
  }

  shift.hitungAkhir = akhirX10;
  shift.kasAkhir = kasAkhir ?? null;
  // Disimpan sebagai salinan (A-14): mengubah toleransi nanti tidak mengubah hasil ini.
  shift.hasil = { sumberAkhir, bahan, kas };
  shift.status = sumberAkhir === 'tutup' ? 'ditutup' : 'tidak_ditutup';
  shift.ditutupOleh = sumberAkhir === 'tutup' ? ctx.pengguna.id : null;
  shift.ditutupPada = ctx.pada;
}

// ===========================================================================
// Handler
// ===========================================================================

function idBaru(st) {
  return (awalan) => `${awalan}-${++st.urut}`;
}

function bahanDariBody(st, body, lama) {
  const bahan = {
    id: lama?.id ?? '(baru)',
    nama: body.nama,
    satuanDasar: body.satuanDasar,
    satuanBantu: body.satuanBantu,
    batasMinimumX10: keX10(body.batasMinimum, 'batasMinimum'),
    bahanKunci: body.bahanKunci,
    toleransiPersen: body.toleransiPersen,
    toleransiMinimumX10: body.toleransiMinimum === undefined ? null : keX10(body.toleransiMinimum, 'toleransiMinimum'),
    arsip: lama?.arsip ?? false,
  };
  keX10(body.toleransiPersen, 'toleransiPersen');
  validasiBahan(bahan);
  const namaSama = st.bahan.find((b) => b.id !== lama?.id && b.nama.trim().toLowerCase() === body.nama.trim().toLowerCase());
  if (namaSama) throw validasi('Bahan tidak valid', [{ field: 'nama', pesan: `Bahan "${body.nama}" sudah ada` }]);
  return bahan;
}

function bahanPernahDipakai(st, id) {
  return (
    pemakaiResep(st, id).length > 0 ||
    st.transaksi.some((t) => id in t.pemakaian) ||
    st.barangMasuk.some((e) => e.bahanId === id) ||
    (st.stok[id] ?? 0) !== 0
  );
}

// Validasi resep terhadap bahan yang tidak diarsipkan; field galat diberi awalan path body.
function periksaResep(st, resep, awalan, label) {
  const aktif = new Map(st.bahan.filter((b) => !b.arsip).map((b) => [b.id, b]));
  try {
    konversiResep(resep, aktif, awalan);
  } catch (e) {
    if (e instanceof ErrorValidasi) throw validasi(`${label} tidak valid`, e.detail);
    throw e;
  }
}

function periksaMenu(st, body) {
  body.ukuran.forEach((u, i) => periksaResep(st, u.resep, `ukuran[${i}].resep`, `Resep ${u.nama}`));
  const ada = new Set(st.topping.map((t) => t.id));
  const salah = body.toppingIds.map((tid, i) => ({ tid, i })).filter(({ tid }) => !ada.has(tid));
  if (salah.length) throw validasi('Menu tidak valid', salah.map(({ tid, i }) => ({ field: `toppingIds[${i}]`, pesan: `Topping "${tid}" tidak ditemukan` })));
}

const rute = [];
const daftar = (method, pola, peran, skema, fn) => {
  const nama = [];
  const regex = new RegExp('^' + pola.replace(/:(\w+)/g, (_, n) => (nama.push(n), '([^/]+)')) + '$');
  rute.push({ method, regex, nama, peran, skema, fn });
};
const SEMUA = ['owner', 'crew'];
const OWNER = ['owner'];

// ---------- pengguna (demo, tanpa password) ----------
daftar('GET', '/pengguna', null, null, ({ st }) => st.pengguna.map((p) => ({ id: p.id, nama: p.nama, peran: p.peran })));

// ---------- bahan ----------
daftar('GET', '/bahan', SEMUA, null, ({ st, pengguna }) => st.bahan.map((b) => tampilBahan(st, b, pengguna.peran)));

daftar('POST', '/bahan', OWNER, S.BahanBody, (ctx) => {
  const { st, body } = ctx;
  const bahan = bahanDariBody(st, body, null);
  bahan.id = ctx.id('bahan');
  st.bahan.push(bahan);
  st.stok[bahan.id] = 0;
  ctx.status = 201;
  return tampilBahan(st, bahan, 'owner');
});

daftar('PUT', '/bahan/:id', OWNER, S.BahanBody, ({ st, body, params }) => {
  const lama = cariBahan(st, params.id);
  if (!lama) throw tidakAda('Bahan');
  const baru = bahanDariBody(st, body, lama);

  // A-02: satuan dasar terkunci setelah dipakai.
  if (baru.satuanDasar.trim().toLowerCase() !== lama.satuanDasar.trim().toLowerCase() && bahanPernahDipakai(st, lama.id)) {
    throw konflik(`Satuan dasar "${lama.satuanDasar}" tidak bisa diubah karena bahan ini sudah dipakai. Buat bahan baru jika satuannya memang berbeda.`);
  }
  // Satuan bantu yang dipakai resep tidak boleh hilang (resep jadi rusak).
  const namaBaru = new Set([baru.satuanDasar, ...baru.satuanBantu.map((s) => s.nama)].map((n) => n.trim().toLowerCase()));
  const rusak = pemakaiResep(st, lama.id).filter((p) => !namaBaru.has(p.satuan.trim().toLowerCase()));
  if (rusak.length) {
    throw konflik(`Satuan "${rusak[0].satuan}" masih dipakai di ${rusak.map((r) => r.label).join(', ')}. Ubah resepnya dulu.`);
  }
  Object.assign(lama, baru, { id: lama.id });
  return tampilBahan(st, lama, 'owner');
});

daftar('PATCH', '/bahan/:id/arsip', OWNER, S.ArsipBody, ({ st, body, params }) => {
  const b = cariBahan(st, params.id);
  if (!b) throw tidakAda('Bahan');
  if (body.arsip) {
    const pakai = pemakaiResep(st, b.id);
    if (pakai.length) throw konflik(`Bahan masih dipakai di ${pakai.map((p) => p.label).join(', ')}. Hapus dari resep dulu.`);
  }
  b.arsip = body.arsip;
  return tampilBahan(st, b, 'owner');
});

// ---------- menu & topping ----------
daftar('GET', '/menu', SEMUA, null, ({ st }) => st.menu);
daftar('GET', '/topping', SEMUA, null, ({ st }) => st.topping);

daftar('POST', '/menu', OWNER, S.MenuBody, (ctx) => {
  periksaMenu(ctx.st, ctx.body);
  const menu = { id: ctx.id('menu'), ...ctx.body };
  ctx.st.menu.push(menu);
  ctx.status = 201;
  return menu;
});

daftar('PUT', '/menu/:id', OWNER, S.MenuBody, ({ st, body, params }) => {
  const m = st.menu.find((x) => x.id === params.id);
  if (!m) throw tidakAda('Menu');
  periksaMenu(st, body);
  Object.assign(m, body); // transaksi lama punya salinan pemakaian sendiri (A-07)
  return m;
});

daftar('POST', '/topping', OWNER, S.ToppingBody, (ctx) => {
  periksaResep(ctx.st, ctx.body.resep, 'resep', `Resep topping ${ctx.body.nama}`);
  const t = { id: ctx.id('topping'), ...ctx.body };
  ctx.st.topping.push(t);
  ctx.status = 201;
  return t;
});

daftar('PUT', '/topping/:id', OWNER, S.ToppingBody, ({ st, body, params }) => {
  const t = st.topping.find((x) => x.id === params.id);
  if (!t) throw tidakAda('Topping');
  periksaResep(st, body.resep, 'resep', `Resep topping ${body.nama}`);
  Object.assign(t, body);
  return t;
});

// ---------- pengaturan ----------
daftar('GET', '/pengaturan', SEMUA, null, ({ st }) => st.pengaturan);

daftar('PUT', '/pengaturan', OWNER, S.PengaturanBody, ({ st, body }) => {
  Object.assign(st.pengaturan, body); // shift yang sedang terbuka memakai salinan hitungKas-nya sendiri
  return st.pengaturan;
});

// ---------- shift ----------
daftar('GET', '/shift/aktif', SEMUA, null, ({ st }) => {
  const s = shiftTerbuka(st);
  return s ? tampilShiftRingkas(st, s) : null;
});

// Daftar yang perlu dihitung saat buka shift (crew butuh ini sebelum shift ada).
daftar('GET', '/shift/persiapan', SEMUA, null, ({ st }) => ({
  namaShift: st.pengaturan.shift.map((s) => s.nama),
  hitungKas: st.pengaturan.hitungKas,
  bahanKunci: st.bahan.filter((b) => b.bahanKunci && !b.arsip).map((b) => ({ id: b.id, nama: b.nama, satuanDasar: b.satuanDasar })),
  shiftTerbuka: shiftTerbuka(st) ? tampilShiftRingkas(st, shiftTerbuka(st)) : null,
}));

daftar('POST', '/shift/buka', SEMUA, S.BukaShiftBody, (ctx) => {
  const { st, body } = ctx;
  if (!st.pengaturan.shift.some((s) => s.nama === body.namaShift)) {
    throw validasi('Shift tidak valid', [{ field: 'namaShift', pesan: `Shift "${body.namaShift}" tidak ada di pengaturan` }]);
  }
  const bahanKunci = st.bahan.filter((b) => b.bahanKunci && !b.arsip).map((b) => b.id);
  if (bahanKunci.length === 0) throw konflik('Owner belum memilih bahan kunci. Shift belum bisa dibuka.');
  const hitungKasAktif = st.pengaturan.hitungKas;
  if (hitungKasAktif && body.kasAwal === undefined) throw validasi('Kas belum dihitung', [{ field: 'kasAwal', pesan: 'Wajib diisi' }]);
  if (!hitungKasAktif && body.kasAwal !== undefined) throw validasi('Hitung kas tidak aktif', [{ field: 'kasAwal', pesan: 'Tidak dipakai' }]);

  const awalX10 = hitunganKeX10(body.hitungan, bahanKunci, st);

  // Shift sebelumnya lupa ditutup → hitungan ini dipakai sebagai hitungan akhirnya.
  const lupa = shiftTerbuka(st);
  if (lupa) finalisasiShift(st, ctx, lupa, awalX10, hitungKasAktif ? body.kasAwal : null, 'buka_berikutnya');

  // Serah terima dibandingkan dengan shift terakhir sebelum ini.
  const sebelumnya = st.shift.at(-1) ?? null;
  const serahTerima = sebelumnya && {
    dariShiftId: sebelumnya.id,
    // Shift yang tidak ditutup tidak punya hitungan akhir sendiri → selisih null, bukan 0.
    bahan: selisihSerahTerima(sebelumnya.status === 'ditutup' ? sebelumnya.hitungAkhir : null, awalX10),
    kasSelisih:
      sebelumnya.status === 'ditutup' && sebelumnya.kasAkhir !== null && hitungKasAktif ? body.kasAwal - sebelumnya.kasAkhir : null,
  };

  const shift = {
    id: ctx.id('shift'),
    nama: body.namaShift,
    status: 'terbuka',
    dibukaOleh: ctx.pengguna.id,
    dibukaPada: ctx.pada,
    ditutupOleh: null,
    ditutupPada: null,
    bahanKunci, // salinan: perubahan bahan kunci di tengah shift tidak berlaku untuk shift ini
    hitungKas: hitungKasAktif,
    hitungAwal: awalX10,
    kasAwal: hitungKasAktif ? body.kasAwal : null,
    hitungAkhir: null,
    kasAkhir: null,
    serahTerima,
    hasil: null,
  };
  st.shift.push(shift);
  terapkanPenyesuaian(st, ctx, 'buka', shift.id, awalX10);
  ctx.status = 201;
  return tampilShiftRingkas(st, shift);
});

daftar('POST', '/shift/tutup', SEMUA, S.TutupShiftBody, (ctx) => {
  const { st, body } = ctx;
  const shift = wajibShiftTerbuka(st);
  if (shift.hitungKas && body.kasAkhir === undefined) throw validasi('Kas belum dihitung', [{ field: 'kasAkhir', pesan: 'Wajib diisi' }]);
  if (!shift.hitungKas && body.kasAkhir !== undefined) throw validasi('Hitung kas tidak aktif', [{ field: 'kasAkhir', pesan: 'Tidak dipakai' }]);
  const akhirX10 = hitunganKeX10(body.hitungan, shift.bahanKunci, st);
  finalisasiShift(st, ctx, shift, akhirX10, shift.hitungKas ? body.kasAkhir : null, 'tutup');
  terapkanPenyesuaian(st, ctx, 'tutup', shift.id, akhirX10);
  // Crew hanya mendapat konfirmasi; hasil selisih untuk owner.
  return { id: shift.id, status: shift.status, ditutupPada: shift.ditutupPada };
});

daftar('GET', '/shift', OWNER, null, ({ st }) =>
  [...st.shift].reverse().map((s) => ({ ...tampilShiftRingkas(st, s), ...ringkasStatusShift(s) })),
);

daftar('GET', '/shift/:id', OWNER, null, ({ st, params }) => {
  const s = st.shift.find((x) => x.id === params.id);
  if (!s) throw tidakAda('Shift');
  return tampilShiftLengkap(st, s);
});

// ---------- transaksi ----------
daftar('POST', '/transaksi', SEMUA, S.TransaksiBody, (ctx) => {
  const { st, body } = ctx;
  const shift = wajibShiftTerbuka(st);
  const katalog = { bahan: st.bahan, menu: st.menu, topping: st.topping };
  const pemakaian = hitungPemakaian(body.item, katalog); // validasi menu/ukuran/topping/qty + resep

  // Harga dihitung di sini, tidak pernah dipercaya dari browser.
  const item = body.item.map((it) => {
    const menu = st.menu.find((m) => m.id === it.menuId);
    const ukuran = menu.ukuran.find((u) => u.nama === it.ukuran);
    const toppings = it.toppingIds.map((tid) => {
      const t = st.topping.find((x) => x.id === tid);
      return { id: t.id, nama: t.nama, harga: t.harga };
    });
    const hargaSatuan = ukuran.harga + toppings.reduce((a, t) => a + t.harga, 0);
    return { menuId: menu.id, nama: menu.nama, ukuran: ukuran.nama, toppings, qty: it.qty, hargaSatuan, subtotal: hargaSatuan * it.qty };
  });
  const total = item.reduce((a, i) => a + i.subtotal, 0);
  if (body.metodeBayar === 'tunai' && body.uangDiterima < total) {
    throw validasi('Uang kurang', [{ field: 'uangDiterima', pesan: `Kurang Rp ${(total - body.uangDiterima).toLocaleString('id-ID')}` }]);
  }

  // A-08: tidak memblokir, hanya memberi tahu. Tanpa angka (hitung buta).
  const peringatanMinus = cekStokMinus(st.stok, pemakaian).map((m) => ({ bahanId: m.bahanId, nama: cariBahan(st, m.bahanId)?.nama ?? m.bahanId }));
  for (const [id, x10] of Object.entries(pemakaian)) st.stok[id] = (st.stok[id] ?? 0) - x10;

  const trx = {
    id: ctx.id('trx'),
    shiftId: shift.id,
    oleh: ctx.pengguna.id,
    pada: ctx.pada,
    item,
    total,
    metodeBayar: body.metodeBayar,
    uangDiterima: body.uangDiterima ?? null,
    kembalian: body.metodeBayar === 'tunai' ? body.uangDiterima - total : null,
    pemakaian, // salinan (A-07)
  };
  st.transaksi.push(trx);
  ctx.status = 201;
  const { pemakaian: _, shiftId: __, oleh, ...struk } = trx;
  return { ...struk, kasir: namaPengguna(st, oleh), peringatanMinus };
});

// ---------- barang masuk ----------
daftar('POST', '/barang-masuk', SEMUA, S.BarangMasukBody, (ctx) => {
  const { st, body } = ctx;
  const shift = wajibShiftTerbuka(st);
  const bahan = cariBahan(st, body.bahanId);
  if (!bahan || bahan.arsip) throw validasi('Bahan tidak valid', [{ field: 'bahanId', pesan: 'Bahan tidak ditemukan' }]);

  let mutlakX10;
  try {
    [{ jumlahX10: mutlakX10 }] = konversiResep([{ bahanId: bahan.id, jumlah: Math.abs(body.jumlah), satuan: body.satuan }], indeksBahan(st), 'barang');
  } catch (e) {
    if (e instanceof ErrorValidasi) throw validasi('Jumlah tidak valid', e.detail.map((d) => ({ ...d, field: d.field.replace(/^barang\[0\]\./, '') })));
    throw e;
  }
  const jumlahX10 = Math.sign(body.jumlah) * mutlakX10;

  if (body.koreksiDari !== undefined) {
    const asal = st.barangMasuk.find((e) => e.id === body.koreksiDari);
    if (!asal) throw validasi('Koreksi tidak valid', [{ field: 'koreksiDari', pesan: 'Entri yang dikoreksi tidak ditemukan' }]);
    if (asal.koreksiDari) throw validasi('Koreksi tidak valid', [{ field: 'koreksiDari', pesan: 'Koreksi harus merujuk entri asli, bukan entri koreksi' }]);
    if (asal.bahanId !== bahan.id) throw validasi('Koreksi tidak valid', [{ field: 'bahanId', pesan: 'Bahan harus sama dengan entri yang dikoreksi' }]);
    const bersih = st.barangMasuk.filter((e) => e.id === asal.id || e.koreksiDari === asal.id).reduce((a, e) => a + e.jumlahX10, 0);
    if (bersih + jumlahX10 < 0) throw konflik('Koreksi membuat jumlah barang masuk menjadi negatif');
  }

  const entri = {
    id: ctx.id('masuk'), shiftId: shift.id, oleh: ctx.pengguna.id, pada: ctx.pada,
    bahanId: bahan.id, jumlah: body.jumlah, satuan: body.satuan, jumlahX10,
    koreksiDari: body.koreksiDari ?? null, alasan: body.alasan ?? null,
  };
  st.barangMasuk.push(entri);
  st.stok[bahan.id] = (st.stok[bahan.id] ?? 0) + jumlahX10;
  ctx.status = 201;
  return tampilBarangMasuk(st, entri);
});

daftar('GET', '/barang-masuk', OWNER, null, ({ st }) => [...st.barangMasuk].reverse().map((e) => tampilBarangMasuk(st, e)));

// ---------- pengeluaran kas ----------
daftar('POST', '/pengeluaran-kas', SEMUA, S.PengeluaranKasBody, (ctx) => {
  const shift = wajibShiftTerbuka(ctx.st);
  if (!shift.hitungKas) throw konflik('Hitung kas tidak aktif di shift ini');
  const p = { id: ctx.id('keluar'), shiftId: shift.id, oleh: ctx.pengguna.id, pada: ctx.pada, ...ctx.body };
  ctx.st.pengeluaranKas.push(p);
  ctx.status = 201;
  return { ...p, oleh: namaPengguna(ctx.st, p.oleh) };
});

// ---------- stok opname ----------
daftar('POST', '/opname', SEMUA, S.OpnameBody, (ctx) => {
  const { st, body } = ctx;
  const semua = st.bahan.filter((b) => !b.arsip).map((b) => b.id);
  const hitunganX10 = hitunganKeX10(body.hitungan, semua, st);
  const op = { id: ctx.id('opname'), shiftId: shiftTerbuka(st)?.id ?? null, oleh: ctx.pengguna.id, pada: ctx.pada, hitungan: hitunganX10 };
  st.opname.push(op);
  const daftarSesuai = terapkanPenyesuaian(st, ctx, 'opname', op.id, hitunganX10);
  ctx.status = 201;
  if (ctx.pengguna.peran !== 'owner') return { id: op.id, jumlahBahan: semua.length };
  return {
    id: op.id, jumlahBahan: semua.length,
    penyesuaian: daftarSesuai.map((p) => ({ bahanId: p.bahanId, nama: cariBahan(st, p.bahanId).nama, dari: H(p.dariX10), ke: H(p.keX10), perubahan: H(p.perubahanX10) })),
  };
});

// ---------- laporan ----------
daftar('GET', '/laporan/harian', SEMUA, null, ({ st, query, pengguna, pada }) => {
  const zona = st.pengaturan.zonaWaktu;
  const hariIni = tanggalLokal(pada, zona);
  const tanggal = query.tanggal ?? hariIni;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) throw validasi('Tanggal tidak valid', [{ field: 'tanggal', pesan: 'Format YYYY-MM-DD' }]);
  if (pengguna.peran !== 'owner' && tanggal !== hariIni) throw galat(403, 'DILARANG', 'Crew hanya bisa melihat laporan hari ini');

  const trx = st.transaksi.filter((t) => tanggalLokal(t.pada, zona) === tanggal);
  const pakai = jumlahkanPemakaian(trx);
  return {
    tanggal,
    jumlahTransaksi: trx.length,
    totalPenjualan: trx.reduce((a, t) => a + t.total, 0),
    perMetode: {
      tunai: trx.filter((t) => t.metodeBayar === 'tunai').reduce((a, t) => a + t.total, 0),
      qris: trx.filter((t) => t.metodeBayar === 'qris').reduce((a, t) => a + t.total, 0),
    },
    pemakaian: Object.entries(pakai).map(([id, x10]) => {
      const b = cariBahan(st, id);
      return { bahanId: id, nama: b?.nama ?? id, satuanDasar: b?.satuanDasar ?? '', jumlah: H(x10) };
    }),
    transaksi: [...trx].reverse().map((t) => ({ id: t.id, pada: t.pada, total: t.total, metodeBayar: t.metodeBayar, kasir: namaPengguna(st, t.oleh), item: t.item })),
  };
});

// ---------- reset demo ----------
daftar('POST', '/reset', null, null, () => ({ ok: true })); // ditangani khusus di panggil()

// ===========================================================================
// Pintu masuk
// ===========================================================================

// Pemeriksaan terakhir sebelum respons keluar: tidak ada angka internal ×10 yang bocor,
// dan crew tidak pernah menerima field stok.
function periksaRespons(data, peran) {
  const jalan = (v, path) => {
    if (Array.isArray(v)) return v.forEach((x, i) => jalan(x, `${path}[${i}]`));
    if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (/X10$/.test(k)) throw new Error(`Bug mock: field internal ${path}.${k} bocor ke respons`);
        if (peran === 'crew' && (k === 'stok' || k === 'hasil')) throw new Error(`Bug mock: crew menerima ${path}.${k}`);
        jalan(x, `${path}.${k}`);
      }
    }
  };
  jalan(data, 'data');
}

export function buatMockApi({ penyimpanan, buatDataAwal, jedaMs = [300, 800], acak = Math.random, sekarang = () => new Date() }) {
  if (!penyimpanan || typeof buatDataAwal !== 'function') throw new TypeError('penyimpanan dan buatDataAwal wajib');

  const muat = async () => {
    const teks = penyimpanan.baca();
    if (teks) {
      try {
        const st = JSON.parse(teks);
        if (st?.versi === 1) return st;
      } catch {
        /* rusak → buat ulang */
      }
    }
    const st = await buatDataAwal();
    penyimpanan.tulis(JSON.stringify(st));
    return st;
  };

  async function panggil(alamat, { method = 'GET', body, penggunaId } = {}) {
    const [min, maks] = jedaMs;
    if (maks > 0) await new Promise((r) => setTimeout(r, min + acak() * (maks - min)));

    const url = new URL(alamat, 'http://mock.lokal');
    const query = Object.fromEntries(url.searchParams);

    // Galat buatan untuk mencoba tampilan galat di demo: /bahan?galat=500
    if (query.galat) {
      const status = Number(query.galat);
      throw galat(Number.isInteger(status) ? status : 500, 'BUATAN', `Galat buatan ${query.galat} untuk demo`);
    }

    if (method === 'POST' && url.pathname === '/reset') {
      penyimpanan.tulis(JSON.stringify(await buatDataAwal()));
      return { status: 200, data: { ok: true } };
    }

    let cocok = null;
    for (const r of rute) {
      const m = url.pathname.match(r.regex);
      if (m && r.method === method) {
        cocok = { r, params: Object.fromEntries(r.nama.map((n, i) => [n, decodeURIComponent(m[i + 1])])) };
        break;
      }
    }
    if (!cocok) throw galat(404, 'RUTE_TIDAK_ADA', `${method} ${url.pathname} tidak ada`);
    const { r, params } = cocok;

    // Salinan kerja: perubahan hanya disimpan jika handler selesai tanpa galat.
    const st = structuredClone(await muat());

    let pengguna = null;
    if (r.peran) {
      pengguna = st.pengguna.find((p) => p.id === penggunaId);
      if (!pengguna) throw galat(401, 'TIDAK_TERAUTENTIKASI', 'Pilih pengguna dulu');
      if (!r.peran.includes(pengguna.peran)) throw galat(403, 'DILARANG', 'Peran Anda tidak punya akses ke sini');
    }

    let isi;
    if (r.skema) {
      const hasil = r.skema.safeParse(body ?? {});
      if (!hasil.success) throw validasi('Data tidak valid', S.keDetail(hasil.error));
      isi = hasil.data;
    }

    const ctx = { st, body: isi, params, query, pengguna, pada: sekarang().toISOString(), id: idBaru(st), status: 200 };
    let data;
    try {
      data = r.fn(ctx);
    } catch (e) {
      if (e instanceof ErrorApi) throw e;
      if (e instanceof ErrorValidasi) throw validasi(e.message, e.detail);
      console.error('[mock] galat internal', e);
      throw galat(500, 'INTERNAL', 'Terjadi kesalahan di server');
    }
    data = structuredClone(data ?? null);
    periksaRespons(data, pengguna?.peran);
    if (method !== 'GET') penyimpanan.tulis(JSON.stringify(st));
    return { status: ctx.status, data };
  }

  return { panggil };
}
