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

/**
 * Состояние текущего блюда.
 * - При запуске читает черновик.
 * - После каждого изменения сохраняет черновик.
 * - Строку с продуктом и весом больше нуля записывает в справочник (ранг, новый продукт).
 */
export function useDish(): UseDish {
  const [state, dispatch] = useReducer(dishReducer, undefined, initialDishState);
  const [ready, setReady] = useState(false);
  const inFlight = useRef(new Set<string>());

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
    saveDraft(state).catch((error: unknown) =>
      console.error('Не удалось сохранить черновик', error),
    );
  }, [state, ready]);

  useEffect(() => {
    if (!ready) return;
    for (const row of state.rows) {
      if (!needsCommit(row) || !row.per100) continue;
      // Ключ — строка и продукт: пока запрос идёт, повторный ввод веса не создаёт второй запрос.
      const key = `${row.id}:${row.name}:${row.source}:${row.productId ?? row.externalId ?? ''}`;
      if (inFlight.current.has(key)) continue;
      inFlight.current.add(key);
      commitUsage({
        name: row.name,
        ...row.per100,
        source: row.source ?? 'user',
        ...(row.productId ? { productId: row.productId } : {}),
        ...(row.barcode ? { barcode: row.barcode } : {}),
        ...(row.externalId ? { externalId: row.externalId } : {}),
      })
        .then((productId) =>
          dispatch({ type: 'committed', rowId: row.id, productId, expectedName: row.name }),
        )
        .catch((error: unknown) => console.error('Не удалось записать продукт в справочник', error))
        .finally(() => inFlight.current.delete(key));
    }
  }, [state.rows, ready]);

  return { state, dispatch, ready };
}
