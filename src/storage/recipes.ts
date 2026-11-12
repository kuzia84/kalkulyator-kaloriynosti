import { newId } from '../lib/id';
import { emptyRow, type DishState } from '../dish/state';
import { db as defaultDb, type AppDB } from './db';
import type { Dish, DishRow } from './schema';

export async function listRecipes(db: AppDB = defaultDb): Promise<Dish[]> {
  const all = await db.recipes.orderBy('updatedAt').reverse().toArray();
  return all;
}

export async function getRecipe(id: string, db: AppDB = defaultDb): Promise<Dish | undefined> {
  return db.recipes.get(id);
}

/**
 * Строки рецепта без пустых строк. Отметка о записи в справочник сохраняется:
 * строка, которую ещё не учли, будет учтена после открытия рецепта.
 */
function cleanRows(state: DishState): Dish['rows'] {
  return state.rows.filter((r) => r.name.trim() !== '' || r.weight.trim() !== '');
}

function buildRecipe(state: DishState, id: string, existing: Dish | undefined, now: number): Dish {
  return {
    id,
    name: state.name.trim() || 'Без названия',
    rows: cleanRows(state),
    cookedWeight: state.cookedWeight,
    portionWeight: state.portionWeight,
    note: state.note,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

/** Рецепта для обновления уже нет в базе. */
export class RecipeNotFoundError extends Error {
  constructor() {
    super('Рецепт не найден.');
    this.name = 'RecipeNotFoundError';
  }
}

/**
 * Обновляет существующий рецепт `state.recipeId`. Новый рецепт не создаёт:
 * если рецепт удалили, пока шла правка, бросает RecipeNotFoundError.
 */
export async function updateRecipe(
  state: DishState,
  db: AppDB = defaultDb,
  now = Date.now(),
): Promise<Dish> {
  return db.transaction('rw', db.recipes, async () => {
    const existing = state.recipeId ? await db.recipes.get(state.recipeId) : undefined;
    if (!existing) throw new RecipeNotFoundError();
    const recipe = buildRecipe(state, existing.id, existing, now);
    await db.recipes.put(recipe);
    return recipe;
  });
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
    await db.recipes.put(buildRecipe(state, id, existing, now));
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

/** Состояние калькулятора из рецепта. Строки получают новые id, чтобы не путаться с рецептом. */
export function recipeToState(recipe: Dish): DishState {
  // Строки, уже учтённые в справочнике, при открытии ранг не меняют. Неучтённые учтутся
  // после ввода веса, как в новом блюде.
  const rows: DishRow[] = recipe.rows.map((r) => ({ ...r, id: newId() }));
  // Как и пустая таблица, открытый рецепт показывает хотя бы одну строку.
  if (rows.length === 0) rows.push(emptyRow());
  return {
    name: recipe.name,
    rows,
    cookedWeight: recipe.cookedWeight,
    portionWeight: recipe.portionWeight,
    note: recipe.note,
    recipeId: recipe.id,
  };
}
