/** Нормализует название и запрос для поиска: нижний регистр, «ё» → «е», одиночные пробелы. */
export function normalizeName(name: string): string {
  return name.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

/**
 * Нормализует запрос. Пробел в конце убирается: клавиатура телефона добавляет его
 * после выбора слова, и запрос «картофель » иначе ничего бы не нашёл.
 */
export const normalizeQuery = normalizeName;

/** Оставляет в штрихкоде только цифры. */
export function normalizeBarcode(code: string): string {
  return code.replace(/\D/g, '');
}
