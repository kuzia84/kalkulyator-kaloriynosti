/**
 * Округление «0,5 — вверх» (от нуля) до `digits` знаков после запятой.
 * `Math.round(1.005 * 100)` даёт 100 из-за двоичного представления,
 * поэтому число сдвигается через экспоненциальную запись строки.
 */
export function roundHalfUp(value: number, digits = 0): number {
  if (!Number.isFinite(value)) return value;
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const text = String(abs);
  // Очень малые и очень большие числа JS уже пишет с «e»: склейка строки там не работает.
  if (text.includes('e')) {
    const factor = 10 ** digits;
    return (sign * Math.floor(abs * factor + 0.5)) / factor || 0;
  }
  const shifted = Number(`${text}e${digits}`);
  const rounded = Math.floor(shifted + 0.5);
  const result = Number(`${rounded}e-${digits}`);
  return sign * result || 0;
}

export const KCAL_DIGITS = 0;
export const MACRO_DIGITS = 1;
