import { useSyncExternalStore } from 'react';

export type Route = 'calculator' | 'recipes' | 'moderation' | 'settings';

export const ROUTES: { route: Route; hash: string; label: string }[] = [
  { route: 'calculator', hash: '#/', label: 'Калькулятор' },
  { route: 'recipes', hash: '#/recipes', label: 'Мои рецепты' },
  { route: 'moderation', hash: '#/moderation', label: 'Справочник' },
  { route: 'settings', hash: '#/settings', label: 'Настройки' },
];

const RECIPE_EDIT_PREFIX = '#/recipes/edit/';
const RECIPE_BASE_PREFIX = '#/recipes/new/';

/** Адрес экрана правки рецепта. */
export function recipeEditHash(id: string): string {
  return `${RECIPE_EDIT_PREFIX}${encodeURIComponent(id)}`;
}

/** id рецепта из адреса экрана правки, иначе null. */
export function recipeEditId(hash: string): string | null {
  return idAfter(hash, RECIPE_EDIT_PREFIX);
}

/** Адрес экрана «Новый рецепт на основе» другого рецепта. */
export function recipeBaseHash(id: string): string {
  return `${RECIPE_BASE_PREFIX}${encodeURIComponent(id)}`;
}

/** id исходного рецепта из адреса экрана «Новый рецепт на основе», иначе null. */
export function recipeBaseId(hash: string): string | null {
  return idAfter(hash, RECIPE_BASE_PREFIX);
}

function idAfter(hash: string, prefix: string): string | null {
  if (!hash.startsWith(prefix)) return null;
  const raw = hash.slice(prefix.length);
  let id: string;
  try {
    id = decodeURIComponent(raw);
  } catch {
    // Испорченная ссылка (например, обрезанный %-код) не роняет приложение.
    id = raw;
  }
  return id === '' ? null : id;
}

export function routeFromHash(hash: string): Route {
  // Правка рецепта и новый рецепт на основе другого — часть раздела «Мои рецепты».
  if (recipeEditId(hash) != null || recipeBaseId(hash) != null) return 'recipes';
  const found = ROUTES.find((r) => r.hash === hash && r.hash !== '#/');
  return found ? found.route : 'calculator';
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

/** hash-часть адреса целиком: нужна разделам с вложенными экранами. */
export function useHash(): string {
  return useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => '',
  );
}

/** Маршрут из hash-части адреса: GitHub Pages отдаёт только index.html. */
export function useRoute(): Route {
  return routeFromHash(useHash());
}
