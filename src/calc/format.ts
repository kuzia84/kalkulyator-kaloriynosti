import { KCAL_DIGITS, MACRO_DIGITS, roundHalfUp } from './round';
import type { NutrientKey } from './types';

export const EMPTY_CELL = '—';

const fixedFormatters = new Map<number, Intl.NumberFormat>();

function fixedFormatter(digits: number): Intl.NumberFormat {
  let f = fixedFormatters.get(digits);
  if (!f) {
    f = new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    fixedFormatters.set(digits, f);
  }
  return f;
}

const weightFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

/** Форматирует число в русском формате. `null` показывается как «—». */
export function formatNumber(value: number | null | undefined, digits: number): string {
  if (value == null || !Number.isFinite(value)) return EMPTY_CELL;
  return fixedFormatter(digits).format(roundHalfUp(value, digits));
}

export function digitsFor(key: NutrientKey): number {
  return key === 'kcal' ? KCAL_DIGITS : MACRO_DIGITS;
}

export function formatNutrient(key: NutrientKey, value: number | null | undefined): string {
  return formatNumber(value, digitsFor(key));
}

/** Вес: до одного знака после запятой, без лишнего нуля. */
export function formatWeight(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return EMPTY_CELL;
  return weightFormatter.format(roundHalfUp(value, 1));
}

/** Число для поля ввода: русская запятая, без разделителя разрядов. */
export function toInputString(value: number, digits = 1): string {
  return String(roundHalfUp(value, digits)).replace('.', ',');
}
