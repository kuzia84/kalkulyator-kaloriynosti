import Dexie, { type Table } from 'dexie';
import { SEED, SEED_VERSION } from '../catalog/seed';
import { normalizeName } from '../catalog/normalize';
import type {
  DraftRecord,
  Dish,
  MetaRecord,
  Product,
  SearchCacheRecord,
  SettingsRecord,
} from './schema';

export const SCHEMA_VERSION = 1;

export class AppDB extends Dexie {
  products!: Table<Product, string>;
  drafts!: Table<DraftRecord, string>;
  recipes!: Table<Dish, string>;
  settings!: Table<SettingsRecord, string>;
  searchCache!: Table<SearchCacheRecord, string>;
  meta!: Table<MetaRecord, string>;

  constructor(name = 'kalkulyator-kaloriynosti') {
    super(name);
    // Новая версия схемы: db.version(2).stores({...}).upgrade(tx => ...).
    // Dexie сам хранит номер версии и запускает upgrade для старых баз.
    this.version(SCHEMA_VERSION).stores({
      products: 'id, nameNorm, barcode, source, rank, externalId, *aliases',
      drafts: 'id',
      recipes: 'id, updatedAt',
      settings: 'id',
      searchCache: 'key, createdAt',
      meta: 'id',
    });
    // Каждое открытие базы доводит стартовый набор до текущей версии SEED_VERSION.
    // Третий аргумент true: обработчик срабатывает при каждом открытии, а не только при первом.
    this.on('ready', (db) => syncSeed(db as AppDB), true);
  }
}

const SEED_IDS = new Set(SEED.map((s) => s.id));

export function seedProducts(): Product[] {
  return SEED.map((entry) => ({
    ...entry,
    nameNorm: normalizeName(entry.name),
    rank: 0,
    verified: false,
  }));
}

/** Насколько может отличаться калорийность продукта с тем же названием, чтобы считать его той же записью. */
const TWIN_KCAL_TOLERANCE = 0.15;

/** Что уже есть в базе: по этим данным новая запись набора проверяется на дубль. */
interface Known {
  kcalByName: Map<string, number[]>;
  keys: Set<string>;
}

function collectKnown(products: Product[]): Known {
  const kcalByName = new Map<string, number[]>();
  const keys = new Set<string>();
  for (const p of products) {
    const list = kcalByName.get(p.nameNorm) ?? [];
    list.push(p.kcal);
    kcalByName.set(p.nameNorm, list);
    if (p.externalId) keys.add(p.externalId);
    for (const alias of p.aliases ?? []) keys.add(alias);
  }
  return { kcalByName, keys };
}

/**
 * Есть ли в базе другой продукт, который уже описывает эту запись набора:
 * - та же запись USDA или эта запись среди объединённых модератором;
 * - то же название и близкая калорийность. Продукт с тем же названием, но другими значениями
 *   (например, кетчуп одной марки) дублем не считается: справочная запись нужна рядом с ним.
 */
function hasTwin(known: Known, seed: Product): boolean {
  if (known.keys.has(seed.id)) return true;
  if (seed.externalId && known.keys.has(seed.externalId)) return true;
  const kcals = known.kcalByName.get(seed.nameNorm) ?? [];
  return kcals.some(
    (kcal) => Math.abs(kcal - seed.kcal) <= TWIN_KCAL_TOLERANCE * Math.max(seed.kcal, 1),
  );
}

/**
 * Обновляет стартовый набор в существующей базе, если в коде вышла новая версия набора.
 * - В новую базу набор кладётся целиком.
 * - Новые записи добавляются. Запись не добавляется, если в базе уже есть такой продукт:
 *   пользователь добавил его сам или из сети (см. hasTwin). Иначе в подсказках появился бы дубль.
 * - Записи, которые модератор не проверял и не правил, получают исправленные значения,
 *   источник и externalId. Ранг сохраняется.
 * - Записи, которые модератор проверил, правил или удалил, не трогаются.
 */
export async function syncSeed(db: AppDB): Promise<void> {
  await db.transaction('rw', db.products, db.meta, async () => {
    const meta = await db.meta.get('seed');
    if (meta && meta.version >= SEED_VERSION) return;
    const seeds = seedProducts();
    if (!meta && (await db.products.count()) === 0) {
      await db.products.bulkAdd(seeds);
    } else {
      const deleted = new Set(meta?.deletedIds ?? []);
      const products = await db.products.toArray();
      const byId = new Map(products.map((p) => [p.id, p]));
      const known = collectKnown(products.filter((p) => !SEED_IDS.has(p.id)));
      for (const seed of seeds) {
        if (deleted.has(seed.id)) continue;
        const existing = byId.get(seed.id);
        if (!existing) {
          if (!hasTwin(known, seed)) await db.products.add(seed);
        } else if (!existing.verified && existing.editedAt == null) {
          await db.products.update(seed.id, {
            name: seed.name,
            nameNorm: seed.nameNorm,
            source: seed.source,
            // undefined удаляет поле: у записи Скурихина externalId нет.
            externalId: seed.externalId,
            kcal: seed.kcal,
            protein: seed.protein,
            fat: seed.fat,
            carbs: seed.carbs,
          });
        }
      }
    }
    await db.meta.put({ id: 'seed', version: SEED_VERSION, deletedIds: meta?.deletedIds ?? [] });
  });
}

/** Запоминает удаление записи стартового набора, чтобы обновление набора её не вернуло. */
export async function rememberDeletedSeed(db: AppDB, productId: string): Promise<void> {
  if (!SEED.some((s) => s.id === productId)) return;
  await db.transaction('rw', db.meta, async () => {
    const meta = (await db.meta.get('seed')) ?? {
      id: 'seed',
      version: SEED_VERSION,
      deletedIds: [],
    };
    if (!meta.deletedIds.includes(productId)) meta.deletedIds.push(productId);
    await db.meta.put(meta);
  });
}

/** Снимает отметку об удалении записи набора: модератор отменил удаление. */
export async function forgetDeletedSeed(db: AppDB, productId: string): Promise<void> {
  await db.transaction('rw', db.meta, async () => {
    const meta = await db.meta.get('seed');
    if (!meta || !meta.deletedIds.includes(productId)) return;
    meta.deletedIds = meta.deletedIds.filter((id) => id !== productId);
    await db.meta.put(meta);
  });
}

export const db = new AppDB();
