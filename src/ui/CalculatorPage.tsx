import { useEffect, useRef } from 'react';
import { hasContent, initialDishState, type DishState } from '../dish/state';
import type { UseDish } from '../dish/useDish';
import { DishExtras } from './DishExtras';
import { IngredientsEditor } from './IngredientsEditor';
import type { UndoEntry } from './UndoToast';

export interface CalculatorPageProps {
  dish: UseDish;
  offerUndo: (entry: UndoEntry) => void;
  dismissUndo: () => void;
}

export function CalculatorPage({ dish, offerUndo, dismissUndo }: CalculatorPageProps) {
  const { state, dispatch } = dish;
  // Состояние сразу после очистки. Любая следующая правка убирает возможность вернуть таблицу:
  // иначе отмена стёрла бы то, что пользователь ввёл после очистки.
  const clearedState = useRef<DishState | null>(null);

  useEffect(() => {
    if (clearedState.current && clearedState.current !== state) {
      clearedState.current = null;
      dismissUndo();
    }
  }, [state, dismissUndo]);

  function removeRow(rowId: string) {
    const index = state.rows.findIndex((r) => r.id === rowId);
    const row = state.rows[index];
    if (!row) return;
    clearedState.current = null;
    dispatch({ type: 'removeRow', rowId });
    // Отмена возвращает только эту строку на её место, остальные правки сохраняются.
    offerUndo({
      message: row.name ? `Строка «${row.name}» удалена.` : 'Строка удалена.',
      undo: () => dispatch({ type: 'insertRow', row, index }),
    });
  }

  function clearTable() {
    const snapshot = state;
    const cleared = initialDishState();
    clearedState.current = cleared;
    dispatch({ type: 'replace', state: cleared });
    offerUndo({
      message: 'Таблица очищена.',
      undo: () => {
        clearedState.current = null;
        dispatch({ type: 'replace', state: snapshot });
      },
    });
  }

  return (
    <section aria-labelledby="calc-title">
      <div className="page-header">
        <h1 className="page-title" tabIndex={-1} id="calc-title">
          Калькулятор калорийности блюда
        </h1>
        <div className="page-actions">
          <button
            type="button"
            className="button"
            onClick={clearTable}
            disabled={!hasContent(state)}
          >
            Очистить таблицу
          </button>
        </div>
      </div>
      <p className="hint">
        Начните вводить название продукта и выберите его из списка. Затем введите вес в граммах —
        калорийность и БЖУ посчитаются сразу.
      </p>
      <IngredientsEditor state={state} dispatch={dispatch} onRemoveRow={removeRow} />
      <DishExtras state={state} dispatch={dispatch} />
    </section>
  );
}
