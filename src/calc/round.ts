/**
 * Округление «0,5 — вверх» (от нуля) до `digits` знаков после запятой.
 *
 * Результат умножения часто приходит как 14,499999999999998 вместо 14,5.
 * Поэтому число сначала приводится к 15 значащим цифрам: это снимает ошибку
 * двоичного представления, но не трогает настоящие значения.
 * Сдвиг запятой идёт через экспоненциальную запись строки, а не умножением на 10^digits.
 */
export function roundHalfUp(value: number, digits = 0): number {
  if (!Number.isFinite(value)) return value;
  const sign = value < 0 ? -1 : 1;
  const abs = Number(Math.abs(value).toPrecision(15));
  const factor = 10 ** digits;
  // Такое число уже целое в пределах точности double: дробной части нет.
  if (abs * factor >= 1e21) return sign * abs;
  // Числа меньше 1e-6 JS пишет с «e»: склейка строки там не работает.
  if (String(abs).includes('e')) return (sign * Math.floor(abs * factor + 0.5)) / factor || 0;
  const shifted = Number(`${abs}e${digits}`);
  const rounded = Math.floor(shifted + 0.5);
  const result = Number(`${rounded}e-${digits}`);
  return sign * result || 0;
}

export const KCAL_DIGITS = 0;
export const MACRO_DIGITS = 1;
