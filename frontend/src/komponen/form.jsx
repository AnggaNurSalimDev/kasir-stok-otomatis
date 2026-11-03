// Komponen form kecil yang dipakai halaman owner.
import { useId, useState } from 'react';
import { Pesan } from './umum.jsx';

// Label + input + bantuan + galat yang saling terhubung lewat id. Render prop: {(p) => <input {...p} />}
export function Isian({ label, bantuan, galat, children }) {
  const id = useId();
  const idBantuan = bantuan ? `${id}-bantuan` : undefined;
  const idGalat = galat ? `${id}-galat` : undefined;
  return (
    <div className="isian">
      <label htmlFor={id}>{label}</label>
      {children({ id, 'aria-invalid': galat ? true : undefined, 'aria-describedby': [idBantuan, idGalat].filter(Boolean).join(' ') || undefined })}
      {bantuan && <small id={idBantuan}>{bantuan}</small>}
      {galat && <small id={idGalat} className="teks-galat">{galat}</small>}
    </div>
  );
}

// Ringkasan galat dari ErrorApi atau galat form lokal ({ pesan, detail }).
export function RingkasanGalat({ galat }) {
  if (!galat) return null;
  const detail = galat.detail ?? [];
  return (
    <Pesan jenis="galat">
      <strong>{galat.message ?? galat.pesan}</strong>
      {detail.length > 0 && (
        <ul>{detail.map((d, i) => <li key={i}>{d.pesan}{d.field && d.field !== '(body)' ? ` (${d.field})` : ''}</li>)}</ul>
      )}
    </Pesan>
  );
}

// Status kirim untuk satu form: { sedang, galat, sukses } + jalankan(fn).
export function useKirim() {
  const [k, setK] = useState({ sedang: false, galat: null, sukses: null });
  const jalankan = async (fn, pesanSukses) => {
    setK({ sedang: true, galat: null, sukses: null });
    try {
      const hasil = await fn();
      setK({ sedang: false, galat: null, sukses: pesanSukses ?? null });
      return hasil;
    } catch (e) {
      setK({ sedang: false, galat: e, sukses: null });
      return undefined;
    }
  };
  const perField = k.galat?.perField ?? Object.fromEntries((k.galat?.detail ?? []).map((d) => [d.field, d.pesan]));
  return { ...k, perField, jalankan, reset: () => setK({ sedang: false, galat: null, sukses: null }) };
}

// Galat form lokal dengan bentuk sama seperti ErrorApi, supaya RingkasanGalat & perField bisa dipakai.
export class GalatForm extends Error {
  constructor(detail) {
    super('Periksa isian yang ditandai');
    this.detail = detail;
  }
  get perField() {
    return Object.fromEntries(this.detail.map((d) => [d.field, d.pesan]));
  }
}
