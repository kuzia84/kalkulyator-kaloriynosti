import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSettings } from '../app/settingsContext';
import { useOnline } from '../app/useOnline';
import { formatNutrient } from '../calc';
import { activeSources, MIN_EXTERNAL_QUERY, searchExternal } from '../search/externalSearch';
import { suggestionFromExternal, type Suggestion } from '../search/types';
import { SOURCE_LABELS, type ExternalSource } from '../storage/schema';

export interface WebProductSearchProps {
  /** Начальный текст запроса, например название из формы. */
  initialQuery: string;
  onPick: (product: Suggestion) => void;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'searching' }
  | { kind: 'done'; products: Suggestion[]; failed: ExternalSource[] };

/**
 * Поиск продукта в сети по названию и производителю: Open Food Facts и USDA из настроек.
 * Выбор результата заполняет форму продукта.
 */
export function WebProductSearch({ initialQuery, onPick }: WebProductSearchProps) {
  const { settings } = useSettings();
  const online = useOnline();
  const [query, setQuery] = useState(initialQuery);
  const [queryError, setQueryError] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const abort = useRef<AbortController | null>(null);
  const sources = activeSources(settings);

  useEffect(() => () => abort.current?.abort(), []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q.length < MIN_EXTERNAL_QUERY) {
      setQueryError(`Введите хотя бы ${MIN_EXTERNAL_QUERY} буквы.`);
      return;
    }
    setQueryError('');
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setPhase({ kind: 'searching' });
    try {
      const result = await searchExternal(q, settings, controller.signal);
      if (controller.signal.aborted) return;
      setPhase({
        kind: 'done',
        products: result.products.map(suggestionFromExternal),
        failed: result.failed,
      });
    } catch {
      // Новый поиск или закрытие окна отменили этот запрос.
    }
  }

  if (sources.length === 0) {
    return (
      <p className="note">
        Поиск в сети выключен. Включите Open Food Facts или USDA на странице «Настройки».
      </p>
    );
  }

  return (
    <div className="web-search">
      <form className="field" onSubmit={(e) => void submit(e)} noValidate>
        <label htmlFor="web-search-input">Название и производитель</label>
        <div className="inline-fields">
          <input
            id="web-search-input"
            className="input"
            type="search"
            autoComplete="off"
            placeholder="Например: творог Простоквашино 5 %"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-invalid={!!queryError}
            aria-describedby={queryError ? 'web-search-error' : 'web-search-hint'}
          />
          <button
            type="submit"
            className="button button-primary"
            disabled={!online || phase.kind === 'searching'}
          >
            Найти
          </button>
        </div>
        {queryError ? (
          <span id="web-search-error" className="field-error">
            {queryError}
          </span>
        ) : (
          <span id="web-search-hint" className="hint">
            Ищем в {sources.map((s) => SOURCE_LABELS[s]).join(' и ')}. Производитель в запросе
            сужает результаты.
          </span>
        )}
      </form>

      <div role="status" aria-live="polite">
        {!online ? <p className="note">Нет интернета: поиск в сети недоступен.</p> : null}
        {phase.kind === 'searching' ? <p className="hint">Ищем…</p> : null}
        {phase.kind === 'done' && phase.failed.length > 0 ? (
          <p className="warning">
            Не ответил: {phase.failed.map((s) => SOURCE_LABELS[s]).join(', ')}. Попробуйте позже.
          </p>
        ) : null}
        {phase.kind === 'done' && phase.products.length === 0 && phase.failed.length === 0 ? (
          <p className="note">Ничего не найдено. Уточните запрос или заполните форму вручную.</p>
        ) : null}
        {phase.kind === 'done' && phase.products.length > 0 ? (
          <p className="hint">Найдено: {phase.products.length}. Значения — на 100 г.</p>
        ) : null}
      </div>

      {phase.kind === 'done' && phase.products.length > 0 ? (
        <ul className="web-results">
          {phase.products.map((p) => (
            <li key={p.key} className="web-result">
              <div className="web-result-text">
                <span className="product-name">{p.name}</span>
                {p.detail ? <span className="product-meta">{p.detail}</span> : null}
                <span className="product-meta">
                  {formatNutrient('kcal', p.kcal)} ккал · Б {formatNutrient('protein', p.protein)} ·
                  Ж {formatNutrient('fat', p.fat)} · У {formatNutrient('carbs', p.carbs)} ·{' '}
                  {SOURCE_LABELS[p.source]}
                </span>
              </div>
              <button
                type="button"
                className="button button-small"
                onClick={() => onPick(p)}
                aria-label={`Заполнить форму: ${p.name}`}
              >
                Выбрать
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
