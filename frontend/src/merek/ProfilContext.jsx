/*
 * Menyambungkan profil ke React dan ke <html>. Diadaptasi dari sistem-rekrutmen.
 *
 *   VITE_PROFIL ─┐
 *   ?profil=     ├─ pilihIdProfil ─▶ id ─▶ daftar[id] ─▶ terapkanProfil(document)
 *   localStorage ┘   (dua sumber terakhir hanya di mode demo)
 *
 *   useProfil() → { profil, daftar, demo, ganti }
 *
 * Bedanya dengan rekruter: profil kasir juga memilih data demo (menu, bahan, satuan),
 * jadi ganti profil = muat ulang halaman supaya klien API dan sesi dibuat ulang untuk data itu.
 */
import { createContext, useCallback, useContext, useMemo } from 'react';
import { PROFIL_BAWAAN, pilihIdProfil, validasiProfil, variabelCss } from './profil.js';

const KUNCI_PILIHAN = 'kasir-profil';
const env = import.meta.env ?? {};
// Demo (pengalih profil tampil) kecuali dimatikan eksplisit untuk situs klien.
export const MODE_DEMO = env.VITE_MODE_DEMO !== 'false';

// Semua file di ./profil dimuat saat build. Profil yang rusak dicatat dan dilewati.
const berkas = import.meta.glob('./profil/*.json', { eager: true, import: 'default' });
export const DAFTAR = new Map();
for (const [path, mentah] of Object.entries(berkas).sort(([a], [b]) => a.localeCompare(b))) {
  const { profil, masalah } = validasiProfil(mentah);
  if (masalah.length) console.warn(`[profil] ${path}:\n- ${masalah.join('\n- ')}`);
  if (profil === PROFIL_BAWAAN) continue; // id rusak → dilewati
  if (DAFTAR.has(profil.id)) console.warn(`[profil] id "${profil.id}" dipakai dua kali; ${path} menimpa yang lama`);
  DAFTAR.set(profil.id, profil);
}
if (DAFTAR.size === 0) DAFTAR.set(PROFIL_BAWAAN.id, PROFIL_BAWAAN);
const URUTAN = ['teh-senja', 'kopi-lintas', 'dapur-mie-rasa'];
const posisi = (id) => (URUTAN.includes(id) ? URUTAN.indexOf(id) : URUTAN.length);
const daftarUrut = () => [...DAFTAR.values()].sort((a, b) => posisi(a.id) - posisi(b.id));

function baca(kunci) {
  try {
    return window.localStorage.getItem(kunci);
  } catch {
    return null;
  }
}
function tulis(kunci, nilai) {
  try {
    window.localStorage.setItem(kunci, nilai);
  } catch {
    /* mode privat: pilihan hanya berlaku sampai refresh */
  }
}

/** Tulis profil ke dokumen: variabel CSS, tema, judul tab, favicon, warna bilah browser. */
export function terapkanProfil(profil, doc = document) {
  const akar = doc.documentElement;
  for (const [nama, nilai] of Object.entries(variabelCss(profil))) akar.style.setProperty(nama, nilai);
  akar.dataset.tema = profil.gaya.tema;
  akar.style.colorScheme = profil.gaya.tema === 'gelap' ? 'dark' : 'light';
  doc.title = `${profil.nama} · Kasir`;
  doc.querySelector('link[rel="icon"]')?.setAttribute('href', profil.favicon);
  doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', profil.warna.utama);
}

export function profilAwal() {
  const dariUrl = new URLSearchParams(window.location.search).get('profil');
  const id = pilihIdProfil({
    bawaan: env.VITE_PROFIL ?? URUTAN[0],
    demo: MODE_DEMO,
    dariUrl,
    dariPenyimpanan: baca(KUNCI_PILIHAN),
    tersedia: new Set(DAFTAR.keys()),
  });
  // Profil dari ?profil= ikut disimpan, supaya pindah halaman tidak kembali ke bawaan.
  if (MODE_DEMO && id === dariUrl) tulis(KUNCI_PILIHAN, id);
  if (env.VITE_PROFIL && !DAFTAR.has(env.VITE_PROFIL)) console.warn(`[profil] VITE_PROFIL="${env.VITE_PROFIL}" tidak ada; memakai "${id}"`);
  return DAFTAR.get(id);
}

const Konteks = createContext(null);

export function PenyediaProfil({ profil, children }) {
  const ganti = useCallback((id) => {
    if (!MODE_DEMO || !DAFTAR.has(id)) return; // di situs klien, profil terkunci
    tulis(KUNCI_PILIHAN, id);
    // Muat ulang penuh ke halaman awal: data, sesi, dan klien API milik profil baru.
    window.location.assign('/');
  }, []);
  const nilai = useMemo(() => ({ profil, daftar: daftarUrut(), demo: MODE_DEMO, ganti }), [profil, ganti]);
  return <Konteks.Provider value={nilai}>{children}</Konteks.Provider>;
}

export function useProfil() {
  const nilai = useContext(Konteks);
  if (!nilai) throw new Error('useProfil harus dipakai di dalam <PenyediaProfil>');
  return nilai;
}

// Pilihan usaha contoh (mode demo). Profil berbeda = data berbeda.
export function PengalihProfil({ judul = 'Coba usaha contoh lain' }) {
  const { profil, daftar, demo, ganti } = useProfil();
  if (!demo || daftar.length < 2) return null;
  return (
    <section className="pengalih" aria-label="Pilih usaha contoh">
      <strong>{judul}</strong>
      <span className="bantuan"> · usaha fiktif, masing-masing dengan menu, bahan, dan satuannya sendiri</span>
      <div className="pengalih-daftar">
        {daftar.map((p) => (
          <button key={p.id} type="button" aria-pressed={p.id === profil.id} onClick={() => p.id !== profil.id && ganti(p.id)}>
            {p.logo.gambar && <img src={p.logo.gambar} alt="" />}
            {p.nama}
          </button>
        ))}
      </div>
    </section>
  );
}
