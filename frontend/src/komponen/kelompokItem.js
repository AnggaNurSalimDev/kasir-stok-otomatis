// Item transaksi hasil urai paket/pemetaan → kembali menjadi satu baris untuk struk & laporan.
//
//   [{ nama: 'Thai Tea', subtotal: 13455, kelompok: { ke: 0, nama: 'Paket Berdua', qty: 1 } },
//    { nama: 'Kopi Susu', subtotal: 17045, kelompok: { ke: 0, … } },
//    { nama: 'Americano', subtotal: 16500 }]
//     ──▶ [{ jenis: 'kelompok', nama: 'Paket Berdua', qty: 1, subtotal: 30500, isi: [Thai Tea, Kopi Susu] },
//          { jenis: 'menu', item: Americano }]

export function kelompokkanItem(item) {
  if (!Array.isArray(item)) throw new TypeError('item wajib berupa daftar');
  const hasil = [];
  for (const it of item) {
    const k = it.kelompok;
    const akhir = hasil.at(-1);
    if (k && akhir?.jenis === 'kelompok' && akhir.ke === k.ke && akhir.nama === k.nama) {
      akhir.isi.push(it);
      akhir.subtotal += it.subtotal;
    } else if (k) {
      hasil.push({ jenis: 'kelompok', ke: k.ke, nama: k.nama, qty: k.qty, sumber: k.jenis, subtotal: it.subtotal, isi: [it] });
    } else {
      hasil.push({ jenis: 'menu', item: it });
    }
  }
  return hasil;
}
