import { dishToCsv } from '../dish/csv';
import type { DishAction, DishState } from '../dish/state';
import { downloadText, safeFileName } from '../lib/download';
import { DishSummary } from './DishSummary';

export interface DishExtrasProps {
  state: DishState;
  dispatch: (action: DishAction) => void;
  saving: boolean;
  /** Итог «Сохранить как новый рецепт»: показывается под кнопками. */
  saveAsNewStatus: string;
  /** «Сохранить как новый рецепт»: видна, только если блюдо открыто из рецепта. */
  onSaveAsNew: () => void;
}

/** Блоки рядом с таблицей калькулятора: итоги, порция, название и заметка, экспорт. */
export function DishExtras({
  state,
  dispatch,
  saving,
  saveAsNewStatus,
  onSaveAsNew,
}: DishExtrasProps) {
  return (
    <DishSummary
      state={state}
      dispatch={dispatch}
      actions={
        <div className="form-actions form-actions-start no-print">
          {state.recipeId ? (
            <button type="button" className="button" disabled={saving} onClick={onSaveAsNew}>
              Сохранить как новый рецепт
            </button>
          ) : null}
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
          <p className="save-status save-status-extras" role="status">
            {saveAsNewStatus}
          </p>
        </div>
      }
    />
  );
}
