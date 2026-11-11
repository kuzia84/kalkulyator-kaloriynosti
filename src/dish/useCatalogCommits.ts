import { useEffect, useRef } from 'react';
import { commitUsage } from '../catalog/catalog';
import type { DishRow } from '../storage/schema';
import { needsCommit, type DishAction } from './state';

/**
 * Записывает в справочник строки с продуктом и весом больше нуля (ранг, новый продукт).
 * Общий код калькулятора и экрана правки рецепта. `enabled` = false — эффект ждёт.
 */
export function useCatalogCommits(
  rows: readonly DishRow[],
  dispatch: (action: DishAction) => void,
  enabled: boolean,
): void {
  // pickId выбора → id записи справочника. Выбор пишется в справочник один раз,
  // даже если строку удалили и вернули отменой, пока шёл запрос.
  const committedPicks = useRef(new Map<string, Promise<string>>());

  useEffect(() => {
    if (!enabled) return;
    for (const row of rows) {
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
  }, [rows, enabled, dispatch]);
}
