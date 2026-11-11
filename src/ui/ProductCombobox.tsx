import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { formatNutrient } from '../calc';
import { SOURCE_LABELS } from '../storage/schema';
import type { Suggestion } from '../search/types';

export interface ProductComboboxProps {
  value: string;
  label: string;
  items: Suggestion[];
  loading: boolean;
  /** Сообщение под списком: например, «внешний поиск недоступен». */
  notice?: string;
  onChange: (text: string) => void;
  onPick: (s: Suggestion) => void;
  onManual: (text: string) => void;
  onOpenChange?: (open: boolean) => void;
  /** Продукт уже выбран: фокус на поле не открывает список. */
  selected?: boolean;
}

/**
 * Поле с подсказками по шаблону WAI-ARIA «combobox» со списком (aria-autocomplete="list").
 * Фокус остаётся в поле, активный пункт передаётся через aria-activedescendant.
 */
export function ProductCombobox(props: ProductComboboxProps) {
  const {
    value,
    label,
    items,
    loading,
    notice,
    onChange,
    onPick,
    onManual,
    onOpenChange,
    selected,
  } = props;
  const id = useId();
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listRef = useRef<HTMLUListElement>(null);

  const hasText = value.trim() !== '';
  // Последний пункт списка — ручной ввод. Он доступен и с клавиатуры.
  const optionCount = hasText ? items.length + 1 : 0;
  const expanded = open && hasText;

  useEffect(() => {
    onOpenChange?.(expanded);
  }, [expanded, onOpenChange]);

  // Новый список — активного пункта нет, чтобы Enter не выбрал случайный продукт.
  useEffect(() => {
    setActive(-1);
  }, [items]);

  useEffect(() => {
    if (active < 0 || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  function choose(index: number) {
    if (index < items.length) {
      const s = items[index];
      if (s) onPick(s);
    } else {
      onManual(value.trim());
    }
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case 'ArrowDown':
        if (!hasText) return;
        e.preventDefault();
        if (!open) {
          // Список ещё не загружен: активного пункта нет, иначе Enter выбрал бы ручной ввод.
          setOpen(true);
          setActive(items.length > 0 ? 0 : -1);
        } else {
          setActive((i) => (i + 1) % optionCount);
        }
        break;
      case 'ArrowUp':
        if (!hasText) return;
        e.preventDefault();
        if (!open) {
          setOpen(true);
          setActive(items.length > 0 ? optionCount - 1 : -1);
        } else {
          setActive((i) => (i <= 0 ? optionCount - 1 : i - 1));
        }
        break;
      case 'Enter':
        if (expanded && active >= 0) {
          e.preventDefault();
          choose(active);
        }
        break;
      case 'Escape':
        if (expanded) {
          e.preventDefault();
          setOpen(false);
          setActive(-1);
        }
        break;
      case 'Tab':
        setOpen(false);
        break;
    }
  }

  const activeId = expanded && active >= 0 ? `${id}-opt-${active}` : undefined;

  return (
    <div className="combobox">
      <input
        type="text"
        role="combobox"
        className="input input-name"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={activeId}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="next"
        placeholder="Продукт"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (hasText && !selected) setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      <div className="combobox-popup" hidden={!expanded}>
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          aria-label={`Подсказки: ${label}`}
          className="combobox-list"
          // Нажатие на список не должно уводить фокус из поля.
          onMouseDown={(e) => e.preventDefault()}
        >
          {items.map((s, i) => (
            <li
              key={s.key}
              id={`${id}-opt-${i}`}
              data-index={i}
              role="option"
              aria-selected={i === active}
              className="combobox-option"
              onClick={() => choose(i)}
            >
              <span className="option-name">
                {s.name}
                {s.detail ? <span className="option-detail"> · {s.detail}</span> : null}
              </span>
              <span className="option-meta">
                <span className="option-kcal">{formatNutrient('kcal', s.kcal)} ккал</span>
                <span className={`badge badge-${s.source}`}>
                  {s.external ? `${SOURCE_LABELS[s.source]} · в сети` : SOURCE_LABELS[s.source]}
                </span>
              </span>
            </li>
          ))}
          {hasText ? (
            <li
              id={`${id}-opt-${items.length}`}
              data-index={items.length}
              role="option"
              aria-selected={active === items.length}
              className="combobox-option combobox-manual"
              onClick={() => choose(items.length)}
            >
              {items.length === 0 && !loading ? 'Не нашли? ' : ''}Ввести «{value.trim()}» вручную
            </li>
          ) : null}
        </ul>
        {loading || notice ? (
          <p className="combobox-status" role="status">
            {loading ? 'Ищем…' : notice}
          </p>
        ) : null}
      </div>
    </div>
  );
}
