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
