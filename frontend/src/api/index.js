// Membuat klien sesuai env. Mock hanya dimuat (import dinamis) saat mode mock,
// supaya bundle mode real tidak membawa data demo.
//
//   VITE_API_MODE=mock (default)  → mock di localStorage, satu tempat simpan per profil
//   VITE_API_MODE=real            → VITE_API_URL

import { buatKlien } from './klien.js';

export async function siapkanKlien(sesi, profil) {
  if (!profil?.id) throw new TypeError('siapkanKlien butuh profil');
  const mode = import.meta.env.VITE_API_MODE ?? 'mock';
  if (mode === 'real') return buatKlien({ mode, apiUrl: import.meta.env.VITE_API_URL, sesi });

  const [{ buatMockApi }, { penyimpananLokal, AWALAN_KUNCI }, { buatDataDemo }] = await Promise.all([
    import('./mock/server.js'),
    import('./mock/penyimpanan.js'),
    import('./mock/dataContoh.js'),
  ]);
  const mock = buatMockApi({
    penyimpanan: penyimpananLokal(`${AWALAN_KUNCI}${profil.id}`),
    buatDataAwal: () => buatDataDemo({ usaha: profil.data }),
  });
  return buatKlien({ mode, mock, sesi });
}
