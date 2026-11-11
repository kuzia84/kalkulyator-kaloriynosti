import type { Nutrients } from '../calc';
import { parseWeight } from '../calc';
import { newId } from '../lib/id';
import type { DishRow, ProductSource } from '../storage/schema';

export const INITIAL_ROWS = 4;

export interface DishState {
  name: string;
  rows: DishRow[];
  cookedWeight: string;
  portionWeight: string;
  note: string;
  /** Рецепт, из которого открыт черновик. */
  recipeId?: string;
}

/** Продукт, который пользователь выбрал в подсказках или ввёл вручную. */
export interface PickedProduct extends Nutrients {
  name: string;
  source: ProductSource;
  productId?: string;
  barcode?: string;
  externalId?: string;
}

export type DishAction =
  | { type: 'setName'; rowId: string; name: string }
  | { type: 'pick'; rowId: string; product: PickedProduct }
  | { type: 'setWeight'; rowId: string; weight: string }
  | { type: 'committed'; rowId: string; productId: string; expectedName: string }
  | { type: 'addRow' }
  | { type: 'removeRow'; rowId: string }
  | { type: 'clear' }
  | { type: 'setCookedWeight'; value: string }
  | { type: 'setPortionWeight'; value: string }
  | { type: 'setDishName'; value: string }
  | { type: 'setNote'; value: string }
  | { type: 'replace'; state: DishState };

export function emptyRow(): DishRow {
  return { id: newId(), name: '', weight: '' };
}

export function initialDishState(): DishState {
  return {
    name: '',
    rows: Array.from({ length: INITIAL_ROWS }, emptyRow),
    cookedWeight: '',
    portionWeight: '',
    note: '',
  };
}

function updateRow(state: DishState, rowId: string, fn: (row: DishRow) => DishRow): DishState {
  return { ...state, rows: state.rows.map((r) => (r.id === rowId ? fn(r) : r)) };
}

export function dishReducer(state: DishState, action: DishAction): DishState {
  switch (action.type) {
    case 'setName':
      // Новый текст в поле — продукт больше не выбран, значения строки сбрасываются.
      return updateRow(state, action.rowId, (r) => ({
        id: r.id,
        name: action.name,
        weight: r.weight,
      }));
    case 'pick': {
      const p = action.product;
      return updateRow(state, action.rowId, (r) => ({
        id: r.id,
        name: p.name,
        weight: r.weight,
        per100: { kcal: p.kcal, protein: p.protein, fat: p.fat, carbs: p.carbs },
        source: p.source,
        ...(p.productId ? { productId: p.productId } : {}),
        ...(p.barcode ? { barcode: p.barcode } : {}),
        ...(p.externalId ? { externalId: p.externalId } : {}),
      }));
    }
    case 'setWeight':
      return updateRow(state, action.rowId, (r) => ({ ...r, weight: action.weight }));
    case 'committed':
      // Пока шла запись в справочник, пользователь мог выбрать другой продукт.
      return updateRow(state, action.rowId, (r) =>
        r.per100 && r.name === action.expectedName
          ? { ...r, productId: action.productId, committed: true }
          : r,
      );
    case 'addRow':
      return { ...state, rows: [...state.rows, emptyRow()] };
    case 'removeRow': {
      const rows = state.rows.filter((r) => r.id !== action.rowId);
      // Таблица не остаётся пустой: в ней всегда есть хотя бы одна строка для ввода.
      return { ...state, rows: rows.length > 0 ? rows : [emptyRow()] };
    }
    case 'clear':
      return initialDishState();
    case 'setCookedWeight':
      return { ...state, cookedWeight: action.value };
    case 'setPortionWeight':
      return { ...state, portionWeight: action.value };
    case 'setDishName':
      return { ...state, name: action.value };
    case 'setNote':
      return { ...state, note: action.value };
    case 'replace':
      return action.state;
  }
}

/** Строка готова к записи в справочник: есть продукт, вес больше нуля, запись ещё не сделана. */
export function needsCommit(row: DishRow): boolean {
  const weight = parseWeight(row.weight);
  return !!row.per100 && !row.committed && weight != null && weight > 0;
}

/** В таблице есть что терять: хотя бы одно заполненное поле. */
export function hasContent(state: DishState): boolean {
  return (
    state.rows.some((r) => r.name.trim() !== '' || r.weight.trim() !== '') ||
    state.cookedWeight.trim() !== '' ||
    state.portionWeight.trim() !== ''
  );
}
