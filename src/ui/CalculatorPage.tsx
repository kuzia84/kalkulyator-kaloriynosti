import { useState } from 'react';
import { hasContent } from '../dish/state';
import type { UseDish } from '../dish/useDish';
import { DishTable } from './DishTable';
import { Modal } from './Modal';
import { ProductForm } from './ProductForm';
import type { UndoEntry } from './UndoToast';

export interface CalculatorPageProps {
  dish: UseDish;
  suggestionsLimit: number;
  offerUndo: (entry: UndoEntry) => void;
}

export function CalculatorPage({ dish, suggestionsLimit, offerUndo }: CalculatorPageProps) {
  const { state, dispatch } = dish;
  const [manual, setManual] = useState<{ rowId: string; name: string } | null>(null);

  function removeRow(rowId: string) {
    const snapshot = state;
    const row = state.rows.find((r) => r.id === rowId);
    dispatch({ type: 'removeRow', rowId });
    offerUndo({
      message: row?.name ? `Строка «${row.name}» удалена.` : 'Строка удалена.',
      undo: () => dispatch({ type: 'replace', state: snapshot }),
    });
  }

  function clearTable() {
    const snapshot = state;
    dispatch({ type: 'clear' });
    offerUndo({
      message: 'Таблица очищена.',
      undo: () => dispatch({ type: 'replace', state: snapshot }),
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
          suggestionsLimit={suggestionsLimit}
          onRemoveRow={removeRow}
          onManual={(rowId, name) => setManual({ rowId, name })}
        />
      </div>
      {manual ? (
        <Modal title="Новый продукт" onClose={() => setManual(null)}>
          <ProductForm
            initial={{ name: manual.name }}
            submitLabel="Добавить в таблицу"
            onCancel={() => setManual(null)}
            onSubmit={(value) => {
              dispatch({
                type: 'pick',
                rowId: manual.rowId,
                product: { ...value, source: 'user' },
              });
              setManual(null);
            }}
          />
        </Modal>
      ) : null}
    </section>
  );
}
