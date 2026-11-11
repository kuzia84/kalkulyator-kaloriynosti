import { db as defaultDb, type AppDB } from './db';
import {
  DEFAULT_SETTINGS,
  type ExternalSource,
  type Settings,
  type Skin,
  type Theme,
} from './schema';

const SOURCES: ExternalSource[] = ['off', 'usda'];
const THEMES: Theme[] = ['system', 'light', 'dark'];
const SKINS: Skin[] = ['glass', 'label'];

export const SUGGESTIONS_MIN = 5;
export const SUGGESTIONS_MAX = 50;

/** Приводит сохранённые настройки к текущему формату: неизвестные значения заменяются умолчаниями. */
export function sanitizeSettings(raw: Partial<Settings> | undefined): Settings {
  const s = raw ?? {};
  const order = Array.isArray(s.sourcesOrder)
    ? s.sourcesOrder.filter((x, i, arr) => SOURCES.includes(x) && arr.indexOf(x) === i)
    : [];
  for (const src of SOURCES) if (!order.includes(src)) order.push(src);
  const enabled = Array.isArray(s.enabledSources)
    ? s.enabledSources.filter((x) => SOURCES.includes(x))
    : DEFAULT_SETTINGS.enabledSources;
  const limit = s.suggestionsLimit;
  return {
    suggestionsLimit:
      typeof limit === 'number' && Number.isFinite(limit)
        ? Math.min(SUGGESTIONS_MAX, Math.max(SUGGESTIONS_MIN, Math.round(limit)))
        : DEFAULT_SETTINGS.suggestionsLimit,
    sourcesOrder: order,
    enabledSources: [...new Set(enabled)],
    usdaApiKey: typeof s.usdaApiKey === 'string' ? s.usdaApiKey.trim() : '',
    theme: THEMES.includes(s.theme as Theme) ? (s.theme as Theme) : DEFAULT_SETTINGS.theme,
    skin: SKINS.includes(s.skin as Skin) ? (s.skin as Skin) : DEFAULT_SETTINGS.skin,
  };
}

export async function loadSettings(db: AppDB = defaultDb): Promise<Settings> {
  const record = await db.settings.get('app');
  return sanitizeSettings(record);
}

export async function saveSettings(settings: Settings, db: AppDB = defaultDb): Promise<void> {
  await db.settings.put({ id: 'app', ...sanitizeSettings(settings) });
}
