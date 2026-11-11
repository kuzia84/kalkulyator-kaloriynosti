import { useSyncExternalStore } from 'react';

export type Route = 'calculator' | 'recipes' | 'moderation' | 'settings';

export const ROUTES: { route: Route; hash: string; label: string }[] = [
  { route: 'calculator', hash: '#/', label: 'Калькулятор' },
  { route: 'recipes', hash: '#/recipes', label: 'Мои рецепты' },
  { route: 'moderation', hash: '#/moderation', label: 'Справочник' },
  { route: 'settings', hash: '#/settings', label: 'Настройки' },
];

export function routeFromHash(hash: string): Route {
  const found = ROUTES.find((r) => r.hash === hash && r.hash !== '#/');
  return found ? found.route : 'calculator';
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

/** Маршрут из hash-части адреса: GitHub Pages отдаёт только index.html. */
export function useRoute(): Route {
  return useSyncExternalStore(
    subscribe,
    () => routeFromHash(window.location.hash),
    () => 'calculator',
  );
}
