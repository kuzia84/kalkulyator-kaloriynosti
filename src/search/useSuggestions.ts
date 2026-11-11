import { useEffect, useMemo, useState } from 'react';
import { searchLocal } from '../catalog/catalog';
import { DEFAULT_SETTINGS, SOURCE_LABELS, type Settings } from '../storage/schema';
import type { ExternalProduct } from './external';
import { activeSources, MIN_EXTERNAL_QUERY, searchExternal } from './externalSearch';
import { suggestionFromProduct, type Suggestion } from './types';

export interface SuggestionsState {
  items: Suggestion[];
  /** Идёт запрос к справочнику или внешним источникам. */
  loading: boolean;
  /** Пояснение под списком: нет сети, источник не ответил. */
  notice?: string;
}

/** Пауза после ввода перед запросом во внешние источники. */
export const EXTERNAL_DEBOUNCE_MS = 400;

function suggestionFromExternal(p: ExternalProduct): Suggestion {
  return {
    key: p.externalId,
    name: p.name,
    kcal: p.kcal,
    protein: p.protein,
    fat: p.fat,
    carbs: p.carbs,
    source: p.source,
    externalId: p.externalId,
    external: true,
    ...(p.barcode ? { barcode: p.barcode } : {}),
    ...(p.detail ? { detail: p.detail } : {}),
  };
}

/** Внешние результаты без тех, что уже есть в справочнике. */
export function mergeSuggestions(local: Suggestion[], external: ExternalProduct[]): Suggestion[] {
  const known = new Set(local.map((s) => s.externalId).filter(Boolean));
  const seen = new Set<string>();
  const extra: Suggestion[] = [];
  for (const p of external) {
    if (known.has(p.externalId) || seen.has(p.externalId)) continue;
    seen.add(p.externalId);
    extra.push(suggestionFromExternal(p));
  }
  return [...local, ...extra];
}

/**
 * Подсказки для текста `query`.
 * 1. Справочник на устройстве — сразу, в том числе без сети.
 * 2. Внешние источники — после паузы 400 мс, если есть сеть и запрос не короче трёх букв.
 *    Новый ввод отменяет прежний запрос. Ошибка сети оставляет подсказки из справочника.
 */
export function useSuggestions(
  query: string,
  enabled: boolean,
  settings: Settings,
  online: boolean,
): SuggestionsState {
  const [state, setState] = useState<SuggestionsState>({ items: [], loading: false });
  const limit = settings.suggestionsLimit;
  const sources = activeSources(settings);
  // Поиск зависит только от этих настроек. Смена темы не перезапускает запросы.
  const sourcesKey = sources.join(',');
  const usdaKey = settings.usdaApiKey;
  const wantsExternal = online && sources.length > 0 && query.trim().length >= MIN_EXTERNAL_QUERY;
  const searchSettings = useMemo<Settings>(
    () => ({
      ...DEFAULT_SETTINGS,
      suggestionsLimit: limit,
      sourcesOrder: sourcesKey ? (sourcesKey.split(',') as Settings['sourcesOrder']) : [],
      enabledSources: sourcesKey ? (sourcesKey.split(',') as Settings['enabledSources']) : [],
      usdaApiKey: usdaKey,
    }),
    [limit, sourcesKey, usdaKey],
  );

  useEffect(() => {
    if (!enabled || query.trim() === '') {
      setState({ items: [], loading: false });
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    let local: Suggestion[] = [];
    setState((s) => ({ ...s, loading: true }));

    const localDone = searchLocal(query, limit)
      .then((products) => {
        local = products.map(suggestionFromProduct);
        if (!cancelled) setState({ items: local, loading: wantsExternal });
      })
      .catch(() => {
        if (!cancelled) setState({ items: [], loading: wantsExternal });
      });

    let timer: ReturnType<typeof setTimeout> | undefined;
    if (wantsExternal) {
      timer = setTimeout(() => {
        Promise.all([searchExternal(query, searchSettings, controller.signal), localDone])
          .then(([external]) => {
            if (cancelled) return;
            const failed = external.failed.map((s) => SOURCE_LABELS[s]).join(', ');
            setState({
              items: mergeSuggestions(local, external.products).slice(0, local.length + limit),
              loading: false,
              ...(failed ? { notice: `Не ответил: ${failed}. Показан справочник.` } : {}),
            });
          })
          .catch(() => {
            // Отмена: пользователь ввёл следующую букву, ответ больше не нужен.
            if (cancelled || controller.signal.aborted) return;
            setState({
              items: local,
              loading: false,
              notice: 'Внешний поиск не ответил. Показан справочник.',
            });
          });
      }, EXTERNAL_DEBOUNCE_MS);
    }

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, enabled, limit, wantsExternal, searchSettings]);

  if (!online && enabled && query.trim() !== '') {
    return { ...state, notice: 'Нет интернета: поиск только по справочнику.' };
  }
  return state;
}
