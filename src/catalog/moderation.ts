import { isSuspicious } from '../calc';
import { db as defaultDb, forgetDeletedSeed, rememberDeletedSeed, type AppDB } from '../storage/db';
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

export class ModerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModerationError';
  }
}

/**
 * Правит запись справочника. Сохранённые блюда хранят свою копию значений и не меняются.
 * Правка названия или значений ставит `editedAt`: обновление стартового набора такую запись
 * больше не трогает.
 */
export async function updateProduct(
  id: string,
  patch: ProductPatch,
  db: AppDB = defaultDb,
  now = Date.now(),
): Promise<Product> {
  return db.transaction('rw', db.products, async () => {
    const current = await db.products.get(id);
    if (!current) throw new ModerationError('Запись не найдена: её удалили.');
    const next: Product = { ...current };
    let edited = false;
    if (patch.name != null && patch.name.trim() !== current.name) {
      next.name = patch.name.trim().replace(/\s+/g, ' ');
      next.nameNorm = normalizeName(patch.name);
      edited = true;
    }
    for (const key of ['kcal', 'protein', 'fat', 'carbs'] as const) {
      const v = patch[key];
      if (v != null && v !== current[key]) {
        next[key] = v;
        edited = true;
      }
    }
    if (patch.barcode !== undefined) {
      const code = normalizeBarcode(patch.barcode);
      if (code && code !== current.barcode) {
        const owner = await db.products
          .where('barcode')
          .equals(code)
          .filter((p) => p.id !== id)
          .first();
        if (owner) {
          throw new ModerationError(
            `Штрихкод ${code} уже есть у «${owner.name}». Объедините записи, если это один продукт.`,
          );
        }
      }
      if (code) next.barcode = code;
      else delete next.barcode;
    }
    if (patch.verified != null) next.verified = patch.verified;
    if (edited) next.editedAt = now;
    validateProduct(next);
    await db.products.put(next);
    return next;
  });
}

/** Удаляет запись и возвращает её копию для отмены. */
export async function deleteProduct(id: string, db: AppDB = defaultDb): Promise<Product | null> {
  return db.transaction('rw', db.products, db.meta, async () => {
    const current = await db.products.get(id);
    if (!current) return null;
    await db.products.delete(id);
    await rememberDeletedSeed(db, id);
    return current;
  });
}

/** Возвращает удалённые записи (отмена удаления). */
export async function restoreProducts(products: Product[], db: AppDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.products, db.meta, async () => {
    await db.products.bulkPut(products);
    for (const p of products) await forgetDeletedSeed(db, p.id);
  });
}

export interface MergeResult {
  target: Product;
  /** Удалённые дубликаты: нужны для отмены. */
  removed: Product[];
  /** Что объединение добавило к цели. Отмена вычитает именно это, а не возвращает старую копию. */
  delta: {
    rank: number;
    aliases: string[];
    barcode?: string;
    verified: boolean;
    lastUsedBefore?: number;
    lastUsedAfter?: number;
  };
}

/**
 * Объединяет дубликаты в одну запись `targetId`.
 * - Название и значения берутся у цели. Ранги складываются, дата использования — самая поздняя.
 * - Штрихкод цели сохраняется. Если его нет — берётся у первого дубликата со штрихкодом.
 * - Цель получает признак «проверено», если он был у любого дубликата.
 * - id и externalId дубликатов становятся псевдонимами цели: блюда и внешний поиск со старыми
 *   ссылками попадают в цель, и дубликат не появляется снова.
 */
export async function mergeProducts(
  targetId: string,
  duplicateIds: string[],
  db: AppDB = defaultDb,
): Promise<MergeResult> {
  return db.transaction('rw', db.products, db.meta, async () => {
    const target = await db.products.get(targetId);
    if (!target) throw new ModerationError('Основная запись не найдена.');
    const ids = duplicateIds.filter((id) => id !== targetId);
    const found = await db.products.bulkGet(ids);
    const removed = found.filter((p): p is Product => p != null);
    const next: Product = { ...target, aliases: [...(target.aliases ?? [])] };
    const delta: MergeResult['delta'] = { rank: 0, aliases: [], verified: false };
    const addAlias = (alias: string | undefined) => {
      if (alias && !next.aliases!.includes(alias) && alias !== next.externalId) {
        next.aliases!.push(alias);
        delta.aliases.push(alias);
      }
    };
    for (const dup of removed) {
      next.rank += dup.rank;
      delta.rank += dup.rank;
      if ((dup.lastUsedAt ?? 0) > (next.lastUsedAt ?? 0)) {
        delta.lastUsedBefore ??= target.lastUsedAt;
        next.lastUsedAt = dup.lastUsedAt;
        delta.lastUsedAfter = dup.lastUsedAt;
      }
      if (!next.barcode && dup.barcode) {
        next.barcode = dup.barcode;
        delta.barcode = dup.barcode;
      }
      if (dup.verified && !next.verified) {
        next.verified = true;
        delta.verified = true;
      }
      addAlias(dup.id);
      addAlias(dup.externalId);
      for (const a of dup.aliases ?? []) addAlias(a);
    }
    await db.products.put(next);
    await db.products.bulkDelete(removed.map((p) => p.id));
    for (const p of removed) await rememberDeletedSeed(db, p.id);
    return { target: next, removed, delta };
  });
}

/**
 * Отменяет объединение: возвращает дубликаты и вычитает из цели то, что добавило объединение.
 * Правки цели, сделанные после объединения (ранг, «проверено», значения), сохраняются.
 */
export async function unmergeProducts(result: MergeResult, db: AppDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.products, db.meta, async () => {
    const current = await db.products.get(result.target.id);
    if (current) {
      const next: Product = { ...current };
      next.rank = Math.max(0, current.rank - result.delta.rank);
      const added = new Set(result.delta.aliases);
      const aliases = (current.aliases ?? []).filter((a) => !added.has(a));
      if (aliases.length > 0) next.aliases = aliases;
      else delete next.aliases;
      if (result.delta.barcode && current.barcode === result.delta.barcode) delete next.barcode;
      if (
        result.delta.verified &&
        current.verified &&
        current.editedAt === result.target.editedAt
      ) {
        next.verified = false;
      }
      if (result.delta.lastUsedAfter != null && current.lastUsedAt === result.delta.lastUsedAfter) {
        if (result.delta.lastUsedBefore != null) next.lastUsedAt = result.delta.lastUsedBefore;
        else delete next.lastUsedAt;
      }
      await db.products.put(next);
    }
    await db.products.bulkPut(result.removed);
    for (const p of result.removed) await forgetDeletedSeed(db, p.id);
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

const collator = new Intl.Collator('ru');

/**
 * Фильтр и сортировка для таблицы модерации.
 * Поиск — по вхождению в название (не только по началу) или по цифрам штрихкода.
 */
export function filterProducts(
  products: Product[],
  filter: ProductFilter,
  sort: { key: SortKey; dir: SortDir },
): Product[] {
  const q = normalizeName(filter.query);
  const digits = normalizeBarcode(filter.query);
  // Штрихкод ищется, только если в запросе одни цифры и разделители.
  const byBarcode = digits.length >= 3 && /^[\d\s-]+$/.test(filter.query.trim());
  const result = products.filter(
    (p) =>
      (q === '' || p.nameNorm.includes(q) || (byBarcode && (p.barcode ?? '').includes(digits))) &&
      (filter.source === 'all' || p.source === filter.source) &&
      (filter.verified === 'all' || p.verified === (filter.verified === 'yes')) &&
      (!filter.suspiciousOnly || isSuspicious(p)),
  );
  const sign = sort.dir === 'asc' ? 1 : -1;
  result.sort((a, b) => {
    if (sort.key === 'name') return sign * collator.compare(a.name, b.name);
    const av = a[sort.key] ?? 0;
    const bv = b[sort.key] ?? 0;
    return sign * (av - bv) || collator.compare(a.name, b.name);
  });
  return result;
}
