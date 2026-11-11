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
import { DEFAULT_SETTINGS, type Settings } from '../storage/schema';
import { loadSettings, saveSettings } from '../storage/settings';
import { rememberSkin, rememberTheme } from './theme';

interface SettingsContextValue {
  settings: Settings;
  ready: boolean;
  update: (patch: Partial<Settings>) => void;
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  ready: false,
  update: () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const current = useRef(settings);
  current.current = settings;

  useEffect(() => {
    let cancelled = false;
    loadSettings()
      .then((s) => {
        if (!cancelled) {
          current.current = s;
          rememberTheme(s.theme);
          rememberSkin(s.skin);
          setSettings(s);
        }
      })
      .catch((error: unknown) => console.error('Не удалось прочитать настройки', error))
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    const next = { ...current.current, ...patch };
    current.current = next;
    setSettings(next);
    rememberTheme(next.theme);
    rememberSkin(next.skin);
    saveSettings(next).catch((error: unknown) =>
      console.error('Не удалось сохранить настройки', error),
    );
  }, []);

  const value = useMemo(() => ({ settings, ready, update }), [settings, ready, update]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext);
}
