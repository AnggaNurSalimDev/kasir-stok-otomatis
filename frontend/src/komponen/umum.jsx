import { useState } from 'react';
import { Navigate, NavLink, useNavigate } from 'react-router-dom';
import { useSesi, berandaPeran } from '../sesi/SesiContext.jsx';
import { useProfil } from '../merek/ProfilContext.jsx';

export function Memuat({ teks = 'Memuat…' }) {
  return <p className="memuat" role="status">{teks}</p>;
}

// jenis: info | galat | sukses
export function Pesan({ jenis = 'info', children }) {
  return <div className={`pesan pesan-${jenis}`} role={jenis === 'galat' ? 'alert' : 'status'}>{children}</div>;
}

export function PesanGalat({ galat, ulangi }) {
  if (!galat) return null;
  return (
    <Pesan jenis="galat">
      {galat.message ?? 'Terjadi kesalahan'}
      {ulangi && <button type="button" className="tautan" onClick={ulangi}>Coba lagi</button>}
    </Pesan>
  );
}

// Guard berurutan: memuat → belum masuk → peran salah. Lolos semua baru halaman ditampilkan.
export function Wajib({ peran, children }) {
  const { pengguna, memuat } = useSesi();
  if (memuat) return <Memuat />;
  if (!pengguna) return <Navigate to="/" replace />;
  if (pengguna.peran !== peran) return <Navigate to={berandaPeran(pengguna.peran)} replace />;
  return children;
}

const MENU = {
  crew: [
    ['/crew/kasir', 'Kasir'],
    ['/crew/shift', 'Shift'],
    ['/crew/barang-masuk', 'Barang masuk'],
    ['/crew/pengeluaran', 'Pengeluaran kas'],
    ['/crew/opname', 'Stok opname'],
    ['/crew/laporan', 'Laporan hari ini'],
  ],
  owner: [
    ['/owner', 'Ringkasan'],
    ['/owner/bahan', 'Bahan'],
    ['/owner/menu', 'Menu & resep'],
    ['/owner/pengaturan', 'Pengaturan'],
  ],
};

function TombolReset() {
  const { api } = useSesi();
  const [tahap, setTahap] = useState('awal'); // awal → yakin → proses
  const reset = async () => {
    if (tahap === 'awal') return setTahap('yakin');
    setTahap('proses');
    try {
      await api('/reset', { method: 'POST' });
    } finally {
      window.location.assign('/'); // muat ulang penuh: semua halaman membaca data baru
    }
  };
  return (
    <button type="button" className="tombol-kecil" onClick={reset} onBlur={() => tahap === 'yakin' && setTahap('awal')} disabled={tahap === 'proses'}>
      {tahap === 'awal' ? 'Reset data demo' : tahap === 'yakin' ? 'Yakin? Klik lagi' : 'Mereset…'}
    </button>
  );
}

export function Merek() {
  const { profil } = useProfil();
  return (
    <span className="merek">
      {profil.logo.gambar && <img src={profil.logo.gambar} alt="" />}
      {profil.logo.teks}
    </span>
  );
}

export function Kepala() {
  const { pengguna, keluar, mode } = useSesi();
  const navigate = useNavigate();
  if (!pengguna) return null;
  return (
    <header className="kepala">
      <div className="kepala-atas">
        <Merek />
        <span className="kepala-pengguna">
          {pengguna.nama}
          {mode === 'mock' && <TombolReset />}
          <button type="button" className="tombol-kecil" onClick={() => { navigate('/'); keluar(); }}>Keluar</button>
        </span>
      </div>
      <nav className="menu">
        {MENU[pengguna.peran].map(([ke, label]) => (
          <NavLink key={ke} to={ke} end>{label}</NavLink>
        ))}
      </nav>
    </header>
  );
}

// Penanda halaman yang belum dibuat, berisi rencana isinya.
export function Segera({ judul, rencana }) {
  return (
    <section>
      <h1>{judul}</h1>
      <Pesan>Halaman ini belum dibuat. Rencananya:</Pesan>
      <ul>{rencana.map((r) => <li key={r}>{r}</li>)}</ul>
    </section>
  );
}
