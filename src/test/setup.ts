import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// Запросы к fake-indexeddb при параллельных тестах идут дольше секунды по умолчанию.
configure({ asyncUtilTimeout: 5000 });

// Без globals: true Testing Library не регистрирует очистку DOM сама.
afterEach(() => {
  cleanup();
});

// jsdom не реализует scrollIntoView.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}
