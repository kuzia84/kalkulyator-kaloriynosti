/**
 * Разбирает число из строки ввода. Принимает запятую и точку как десятичный разделитель
 * и пробелы (в том числе неразрывные) между разрядами.
 * Возвращает `null` для пустой строки и для строки, которая не является числом.
 */
export function parseDecimal(input: string | null | undefined): number | null {
  if (input == null) return null;
  // \s в JS уже включает неразрывные пробелы U+00A0 и U+202F.
  const cleaned = input.replace(/\s/g, '').replace(',', '.');
  if (cleaned === '') return null;
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** Вес в граммах: только неотрицательное число. Иначе `null`. */
export function parseWeight(input: string | null | undefined): number | null {
  const value = parseDecimal(input);
  return value != null && value >= 0 ? value : null;
}

/** Оставляет в поле только цифры, один разделитель и не больше `maxFraction` знаков после него. */
export function sanitizeDecimalInput(input: string, maxFraction = 2): string {
  let result = '';
  let separatorSeen = false;
  let fraction = 0;
  for (const ch of input) {
    if (ch >= '0' && ch <= '9') {
      if (separatorSeen) {
        if (fraction >= maxFraction) continue;
        fraction += 1;
      }
      result += ch;
    } else if ((ch === ',' || ch === '.') && !separatorSeen && maxFraction > 0) {
      separatorSeen = true;
      result += ch;
    }
  }
  return result;
}
