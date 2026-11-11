// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './schema';
import { sanitizeSettings } from './settings';

describe('настройки оформления', () => {
  it('без сохранённого стиля включается «Стекло»', () => {
    expect(sanitizeSettings({}).skin).toBe('glass');
    expect(DEFAULT_SETTINGS.skin).toBe('glass');
  });

  it('известный стиль сохраняется, неизвестный заменяется умолчанием', () => {
    expect(sanitizeSettings({ skin: 'label' }).skin).toBe('label');
    expect(sanitizeSettings({ skin: 'neon' as never }).skin).toBe('glass');
  });

  it('стиль и цветовая схема не зависят друг от друга', () => {
    const s = sanitizeSettings({ skin: 'label', theme: 'dark' });
    expect(s).toMatchObject({ skin: 'label', theme: 'dark' });
  });
});
