import { validateProduct } from '../catalog/catalog';
import { normalizeName } from '../catalog/normalize';
import { db as defaultDb, type AppDB } from './db';
import type { Dish, Product, ProductSource } from './schema';

export const BACKUP_FORMAT = 'kalkulyator-kaloriynosti';
export const BACKUP_VERSION = 1;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  products: Product[];
  recipes: Dish[];
}

/**
 * Собирает справочник и рецепты в один объект для файла JSON.
 * Настройки в файл не входят: в них ключ USDA, а файл легко переслать.
 */
export async function exportBackup(db: AppDB = defaultDb, now = new Date()): Promise<Backup> {
  const [products, recipes] = await Promise.all([db.products.toArray(), db.recipes.toArray()]);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    products,
    recipes,
  };
}

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupError';
  }
}

const SOURCES: ProductSource[] = ['skurikhin', 'off', 'usda', 'user'];

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readProduct(raw: unknown): Product | null {
  if (!isObject(raw) || typeof raw.id !== 'string' || typeof raw.name !== 'string') return null;
  const source = SOURCES.includes(raw.source as ProductSource)
    ? (raw.source as ProductSource)
    : 'user';
  const product: Product = {
    id: raw.id,
    name: raw.name.trim(),
    nameNorm: normalizeName(raw.name),
    kcal: Number(raw.kcal),
    protein: Number(raw.protein),
    fat: Number(raw.fat),
    carbs: Number(raw.carbs),
    source,
    rank: Number.isFinite(Number(raw.rank)) ? Math.max(0, Number(raw.rank)) : 0,
    verified: raw.verified === true,
    ...(typeof raw.barcode === 'string' && raw.barcode
      ? { barcode: raw.barcode.replace(/\D/g, '') }
      : {}),
    ...(typeof raw.externalId === 'string' && raw.externalId ? { externalId: raw.externalId } : {}),
    ...(Number.isFinite(Number(raw.lastUsedAt)) && raw.lastUsedAt != null
      ? { lastUsedAt: Number(raw.lastUsedAt) }
      : {}),
  };
  try {
    validateProduct(product);
  } catch {
    return null;
  }
  return product;
}

function readRecipe(raw: unknown): Dish | null {
  if (!isObject(raw) || typeof raw.id !== 'string' || !Array.isArray(raw.rows)) return null;
  const rows: Dish['rows'] = [];
  for (const r of raw.rows) {
    if (!isObject(r) || typeof r.id !== 'string') continue;
    const per100 = isObject(r.per100)
      ? {
          kcal: Number(r.per100.kcal),
          protein: Number(r.per100.protein),
          fat: Number(r.per100.fat),
          carbs: Number(r.per100.carbs),
        }
      : undefined;
    const validPer100 =
      per100 && Object.values(per100).every((v) => Number.isFinite(v) && v >= 0)
        ? per100
        : undefined;
    rows.push({
      id: r.id,
      name: typeof r.name === 'string' ? r.name : '',
      weight: typeof r.weight === 'string' ? r.weight : '',
      ...(validPer100 ? { per100: validPer100 } : {}),
      ...(SOURCES.includes(r.source as ProductSource) ? { source: r.source as ProductSource } : {}),
      ...(typeof r.productId === 'string' ? { productId: r.productId } : {}),
      ...(typeof r.barcode === 'string' ? { barcode: r.barcode } : {}),
      ...(typeof r.externalId === 'string' ? { externalId: r.externalId } : {}),
    });
  }
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const time = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : Date.now());
  return {
    id: raw.id,
    name: str(raw.name) || 'Без названия',
    rows,
    cookedWeight: str(raw.cookedWeight),
    portionWeight: str(raw.portionWeight),
    note: str(raw.note),
    createdAt: time(raw.createdAt),
    updatedAt: time(raw.updatedAt),
  };
}

export interface ImportResult {
  products: number;
  recipes: number;
  skipped: number;
}

/**
 * Загружает файл, сохранённый `exportBackup`. Данные объединяются с данными устройства:
 * - продукт с тем же id заменяется, если в файле он проверен или имеет ранг выше;
 * - рецепт с тем же id заменяется, если в файле он новее.
 * Ничего не удаляется.
 */
export async function importBackup(json: string, db: AppDB = defaultDb): Promise<ImportResult> {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new BackupError('Файл не читается как JSON.');
  }
  if (!isObject(data) || data.format !== BACKUP_FORMAT) {
    throw new BackupError('Это не файл калькулятора калорийности.');
  }
  if (typeof data.version !== 'number' || data.version > BACKUP_VERSION) {
    throw new BackupError('Файл сохранён более новой версией приложения. Обновите страницу.');
  }
  const rawProducts = Array.isArray(data.products) ? data.products : [];
  const rawRecipes = Array.isArray(data.recipes) ? data.recipes : [];
  const products = rawProducts.map(readProduct);
  const recipes = rawRecipes.map(readRecipe);
  let skipped = products.filter((p) => !p).length + recipes.filter((r) => !r).length;
  const result: ImportResult = { products: 0, recipes: 0, skipped: 0 };

  await db.transaction('rw', db.products, db.recipes, async () => {
    for (const p of products) {
      if (!p) continue;
      const existing = await db.products.get(p.id);
      if (existing && !(p.verified && !existing.verified) && p.rank <= existing.rank) {
        skipped += 1;
        continue;
      }
      await db.products.put(p);
      result.products += 1;
    }
    for (const r of recipes) {
      if (!r) continue;
      const existing = await db.recipes.get(r.id);
      if (existing && existing.updatedAt >= r.updatedAt) {
        skipped += 1;
        continue;
      }
      await db.recipes.put(r);
      result.recipes += 1;
    }
  });
  result.skipped = skipped;
  return result;
}
