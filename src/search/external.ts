import { normalizeBarcode, normalizeName } from '../catalog/normalize';
import type { ExternalProductRecord, ExternalSource } from '../storage/schema';

/** Продукт из внешнего источника. Значения на 100 г. */
export type ExternalProduct = ExternalProductRecord;

export class RateLimitError extends Error {
  constructor(source: ExternalSource) {
    super(`Превышен лимит запросов к ${source}`);
    this.name = 'RateLimitError';
  }
}

export class HttpError extends Error {
  constructor(public readonly status: number) {
    super(`Сервер ответил ${status}`);
    this.name = 'HttpError';
  }
}

/**
 * Скользящее окно: не больше `limit` запросов за `windowMs`.
 * Лимиты API считаются по IP, поэтому приложение не тратит их на быстрый ввод.
 */
export class RateLimiter {
  private stamps: number[] = [];

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  tryTake(now = Date.now()): boolean {
    this.stamps = this.stamps.filter((t) => now - t < this.windowMs);
    if (this.stamps.length >= this.limit) return false;
    this.stamps.push(now);
    return true;
  }
}

const KJ_PER_KCAL = 4.184;

function num(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value.replace(',', '.')) : value;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------- Open Food Facts ----------

// Полнотекстовый поиск OFF. Новый сервис search.openfoodfacts.org не отдаёт заголовок CORS,
// поэтому браузер его ответ не пропускает. Классический cgi/search.pl отдаёт `*`.
export const OFF_SEARCH_URL = 'https://world.openfoodfacts.org/cgi/search.pl';
export const OFF_PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product';
const OFF_FIELDS = 'code,product_name,product_name_ru,brands,quantity,nutriments';

// Лимиты OFF: 10 запросов поиска и 15 запросов продукта в минуту с одного IP.
export const offSearchLimiter = new RateLimiter(10, 60_000);
export const offProductLimiter = new RateLimiter(15, 60_000);

interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_ru?: string;
  brands?: string | string[];
  quantity?: string;
  nutriments?: Record<string, unknown>;
}

/** Переводит запись OFF в продукт. Без названия или без ккал и БЖУ на 100 г — `null`. */
export function mapOffProduct(p: OffProduct): ExternalProduct | null {
  const name = (p.product_name_ru || p.product_name || '').trim();
  const code = p.code ? normalizeBarcode(p.code) : '';
  const n = p.nutriments ?? {};
  const kcalDirect = num(n['energy-kcal_100g']);
  const kj = num(n['energy-kj_100g']) ?? num(n['energy_100g']);
  const kcal = kcalDirect ?? (kj != null ? kj / KJ_PER_KCAL : null);
  const protein = num(n['proteins_100g']);
  const fat = num(n['fat_100g']);
  const carbs = num(n['carbohydrates_100g']);
  if (!name || !code || kcal == null || protein == null || fat == null || carbs == null) {
    return null;
  }
  const brands = Array.isArray(p.brands) ? p.brands.join(', ') : p.brands;
  const detail = [brands, p.quantity].filter((s) => s && s.trim()).join(', ');
  return {
    source: 'off',
    externalId: `off:${code}`,
    name,
    barcode: code,
    kcal: round2(kcal),
    protein: round2(protein),
    fat: round2(fat),
    carbs: round2(carbs),
    ...(detail ? { detail } : {}),
  };
}

export async function searchOff(
  query: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<ExternalProduct[]> {
  if (!offSearchLimiter.tryTake()) throw new RateLimitError('off');
  const url = new URL(OFF_SEARCH_URL);
  url.searchParams.set('search_terms', query);
  url.searchParams.set('search_simple', '1');
  url.searchParams.set('json', '1');
  url.searchParams.set('lc', 'ru');
  url.searchParams.set('page_size', '20');
  url.searchParams.set('fields', OFF_FIELDS);
  const res = await fetchImpl(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new HttpError(res.status);
  const data = (await res.json()) as { products?: OffProduct[] };
  return (data.products ?? []).map(mapOffProduct).filter((p): p is ExternalProduct => p != null);
}

export async function offByBarcode(
  code: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<ExternalProduct | null> {
  const normalized = normalizeBarcode(code);
  if (!normalized) return null;
  if (!offProductLimiter.tryTake()) throw new RateLimitError('off');
  const url = new URL(`${OFF_PRODUCT_URL}/${normalized}.json`);
  url.searchParams.set('fields', OFF_FIELDS);
  const res = await fetchImpl(url, { signal, headers: { Accept: 'application/json' } });
  // OFF отвечает 404, если продукта нет в базе.
  if (res.status === 404) return null;
  if (!res.ok) throw new HttpError(res.status);
  const data = (await res.json()) as { status?: number; product?: OffProduct };
  if (data.status !== 1 || !data.product) return null;
  return mapOffProduct({ ...data.product, code: data.product.code ?? normalized });
}

// ---------- USDA FoodData Central ----------

export const USDA_SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';
// Лимит USDA — 1000 запросов в час с ключа. Приложение берёт не больше 30 в минуту.
export const usdaLimiter = new RateLimiter(30, 60_000);

interface UsdaNutrient {
  nutrientId?: number;
  nutrientNumber?: string;
  nutrientName?: string;
  unitName?: string;
  value?: number;
}

interface UsdaFood {
  fdcId?: number;
  description?: string;
  brandOwner?: string;
  brandName?: string;
  gtinUpc?: string;
  dataType?: string;
  foodNutrients?: UsdaNutrient[];
}

function usdaValue(list: UsdaNutrient[], numbers: string[]): number | null {
  for (const number of numbers) {
    const found = list.find((n) => n.nutrientNumber === number);
    const v = num(found?.value);
    if (v != null) return v;
  }
  return null;
}

/**
 * Переводит запись USDA в продукт. Номера нутриентов USDA:
 * 208 — энергия, ккал; 957 и 958 — энергия по формуле Атуотера (у Foundation Foods);
 * 203 — белки; 204 — жиры; 205 — углеводы.
 */
export function mapUsdaFood(food: UsdaFood): ExternalProduct | null {
  const list = food.foodNutrients ?? [];
  const energyKcal = list.filter((n) => (n.unitName ?? '').toUpperCase() === 'KCAL');
  const kcal = usdaValue(energyKcal, ['208', '958', '957']);
  const protein = usdaValue(list, ['203']);
  const fat = usdaValue(list, ['204']);
  const carbs = usdaValue(list, ['205']);
  const name = (food.description ?? '').trim();
  if (!food.fdcId || !name || kcal == null || protein == null || fat == null || carbs == null) {
    return null;
  }
  const barcode = food.gtinUpc ? normalizeBarcode(food.gtinUpc) : '';
  const detail = food.brandName || food.brandOwner || food.dataType || '';
  return {
    source: 'usda',
    externalId: `usda:${food.fdcId}`,
    name,
    kcal: round2(kcal),
    protein: round2(protein),
    fat: round2(fat),
    carbs: round2(carbs),
    ...(barcode ? { barcode } : {}),
    ...(detail ? { detail } : {}),
  };
}

export async function searchUsda(
  query: string,
  apiKey: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<ExternalProduct[]> {
  if (!usdaLimiter.tryTake()) throw new RateLimitError('usda');
  const url = new URL(USDA_SEARCH_URL);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('query', query);
  url.searchParams.set('pageSize', '20');
  const res = await fetchImpl(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new HttpError(res.status);
  const data = (await res.json()) as { foods?: UsdaFood[] };
  return (data.foods ?? []).map(mapUsdaFood).filter((p): p is ExternalProduct => p != null);
}

/** Ключ кэша внешнего поиска. */
export function cacheKey(source: ExternalSource, query: string): string {
  return `${source}:${normalizeName(query)}`;
}
