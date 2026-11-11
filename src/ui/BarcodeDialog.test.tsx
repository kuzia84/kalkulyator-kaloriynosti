import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { commitUsage } from '../catalog/catalog';
import { resetDb } from '../test/db';
import { App } from './App';

beforeEach(async () => {
  await resetDb();
  window.location.hash = '';
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 404 })));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openDialog() {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole('table');
  await user.click(screen.getByRole('button', { name: 'Найти по штрихкоду, строка 1' }));
  const dialog = screen.getByRole('dialog', { name: 'Поиск по штрихкоду' });
  return { user, dialog };
}

describe('поиск по штрихкоду', () => {
  it('код из справочника: продукт попадает в строку', async () => {
    await commitUsage({
      name: 'Йогурт питьевой',
      kcal: 72,
      protein: 2.9,
      fat: 2.5,
      carbs: 9.4,
      source: 'user',
      barcode: '4601916007082',
    });
    const { user, dialog } = await openDialog();
    await user.type(within(dialog).getByLabelText('Или введите цифры кода'), '4601916007082');
    await user.click(within(dialog).getByRole('button', { name: 'Найти' }));
    expect(await within(dialog).findByText('Йогурт питьевой')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Добавить в таблицу' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Ингредиент 1' })).toHaveValue('Йогурт питьевой');
  });

  it('неверная контрольная цифра — просьба проверить код', async () => {
    const { user, dialog } = await openDialog();
    await user.type(within(dialog).getByLabelText('Или введите цифры кода'), '4601916007083');
    await user.click(within(dialog).getByRole('button', { name: 'Найти' }));
    expect(within(dialog).getByText(/Проверьте цифры/)).toBeInTheDocument();
  });

  it('продукт не найден — ручной ввод с этим кодом', async () => {
    const { user, dialog } = await openDialog();
    await user.type(within(dialog).getByLabelText('Или введите цифры кода'), '96385074');
    await user.click(within(dialog).getByRole('button', { name: 'Найти' }));
    expect(
      await within(dialog).findByText(/Продукт с кодом 96385074 не найден/),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Ввести продукт вручную' }));
    const form = screen.getByRole('dialog', { name: 'Новый продукт' });
    expect(within(form).getByLabelText('Штрихкод (если есть)')).toHaveValue('96385074');
  });
});
