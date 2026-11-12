import { describe, expect, it } from 'vitest';
import {
  recipeBaseHash,
  recipeBaseId,
  recipeEditHash,
  recipeEditId,
  routeFromHash,
} from './router';

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

  it('новый рецепт на основе другого — тоже раздел «Мои рецепты»', () => {
    expect(routeFromHash(recipeBaseHash('abc'))).toBe('recipes');
    expect(recipeBaseId(recipeBaseHash('a b/с'))).toBe('a b/с');
    expect(recipeEditId(recipeBaseHash('abc'))).toBeNull();
    expect(recipeBaseId('#/recipes/new/')).toBeNull();
  });

  it('без id экрана правки нет', () => {
    expect(recipeEditId('#/recipes/edit/')).toBeNull();
    expect(recipeEditId('#/recipes')).toBeNull();
    expect(routeFromHash('#/recipes')).toBe('recipes');
  });
});
