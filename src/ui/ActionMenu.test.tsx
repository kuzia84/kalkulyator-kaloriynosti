import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ActionMenu } from './ActionMenu';

function renderMenu() {
  const onCopy = vi.fn();
  const onDelete = vi.fn();
  render(
    <ActionMenu
      label="Действия, строка 1"
      items={[
        { label: 'Копировать', onSelect: onCopy },
        { label: 'Удалить', ariaLabel: 'Удалить строку 1', danger: true, onSelect: onDelete },
      ]}
    />,
  );
  return { user: userEvent.setup(), onCopy, onDelete };
}

describe('меню «⋯»', () => {
  it('открывается по кнопке, фокус на первом пункте, стрелка вниз — к следующему', async () => {
    const { user } = renderMenu();
    const trigger = screen.getByRole('button', { name: 'Действия, строка 1' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menuitem', { name: 'Копировать' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Удалить строку 1' })).toHaveFocus();
  });

  it('Escape закрывает меню и возвращает фокус на кнопку', async () => {
    const { user } = renderMenu();
    const trigger = screen.getByRole('button', { name: 'Действия, строка 1' });
    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('пункт выполняет действие и закрывает меню', async () => {
    const { user, onDelete } = renderMenu();
    await user.click(screen.getByRole('button', { name: 'Действия, строка 1' }));
    await user.click(screen.getByRole('menuitem', { name: 'Удалить строку 1' }));
    expect(onDelete).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
