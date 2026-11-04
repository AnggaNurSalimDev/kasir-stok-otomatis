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
import { SALURAN_ONLINE, NAMA_SALURAN, adalahOnline, hargaDi, perkiraanKomisi, cocokkanItem, normalkanPemetaan, bagiHarga } from '../../../../logika/saluran.js';

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

// Bahan yang wajib dihitung saat buka dan saat tutup sebuah shift, menurut pengaturan:
//   tidak         → bahan kunci saja
//   outlet        → semua bahan saat buka outlet (shift pertama) dan tutup outlet (shift terakhir);
//                   pergantian shift di tengah hari tetap bahan kunci
//   setiap_shift  → semua bahan di setiap buka dan tutup
export const MODE_HITUNG = ['tidak', 'outlet', 'setiap_shift'];
function daftarHitung(st, namaShift) {
  const mode = st.pengaturan.hitungSemuaBahan ?? 'tidak';
  const nama = st.pengaturan.shift.map((s) => s.nama);
  const kunci = st.bahan.filter((b) => b.bahanKunci && !b.arsip).map((b) => b.id);
  const semua = st.bahan.filter((b) => !b.arsip).map((b) => b.id);
  const awalSemua = mode === 'setiap_shift' || (mode === 'outlet' && namaShift === nama[0]);
  const tutupSemua = mode === 'setiap_shift' || (mode === 'outlet' && namaShift === nama.at(-1));
  return { mode, kunci, awal: awalSemua ? semua : kunci, tutup: tutupSemua ? semua : kunci, awalSemua, tutupSemua };
}

// ---------- saluran online ----------
export const SALURAN_BAWAAN = Object.fromEntries(SALURAN_ONLINE.map((s) => [s, { aktif: false, mode: 'manual', komisiPersen: 20, tersambungPada: null }]));
const setelSaluran = (st, s) => st.pengaturan.saluran?.[s] ?? SALURAN_BAWAAN[s];
const transaksiSah = (trx) => trx.filter((t) => !t.batal); // batal: penjualan tidak dihitung, bahan tetap terpakai
const jumlahUang = (trx) => trx.reduce((a, t) => a + t.total, 0);

// Nomor pesanan unik per saluran, baik yang dicatat manual maupun yang masuk otomatis (A-19).
function nomorDipakai(st, saluran, nomor) {
  const n = nomor.trim().toLowerCase();
  const sama = (x) => x.saluran === saluran && x.nomorPesanan?.trim().toLowerCase() === n;
  return st.pesananMasuk.find(sama) ?? st.transaksi.find(sama) ?? null; // pesanan otomatis dulu: yang diterima juga punya transaksi
}

function indeksKatalog(st) {
  return {
    menuById: new Map(st.menu.map((m) => [m.id, m])),
    toppingById: new Map(st.topping.map((t) => [t.id, t])),
    paketById: new Map((st.paket ?? []).map((p) => [p.id, p])),
  };
}

// Setiap item pesanan aplikasi dicocokkan ke menu kasir saat dibaca (pemetaan bisa ditambah belakangan).
function cocokkanPesanan(st, p) {
  const indeks = { ...indeksKatalog(st), pemetaan: st.pemetaan[p.saluran] ?? {} };
  return p.item.map((it) => ({ it, cocok: cocokkanItem(it, indeks) }));
}

function tampilPesanan(st, p) {
  const baris = cocokkanPesanan(st, p);
  const item = baris.map(({ it, cocok }) => {
    if (cocok.masalah) return { kode: it.kode, nama: it.nama, qty: it.qty, harga: it.harga, topping: it.topping, masalah: cocok.masalah, isiKasir: null };
    const isiKasir = cocok.isi.map((k) => {
      const menu = st.menu.find((m) => m.id === k.menuId);
      return { menuId: menu.id, nama: menu.nama, ukuran: k.ukuran, qty: k.qty };
    });
    const dipetakan = Boolean(st.pemetaan[p.saluran]?.[it.kode]);
    const paketKasir = cocok.paketId ? st.paket.find((x) => x.id === cocok.paketId) : null;
    // Pembanding harga: paket kasir → harga paket di saluran itu; menu sinkron → harga menu; pemetaan → tidak ada pembanding.
    const hargaKasir = paketKasir ? paketKasir.hargaSaluran[p.saluran] : dipetakan ? undefined : hargaKasirIsi(st, cocok.isi, p.saluran)[0];
    return {
      kode: it.kode, nama: it.nama, qty: it.qty, harga: it.harga, topping: it.topping, masalah: null, isiKasir,
      sumber: paketKasir ? 'paket' : dipetakan ? 'pemetaan' : 'menu',
      hargaBerbeda: hargaKasir !== undefined && hargaKasir !== it.harga,
    };
  });
  const trx = p.transaksiId ? st.transaksi.find((t) => t.id === p.transaksiId) : null;
  return {
    id: p.id, saluran: p.saluran, namaSaluran: NAMA_SALURAN[p.saluran], nomorPesanan: p.nomorPesanan, pelanggan: p.pelanggan,
    catatan: p.catatan ?? null, total: p.total, masukPada: p.masukPada, status: p.status,
    item, siapDiterima: item.every((i) => !i.masalah), hargaBerbeda: item.some((i) => i.hargaBerbeda),
    diprosesOleh: namaPengguna(st, p.diprosesOleh), diprosesPada: p.diprosesPada, alasan: p.alasan ?? null,
    transaksiId: p.transaksiId ?? null, batal: trx?.batal ? { pada: trx.batal.pada, alasan: trx.batal.alasan, sumber: trx.batal.sumber } : null,
  };
}

// Harga kasir (di saluran itu) untuk setiap isi: [harga isi 1 × qty, ...]
function hargaKasirIsi(st, isi, saluran) {
  return isi.map((k) => {
    const ukuran = st.menu.find((m) => m.id === k.menuId).ukuran.find((u) => u.nama === k.ukuran);
    return (hargaDi(ukuran, saluran) + k.toppingIds.reduce((a, tid) => a + hargaDi(st.topping.find((t) => t.id === tid), saluran), 0)) * k.qty;
  });
}

// { toko: { jumlah, total }, gofood: {...}, ... } — transaksi batal tidak dihitung.
function perSaluran(st, trx) {
  const hasil = {};
  for (const s of ['toko', ...SALURAN_ONLINE]) {
    const t = transaksiSah(trx).filter((x) => (x.saluran ?? 'toko') === s);
    const total = jumlahUang(t);
    hasil[s] = {
      nama: NAMA_SALURAN[s], jumlah: t.length, total,
      batal: trx.filter((x) => x.batal && (x.saluran ?? 'toko') === s).length,
      perkiraanKomisi: s === 'toko' ? 0 : perkiraanKomisi(total, setelSaluran(st, s).komisiPersen),
    };
  }
  return hasil;
}

const ringkasBahan = (st, ids) =>
  ids.map((id) => {
    const b = cariBahan(st, id);
    return { id, nama: b?.nama ?? id, satuanDasar: b?.satuanDasar ?? '', bahanKunci: Boolean(b?.bahanKunci) };
  });

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
      for (const r of u.resep) if (r.bahanId === bahanId) hasil.push({ label: `${m.nama} ${u.nama}`, menu: m.nama, satuan: r.satuan });
    }
  }
  for (const t of st.topping) {
    for (const r of t.resep) if (r.bahanId === bahanId) hasil.push({ label: `topping ${t.nama}`, menu: `topping ${t.nama}`, satuan: r.satuan });
  }
  return hasil;
}

// "Thai Tea Regular, Thai Tea Large, Coklat Regular, ..." → "Thai Tea, Coklat, Kopi Susu, dan 4 lainnya"
function ringkasPemakai(pakai, maks = 3) {
  const nama = [...new Set(pakai.map((p) => p.menu))];
  return nama.length <= maks ? nama.join(', ') : `${nama.slice(0, maks).join(', ')}, dan ${nama.length - maks} lainnya`;
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
    dipakaiDi: [...new Set(pemakaiResep(st, b.id).map((p) => p.menu))],
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
    // id dipakai halaman Shift untuk tahu apakah yang membuka sama dengan yang sedang masuk.
    dibukaOlehId: s.dibukaOleh, dibukaOleh: namaPengguna(st, s.dibukaOleh), dibukaPada: s.dibukaPada,
    ditutupOleh: namaPengguna(st, s.ditutupOleh), ditutupPada: s.ditutupPada,
    hitungKas: s.hitungKas,
    bahanKunci: ringkasBahan(st, s.bahanKunci),
    // Yang wajib dihitung saat tutup shift ini (bahan kunci, atau semua bahan saat tutup outlet).
    bahanTutup: ringkasBahan(st, s.bahanTutup ?? s.bahanKunci),
    tutupSemuaBahan: Boolean(s.tutupSemua),
  };
}

function tampilShiftLengkap(st, s) {
  const trx = st.transaksi.filter((t) => t.shiftId === s.id);
  return {
    ...tampilShiftRingkas(st, s),
    jumlahTransaksi: transaksiSah(trx).length,
    totalPenjualan: jumlahUang(transaksiSah(trx)),
    perSaluran: perSaluran(st, trx),
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

  // Selisih hanya bisa dihitung untuk bahan yang dihitung saat buka DAN saat tutup shift ini.
  // Urut sesuai daftar bahan supaya tabel owner rapi.
  const urutan = [...st.bahan.map((b) => b.id), ...Object.keys(shift.hitungAwal)];
  const dihitung = [...new Set(urutan)].filter((id) => id in shift.hitungAwal && id in akhirX10);
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
      penjualanTunai: jumlahUang(transaksiSah(trx).filter((t) => t.metodeBayar === 'tunai')), // pesanan aplikasi tidak masuk laci
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
    throw konflik(`Satuan "${rusak[0].satuan}" masih dipakai di ${ringkasPemakai(rusak)}. Ubah resepnya dulu.`);
  }
  Object.assign(lama, baru, { id: lama.id });
  return tampilBahan(st, lama, 'owner');
});

daftar('PATCH', '/bahan/:id/arsip', OWNER, S.ArsipBody, ({ st, body, params }) => {
  const b = cariBahan(st, params.id);
  if (!b) throw tidakAda('Bahan');
  if (body.arsip) {
    const pakai = pemakaiResep(st, b.id);
    if (pakai.length) throw konflik(`Bahan masih dipakai di ${ringkasPemakai(pakai)}. Hapus dari resep dulu.`);
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
  // Ukuran yang menjadi isi paket tidak boleh hilang: paketnya akan rusak.
  const ukuranBaru = new Set(body.ukuran.map((u) => u.nama));
  const terpakai = (st.paket ?? []).filter((p) => p.isi.some((k) => k.menuId === m.id && !ukuranBaru.has(k.ukuran)));
  if (terpakai.length) throw konflik(`Ukuran ini masih dipakai di ${terpakai.map((p) => p.nama).join(', ')}. Ubah isi paketnya dulu.`);
  Object.assign(m, body); // transaksi lama punya salinan pemakaian sendiri (A-07)
  return m;
});

// ---------- paket (khusus aplikasi) ----------
function periksaPaket(st, body) {
  const detail = [];
  body.isi.forEach((k, i) => {
    const menu = st.menu.find((m) => m.id === k.menuId);
    if (!menu) detail.push({ field: `isi[${i}].menuId`, pesan: 'Menu tidak ditemukan' });
    else if (!menu.ukuran.some((u) => u.nama === k.ukuran)) detail.push({ field: `isi[${i}].ukuran`, pesan: `Ukuran "${k.ukuran}" tidak ada di ${menu.nama}` });
  });
  if (detail.length) throw validasi('Paket tidak valid', detail);
}

const tampilPaket = (st, p) => ({
  ...p,
  isi: p.isi.map((k) => ({ ...k, nama: st.menu.find((m) => m.id === k.menuId)?.nama ?? k.menuId })),
  // Pembanding untuk owner: harga isi paket jika dibeli terpisah di toko.
  hargaIsiToko: p.isi.reduce((a, k) => a + (st.menu.find((m) => m.id === k.menuId)?.ukuran.find((u) => u.nama === k.ukuran)?.harga ?? 0) * k.qty, 0),
  kode: `paket:${p.id}`,
});

daftar('GET', '/paket', SEMUA, null, ({ st }) => (st.paket ?? []).map((p) => tampilPaket(st, p)));

daftar('POST', '/paket', OWNER, S.PaketBody, (ctx) => {
  const { st, body } = ctx;
  periksaPaket(st, body);
  if ((st.paket ?? []).some((p) => p.nama.trim().toLowerCase() === body.nama.trim().toLowerCase())) throw validasi('Paket tidak valid', [{ field: 'nama', pesan: `Paket "${body.nama}" sudah ada` }]);
  const p = { id: ctx.id('paket'), ...body };
  st.paket = [...(st.paket ?? []), p];
  ctx.status = 201;
  return tampilPaket(st, p);
});

daftar('PUT', '/paket/:id', OWNER, S.PaketBody, ({ st, body, params }) => {
  const p = (st.paket ?? []).find((x) => x.id === params.id);
  if (!p) throw tidakAda('Paket');
  periksaPaket(st, body);
  if (st.paket.some((x) => x.id !== p.id && x.nama.trim().toLowerCase() === body.nama.trim().toLowerCase())) throw validasi('Paket tidak valid', [{ field: 'nama', pesan: `Paket "${body.nama}" sudah ada` }]);
  Object.assign(p, body); // transaksi lama punya salinan item dan pemakaian sendiri (A-07)
  return tampilPaket(st, p);
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
  if (!s) return null;
  const ps = perSaluran(st, st.transaksi.filter((t) => t.shiftId === s.id));
  return {
    ...tampilShiftRingkas(st, s),
    // Jumlah pesanan per aplikasi (tanpa rupiah), untuk dicocokkan crew dengan riwayat di tablet saat tutup shift.
    pesananOnline: SALURAN_ONLINE.map((x) => ({ saluran: x, nama: NAMA_SALURAN[x], jumlah: ps[x].jumlah, batal: ps[x].batal })),
    pesananMenunggu: st.pesananMasuk.filter((p) => p.status === 'menunggu').length,
  };
});

// Daftar yang perlu dihitung saat buka shift (crew butuh ini sebelum shift ada).
daftar('GET', '/shift/persiapan', SEMUA, null, ({ st }) => {
  const namaShift = st.pengaturan.shift.map((s) => s.nama);
  return {
    namaShift,
    hitungKas: st.pengaturan.hitungKas,
    hitungSemuaBahan: st.pengaturan.hitungSemuaBahan ?? 'tidak',
    bahanKunci: ringkasBahan(st, daftarHitung(st, namaShift[0]).kunci),
    // Daftar hitung saat buka, per nama shift (buka outlet bisa berarti semua bahan).
    bahanBuka: Object.fromEntries(namaShift.map((n) => {
      const d = daftarHitung(st, n);
      return [n, { semua: d.awalSemua, bahan: ringkasBahan(st, d.awal) }];
    })),
    shiftTerbuka: shiftTerbuka(st) ? tampilShiftRingkas(st, shiftTerbuka(st)) : null,
  };
});

daftar('POST', '/shift/buka', SEMUA, S.BukaShiftBody, (ctx) => {
  const { st, body } = ctx;
  if (!st.pengaturan.shift.some((s) => s.nama === body.namaShift)) {
    throw validasi('Shift tidak valid', [{ field: 'namaShift', pesan: `Shift "${body.namaShift}" tidak ada di pengaturan` }]);
  }
  const daftarH = daftarHitung(st, body.namaShift);
  const bahanKunci = daftarH.kunci;
  if (bahanKunci.length === 0 && daftarH.mode !== 'setiap_shift') throw konflik('Owner belum memilih bahan kunci. Shift belum bisa dibuka.');
  const hitungKasAktif = st.pengaturan.hitungKas;
  if (hitungKasAktif && body.kasAwal === undefined) throw validasi('Kas belum dihitung', [{ field: 'kasAwal', pesan: 'Wajib diisi' }]);
  if (!hitungKasAktif && body.kasAwal !== undefined) throw validasi('Hitung kas tidak aktif', [{ field: 'kasAwal', pesan: 'Tidak dipakai' }]);

  const awalX10 = hitunganKeX10(body.hitungan, daftarH.awal, st);

  // Shift sebelumnya lupa ditutup → hitungan ini dipakai sebagai hitungan akhirnya.
  const lupa = shiftTerbuka(st);
  // Kiriman ganda (tombol ditekan dua kali / jaringan lambat): shift yang baru saja dibuka orang yang sama
  // jangan sampai ditandai "tidak ditutup" oleh kiriman keduanya.
  if (lupa && lupa.dibukaOleh === ctx.pengguna.id && new Date(ctx.pada) - new Date(lupa.dibukaPada) < BATAS_BUKA_GANDA_MS) {
    throw konflik(`Kamu baru saja membuka shift ${lupa.nama}. Jika ingin menggantinya, tutup shift itu dulu.`);
  }
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
    bahanKunci, // salinan: perubahan bahan kunci/pengaturan di tengah shift tidak berlaku untuk shift ini
    bahanTutup: daftarH.tutup,
    awalSemua: daftarH.awalSemua,
    tutupSemua: daftarH.tutupSemua,
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
  const akhirX10 = hitunganKeX10(body.hitungan, shift.bahanTutup ?? shift.bahanKunci, st);
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
// Satu jalur untuk semua transaksi: kasir di toko, pesanan aplikasi yang dicatat manual, dan pesanan otomatis yang diterima.
//   item       [{ menuId, ukuran, toppingIds, qty }]  → stok dikurangi lewat resep
//   hargaItem  (opsional, pesanan otomatis) subtotal per item dari aplikasi; tanpa ini harga dihitung dari menu
// kelompok[i] (opsional): { ke, nama, qty, jenis: 'paket' | 'pemetaan' } — item hasil urai satu paket/menu aplikasi,
// supaya struk & laporan bisa menampilkannya kembali sebagai satu baris "2× Paket Berdua".
function catatTransaksi(ctx, { item: itemBody, saluran = 'toko', nomorPesanan = null, metodeBayar, uangDiterima, hargaItem = null, namaAplikasi = null, namaPaket = null, kelompok = null, pesananId = null }) {
  const { st } = ctx;
  const shift = wajibShiftTerbuka(st);
  const katalog = { bahan: st.bahan, menu: st.menu, topping: st.topping };
  const pemakaian = hitungPemakaian(itemBody, katalog); // validasi menu/ukuran/topping/qty + resep

  // Harga dihitung di sini dari harga saluran, tidak pernah dipercaya dari browser.
  // Pesanan otomatis memakai harga dari aplikasi (yang dibayar pelanggan; di backend asli datang lewat webhook bertanda tangan).
  const item = itemBody.map((it, i) => {
    const menu = st.menu.find((m) => m.id === it.menuId);
    const ukuran = menu.ukuran.find((u) => u.nama === it.ukuran);
    const toppings = it.toppingIds.map((tid) => {
      const t = st.topping.find((x) => x.id === tid);
      return { id: t.id, nama: t.nama, harga: hargaDi(t, saluran) };
    });
    const hargaSatuan = hargaDi(ukuran, saluran) + toppings.reduce((a, t) => a + t.harga, 0);
    const subtotal = hargaItem ? hargaItem[i] : hargaSatuan * it.qty;
    return {
      menuId: menu.id, nama: menu.nama, ukuran: ukuran.nama, toppings, qty: it.qty,
      hargaSatuan: hargaItem ? null : hargaSatuan, subtotal,
      ...(namaAplikasi?.[i] ? { namaAplikasi: namaAplikasi[i] } : {}),
      ...(namaPaket?.[i] ? { paket: namaPaket[i] } : {}),
      ...(kelompok?.[i] ? { kelompok: kelompok[i] } : {}),
    };
  });
  const total = jumlahUang(item.map((i) => ({ total: i.subtotal })));
  if (!Number.isInteger(total) || total < 0) throw new Error(`Invariant gagal: total transaksi ${total}`);
  if (metodeBayar === 'tunai' && uangDiterima < total) {
    throw validasi('Uang kurang', [{ field: 'uangDiterima', pesan: `Kurang Rp ${(total - uangDiterima).toLocaleString('id-ID')}` }]);
  }

  // A-08: tidak memblokir, hanya memberi tahu. Tanpa angka (hitung buta).
  const peringatanMinus = cekStokMinus(st.stok, pemakaian).map((m) => ({ bahanId: m.bahanId, nama: cariBahan(st, m.bahanId)?.nama ?? m.bahanId }));
  for (const [id, x10] of Object.entries(pemakaian)) st.stok[id] = (st.stok[id] ?? 0) - x10;

  const trx = {
    id: ctx.id('trx'),
    shiftId: shift.id,
    oleh: ctx.pengguna.id,
    pada: ctx.pada,
    saluran,
    nomorPesanan,
    pesananId,
    item,
    total,
    metodeBayar,
    uangDiterima: uangDiterima ?? null,
    kembalian: metodeBayar === 'tunai' ? uangDiterima - total : null,
    pemakaian, // salinan (A-07)
    batal: null,
  };
  st.transaksi.push(trx);
  return { trx, peringatanMinus };
}

function tampilStruk(st, trx, peringatanMinus = []) {
  const { pemakaian: _, shiftId: __, oleh, pesananId: ___, ...struk } = trx;
  return { ...struk, namaSaluran: NAMA_SALURAN[trx.saluran ?? 'toko'], kasir: namaPengguna(st, oleh), peringatanMinus };
}

daftar('POST', '/transaksi', SEMUA, S.TransaksiBody, (ctx) => {
  const { st, body } = ctx;
  if (adalahOnline(body.saluran)) {
    const setel = setelSaluran(st, body.saluran);
    const nama = NAMA_SALURAN[body.saluran];
    if (!setel.aktif) throw konflik(`${nama} belum diaktifkan owner.`);
    // Saluran yang tersambung otomatis tidak dicatat manual: pesanannya masuk sendiri, mencatat lagi = dobel.
    if (setel.mode === 'otomatis') throw konflik(`Pesanan ${nama} masuk otomatis. Terima di halaman Pesanan online.`);
    if (nomorDipakai(st, body.saluran, body.nomorPesanan)) throw konflik(`Pesanan ${nama} nomor ${body.nomorPesanan} sudah tercatat.`);
  }
  const { trx, peringatanMinus } = catatTransaksi(ctx, { ...uraikanKeranjang(st, body.item, body.saluran), saluran: body.saluran, nomorPesanan: body.nomorPesanan ?? null, metodeBayar: body.metodeBayar, uangDiterima: body.uangDiterima });
  ctx.status = 201;
  return tampilStruk(st, trx, peringatanMinus);
});

// Keranjang kasir → item menu. Paket (khusus aplikasi) diurai jadi menu isinya; harga paket dibagi sebanding
// harga kasir supaya total = harga paket. Tanpa paket: harga dihitung biasa (hargaItem null).
function uraikanKeranjang(st, itemBody, saluran) {
  if (!itemBody.some((it) => it.paketId)) return { item: itemBody };
  const detail = [];
  const item = [];
  const hargaItem = [];
  const namaPaket = [];
  const kelompok = [];
  itemBody.forEach((it, i) => {
    if (!it.paketId) {
      kelompok.push(null);
      const menu = st.menu.find((m) => m.id === it.menuId);
      const ukuran = menu?.ukuran.find((u) => u.nama === it.ukuran);
      const toppingOk = it.toppingIds.every((tid) => st.topping.some((t) => t.id === tid));
      item.push(it);
      // Menu/ukuran/topping salah dilaporkan hitungPemakaian; di sini cukup harga yang bisa dihitung.
      hargaItem.push(ukuran && toppingOk ? (hargaDi(ukuran, saluran) + it.toppingIds.reduce((a, tid) => a + hargaDi(st.topping.find((t) => t.id === tid), saluran), 0)) * it.qty : 0);
      namaPaket.push(null);
      return;
    }
    const paket = st.paket.find((p) => p.id === it.paketId);
    if (!paket || !paket.aktif) return detail.push({ field: `item[${i}].paketId`, pesan: 'Paket tidak ditemukan atau sudah nonaktif' });
    if (saluran === 'toko') return detail.push({ field: `item[${i}].paketId`, pesan: `${paket.nama} hanya dijual di aplikasi` });
    const harga = paket.hargaSaluran[saluran];
    if (!Number.isInteger(harga)) return detail.push({ field: `item[${i}].paketId`, pesan: `${paket.nama} tidak dijual di ${NAMA_SALURAN[saluran]}` });
    const isi = paket.isi.map((k) => ({ menuId: k.menuId, ukuran: k.ukuran, qty: k.qty, toppingIds: [] }));
    const bagian = bagiHarga(harga * it.qty, hargaKasirIsi(st, isi, saluran));
    isi.forEach((k, j) => {
      item.push({ menuId: k.menuId, ukuran: k.ukuran, toppingIds: [], qty: k.qty * it.qty });
      hargaItem.push(bagian[j]);
      namaPaket.push(paket.nama);
      kelompok.push({ ke: i, nama: paket.nama, qty: it.qty, jenis: 'paket' });
    });
  });
  if (detail.length) throw validasi('Pesanan tidak valid', detail);
  return { item, hargaItem, namaPaket, kelompok };
}

// Pembatalan pesanan aplikasi (dari crew untuk pesanan manual, atau dari aplikasi lewat webhook).
// Minuman biasanya sudah dibuat: penjualan tidak dihitung, tetapi bahan TETAP tercatat terpakai.
// Mengembalikan stok akan membuat selisih shift tampak seperti boros.
function batalkanTransaksi(st, ctx, trx, alasan, sumber) {
  if (trx.batal) return false;
  trx.batal = { pada: ctx.pada, oleh: ctx.pengguna?.id ?? null, alasan, sumber };
  const p = trx.pesananId && st.pesananMasuk.find((x) => x.id === trx.pesananId);
  if (p) Object.assign(p, { status: 'dibatalkan', alasan });
  return true;
}

daftar('POST', '/transaksi/:id/batal', SEMUA, S.BatalBody, ({ st, params, body, pengguna, ...ctx }) => {
  const trx = st.transaksi.find((t) => t.id === params.id);
  if (!trx) throw tidakAda('Transaksi');
  if (!adalahOnline(trx.saluran)) throw konflik('Hanya pesanan aplikasi yang bisa dibatalkan di sini.');
  if (trx.batal) throw konflik('Transaksi ini sudah dibatalkan.');
  if (pengguna.peran !== 'owner' && trx.shiftId !== shiftTerbuka(st)?.id) throw konflik('Crew hanya bisa membatalkan pesanan di shift yang sedang berjalan.');
  batalkanTransaksi(st, { ...ctx, pengguna }, trx, body.alasan, 'kasir');
  return tampilStruk(st, trx);
});

daftar('GET', '/transaksi/shift-ini', SEMUA, null, ({ st, query }) => {
  const s = shiftTerbuka(st);
  if (!s) return [];
  return st.transaksi
    .filter((t) => t.shiftId === s.id && (!query.saluran || t.saluran === query.saluran))
    .reverse()
    .map((t) => tampilStruk(st, t));
});

// ---------- saluran & pesanan online ----------
function tampilSaluran(st, s, peran) {
  const setel = setelSaluran(st, s);
  const dasar = { id: s, nama: NAMA_SALURAN[s], aktif: setel.aktif, mode: setel.mode, tersambungPada: setel.tersambungPada };
  if (peran !== 'owner') return dasar;
  // Item dari pesanan yang masih menunggu yang belum dikenali kasir (untuk dipetakan owner).
  const belum = new Map();
  for (const p of st.pesananMasuk.filter((x) => x.saluran === s && x.status === 'menunggu')) {
    for (const { it, cocok } of cocokkanPesanan(st, p)) if (cocok.masalah && !belum.has(it.kode)) belum.set(it.kode, { kode: it.kode, nama: it.nama, masalah: cocok.masalah });
  }
  const pemetaan = Object.entries(st.pemetaan[s] ?? {}).map(([kode, t]) => ({
    kode,
    nama: namaAplikasiTerakhir(st, s, kode),
    isi: normalkanPemetaan(t).map((k) => ({ ...k, nama: st.menu.find((m) => m.id === k.menuId)?.nama ?? k.menuId })),
  }));
  return { ...dasar, komisiPersen: setel.komisiPersen, belumDikenali: [...belum.values()], pemetaan };
}

// Nama yang dipakai aplikasi untuk kode ini (dari pesanan terakhir yang memuatnya).
function namaAplikasiTerakhir(st, saluran, kode) {
  for (let i = st.pesananMasuk.length - 1; i >= 0; i--) {
    const p = st.pesananMasuk[i];
    if (p.saluran !== saluran) continue;
    const it = p.item.find((x) => x.kode === kode);
    if (it) return it.nama;
  }
  return kode;
}

daftar('GET', '/saluran', SEMUA, null, ({ st, pengguna }) => SALURAN_ONLINE.map((s) => tampilSaluran(st, s, pengguna.peran)));

const wajibSaluran = (s) => {
  if (!adalahOnline(s)) throw tidakAda('Saluran');
  return s;
};

daftar('PUT', '/saluran/:id', OWNER, S.SaluranBody, ({ st, params, body, pada }) => {
  const s = wajibSaluran(params.id);
  const lama = setelSaluran(st, s);
  const otomatis = body.aktif && body.mode === 'otomatis';
  st.pengaturan.saluran = {
    ...SALURAN_BAWAAN, ...st.pengaturan.saluran,
    [s]: { ...body, mode: body.aktif ? body.mode : 'manual', tersambungPada: otomatis ? (lama.mode === 'otomatis' && lama.aktif ? lama.tersambungPada : pada) : null },
  };
  return tampilSaluran(st, s, 'owner');
});

daftar('PUT', '/saluran/:id/pemetaan', OWNER, S.PemetaanBody, ({ st, params, body }) => {
  const s = wajibSaluran(params.id);
  const detail = [];
  body.isi.forEach((k, i) => {
    const menu = st.menu.find((m) => m.id === k.menuId);
    if (!menu) detail.push({ field: `isi[${i}].menuId`, pesan: 'Menu tidak ditemukan' });
    else if (!menu.ukuran.some((u) => u.nama === k.ukuran)) detail.push({ field: `isi[${i}].ukuran`, pesan: `Ukuran "${k.ukuran}" tidak ada di ${menu.nama}` });
  });
  if (detail.length) throw validasi('Pemetaan tidak valid', detail);
  // Kode hasil sinkron menu/paket kasir sudah dikenali; memetakannya ulang hanya membuat bingung.
  if (body.kode.startsWith('paket:')) throw konflik('Ini paket dari kasir, sudah dikenali. Ubah isinya di Menu & resep → Paket.');
  const i = body.kode.lastIndexOf(':');
  if (i > 0 && st.menu.find((m) => m.id === body.kode.slice(0, i))?.ukuran.some((u) => u.nama === body.kode.slice(i + 1))) {
    throw konflik('Menu ini sudah dikenali kasir (disinkron dari menu kasir). Tidak perlu dipetakan.');
  }
  st.pemetaan[s] = { ...st.pemetaan[s], [body.kode]: { isi: body.isi } };
  return tampilSaluran(st, s, 'owner');
});

daftar('DELETE', '/saluran/:id/pemetaan/:kode', OWNER, null, ({ st, params }) => {
  const s = wajibSaluran(params.id);
  if (!st.pemetaan[s]?.[params.kode]) throw tidakAda('Pemetaan');
  const { [params.kode]: _, ...sisa } = st.pemetaan[s];
  st.pemetaan[s] = sisa;
  return tampilSaluran(st, s, 'owner');
});

// Harga aplikasi untuk semua menu sekaligus. Atomik: satu menu/ukuran salah → tidak ada yang tersimpan.
daftar('PUT', '/harga-saluran', OWNER, S.HargaSaluranMassalBody, ({ st, body }) => {
  const detail = [];
  body.menu.forEach((m, i) => {
    const menu = st.menu.find((x) => x.id === m.id);
    if (!menu) return detail.push({ field: `menu[${i}].id`, pesan: `Menu "${m.id}" tidak ditemukan` });
    m.ukuran.forEach((u, j) => {
      const uk = menu.ukuran.find((x) => x.nama === u.nama);
      if (!uk) detail.push({ field: `menu[${i}].ukuran[${j}].nama`, pesan: `Ukuran "${u.nama}" tidak ada di ${menu.nama}` });
      else uk.hargaSaluran = u.hargaSaluran;
    });
  });
  body.topping.forEach((t, i) => {
    const tp = st.topping.find((x) => x.id === t.id);
    if (!tp) detail.push({ field: `topping[${i}].id`, pesan: `Topping "${t.id}" tidak ditemukan` });
    else tp.hargaSaluran = t.hargaSaluran;
  });
  body.paket.forEach((x, i) => {
    const pk = (st.paket ?? []).find((y) => y.id === x.id);
    if (!pk) detail.push({ field: `paket[${i}].id`, pesan: `Paket "${x.id}" tidak ditemukan` });
    else if (Object.keys(x.hargaSaluran).length === 0) detail.push({ field: `paket[${i}].hargaSaluran`, pesan: `${pk.nama}: isi harga minimal di satu aplikasi` });
    else pk.hargaSaluran = x.hargaSaluran;
  });
  if (detail.length) throw validasi('Harga tidak tersimpan', detail); // salinan kerja dibuang: tidak ada yang berubah
  return { menu: st.menu, topping: st.topping, paket: (st.paket ?? []).map((p) => tampilPaket(st, p)) };
});

// Pintu masuk pesanan dari aplikasi (webhook). Di mock dipanggil tombol "kirim pesanan contoh" dan pembuat data demo.
// Backend asli: tanpa sesi pengguna, diverifikasi lewat tanda tangan platform.
daftar('POST', '/integrasi/:saluran/pesanan', SEMUA, S.PesananAplikasiBody, (ctx) => {
  const { st, params, body } = ctx;
  const s = wajibSaluran(params.saluran);
  const setel = setelSaluran(st, s);
  if (!setel.aktif || setel.mode !== 'otomatis') throw konflik(`${NAMA_SALURAN[s]} belum tersambung ke kasir.`);
  // Webhook bisa dikirim ulang oleh platform (jaringan putus, timeout). Nomor yang sama → data yang sudah ada, bukan pesanan baru.
  const ada = nomorDipakai(st, s, body.nomorPesanan);
  if (ada && ada.masukPada) return { ...tampilPesanan(st, ada), duplikat: true };
  if (ada) throw konflik(`Nomor ${body.nomorPesanan} sudah tercatat manual di kasir.`);
  const p = { id: ctx.id('pesanan'), saluran: s, ...body, masukPada: ctx.pada, status: 'menunggu', diprosesOleh: null, diprosesPada: null, transaksiId: null };
  st.pesananMasuk.push(p);
  ctx.status = 201;
  return { ...tampilPesanan(st, p), duplikat: false };
});

daftar('POST', '/integrasi/:saluran/batal', SEMUA, S.PembatalanAplikasiBody, (ctx) => {
  const { st, params, body } = ctx;
  const s = wajibSaluran(params.saluran);
  const p = st.pesananMasuk.find((x) => x.saluran === s && x.nomorPesanan === body.nomorPesanan);
  if (!p) throw tidakAda('Pesanan');
  if (p.status === 'menunggu') Object.assign(p, { status: 'dibatalkan', alasan: body.alasan, diprosesPada: ctx.pada });
  else if (p.status === 'diterima') batalkanTransaksi(st, ctx, st.transaksi.find((t) => t.id === p.transaksiId), body.alasan, 'aplikasi');
  // ditolak / sudah dibatalkan: tidak ada yang berubah (idempoten)
  return tampilPesanan(st, p);
});

daftar('GET', '/pesanan-online', SEMUA, null, ({ st }) => {
  const menunggu = st.pesananMasuk.filter((p) => p.status === 'menunggu');
  const selesai = st.pesananMasuk.filter((p) => p.status !== 'menunggu').slice(-20);
  return { menunggu: menunggu.map((p) => tampilPesanan(st, p)), riwayat: selesai.reverse().map((p) => tampilPesanan(st, p)) };
});

const wajibMenunggu = (st, id) => {
  const p = st.pesananMasuk.find((x) => x.id === id);
  if (!p) throw tidakAda('Pesanan');
  if (p.status !== 'menunggu') throw konflik(`Pesanan ${p.nomorPesanan} sudah ${p.status}.`);
  return p;
};

daftar('POST', '/pesanan-online/:id/terima', SEMUA, null, (ctx) => {
  const { st, params } = ctx;
  const p = wajibMenunggu(st, params.id);
  wajibShiftTerbuka(st); // A-22: pesanan menunggu sampai ada shift terbuka
  const baris = cocokkanPesanan(st, p);
  const salah = baris.filter((b) => b.cocok.masalah);
  // A-21: menu yang tidak dikenali tidak boleh diterima, supaya stok tidak berkurang dengan resep yang salah.
  if (salah.length) throw konflik(`Ada menu yang belum dikenali kasir: ${salah.map((b) => b.it.nama).join(', ')}. Minta owner memetakannya.`);
  // Satu item aplikasi bisa berisi beberapa menu kasir (paket). Harganya dibagi sebanding harga kasir,
  // supaya total transaksi tetap sama persis dengan yang dibayar pelanggan.
  const item = [];
  const hargaItem = [];
  const namaAplikasi = [];
  const namaPaket = [];
  const kelompok = [];
  for (const [ke, { it, cocok }] of baris.entries()) {
    const bagian = bagiHarga(it.harga * it.qty, hargaKasirIsi(st, cocok.isi, p.saluran));
    const paketKasir = cocok.paketId ? st.paket.find((x) => x.id === cocok.paketId) : null;
    cocok.isi.forEach((k, j) => {
      item.push({ menuId: k.menuId, ukuran: k.ukuran, toppingIds: k.toppingIds, qty: k.qty * it.qty });
      hargaItem.push(bagian[j]);
      namaAplikasi.push(it.nama);
      namaPaket.push(paketKasir?.nama ?? null);
      // Menu sinkron biasa (satu menu, tanpa paket/pemetaan) tidak perlu dikelompokkan.
      const dipetakan = Boolean(st.pemetaan[p.saluran]?.[it.kode]);
      kelompok.push(paketKasir || dipetakan ? { ke, nama: it.nama, qty: it.qty, jenis: paketKasir ? 'paket' : 'pemetaan' } : null);
    });
  }
  const { trx, peringatanMinus } = catatTransaksi(ctx, {
    item, hargaItem, namaAplikasi, namaPaket, kelompok,
    saluran: p.saluran, nomorPesanan: p.nomorPesanan, metodeBayar: 'aplikasi', pesananId: p.id,
  });
  Object.assign(p, { status: 'diterima', diprosesOleh: ctx.pengguna.id, diprosesPada: ctx.pada, transaksiId: trx.id });
  return { pesanan: tampilPesanan(st, p), struk: tampilStruk(st, trx, peringatanMinus) };
});

daftar('POST', '/pesanan-online/:id/tolak', SEMUA, S.TolakPesananBody, (ctx) => {
  const p = wajibMenunggu(ctx.st, ctx.params.id);
  Object.assign(p, { status: 'ditolak', alasan: ctx.body.alasan, diprosesOleh: ctx.pengguna.id, diprosesPada: ctx.pada });
  return tampilPesanan(ctx.st, p);
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

// Crew: entri shift yang sedang berjalan saja (untuk dicek dan dikoreksi). Tidak memuat angka stok.
daftar('GET', '/barang-masuk/shift-ini', SEMUA, null, ({ st }) => {
  const s = shiftTerbuka(st);
  if (!s) return [];
  return st.barangMasuk.filter((e) => e.shiftId === s.id).reverse().map((e) => tampilBarangMasuk(st, e));
});

// ---------- pengeluaran kas ----------
daftar('POST', '/pengeluaran-kas', SEMUA, S.PengeluaranKasBody, (ctx) => {
  const shift = wajibShiftTerbuka(ctx.st);
  if (!shift.hitungKas) throw konflik('Hitung kas tidak aktif di shift ini');
  const p = { id: ctx.id('keluar'), shiftId: shift.id, oleh: ctx.pengguna.id, pada: ctx.pada, ...ctx.body };
  ctx.st.pengeluaranKas.push(p);
  ctx.status = 201;
  return { ...p, oleh: namaPengguna(ctx.st, p.oleh) };
});

daftar('GET', '/pengeluaran-kas/shift-ini', SEMUA, null, ({ st }) => {
  const s = shiftTerbuka(st);
  if (!s) return { hitungKas: st.pengaturan.hitungKas, data: [] };
  return {
    hitungKas: s.hitungKas,
    data: st.pengeluaranKas.filter((p) => p.shiftId === s.id).reverse().map((p) => ({ ...p, oleh: namaPengguna(st, p.oleh) })),
  };
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
// Rentang tanggal: ?dari=YYYY-MM-DD&sampai=YYYY-MM-DD (atau ?tanggal= untuk satu hari). Maksimal 31 hari.
const MAKS_HARI_LAPORAN = 31;
daftar('GET', '/laporan/harian', SEMUA, null, ({ st, query, pengguna, pada }) => {
  const zona = st.pengaturan.zonaWaktu;
  const hariIni = tanggalLokal(pada, zona);
  const dari = query.dari ?? query.tanggal ?? hariIni;
  const sampai = query.sampai ?? dari;
  const formatSalah = [['dari', dari], ['sampai', sampai]].filter(([, v]) => !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`)));
  if (formatSalah.length) throw validasi('Tanggal tidak valid', formatSalah.map(([f]) => ({ field: f, pesan: 'Format YYYY-MM-DD' })));
  if (dari > sampai) throw validasi('Rentang tidak valid', [{ field: 'sampai', pesan: 'Tanggal akhir sebelum tanggal awal' }]);
  const lamaHari = (Date.parse(`${sampai}T00:00:00Z`) - Date.parse(`${dari}T00:00:00Z`)) / 86400000 + 1;
  if (lamaHari > MAKS_HARI_LAPORAN) throw validasi('Rentang terlalu panjang', [{ field: 'sampai', pesan: `Maksimal ${MAKS_HARI_LAPORAN} hari` }]);
  if (pengguna.peran !== 'owner' && (dari !== hariIni || sampai !== hariIni)) throw galat(403, 'DILARANG', 'Crew hanya bisa melihat laporan hari ini');
  const tanggal = dari;

  const namaShift = new Map(st.shift.map((s) => [s.id, s.nama]));
  const trx = st.transaksi.filter((t) => {
    const tg = tanggalLokal(t.pada, zona);
    return tg >= dari && tg <= sampai;
  });
  const sah = transaksiSah(trx);
  const pakai = jumlahkanPemakaian(trx); // termasuk pesanan batal: bahannya tetap terpakai
  const ps = perSaluran(st, trx);
  const komisi = SALURAN_ONLINE.reduce((a, s) => a + ps[s].perkiraanKomisi, 0);
  return {
    tanggal,
    dari,
    sampai,
    jumlahHari: lamaHari,
    jumlahTransaksi: sah.length,
    totalPenjualan: jumlahUang(sah),
    perMetode: {
      tunai: jumlahUang(sah.filter((t) => t.metodeBayar === 'tunai')),
      qris: jumlahUang(sah.filter((t) => t.metodeBayar === 'qris')),
      aplikasi: jumlahUang(sah.filter((t) => t.metodeBayar === 'aplikasi')),
    },
    perSaluran: ps,
    perkiraanKomisi: komisi,
    perkiraanBersih: jumlahUang(sah) - komisi,
    pemakaian: Object.entries(pakai).map(([id, x10]) => {
      const b = cariBahan(st, id);
      return { bahanId: id, nama: b?.nama ?? id, satuanDasar: b?.satuanDasar ?? '', jumlah: H(x10) };
    }),
    transaksi: [...trx].reverse().map((t) => ({
      id: t.id, pada: t.pada, total: t.total, metodeBayar: t.metodeBayar, kasir: namaPengguna(st, t.oleh), item: t.item,
      saluran: t.saluran ?? 'toko', namaSaluran: NAMA_SALURAN[t.saluran ?? 'toko'], nomorPesanan: t.nomorPesanan ?? null,
      otomatis: Boolean(t.pesananId), batal: t.batal ? { alasan: t.batal.alasan, sumber: t.batal.sumber } : null,
      shift: namaShift.get(t.shiftId) ?? null, tanggal: tanggalLokal(t.pada, zona),
    })),
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

const VERSI_DATA = 4;
const BATAS_BUKA_GANDA_MS = 10 * 60 * 1000;

// salin = false: state diubah langsung tanpa disalin (tidak atomik). Hanya untuk pembuat data demo.
export function buatMockApi({ penyimpanan, buatDataAwal, jedaMs = [300, 800], acak = Math.random, sekarang = () => new Date(), salin = true }) {
  if (!penyimpanan || typeof buatDataAwal !== 'function') throw new TypeError('penyimpanan dan buatDataAwal wajib');
  const modeObjek = typeof penyimpanan.bacaObjek === 'function' && typeof penyimpanan.tulisObjek === 'function';
  if (!salin && !modeObjek) throw new TypeError('salin: false hanya untuk penyimpanan objek');

  const simpan = (st) => (modeObjek ? penyimpanan.tulisObjek(st) : penyimpanan.tulis(JSON.stringify(st)));
  // Cache hasil parse: selama teks di penyimpanan tidak berubah, tidak perlu JSON.parse ulang.
  let cache = { teks: null, st: null };

  const muat = async () => {
    if (modeObjek) {
      const st = penyimpanan.bacaObjek();
      if (st?.versi === VERSI_DATA) return st;
    } else {
      const teks = penyimpanan.baca();
      if (teks && teks === cache.teks) return cache.st;
      if (teks) {
        try {
          const st = JSON.parse(teks);
          if (st?.versi === VERSI_DATA) {
            cache = { teks, st };
            return st;
          }
        } catch {
          /* rusak → buat ulang */
        }
      }
    }
    const st = await buatDataAwal();
    simpan(st);
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
      simpan(await buatDataAwal());
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
    const asli = await muat();
    const st = salin ? structuredClone(asli) : asli;

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
    if (method !== 'GET') simpan(st);
    return { status: ctx.status, data };
  }

  return { panggil };
}
