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
