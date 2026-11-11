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
  const remoteAt = parseBuiltAt(remote.builtAt);
  const currentAt = parseBuiltAt(current.builtAt);
  if (remoteAt != null && currentAt != null) return remoteAt > currentAt;
  return true;
}

/** Время сборки в мс или `null`, если даты нет или она битая. */
export function parseBuiltAt(builtAt: string | undefined): number | null {
  const at = builtAt ? Date.parse(builtAt) : Number.NaN;
  return Number.isFinite(at) ? at : null;
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

export type RemoteCheck =
  { ok: true; remote: RemoteVersion } | { ok: false; reason: 'network' | 'invalid' };

/**
 * Спрашивает у сервера version.json в обход всех кэшей.
 * `network` — нет связи. `invalid` — сервер ответил, но не 200 или файл битый.
 */
export async function checkRemoteVersion(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
): Promise<RemoteCheck> {
  let res: Response;
  try {
    res = await fetchImpl(`${baseUrl}version.json?t=${now}`, { cache: 'no-store' });
  } catch {
    return { ok: false, reason: 'network' };
  }
  if (!res.ok) return { ok: false, reason: 'invalid' };
  try {
    const data: unknown = await res.json();
    return isRemoteVersion(data) ? { ok: true, remote: data } : { ok: false, reason: 'invalid' };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
}

/** То же, что checkRemoteVersion, но без причины ошибки: версия или `null`. */
export async function fetchRemoteVersion(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
): Promise<RemoteVersion | null> {
  const result = await checkRemoteVersion(baseUrl, fetchImpl, now);
  return result.ok ? result.remote : null;
}

/**
 * Адрес для перезагрузки в обход HTTP-кэша: новый параметр запроса — новый ключ кэша
 * для index.html. Hash (раздел приложения) сохраняется.
 */
export function freshReloadUrl(
  location: Pick<Location, 'pathname' | 'hash'>,
  now = Date.now(),
): string {
  return `${location.pathname}?r=${now}${location.hash}`;
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

/**
 * Дата версии считается по московскому времени, а не по часам устройства:
 * одна сборка должна называться одинаково у всех пользователей.
 */
export const VERSION_TIME_ZONE = 'Europe/Moscow';

const versionDateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  timeZone: VERSION_TIME_ZONE,
});

/**
 * Версия, которую видит пользователь: «от дд.мм.гг» по дате сборки.
 * Нет даты или она битая — номер из package.json («0.2.0»). Две сборки за один день
 * различаются номером сборки, который показывается рядом.
 */
export function versionLabel(v: Pick<RemoteVersion, 'version' | 'builtAt'>): string {
  const at = parseBuiltAt(v.builtAt);
  return at != null ? `от ${versionDateFormatter.format(at)}` : v.version;
}
