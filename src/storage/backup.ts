import { validateProduct } from '../catalog/catalog';
import { normalizeBarcode, normalizeName } from '../catalog/normalize';
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
    ...(typeof raw.barcode === 'string' && normalizeBarcode(raw.barcode)
      ? { barcode: normalizeBarcode(raw.barcode) }
      : {}),
    ...(typeof raw.externalId === 'string' && raw.externalId ? { externalId: raw.externalId } : {}),
    ...(Number.isFinite(Number(raw.lastUsedAt)) && raw.lastUsedAt != null
      ? { lastUsedAt: Number(raw.lastUsedAt) }
      : {}),
    ...(Array.isArray(raw.aliases) && raw.aliases.every((a) => typeof a === 'string')
      ? { aliases: raw.aliases as string[] }
      : {}),
    ...(Number.isFinite(Number(raw.editedAt)) && raw.editedAt != null
      ? { editedAt: Number(raw.editedAt) }
      : {}),
  };
  try {
    validateProduct(product);
  } catch {
    return null;
  }
  return product;
}

function readRecipe(raw: unknown): { recipe: Dish; droppedRows: number } | null {
  if (!isObject(raw) || typeof raw.id !== 'string' || !Array.isArray(raw.rows)) return null;
  const rows: Dish['rows'] = [];
  let droppedRows = 0;
  for (const r of raw.rows) {
    if (!isObject(r) || typeof r.id !== 'string') {
      droppedRows += 1;
      continue;
    }
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
      ...(typeof r.pickId === 'string' ? { pickId: r.pickId } : {}),
      ...(r.committed === true ? { committed: true } : {}),
    });
  }
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  // Без верной даты рецепт считается самым старым: он не заменит рецепт на устройстве.
  const time = (v: unknown) => (v != null && Number.isFinite(Number(v)) ? Number(v) : 0);
  const recipe: Dish = {
    id: raw.id,
    name: str(raw.name) || 'Без названия',
    rows,
    cookedWeight: str(raw.cookedWeight),
    portionWeight: str(raw.portionWeight),
    note: str(raw.note),
    createdAt: time(raw.createdAt),
    updatedAt: time(raw.updatedAt),
  };
  return { recipe, droppedRows };
}

/** Та же запись уже есть на устройстве под другим id (продукт добавили на двух устройствах). */
async function findSameProduct(db: AppDB, p: Product): Promise<Product | undefined> {
  if (p.externalId) {
    const byExternal = await db.products
      .where('externalId')
      .equals(p.externalId)
      .filter((x) => x.source === p.source)
      .first();
    if (byExternal) return byExternal;
  }
  if (p.barcode) {
    const byBarcode = await db.products
      .where('barcode')
      .equals(p.barcode)
      .filter((x) => x.source === p.source)
      .first();
    if (byBarcode) return byBarcode;
  }
  return db.products
    .where('nameNorm')
    .equals(p.nameNorm)
    .filter(
      (x) =>
        x.source === p.source &&
        x.kcal === p.kcal &&
        x.protein === p.protein &&
        x.fat === p.fat &&
        x.carbs === p.carbs,
    )
    .first();
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
  let skipped =
    products.filter((p) => !p).length + recipes.reduce((n, r) => n + (r ? r.droppedRows : 1), 0);
  const result: ImportResult = { products: 0, recipes: 0, skipped: 0 };

  await db.transaction('rw', db.products, db.recipes, db.meta, async () => {
    const deletedSeed = new Set((await db.meta.get('seed'))?.deletedIds ?? []);
    for (const p of products) {
      if (!p) continue;
      // Удалённые и объединённые на этом устройстве записи не возвращаются.
      const merged = await db.products.where('aliases').equals(p.id).first();
      if (deletedSeed.has(p.id) || merged) {
        skipped += 1;
        continue;
      }
      const existing = (await db.products.get(p.id)) ?? (await findSameProduct(db, p));
      if (!existing) {
        await db.products.put(p);
        result.products += 1;
        continue;
      }
      if (!(p.verified && !existing.verified) && p.rank <= existing.rank) {
        skipped += 1;
        continue;
      }
      // Запись устройства обновляется значениями из файла, но сохраняет свой id и псевдонимы.
      const aliases = [...new Set([...(existing.aliases ?? []), ...(p.aliases ?? [])])];
      await db.products.put({
        ...p,
        id: existing.id,
        rank: Math.max(p.rank, existing.rank),
        verified: p.verified || existing.verified,
        ...(aliases.length > 0 ? { aliases } : {}),
        ...(existing.editedAt != null || p.editedAt != null
          ? { editedAt: Math.max(existing.editedAt ?? 0, p.editedAt ?? 0) }
          : {}),
      });
      result.products += 1;
    }
    for (const item of recipes) {
      if (!item) continue;
      const r = item.recipe;
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
