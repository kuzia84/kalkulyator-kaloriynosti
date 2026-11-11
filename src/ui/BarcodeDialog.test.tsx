import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { commitUsage } from '../catalog/catalog';
import { db } from '../storage/db';
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

/** Открывает из строки 1 то же окно «Новый продукт», что в справочнике, и выбирает режим. */
async function openDialog(mode: 'По штрихкоду' | 'Найти в сети') {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole('table');
  await user.click(screen.getByRole('button', { name: 'Действия, строка 1' }));
  await user.click(screen.getByRole('menuitem', { name: 'Новый продукт, строка 1' }));
  const dialog = screen.getByRole('dialog', { name: 'Новый продукт' });
  await user.click(within(dialog).getByRole('button', { name: mode }));
  return { user, dialog };
}

describe('окно «Новый продукт» из строки калькулятора', () => {
  it('режимы те же, что в справочнике', async () => {
    const { dialog } = await openDialog('По штрихкоду');
    const group = within(dialog).getByRole('group', { name: 'Как заполнить' });
    const buttons = within(group).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Вручную', 'По штрихкоду', 'Найти в сети']);
  });

  it('код из справочника: продукт сразу попадает в строку', async () => {
    await commitUsage({
      name: 'Йогурт питьевой',
      kcal: 72,
      protein: 2.9,
      fat: 2.5,
      carbs: 9.4,
      source: 'user',
      barcode: '4601916007082',
    });
    const { user, dialog } = await openDialog('По штрихкоду');
    await user.type(within(dialog).getByLabelText('Или введите цифры кода'), '4601916007082');
    await user.click(within(dialog).getByRole('button', { name: 'Найти' }));
    expect(await within(dialog).findByText('Йогурт питьевой')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Добавить в таблицу' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('combobox', { name: 'Ингредиент 1' })).toHaveValue('Йогурт питьевой');
  });

  it('неверная контрольная цифра — просьба проверить код', async () => {
    const { user, dialog } = await openDialog('По штрихкоду');
    await user.type(within(dialog).getByLabelText('Или введите цифры кода'), '4601916007083');
    await user.click(within(dialog).getByRole('button', { name: 'Найти' }));
    expect(within(dialog).getByText(/Проверьте цифры/)).toBeInTheDocument();
  });

  it('продукт не найден — форма в том же окне с этим кодом', async () => {
    const { user, dialog } = await openDialog('По штрихкоду');
    await user.type(within(dialog).getByLabelText('Или введите цифры кода'), '96385074');
    await user.click(within(dialog).getByRole('button', { name: 'Найти' }));
    expect(
      await within(dialog).findByText(/Продукт с кодом 96385074 не найден/),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Ввести продукт вручную' }));
    expect(within(dialog).getByRole('button', { name: 'Вручную' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(dialog).getByLabelText('Штрихкод (если есть)')).toHaveValue('96385074');
  });

  it('поиск в сети: форма заполняется, продукт идёт в справочник и в строку', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        async () =>
          new Response(JSON.stringify({ products: [OFF_TVOROG] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
    const { user, dialog } = await openDialog('Найти в сети');
    await user.type(within(dialog).getByLabelText('Название и производитель'), 'творог тест');
    await user.click(within(dialog).getByRole('button', { name: 'Найти' }));
    await user.click(
      await within(dialog).findByRole('button', { name: 'Заполнить форму: Творог 5 % «Тест»' }),
    );
    await waitFor(() =>
      expect(within(dialog).getByLabelText('Название')).toHaveValue('Творог 5 % «Тест»'),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Добавить в таблицу' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('combobox', { name: 'Ингредиент 1' })).toHaveValue('Творог 5 % «Тест»');
    const saved = await db.products.where('barcode').equals('4601916007082').first();
    expect(saved).toMatchObject({ source: 'off', externalId: 'off:4601916007082' });
  });
});

const OFF_TVOROG = {
  code: '4601916007082',
  product_name_ru: 'Творог 5 % «Тест»',
  brands: 'Тестовая ферма',
  nutriments: {
    'energy-kcal_100g': 121,
    proteins_100g: 17.2,
    fat_100g: 5,
    carbohydrates_100g: 1.8,
  },
};
