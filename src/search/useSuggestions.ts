import { useEffect, useState } from 'react';
import { searchLocal } from '../catalog/catalog';
import { suggestionFromProduct, type Suggestion } from './types';

export interface SuggestionsState {
  items: Suggestion[];
  /** Идёт запрос к справочнику. */
  loading: boolean;
}

/**
 * Подсказки из справочника для текста `query`.
 * Устаревший ответ (пользователь уже ввёл следующую букву) отбрасывается.
 */
export function useSuggestions(query: string, enabled: boolean, limit: number): SuggestionsState {
  const [state, setState] = useState<SuggestionsState>({ items: [], loading: false });

  useEffect(() => {
    if (!enabled || query.trim() === '') {
      setState({ items: [], loading: false });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    searchLocal(query, limit)
      .then((products) => {
        if (!cancelled) setState({ items: products.map(suggestionFromProduct), loading: false });
      })
      .catch(() => {
        if (!cancelled) setState({ items: [], loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [query, enabled, limit]);

  return state;
}
