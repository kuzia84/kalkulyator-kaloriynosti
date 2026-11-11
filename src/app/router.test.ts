import { describe, expect, it } from 'vitest';
import { recipeEditHash, recipeEditId, routeFromHash } from './router';

describe('маршруты', () => {
  it('правка рецепта относится к разделу «Мои рецепты»', () => {
    expect(routeFromHash('#/recipes/edit/abc')).toBe('recipes');
    expect(recipeEditId('#/recipes/edit/abc')).toBe('abc');
  });

  it('id рецепта переживает кодирование в адресе', () => {
    expect(recipeEditId(recipeEditHash('a b/с'))).toBe('a b/с');
  });

  it('испорченный %-код в адресе не роняет разбор', () => {
    expect(recipeEditId('#/recipes/edit/%E0%A4')).toBe('%E0%A4');
    expect(routeFromHash('#/recipes/edit/%E0%A4')).toBe('recipes');
  });

  it('без id экрана правки нет', () => {
    expect(recipeEditId('#/recipes/edit/')).toBeNull();
    expect(recipeEditId('#/recipes')).toBeNull();
    expect(routeFromHash('#/recipes')).toBe('recipes');
  });
});
