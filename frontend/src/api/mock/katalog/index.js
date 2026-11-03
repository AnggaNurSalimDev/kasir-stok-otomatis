import teh from './teh.js';
import kopi from './kopi.js';
import mie from './mie.js';

// Kunci = nilai "data" di file profil (src/merek/profil/*.json).
export const KATALOG = { teh, kopi, mie };
export const JENIS_USAHA = Object.keys(KATALOG);
