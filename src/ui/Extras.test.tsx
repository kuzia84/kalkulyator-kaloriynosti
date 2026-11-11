import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../storage/db';
import { resetDb } from '../test/db';
import { App } from './App';

beforeEach(async () => {
  await resetDb();
  window.location.hash = '';
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = '';
});

async function dishWithSugar() {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole('table');
  await user.type(screen.getByRole('combobox', { name: 'Ингредиент 1' }), 'сахар');
  await user.click(await screen.findByRole('option', { name: /Сахар-песок/ }));
  await user.type(screen.getByLabelText('Вес ингредиента 1, г'), '100');
  return user;
}

describe('порция, диаграмма, рецепты', () => {
  it('порция считается от веса готового блюда', async () => {
    const user = await dishWithSugar();
    await user.type(screen.getByLabelText('На 100 г готового блюда (с учётом уварки)'), '200');
    await user.type(screen.getByLabelText('Вес порции, г'), '50');
    const portion = screen.getByRole('heading', { name: 'Порция' }).closest('section')!;
    // 399 ккал на 200 г готового блюда → 50 г = 99,75 → 100
    expect(within(portion).getByText('100')).toBeInTheDocument();
    expect(within(portion).getByText(/от веса готового блюда: 200 г/)).toBeInTheDocument();
  });

  it('диаграмма показывает доли БЖУ в процентах', async () => {
    await dishWithSugar();
    // Плашка под кольцом: название, граммы на 100 г и доля в калорийности.
    const macro = screen.getByRole('heading', { name: 'На 100 г блюда' }).closest('section')!;
    expect(within(macro).getByText('Углеводы').closest('li')).toHaveTextContent('100 %');
    expect(within(macro).getByText('Белки').closest('li')).toHaveTextContent('0 %');
  });

  it('сохранить в рецепты, открыть из списка', async () => {
    const user = await dishWithSugar();
    await user.type(screen.getByLabelText('Название блюда'), 'Сироп');
    await user.click(screen.getByRole('button', { name: 'Сохранить в рецепты' }));
    expect(await screen.findByText('Рецепт сохранён в «Мои рецепты».')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Обновить рецепт' })).toBeInTheDocument();
    expect(await db.recipes.count()).toBe(1);

    await user.click(screen.getByRole('button', { name: 'Очистить таблицу' }));
    await user.click(screen.getByRole('link', { name: 'Мои рецепты' }));
    await screen.findByRole('heading', { name: 'Сироп' });
    await user.click(screen.getByRole('button', { name: /^В калькулятор: рецепт/ }));
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Ингредиент 1' })).toHaveValue('Сахар-песок'),
    );
    expect(screen.getByLabelText('Вес ингредиента 1, г')).toHaveValue('100');
  });
});
