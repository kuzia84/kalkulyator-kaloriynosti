/** Версия, которую сервер отдаёт в version.json. */
export interface RemoteVersion {
  version: string;
  build: string;
  builtAt?: string;
}

export const CURRENT_VERSION: RemoteVersion = {
  version: __APP_VERSION__,
  build: __BUILD_ID__,
  builtAt: __BUILT_AT__,
};

/** Автоматическая проверка — не чаще раза в сутки. */
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** Как часто открытая вкладка смотрит, не пора ли проверить. */
export const CHECK_TICK_MS = 60 * 60 * 1000;

export function shouldCheck(lastCheckAt: number | null, now: number): boolean {
  return lastCheckAt == null || now - lastCheckAt >= CHECK_INTERVAL_MS;
}

/**
 * На сервере другая сборка — значит, вышла новая версия.
 * Если сборка на сервере старше текущей (запомненный ответ до обновления), новой версии нет.
 */
export function isNewer(
  remote: RemoteVersion | null,
  current: Pick<RemoteVersion, 'build' | 'builtAt'>,
): boolean {
  if (remote == null || remote.build === current.build) return false;
  const remoteAt = remote.builtAt ? Date.parse(remote.builtAt) : Number.NaN;
  const currentAt = current.builtAt ? Date.parse(current.builtAt) : Number.NaN;
  if (Number.isFinite(remoteAt) && Number.isFinite(currentAt)) return remoteAt > currentAt;
  return true;
}

function isRemoteVersion(v: unknown): v is RemoteVersion {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as RemoteVersion).version === 'string' &&
    typeof (v as RemoteVersion).build === 'string' &&
    (v as RemoteVersion).build !== ''
  );
}

/**
 * Спрашивает у сервера version.json в обход всех кэшей.
 * Нет сети, ответ не 200 или файл битый — `null`, без исключения.
 */
export async function fetchRemoteVersion(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
): Promise<RemoteVersion | null> {
  try {
    const res = await fetchImpl(`${baseUrl}version.json?t=${now}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    return isRemoteVersion(data) ? data : null;
  } catch {
    return null;
  }
}

/** Ключ в localStorage: время последней проверки и найденная версия. Это удобство, не данные. */
export const UPDATE_STORAGE_KEY = 'kk-update-check';

export interface StoredCheck {
  lastCheckAt: number;
  remote: RemoteVersion | null;
}

export function readStoredCheck(): StoredCheck | null {
  try {
    const raw = localStorage.getItem(UPDATE_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<StoredCheck>;
    if (typeof data.lastCheckAt !== 'number') return null;
    return {
      lastCheckAt: data.lastCheckAt,
      remote: isRemoteVersion(data.remote) ? data.remote : null,
    };
  } catch {
    return null;
  }
}

export function writeStoredCheck(check: StoredCheck): void {
  try {
    localStorage.setItem(UPDATE_STORAGE_KEY, JSON.stringify(check));
  } catch {
    // Хранилище недоступно (приватный режим): проверка просто повторится при следующем запуске.
  }
}

/**
 * Сбрасывает кэш приложения: снимает service worker и удаляет Cache Storage.
 * IndexedDB (справочник, рецепты, черновик, настройки) не трогается.
 */
export async function clearAppCache(): Promise<void> {
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  }
  if (typeof caches !== 'undefined') {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
}
