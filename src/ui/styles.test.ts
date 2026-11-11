// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Тесты запускаются из корня проекта.
const css = readFileSync(resolve('src/ui/styles.css'), 'utf-8');

/** Имена и значения CSS-переменных в блоке, который начинается с `selector {`. */
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]),
  );
}

describe('этикетка', () => {
  it('системная и выбранная тёмная схема этикетки задают одинаковые токены', () => {
    const system = tokens(":root[data-skin='label']:not([data-theme='light'])");
    const chosen = tokens(":root[data-skin='label'][data-theme='dark']");
    expect(chosen).toEqual(system);
  });

  it('этикетка переопределяет каждый цвет стекла, а её тёмная схема — каждый свой цвет', () => {
    const glass = tokens(':root {');
    const label = tokens(":root[data-skin='label'] {");
    const labelDark = tokens(":root[data-skin='label'][data-theme='dark']");
    const isColor = (v: string) => /^#|rgb/.test(v);
    for (const key of Object.keys(glass).filter((k) => isColor(glass[k]!)))
      expect(label, key).toHaveProperty(key);
    for (const key of Object.keys(label).filter((k) => isColor(label[k]!)))
      expect(labelDark, key).toHaveProperty(key);
  });
});

describe('тёмная тема', () => {
  it('системная и выбранная в настройках тёмная тема задают одинаковые токены', () => {
    const system = tokens(":root:not([data-theme='light'])");
    const chosen = tokens(":root[data-theme='dark']");
    expect(chosen).toEqual(system);
  });

  it('тёмная тема переопределяет каждый цвет светлой', () => {
    const light = tokens(':root {');
    const dark = tokens(":root[data-theme='dark']");
    const colors = Object.keys(light).filter((k) => /^#|rgb/.test(light[k]!));
    for (const key of colors) expect(dark, key).toHaveProperty(key);
  });
});
