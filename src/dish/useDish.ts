import { useEffect, useReducer, useRef, useState } from 'react';
import { commitUsage } from '../catalog/catalog';
import { loadDraft, saveDraft } from '../storage/draft';
import {
  dishReducer,
  initialDishState,
  needsCommit,
  type DishAction,
  type DishState,
} from './state';

export interface UseDish {
  state: DishState;
  dispatch: (action: DishAction) => void;
  /** Черновик прочитан из IndexedDB. До этого таблица не показывается. */
  ready: boolean;
}

/** Пауза перед записью черновика: при наборе текста запись идёт раз за паузу, а не на каждую букву. */
export const DRAFT_SAVE_DELAY_MS = 300;

/**
 * Состояние текущего блюда.
 * - При запуске читает черновик.
 * - После каждого изменения сохраняет черновик (с паузой 300 мс и сразу при уходе со страницы).
 * - Строку с продуктом и весом больше нуля записывает в справочник (ранг, новый продукт).
 */
export function useDish(): UseDish {
  const [state, dispatch] = useReducer(dishReducer, undefined, initialDishState);
  const [ready, setReady] = useState(false);
  // pickId выбора → id записи справочника. Выбор пишется в справочник один раз,
  // даже если строку удалили и вернули отменой, пока шёл запрос.
  const committedPicks = useRef(new Map<string, Promise<string>>());
  const latest = useRef(state);
  latest.current = state;

  useEffect(() => {
    let cancelled = false;
    loadDraft()
      .then((draft) => {
        if (draft && !cancelled) dispatch({ type: 'replace', state: draft });
      })
      .catch((error: unknown) => console.error('Не удалось прочитать черновик', error))
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const save = () =>
      saveDraft(latest.current).catch((error: unknown) =>
        console.error('Не удалось сохранить черновик', error),
      );
    const timer = setTimeout(save, DRAFT_SAVE_DELAY_MS);
    const flush = () => {
      if (document.visibilityState === 'hidden') save();
    };
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', flush);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', flush);
    };
  }, [state, ready]);

  useEffect(() => {
    if (!ready) return;
    for (const row of state.rows) {
      if (!needsCommit(row) || !row.per100 || !row.pickId) continue;
      const pickId = row.pickId;
      let pending = committedPicks.current.get(pickId);
      if (!pending) {
        pending = commitUsage({
          name: row.name,
          ...row.per100,
          source: row.source ?? 'user',
          ...(row.productId ? { productId: row.productId } : {}),
          ...(row.barcode ? { barcode: row.barcode } : {}),
          ...(row.externalId ? { externalId: row.externalId } : {}),
        });
        committedPicks.current.set(pickId, pending);
        pending.catch((error: unknown) => {
          committedPicks.current.delete(pickId);
          console.error('Не удалось записать продукт в справочник', error);
        });
      }
      pending
        .then((productId) => dispatch({ type: 'committed', rowId: row.id, productId, pickId }))
        .catch(() => {});
    }
  }, [state.rows, ready]);

  return { state, dispatch, ready };
}
