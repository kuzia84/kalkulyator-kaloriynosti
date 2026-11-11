/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// BASE_PATH задаёт workflow деплоя на GitHub Pages (/kalkulyator-kaloriynosti/).
// Локальная сборка и тесты работают от корня.
const base = process.env.BASE_PATH ?? '/';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string;
};
const builtAt = new Date().toISOString();
// Номер сборки: короткий SHA коммита в CI. Локально — время сборки, чтобы каждая сборка отличалась.
const buildId =
  process.env.GITHUB_SHA?.slice(0, 7) ?? `dev-${builtAt.replace(/\D/g, '').slice(0, 14)}`;

/** Кладёт в сборку version.json: по нему открытое приложение узнаёт о новой версии. */
function versionFile(): Plugin {
  return {
    name: 'version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: `${JSON.stringify({ version: pkg.version, build: buildId, builtAt }, null, 2)}\n`,
      });
    },
  };
}

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_ID__: JSON.stringify(buildId),
    __BUILT_AT__: JSON.stringify(builtAt),
  },
  plugins: [
    react(),
    versionFile(),
    VitePWA({
      // Новая версия ждёт, пока пользователь нажмёт «Обновить» в настройках.
      registerType: 'prompt',
      // Регистрацию делает src/app/sw.ts.
      injectRegister: false,
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
        // version.json (json) в кэш не входит: его всегда спрашивают у сервера.
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
