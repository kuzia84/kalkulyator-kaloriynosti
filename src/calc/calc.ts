import { parseWeight } from './parse';
import { ZERO_NUTRIENTS, type Nutrients } from './types';

/** Входные данные строки: значения на 100 г и вес в том виде, в каком его ввёл пользователь. */
export interface RowInput {
  per100?: Nutrients | null;
  weight: string;
}

/**
 * `x × num / den`. Сначала умножение, потом деление: 25 × 58 / 100 даёт ровно 14,5,
 * а 25 × 0,58 даёт 14,499999999999998.
 */
function ratio(n: Nutrients, num: number, den: number): Nutrients {
  return {
    kcal: (n.kcal * num) / den,
    protein: (n.protein * num) / den,
    fat: (n.fat * num) / den,
    carbs: (n.carbs * num) / den,
  };
}

function add(a: Nutrients, b: Nutrients): Nutrients {
  return {
    kcal: a.kcal + b.kcal,
    protein: a.protein + b.protein,
    fat: a.fat + b.fat,
    carbs: a.carbs + b.carbs,
  };
}

/** Значения строки: `x_строки = x_на_100 × вес / 100`. Нет продукта или веса — `null`. */
export function rowNutrients(row: RowInput): Nutrients | null {
  const weight = parseWeight(row.weight);
  if (!row.per100 || weight == null) return null;
  return ratio(row.per100, weight, 100);
}

export interface Totals {
  weight: number;
  nutrients: Nutrients;
}

/**
 * Итоги: суммы весов и пищевой ценности по строкам.
 * В сумму входят только строки с продуктом и весом. Вес строки без продукта не учитывается:
 * иначе знаменатель «на 100 г» включал бы вес без калорий, и значения занижались бы.
 */
export function totals(rows: readonly RowInput[]): Totals {
  let weight = 0;
  let nutrients: Nutrients = { ...ZERO_NUTRIENTS };
  for (const row of rows) {
    const w = parseWeight(row.weight);
    if (w == null || !row.per100) continue;
    weight += w;
    nutrients = add(nutrients, ratio(row.per100, w, 100));
  }
  return { weight, nutrients };
}

/**
 * Значения на 100 г при заданном весе: `x_итого / вес × 100`.
 * Вес равен нулю, пуст или не число — `null`, в ячейке «—».
 */
export function per100(total: Nutrients, weight: number | null): Nutrients | null {
  if (weight == null || !Number.isFinite(weight) || weight <= 0) return null;
  return ratio(total, 100, weight);
}

/** Значения на 100 г готового блюда по значению поля «вес готового блюда». */
export function per100Cooked(total: Nutrients, cookedWeightInput: string): Nutrients | null {
  return per100(total, parseWeight(cookedWeightInput));
}

/**
 * Вес блюда для расчёта порции. Поле веса готового блюда пусто — берётся сумма весов.
 * Поле заполнено нулём или не числом — веса нет (`null`), как и в строке уварки.
 */
export function dishWeight(totalWeight: number, cookedWeightInput: string): number | null {
  if (cookedWeightInput.trim() !== '') {
    const cooked = parseWeight(cookedWeightInput);
    return cooked != null && cooked > 0 ? cooked : null;
  }
  return totalWeight > 0 ? totalWeight : null;
}

/** Значения порции: `x_итого × вес_порции / вес_блюда`. */
export function portion(
  total: Nutrients,
  dishWeightValue: number | null,
  portionWeightInput: string,
): Nutrients | null {
  const portionWeight = parseWeight(portionWeightInput);
  if (dishWeightValue == null || dishWeightValue <= 0 || portionWeight == null) return null;
  return ratio(total, portionWeight, dishWeightValue);
}

/** Вес готового блюда больше суммы весов: крупы и макароны впитывают воду. */
export function isCookedHeavier(totalWeight: number, cookedWeightInput: string): boolean {
  const cooked = parseWeight(cookedWeightInput);
  return cooked != null && totalWeight > 0 && cooked > totalWeight;
}

/** Коэффициенты формулы проверки, ккал на 1 г. */
export const ATWATER = { protein: 4, fat: 9, carbs: 4 } as const;

/** Расчётная калорийность по формуле `Б × 4 + Ж × 9 + У × 4`. Только для проверки записей. */
export function atwaterKcal(n: Pick<Nutrients, 'protein' | 'fat' | 'carbs'>): number {
  return n.protein * ATWATER.protein + n.fat * ATWATER.fat + n.carbs * ATWATER.carbs;
}

export const SUSPICIOUS_THRESHOLD = 0.15;
/**
 * Разница меньше 5 ккал не считается подозрительной: у малокалорийных продуктов
 * (чай, зелень) значения в источниках округлены, и относительное отклонение велико.
 */
export const SUSPICIOUS_MIN_KCAL_DIFF = 5;

/**
 * Относительное отклонение заявленной калорийности от формулы проверки:
 * `|ккал − формула| / формула`. Если формула даёт 0, отклонение 0 только при 0 ккал.
 */
export function kcalDeviation(n: Nutrients): number {
  const expected = atwaterKcal(n);
  if (expected === 0) return n.kcal === 0 ? 0 : Number.POSITIVE_INFINITY;
  return Math.abs(n.kcal - expected) / expected;
}

export function isSuspicious(n: Nutrients, threshold = SUSPICIOUS_THRESHOLD): boolean {
  return (
    kcalDeviation(n) > threshold && Math.abs(n.kcal - atwaterKcal(n)) >= SUSPICIOUS_MIN_KCAL_DIFF
  );
}

/** Доли белков, жиров и углеводов в калорийности по формуле проверки, в процентах. */
export function macroEnergyShare(
  n: Nutrients,
): { protein: number; fat: number; carbs: number } | null {
  const sum = atwaterKcal(n);
  if (sum <= 0) return null;
  return {
    protein: ((n.protein * ATWATER.protein) / sum) * 100,
    fat: ((n.fat * ATWATER.fat) / sum) * 100,
    carbs: ((n.carbs * ATWATER.carbs) / sum) * 100,
  };
}
