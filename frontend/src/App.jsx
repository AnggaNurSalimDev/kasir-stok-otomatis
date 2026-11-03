import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useSesi } from './sesi/SesiContext.jsx';
import { PengalihProfil } from './merek/ProfilContext.jsx';
import { Kepala, Memuat, PesanGalat, Wajib } from './komponen/umum.jsx';
import Masuk from './halaman/Masuk.jsx';
import Kasir from './halaman/crew/Kasir.jsx';
import Shift from './halaman/crew/Shift.jsx';
import BarangMasuk from './halaman/crew/BarangMasuk.jsx';
import PengeluaranKas from './halaman/crew/PengeluaranKas.jsx';
import Opname from './halaman/crew/Opname.jsx';
import Laporan from './halaman/Laporan.jsx';
import Ringkasan from './halaman/owner/Ringkasan.jsx';
import Bahan from './halaman/owner/Bahan.jsx';
import Menu from './halaman/owner/Menu.jsx';
import Pengaturan from './halaman/owner/Pengaturan.jsx';
import DetailShift from './halaman/owner/DetailShift.jsx';

function Tata({ peran }) {
  return (
    <Wajib peran={peran}>
      <Kepala />
      <main className="isi">
        <Outlet />
      </main>
      <footer className="kaki">
        <PengalihProfil judul="Usaha contoh" />
      </footer>
    </Wajib>
  );
}

export default function App() {
  const { memuat, galat } = useSesi();
  if (memuat) return <Memuat teks="Menyiapkan data…" />;
  if (galat) return <main className="isi"><PesanGalat galat={galat} ulangi={() => window.location.reload()} /></main>;

  return (
    <Routes>
      <Route path="/" element={<Masuk />} />

      <Route path="/crew" element={<Tata peran="crew" />}>
        <Route index element={<Navigate to="kasir" replace />} />
        <Route path="kasir" element={<Kasir />} />
        <Route path="shift" element={<Shift />} />
        <Route path="barang-masuk" element={<BarangMasuk />} />
        <Route path="pengeluaran" element={<PengeluaranKas />} />
        <Route path="opname" element={<Opname />} />
        <Route path="laporan" element={<Laporan />} />
      </Route>

      <Route path="/owner" element={<Tata peran="owner" />}>
        <Route index element={<Ringkasan />} />
        <Route path="bahan" element={<Bahan />} />
        <Route path="menu" element={<Menu />} />
        <Route path="pengaturan" element={<Pengaturan />} />
        <Route path="shift/:id" element={<DetailShift />} />
        <Route path="laporan" element={<Laporan />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
