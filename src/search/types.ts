import type { Nutrients } from '../calc';
import type { ExternalProductRecord, Product, ProductSource } from '../storage/schema';

/** Пункт списка подсказок: продукт из справочника или из внешнего источника. */
export interface Suggestion extends Nutrients {
  key: string;
  name: string;
  source: ProductSource;
  /** Есть только у продуктов из справочника. */
  productId?: string;
  barcode?: string;
  externalId?: string;
  /** Подпись под названием: бренд, фасовка. */
  detail?: string;
  /** Продукт пришёл из внешнего источника и ещё не в справочнике. */
  external: boolean;
  /** Внешние id, объединённые модератором в эту запись. */
  aliases?: string[];
}

export function suggestionFromProduct(p: Product): Suggestion {
  return {
    key: `local:${p.id}`,
    name: p.name,
    kcal: p.kcal,
    protein: p.protein,
    fat: p.fat,
    carbs: p.carbs,
    source: p.source,
    productId: p.id,
    external: false,
    ...(p.barcode ? { barcode: p.barcode } : {}),
    ...(p.externalId ? { externalId: p.externalId } : {}),
    ...(p.aliases?.length ? { aliases: p.aliases } : {}),
  };
}

export function suggestionFromExternal(p: ExternalProductRecord): Suggestion {
  return {
    key: p.externalId,
    name: p.name,
    kcal: p.kcal,
    protein: p.protein,
    fat: p.fat,
    carbs: p.carbs,
    source: p.source,
    externalId: p.externalId,
    external: true,
    ...(p.barcode ? { barcode: p.barcode } : {}),
    ...(p.detail ? { detail: p.detail } : {}),
  };
}
