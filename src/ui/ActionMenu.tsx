import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { MoreIcon } from './icons';

export interface ActionMenuItem {
  /** Текст пункта на экране. */
  label: string;
  /** Имя для программ чтения, если текста на экране мало: «Удалить строку 2». */
  ariaLabel?: string;
  danger?: boolean;
  onSelect: () => void;
}

export interface ActionMenuProps {
  /** Имя кнопки «⋯» для программ чтения: «Действия, строка 2». */
  label: string;
  items: ActionMenuItem[];
}

/**
 * Кнопка «⋯» с меню редких действий. Меню по шаблону WAI-ARIA Menu Button:
 * стрелки переходят по пунктам, Escape закрывает меню и возвращает фокус на кнопку.
 */
export function ActionMenu({ label, items }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    itemRefs.current[0]?.focus();
    function onPointerDown(e: PointerEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  }

  function onMenuKeyDown(e: KeyboardEvent<HTMLUListElement>) {
    const list = itemRefs.current.filter((x): x is HTMLButtonElement => x != null);
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    const focusAt = (i: number) => list[(i + list.length) % list.length]?.focus();
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusAt(index + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusAt(index - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusAt(0);
        break;
      case 'End':
        e.preventDefault();
        focusAt(list.length - 1);
        break;
      case 'Escape':
        e.preventDefault();
        close(true);
        break;
      case 'Tab':
        // Фокус сначала на кнопку: иначе он пропадёт вместе с пунктом меню,
        // и Tab продолжится с начала страницы.
        close(true);
        break;
    }
  }

  return (
    <div className="action-menu" ref={root}>
      <button
        ref={trigger}
        type="button"
        className="button-icon action-menu-trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreIcon />
      </button>
      {open ? (
        <ul
          id={menuId}
          className="action-menu-list"
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
        >
          {items.map((item, i) => (
            <li key={item.label} role="none">
              <button
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                type="button"
                role="menuitem"
                className={`action-menu-item${item.danger ? ' is-danger' : ''}`}
                aria-label={item.ariaLabel}
                onClick={() => {
                  close(true);
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
