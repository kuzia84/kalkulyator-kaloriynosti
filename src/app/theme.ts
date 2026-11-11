import type { Theme } from '../storage/schema';

/** Ключ в localStorage. Тот же ключ читает встроенный скрипт в index.html до запуска React. */
export const THEME_STORAGE_KEY = 'kk-theme';

/** Ставит тему на <html>. «Как в системе» — без атрибута, работает prefers-color-scheme. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

/**
 * Применяет тему и копирует её в localStorage. Основная запись настроек — в IndexedDB,
 * но она читается асинхронно: без копии страница сначала мигала бы светлой темой.
 */
export function rememberTheme(theme: Theme): void {
  applyTheme(theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Хранилище недоступно (приватный режим): тема всё равно применится после чтения настроек.
  }
}
