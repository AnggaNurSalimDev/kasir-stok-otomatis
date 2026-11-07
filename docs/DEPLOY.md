# Deploy demo ke Vercel (gratis)

Demo ini statis: tidak ada backend dan database. Data contoh dibuat di browser pengunjung (localStorage), jadi cukup Vercel.

```
GitHub (main) ──push──▶ Vercel build: npm ci → npm run build → dist/ ──▶ kasir-xxx.vercel.app
                                                                    vercel.json: semua alamat → index.html
```

## Langkah

1. Masuk ke vercel.com dengan akun GitHub.
2. **Add New → Project** → pilih repo `kasir-stok-otomatis` → **Import**.
3. Pengaturan sudah dibaca dari `vercel.json`; biarkan:
   - Root Directory: `./` (bukan `frontend`; `vite.config.js` ada di akar repo)
   - Build: `npm run build`, Output: `dist`
4. Environment Variables: tidak wajib. Bawaannya sudah mode demo. Opsional:

   | Nama | Nilai | Arti |
   |---|---|---|
   | `VITE_PROFIL` | `teh-senja` / `kopi-lintas` / `dapur-mie-rasa` | usaha yang tampil pertama kali |

5. **Deploy**. Setelah selesai, salin alamatnya ke README (baris "Demo").

Setiap push ke `main` akan dideploy ulang otomatis. Variabel `VITE_*` dibaca saat build, jadi mengubahnya butuh **Redeploy**.

## Satu repo = satu proyek Vercel

Alamat demo: **https://kasir-stok-otomatis.vercel.app** (proyek Vercel `kasir-stok-otomatis`).

Repo ini pernah ter-import 3 kali, sehingga ada 3 proyek Vercel (`kasir-stok-otomatis`, `-yr3j`, `-crsk`) yang membangun commit yang sama. Vercel menambahkan akhiran acak (`-yr3j`) kalau nama proyek sudah dipakai. Jadi **alamat dengan akhiran acak adalah tanda repo sudah pernah di-import**.

- Repo ini **sudah** di-import. Jangan pilih **Add New → Project** untuk repo ini lagi.
- Build gagal → perbaiki lalu push, atau buka proyeknya → Deployments → **Redeploy**. Jangan import ulang.
- Ingin mengganti alamat → proyeknya → Settings → **Domains**, bukan membuat proyek baru.
- Sebelum import repo mana pun, cari dulu nama repo di daftar Projects Vercel.

## Uji setelah deploy

- [ ] Halaman masuk tampil dengan logo dan warna Teh Senja.
- [ ] Buka `<alamat>/owner/bahan` langsung (bukan lewat klik) → diarahkan ke halaman masuk, bukan 404.
- [ ] Masuk sebagai crew → kasir → jual satu menu → struk.
- [ ] Masuk sebagai owner → Ringkasan → Detail shift yang bertanda merah.
- [ ] Ganti ke Kopi Lintas di bawah halaman → tema gelap, menu kopi.
- [ ] `<alamat>/?profil=dapur-mie-rasa` langsung membuka Dapur Mie Rasa (tautan untuk calon klien warung makan).
- [ ] Coba dari HP.

## Batasan demo

- Data hanya ada di browser itu. Pengunjung lain melihat data contohnya sendiri; tidak ada yang tersimpan di server.
- Pembuatan data 30 hari terjadi sekali per usaha saat pertama dibuka (±1–1,5 detik).
- Login berupa pilihan nama, tanpa password.

## Situs untuk klien (nanti)

- `VITE_MODE_DEMO=false` (pengalih usaha disembunyikan, profil terkunci) dan `VITE_PROFIL=<id-klien>`.
- `VITE_API_MODE=real` + `VITE_API_URL` setelah backend dibangun dari rencana (logika/ dan skema/ dipakai ulang).
- Login sungguhan dan rate limit login wajib sebelum dipakai.
