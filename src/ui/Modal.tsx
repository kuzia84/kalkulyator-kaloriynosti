import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from 'react';

export interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Модальное окно: фокус переходит внутрь окна и возвращается назад после закрытия,
 * Escape закрывает окно, Tab не выходит за его пределы.
 */
export function Modal({ title, onClose, children }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    // Фокус — на первое поле содержимого, а не на кнопку «Закрыть» в заголовке.
    const first = bodyRef.current?.querySelector<HTMLElement>(
      'input, select, textarea, button, [tabindex]:not([tabindex="-1"])',
    );
    first?.focus();
    return () => previous?.focus?.();
  }, []);

  // Страница под окном не прокручивается: прокрутка остаётся только у самого окна.
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = previous;
    };
  }, []);

  // Кнопки окна стоят в один ряд, пока помещаются. Иначе — друг под другом на всю ширину.
  useLayoutEffect(() => {
    const modal = ref.current;
    if (!modal) return;
    function layout() {
      for (const row of modal!.querySelectorAll<HTMLElement>('.form-actions, .barcode-actions')) {
        row.classList.remove('is-stacked');
        row.classList.add('is-measuring');
        const overflow = row.scrollWidth > row.clientWidth + 1;
        row.classList.remove('is-measuring');
        row.classList.toggle('is-stacked', overflow);
      }
    }
    layout();
    // jsdom в тестах не знает ResizeObserver: там раскладку не пересчитываем.
    if (typeof ResizeObserver === 'undefined') return;
    const resize = new ResizeObserver(layout);
    resize.observe(modal);
    // Содержимое окна меняется (другой способ заполнения, найденный продукт): считаем заново.
    const mutation = new MutationObserver(layout);
    mutation.observe(modal, { childList: true, subtree: true, characterData: true });
    return () => {
      resize.disconnect();
      mutation.disconnect();
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !ref.current) return;
      // Скрытый блок окна (атрибут hidden) фокус не получает и в обход не входит.
      const focusable = Array.from(
        ref.current.querySelectorAll<HTMLElement>(
          'input:not([disabled]), select, textarea, button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.closest('[hidden]'));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="button-icon" aria-label="Закрыть" onClick={onClose}>
            ×
          </button>
        </div>
        <div ref={bodyRef}>{children}</div>
      </div>
    </div>
  );
}
