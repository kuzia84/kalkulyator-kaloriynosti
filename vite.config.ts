/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// BASE_PATH задаёт workflow деплоя на GitHub Pages (/kalkulyator-kaloriynosti/).
// Локальная сборка и тесты работают от корня.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Калькулятор калорийности блюда',
        short_name: 'Калорийность',
        description: 'Калорийность и БЖУ готового блюда с учётом уварки',
        lang: 'ru',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#f6f7f4',
        theme_color: '#2f7d4f',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // В кэш идёт всё приложение, включая отдельный файл ZXing: штрихкод работает без сети.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Потолок воркеров: без него vitest форкает процессы по числу ядер.
    maxWorkers: 4,
    minWorkers: 1,
  },
});
