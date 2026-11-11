import { dishToCsv } from '../dish/csv';
import type { DishAction, DishState } from '../dish/state';
import { downloadText, safeFileName } from '../lib/download';
import { DishSummary } from './DishSummary';

export interface DishExtrasProps {
  state: DishState;
  dispatch: (action: DishAction) => void;
}

/** Блоки рядом с таблицей калькулятора: итоги, порция, название и заметка, экспорт. */
export function DishExtras({ state, dispatch }: DishExtrasProps) {
  return (
    <DishSummary
      state={state}
      dispatch={dispatch}
      actions={
        <div className="form-actions form-actions-start no-print">
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
      }
    />
  );
}
