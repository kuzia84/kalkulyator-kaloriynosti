import type { Nutrients } from '../calc';
import { newId } from '../lib/id';
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
 * Сколько совпадений читать из базы перед сортировкой по рангу.
 * Запрос из одной буквы в большом справочнике иначе читал бы тысячи записей на каждое нажатие.
 */
const SEARCH_CANDIDATES = 500;

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
  if (q === '') return [];
  const found = await db.products
    .where('nameNorm')
    .startsWith(q)
    .limit(SEARCH_CANDIDATES)
    .toArray();
  return found.sort(compareByPopularity).slice(0, limit);
}

/** Ищет продукт по штрихкоду. Можно передать несколько вариантов записи одного кода. */
export async function findByBarcode(
  code: string | string[],
  db: AppDB = defaultDb,
): Promise<Product | undefined> {
  const codes = (Array.isArray(code) ? code : [code]).map(normalizeBarcode).filter(Boolean);
  if (codes.length === 0) return undefined;
  const found = await db.products.where('barcode').anyOf(codes).toArray();
  // Проверенная модератором запись надёжнее остальных.
  return found.sort(
    (a, b) => Number(b.verified) - Number(a.verified) || compareByPopularity(a, b),
  )[0];
}

export interface NewProduct extends Nutrients {
  name: string;
  source: ProductSource;
  barcode?: string;
  externalId?: string;
}

export class InvalidProductError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidProductError';
  }
}

/** Проверяет запись: название не пустое, значения — конечные неотрицательные числа. */
export function validateProduct(input: Pick<NewProduct, 'name' | keyof Nutrients>): void {
  if (normalizeName(input.name) === '') {
    throw new InvalidProductError('Название продукта не может быть пустым.');
  }
  for (const key of ['kcal', 'protein', 'fat', 'carbs'] as const) {
    const value = input[key];
    if (!Number.isFinite(value) || value < 0) {
      throw new InvalidProductError(`Значение «${key}» должно быть числом не меньше нуля.`);
    }
  }
}

export function makeProduct(input: NewProduct): Product {
  validateProduct(input);
  const barcode = input.barcode ? normalizeBarcode(input.barcode) : undefined;
  return {
    id: newId(),
    name: input.name.trim().replace(/\s+/g, ' '),
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
 * в справочник. Повтор того же продукта не создаёт дубликат.
 * Возвращает id записи справочника.
 */
export async function commitUsage(
  input: NewProduct & { productId?: string },
  db: AppDB = defaultDb,
  now = Date.now(),
): Promise<string> {
  return db.transaction('rw', db.products, async () => {
    if (input.productId) {
      // Запись могли объединить с другой: старый id остаётся псевдонимом.
      const existing =
        (await db.products.get(input.productId)) ??
        (await db.products.where('aliases').equals(input.productId).first());
      if (existing) {
        await markUsed(existing.id, db, now);
        return existing.id;
      }
      // Модератор удалил запись. Блюдо хранит свою копию значений, а в справочник запись
      // не возвращается.
      return input.productId;
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

/**
 * Ищет ту же запись, что `input`, в пределах того же источника:
 * внешний продукт — по externalId или штрихкоду, ручной — по названию и значениям.
 * Записи других источников не считаются дубликатами: у них могут быть другие значения.
 */
async function findDuplicate(input: NewProduct, db: AppDB): Promise<Product | undefined> {
  if (input.externalId) {
    const byExternal = await db.products
      .where('externalId')
      .equals(input.externalId)
      .filter((p) => p.source === input.source)
      .first();
    if (byExternal) return byExternal;
    // Внешний продукт, который модератор объединил с другой записью.
    const merged = await db.products.where('aliases').equals(input.externalId).first();
    if (merged) return merged;
  }
  const barcode = input.barcode ? normalizeBarcode(input.barcode) : '';
  if (barcode) {
    const byBarcode = await db.products
      .where('barcode')
      .equals(barcode)
      .filter((p) => p.source === input.source)
      .first();
    if (byBarcode) return byBarcode;
  }
  if (input.source !== 'user') return undefined;
  return db.products
    .where('nameNorm')
    .equals(normalizeName(input.name))
    .filter(
      (p) =>
        p.source === 'user' &&
        p.kcal === input.kcal &&
        p.protein === input.protein &&
        p.fat === input.fat &&
        p.carbs === input.carbs,
    )
    .first();
}
