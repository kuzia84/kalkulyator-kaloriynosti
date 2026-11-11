import { useEffect, useRef, useState } from 'react';
import { formatWeight, totals } from '../calc';
import { hasContent, initialDishState, type DishState } from '../dish/state';
import type { UseDish } from '../dish/useDish';
import { saveRecipe } from '../storage/recipes';
import { DishExtras } from './DishExtras';
import { HeaderActions } from './HeaderActions';
import { TrashIcon } from './icons';
import { IngredientsEditor } from './IngredientsEditor';
import { ingredientsCount } from './plural';
import type { UndoEntry } from './UndoToast';

export interface CalculatorPageProps {
  dish: UseDish;
  offerUndo: (entry: UndoEntry) => void;
  dismissUndo: () => void;
}

export function CalculatorPage({ dish, offerUndo, dismissUndo }: CalculatorPageProps) {
  const { state, dispatch } = dish;
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const total = totals(state.rows);
  const filled = state.rows.filter((r) => r.per100).length;

  async function save() {
    // Второе нажатие во время сохранения создало бы второй рецепт.
    if (saving) return;
    setSaving(true);
    const linked = state.recipeId;
    try {
      const id = await saveRecipe(state);
      // Отдельное действие, а не замена состояния: правки во время сохранения не теряются.
      dispatch({ type: 'setRecipeId', value: id });
      setMessage(linked === id ? 'Рецепт обновлён.' : 'Рецепт сохранён в «Мои рецепты».');
    } catch {
      setMessage('Не удалось сохранить рецепт.');
    } finally {
      setSaving(false);
    }
  }
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
      <HeaderActions>
        <button
          type="button"
          className="button button-clear"
          onClick={clearTable}
          disabled={!hasContent(state)}
          aria-label="Очистить таблицу"
        >
          <TrashIcon />
          <span className="button-clear-text">Очистить</span>
        </button>
        <button
          type="button"
          className="button button-primary"
          disabled={saving}
          onClick={() => void save()}
        >
          {state.recipeId ? 'Обновить рецепт' : 'Сохранить в рецепты'}
        </button>
      </HeaderActions>
      <div className="page-header">
        <h1 className="page-title" tabIndex={-1} id="calc-title">
          {state.name.trim() || 'Новое блюдо'}
        </h1>
        <p className="page-subtitle">
          {filled > 0
            ? `${ingredientsCount(filled)} · ${formatWeight(total.weight)} г`
            : 'Калькулятор калорийности блюда'}
        </p>
        {/* Итог сохранения — у заголовка, рядом с кнопкой «Сохранить» в шапке. */}
        <p className="save-status" role="status">
          {message}
        </p>
      </div>
      {!hasContent(state) ? (
        <p className="hint">
          Начните вводить название продукта и выберите его из списка. Затем введите вес в граммах —
          калорийность и БЖУ посчитаются сразу.
        </p>
      ) : null}
      <div className="calc-layout">
        <IngredientsEditor state={state} dispatch={dispatch} onRemoveRow={removeRow} />
        <DishExtras state={state} dispatch={dispatch} />
      </div>
    </section>
  );
}
