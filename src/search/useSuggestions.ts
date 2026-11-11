import { useEffect, useMemo, useState } from 'react';
import { searchLocal } from '../catalog/catalog';
import { DEFAULT_SETTINGS, SOURCE_LABELS, type Settings } from '../storage/schema';
import type { ExternalProduct } from './external';
import { activeSources, MIN_EXTERNAL_QUERY, searchExternal } from './externalSearch';
import { suggestionFromExternal, suggestionFromProduct, type Suggestion } from './types';

export interface SuggestionsState {
  items: Suggestion[];
  /** Идёт запрос к справочнику или внешним источникам. */
  loading: boolean;
  /** Пояснение под списком: нет сети, источник не ответил. */
  notice?: string;
}

/** Пауза после ввода перед запросом во внешние источники. */
export const EXTERNAL_DEBOUNCE_MS = 400;

/** Внешние результаты без тех, что уже есть в справочнике. */
export function mergeSuggestions(local: Suggestion[], external: ExternalProduct[]): Suggestion[] {
  const known = new Set(local.flatMap((s) => [s.externalId, ...(s.aliases ?? [])]).filter(Boolean));
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
  const limit = settings.suggestionsLimit;
  const sources = activeSources(settings);
  // Поиск зависит только от этих настроек. Смена темы не перезапускает запросы.
  const sourcesKey = sources.join(',');
  const usdaKey = settings.usdaApiKey;
  const trimmed = query.trim();
  const wantsExternal =
    enabled && online && sources.length > 0 && trimmed.length >= MIN_EXTERNAL_QUERY;
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

  // Справочник ищется при любом тексте, даже при закрытом списке: запрос дешёвый, а после
  // Escape стрелка вниз сразу открывает готовый список.
  const [local, setLocal] = useState<{ query: string; items: Suggestion[] } | null>(null);
  useEffect(() => {
    if (trimmed === '') {
      setLocal(null);
      return;
    }
    let cancelled = false;
    searchLocal(query, limit)
      .then((products) => {
        if (!cancelled) setLocal({ query, items: products.map(suggestionFromProduct) });
      })
      .catch(() => {
        if (!cancelled) setLocal({ query, items: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [query, trimmed, limit]);

  // Внешние источники — только при открытом списке, с паузой после ввода и отменой.
  const [external, setExternal] = useState<{
    query: string;
    products: ExternalProduct[];
    notice?: string;
  } | null>(null);
  useEffect(() => {
    if (!wantsExternal) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchExternal(query, searchSettings, controller.signal)
        .then((result) => {
          const failed = result.failed.map((src) => SOURCE_LABELS[src]).join(', ');
          setExternal({
            query,
            products: result.products,
            ...(failed ? { notice: `Не ответил: ${failed}. Показан справочник.` } : {}),
          });
        })
        .catch(() => {
          // Отмена: пользователь ввёл следующую букву, ответ больше не нужен.
          if (controller.signal.aborted) return;
          setExternal({
            query,
            products: [],
            notice: 'Внешний поиск не ответил. Показан справочник.',
          });
        });
    }, EXTERNAL_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, wantsExternal, searchSettings]);

  const localItems = local?.query === query ? local.items : null;
  const externalForQuery = wantsExternal && external?.query === query ? external : null;
  const items = useMemo(
    () =>
      localItems == null
        ? []
        : externalForQuery
          ? mergeSuggestions(localItems, externalForQuery.products).slice(
              0,
              localItems.length + limit,
            )
          : localItems,
    [localItems, externalForQuery, limit],
  );

  if (trimmed === '') return EMPTY;
  const loading = localItems == null || (wantsExternal && externalForQuery == null);
  const notice =
    !online && enabled ? 'Нет интернета: поиск только по справочнику.' : externalForQuery?.notice;
  return { items, loading, ...(notice ? { notice } : {}) };
}

const EMPTY: SuggestionsState = { items: [], loading: false };
