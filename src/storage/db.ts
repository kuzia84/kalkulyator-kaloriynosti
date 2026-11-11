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
      products: 'id, nameNorm, barcode, source, rank, externalId',
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

export function seedProducts(): Product[] {
  return SEED.map((entry) => ({
    ...entry,
    nameNorm: normalizeName(entry.name),
    source: 'skurikhin' as const,
    rank: 0,
    verified: false,
  }));
}

/**
 * Обновляет стартовый набор в существующей базе, если в коде вышла новая версия набора.
 * - Новые записи добавляются.
 * - Записи, которые модератор не проверял, получают исправленные значения. Ранг сохраняется.
 * - Записи, которые модератор проверил или удалил, не трогаются.
 */
export async function syncSeed(db: AppDB): Promise<void> {
  await db.transaction('rw', db.products, db.meta, async () => {
    const meta = await db.meta.get('seed');
    if (meta && meta.version >= SEED_VERSION) return;
    const deleted = new Set(meta?.deletedIds ?? []);
    for (const seed of seedProducts()) {
      if (deleted.has(seed.id)) continue;
      const existing = await db.products.get(seed.id);
      if (!existing) {
        await db.products.add(seed);
      } else if (!existing.verified) {
        await db.products.update(seed.id, {
          name: seed.name,
          nameNorm: seed.nameNorm,
          kcal: seed.kcal,
          protein: seed.protein,
          fat: seed.fat,
          carbs: seed.carbs,
        });
      }
    }
    await db.meta.put({ id: 'seed', version: SEED_VERSION, deletedIds: [...deleted] });
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

export const db = new AppDB();
