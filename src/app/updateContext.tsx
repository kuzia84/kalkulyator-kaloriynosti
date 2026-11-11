import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { registerServiceWorker, type ServiceWorkerHandle } from './sw';
import {
  checkRemoteVersion,
  CHECK_TICK_MS,
  clearAppCache,
  CURRENT_VERSION,
  freshReloadUrl,
  isNewer,
  readStoredCheck,
  shouldCheck,
  writeStoredCheck,
  type RemoteVersion,
} from './updates';
import { useOnline } from './useOnline';

/**
 * Состояние проверки. «Есть обновление» — не состояние, а вывод из `remote` и service worker:
 * см. `updateAvailable`.
 */
export type UpdateStatus = 'idle' | 'checking' | 'checked' | 'offline' | 'invalid' | 'updating';

interface UpdateContextValue {
  status: UpdateStatus;
  current: RemoteVersion;
  /** Версия на сервере, если её удалось узнать. */
  remote: RemoteVersion | null;
  lastCheckAt: number | null;
  updateAvailable: boolean;
  checkNow: () => Promise<void>;
  applyUpdate: () => Promise<void>;
  resetCache: () => Promise<void>;
}

const UpdateContext = createContext<UpdateContextValue | null>(null);

export interface UpdateProviderProps {
  children: ReactNode;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

/**
 * Следит за версией приложения.
 * - При запуске, раз в час и при появлении сети смотрит, прошли ли сутки с последней проверки.
 * - Проверка: version.json с сервера в обход кэша и проверка service worker.
 * - Новая версия — если на сервере более новая сборка или новый service worker ждёт активации.
 */
export function UpdateProvider({
  children,
  baseUrl = import.meta.env.BASE_URL,
  fetchImpl,
  now = Date.now,
}: UpdateProviderProps) {
  const stored = useMemo(readStoredCheck, []);
  const online = useOnline();
  const [remote, setRemote] = useState<RemoteVersion | null>(stored?.remote ?? null);
  const [lastCheckAt, setLastCheckAt] = useState<number | null>(stored?.lastCheckAt ?? null);
  const [workerWaiting, setWorkerWaiting] = useState(false);
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const sw = useRef<ServiceWorkerHandle | null>(null);
  const checking = useRef(false);
  const lastCheckRef = useRef(lastCheckAt);
  lastCheckRef.current = lastCheckAt;

  const updateAvailable = workerWaiting || isNewer(remote, CURRENT_VERSION);

  useEffect(() => {
    sw.current = registerServiceWorker(() => setWorkerWaiting(true));
  }, []);

  const checkNow = useCallback(async () => {
    if (checking.current) return;
    checking.current = true;
    setStatus('checking');
    try {
      await sw.current?.checkForUpdate();
      if (sw.current?.hasWaiting()) setWorkerWaiting(true);
      const result = await checkRemoteVersion(baseUrl, fetchImpl ?? fetch, now());
      if (result.ok) {
        const at = now();
        setRemote(result.remote);
        setLastCheckAt(at);
        writeStoredCheck({ lastCheckAt: at, remote: result.remote });
        setStatus('checked');
      } else {
        // Время не записывается: без ответа сервера проверка повторится при следующей возможности.
        setStatus(result.reason === 'network' ? 'offline' : 'invalid');
      }
    } finally {
      checking.current = false;
    }
  }, [baseUrl, fetchImpl, now]);

  // Проверка раз в сутки: при запуске, по часовому таймеру и сразу после появления сети.
  useEffect(() => {
    if (!online) return;
    const tick = () => {
      if (shouldCheck(lastCheckRef.current, now())) void checkNow();
    };
    tick();
    const timer = setInterval(tick, CHECK_TICK_MS);
    return () => clearInterval(timer);
  }, [online, checkNow, now]);

  const resetCache = useCallback(async () => {
    // Без сети сброс кэша оставил бы приложение без файлов: страница не открылась бы.
    if (navigator.onLine === false) {
      setStatus('offline');
      return;
    }
    setStatus('updating');
    try {
      await clearAppCache();
    } catch {
      // Кэш не удалился целиком — перезагрузка всё равно возьмёт свежие файлы с сервера.
    }
    window.location.replace(freshReloadUrl(window.location, now()));
  }, [now]);

  const applyUpdate = useCallback(async () => {
    if (navigator.onLine === false && !sw.current?.hasWaiting()) {
      setStatus('offline');
      return;
    }
    setStatus('updating');
    try {
      // Новая версия уже скачана: включить её. Страницу перезагрузит sw.ts.
      if (await sw.current?.activateWaiting()) return;
    } catch {
      // Не вышло включить новую версию — остаётся путь через сброс кэша.
    }
    // Service worker ещё не скачал новую версию (или его нет): чистый кэш и перезагрузка.
    await resetCache();
  }, [resetCache]);

  const value = useMemo<UpdateContextValue>(
    () => ({
      status,
      current: CURRENT_VERSION,
      remote,
      lastCheckAt,
      updateAvailable,
      checkNow,
      applyUpdate,
      resetCache,
    }),
    [status, remote, lastCheckAt, updateAvailable, checkNow, applyUpdate, resetCache],
  );

  return <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>;
}

export function useAppUpdate(): UpdateContextValue {
  const ctx = useContext(UpdateContext);
  if (!ctx) throw new Error('useAppUpdate вызван вне UpdateProvider');
  return ctx;
}
