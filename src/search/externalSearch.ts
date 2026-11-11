import { normalizeBarcode } from '../catalog/normalize';
import { db as defaultDb, type AppDB } from '../storage/db';
import type { ExternalSource, Settings } from '../storage/schema';
import { cacheKey, offByBarcode, searchOff, searchUsda, type ExternalProduct } from './external';

export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Внешний поиск начинается с трёх букв: короткий запрос даёт тысячи совпадений. */
export const MIN_EXTERNAL_QUERY = 3;

export interface ExternalResult {
  products: ExternalProduct[];
  /** Источники, которые не ответили: сеть, лимит, ошибка сервера. */
  failed: ExternalSource[];
}

type Fetcher = (query: string, signal: AbortSignal) => Promise<ExternalProduct[]>;

/** Источники в порядке из настроек. USDA без ключа пропускается. */
export function activeSources(settings: Settings): ExternalSource[] {
  return settings.sourcesOrder.filter(
    (s) =>
      settings.enabledSources.includes(s) && (s !== 'usda' || settings.usdaApiKey.trim() !== ''),
  );
}

function fetcherFor(source: ExternalSource, settings: Settings, fetchImpl: typeof fetch): Fetcher {
  // Размер страницы — число подсказок из настроек: столько и покажет список.
  const size = settings.suggestionsLimit;
  return source === 'off'
    ? (q, signal) => searchOff(q, signal, fetchImpl, size)
    : (q, signal) => searchUsda(q, settings.usdaApiKey.trim(), signal, fetchImpl, size);
}

async function readCache(db: AppDB, key: string, now: number): Promise<ExternalProduct[] | null> {
  try {
    const hit = await db.searchCache.get(key);
    if (hit && now - hit.createdAt < CACHE_TTL_MS) return hit.products;
  } catch {
    // Кэш — ускорение, а не данные: ошибка чтения не мешает запросу в сеть.
  }
  return null;
}

async function writeCache(db: AppDB, key: string, products: ExternalProduct[], now: number) {
  try {
    await db.searchCache.put({ key, createdAt: now, products });
  } catch {
    // Нет места или база закрыта — запрос просто повторится в следующий раз.
  }
}

/**
 * Ищет продукт по названию во всех включённых внешних источниках одновременно.
 * Результаты идут в порядке источников из настроек. Ответы кэшируются в IndexedDB на 7 дней. Отмена через `signal` прерывает запросы.
 */
export async function searchExternal(
  query: string,
  settings: Settings,
  signal: AbortSignal,
  options: { db?: AppDB; fetchImpl?: typeof fetch; now?: number } = {},
): Promise<ExternalResult> {
  const db = options.db ?? defaultDb;
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now();
  const result: ExternalResult = { products: [], failed: [] };
  if (query.trim().length < MIN_EXTERNAL_QUERY) return result;

  const sources = activeSources(settings);
  const responses = await Promise.all(
    sources.map(async (source) => {
      // Ключ кэша учитывает размер страницы: при большем лимите нужен новый запрос.
      const key = `${cacheKey(source, query)}:${settings.suggestionsLimit}`;
      const cached = await readCache(db, key, now);
      if (cached) return { source, products: cached };
      // Запрос отменили, пока читался кэш: в сеть не идём.
      signal.throwIfAborted();
      try {
        const products = await fetcherFor(source, settings, fetchImpl)(query.trim(), signal);
        // Пустой ответ не кэшируется: он может быть временным сбоем индекса источника.
        if (products.length > 0) await writeCache(db, key, products, now);
        return { source, products };
      } catch (error) {
        if (signal.aborted) throw error;
        return { source, products: null };
      }
    }),
  );
  for (const r of responses) {
    if (r.products) result.products.push(...r.products);
    else result.failed.push(r.source);
  }
  return result;
}

/**
 * Ищет продукт по штрихкоду во внешних источниках по очереди из настроек
 * (первый найденный ответ останавливает поиск). Вызывается из окна поиска по штрихкоду.
 * `codes` — варианты записи одного кода (UPC-A и EAN-13 с нулём и т. п.).
 * Open Food Facts спрашивается по каждому варианту. USDA ищет код как текст среди Branded Foods
 * один раз: ответ сравнивается со всеми вариантами без ведущих нулей.
 * Ошибка одного источника не мешает спросить следующий. Если не ответил ни один — ошибка.
 */
export async function lookupBarcodeExternal(
  codes: string | string[],
  settings: Settings,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<ExternalProduct | null> {
  const variants = [
    ...new Set((Array.isArray(codes) ? codes : [codes]).map(normalizeBarcode).filter(Boolean)),
  ];
  if (variants.length === 0) return null;
  const bare = new Set(variants.map((v) => v.replace(/^0+/, '')));
  const sources = activeSources(settings);
  let lastError: unknown = null;
  let answered = false;
  for (const source of sources) {
    try {
      if (source === 'off') {
        for (const variant of variants) {
          const found = await offByBarcode(variant, signal, fetchImpl);
          answered = true;
          if (found) return found;
        }
      } else {
        // USDA хранит UPC без ведущего нуля или с ним: сравнение — без ведущих нулей.
        const query = variants[0]!.replace(/^0+/, '');
        const foods = await searchUsda(query, settings.usdaApiKey.trim(), signal, fetchImpl);
        answered = true;
        const found = foods.find((f) => f.barcode && bare.has(f.barcode.replace(/^0+/, '')));
        if (found) return found;
      }
    } catch (error) {
      if (signal.aborted) throw error;
      lastError = error;
    }
  }
  if (!answered && lastError) throw lastError;
  return null;
}
