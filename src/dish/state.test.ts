import { describe, expect, it } from 'vitest';
import {
  dishReducer,
  hasContent,
  initialDishState,
  INITIAL_ROWS,
  needsCommit,
  pickAction,
  type DishState,
} from './state';

const milk = {
  name: 'Молоко',
  kcal: 52,
  protein: 2.8,
  fat: 2.5,
  carbs: 4.7,
  source: 'skurikhin' as const,
  productId: 'sk-034',
};

function withMilk(weight = ''): { state: DishState; rowId: string; pickId: string } {
  let state = initialDishState();
  const rowId = state.rows[0]!.id;
  const action = pickAction(rowId, milk);
  state = dishReducer(state, action);
  if (weight) state = dishReducer(state, { type: 'setWeight', rowId, weight });
  return { state, rowId, pickId: state.rows[0]!.pickId! };
}

describe('dishReducer', () => {
  it('начальное состояние — 4 пустые строки', () => {
    const s = initialDishState();
    expect(s.rows).toHaveLength(INITIAL_ROWS);
    expect(hasContent(s)).toBe(false);
  });

  it('выбор продукта копирует значения на 100 г', () => {
    const { state } = withMilk();
    expect(state.rows[0]).toMatchObject({
      name: 'Молоко',
      productId: 'sk-034',
      per100: { kcal: 52 },
    });
  });

  it('новый текст в поле сбрасывает продукт, вес остаётся', () => {
    const { state, rowId } = withMilk('200');
    const s = dishReducer(state, { type: 'setName', rowId, name: 'Мол' });
    expect(s.rows[0]).toEqual({ id: rowId, name: 'Мол', weight: '200' });
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

  it('возврат строки на место не трогает правки после удаления', () => {
    let s = initialDishState();
    const removed = s.rows[1]!;
    s = dishReducer(s, { type: 'removeRow', rowId: removed.id });
    s = dishReducer(s, { type: 'setWeight', rowId: s.rows[0]!.id, weight: '150' });
    s = dishReducer(s, { type: 'insertRow', row: removed, index: 1 });
    expect(s.rows[1]!.id).toBe(removed.id);
    expect(s.rows[0]!.weight).toBe('150');
    expect(dishReducer(s, { type: 'insertRow', row: removed, index: 1 }).rows).toHaveLength(4);
  });

  it('ответ справочника для прежнего выбора не отмечает новый выбор', () => {
    const { state, rowId, pickId } = withMilk('100');
    // Пользователь выбрал продукт с тем же названием ещё раз (например, вручную).
    const repicked = dishReducer(
      dishReducer(state, pickAction(rowId, { ...milk, source: 'user', productId: undefined })),
      { type: 'setWeight', rowId, weight: '100' },
    );
    const stale = dishReducer(repicked, { type: 'committed', rowId, productId: 'sk-034', pickId });
    expect(needsCommit(stale.rows[0]!)).toBe(true);
    const ok = dishReducer(state, { type: 'committed', rowId, productId: 'sk-034', pickId });
    expect(needsCommit(ok.rows[0]!)).toBe(false);
  });

  it('строка без веса или с весом 0 не пишется в справочник', () => {
    const { state, rowId } = withMilk();
    expect(needsCommit(state.rows[0]!)).toBe(false);
    const zero = dishReducer(state, { type: 'setWeight', rowId, weight: '0' });
    expect(needsCommit(zero.rows[0]!)).toBe(false);
  });

  it('название блюда и заметка тоже считаются содержимым', () => {
    expect(hasContent({ ...initialDishState(), note: 'на 4 порции' })).toBe(true);
    expect(hasContent({ ...initialDishState(), name: 'Плов' })).toBe(true);
  });
});
