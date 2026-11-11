import { beforeEach, describe, expect, it } from 'vitest';
import { totals } from '../calc';
import { db } from '../storage/db';
import { resetDb } from '../test/db';
import { addDemoRecipes, demoRecipes } from './demoRecipes';

beforeEach(async () => {
  await resetDb();
});

describe('тестовые рецепты', () => {
  it('у каждого рецепта есть ингредиенты со значениями и весом', () => {
    for (const recipe of demoRecipes()) {
      expect(recipe.rows.length).toBeGreaterThan(0);
      expect(totals(recipe.rows).weight).toBeGreaterThan(0);
      expect(recipe.rows.every((r) => r.per100)).toBe(true);
    }
  });

  it('повторное добавление не создаёт дубликаты', async () => {
    const count = await addDemoRecipes();
    await addDemoRecipes();
    expect(await db.recipes.count()).toBe(count);
  });
});
