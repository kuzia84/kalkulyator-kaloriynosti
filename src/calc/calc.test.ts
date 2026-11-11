import { describe, expect, it } from 'vitest';
import {
  atwaterKcal,
  dishWeight,
  isCookedHeavier,
  isSuspicious,
  kcalDeviation,
  macroEnergyShare,
  per100,
  per100Cooked,
  portion,
  rowNutrients,
  totals,
  type RowInput,
} from './calc';
import { EMPTY_CELL, formatNutrient, formatWeight, toInputString } from './format';
import { parseDecimal, parseWeight, sanitizeDecimalInput } from './parse';
import { roundHalfUp } from './round';

const n = (kcal: number, protein = 0, fat = 0, carbs = 0) => ({ kcal, protein, fat, carbs });

describe('контрольный пример из ТЗ', () => {
  const rows: RowInput[] = [
    { per100: n(150), weight: '200' },
    { per100: n(200), weight: '300' },
  ];

  it('строка А: 200 г × 150 ккал/100 г = 300 ккал', () => {
    expect(rowNutrients(rows[0]!)?.kcal).toBe(300);
  });

  it('строка Б: 300 г × 200 ккал/100 г = 600 ккал', () => {
    expect(rowNutrients(rows[1]!)?.kcal).toBe(600);
  });

  it('итого: 500 г и 900 ккал', () => {
    const t = totals(rows);
    expect(t.weight).toBe(500);
    expect(t.nutrients.kcal).toBe(900);
  });

  it('на 100 г блюда: 180 ккал', () => {
    const t = totals(rows);
    expect(per100(t.nutrients, t.weight)?.kcal).toBe(180);
  });

  it('на 100 г готового блюда при 400 г: 225 ккал', () => {
    const t = totals(rows);
    expect(per100Cooked(t.nutrients, '400')?.kcal).toBe(225);
  });
});

describe('rowNutrients', () => {
  it('считает БЖУ так же, как ккал', () => {
    expect(rowNutrients({ per100: n(313, 12.6, 3.3, 57.1), weight: '50' })).toEqual({
      kcal: 156.5,
      protein: 6.3,
      fat: 1.65,
      carbs: 28.55,
    });
  });

  it('строка на границе 0,5: 25 ккал × 58 г = 14,5 → 15', () => {
    const row = rowNutrients({ per100: n(25, 0.7), weight: '58' })!;
    expect(row.kcal).toBe(14.5);
    expect(formatNutrient('kcal', row.kcal)).toBe('15');
    expect(
      formatNutrient('protein', rowNutrients({ per100: n(0, 0.7), weight: '150' })!.protein),
    ).toBe('1,1');
  });

  it('пустой вес — нет значений', () => {
    expect(rowNutrients({ per100: n(100), weight: '' })).toBeNull();
  });

  it('нет продукта — нет значений', () => {
    expect(rowNutrients({ weight: '100' })).toBeNull();
  });

  it('вес 0 — нулевые значения', () => {
    expect(rowNutrients({ per100: n(100, 1, 2, 3), weight: '0' })).toEqual(n(0, 0, 0, 0));
  });

  it('вес с десятичной запятой', () => {
    expect(rowNutrients({ per100: n(200), weight: '12,5' })?.kcal).toBe(25);
  });
});

describe('totals', () => {
  it('пустая таблица — нули', () => {
    expect(totals([{ weight: '' }, { weight: '' }])).toEqual({ weight: 0, nutrients: n(0) });
  });

  it('строка без продукта не входит ни в вес, ни в ккал', () => {
    const t = totals([{ per100: n(100), weight: '100' }, { weight: '50' }]);
    expect(t.weight).toBe(100);
    expect(t.nutrients.kcal).toBe(100);
    expect(per100(t.nutrients, t.weight)?.kcal).toBe(100);
  });

  it('хранит полную точность: сумма не копит ошибку округления строк', () => {
    // Каждая строка 0,4 ккал → при показе 0, но сумма трёх строк 1,2 → 1.
    const rows = Array.from({ length: 3 }, () => ({ per100: n(4), weight: '10' }));
    const t = totals(rows);
    expect(t.nutrients.kcal).toBeCloseTo(1.2, 10);
    expect(formatNutrient('kcal', t.nutrients.kcal)).toBe('1');
  });
});

describe('деление на ноль', () => {
  it('вес итого 0 — «—»', () => {
    expect(per100(n(0), 0)).toBeNull();
    expect(formatNutrient('kcal', per100(n(0), 0)?.kcal)).toBe(EMPTY_CELL);
  });

  it('вес готового блюда пуст — «—»', () => {
    expect(per100Cooked(n(900), '')).toBeNull();
  });

  it('вес готового блюда 0 — «—»', () => {
    expect(per100Cooked(n(900), '0')).toBeNull();
  });

  it('вес готового блюда не число — «—»', () => {
    expect(per100Cooked(n(900), 'abc')).toBeNull();
  });
});

describe('уварка и привар', () => {
  it('вес готового блюда больше суммы весов — признак привара', () => {
    expect(isCookedHeavier(100, '250')).toBe(true);
    expect(isCookedHeavier(100, '80')).toBe(false);
    expect(isCookedHeavier(0, '80')).toBe(false);
    expect(isCookedHeavier(100, '')).toBe(false);
  });

  it('привар не меняет суммы: на 100 г уменьшается', () => {
    expect(per100Cooked(n(350), '250')?.kcal).toBe(140);
  });
});

describe('порция', () => {
  it('по весу готового блюда', () => {
    const total = n(900);
    expect(portion(total, dishWeight(500, '400'), '200')?.kcal).toBe(450);
  });

  it('без веса готового блюда — по сумме весов', () => {
    expect(dishWeight(500, '')).toBe(500);
    expect(portion(n(900), dishWeight(500, ''), '100')?.kcal).toBe(180);
  });

  it('пустой вес порции — нет значений', () => {
    expect(portion(n(900), 500, '')).toBeNull();
  });

  it('пустое блюдо — нет значений', () => {
    expect(dishWeight(0, '')).toBeNull();
    expect(portion(n(0), null, '100')).toBeNull();
  });

  it('вес готового блюда 0 — порции нет, как и строки уварки', () => {
    expect(dishWeight(500, '0')).toBeNull();
    expect(dishWeight(500, 'abc')).toBeNull();
  });

  it('порция без ошибки двоичной дроби', () => {
    // 25 ккал/100 г × 58 г = 14,5 → 15
    expect(formatNutrient('kcal', portion(n(25), 100, '58')?.kcal)).toBe('15');
  });
});

describe('формула проверки', () => {
  it('Б × 4 + Ж × 9 + У × 4', () => {
    expect(atwaterKcal({ protein: 10, fat: 10, carbs: 10 })).toBe(170);
  });

  it('вода: 0 ккал и 0 г БЖУ — не подозрительная', () => {
    expect(kcalDeviation(n(0))).toBe(0);
    expect(isSuspicious(n(0))).toBe(false);
  });

  it('отклонение больше 15 % — подозрительная', () => {
    expect(isSuspicious(n(200, 10, 10, 10))).toBe(true); // 200 против 170: 17,6 %
    expect(isSuspicious(n(190, 10, 10, 10))).toBe(false); // 11,8 %
  });

  it('ккал при нулевых БЖУ — подозрительная', () => {
    expect(isSuspicious(n(50))).toBe(true);
  });

  it('разница меньше 5 ккал — не подозрительная', () => {
    expect(isSuspicious(n(1, 0.1, 0, 0))).toBe(false);
    expect(isSuspicious(n(2))).toBe(false);
  });
});

describe('macroEnergyShare', () => {
  it('доли в процентах дают 100', () => {
    const s = macroEnergyShare(n(170, 10, 10, 10))!;
    expect(s.protein + s.fat + s.carbs).toBeCloseTo(100, 10);
    expect(s.fat).toBeCloseTo((90 / 170) * 100, 10);
  });

  it('нулевые БЖУ — нет долей', () => {
    expect(macroEnergyShare(n(0))).toBeNull();
  });
});

describe('parseDecimal', () => {
  it.each([
    ['12,5', 12.5],
    ['12.5', 12.5],
    [' 1 000 ', 1000],
    ['1 000,25', 1000.25],
    [',5', 0.5],
    ['5,', 5],
    ['0', 0],
  ])('«%s» → %d', (input, expected) => {
    expect(parseDecimal(input)).toBe(expected);
  });

  it.each(['', '   ', 'abc', '1,2,3', '1.2.3', '--1', null, undefined])('«%s» → null', (input) => {
    expect(parseDecimal(input)).toBeNull();
  });

  it('parseWeight отбрасывает отрицательный вес', () => {
    expect(parseWeight('-5')).toBeNull();
    expect(parseWeight('5')).toBe(5);
  });
});

describe('sanitizeDecimalInput', () => {
  it('оставляет цифры и один разделитель', () => {
    expect(sanitizeDecimalInput('1a2,3,4')).toBe('12,34');
    expect(sanitizeDecimalInput('1.234', 1)).toBe('1.2');
    expect(sanitizeDecimalInput('12,5', 0)).toBe('125');
  });
});

describe('roundHalfUp', () => {
  it('0,5 — вверх', () => {
    expect(roundHalfUp(0.5)).toBe(1);
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(1.4999)).toBe(1);
  });

  it('0,05 — вверх при одном знаке', () => {
    expect(roundHalfUp(0.05, 1)).toBe(0.1);
    expect(roundHalfUp(1.25, 1)).toBe(1.3);
    expect(roundHalfUp(1.005, 2)).toBe(1.01);
  });

  it('отрицательные — от нуля', () => {
    expect(roundHalfUp(-2.5)).toBe(-3);
  });

  it('очень малые и очень большие числа', () => {
    expect(roundHalfUp(1e-9, 1)).toBe(0);
    expect(roundHalfUp(1e20, 1)).toBe(1e20);
    expect(roundHalfUp(1e25)).toBe(1e25);
  });

  it('результат умножения на границе 0,5 округляется вверх', () => {
    expect(roundHalfUp(14.499999999999998)).toBe(15);
    expect(roundHalfUp(1.0499999999999998, 1)).toBe(1.1);
  });
});

describe('форматирование', () => {
  it('ккал до целого, БЖУ до 0,1, русская запятая', () => {
    expect(formatNutrient('kcal', 180.5)).toBe('181');
    expect(formatNutrient('protein', 6.25)).toBe('6,3');
    expect(formatNutrient('fat', 0)).toBe('0,0');
  });

  it('разделитель разрядов — пробел', () => {
    expect(formatNutrient('kcal', 12345).replace(/\s/g, ' ')).toBe('12 345');
  });

  it('null и NaN — «—»', () => {
    expect(formatNutrient('kcal', null)).toBe(EMPTY_CELL);
    expect(formatNutrient('kcal', Number.NaN)).toBe(EMPTY_CELL);
  });

  it('вес без лишнего нуля', () => {
    expect(formatWeight(500)).toBe('500');
    expect(formatWeight(12.55)).toBe('12,6');
  });

  it('число для поля ввода', () => {
    expect(toInputString(12.5)).toBe('12,5');
    expect(toInputString(400)).toBe('400');
  });
});
