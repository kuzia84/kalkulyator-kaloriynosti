/** Нормализует название для поиска: нижний регистр, «ё» → «е», одиночные пробелы. */
export function normalizeName(name: string): string {
  return name.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

/** Нормализует запрос. В отличие от названия, пробел в конце сохраняется: «рис » ≠ «рисовая». */
export function normalizeQuery(query: string): string {
  return query.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/\s+/g, ' ').trimStart();
}

/** Оставляет в штрихкоде только цифры. */
export function normalizeBarcode(code: string): string {
  return code.replace(/\D/g, '');
}
