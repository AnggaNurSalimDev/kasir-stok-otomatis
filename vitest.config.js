import { defineConfig } from 'vitest/config';

// Terpisah dari vite.config.js supaya test dicari di seluruh repo (logika/, skema/, frontend/).
export default defineConfig({
  test: { include: ['**/*.test.{js,jsx}'], exclude: ['node_modules/**', 'dist/**'] },
});
