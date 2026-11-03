import { Navigate, useNavigate } from 'react-router-dom';
import { useSesi, berandaPeran } from '../sesi/SesiContext.jsx';
import { useData } from '../komponen/useData.js';
import { Memuat, Pesan, PesanGalat } from '../komponen/umum.jsx';

export default function Masuk() {
  const { pengguna, masuk, mode } = useSesi();
  const navigate = useNavigate();
  const { data, galat, memuat, muatUlang } = useData(pengguna ? null : '/pengguna');

  if (pengguna) return <Navigate to={berandaPeran(pengguna.peran)} replace />;

  const pilih = (p) => {
    masuk(p);
    navigate(berandaPeran(p.peran));
  };
  const kelompok = (peran) => (data ?? []).filter((p) => p.peran === peran);

  return (
    <main className="halaman-masuk">
      <h1>Kasir Stok Otomatis</h1>
      <p>Stok bahan berkurang otomatis sesuai resep, apa pun satuannya: gram, ml, sendok, garis gelas, atau pcs.</p>
      {mode === 'mock' && <Pesan>Demo: pilih nama untuk masuk, tanpa password. Data tersimpan di browser ini.</Pesan>}
      {memuat && <Memuat />}
      <PesanGalat galat={galat} ulangi={muatUlang} />
      {data && (
        <div className="pilih-pengguna">
          <section>
            <h2>Crew</h2>
            <p className="bantuan">Kasir, buka/tutup shift, barang masuk, stok opname.</p>
            {kelompok('crew').map((p) => (
              <button key={p.id} type="button" className="tombol-besar" onClick={() => pilih(p)}>{p.nama}</button>
            ))}
          </section>
          <section>
            <h2>Owner</h2>
            <p className="bantuan">Bahan, satuan, resep, dan semua data crew.</p>
            {kelompok('owner').map((p) => (
              <button key={p.id} type="button" className="tombol-besar" onClick={() => pilih(p)}>{p.nama}</button>
            ))}
          </section>
        </div>
      )}
    </main>
  );
}
