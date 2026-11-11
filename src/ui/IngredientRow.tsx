import { useCallback, useState } from 'react';
import { formatNutrient, NUTRIENT_KEYS, rowNutrients, sanitizeDecimalInput } from '../calc';
import type { PickedProduct } from '../dish/state';
import type { DishRow } from '../storage/schema';
import type { Suggestion } from '../search/types';
import { useSuggestions } from '../search/useSuggestions';
import { useOnline } from '../app/useOnline';
import { useSettings } from '../app/settingsContext';
import { ProductCombobox } from './ProductCombobox';
import { COLUMN_LABELS, SHORT_LABELS } from './columns';

function BarcodeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M3 5h2v14H3zm3 0h1v14H6zm2 0h2v14H8zm3 0h1v14h-1zm3 0h2v14h-2zm3 0h1v14h-1zm2 0h2v14h-2z"
      />
    </svg>
  );
}

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
      <td className="cell-name" data-label={SHORT_LABELS.name}>
        <div className="name-cell">
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
          <button
            type="button"
            className="button-icon button-barcode"
            aria-label={`Найти по штрихкоду, строка ${number}`}
            title="Найти по штрихкоду"
            onClick={() => onBarcode(row.id)}
          >
            <BarcodeIcon />
          </button>
          <button
            type="button"
            className="button-icon"
            aria-label={`Удалить строку ${number}`}
            title="Удалить строку"
            onClick={() => onRemove(row.id)}
          >
            ×
          </button>
        </div>
      </td>
      <td className="cell-weight" data-label={SHORT_LABELS.weight}>
        <input
          className="input input-number"
          inputMode="decimal"
          enterKeyHint="done"
          aria-label={`Вес ингредиента ${number}, г`}
          placeholder="0"
          value={row.weight}
          onChange={(e) => onWeightChange(row.id, sanitizeDecimalInput(e.target.value, 2))}
        />
      </td>
      {NUTRIENT_KEYS.map((key) => (
        <td key={key} className="cell-number" data-label={SHORT_LABELS[key]}>
          <output aria-label={`${COLUMN_LABELS[key]}, ингредиент ${number}`}>
            {formatNutrient(key, values?.[key])}
          </output>
        </td>
      ))}
    </tr>
  );
}
