import { parseWeight } from './parse';
import { ZERO_NUTRIENTS, type Nutrients } from './types';

/** Входные данные строки: значения на 100 г и вес в том виде, в каком его ввёл пользователь. */
export interface RowInput {
  per100?: Nutrients | null;
  weight: string;
}

function scale(n: Nutrients, factor: number): Nutrients {
  return {
    kcal: n.kcal * factor,
    protein: n.protein * factor,
    fat: n.fat * factor,
    carbs: n.carbs * factor,
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
  return scale(row.per100, weight / 100);
}

export interface Totals {
  weight: number;
  nutrients: Nutrients;
}

/**
 * Итоги: суммы весов и пищевой ценности по строкам.
 * Вес строки без продукта тоже входит в общий вес: так пользователь видит,
 * сколько всего продуктов положено в блюдо.
 */
export function totals(rows: readonly RowInput[]): Totals {
  let weight = 0;
  let nutrients: Nutrients = { ...ZERO_NUTRIENTS };
  for (const row of rows) {
    const w = parseWeight(row.weight);
    if (w == null) continue;
    weight += w;
    const n = rowNutrients(row);
    if (n) nutrients = add(nutrients, n);
  }
  return { weight, nutrients };
}

/**
 * Значения на 100 г при заданном весе: `x_итого / вес × 100`.
 * Вес равен нулю, пуст или не число — `null`, в ячейке «—».
 */
export function per100(total: Nutrients, weight: number | null): Nutrients | null {
  if (weight == null || !Number.isFinite(weight) || weight <= 0) return null;
  return scale(total, 100 / weight);
}

/** Значения на 100 г готового блюда по значению поля «вес готового блюда». */
export function per100Cooked(total: Nutrients, cookedWeightInput: string): Nutrients | null {
  return per100(total, parseWeight(cookedWeightInput));
}

/** Вес блюда для расчёта порции: вес готового блюда, а если он не задан — сумма весов. */
export function dishWeight(totalWeight: number, cookedWeightInput: string): number | null {
  const cooked = parseWeight(cookedWeightInput);
  if (cooked != null && cooked > 0) return cooked;
  return totalWeight > 0 ? totalWeight : null;
}

/** Значения порции: `x_итого / вес_блюда × вес_порции`. */
export function portion(
  total: Nutrients,
  dishWeightValue: number | null,
  portionWeightInput: string,
): Nutrients | null {
  const portionWeight = parseWeight(portionWeightInput);
  const base = per100(total, dishWeightValue);
  if (!base || portionWeight == null) return null;
  return scale(base, portionWeight / 100);
}

/** Вес готового блюда больше суммы весов: крупы и макароны впитывают воду. */
export function isCookedHeavier(totalWeight: number, cookedWeightInput: string): boolean {
  const cooked = parseWeight(cookedWeightInput);
  return cooked != null && totalWeight > 0 && cooked > totalWeight;
}

/** Расчётная калорийность по формуле `Б × 4 + Ж × 9 + У × 4`. Только для проверки записей. */
export function atwaterKcal(n: Pick<Nutrients, 'protein' | 'fat' | 'carbs'>): number {
  return n.protein * 4 + n.fat * 9 + n.carbs * 4;
}

export const SUSPICIOUS_THRESHOLD = 0.15;

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
  return kcalDeviation(n) > threshold;
}

/** Доли белков, жиров и углеводов в калорийности по формуле проверки, в процентах. */
export function macroEnergyShare(
  n: Nutrients,
): { protein: number; fat: number; carbs: number } | null {
  const p = n.protein * 4;
  const f = n.fat * 9;
  const c = n.carbs * 4;
  const sum = p + f + c;
  if (sum <= 0) return null;
  return { protein: (p / sum) * 100, fat: (f / sum) * 100, carbs: (c / sum) * 100 };
}
