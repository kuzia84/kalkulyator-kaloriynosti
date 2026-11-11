import { useCallback, useEffect, useRef, useState } from 'react';

export interface UndoEntry {
  message: string;
  undo: () => void;
}

const UNDO_TIMEOUT_MS = 8000;

/** Последнее действие, которое можно отменить. Новое действие заменяет предыдущее. */
export function useUndo() {
  const [entry, setEntry] = useState<UndoEntry | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const dismiss = useCallback(() => {
    clearTimeout(timer.current);
    setEntry(null);
  }, []);

  const offer = useCallback((next: UndoEntry) => {
    clearTimeout(timer.current);
    setEntry(next);
    timer.current = setTimeout(() => setEntry(null), UNDO_TIMEOUT_MS);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return { entry, offer, dismiss };
}

export function UndoToast({
  entry,
  onDismiss,
}: {
  entry: UndoEntry | null;
  onDismiss: () => void;
}) {
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {entry ? (
        <div className="toast">
          <span>{entry.message}</span>
          <button
            type="button"
            className="button button-small"
            onClick={() => {
              entry.undo();
              onDismiss();
            }}
          >
            Отменить
          </button>
          <button type="button" className="button-icon" aria-label="Скрыть" onClick={onDismiss}>
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}
