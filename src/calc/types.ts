/** Пищевая ценность. Для продукта — на 100 г, для строки и итогов — на фактический вес. */
export interface Nutrients {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
}

export const NUTRIENT_KEYS = ['kcal', 'protein', 'fat', 'carbs'] as const;
export type NutrientKey = (typeof NUTRIENT_KEYS)[number];

export const ZERO_NUTRIENTS: Readonly<Nutrients> = Object.freeze({
  kcal: 0,
  protein: 0,
  fat: 0,
  carbs: 0,
});
