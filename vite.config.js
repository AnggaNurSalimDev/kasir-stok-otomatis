import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Aplikasi ada di frontend/, tetapi mengimpor logika/ dan skema/ dari folder bersama di atasnya.
export default defineConfig({
  root: 'frontend',
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: { fs: { allow: ['..'] } },
});
