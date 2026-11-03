import { useData } from '../../komponen/useData.js';
import { Memuat, PesanGalat } from '../../komponen/umum.jsx';

const STATUS = { terbuka: 'Terbuka', ditutup: 'Ditutup', tidak_ditutup: 'Tidak ditutup' };
const waktu = (iso) =>
  iso ? new Date(iso).toLocaleString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–';

// Sementara: daftar shift (bukti klien → mock bekerja). Detail selisih per shift menyusul.
export default function Ringkasan() {
  const { data, galat, memuat, muatUlang } = useData('/shift');
  return (
    <section>
      <h1>Riwayat shift</h1>
      {memuat && <Memuat />}
      <PesanGalat galat={galat} ulangi={muatUlang} />
      {data && (
        <div className="tabel-gulir">
          <table>
            <thead>
              <tr><th>Shift</th><th>Dibuka</th><th>Ditutup</th><th>Status</th><th>Bahan perlu dicek</th><th>Kas</th></tr>
            </thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.id}>
                  <td>{s.nama}</td>
                  <td>{waktu(s.dibukaPada)}<br /><small>{s.dibukaOleh}</small></td>
                  <td>{waktu(s.ditutupPada)}<br /><small>{s.ditutupOleh ?? ''}</small></td>
                  <td>{STATUS[s.status]}</td>
                  <td>{s.status === 'terbuka' ? '–' : s.jumlahPerluDicek}</td>
                  <td>{s.statusKas === null ? '–' : s.statusKas === 'wajar' ? 'Wajar' : 'Perlu dicek'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
