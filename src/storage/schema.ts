import type { Nutrients } from '../calc';

export type ProductSource = 'skurikhin' | 'off' | 'usda' | 'user';

export const SOURCE_LABELS: Record<ProductSource, string> = {
  skurikhin: 'Скурихин',
  off: 'Open Food Facts',
  usda: 'USDA',
  user: 'Вручную',
};

/** Запись справочника. Значения на 100 г сырого съедобного продукта. */
export interface Product extends Nutrients {
  id: string;
  name: string;
  /** Нижний регистр, «ё» → «е», без лишних пробелов. Индекс для поиска по началу названия. */
  nameNorm: string;
  barcode?: string;
  source: ProductSource;
  rank: number;
  lastUsedAt?: number;
  verified: boolean;
  /** Идентификатор записи во внешнем источнике, чтобы не плодить дубликаты. */
  externalId?: string;
}

/** Строка блюда. Значения продукта скопированы: правки справочника блюдо не меняют. */
export interface DishRow {
  id: string;
  productId?: string;
  name: string;
  /** Вес как ввёл пользователь: «150», «12,5», ''. */
  weight: string;
  per100?: Nutrients;
  source?: ProductSource;
  barcode?: string;
  externalId?: string;
  /** Метка выбора продукта: новая при каждом выборе. Связывает ответ справочника с выбором. */
  pickId?: string;
  /** Продукт строки уже записан в справочник (ранг учтён). Сбрасывается при смене продукта. */
  committed?: boolean;
}

export interface Dish {
  id: string;
  name: string;
  rows: DishRow[];
  cookedWeight: string;
  portionWeight: string;
  note: string;
  createdAt: number;
  updatedAt: number;
}

export type ExternalSource = 'off' | 'usda';
export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
  /** Сколько подсказок загружать в список (видно 5, остальные — прокруткой). */
  suggestionsLimit: number;
  sourcesOrder: ExternalSource[];
  /** Источник выключен, если его нет в этом списке. */
  enabledSources: ExternalSource[];
  usdaApiKey: string;
  theme: Theme;
}

export const DEFAULT_SETTINGS: Settings = {
  suggestionsLimit: 20,
  sourcesOrder: ['off', 'usda'],
  enabledSources: ['off', 'usda'],
  usdaApiKey: '',
  theme: 'system',
};

export interface SettingsRecord extends Settings {
  id: 'app';
}

export interface DraftRecord extends Dish {
  /** Черновик один: id всегда 'current'. Поле `recipeId` связывает черновик с открытым рецептом. */
  recipeId?: string;
}

/** Продукт из внешнего источника в кэше поиска. Значения на 100 г. */
export interface ExternalProductRecord extends Nutrients {
  source: ExternalSource;
  externalId: string;
  name: string;
  barcode?: string;
  detail?: string;
}

export interface SearchCacheRecord {
  key: string;
  createdAt: number;
  products: ExternalProductRecord[];
}

/** Служебные данные. Запись 'seed' хранит версию стартового набора и удалённые записи набора. */
export interface MetaRecord {
  id: 'seed';
  version: number;
  deletedIds: string[];
}
