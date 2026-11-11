import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../storage/db';
import { resetDb } from '../test/db';
import { App } from './App';

beforeEach(async () => {
  await resetDb();
  window.location.hash = '#/moderation';
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = '';
});

async function renderPage() {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByText(/Найдено: \d+ из \d+/);
  return user;
}

describe('страница модерации', () => {
  it('поиск по вхождению в название', async () => {
    const user = await renderPage();
    await user.type(screen.getByLabelText('Поиск'), 'крупа');
    expect(screen.getByText(/Найдено: 6 из/)).toBeInTheDocument();
  });

  it('удаление спрашивает подтверждение и отменяется', async () => {
    const user = await renderPage();
    await user.type(screen.getByLabelText('Поиск'), 'картофель');
    await user.click(screen.getByRole('button', { name: 'Удалить «Картофель»' }));
    const dialog = screen.getByRole('dialog', { name: 'Удалить продукт?' });
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }));
    await waitFor(async () => expect(await db.products.get('sk-014')).toBeUndefined());
    await user.click(await screen.findByRole('button', { name: 'Отменить' }));
    await waitFor(async () => expect(await db.products.get('sk-014')).toBeDefined());
    expect(await screen.findByRole('button', { name: 'Удалить «Картофель»' })).toBeInTheDocument();
  });

  it('правка записи и признак «проверено»', async () => {
    const user = await renderPage();
    await user.type(screen.getByLabelText('Поиск'), 'тыква');
    await user.click(screen.getByRole('button', { name: 'Изменить «Тыква»' }));
    const dialog = screen.getByRole('dialog', { name: 'Изменить продукт' });
    const kcal = within(dialog).getByLabelText('Калорийность, ккал');
    await user.clear(kcal);
    await user.type(kcal, '23');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    await waitFor(async () => expect((await db.products.get('sk-023'))!.kcal).toBe(23));
    const row = screen.getByText('Тыква').closest('tr')!;
    await user.click(within(row).getByRole('checkbox', { name: 'Нет' }));
    await waitFor(async () => expect((await db.products.get('sk-023'))!.verified).toBe(true));
  });

  it('объединение дубликатов', async () => {
    const user = await renderPage();
    await user.type(screen.getByLabelText('Поиск'), 'молоко');
    await user.click(
      screen.getByRole('checkbox', { name: 'Выбрать «Молоко 2,5 %» для объединения' }),
    );
    await user.click(
      screen.getByRole('checkbox', { name: 'Выбрать «Молоко 3,2 %» для объединения' }),
    );
    await user.click(screen.getByRole('button', { name: /Объединить выбранные \(2\)/ }));
    const dialog = screen.getByRole('dialog', { name: 'Объединить дубликаты' });
    await user.click(within(dialog).getByRole('radio', { name: /Молоко 3,2 %/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Объединить' }));
    await waitFor(async () => expect(await db.products.get('sk-034')).toBeUndefined());
    expect(await db.products.get('sk-035')).toBeDefined();
  });

  it('фильтр подозрительной калорийности', async () => {
    await db.products.update('sk-023', { kcal: 90 });
    const user = await renderPage();
    await user.click(screen.getByRole('checkbox', { name: /Подозрительная калорийность/ }));
    expect(screen.getByText(/Найдено: 1 из/)).toBeInTheDocument();
    expect(screen.getByText(/≠ формуле/)).toBeInTheDocument();
  });
});
