import { newId } from '../lib/id';
import { emptyRow, INITIAL_ROWS, type DishState } from '../dish/state';
import { db as defaultDb, type AppDB } from './db';
import type { Dish, DishRow } from './schema';

export async function listRecipes(db: AppDB = defaultDb): Promise<Dish[]> {
  const all = await db.recipes.orderBy('updatedAt').reverse().toArray();
  return all;
}

export async function getRecipe(id: string, db: AppDB = defaultDb): Promise<Dish | undefined> {
  return db.recipes.get(id);
}

/** Строки рецепта без пустых строк и без служебных отметок о записи в справочник. */
function cleanRows(state: DishState): Dish['rows'] {
  return state.rows
    .filter((r) => r.name.trim() !== '' || r.weight.trim() !== '')
    .map(({ committed: _committed, ...row }) => row);
}

/**
 * Сохраняет блюдо в «Мои рецепты». Если черновик открыт из рецепта (`recipeId`),
 * рецепт обновляется, иначе создаётся новый. Возвращает id рецепта.
 */
export async function saveRecipe(
  state: DishState,
  db: AppDB = defaultDb,
  now = Date.now(),
): Promise<string> {
  return db.transaction('rw', db.recipes, async () => {
    const existing = state.recipeId ? await db.recipes.get(state.recipeId) : undefined;
    const id = existing?.id ?? newId();
    const recipe: Dish = {
      id,
      name: state.name.trim() || 'Без названия',
      rows: cleanRows(state),
      cookedWeight: state.cookedWeight,
      portionWeight: state.portionWeight,
      note: state.note,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await db.recipes.put(recipe);
    return id;
  });
}

export async function deleteRecipe(id: string, db: AppDB = defaultDb): Promise<Dish | undefined> {
  return db.transaction('rw', db.recipes, async () => {
    const existing = await db.recipes.get(id);
    if (existing) await db.recipes.delete(id);
    return existing;
  });
}

export async function restoreRecipe(recipe: Dish, db: AppDB = defaultDb): Promise<void> {
  await db.recipes.put(recipe);
}

/** Копия рецепта с новым id и пометкой «копия» в названии. */
export async function duplicateRecipe(
  id: string,
  db: AppDB = defaultDb,
  now = Date.now(),
): Promise<string> {
  const source = await db.recipes.get(id);
  if (!source) throw new Error('Рецепт не найден.');
  const copy: Dish = {
    ...source,
    id: newId(),
    name: `${source.name} (копия)`,
    rows: source.rows.map((r) => ({ ...r, id: newId() })),
    createdAt: now,
    updatedAt: now,
  };
  await db.recipes.add(copy);
  return copy.id;
}

/** Состояние калькулятора из рецепта. Строки получают новые id, чтобы не путаться с рецептом. */
export function recipeToState(recipe: Dish): DishState {
  // Продукты рецепта уже учтены в справочнике при первом расчёте: повторное открытие ранг не меняет.
  const rows: DishRow[] = recipe.rows.map((r) => ({ ...r, id: newId(), committed: true }));
  // Как и пустая таблица, открытый рецепт показывает не меньше 4 строк.
  while (rows.length < INITIAL_ROWS) rows.push(emptyRow());
  return {
    name: recipe.name,
    rows,
    cookedWeight: recipe.cookedWeight,
    portionWeight: recipe.portionWeight,
    note: recipe.note,
    recipeId: recipe.id,
  };
}
