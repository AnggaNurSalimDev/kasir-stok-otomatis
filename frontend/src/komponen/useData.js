// Mengambil data dari API untuk satu path.
//   const { data, galat, memuat, muatUlang } = useData('/bahan')
//
// - Data hanya diserahkan jika milik path yang sedang diminta (pindah halaman tidak menampilkan data lama).
// - Jawaban yang datang setelah path berubah diabaikan (batal).
// - muatUlang() mengambil ulang tanpa mengosongkan layar.
// - path = null → tidak mengambil apa-apa.

import { useCallback, useEffect, useState } from 'react';
import { useSesi } from '../sesi/SesiContext.jsx';

export function useData(path) {
  const { api } = useSesi();
  const [keadaan, setKeadaan] = useState({ path: null, data: undefined, galat: null });
  const [putaran, setPutaran] = useState(0);
  const [sedang, setSedang] = useState(false);

  useEffect(() => {
    if (!path) return undefined;
    let batal = false;
    setSedang(true);
    api(path)
      .then((data) => !batal && setKeadaan({ path, data, galat: null }))
      .catch((galat) => !batal && setKeadaan({ path, data: undefined, galat }))
      .finally(() => !batal && setSedang(false));
    return () => {
      batal = true;
    };
  }, [api, path, putaran]);

  const cocok = keadaan.path === path;
  const muatUlang = useCallback(() => setPutaran((n) => n + 1), []);
  return {
    data: cocok ? keadaan.data : undefined,
    galat: cocok ? keadaan.galat : null,
    memuat: Boolean(path) && (!cocok || (sedang && keadaan.data === undefined)),
    muatUlang,
  };
}
