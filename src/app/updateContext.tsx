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
import { hasWaitingWorker, registerServiceWorker, type ServiceWorkerHandle } from './sw';
import {
  CHECK_TICK_MS,
  clearAppCache,
  CURRENT_VERSION,
  fetchRemoteVersion,
  isNewer,
  readStoredCheck,
  shouldCheck,
  writeStoredCheck,
  type RemoteVersion,
} from './updates';

export type UpdateStatus =
  'idle' | 'checking' | 'up-to-date' | 'available' | 'offline' | 'updating';

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
 * - При запуске и раз в час смотрит, прошли ли сутки с последней проверки; если да — проверяет.
 * - Проверка: version.json с сервера в обход кэша и проверка service worker.
 * - Новая версия — если другая сборка на сервере или новый service worker ждёт активации.
 */
export function UpdateProvider({
  children,
  baseUrl = import.meta.env.BASE_URL,
  fetchImpl,
  now = Date.now,
}: UpdateProviderProps) {
  const stored = useMemo(readStoredCheck, []);
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
      const found = await fetchRemoteVersion(baseUrl, fetchImpl ?? fetch, now());
      const at = now();
      if (found) {
        setRemote(found);
        setLastCheckAt(at);
        writeStoredCheck({ lastCheckAt: at, remote: found });
        setStatus(isNewer(found, CURRENT_VERSION) ? 'available' : 'up-to-date');
      } else {
        // Время не записывается: без ответа сервера проверка повторится при следующей возможности.
        setStatus('offline');
      }
    } finally {
      checking.current = false;
    }
  }, [baseUrl, fetchImpl, now]);

  // Проверка раз в сутки: при запуске и по часовому таймеру для долго открытой вкладки.
  useEffect(() => {
    const tick = () => {
      // Без сети проверять нечего: проверка пройдёт при следующем тике после подключения.
      if (navigator.onLine === false) return;
      if (shouldCheck(lastCheckRef.current, now())) void checkNow();
    };
    tick();
    const timer = setInterval(tick, CHECK_TICK_MS);
    return () => clearInterval(timer);
  }, [checkNow, now]);

  const resetCache = useCallback(async () => {
    setStatus('updating');
    try {
      await clearAppCache();
    } finally {
      window.location.reload();
    }
  }, []);

  const applyUpdate = useCallback(async () => {
    setStatus('updating');
    if (workerWaiting || (await hasWaitingWorker())) {
      await sw.current?.activateWaiting();
      return;
    }
    // Service worker ещё не скачал новую версию (или его нет): чистый кэш и перезагрузка.
    await resetCache();
  }, [workerWaiting, resetCache]);

  const effectiveStatus: UpdateStatus =
    status === 'checking' || status === 'updating' || status === 'offline'
      ? status
      : updateAvailable
        ? 'available'
        : status;

  const value = useMemo<UpdateContextValue>(
    () => ({
      status: effectiveStatus,
      current: CURRENT_VERSION,
      remote,
      lastCheckAt,
      updateAvailable,
      checkNow,
      applyUpdate,
      resetCache,
    }),
    [effectiveStatus, remote, lastCheckAt, updateAvailable, checkNow, applyUpdate, resetCache],
  );

  return <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>;
}

export function useAppUpdate(): UpdateContextValue {
  const ctx = useContext(UpdateContext);
  if (!ctx) throw new Error('useAppUpdate вызван вне UpdateProvider');
  return ctx;
}
