import { useSyncExternalStore } from 'react';

export type Route = 'calculator' | 'recipes' | 'moderation' | 'settings';

export const ROUTES: { route: Route; hash: string; label: string }[] = [
  { route: 'calculator', hash: '#/', label: 'Калькулятор' },
  { route: 'recipes', hash: '#/recipes', label: 'Мои рецепты' },
  { route: 'moderation', hash: '#/moderation', label: 'Справочник' },
  { route: 'settings', hash: '#/settings', label: 'Настройки' },
];

const RECIPE_EDIT_PREFIX = '#/recipes/edit/';

/** Адрес экрана правки рецепта. */
export function recipeEditHash(id: string): string {
  return `${RECIPE_EDIT_PREFIX}${encodeURIComponent(id)}`;
}

/** id рецепта из адреса экрана правки, иначе null. */
export function recipeEditId(hash: string): string | null {
  if (!hash.startsWith(RECIPE_EDIT_PREFIX)) return null;
  const raw = hash.slice(RECIPE_EDIT_PREFIX.length);
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
  // Правка рецепта — часть раздела «Мои рецепты».
  if (recipeEditId(hash) != null) return 'recipes';
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
