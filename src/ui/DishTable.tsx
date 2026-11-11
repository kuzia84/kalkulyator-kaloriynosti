import { useId } from 'react';
import {
  formatNutrient,
  formatWeight,
  isCookedHeavier,
  macroEnergyShare,
  NUTRIENT_KEYS,
  parseWeight,
  per100,
  per100Cooked,
  sanitizeDecimalInput,
  totals,
  type Nutrients,
} from '../calc';
import { pickAction, type DishAction, type DishState, type PickedProduct } from '../dish/state';
import { COLUMN_LABELS, HEAD_LABELS, LETTER_LABELS, SHORT_LABELS } from './columns';
import { PlusIcon, ScanIcon } from './icons';
import { IngredientRow } from './IngredientRow';

export interface DishTableProps {
  state: DishState;
  dispatch: (action: DishAction) => void;
  onRemoveRow: (rowId: string) => void;
  onManual: (rowId: string, name: string) => void;
  onBarcode: (rowId: string) => void;
  /** Кнопка штрихкода рядом с «Добавить ингредиент»: продукт встаёт в свободную строку. */
  onScanNew: () => void;
}

function NutrientCells({ values, label }: { values: Nutrients | null; label: string }) {
  return (
    <>
      {NUTRIENT_KEYS.map((key) => (
        <td
          key={key}
          className={`cell-number cell-${key}`}
          data-label={SHORT_LABELS[key]}
          data-letter={LETTER_LABELS[key]}
        >
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
  onRemoveRow,
  onManual,
  onBarcode,
  onScanNew,
}: DishTableProps) {
  const cookedHintId = useId();
  const total = totals(state.rows);
  const hasWeight = total.weight > 0;
  const perHundred = per100(total.nutrients, total.weight);
  const perHundredCooked = per100Cooked(total.nutrients, state.cookedWeight);
  const cookedHeavier = isCookedHeavier(total.weight, state.cookedWeight);
  const cooked = parseWeight(state.cookedWeight);
  const share = hasWeight ? macroEnergyShare(total.nutrients) : null;
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
          <th scope="col">{HEAD_LABELS.name}</th>
          <th scope="col">{HEAD_LABELS.weight}</th>
          <th scope="col">{HEAD_LABELS.kcal}</th>
          <th scope="col">{HEAD_LABELS.protein}</th>
          <th scope="col">{HEAD_LABELS.fat}</th>
          <th scope="col">{HEAD_LABELS.carbs}</th>
        </tr>
      </thead>
      <tbody>
        {state.rows.map((row, index) => (
          <IngredientRow
            key={row.id}
            row={row}
            index={index}
            onNameChange={onNameChange}
            onPick={onPick}
            onWeightChange={onWeightChange}
            onRemove={onRemoveRow}
            onManual={onManual}
            onBarcode={onBarcode}
          />
        ))}
      </tbody>
      <tbody className="dish-summary">
        <tr className="row-add">
          <td colSpan={6}>
            <div className="add-row">
              <button
                type="button"
                className="button button-add"
                onClick={() => dispatch({ type: 'addRow' })}
              >
                <PlusIcon />
                Добавить ингредиент
              </button>
              <button
                type="button"
                className="button button-scan"
                onClick={onScanNew}
                aria-label="Новый продукт по штрихкоду"
              >
                <ScanIcon />
                <span className="button-scan-text">Штрихкод</span>
              </button>
            </div>
          </td>
        </tr>
        <tr className="row-total">
          <th scope="row">
            <span className="total-label">
              Итого
              {hasWeight ? (
                <span className="summary-weight"> · {formatWeight(total.weight)} г</span>
              ) : null}
            </span>
            {/* Полоса долей БЖУ в калорийности: на телефоне она стоит в плавающем итоге. */}
            <span className="total-bar" aria-hidden="true">
              {share ? (
                <>
                  <i className="bar-protein" style={{ width: `${share.protein}%` }} />
                  <i className="bar-fat" style={{ width: `${share.fat}%` }} />
                  <i className="bar-carbs" style={{ width: `${share.carbs}%` }} />
                </>
              ) : null}
            </span>
          </th>
          <td className="cell-number cell-weight" data-label={SHORT_LABELS.weight}>
            <output aria-label="Общий вес, г">
              {formatWeight(hasWeight ? total.weight : null)}
            </output>
          </td>
          <NutrientCells values={hasWeight ? total.nutrients : null} label="итого" />
        </tr>
        <tr className="row-per100">
          <th scope="row">На 100 г блюда</th>
          <td className="cell-number cell-weight" data-label={SHORT_LABELS.weight}>
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
          <td className="cell-weight">
            <span className="weight-field">
              <span className="weight-field-label" aria-hidden="true">
                Вес после варки
              </span>
              <input
                id={`${cookedHintId}-input`}
                className="input input-number"
                inputMode="decimal"
                enterKeyHint="done"
                placeholder="—"
                aria-describedby={cookedHintId}
                value={state.cookedWeight}
                onChange={(e) =>
                  dispatch({
                    type: 'setCookedWeight',
                    value: sanitizeDecimalInput(e.target.value, 1),
                  })
                }
              />
              <span className="weight-field-unit" aria-hidden="true">
                г
              </span>
            </span>
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
