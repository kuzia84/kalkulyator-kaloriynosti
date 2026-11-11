import type { Skin, Theme } from '../storage/schema';

/** Ключ в localStorage. Тот же ключ читает встроенный скрипт в index.html до запуска React. */
export const THEME_STORAGE_KEY = 'kk-theme';
/** Ключ оформления в localStorage. Его тоже читает скрипт в index.html. */
export const SKIN_STORAGE_KEY = 'kk-skin';

/** Ставит тему на <html>. «Системная» — без атрибута, работает prefers-color-scheme. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

/** Ставит оформление на <html>. «Стекло» — без атрибута: это оформление по умолчанию. */
export function applySkin(skin: Skin): void {
  const root = document.documentElement;
  if (skin === 'glass') root.removeAttribute('data-skin');
  else root.setAttribute('data-skin', skin);
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Хранилище недоступно (приватный режим): значение всё равно применится после чтения настроек.
  }
}

/**
 * Применяет тему и копирует её в localStorage. Основная запись настроек — в IndexedDB,
 * но она читается асинхронно: без копии страница сначала мигала бы светлой темой.
 */
export function rememberTheme(theme: Theme): void {
  applyTheme(theme);
  store(THEME_STORAGE_KEY, theme);
}

/** Применяет оформление и копирует его в localStorage по той же причине, что и тему. */
export function rememberSkin(skin: Skin): void {
  applySkin(skin);
  store(SKIN_STORAGE_KEY, skin);
}
