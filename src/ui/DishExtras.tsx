import { useState } from 'react';
import {
  dishWeight,
  formatNutrient,
  formatWeight,
  NUTRIENT_KEYS,
  per100,
  portion,
  sanitizeDecimalInput,
  totals,
} from '../calc';
import { dishToCsv } from '../dish/csv';
import type { DishAction, DishState } from '../dish/state';
import { downloadText, safeFileName } from '../lib/download';
import { saveRecipe } from '../storage/recipes';
import { SHORT_LABELS } from './columns';
import { MacroChart } from './MacroChart';

export interface DishExtrasProps {
  state: DishState;
  dispatch: (action: DishAction) => void;
}

/** Блоки под таблицей: порция, диаграмма БЖУ, название и заметка, сохранение и экспорт. */
export function DishExtras({ state, dispatch }: DishExtrasProps) {
  const [message, setMessage] = useState('');
  const total = totals(state.rows);
  const baseWeight = dishWeight(total.weight, state.cookedWeight);
  const portionValues = portion(total.nutrients, baseWeight, state.portionWeight);
  const perHundred = per100(total.nutrients, total.weight);
  const usesCooked = state.cookedWeight.trim() !== '' && baseWeight != null;

  async function save() {
    try {
      const id = await saveRecipe(state);
      // Отдельное действие, а не замена состояния: правки во время сохранения не теряются.
      dispatch({ type: 'setRecipeId', value: id });
      setMessage(state.recipeId ? 'Рецепт обновлён.' : 'Рецепт сохранён в «Мои рецепты».');
    } catch {
      setMessage('Не удалось сохранить рецепт.');
    }
  }

  return (
    <div className="dish-extras">
      <section className="card" aria-labelledby="portion-title">
        <h2 id="portion-title">Порция</h2>
        <label className="field">
          <span>Вес порции, г</span>
          <input
            className="input input-number input-short"
            inputMode="decimal"
            value={state.portionWeight}
            onChange={(e) =>
              dispatch({ type: 'setPortionWeight', value: sanitizeDecimalInput(e.target.value, 1) })
            }
          />
        </label>
        <dl className="portion-values" aria-live="polite">
          {NUTRIENT_KEYS.map((key) => (
            <div key={key}>
              <dt>{SHORT_LABELS[key]}</dt>
              <dd>{formatNutrient(key, portionValues?.[key])}</dd>
            </div>
          ))}
        </dl>
        <p className="hint">
          {baseWeight == null
            ? 'Добавьте продукты с весом, чтобы посчитать порцию.'
            : usesCooked
              ? `Порция считается от веса готового блюда: ${formatWeight(baseWeight)} г.`
              : `Вес готового блюда не задан. Порция считается от суммы весов: ${formatWeight(baseWeight)} г.`}
        </p>
      </section>

      <section className="card" aria-labelledby="macro-title">
        <h2 id="macro-title">БЖУ блюда</h2>
        <MacroChart nutrients={perHundred} />
      </section>

      <section className="card dish-meta" aria-labelledby="meta-title">
        <h2 id="meta-title">Рецепт</h2>
        <label className="field">
          <span>Название блюда</span>
          <input
            className="input"
            value={state.name}
            placeholder="Например, гречка с курицей"
            onChange={(e) => dispatch({ type: 'setDishName', value: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Заметка</span>
          <textarea
            className="input textarea"
            rows={3}
            value={state.note}
            onChange={(e) => dispatch({ type: 'setNote', value: e.target.value })}
          />
        </label>
        <div className="form-actions form-actions-start no-print">
          <button type="button" className="button button-primary" onClick={() => void save()}>
            {state.recipeId ? 'Обновить рецепт' : 'Сохранить в рецепты'}
          </button>
          <button
            type="button"
            className="button"
            onClick={() =>
              downloadText(`${safeFileName(state.name, 'блюдо')}.csv`, dishToCsv(state), 'text/csv')
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
      </section>
    </div>
  );
}
