// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './schema';
import { sanitizeSettings } from './settings';

describe('настройки оформления', () => {
  it('без сохранённого стиля включается «Обычный»', () => {
    expect(sanitizeSettings({}).skin).toBe('plain');
    expect(DEFAULT_SETTINGS.skin).toBe('plain');
  });

  it('известный стиль сохраняется, неизвестный заменяется умолчанием', () => {
    expect(sanitizeSettings({ skin: 'label' }).skin).toBe('label');
    expect(sanitizeSettings({ skin: 'frosted' }).skin).toBe('frosted');
    expect(sanitizeSettings({ skin: 'neon' as never }).skin).toBe('plain');
  });

  it('прежнее основное оформление «glass» открывается как «Обычный»', () => {
    // Раньше стиль по умолчанию сохранялся как 'glass'. Его владельцы не выбирали стекло сами.
    expect(sanitizeSettings({ skin: 'glass' as never }).skin).toBe('plain');
  });

  it('стиль и цветовая схема не зависят друг от друга', () => {
    const s = sanitizeSettings({ skin: 'label', theme: 'dark' });
    expect(s).toMatchObject({ skin: 'label', theme: 'dark' });
  });
});
