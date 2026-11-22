import { describe, expect, it } from 'vitest';
import { atwaterKcal, kcalDeviation, SUSPICIOUS_THRESHOLD } from '../calc';
import { SEED } from './seed';
import { normalizeName } from './normalize';

describe('стартовый набор', () => {
  it('содержит воду с нулевыми значениями', () => {
    const water = SEED.find((p) => p.name.startsWith('Вода'));
    expect(water).toMatchObject({ kcal: 0, protein: 0, fat: 0, carbs: 0 });
  });

  it('id и названия уникальны', () => {
    expect(new Set(SEED.map((p) => p.id)).size).toBe(SEED.length);
    expect(new Set(SEED.map((p) => normalizeName(p.name))).size).toBe(SEED.length);
  });

  it('в наборе не меньше 190 продуктов', () => {
    expect(SEED.length).toBeGreaterThanOrEqual(190);
  });

  it('источник — Скурихин или USDA, у записи USDA есть externalId usda:<fdcId>', () => {
    for (const p of SEED) {
      expect(['skurikhin', 'usda'], p.name).toContain(p.source);
      if (p.source === 'usda') expect(p.externalId, p.name).toMatch(/^usda:\d+$/);
      else expect(p.externalId, p.name).toBeUndefined();
    }
    const ids = SEED.flatMap((p) => (p.externalId ? [p.externalId] : []));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('значения неотрицательны, БЖУ не больше 100 г', () => {
    for (const p of SEED) {
      expect(p.kcal, p.name).toBeGreaterThanOrEqual(0);
      expect(p.protein + p.fat + p.carbs, p.name).toBeLessThanOrEqual(100);
    }
  });

  it.each(SEED.map((p) => [p.name, p] as const))(
    '«%s» проходит проверку Б×4 + Ж×9 + У×4 (отклонение ≤ 15 %%)',
    (_name, p) => {
      expect(
        kcalDeviation(p),
        `заявлено ${p.kcal}, по формуле ${atwaterKcal(p).toFixed(1)}`,
      ).toBeLessThanOrEqual(SUSPICIOUS_THRESHOLD);
    },
  );
});
