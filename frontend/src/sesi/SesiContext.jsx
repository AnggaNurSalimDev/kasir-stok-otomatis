// Sesi pengguna + klien API untuk seluruh aplikasi.
//   useSesi() → { pengguna, memuat, galat, masuk, keluar, api, mode }
//
// Demo: "masuk" = memilih nama, tanpa password. Pengguna tersimpan di localStorage
// supaya tetap masuk setelah refresh, lalu dicek ulang ke API saat aplikasi dibuka.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { siapkanKlien } from '../api/index.js';

const PERAN = ['owner', 'crew'];
const Sesi = createContext(null);

// Data dari localStorage tidak dipercaya: rusak atau bentuknya salah → dianggap belum masuk.
function bacaTersimpan(kunci) {
  try {
    const p = JSON.parse(window.localStorage.getItem(kunci));
    if (p && typeof p.id === 'string' && typeof p.nama === 'string' && PERAN.includes(p.peran)) return p;
  } catch {
    /* abaikan */
  }
  return null;
}

function simpanKe(kunci, p) {
  try {
    if (p) window.localStorage.setItem(kunci, JSON.stringify(p));
    else window.localStorage.removeItem(kunci);
  } catch {
    /* mode privat: sesi hanya bertahan sampai refresh */
  }
}

// Sesi disimpan per profil: pengguna demo tiap usaha berbeda, dan berpindah usaha tidak saling menimpa.
export function SesiProvider({ profil, children }) {
  const kunci = `kasir-sesi:${profil.id}`;
  const simpan = useCallback((p) => simpanKe(kunci, p), [kunci]);
  const [klien, setKlien] = useState(null);
  const [pengguna, setPengguna] = useState(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState(null);

  // Klien membaca sesi lewat ref, supaya selalu memakai pengguna terbaru tanpa dibuat ulang.
  const ref = useRef(null);
  ref.current = pengguna;

  useEffect(() => {
    let batal = false;
    (async () => {
      try {
        const k = await siapkanKlien(() => (ref.current ? { penggunaId: ref.current.id } : null), profil);
        const tersimpan = bacaTersimpan(kunci);
        let sah = null;
        if (tersimpan) {
          // Pengguna tersimpan harus masih ada dengan peran yang sama (mis. setelah reset demo).
          const daftar = await k.panggil('/pengguna');
          sah = daftar.find((p) => p.id === tersimpan.id && p.peran === tersimpan.peran) ?? null;
          if (!sah) simpan(null);
        }
        if (batal) return;
        ref.current = sah;
        setPengguna(sah);
        setKlien(k);
      } catch (e) {
        if (!batal) setGalat(e);
      } finally {
        if (!batal) setMemuat(false);
      }
    })();
    return () => {
      batal = true;
    };
  }, [profil, kunci, simpan]);

  const masuk = useCallback((p) => {
    if (!p || !PERAN.includes(p.peran)) throw new TypeError('Pengguna tidak valid');
    const data = { id: p.id, nama: p.nama, peran: p.peran };
    simpan(data);
    ref.current = data;
    setPengguna(data);
  }, [simpan]);

  const keluar = useCallback(() => {
    simpan(null);
    ref.current = null;
    setPengguna(null);
  }, [simpan]);

  const api = useCallback(
    (path, opsi) => {
      if (!klien) return Promise.reject(new Error('Klien API belum siap'));
      return klien.panggil(path, opsi);
    },
    [klien],
  );

  const nilai = useMemo(
    () => ({ pengguna, memuat, galat, masuk, keluar, api, mode: klien?.mode ?? null }),
    [pengguna, memuat, galat, masuk, keluar, api, klien],
  );
  return <Sesi.Provider value={nilai}>{children}</Sesi.Provider>;
}

export function useSesi() {
  const s = useContext(Sesi);
  if (!s) throw new Error('useSesi harus dipakai di dalam <SesiProvider>');
  return s;
}

export const berandaPeran = (peran) => (peran === 'owner' ? '/owner' : '/crew/kasir');
