import { isSuspicious } from '../calc';
import { db as defaultDb, forgetDeletedSeed, rememberDeletedSeed, type AppDB } from '../storage/db';
import type { Product, ProductSource } from '../storage/schema';
import { makeProduct, validateProduct } from './catalog';
import { barcodeVariants } from '../barcode/gtin';
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
      if (code && code !== current.barcode) await assertBarcodeFree(code, id, db);
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

/**
 * Отклоняет штрихкод, который уже есть у другой записи справочника.
 * Сравниваются все записи одного кода: UPC-A и EAN-13, с ведущими нулями и без.
 */
async function assertBarcodeFree(code: string, exceptId: string | null, db: AppDB): Promise<void> {
  const owner = await db.products
    .where('barcode')
    .anyOf(barcodeVariants(code))
    .filter((p) => p.id !== exceptId)
    .first();
  if (owner) {
    throw new ModerationError(
      `Штрихкод ${code} уже есть у «${owner.name}». Измените эту запись или удалите лишнюю.`,
    );
  }
}

/** Запись справочника с этим внешним id: своим или псевдонимом после старого объединения. */
export async function findByExternalId(
  externalId: string,
  db: AppDB = defaultDb,
): Promise<Product | undefined> {
  return (
    (await db.products.where('externalId').equals(externalId).first()) ??
    (await db.products.where('aliases').equals(externalId).first())
  );
}

export interface ManualProduct {
  name: string;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  barcode?: string;
  verified?: boolean;
  /** Откуда взяты значения. По умолчанию «user». Форму могли заполнить из внешнего источника. */
  source?: ProductSource;
  /** id во внешнем источнике: по нему внешний поиск не создаст дубликат. */
  externalId?: string;
}

/**
 * Добавляет продукт в справочник без блюда: вручную или из внешнего источника.
 * Запись получает ранг 0. `editedAt` защищает её от обновления стартового набора.
 */
export async function addProduct(
  input: ManualProduct,
  db: AppDB = defaultDb,
  now = Date.now(),
): Promise<Product> {
  return db.transaction('rw', db.products, async () => {
    const product: Product = {
      ...makeProduct({ ...input, source: input.source ?? 'user' }),
      verified: input.verified ?? false,
      editedAt: now,
    };
    if (product.externalId) {
      const owner = await findByExternalId(product.externalId, db);
      if (owner) throw new ModerationError(`Этот продукт уже есть в справочнике: «${owner.name}».`);
    }
    if (product.barcode) await assertBarcodeFree(product.barcode, null, db);
    await db.products.add(product);
    return product;
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
