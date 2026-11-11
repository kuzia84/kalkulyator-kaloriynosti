import type { ReactNode } from 'react';

/** Контурные иконки 24×24. Всегда декоративные: имя действия задаёт кнопка. */
export function Icon({
  children,
  size = 22,
  className = 'icon',
}: {
  children: ReactNode;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function PlusIcon() {
  return (
    <Icon>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function TrashIcon() {
  return (
    <Icon>
      <path d="M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13" />
    </Icon>
  );
}

export function ScanIcon() {
  return (
    <Icon>
      <path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M8 9v6M11 9v6M14 9v6M17 9v6" />
    </Icon>
  );
}

export function SearchIcon() {
  return (
    <Icon>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-4.5-4.5" />
    </Icon>
  );
}

export function ChevronIcon() {
  return (
    <Icon size={20}>
      <path d="m9 6 6 6-6 6" />
    </Icon>
  );
}

export function MoreIcon() {
  return (
    <Icon>
      <circle cx="6" cy="12" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1.8" fill="currentColor" stroke="none" />
    </Icon>
  );
}
