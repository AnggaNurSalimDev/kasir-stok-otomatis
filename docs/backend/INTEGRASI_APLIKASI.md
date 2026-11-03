# Rencana backend: integrasi aplikasi pesan-antar

Status: **rencana**. Di demo, semua yang di bawah disimulasikan oleh mock (`frontend/src/api/mock/server.js`) dengan aturan yang sama. Dokumen ini dieksekusi saat ada klien yang memakai GoFood/GrabFood.

Ditulis November 2026 dari dokumentasi publik platform. **Periksa ulang saat mendaftar**; syarat dan biaya bisa berubah.

---

## 1. Alur

```
Pelanggan pesan di GoFood/GrabFood
        │
        ▼
Platform ──webhook (POST, bertanda tangan)──▶  /webhook/gofood   /webhook/grabfood
                                                    │
                                        1. verifikasi tanda tangan / token  → gagal: 401, tidak disimpan
                                        2. adapter: format platform → PesananAplikasiBody (skema/)
                                        3. idempoten: (saluran, nomorPesanan) sudah ada → 200, tidak dibuat ulang
                                        4. simpan pesanan_masuk (status menunggu) → balas 200 secepatnya
                                                    │
                                                    ▼  notifikasi ke layar kasir (SSE / polling)
Crew tekan Terima ──▶ POST /pesanan-online/:id/terima
                        cocokkan menu (kode sinkron atau pemetaan) → transaksi + pengurangan stok (satu transaksi DB)
                        lalu kirim "diterima/siap" ke platform (API platform)
```

Prinsip:
- Endpoint webhook **tidak memakai sesi pengguna**; kepercayaan datang dari verifikasi tanda tangan platform.
- Balas webhook secepatnya (platform punya batas waktu, lalu mengirim ulang). Pekerjaan berat dilakukan setelah disimpan.
- Bentuk internal sudah ada di `skema/index.js` (`PesananAplikasiBody`, `PembatalanAplikasiBody`). Yang baru di backend hanya **adapter per platform**.

## 2. Aturan (sudah diuji di mock)

| Kode | Aturan |
|---|---|
| A-19 | `(saluran, nomorPesanan)` unik, baik pesanan otomatis maupun yang dicatat manual. Webhook dengan nomor yang sama → kembalikan data lama, `200`, bukan pesanan baru. Di DB: `UNIQUE (saluran, nomor_pesanan)`. |
| A-20 | Pesanan aplikasi dibayar `aplikasi` (tidak masuk laci kas); pesanan toko tidak punya nomor pesanan. |
| A-21 | Item yang tidak dikenali (bukan kode sinkron `menuId:ukuran`, tidak ada di pemetaan, topping tidak diizinkan) → pesanan tidak bisa diterima sampai owner memetakan. Stok tidak pernah berkurang dengan tebakan. |
| A-22 | Pesanan bisa masuk tanpa shift terbuka; diterima hanya saat ada shift terbuka. |
| Batal | Menunggu → `dibatalkan`, tanpa transaksi. Sudah diterima → transaksi ditandai batal: penjualan tidak dihitung, **bahan tetap terpakai** (minuman sudah dibuat). Idempoten. |
| Harga | Pesanan otomatis memakai harga dari aplikasi (yang dibayar pelanggan). Jika beda dengan harga saluran di kasir → tanda `hargaBerbeda` untuk owner (menu belum disinkron). |
| Manual vs otomatis | Saluran yang tersambung otomatis tidak bisa dicatat manual di kasir (409), supaya tidak dobel. |

## 3. Tabel tambahan (PostgreSQL)

```sql
CREATE TABLE saluran_setel (
  outlet_id     uuid REFERENCES outlet,
  saluran       text CHECK (saluran IN ('gofood','grabfood','shopeefood')),
  aktif         boolean NOT NULL DEFAULT false,
  mode          text NOT NULL CHECK (mode IN ('manual','otomatis')),
  komisi_persen numeric(5,2) NOT NULL CHECK (komisi_persen BETWEEN 0 AND 100),
  id_outlet_platform text,          -- outlet ID di GoBiz / merchant ID Grab
  kredensial_ref text,              -- rujukan ke secret manager, BUKAN secret-nya
  tersambung_pada timestamptz,
  PRIMARY KEY (outlet_id, saluran)
);

CREATE TABLE pesanan_masuk (
  id            uuid PRIMARY KEY,
  outlet_id     uuid REFERENCES outlet,
  saluran       text NOT NULL,
  nomor_pesanan text NOT NULL,
  isi           jsonb NOT NULL,     -- bentuk ternormalisasi (PesananAplikasiBody)
  mentah        jsonb NOT NULL,     -- payload asli platform, untuk penelusuran
  status        text NOT NULL CHECK (status IN ('menunggu','diterima','ditolak','dibatalkan')),
  transaksi_id  uuid REFERENCES transaksi,
  masuk_pada    timestamptz NOT NULL,
  diproses_oleh uuid, diproses_pada timestamptz, alasan text,
  UNIQUE (outlet_id, saluran, nomor_pesanan)
);

CREATE TABLE pemetaan_menu (
  outlet_id uuid, saluran text, kode text,
  menu_id uuid NOT NULL, ukuran text NOT NULL, kali int NOT NULL CHECK (kali BETWEEN 1 AND 10),
  PRIMARY KEY (outlet_id, saluran, kode)
);

ALTER TABLE transaksi
  ADD COLUMN saluran text NOT NULL DEFAULT 'toko',
  ADD COLUMN nomor_pesanan text,
  ADD COLUMN pesanan_id uuid REFERENCES pesanan_masuk,
  ADD COLUMN batal jsonb;          -- { pada, oleh, alasan, sumber }
CREATE UNIQUE INDEX ON transaksi (outlet_id, saluran, nomor_pesanan) WHERE nomor_pesanan IS NOT NULL;
```

Terima pesanan = satu transaksi DB: `SELECT … FOR UPDATE` pada `pesanan_masuk` (status harus `menunggu`) → insert transaksi → kurangi stok → update status. Dua perangkat menekan Terima bersamaan: yang kedua mendapat 409.

## 4. Endpoint

| Method & path | Siapa | Catatan |
|---|---|---|
| `POST /webhook/gofood` | GoBiz | verifikasi sesuai dokumentasi GoBiz; adapter → `PesananAplikasiBody` / pembatalan |
| `POST /webhook/grabfood` | Grab | verifikasi sesuai dokumentasi Grab; adapter |
| `GET /pesanan-online` | crew, owner | menunggu + riwayat |
| `GET /pesanan-online/stream` | crew, owner | SSE: pesanan baru tanpa memuat ulang |
| `POST /pesanan-online/:id/terima` | crew, owner | + panggil API platform: terima / siap |
| `POST /pesanan-online/:id/tolak` | crew, owner | + panggil API platform: tolak |
| `GET/PUT /saluran/:id` | owner | sama dengan mock |
| `PUT /saluran/:id/pemetaan` | owner | sama dengan mock |
| `POST /saluran/:id/sinkron-menu` | owner | dorong menu + harga saluran kasir ke platform (kode = `menuId:ukuran`) |
| `POST /transaksi/:id/batal` | crew (shift berjalan), owner | pesanan aplikasi manual |

Endpoint mock `/integrasi/:saluran/pesanan` dan `/integrasi/:saluran/batal` **tidak dibawa** ke backend; perannya diganti `/webhook/*`.

## 5. Pendaftaran per platform

| Platform | Siapa mendaftar | Langkah (ringkas) | Belum diketahui |
|---|---|---|---|
| GoFood | **Akun owner klien** (Integrasi Langsung), developer mengerjakan | developer.gobiz.com dengan email owner GoBiz → buat integrasi → App ID & Secret → outlet sandbox → uji → ajukan verifikasi lewat formulir | biaya, lama verifikasi |
| GoFood (banyak klien) | Developer sebagai mitra (Model Fasilitator) | formulir mitra GoBiz → penilaian usaha → kredensial → setiap outlet login & izinkan → tautkan outlet | syarat badan usaha, biaya |
| GrabFood | Developer (Partner Development Account) | daftar di developer.grab.com → layanan POS **disetujui tertulis** oleh Grab → outlet verifikasi sebagai merchant | syarat dokumen, lama persetujuan |
| ShopeeFood | Penyedia kasir yang **sudah bekerja sama** dengan ShopeeFood; merchant mendaftar lewat tim Sales ShopeeFood | tidak ada pendaftaran mandiri developer; menurut Pusat Bantuan Shopee integrasi API tidak dikenakan biaya tambahan dari ShopeeFood | cara menjadi penyedia kasir mitra, syaratnya |

Catatan dari ketentuan Grab: penyedia POS tidak boleh menarik biaya tambahan khusus untuk layanan POS Grab itu sendiri. Jual jasa pembuatan / sistem kasir secara keseluruhan, bukan "fitur Grab + Rp X".

Keamanan kredensial: Secret disimpan di secret manager / env server, tidak pernah di frontend atau repo. Password akun GoBiz klien tidak pernah diminta.

## 6. Biaya untuk dijelaskan ke klien

```
Jasa pembuatan (sekali) ........ pasti, dari developer
Server backend (bulanan) ....... pasti, wajib untuk menerima webhook
Akses API platform ............. belum dipublikasikan; dicek saat pendaftaran, dikabari sebelum lanjut
Agregator (opsional) ........... langganan, hanya jika memakai pihak ketiga
Komisi aplikasi ................ sudah dibayar klien sekarang; tidak bertambah karena integrasi
```

Paket bertingkat: **dasar** = pencatatan manual per saluran (sudah ada, tanpa server tambahan selain backend kasir); **lanjutan** = GoFood otomatis; GrabFood menyusul setelah persetujuan.

## 7. Urutan pengerjaan saat ada klien

1. Pastikan klien punya akun GoFood aktif dan email owner GoBiz.
2. Backend kasir (lihat templat rencana backend) berjalan lebih dulu; integrasi menumpang di atasnya.
3. Tabel + endpoint §3–4, adapter GoFood, uji dengan sandbox GoBiz.
4. Uji wajib: webhook dikirim dua kali, webhook datang saat shift tutup, pembatalan setelah diterima, menu yang dibuat di aplikasi, dua perangkat menekan Terima bersamaan, tanda tangan salah.
5. Verifikasi GoBiz → produksi. GrabFood diajukan paralel.

## 8. Pertanyaan untuk klien

- Aplikasi apa saja yang dipakai, dan berapa pesanan per hari dari masing-masing?
- Harga di aplikasi berbeda dengan harga di toko? (Kasir sudah mendukung harga per saluran.)
- Pesanan diterima otomatis atau ditekan crew? (Rencana ini: ditekan crew, supaya pesanan saat bahan habis bisa ditolak.)
- Ada menu yang hanya dijual di aplikasi (paket)? Itu perlu pemetaan sekali.
- Siapa yang memegang email owner GoBiz?
