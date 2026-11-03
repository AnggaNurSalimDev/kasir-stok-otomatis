import { Navigate, useNavigate } from 'react-router-dom';
import { useSesi, berandaPeran } from '../sesi/SesiContext.jsx';
import { useData } from '../komponen/useData.js';
import { Memuat, Pesan, PesanGalat } from '../komponen/umum.jsx';
import { PengalihProfil, useProfil } from '../merek/ProfilContext.jsx';

export default function Masuk() {
  const { pengguna, masuk, mode } = useSesi();
  const { profil } = useProfil();
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
      <div className="kepala-masuk">
        {profil.logo.gambar && <img src={profil.logo.gambar} alt="" />}
        <h1>{profil.nama}</h1>
      </div>
      <p>{profil.teks.slogan}</p>
      {mode === 'mock' && (
        <Pesan>
          Demo kasir dengan stok otomatis{profil.fiktif ? ` · ${profil.nama} adalah usaha fiktif` : ''}. Pilih nama untuk masuk, tanpa password. Data 30 hari terakhir tersimpan di browser ini.
        </Pesan>
      )}
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
      <PengalihProfil />
    </main>
  );
}
