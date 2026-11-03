import { Link } from 'react-router-dom';
import { useData } from '../../komponen/useData.js';
import { Memuat, Pesan, PesanGalat, Segera } from '../../komponen/umum.jsx';

// Sementara: hanya menampilkan status shift (bukti klien → mock bekerja). Kasir penuh menyusul.
export default function Kasir() {
  const { data: shift, galat, memuat, muatUlang } = useData('/shift/aktif');
  return (
    <>
      {memuat && <Memuat />}
      <PesanGalat galat={galat} ulangi={muatUlang} />
      {shift === null && (
        <Pesan>Belum ada shift yang dibuka. <Link to="/crew/shift">Buka shift</Link> dulu sebelum memakai kasir.</Pesan>
      )}
      {shift && (
        <Pesan jenis="sukses">
          Shift {shift.nama} terbuka sejak {new Date(shift.dibukaPada).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} oleh {shift.dibukaOleh}.
        </Pesan>
      )}
      <Segera
        judul="Kasir"
        rencana={[
          'Grid menu per kategori → pilih ukuran → topping → keranjang',
          'Bayar tunai (dengan kembalian) atau QRIS → struk',
          'Peringatan jika bahan akan minus, penjualan tetap jalan',
        ]}
      />
    </>
  );
}
