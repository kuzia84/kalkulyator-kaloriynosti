import type { Nutrients } from '../calc';
import { db as defaultDb, type AppDB } from '../storage/db';
import type { Product, ProductSource } from '../storage/schema';
import { normalizeBarcode, normalizeName, normalizeQuery } from './normalize';

/** Порядок подсказок: ранг по убыванию, затем недавно использованные, затем по алфавиту. */
export function compareByPopularity(a: Product, b: Product): number {
  if (b.rank !== a.rank) return b.rank - a.rank;
  const la = a.lastUsedAt ?? 0;
  const lb = b.lastUsedAt ?? 0;
  if (lb !== la) return lb - la;
  return a.name.localeCompare(b.name, 'ru');
}

/**
 * Поиск в справочнике по началу названия. Регистр не учитывается, «е» и «ё» — одна буква.
 * Пустой запрос ничего не находит: список подсказок открывается после первой буквы.
 */
export async function searchLocal(
  query: string,
  limit = 20,
  db: AppDB = defaultDb,
): Promise<Product[]> {
  const q = normalizeQuery(query);
  if (q.trim() === '') return [];
  const found = await db.products.where('nameNorm').startsWith(q).toArray();
  return found.sort(compareByPopularity).slice(0, limit);
}

export async function findByBarcode(
  code: string,
  db: AppDB = defaultDb,
): Promise<Product | undefined> {
  const normalized = normalizeBarcode(code);
  if (!normalized) return undefined;
  const found = await db.products.where('barcode').equals(normalized).toArray();
  return found.sort(compareByPopularity)[0];
}

export interface NewProduct extends Nutrients {
  name: string;
  source: ProductSource;
  barcode?: string;
  externalId?: string;
}

export function newId(): string {
  return crypto.randomUUID();
}

export function makeProduct(input: NewProduct): Product {
  const barcode = input.barcode ? normalizeBarcode(input.barcode) : undefined;
  return {
    id: newId(),
    name: input.name.trim(),
    nameNorm: normalizeName(input.name),
    kcal: input.kcal,
    protein: input.protein,
    fat: input.fat,
    carbs: input.carbs,
    source: input.source,
    rank: 0,
    verified: false,
    ...(barcode ? { barcode } : {}),
    ...(input.externalId ? { externalId: input.externalId } : {}),
  };
}

/** Увеличивает ранг продукта и обновляет дату последнего использования. */
export async function markUsed(id: string, db: AppDB = defaultDb, now = Date.now()): Promise<void> {
  await db.products
    .where('id')
    .equals(id)
    .modify((p) => {
      p.rank += 1;
      p.lastUsedAt = now;
    });
}

/**
 * Фиксирует использование продукта в блюде.
 * Продукт из справочника получает +1 к рангу. Новый продукт (внешний или ручной) добавляется
 * в справочник. Если такой внешний продукт уже есть (тот же источник и externalId или штрихкод),
 * новая запись не создаётся.
 * Возвращает id записи справочника.
 */
export async function commitUsage(
  input: NewProduct & { productId?: string },
  db: AppDB = defaultDb,
  now = Date.now(),
): Promise<string> {
  return db.transaction('rw', db.products, async () => {
    if (input.productId) {
      const existing = await db.products.get(input.productId);
      if (existing) {
        await markUsed(existing.id, db, now);
        return existing.id;
      }
    }
    const duplicate = await findDuplicate(input, db);
    if (duplicate) {
      await markUsed(duplicate.id, db, now);
      return duplicate.id;
    }
    const product = { ...makeProduct(input), rank: 1, lastUsedAt: now };
    await db.products.add(product);
    return product.id;
  });
}

async function findDuplicate(input: NewProduct, db: AppDB): Promise<Product | undefined> {
  if (input.externalId) {
    const byExternal = await db.products.where('externalId').equals(input.externalId).first();
    if (byExternal && byExternal.source === input.source) return byExternal;
  }
  if (input.barcode) {
    const byBarcode = await findByBarcode(input.barcode, db);
    if (byBarcode) return byBarcode;
  }
  // Ручной ввод: то же название и те же значения — это та же запись.
  const sameName = await db.products.where('nameNorm').equals(normalizeName(input.name)).toArray();
  return sameName.find(
    (p) =>
      p.kcal === input.kcal &&
      p.protein === input.protein &&
      p.fat === input.fat &&
      p.carbs === input.carbs,
  );
}
