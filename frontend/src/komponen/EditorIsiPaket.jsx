// Isi paket menurut resep kasir: baris [jumlah] [menu] [ukuran]. Dipakai form Paket (Menu & resep)
// dan form Pemetaan (menu yang dibuat langsung di aplikasi).
//
//   baris form  [{ menuId: 'thaiTea', ukuran: 'Regular', qty: '1' }, …]
//     ── isiKeBody ──▶ [{ menuId, ukuran, qty: 1 }]  + galat per field "isi[i].…"
//     ── kalimatIsi ──▶ "1× Thai Tea Regular + 1× Kopi Susu Regular"

import { Isian } from './form.jsx';
import { angkaBulatDari } from './formAngka.js';

export const isiKosong = () => ({ menuId: '', ukuran: '', qty: '1' });
export const isiKeForm = (isi) => isi.map((k) => ({ menuId: k.menuId, ukuran: k.ukuran, qty: String(k.qty) }));

export function isiKeBody(baris, awalan = 'isi') {
  const detail = [];
  const isi = baris.map((b, i) => {
    const qty = angkaBulatDari(b.qty);
    if (!b.menuId) detail.push({ field: `${awalan}[${i}].menuId`, pesan: `Baris ${i + 1}: pilih menu` });
    if (b.menuId && !b.ukuran) detail.push({ field: `${awalan}[${i}].ukuran`, pesan: `Baris ${i + 1}: pilih ukuran` });
    if (qty === null || qty < 1 || qty > 10) detail.push({ field: `${awalan}[${i}].qty`, pesan: `Baris ${i + 1}: jumlah 1–10` });
    return { menuId: b.menuId, ukuran: b.ukuran, qty: qty ?? 0 };
  });
  return { isi, detail };
}

export function kalimatIsi(baris, menuById) {
  return baris
    .filter((b) => b.menuId && b.ukuran && angkaBulatDari(String(b.qty)) >= 1)
    .map((b) => `${angkaBulatDari(String(b.qty))}× ${menuById.get(b.menuId)?.nama ?? b.menuId} ${b.ukuran}`)
    .join(' + ');
}

// Harga isi bila dibeli terpisah di toko (pembanding harga paket).
export function hargaIsiToko(baris, menuById) {
  return baris.reduce((a, b) => {
    const u = menuById.get(b.menuId)?.ukuran.find((x) => x.nama === b.ukuran);
    const q = angkaBulatDari(String(b.qty));
    return u && q ? a + u.harga * q : a;
  }, 0);
}

export default function EditorIsiPaket({ baris, onChange, menu, perField = {}, awalan = 'isi' }) {
  const menuById = new Map(menu.map((m) => [m.id, m]));
  const ubah = (i, perubahan) => onChange(baris.map((b, j) => (j === i ? { ...b, ...perubahan } : b)));
  return (
    <>
      {baris.map((b, i) => {
        const m = menuById.get(b.menuId);
        return (
          <div key={i} className="baris-isi-paket">
            <Isian label="Jumlah" galat={perField[`${awalan}[${i}].qty`]}>
              {(p) => <input {...p} className="angka" inputMode="numeric" value={b.qty} onChange={(e) => ubah(i, { qty: e.target.value })} />}
            </Isian>
            <Isian label="Menu kasir" galat={perField[`${awalan}[${i}].menuId`]}>
              {(p) => (
                <select {...p} value={b.menuId} onChange={(e) => ubah(i, { menuId: e.target.value, ukuran: menuById.get(e.target.value)?.ukuran[0].nama ?? '' })}>
                  <option value="">Pilih menu…</option>
                  {menu.map((x) => <option key={x.id} value={x.id}>{x.nama}</option>)}
                </select>
              )}
            </Isian>
            <Isian label="Ukuran" galat={perField[`${awalan}[${i}].ukuran`]}>
              {(p) => (
                <select {...p} value={b.ukuran} onChange={(e) => ubah(i, { ukuran: e.target.value })} disabled={!m}>
                  {!m && <option value="">–</option>}
                  {m?.ukuran.map((u) => <option key={u.nama} value={u.nama}>{u.nama}</option>)}
                </select>
              )}
            </Isian>
            {baris.length > 1 && <button type="button" className="tombol-kecil" aria-label={`Hapus baris ${i + 1}`} onClick={() => onChange(baris.filter((_, j) => j !== i))}>Hapus</button>}
          </div>
        );
      })}
      {perField[awalan] && <small className="teks-galat">{perField[awalan]}</small>}
      {baris.length < 6 && <button type="button" className="tombol-kecil" onClick={() => onChange([...baris, isiKosong()])}>+ Tambah menu lain</button>}
    </>
  );
}
