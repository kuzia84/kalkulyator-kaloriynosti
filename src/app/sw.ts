import { registerSW } from 'virtual:pwa-register';

export interface ServiceWorkerHandle {
  /** Есть ли новая версия service worker, которая ждёт активации. */
  hasWaiting: () => boolean;
  /**
   * Включает ждущую версию и перезагружает страницу, когда она взяла управление.
   * Возвращает false, если ждущей версии нет.
   */
  activateWaiting: () => Promise<boolean>;
  /** Просит браузер проверить, нет ли новой версии service worker. */
  checkForUpdate: () => Promise<void>;
}

/** Если новая версия не взяла управление за это время, страница всё равно перезагружается. */
const ACTIVATE_TIMEOUT_MS = 8000;

/**
 * Регистрирует service worker. `onNeedRefresh` вызывается, когда новая версия скачана
 * и ждёт активации. Отдельный модуль: тесты подменяют его, в jsdom service worker нет.
 */
export function registerServiceWorker(onNeedRefresh: () => void): ServiceWorkerHandle {
  let registration: ServiceWorkerRegistration | undefined;
  registerSW({
    immediate: true,
    onNeedRefresh,
    onRegisteredSW: (_url, reg) => {
      registration = reg;
      // Версия скачалась в прошлый раз и всё ещё ждёт: показать обновление сразу.
      if (reg?.waiting) onNeedRefresh();
    },
  });
  return {
    hasWaiting: () => !!registration?.waiting,
    activateWaiting: () => {
      const waiting = registration?.waiting;
      if (!waiting || !('serviceWorker' in navigator)) return Promise.resolve(false);
      return new Promise<boolean>(() => {
        let done = false;
        const reload = () => {
          if (done) return;
          done = true;
          window.location.reload();
        };
        navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true });
        setTimeout(reload, ACTIVATE_TIMEOUT_MS);
        // Service worker, собранный vite-plugin-pwa в режиме prompt, слушает это сообщение.
        waiting.postMessage({ type: 'SKIP_WAITING' });
      });
    },
    checkForUpdate: async () => {
      try {
        await registration?.update();
      } catch {
        // Нет сети: проверка повторится позже.
      }
    },
  };
}
