import { Link } from 'react-router-dom';
import { useData } from '../../komponen/useData.js';
import { Memuat, PesanGalat } from '../../komponen/umum.jsx';

const STATUS = { terbuka: 'Terbuka', ditutup: 'Ditutup', tidak_ditutup: 'Tidak ditutup' };
const waktu = (iso) =>
  iso ? new Date(iso).toLocaleString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–';

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
              <tr><th>Shift</th><th>Dibuka</th><th>Ditutup</th><th>Status</th><th>Bahan perlu dicek</th><th>Kas</th><th aria-label="Aksi" /></tr>
            </thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.id}>
                  <td>{s.nama}</td>
                  <td>{waktu(s.dibukaPada)}<br /><small>{s.dibukaOleh}</small></td>
                  <td>{waktu(s.ditutupPada)}<br /><small>{s.ditutupOleh ?? ''}</small></td>
                  <td>{STATUS[s.status]}</td>
                  <td className={s.jumlahPerluDicek > 0 ? 'teks-galat' : undefined}>{s.status === 'terbuka' ? '–' : s.jumlahPerluDicek}</td>
                  <td className={s.statusKas === 'perlu_dicek' ? 'teks-galat' : undefined}>{s.statusKas === null ? '–' : s.statusKas === 'wajar' ? 'Wajar' : 'Perlu dicek'}</td>
                  <td><Link to={`/owner/shift/${s.id}`}>Detail</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
