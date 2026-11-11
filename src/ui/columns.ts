export const COLUMN_LABELS = {
  name: 'Наименование ингредиента',
  weight: 'Вес, г',
  kcal: 'Калорийность, ккал',
  protein: 'Белки, г',
  fat: 'Жиры, г',
  carbs: 'Углеводы, г',
} as const;

/** Короткие подписи ячеек в карточках на узком экране. */
export const SHORT_LABELS = {
  name: 'Ингредиент',
  weight: 'Вес, г',
  kcal: 'Ккал',
  protein: 'Белки',
  fat: 'Жиры',
  carbs: 'Углеводы',
} as const;

/** Заголовки колонок таблицы блюда на экране. Полные названия — в COLUMN_LABELS, для программ чтения. */
export const HEAD_LABELS = {
  name: 'Ингредиент',
  weight: 'Вес, г',
  kcal: 'Ккал',
  protein: 'Белки',
  fat: 'Жиры',
  carbs: 'Углеводы',
} as const;

/** Однобуквенные подписи в итоге блюда на телефоне: «Б 45,5». */
export const LETTER_LABELS = {
  kcal: 'Ккал',
  protein: 'Б',
  fat: 'Ж',
  carbs: 'У',
} as const;
