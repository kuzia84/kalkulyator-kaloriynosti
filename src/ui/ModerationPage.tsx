import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  atwaterKcal,
  formatNutrient,
  isSuspicious,
  NUTRIENT_KEYS,
  SUSPICIOUS_MIN_KCAL_DIFF,
  SUSPICIOUS_THRESHOLD,
} from '../calc';
import {
  deleteProduct,
  filterProducts,
  restoreProducts,
  updateProduct,
  type ProductFilter,
  type SortDir,
  type SortKey,
} from '../catalog/moderation';
import { db } from '../storage/db';
import { SOURCE_LABELS, type Product, type ProductSource } from '../storage/schema';
import { AddProductDialog } from './AddProductDialog';
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

/** Подписи значений в карточке на узком экране. */
const CHIP_LABELS: Record<(typeof NUTRIENT_KEYS)[number], string> = {
  kcal: 'ккал',
  protein: 'белки',
  fat: 'жиры',
  carbs: 'углев.',
};

/** Пункты списка «Сортировка». Он нужен на узком экране: там нет заголовков колонок. */
const SORT_OPTIONS: { key: SortKey; dir: SortDir; label: string }[] = [
  { key: 'name', dir: 'asc', label: 'Название, А → Я' },
  { key: 'name', dir: 'desc', label: 'Название, Я → А' },
  { key: 'rank', dir: 'desc', label: 'Сначала частые' },
  { key: 'lastUsedAt', dir: 'desc', label: 'Сначала недавние' },
  { key: 'kcal', dir: 'desc', label: 'Ккал, больше сначала' },
  { key: 'kcal', dir: 'asc', label: 'Ккал, меньше сначала' },
  { key: 'protein', dir: 'desc', label: 'Белки, больше сначала' },
  { key: 'protein', dir: 'asc', label: 'Белки, меньше сначала' },
  { key: 'fat', dir: 'desc', label: 'Жиры, больше сначала' },
  { key: 'fat', dir: 'asc', label: 'Жиры, меньше сначала' },
  { key: 'carbs', dir: 'desc', label: 'Углеводы, больше сначала' },
  { key: 'carbs', dir: 'asc', label: 'Углеводы, меньше сначала' },
  { key: 'rank', dir: 'asc', label: 'Сначала редкие' },
  { key: 'lastUsedAt', dir: 'asc', label: 'Сначала давние' },
];

const THRESHOLD_PERCENT = Math.round(SUSPICIOUS_THRESHOLD * 100);

const EMPTY_FILTER: ProductFilter = {
  query: '',
  source: 'all',
  verified: 'all',
  suspiciousOnly: false,
};

const dateFormatter = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short' });

type Dialog =
  | { kind: 'add'; name: string }
  | { kind: 'edit'; product: Product }
  | { kind: 'delete'; product: Product }
  | null;

/** Насколько заявленная калорийность выше или ниже расчётной по БЖУ: «+23 %», «−40 %». */
function deviationLabel(p: Product): string {
  const expected = atwaterKcal(p);
  if (expected === 0) return 'нет БЖУ, есть ккал';
  const percent = Math.round((Math.abs(p.kcal - expected) / expected) * 100);
  return `${p.kcal > expected ? '+' : '−'}${percent} %`;
}

function TrashIcon() {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M12 3 2 21h20L12 3Zm0 6v6m0 3v.01"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ModerationPage({ offerUndo }: ModerationPageProps) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState<ProductFilter>(EMPTY_FILTER);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'name', dir: 'asc' });
  const [shown, setShown] = useState(PAGE_SIZE);
  const [dialog, setDialog] = useState<Dialog>(null);

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

  /** Правка одной записи: обновляется только её строка, без чтения всего справочника. */
  async function patch(id: string, change: Parameters<typeof updateProduct>[1]) {
    setError('');
    try {
      const updated = await updateProduct(id, change);
      setProducts((list) => list?.map((p) => (p.id === id ? updated : p)) ?? list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Действие не выполнено.');
      await reload();
    }
  }

  function toggleVerified(p: Product) {
    void patch(p.id, { verified: !p.verified });
  }

  function openAdd() {
    setNotice('');
    // Пустой результат поиска — частая причина добавить продукт: название уже введено.
    setDialog({ kind: 'add', name: visible.length === 0 ? filter.query.trim() : '' });
  }

  function showOnly(name: string) {
    setFilter({ ...EMPTY_FILTER, query: name });
    setShown(PAGE_SIZE);
  }

  async function onAdded(added: Product) {
    setDialog(null);
    showOnly(added.name);
    await reload();
    offerUndo({
      message: `Продукт «${added.name}» добавлен.`,
      undo: () => void run(() => db.products.delete(added.id)),
    });
  }

  function onExisting(name: string) {
    setDialog(null);
    showOnly(name);
    setNotice(`Продукт «${name}» уже есть в справочнике. Он показан в списке.`);
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

  const sortValue = `${sort.key}:${sort.dir}`;

  return (
    <section aria-labelledby="mod-title" className="catalog">
      <div className="page-header">
        <h1 className="page-title" tabIndex={-1} id="mod-title">
          Справочник продуктов
        </h1>
        <div className="page-actions">
          <button type="button" className="button button-primary" onClick={openAdd}>
            Добавить продукт
          </button>
        </div>
      </div>
      <p className="hint">
        Значения — на 100 г сырого продукта. Правки не меняют сохранённые блюда: блюдо хранит свою
        копию значений.
      </p>

      <div className="filters card">
        <label className="field filters-query">
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
        <label className="field filters-sort">
          <span>Сортировка</span>
          <select
            className="input"
            value={sortValue}
            onChange={(e) => {
              const [key, dir] = e.target.value.split(':') as [SortKey, SortDir];
              setSort({ key, dir });
            }}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={`${o.key}:${o.dir}`} value={`${o.key}:${o.dir}`}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <div className="filters-suspicious">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={filter.suspiciousOnly}
              onChange={(e) => setFilterField('suspiciousOnly', e.target.checked)}
            />
            <span>
              Калорийность не сходится с БЖУ
              <span className="hint">Показать только записи, где стоит проверить цифры.</span>
            </span>
          </label>
          <details className="explainer">
            <summary>Как это проверяется?</summary>
            <p>
              Калорийность можно посчитать по БЖУ: 1 г белков — 4 ккал, 1 г жиров — 9 ккал, 1 г
              углеводов — 4 ккал. Например, 10 г белков, 5 г жиров и 20 г углеводов дают 40 + 45 +
              80 = 165 ккал.
            </p>
            <p>
              Запись получает отметку, если указанная калорийность отличается от расчётной больше
              чем на {THRESHOLD_PERCENT} % и больше чем на {SUSPICIOUS_MIN_KCAL_DIFF} ккал. Второе
              условие нужно для малокалорийных продуктов: у чая или зелени даже 2 ккал разницы дают
              большой процент.
            </p>
            <p>
              Частые причины: опечатка, значения не на 100 г, перепутаны белки и жиры. У продуктов с
              алкоголем, клетчаткой или сахарозаменителями формула тоже даёт неточный результат.
            </p>
            <p>
              Отметка — повод сверить цифры с упаковкой, а не ошибка. Если значения верные, отметьте
              запись как проверенную.
            </p>
          </details>
        </div>
      </div>

      {notice ? (
        <p className="note" role="status">
          {notice}
        </p>
      ) : null}

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
          {visible.length === 0 && filter.query.trim() !== '' ? (
            <div className="empty-state">
              <p>Такого продукта в справочнике нет.</p>
              <button type="button" className="button" onClick={openAdd}>
                Добавить «{filter.query.trim()}»
              </button>
            </div>
          ) : null}
          <div className="table-wrap catalog-wrap">
            <table className="data-table catalog-table">
              <caption className="visually-hidden">Продукты справочника</caption>
              <thead>
                <tr>
                  {(['name', ...NUTRIENT_KEYS] as SortKey[]).map((key) => (
                    <th
                      key={key}
                      scope="col"
                      className={key === 'name' ? 'col-name' : 'col-number'}
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
                  <th scope="col" className="col-verified">
                    Проверено
                  </th>
                  <th scope="col" className="col-actions">
                    <span className="visually-hidden">Действия</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.slice(0, shown).map((p) => {
                  const suspicious = isSuspicious(p);
                  return (
                    <tr key={p.id} className={suspicious ? 'is-suspicious' : undefined}>
                      <td className="cell-title">
                        <span className="product-name">{p.name}</span>
                        {p.barcode ? <span className="product-barcode">{p.barcode}</span> : null}
                        <span className="product-meta">
                          {SOURCE_LABELS[p.source]} · ранг {p.rank}
                          {p.lastUsedAt ? ` · ${dateFormatter.format(p.lastUsedAt)}` : ''}
                        </span>
                        {suspicious ? (
                          <span className="suspicious-note">
                            <span className="badge badge-warning">
                              <WarningIcon />
                              Не сходится: {deviationLabel(p)}
                            </span>
                            <span className="suspicious-expected">
                              по БЖУ {formatNutrient('kcal', atwaterKcal(p))} ккал
                            </span>
                          </span>
                        ) : null}
                      </td>
                      {NUTRIENT_KEYS.map((key) => (
                        <td
                          key={key}
                          className={`cell-number cell-${key}`}
                          data-label={CHIP_LABELS[key]}
                        >
                          {formatNutrient(key, p[key])}
                        </td>
                      ))}
                      <td className="cell-verified">
                        <label className="checkbox checkbox-compact">
                          <input
                            type="checkbox"
                            checked={p.verified}
                            onChange={() => toggleVerified(p)}
                          />
                          <span>{p.verified ? 'Проверено' : 'Не проверено'}</span>
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
                          className="button button-small button-danger button-delete"
                          onClick={() => setDialog({ kind: 'delete', product: p })}
                          aria-label={`Удалить «${p.name}»`}
                        >
                          <TrashIcon />
                          <span className="button-label">Удалить</span>
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

      {dialog?.kind === 'add' ? (
        <AddProductDialog
          initialName={dialog.name}
          onClose={() => setDialog(null)}
          onAdded={(p) => void onAdded(p)}
          onExisting={onExisting}
        />
      ) : null}

      {dialog?.kind === 'edit' ? (
        <Modal title="Изменить продукт" onClose={() => setDialog(null)}>
          <ProductForm
            initial={dialog.product}
            submitLabel="Сохранить"
            onCancel={() => setDialog(null)}
            onSubmit={(value) => {
              const id = dialog.product.id;
              setDialog(null);
              void patch(id, { ...value, barcode: value.barcode ?? '' });
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
    </section>
  );
}
