import { isSuspicious } from '../calc';
import { db as defaultDb, rememberDeletedSeed, forgetDeletedSeed, type AppDB } from '../storage/db';
import type { Product, ProductSource } from '../storage/schema';
import { validateProduct } from './catalog';
import { normalizeBarcode, normalizeName } from './normalize';

export interface ProductPatch {
  name?: string;
  kcal?: number;
  protein?: number;
  fat?: number;
  carbs?: number;
  barcode?: string;
  verified?: boolean;
}

/** Правит запись справочника. Сохранённые блюда хранят свою копию значений и не меняются. */
export async function updateProduct(
  id: string,
  patch: ProductPatch,
  db: AppDB = defaultDb,
): Promise<Product> {
  return db.transaction('rw', db.products, async () => {
    const current = await db.products.get(id);
    if (!current) throw new Error('Запись не найдена: её удалили.');
    const next: Product = { ...current };
    if (patch.name != null) {
      next.name = patch.name.trim().replace(/\s+/g, ' ');
      next.nameNorm = normalizeName(patch.name);
    }
    for (const key of ['kcal', 'protein', 'fat', 'carbs'] as const) {
      const v = patch[key];
      if (v != null) next[key] = v;
    }
    if (patch.barcode !== undefined) {
      const code = normalizeBarcode(patch.barcode);
      if (code) next.barcode = code;
      else delete next.barcode;
    }
    if (patch.verified != null) next.verified = patch.verified;
    validateProduct(next);
    await db.products.put(next);
    return next;
  });
}

/** Удаляет запись и возвращает её копию для отмены. */
export async function deleteProduct(id: string, db: AppDB = defaultDb): Promise<Product | null> {
  const removed = await db.transaction('rw', db.products, db.meta, async () => {
    const current = await db.products.get(id);
    if (!current) return null;
    await db.products.delete(id);
    await rememberDeletedSeed(db, id);
    return current;
  });
  return removed;
}

/** Возвращает удалённые записи (отмена удаления или объединения). */
export async function restoreProducts(products: Product[], db: AppDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.products, db.meta, async () => {
    await db.products.bulkPut(products);
    for (const p of products) await forgetDeletedSeed(db, p.id);
  });
}

export interface MergeResult {
  /** Запись цели до объединения: нужна для отмены. */
  targetBefore: Product;
  /** Удалённые дубликаты: нужны для отмены. */
  removed: Product[];
  target: Product;
}

/**
 * Объединяет дубликаты в одну запись `targetId`.
 * Значения берутся у цели. Ранги складываются, дата использования — самая поздняя.
 * Штрихкод цели сохраняется, а если его нет — берётся у первого дубликата, у которого он есть.
 */
export async function mergeProducts(
  targetId: string,
  duplicateIds: string[],
  db: AppDB = defaultDb,
): Promise<MergeResult> {
  return db.transaction('rw', db.products, db.meta, async () => {
    const target = await db.products.get(targetId);
    if (!target) throw new Error('Основная запись не найдена.');
    const ids = duplicateIds.filter((id) => id !== targetId);
    const found = await db.products.bulkGet(ids);
    const removed = found.filter((p): p is Product => p != null);
    const next: Product = { ...target };
    for (const dup of removed) {
      next.rank += dup.rank;
      if ((dup.lastUsedAt ?? 0) > (next.lastUsedAt ?? 0)) next.lastUsedAt = dup.lastUsedAt;
      if (!next.barcode && dup.barcode) next.barcode = dup.barcode;
    }
    await db.products.put(next);
    await db.products.bulkDelete(removed.map((p) => p.id));
    for (const p of removed) await rememberDeletedSeed(db, p.id);
    return { targetBefore: target, removed, target: next };
  });
}

export type SortKey = 'name' | 'kcal' | 'protein' | 'fat' | 'carbs' | 'rank' | 'lastUsedAt';
export type SortDir = 'asc' | 'desc';

export interface ProductFilter {
  query: string;
  source: ProductSource | 'all';
  verified: 'all' | 'yes' | 'no';
  suspiciousOnly: boolean;
}

/** Фильтр и сортировка для таблицы модерации. Поиск — по вхождению в название, не только по началу. */
export function filterProducts(
  products: Product[],
  filter: ProductFilter,
  sort: { key: SortKey; dir: SortDir },
): Product[] {
  const q = normalizeName(filter.query);
  const result = products.filter(
    (p) =>
      (q === '' || p.nameNorm.includes(q) || (p.barcode ?? '').includes(q)) &&
      (filter.source === 'all' || p.source === filter.source) &&
      (filter.verified === 'all' || p.verified === (filter.verified === 'yes')) &&
      (!filter.suspiciousOnly || isSuspicious(p)),
  );
  const sign = sort.dir === 'asc' ? 1 : -1;
  result.sort((a, b) => {
    if (sort.key === 'name') return sign * a.name.localeCompare(b.name, 'ru');
    const av = a[sort.key] ?? 0;
    const bv = b[sort.key] ?? 0;
    return sign * (av - bv) || a.name.localeCompare(b.name, 'ru');
  });
  return result;
}
