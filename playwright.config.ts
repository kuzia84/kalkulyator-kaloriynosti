import { defineConfig, devices } from '@playwright/test';

const basePath = process.env.BASE_PATH ?? '/';

export default defineConfig({
  testDir: './e2e',
  // Число воркеров задаёт скрипт `npm run e2e` (--workers).
  retries: process.env.CI ? 1 : 0,
  // В CI отчёт пишется в playwright-report: его забирает шаг upload-artifact.
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:4173${basePath}`,
    locale: 'ru-RU',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    // Типы проверяет отдельный шаг CI, здесь нужна только сборка.
    command: 'npx vite build && npx vite preview --port 4173 --strictPort',
    port: 4173,
    // Чужой сервер на 4173 собран без пробных client ID: e2e облака на нём упали бы без дефекта.
    reuseExistingServer: false,
    timeout: 180_000,
    // Пробные client ID показывают кнопки входа. Страницы входа и API облака подменяет e2e/cloud.spec.ts.
    env: {
      VITE_GOOGLE_CLIENT_ID: 'e2e-google',
      VITE_YANDEX_CLIENT_ID: 'e2e-yandex',
    },
  },
});
