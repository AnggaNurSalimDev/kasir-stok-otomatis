import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useSesi } from './sesi/SesiContext.jsx';
import { Kepala, Memuat, PesanGalat, Segera, Wajib } from './komponen/umum.jsx';
import Masuk from './halaman/Masuk.jsx';
import Kasir from './halaman/crew/Kasir.jsx';
import Shift from './halaman/crew/Shift.jsx';
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
        <Route path="barang-masuk" element={<Segera judul="Barang masuk" rencana={['Input dalam satuan bantu: "2 karung gula" → +50.000 gr', 'Koreksi entri yang salah, wajib alasan']} />} />
        <Route path="pengeluaran" element={<Segera judul="Pengeluaran kas" rencana={['Uang laci yang dipakai, misalnya beli es batu']} />} />
        <Route path="opname" element={<Segera judul="Stok opname" rencana={['Hitung semua bahan, tanpa melihat angka sistem']} />} />
        <Route path="laporan" element={<Segera judul="Laporan hari ini" rencana={['Transaksi dan pemakaian bahan hari ini']} />} />
      </Route>

      <Route path="/owner" element={<Tata peran="owner" />}>
        <Route index element={<Ringkasan />} />
        <Route path="bahan" element={<Bahan />} />
        <Route path="menu" element={<Menu />} />
        <Route path="pengaturan" element={<Pengaturan />} />
        <Route path="shift/:id" element={<DetailShift />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
