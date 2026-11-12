/** Число и слово в нужной форме: `plural(3, 'рецепт', 'рецепта', 'рецептов')` → «3 рецепта». */
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? one
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? few
        : many;
  return `${n} ${word}`;
}

/** «1 ингредиент», «3 ингредиента», «5 ингредиентов». */
export function ingredientsCount(n: number): string {
  return plural(n, 'ингредиент', 'ингредиента', 'ингредиентов');
}

/** «1 рецепт», «3 рецепта», «5 рецептов». */
export function recipesCount(n: number): string {
  return plural(n, 'рецепт', 'рецепта', 'рецептов');
}
