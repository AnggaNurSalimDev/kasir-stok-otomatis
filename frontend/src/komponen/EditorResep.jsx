// Editor baris resep: bahan, jumlah, satuan, dan hasil konversi langsung ("= 8 gr").
//   baris = [{ bahanId, jumlah: '1', satuan: 'sendok' }]   (jumlah berupa teks)
//   awalanField = 'ukuran[0].resep' → galat API 'ukuran[0].resep[2].satuan' ditampilkan di baris ke-3
import { angkaDari, hintKonversi } from './formAngka.js';

export const barisKosong = () => ({ bahanId: '', jumlah: '', satuan: '' });

export default function EditorResep({ baris, onChange, bahan, perField = {}, awalanField }) {
  const bahanById = new Map(bahan.map((b) => [b.id, b]));
  const ubah = (i, perubahan) => onChange(baris.map((b, j) => (j === i ? { ...b, ...perubahan } : b)));
  const dipakai = new Set(baris.map((b) => b.bahanId));

  return (
    <div className="editor-resep">
      <div className="tabel-gulir">
      <table>
        <thead>
          <tr><th>Bahan</th><th>Jumlah</th><th>Satuan</th><th>Hasil</th><th aria-label="Aksi" /></tr>
        </thead>
        <tbody>
          {baris.map((r, i) => {
            const b = bahanById.get(r.bahanId);
            const hint = hintKonversi(r.jumlah, r.satuan, b);
            const f = (k) => perField[`${awalanField}[${i}].${k}`];
            const galatBaris = f('bahanId') ?? f('jumlah') ?? f('satuan');
            return (
              <tr key={i}>
                <td>
                  <select
                    aria-label={`Bahan baris ${i + 1}`}
                    value={r.bahanId}
                    aria-invalid={f('bahanId') ? true : undefined}
                    onChange={(e) => {
                      const baru = bahanById.get(e.target.value);
                      // Default satuan dasar, bukan satuan bantu pertama: satuan bantu bisa berupa satuan beli
                      // (1 slop = 50 cup), dan salah pilih di sini berarti stok berkurang 50× lipat.
                      ubah(i, { bahanId: e.target.value, satuan: baru?.satuanDasar ?? '' });
                    }}
                  >
                    <option value="">Pilih bahan…</option>
                    {bahan.map((x) => (
                      <option key={x.id} value={x.id} disabled={dipakai.has(x.id) && x.id !== r.bahanId}>{x.nama}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    aria-label={`Jumlah baris ${i + 1}`}
                    inputMode="decimal"
                    className="angka"
                    value={r.jumlah}
                    aria-invalid={f('jumlah') || hint.galat ? true : undefined}
                    onChange={(e) => ubah(i, { jumlah: e.target.value })}
                  />
                </td>
                <td>
                  <select aria-label={`Satuan baris ${i + 1}`} value={r.satuan} disabled={!b} onChange={(e) => ubah(i, { satuan: e.target.value })}>
                    {b && [b.satuanDasar, ...b.satuanBantu.map((s) => s.nama)].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </td>
                <td className={hint.galat || galatBaris ? 'teks-galat' : 'teks-redup'}>{galatBaris ?? hint.galat ?? hint.teks}</td>
                <td>
                  <button type="button" className="tombol-kecil" aria-label={`Hapus baris ${i + 1}`} onClick={() => onChange(baris.filter((_, j) => j !== i))}>×</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      {perField[awalanField] && <small className="teks-galat">{perField[awalanField]}</small>}
      <button type="button" className="tombol-kecil" onClick={() => onChange([...baris, barisKosong()])}>+ Tambah bahan</button>
    </div>
  );
}

// Baris form → body API. Galat lokal dikumpulkan dengan field yang sama seperti galat API.
//   [{ bahanId: 'creamer', jumlah: '1,5', satuan: 'sendok' }] → { resep: [{ ..., jumlah: 1.5 }], detail: [] }
export function resepKeBody(baris, awalanField) {
  const detail = [];
  const resep = baris.map((r, i) => {
    if (!r.bahanId) detail.push({ field: `${awalanField}[${i}].bahanId`, pesan: `Baris ${i + 1}: pilih bahan` });
    const jumlah = angkaDari(r.jumlah);
    if (jumlah === null) detail.push({ field: `${awalanField}[${i}].jumlah`, pesan: `Baris ${i + 1}: jumlah wajib angka` });
    return { bahanId: r.bahanId, jumlah: jumlah ?? 0, satuan: r.satuan };
  });
  if (baris.length === 0) detail.push({ field: awalanField, pesan: 'Resep minimal berisi 1 bahan' });
  return { resep, detail };
}

// Body API → baris form.
export const resepKeBaris = (resep) => resep.map((r) => ({ bahanId: r.bahanId, jumlah: String(r.jumlah).replace('.', ','), satuan: r.satuan }));
