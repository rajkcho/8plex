import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/8plex/',
  build: {
    outDir: 'docs',
  },

  test: {
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
  },
});
