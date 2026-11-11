import { useState } from 'react';
import { dishToCsv } from '../dish/csv';
import type { DishAction, DishState } from '../dish/state';
import { downloadText, safeFileName } from '../lib/download';
import { saveRecipe } from '../storage/recipes';
import { DishSummary } from './DishSummary';

export interface DishExtrasProps {
  state: DishState;
  dispatch: (action: DishAction) => void;
}

/** Блоки под таблицей калькулятора: порция, диаграмма БЖУ, название и заметка, сохранение и экспорт. */
export function DishExtras({ state, dispatch }: DishExtrasProps) {
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

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

  return (
    <DishSummary
      state={state}
      dispatch={dispatch}
      actions={
        <>
          <div className="form-actions form-actions-start no-print">
            <button
              type="button"
              className="button button-primary"
              disabled={saving}
              onClick={() => void save()}
            >
              {state.recipeId ? 'Обновить рецепт' : 'Сохранить в рецепты'}
            </button>
            <button
              type="button"
              className="button"
              onClick={() =>
                downloadText(
                  `${safeFileName(state.name, 'блюдо')}.csv`,
                  dishToCsv(state),
                  'text/csv',
                )
              }
            >
              Скачать CSV
            </button>
            <button type="button" className="button" onClick={() => window.print()}>
              Печать
            </button>
          </div>
          {message ? (
            <p className="hint" role="status">
              {message}
            </p>
          ) : null}
        </>
      }
    />
  );
}
