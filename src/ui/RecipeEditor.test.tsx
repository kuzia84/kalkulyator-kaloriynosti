import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../storage/db';
import type { Dish } from '../storage/schema';
import { resetDb } from '../test/db';
import { App } from './App';

const CREATED_AT = 1_700_000_000_000;

/** Сахар 100 г (399 ккал) + вода 100 г: 200 г, 399 ккал, 199,5 ккал на 100 г. */
function syrup(): Dish {
  return {
    id: 'r1',
    name: 'Сироп',
    rows: [
      {
        id: 'a',
        productId: 'sk-003',
        name: 'Сахар-песок',
        weight: '100',
        per100: { kcal: 399, protein: 0, fat: 0, carbs: 99.8 },
        source: 'skurikhin',
        committed: true,
      },
      {
        id: 'b',
        productId: 'sk-001',
        name: 'Вода питьевая',
        weight: '100',
        per100: { kcal: 0, protein: 0, fat: 0, carbs: 0 },
        source: 'skurikhin',
        committed: true,
      },
    ],
    cookedWeight: '',
    portionWeight: '',
    note: '',
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
}

beforeEach(async () => {
  await resetDb();
  await db.recipes.put(syrup());
  window.location.hash = '';
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = '';
});

async function openEditor() {
  const user = userEvent.setup();
  window.location.hash = '#/recipes';
  render(<App />);
  await user.click(await screen.findByRole('link', { name: 'Изменить рецепт «Сироп»' }));
  await screen.findByRole('heading', { name: 'Правка рецепта' });
  return user;
}

const totalKcal = () => screen.getByLabelText('Калорийность, ккал, итого');

describe('правка рецепта', () => {
  it('новый вес пересчитывает итог и сохраняется в рецепт', async () => {
    const user = await openEditor();
    expect(totalKcal()).toHaveTextContent('399');

    const weight = screen.getByLabelText('Вес ингредиента 1, г');
    await user.clear(weight);
    await user.type(weight, '200');
    expect(totalKcal()).toHaveTextContent('798');
    // 798 ккал на 300 г → 266 на 100 г
    expect(screen.getByLabelText('Калорийность, ккал, на 100 г блюда')).toHaveTextContent('266');

    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByText('Рецепт «Сироп» обновлён.')).toBeInTheDocument();
    const saved = await db.recipes.get('r1');
    expect(saved?.rows[0]?.weight).toBe('200');
    expect(saved?.createdAt).toBe(CREATED_AT);
    expect(saved?.updatedAt).toBeGreaterThan(CREATED_AT);
  });

  it('состав меняется: строку можно удалить и добавить продукт из справочника', async () => {
    const user = await openEditor();
    await user.click(screen.getByRole('button', { name: 'Действия, строка 2' }));
    await user.click(screen.getByRole('menuitem', { name: 'Удалить строку 2' }));
    // Пустые строки рецепт добавил при открытии, первая пустая — строка 2 после удаления.
    await user.type(screen.getByRole('combobox', { name: 'Ингредиент 2' }), 'картоф');
    await user.click(await screen.findByRole('option', { name: /Картофель/ }));
    await user.type(screen.getByLabelText('Вес ингредиента 2, г'), '100');
    // 399 + 77
    expect(totalKcal()).toHaveTextContent('476');

    await user.click(screen.getByRole('button', { name: 'Сохранить изменения' }));
    await screen.findByText('Рецепт «Сироп» обновлён.');
    const saved = await db.recipes.get('r1');
    expect(saved?.rows.map((r) => r.name)).toEqual(['Сахар-песок', 'Картофель']);
  });

  it('отмена после правки спрашивает подтверждение и не меняет рецепт', async () => {
    const user = await openEditor();
    const weight = screen.getByLabelText('Вес ингредиента 1, г');
    await user.clear(weight);
    await user.type(weight, '5');
    await user.click(screen.getAllByRole('button', { name: 'Отмена' })[0]!);
    const dialog = await screen.findByRole('dialog', { name: 'Выйти без сохранения?' });
    await user.click(within(dialog).getByRole('button', { name: 'Выйти без сохранения' }));
    await screen.findByRole('heading', { name: 'Мои рецепты' });
    expect((await db.recipes.get('r1'))?.rows[0]?.weight).toBe('100');
  });

  it('правка рецепта не меняет таблицу калькулятора', async () => {
    const user = await openEditor();
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await screen.findByRole('heading', { name: 'Мои рецепты' });
    await user.click(screen.getByRole('link', { name: 'Калькулятор' }));
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Ингредиент 1' })).toHaveValue(''),
    );
  });

  it('калькулятор, открытый из рецепта, после правки теряет связь с рецептом', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/recipes';
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /^В калькулятор: рецепт/ }));
    await screen.findByRole('button', { name: 'Обновить рецепт' });

    window.location.hash = '#/recipes/edit/r1';
    await screen.findByRole('heading', { name: 'Правка рецепта' });
    const weight = screen.getByLabelText('Вес ингредиента 1, г');
    await user.clear(weight);
    await user.type(weight, '300');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByText(/больше не связана с рецептом/)).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Калькулятор' }));
    // Прежняя версия в калькуляторе сохранится новым рецептом и не затрёт правку.
    expect(await screen.findByRole('button', { name: 'Сохранить в рецепты' })).toBeInTheDocument();
    expect((await db.recipes.get('r1'))?.rows[0]?.weight).toBe('300');
  });

  it('рецепт удалили во время правки — новый рецепт не создаётся', async () => {
    const user = await openEditor();
    await db.recipes.delete('r1');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Рецепт уже удалён');
    expect(await db.recipes.count()).toBe(0);
  });

  it('«Назад» в браузере возвращает фокус на заголовок списка', async () => {
    await openEditor();
    window.location.hash = '#/recipes';
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Мои рецепты' })).toHaveFocus());
  });

  it('отмена без правок закрывает экран без вопроса', async () => {
    const user = await openEditor();
    await user.click(screen.getAllByRole('button', { name: 'Отмена' })[0]!);
    await screen.findByRole('heading', { name: 'Мои рецепты' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('несуществующий рецепт — сообщение и ссылка на список', async () => {
    window.location.hash = '#/recipes/edit/nope';
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Рецепт не найден' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'К списку рецептов' })).toHaveAttribute(
      'href',
      '#/recipes',
    );
  });
});
