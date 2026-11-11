import { useCallback, useState } from 'react';
import { formatNutrient, NUTRIENT_KEYS, rowNutrients, sanitizeDecimalInput } from '../calc';
import type { PickedProduct } from '../dish/state';
import { SOURCE_LABELS, type DishRow } from '../storage/schema';
import type { Suggestion } from '../search/types';
import { useSuggestions } from '../search/useSuggestions';
import { useOnline } from '../app/useOnline';
import { useSettings } from '../app/settingsContext';
import { ActionMenu } from './ActionMenu';
import { ProductCombobox } from './ProductCombobox';
import { COLUMN_LABELS, SHORT_LABELS } from './columns';

export interface IngredientRowProps {
  row: DishRow;
  index: number;
  onNameChange: (rowId: string, name: string) => void;
  onPick: (rowId: string, product: PickedProduct) => void;
  onWeightChange: (rowId: string, weight: string) => void;
  onRemove: (rowId: string) => void;
  onManual: (rowId: string, name: string) => void;
  onBarcode: (rowId: string) => void;
}

const NO_ITEMS: Suggestion[] = [];

/**
 * Строка ингредиента. На десктопе — строка таблицы, на телефоне — карточка:
 * название, затем вес и калории, затем три плашки БЖУ. Раскладку задаёт CSS.
 */
export function IngredientRow(props: IngredientRowProps) {
  const { row, index, onNameChange, onPick, onWeightChange, onRemove, onManual, onBarcode } = props;
  const [open, setOpen] = useState(false);
  // Подсказки ищутся, только пока продукт не выбран: выбранное название — не запрос.
  const query = row.per100 ? '' : row.name;
  const { settings } = useSettings();
  const online = useOnline();
  const { items, loading, notice } = useSuggestions(query, open, settings, online);
  const values = rowNutrients(row);
  const number = index + 1;
  const onOpenChange = useCallback((v: boolean) => setOpen(v), []);

  return (
    <tr className={`ingredient-row${open ? ' is-open' : ''}`}>
      <td className="cell-name">
        <div className="name-cell">
          <div className="name-main">
            <ProductCombobox
              value={row.name}
              label={`Ингредиент ${number}`}
              items={row.per100 ? NO_ITEMS : items}
              loading={!row.per100 && loading}
              selected={!!row.per100}
              {...(!row.per100 && notice ? { notice } : {})}
              onChange={(text) => onNameChange(row.id, text)}
              onPick={(s) => onPick(row.id, s)}
              onManual={(text) => onManual(row.id, text)}
              onOpenChange={onOpenChange}
            />
            {row.per100 ? (
              <span className="ingredient-source">
                {row.source ? `${SOURCE_LABELS[row.source]} · ` : ''}на 100 г:{' '}
                {formatNutrient('kcal', row.per100.kcal)} ккал
              </span>
            ) : null}
          </div>
          <ActionMenu
            label={`Действия, строка ${number}`}
            items={[
              {
                label: 'Новый продукт…',
                ariaLabel: `Новый продукт, строка ${number}`,
                onSelect: () => onBarcode(row.id),
              },
              {
                label: 'Удалить строку',
                ariaLabel: `Удалить строку ${number}`,
                danger: true,
                onSelect: () => onRemove(row.id),
              },
            ]}
          />
        </div>
      </td>
      <td className="cell-weight">
        <label className="weight-field">
          <span className="weight-field-label" aria-hidden="true">
            Вес
          </span>
          <input
            className="input input-number"
            inputMode="decimal"
            enterKeyHint="done"
            aria-label={`Вес ингредиента ${number}, г`}
            placeholder="0"
            value={row.weight}
            onChange={(e) => onWeightChange(row.id, sanitizeDecimalInput(e.target.value, 2))}
          />
          <span className="weight-field-unit" aria-hidden="true">
            г
          </span>
        </label>
      </td>
      {NUTRIENT_KEYS.map((key) => (
        <td key={key} className={`cell-number cell-${key}`} data-label={SHORT_LABELS[key]}>
          <output aria-label={`${COLUMN_LABELS[key]}, ингредиент ${number}`}>
            {formatNutrient(key, values?.[key])}
          </output>
        </td>
      ))}
    </tr>
  );
}
