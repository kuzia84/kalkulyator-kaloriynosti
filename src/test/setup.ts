import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Запросы к fake-indexeddb при параллельных тестах идут дольше секунды по умолчанию.
configure({ asyncUtilTimeout: 5000 });

// Без globals: true Testing Library не регистрирует очистку DOM сама.
afterEach(() => {
  cleanup();
});

// jsdom не реализует scrollIntoView.
// Тесты в среде node (без DOM) тоже используют этот файл.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

// В jsdom нет service worker: модуль регистрации подменяется заглушкой.
vi.mock('../app/sw', () => ({
  registerServiceWorker: () => ({
    activateWaiting: vi.fn().mockResolvedValue(undefined),
    checkForUpdate: vi.fn().mockResolvedValue(undefined),
  }),
  hasWaitingWorker: vi.fn().mockResolvedValue(false),
}));

// Проверка версии хранится в localStorage: каждый тест начинает с чистого.
afterEach(() => {
  if (typeof localStorage !== 'undefined') localStorage.clear();
});
