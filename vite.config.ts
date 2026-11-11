/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base задаётся для GitHub Pages: сайт открывается по адресу /kalkulyator-kaloriynosti/
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Потолок воркеров: без него vitest форкает процессы по числу ядер.
    maxWorkers: 4,
    minWorkers: 1,
  },
});
