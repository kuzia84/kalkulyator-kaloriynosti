import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Место в шапке приложения для главных действий раздела: «Очистить», «Сохранить», «+ Продукт». */
export const HeaderActionsContext = createContext<HTMLElement | null>(null);

/**
 * Показывает кнопки раздела в шапке. На телефоне шапка — верхняя строка экрана с этими кнопками,
 * на десктопе кнопки стоят справа от навигации. Без шапки (в тестах отдельной страницы)
 * кнопки остаются на месте.
 */
export function HeaderActions({ children }: { children: ReactNode }) {
  const target = useContext(HeaderActionsContext);
  if (!target) return <div className="page-actions">{children}</div>;
  return createPortal(children, target);
}
