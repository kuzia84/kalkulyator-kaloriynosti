import Dexie, { type Table } from 'dexie';
import { SEED } from '../catalog/seed';
import { normalizeName } from '../catalog/normalize';
import type { DraftRecord, Dish, Product, SearchCacheRecord, SettingsRecord } from './schema';

export const SCHEMA_VERSION = 1;

export class AppDB extends Dexie {
  products!: Table<Product, string>;
  drafts!: Table<DraftRecord, string>;
  recipes!: Table<Dish, string>;
  settings!: Table<SettingsRecord, string>;
  searchCache!: Table<SearchCacheRecord, string>;

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
    });
    this.on('populate', (tx) => tx.table<Product, string>('products').bulkAdd(seedProducts()));
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

export const db = new AppDB();
