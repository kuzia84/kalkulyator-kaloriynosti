import { useState } from 'react';
import { pickAction, type DishAction, type DishState } from '../dish/state';
import { BarcodeDialog } from './BarcodeDialog';
import { DishTable } from './DishTable';
import { Modal } from './Modal';
import { ProductForm } from './ProductForm';

export interface IngredientsEditorProps {
  state: DishState;
  dispatch: (action: DishAction) => void;
  onRemoveRow: (rowId: string) => void;
}

/**
 * Таблица ингредиентов с окнами ручного ввода продукта и поиска по штрихкоду.
 * Общая часть калькулятора и экрана правки рецепта.
 */
export function IngredientsEditor({ state, dispatch, onRemoveRow }: IngredientsEditorProps) {
  const [manual, setManual] = useState<{ rowId: string; name: string; barcode?: string } | null>(
    null,
  );
  const [barcodeRow, setBarcodeRow] = useState<string | null>(null);

  return (
    <>
      <div className="table-wrap">
        <DishTable
          state={state}
          dispatch={dispatch}
          onRemoveRow={onRemoveRow}
          onManual={(rowId, name) => setManual({ rowId, name })}
          onBarcode={setBarcodeRow}
        />
      </div>
      {manual ? (
        <Modal title="Новый продукт" onClose={() => setManual(null)}>
          <ProductForm
            initial={{ name: manual.name, ...(manual.barcode ? { barcode: manual.barcode } : {}) }}
            submitLabel="Добавить в таблицу"
            onCancel={() => setManual(null)}
            onSubmit={(value) => {
              dispatch(pickAction(manual.rowId, { ...value, source: 'user' }));
              setManual(null);
            }}
          />
        </Modal>
      ) : null}
      {barcodeRow ? (
        <BarcodeDialog
          rowLabel={`Строка ${state.rows.findIndex((r) => r.id === barcodeRow) + 1}`}
          onClose={() => setBarcodeRow(null)}
          onPick={(product) => {
            dispatch(pickAction(barcodeRow, product));
            setBarcodeRow(null);
          }}
          onManual={(barcode) => {
            const row = state.rows.find((r) => r.id === barcodeRow);
            setBarcodeRow(null);
            setManual({ rowId: barcodeRow, name: row?.per100 ? '' : (row?.name ?? ''), barcode });
          }}
        />
      ) : null}
    </>
  );
}
