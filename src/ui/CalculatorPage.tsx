import { useEffect, useRef, useState } from 'react';
import { hasContent, initialDishState, pickAction, type DishState } from '../dish/state';
import type { UseDish } from '../dish/useDish';
import { BarcodeDialog } from './BarcodeDialog';
import { DishTable } from './DishTable';
import { Modal } from './Modal';
import { ProductForm } from './ProductForm';
import type { UndoEntry } from './UndoToast';

export interface CalculatorPageProps {
  dish: UseDish;
  offerUndo: (entry: UndoEntry) => void;
  dismissUndo: () => void;
}

export function CalculatorPage({ dish, offerUndo, dismissUndo }: CalculatorPageProps) {
  const { state, dispatch } = dish;
  const [manual, setManual] = useState<{ rowId: string; name: string; barcode?: string } | null>(
    null,
  );
  const [barcodeRow, setBarcodeRow] = useState<string | null>(null);
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
        <h1 id="calc-title">Калькулятор калорийности блюда</h1>
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
      <div className="table-wrap">
        <DishTable
          state={state}
          dispatch={dispatch}
          onRemoveRow={removeRow}
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
    </section>
  );
}
