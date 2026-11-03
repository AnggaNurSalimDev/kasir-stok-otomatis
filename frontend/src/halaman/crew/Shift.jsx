import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSesi } from '../../sesi/SesiContext.jsx';
import { useData } from '../../komponen/useData.js';
import { Memuat, Pesan, PesanGalat } from '../../komponen/umum.jsx';
import FormHitung from '../../komponen/FormHitung.jsx';

const jam = (iso) => new Date(iso).toLocaleString('id-ID', { weekday: 'long', hour: '2-digit', minute: '2-digit' });

function BukaShift({ persiapan, lupaDitutup, onSelesai }) {
  const { api } = useSesi();
  const [namaShift, setNamaShift] = useState('');

  if (persiapan.bahanKunci.length === 0) {
    return <Pesan jenis="galat">Owner belum memilih bahan kunci, jadi shift belum bisa dibuka. Hubungi owner.</Pesan>;
  }

  return (
    <>
      <h1>Buka shift</h1>
      {lupaDitutup && (
        <Pesan>
          Shift {lupaDitutup.nama} ({jam(lupaDitutup.dibukaPada)}, {lupaDitutup.dibukaOleh}) belum ditutup. Hitunganmu dipakai sebagai hitungan akhirnya,
          dan shift itu ditandai &ldquo;tidak ditutup&rdquo; untuk owner.
        </Pesan>
      )}
      <FormHitung
        bahan={persiapan.bahanKunci}
        labelKas={persiapan.hitungKas ? 'Kas awal' : null}
        labelKirim="Buka shift"
        validasiTambahan={() => (namaShift ? [] : [{ field: 'namaShift', pesan: 'Pilih shift' }])}
        tambahan={
          <fieldset>
            <legend>Shift</legend>
            <div className="daftar-centang">
              {persiapan.namaShift.map((n) => (
                <label key={n} className="centang">
                  <input type="radio" name="namaShift" value={n} checked={namaShift === n} onChange={() => setNamaShift(n)} /> {n}
                </label>
              ))}
            </div>
          </fieldset>
        }
        onKirim={async ({ hitungan, kas }) => {
          const body = { namaShift, hitungan, ...(persiapan.hitungKas && { kasAwal: kas }) };
          const shift = await api('/shift/buka', { method: 'POST', body });
          onSelesai(`Shift ${shift.nama} dibuka. Kasir siap dipakai.`);
          return shift;
        }}
      />
    </>
  );
}

// Ditampilkan saat yang masuk BUKAN orang yang membuka shift: kemungkinan besar shift itu lupa ditutup.
// Crew harus memilih dengan sadar, supaya tidak menutup shift orang lain tanpa sengaja.
function PilihLanjutan({ shift, onPilih }) {
  return (
    <>
      <h1>Shift {shift.nama} masih terbuka</h1>
      <Pesan>
        Shift ini dibuka oleh <strong>{shift.dibukaOleh}</strong> {jam(shift.dibukaPada)} dan belum ditutup.
      </Pesan>
      <div className="pilihan-besar">
        <button type="button" className="tombol-besar" onClick={() => onPilih('baru')}>
          <strong>{shift.dibukaOleh} lupa menutup, saya buka shift baru</strong>
          <br />
          <small>
            Hitunganmu dipakai sebagai hitungan akhir shift {shift.nama} dan hitungan awal shiftmu. Shift {shift.nama} ditandai
            &ldquo;tidak ditutup&rdquo; untuk owner. Pilih ini jika kamu crew shift berikutnya.
          </small>
        </button>
        <button type="button" className="tombol-besar" onClick={() => onPilih('tutup')}>
          <strong>Saya ikut shift ini dan menutupnya</strong>
          <br />
          <small>Pilih ini jika kamu bekerja di shift {shift.nama} bersama {shift.dibukaOleh}. Namamu tercatat sebagai yang menutup.</small>
        </button>
      </div>
    </>
  );
}

function TutupShift({ shift, onSelesai, onBukaBaru }) {
  const { api } = useSesi();
  return (
    <>
      <h1>Shift {shift.nama} sedang berjalan</h1>
      <Pesan jenis="sukses">
        Dibuka {jam(shift.dibukaPada)} oleh {shift.dibukaOleh}. <Link to="/crew/kasir">Ke kasir</Link>
      </Pesan>
      <h2>Tutup shift</h2>
      <p className="bantuan">Lakukan di akhir shift. Hitung bahan yang sama seperti saat buka shift.</p>
      <FormHitung
        bahan={shift.bahanKunci}
        labelKas={shift.hitungKas ? 'Kas akhir' : null}
        labelKirim="Tutup shift"
        onKirim={async ({ hitungan, kas }) => {
          const hasil = await api('/shift/tutup', { method: 'POST', body: { hitungan, ...(shift.hitungKas && { kasAkhir: kas }) } });
          onSelesai(`Shift ${shift.nama} ditutup. Terima kasih! Crew berikutnya bisa membuka shift baru.`, shift.id);
          return hasil;
        }}
      />
      <details className="kartu">
        <summary>Shift ini sudah lewat dan lupa ditutup?</summary>
        <p>Jika kamu crew shift berikutnya, buka shift baru. Shift ini akan ditandai &ldquo;tidak ditutup&rdquo; dan hitunganmu dipakai sebagai hitungan akhirnya.</p>
        <button type="button" className="tombol-kecil" onClick={onBukaBaru}>Buka shift baru</button>
      </details>
    </>
  );
}

export default function Shift() {
  const { pengguna } = useSesi();
  const { data, galat, memuat, muatUlang } = useData('/shift/persiapan');
  const [pilihan, setPilihan] = useState(null); // null | 'tutup' | 'baru' (hanya untuk shift milik orang lain)
  const [pesan, setPesan] = useState(null);
  const [paksaBuka, setPaksaBuka] = useState(false);
  // Shift yang baru saja ditutup di layar ini. Selama data belum dimuat ulang, shift ini
  // jangan ditampilkan sebagai "sedang berjalan".
  const [baruDitutup, setBaruDitutup] = useState(null);

  const selesai = (teks, idDitutup = null) => {
    setPesan(teks);
    setPaksaBuka(false);
    setPilihan(null);
    setBaruDitutup(idDitutup);
    muatUlang();
  };

  if (memuat) return <Memuat />;
  if (galat) return <PesanGalat galat={galat} ulangi={muatUlang} />;

  const terbuka = data.shiftTerbuka?.id === baruDitutup ? null : data.shiftTerbuka;
  const milikOrangLain = Boolean(terbuka && pengguna && terbuka.dibukaOlehId !== pengguna.id);
  return (
    <section className="sempit">
      {pesan && <Pesan jenis="sukses">{pesan}</Pesan>}
      {milikOrangLain && pilihan && (
        <p><button type="button" className="tautan tanpa-jarak" onClick={() => setPilihan(null)}>← Ganti pilihan</button></p>
      )}
      {milikOrangLain && !pilihan && !paksaBuka ? (
        <PilihLanjutan shift={terbuka} onPilih={(p) => { setPesan(null); setPilihan(p); }} />
      ) : terbuka && !paksaBuka && pilihan !== 'baru' ? (
        <TutupShift key={terbuka.id} shift={terbuka} onSelesai={selesai} onBukaBaru={() => { setPesan(null); setPaksaBuka(true); }} />
      ) : (
        <BukaShift key={terbuka?.id ?? 'baru'} persiapan={data} lupaDitutup={terbuka} onSelesai={selesai} />
      )}
    </section>
  );
}
