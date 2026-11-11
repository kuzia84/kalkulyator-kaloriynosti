import { describe, expect, it } from 'vitest';
import { dishReducer, hasContent, initialDishState, INITIAL_ROWS, needsCommit } from './state';

const milk = {
  name: 'Молоко',
  kcal: 52,
  protein: 2.8,
  fat: 2.5,
  carbs: 4.7,
  source: 'skurikhin' as const,
  productId: 'sk-034',
};

describe('dishReducer', () => {
  it('начальное состояние — 4 пустые строки', () => {
    const s = initialDishState();
    expect(s.rows).toHaveLength(INITIAL_ROWS);
    expect(hasContent(s)).toBe(false);
  });

  it('выбор продукта копирует значения на 100 г', () => {
    const s0 = initialDishState();
    const id = s0.rows[0]!.id;
    const s1 = dishReducer(s0, { type: 'pick', rowId: id, product: milk });
    expect(s1.rows[0]).toMatchObject({ name: 'Молоко', productId: 'sk-034', per100: { kcal: 52 } });
  });

  it('новый текст в поле сбрасывает продукт, вес остаётся', () => {
    let s = initialDishState();
    const id = s.rows[0]!.id;
    s = dishReducer(s, { type: 'pick', rowId: id, product: milk });
    s = dishReducer(s, { type: 'setWeight', rowId: id, weight: '200' });
    s = dishReducer(s, { type: 'setName', rowId: id, name: 'Мол' });
    expect(s.rows[0]).toEqual({ id, name: 'Мол', weight: '200' });
  });

  it('добавление и удаление строк', () => {
    let s = initialDishState();
    s = dishReducer(s, { type: 'addRow' });
    expect(s.rows).toHaveLength(5);
    s = dishReducer(s, { type: 'removeRow', rowId: s.rows[0]!.id });
    expect(s.rows).toHaveLength(4);
  });

  it('удаление последней строки оставляет одну пустую', () => {
    let s = initialDishState();
    for (const r of [...s.rows]) s = dishReducer(s, { type: 'removeRow', rowId: r.id });
    expect(s.rows).toHaveLength(1);
  });

  it('отметка о записи в справочник не ставится, если продукт сменился', () => {
    let s = initialDishState();
    const id = s.rows[0]!.id;
    s = dishReducer(s, { type: 'pick', rowId: id, product: milk });
    s = dishReducer(s, { type: 'setWeight', rowId: id, weight: '100' });
    expect(needsCommit(s.rows[0]!)).toBe(true);
    const stale = dishReducer(s, {
      type: 'committed',
      rowId: id,
      productId: 'x',
      expectedName: 'Кефир',
    });
    expect(needsCommit(stale.rows[0]!)).toBe(true);
    const ok = dishReducer(s, {
      type: 'committed',
      rowId: id,
      productId: 'sk-034',
      expectedName: 'Молоко',
    });
    expect(needsCommit(ok.rows[0]!)).toBe(false);
  });

  it('строка без веса или с весом 0 не пишется в справочник', () => {
    let s = initialDishState();
    const id = s.rows[0]!.id;
    s = dishReducer(s, { type: 'pick', rowId: id, product: milk });
    expect(needsCommit(s.rows[0]!)).toBe(false);
    s = dishReducer(s, { type: 'setWeight', rowId: id, weight: '0' });
    expect(needsCommit(s.rows[0]!)).toBe(false);
  });
});
