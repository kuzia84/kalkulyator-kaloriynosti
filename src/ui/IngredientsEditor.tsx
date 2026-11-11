import { useState } from 'react';
import { emptyRow, pickAction, type DishAction, type DishState } from '../dish/state';
import { suggestionFromProduct } from '../search/types';
import type { Product } from '../storage/schema';
import { AddProductDialog } from './AddProductDialog';
import { DishTable } from './DishTable';
import { Modal } from './Modal';
import { ProductForm } from './ProductForm';

export interface IngredientsEditorProps {
  state: DishState;
  dispatch: (action: DishAction) => void;
  onRemoveRow: (rowId: string) => void;
}

/**
 * Таблица ингредиентов с окнами ручного ввода продукта и «Новый продукт».
 * «Новый продукт» — то же окно, что в справочнике, только запись сразу встаёт в строку.
 * Общая часть калькулятора и экрана правки рецепта.
 */
export function IngredientsEditor({ state, dispatch, onRemoveRow }: IngredientsEditorProps) {
  const [manual, setManual] = useState<{ rowId: string; name: string } | null>(null);
  const [searchRowId, setSearchRowId] = useState<string | null>(null);
  const searchRow = state.rows.find((r) => r.id === searchRowId);
  // Окно штрихкода открыто кнопкой под таблицей. Строку, которую добавили только для него,
  // убираем, если продукт так и не выбрали.
  const [scan, setScan] = useState<{ addedRowId: string | null } | null>(null);

  function scanNew() {
    const free = state.rows.find((r) => !r.per100 && r.name.trim() === '');
    if (free) {
      setScan({ addedRowId: null });
      setSearchRowId(free.id);
      return;
    }
    const row = emptyRow();
    dispatch({ type: 'insertRow', row, index: state.rows.length });
    setScan({ addedRowId: row.id });
    setSearchRowId(row.id);
  }

  function pickIntoRow(rowId: string, product: Product) {
    dispatch(pickAction(rowId, suggestionFromProduct(product)));
    setScan(null);
    setSearchRowId(null);
  }

  function closeSearch() {
    const added = scan?.addedRowId;
    const row = state.rows.find((r) => r.id === added);
    if (row && !row.per100 && row.name.trim() === '' && row.weight.trim() === '') {
      dispatch({ type: 'removeRow', rowId: row.id });
    }
    setScan(null);
    setSearchRowId(null);
  }

  return (
    <>
      <div className="table-wrap">
        <DishTable
          state={state}
          dispatch={dispatch}
          onRemoveRow={onRemoveRow}
          onManual={(rowId, name) => setManual({ rowId, name })}
          onBarcode={setSearchRowId}
          onScanNew={scanNew}
        />
      </div>
      {manual ? (
        <Modal title="Новый продукт" onClose={() => setManual(null)}>
          <ProductForm
            initial={{ name: manual.name }}
            submitLabel="Добавить в таблицу"
            onCancel={() => setManual(null)}
            onSubmit={(value) => {
              dispatch(pickAction(manual.rowId, { ...value, source: 'user' }));
              setManual(null);
            }}
          />
        </Modal>
      ) : null}
      {searchRow ? (
        <AddProductDialog
          initialName={searchRow.per100 ? '' : searchRow.name}
          submitLabel="Добавить в таблицу"
          existingLabel="Добавить в таблицу"
          barcodeHint="Найдите продукт по коду. Продукт из справочника сразу встанет в строку, новый заполнит форму."
          onClose={closeSearch}
          initialMode={scan ? 'barcode' : 'manual'}
          onAdded={(product) => pickIntoRow(searchRow.id, product)}
          onExisting={(product) => pickIntoRow(searchRow.id, product)}
        />
      ) : null}
    </>
  );
}
