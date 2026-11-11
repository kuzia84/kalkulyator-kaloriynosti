import { useCallback, useEffect, useMemo, useState } from 'react';
import { atwaterKcal, formatNutrient, isSuspicious, kcalDeviation, NUTRIENT_KEYS } from '../calc';
import {
  deleteProduct,
  filterProducts,
  mergeProducts,
  restoreProducts,
  updateProduct,
  type ProductFilter,
  type SortDir,
  type SortKey,
} from '../catalog/moderation';
import { db } from '../storage/db';
import { SOURCE_LABELS, type Product, type ProductSource } from '../storage/schema';
import { SHORT_LABELS } from './columns';
import { Modal } from './Modal';
import { ProductForm } from './ProductForm';
import type { UndoEntry } from './UndoToast';

export interface ModerationPageProps {
  offerUndo: (entry: UndoEntry) => void;
}

const PAGE_SIZE = 100;

const SORT_LABELS: Record<SortKey, string> = {
  name: 'Название',
  kcal: 'Ккал',
  protein: 'Белки',
  fat: 'Жиры',
  carbs: 'Углеводы',
  rank: 'Ранг',
  lastUsedAt: 'Использован',
};

const dateFormatter = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short' });

type Dialog =
  | { kind: 'edit'; product: Product }
  | { kind: 'delete'; product: Product }
  | { kind: 'merge'; products: Product[] }
  | null;

function deviationLabel(p: Product): string {
  const d = kcalDeviation(p);
  return Number.isFinite(d) ? `${Math.round(d * 100)} %` : 'нет БЖУ';
}

export function ModerationPage({ offerUndo }: ModerationPageProps) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<ProductFilter>({
    query: '',
    source: 'all',
    verified: 'all',
    suspiciousOnly: false,
  });
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'name', dir: 'asc' });
  const [shown, setShown] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<Dialog>(null);
  const [mergeTarget, setMergeTarget] = useState('');

  const reload = useCallback(async () => {
    try {
      setProducts(await db.products.toArray());
    } catch {
      setError('Не удалось прочитать справочник.');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const visible = useMemo(
    () => (products ? filterProducts(products, filter, sort) : []),
    [products, filter, sort],
  );

  // Выбор для объединения живёт только среди существующих записей.
  useEffect(() => {
    if (!products) return;
    const ids = new Set(products.map((p) => p.id));
    setSelected((prev) => new Set([...prev].filter((id) => ids.has(id))));
  }, [products]);

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'name' ? 'asc' : 'desc' },
    );
  }

  function setFilterField<K extends keyof ProductFilter>(key: K, value: ProductFilter[K]) {
    setFilter((f) => ({ ...f, [key]: value }));
    setShown(PAGE_SIZE);
  }

  async function run(action: () => Promise<void>) {
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Действие не выполнено.');
    } finally {
      await reload();
    }
  }

  function toggleVerified(p: Product) {
    void run(async () => {
      await updateProduct(p.id, { verified: !p.verified });
    });
  }

  function confirmDelete(p: Product) {
    setDialog(null);
    void run(async () => {
      const removed = await deleteProduct(p.id);
      if (!removed) return;
      offerUndo({
        message: `Продукт «${removed.name}» удалён.`,
        undo: () => void run(() => restoreProducts([removed])),
      });
    });
  }

  function confirmMerge(targetId: string, ids: string[]) {
    setDialog(null);
    void run(async () => {
      const result = await mergeProducts(targetId, ids);
      setSelected(new Set());
      offerUndo({
        message: `Объединено записей: ${result.removed.length + 1}.`,
        undo: () => void run(() => restoreProducts([result.targetBefore, ...result.removed])),
      });
    });
  }

  const selectedProducts = (products ?? []).filter((p) => selected.has(p.id));

  return (
    <section aria-labelledby="mod-title">
      <div className="page-header">
        <h1 id="mod-title">Справочник продуктов</h1>
        <div className="page-actions">
          <button
            type="button"
            className="button"
            disabled={selectedProducts.length < 2}
            onClick={() => {
              setMergeTarget(selectedProducts[0]?.id ?? '');
              setDialog({ kind: 'merge', products: selectedProducts });
            }}
          >
            Объединить выбранные{selectedProducts.length > 0 ? ` (${selectedProducts.length})` : ''}
          </button>
        </div>
      </div>
      <p className="hint">
        Значения — на 100 г сырого продукта. Правки не меняют сохранённые блюда: блюдо хранит свою
        копию значений.
      </p>

      <div className="filters card">
        <label className="field">
          <span>Поиск</span>
          <input
            className="input"
            type="search"
            placeholder="Название или штрихкод"
            value={filter.query}
            onChange={(e) => setFilterField('query', e.target.value)}
          />
        </label>
        <label className="field">
          <span>Источник</span>
          <select
            className="input"
            value={filter.source}
            onChange={(e) => setFilterField('source', e.target.value as ProductSource | 'all')}
          >
            <option value="all">Все</option>
            {(Object.keys(SOURCE_LABELS) as ProductSource[]).map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Проверено</span>
          <select
            className="input"
            value={filter.verified}
            onChange={(e) =>
              setFilterField('verified', e.target.value as ProductFilter['verified'])
            }
          >
            <option value="all">Все</option>
            <option value="yes">Проверено</option>
            <option value="no">Не проверено</option>
          </select>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={filter.suspiciousOnly}
            onChange={(e) => setFilterField('suspiciousOnly', e.target.checked)}
          />
          <span>
            Подозрительная калорийность
            <span className="hint">Отличие от Б×4 + Ж×9 + У×4 больше 15 %</span>
          </span>
        </label>
      </div>

      {error ? (
        <p className="warning" role="alert">
          {error}
        </p>
      ) : null}

      {products == null ? (
        <p className="hint" role="status">
          Загружаем справочник…
        </p>
      ) : (
        <>
          <p className="hint" role="status">
            Найдено: {visible.length} из {products.length}.
          </p>
          <div className="table-wrap">
            <table className="data-table">
              <caption className="visually-hidden">Продукты справочника</caption>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="visually-hidden">Выбрать для объединения</span>
                  </th>
                  {(['name', ...NUTRIENT_KEYS, 'rank', 'lastUsedAt'] as SortKey[]).map((key) => (
                    <th
                      key={key}
                      scope="col"
                      aria-sort={
                        sort.key === key
                          ? sort.dir === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                    >
                      <button type="button" className="sort-button" onClick={() => toggleSort(key)}>
                        {SORT_LABELS[key]}
                        <span aria-hidden="true">
                          {sort.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                        </span>
                      </button>
                    </th>
                  ))}
                  <th scope="col">Источник</th>
                  <th scope="col">Проверено</th>
                  <th scope="col">
                    <span className="visually-hidden">Действия</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.slice(0, shown).map((p) => {
                  const suspicious = isSuspicious(p);
                  return (
                    <tr key={p.id} className={suspicious ? 'is-suspicious' : undefined}>
                      <td className="cell-select">
                        <input
                          type="checkbox"
                          aria-label={`Выбрать «${p.name}» для объединения`}
                          checked={selected.has(p.id)}
                          onChange={(e) =>
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(p.id);
                              else next.delete(p.id);
                              return next;
                            })
                          }
                        />
                      </td>
                      <td className="cell-title" data-label="Название">
                        <span>{p.name}</span>
                        {p.barcode ? <span className="option-detail"> · {p.barcode}</span> : null}
                        {suspicious ? (
                          <span
                            className="badge badge-warning"
                            title={`По формуле ${formatNutrient('kcal', atwaterKcal(p))} ккал`}
                          >
                            ≠ формуле: {deviationLabel(p)}
                          </span>
                        ) : null}
                      </td>
                      {NUTRIENT_KEYS.map((key) => (
                        <td key={key} className="cell-number" data-label={SHORT_LABELS[key]}>
                          {formatNutrient(key, p[key])}
                        </td>
                      ))}
                      <td className="cell-number" data-label="Ранг">
                        {p.rank}
                      </td>
                      <td className="cell-number" data-label="Использован">
                        {p.lastUsedAt ? dateFormatter.format(p.lastUsedAt) : '—'}
                      </td>
                      <td data-label="Источник">{SOURCE_LABELS[p.source]}</td>
                      <td data-label="Проверено">
                        <label className="checkbox checkbox-compact">
                          <input
                            type="checkbox"
                            checked={p.verified}
                            onChange={() => toggleVerified(p)}
                          />
                          <span>{p.verified ? 'Да' : 'Нет'}</span>
                        </label>
                      </td>
                      <td className="cell-actions">
                        <button
                          type="button"
                          className="button button-small"
                          onClick={() => setDialog({ kind: 'edit', product: p })}
                          aria-label={`Изменить «${p.name}»`}
                        >
                          Изменить
                        </button>
                        <button
                          type="button"
                          className="button button-small button-danger"
                          onClick={() => setDialog({ kind: 'delete', product: p })}
                          aria-label={`Удалить «${p.name}»`}
                        >
                          Удалить
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {visible.length > shown ? (
            <button
              type="button"
              className="button button-more"
              onClick={() => setShown((n) => n + PAGE_SIZE)}
            >
              Показать ещё ({visible.length - shown})
            </button>
          ) : null}
        </>
      )}

      {dialog?.kind === 'edit' ? (
        <Modal title="Изменить продукт" onClose={() => setDialog(null)}>
          <ProductForm
            initial={dialog.product}
            submitLabel="Сохранить"
            onCancel={() => setDialog(null)}
            onSubmit={(value) => {
              const id = dialog.product.id;
              setDialog(null);
              void run(async () => {
                await updateProduct(id, { ...value, barcode: value.barcode ?? '' });
              });
            }}
          />
        </Modal>
      ) : null}

      {dialog?.kind === 'delete' ? (
        <Modal title="Удалить продукт?" onClose={() => setDialog(null)}>
          <p>
            Продукт «{dialog.product.name}» пропадёт из подсказок. Сохранённые блюда не изменятся.
            Удаление можно отменить сразу после него.
          </p>
          <div className="form-actions">
            <button type="button" className="button" onClick={() => setDialog(null)}>
              Отмена
            </button>
            <button
              type="button"
              className="button button-danger-solid"
              onClick={() => confirmDelete(dialog.product)}
            >
              Удалить
            </button>
          </div>
        </Modal>
      ) : null}

      {dialog?.kind === 'merge' ? (
        <Modal title="Объединить дубликаты" onClose={() => setDialog(null)}>
          <fieldset className="merge-list">
            <legend>Какую запись оставить? Её название и значения сохранятся.</legend>
            {dialog.products.map((p) => (
              <label key={p.id} className="checkbox">
                <input
                  type="radio"
                  name="merge-target"
                  value={p.id}
                  checked={mergeTarget === p.id}
                  onChange={() => setMergeTarget(p.id)}
                />
                <span>
                  <strong>{p.name}</strong>
                  <span className="hint">
                    {formatNutrient('kcal', p.kcal)} ккал · Б {formatNutrient('protein', p.protein)}{' '}
                    · Ж {formatNutrient('fat', p.fat)} · У {formatNutrient('carbs', p.carbs)} ·{' '}
                    {SOURCE_LABELS[p.source]} · ранг {p.rank}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          <p className="hint">
            Остальные записи удалятся, их ранги прибавятся к оставшейся записи.
          </p>
          <div className="form-actions">
            <button type="button" className="button" onClick={() => setDialog(null)}>
              Отмена
            </button>
            <button
              type="button"
              className="button button-primary"
              disabled={!mergeTarget}
              onClick={() =>
                confirmMerge(
                  mergeTarget,
                  dialog.products.map((p) => p.id),
                )
              }
            >
              Объединить
            </button>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
