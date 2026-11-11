import { registerSW } from 'virtual:pwa-register';

export interface ServiceWorkerHandle {
  /** Применяет ждущую версию service worker и перезагружает страницу. */
  activateWaiting: () => Promise<void>;
  /** Просит браузер проверить, нет ли новой версии service worker. */
  checkForUpdate: () => Promise<void>;
}

/**
 * Регистрирует service worker. `onNeedRefresh` вызывается, когда новая версия скачана
 * и ждёт активации. Отдельный модуль: тесты подменяют его, в jsdom service worker нет.
 */
export function registerServiceWorker(onNeedRefresh: () => void): ServiceWorkerHandle {
  let registration: ServiceWorkerRegistration | undefined;
  const update = registerSW({
    immediate: true,
    onNeedRefresh,
    onRegisteredSW: (_url, reg) => {
      registration = reg;
    },
  });
  return {
    activateWaiting: () => update(true),
    checkForUpdate: async () => {
      try {
        await registration?.update();
      } catch {
        // Нет сети: проверка повторится позже.
      }
    },
  };
}

/** Есть ли service worker, который ждёт активации. */
export async function hasWaitingWorker(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return !!reg?.waiting;
}
