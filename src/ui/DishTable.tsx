import { useId } from 'react';
import {
  formatNutrient,
  formatWeight,
  isCookedHeavier,
  NUTRIENT_KEYS,
  parseWeight,
  per100,
  per100Cooked,
  sanitizeDecimalInput,
  totals,
  type Nutrients,
} from '../calc';
import { pickAction, type DishAction, type DishState, type PickedProduct } from '../dish/state';
import { COLUMN_LABELS, SHORT_LABELS } from './columns';
import { IngredientRow } from './IngredientRow';

export interface DishTableProps {
  state: DishState;
  dispatch: (action: DishAction) => void;
  suggestionsLimit: number;
  onRemoveRow: (rowId: string) => void;
  onManual: (rowId: string, name: string) => void;
}

function NutrientCells({ values, label }: { values: Nutrients | null; label: string }) {
  return (
    <>
      {NUTRIENT_KEYS.map((key) => (
        <td key={key} className="cell-number" data-label={SHORT_LABELS[key]}>
          <output aria-label={`${COLUMN_LABELS[key]}, ${label}`}>
            {formatNutrient(key, values?.[key])}
          </output>
        </td>
      ))}
    </>
  );
}

export function DishTable({
  state,
  dispatch,
  suggestionsLimit,
  onRemoveRow,
  onManual,
}: DishTableProps) {
  const cookedHintId = useId();
  const total = totals(state.rows);
  const hasWeight = total.weight > 0;
  const perHundred = per100(total.nutrients, total.weight);
  const perHundredCooked = per100Cooked(total.nutrients, state.cookedWeight);
  const cookedHeavier = isCookedHeavier(total.weight, state.cookedWeight);
  const cooked = parseWeight(state.cookedWeight);
  const loss = cooked != null && cooked > 0 && hasWeight ? (1 - cooked / total.weight) * 100 : null;

  const onNameChange = (rowId: string, name: string) => dispatch({ type: 'setName', rowId, name });
  const onPick = (rowId: string, product: PickedProduct) => dispatch(pickAction(rowId, product));
  const onWeightChange = (rowId: string, weight: string) =>
    dispatch({ type: 'setWeight', rowId, weight });

  return (
    <table className="dish-table">
      <caption className="visually-hidden">Ингредиенты блюда и расчёт калорийности</caption>
      <thead>
        <tr>
          <th scope="col">{COLUMN_LABELS.name}</th>
          <th scope="col">{COLUMN_LABELS.weight}</th>
          <th scope="col">{COLUMN_LABELS.kcal}</th>
          <th scope="col">{COLUMN_LABELS.protein}</th>
          <th scope="col">{COLUMN_LABELS.fat}</th>
          <th scope="col">{COLUMN_LABELS.carbs}</th>
        </tr>
      </thead>
      <tbody>
        {state.rows.map((row, index) => (
          <IngredientRow
            key={row.id}
            row={row}
            index={index}
            suggestionsLimit={suggestionsLimit}
            onNameChange={onNameChange}
            onPick={onPick}
            onWeightChange={onWeightChange}
            onRemove={onRemoveRow}
            onManual={onManual}
          />
        ))}
      </tbody>
      <tbody className="dish-summary">
        <tr className="row-add">
          <td colSpan={6}>
            <button
              type="button"
              className="button button-add"
              onClick={() => dispatch({ type: 'addRow' })}
            >
              + Добавить ингредиент
            </button>
          </td>
        </tr>
        <tr className="row-total">
          <th scope="row">Итого</th>
          <td className="cell-number" data-label={SHORT_LABELS.weight}>
            <output aria-label="Общий вес, г">
              {formatWeight(hasWeight ? total.weight : null)}
            </output>
          </td>
          <NutrientCells values={hasWeight ? total.nutrients : null} label="итого" />
        </tr>
        <tr className="row-per100">
          <th scope="row">На 100 г блюда</th>
          <td className="cell-number" data-label={SHORT_LABELS.weight}>
            {hasWeight ? '100' : '—'}
          </td>
          <NutrientCells values={perHundred} label="на 100 г блюда" />
        </tr>
        <tr className="row-cooked">
          <th scope="row">
            <label htmlFor={`${cookedHintId}-input`}>
              На 100 г готового блюда (с учётом уварки)
            </label>
          </th>
          <td className="cell-weight" data-label="Вес готового блюда, г">
            <input
              id={`${cookedHintId}-input`}
              className="input input-number"
              inputMode="decimal"
              enterKeyHint="done"
              placeholder="г"
              aria-describedby={cookedHintId}
              value={state.cookedWeight}
              onChange={(e) =>
                dispatch({
                  type: 'setCookedWeight',
                  value: sanitizeDecimalInput(e.target.value, 1),
                })
              }
            />
          </td>
          <NutrientCells values={perHundredCooked} label="на 100 г готового блюда" />
        </tr>
        <tr className="row-cooked-hint">
          <td colSpan={6}>
            <p id={cookedHintId} className={cookedHeavier ? 'note' : 'hint'} role="status">
              {cookedHeavier
                ? 'Готовое блюдо тяжелее суммы ингредиентов. Так бывает: крупы и макароны впитывают воду. Калорийность и БЖУ блюда не меняются, а на 100 г их становится меньше.'
                : loss != null
                  ? `Взвесьте готовое блюдо без посуды. При готовке выпарилось ${formatWeight(loss)} % веса.`
                  : 'Взвесьте готовое блюдо без посуды и введите вес в граммах.'}
            </p>
          </td>
        </tr>
      </tbody>
    </table>
  );
}
