import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../storage/db';
import { resetDb } from '../test/db';
import { App } from './App';

beforeEach(async () => {
  await resetDb();
  window.location.hash = '';
  // Сеть в тестах выключена: внешний поиск получает ошибку, как без интернета.
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function renderApp() {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole('table');
  return user;
}

function cell(label: string) {
  return screen.getByLabelText(label);
}

describe('калькулятор', () => {
  it('показывает 4 строки ингредиентов и блоки итогов в нужном порядке', async () => {
    await renderApp();
    expect(screen.getAllByRole('combobox')).toHaveLength(4);
    const summary = screen.getAllByRole('row').map((r) => r.textContent ?? '');
    const iAdd = summary.findIndex((t) => t.includes('Добавить ингредиент'));
    const iTotal = summary.findIndex((t) => t.startsWith('Итого'));
    const iPer100 = summary.findIndex((t) => t.startsWith('На 100 г блюда'));
    const iCooked = summary.findIndex((t) => t.startsWith('На 100 г готового блюда'));
    expect(iAdd).toBeGreaterThan(4);
    expect(iTotal).toBe(iAdd + 1);
    expect(iPer100).toBe(iTotal + 1);
    expect(iCooked).toBe(iPer100 + 1);
  });

  it('подсказки, выбор с клавиатуры, вес, итоги и уварка', async () => {
    const user = await renderApp();
    const name = screen.getByRole('combobox', { name: 'Ингредиент 1' });
    await user.type(name, 'греч');
    const option = await screen.findByRole('option', { name: /Гречневая крупа ядрица/ });
    expect(option).toBeVisible();
    await user.keyboard('{ArrowDown}{Enter}');
    expect(name).toHaveValue('Гречневая крупа ядрица');

    await user.type(screen.getByLabelText('Вес ингредиента 1, г'), '200');
    // 308 ккал × 200 / 100 = 616; белки 12,6 × 2 = 25,2
    expect(cell('Калорийность, ккал, ингредиент 1')).toHaveTextContent('616');
    expect(cell('Белки, г, ингредиент 1')).toHaveTextContent('25,2');
    expect(cell('Общий вес, г')).toHaveTextContent('200');
    expect(cell('Калорийность, ккал, на 100 г блюда')).toHaveTextContent('308');

    const cooked = screen.getByLabelText('На 100 г готового блюда (с учётом уварки)');
    await user.type(cooked, '560');
    // 616 / 560 × 100 = 110
    expect(cell('Калорийность, ккал, на 100 г готового блюда')).toHaveTextContent('110');
    expect(screen.getByText(/крупы и макароны впитывают воду/)).toBeInTheDocument();
    expect(cell('Калорийность, ккал, итого')).toHaveTextContent('616');
  });

  it('вес с запятой и «—» без веса готового блюда', async () => {
    const user = await renderApp();
    await user.type(screen.getByRole('combobox', { name: 'Ингредиент 1' }), 'сахар');
    await user.click(await screen.findByRole('option', { name: /Сахар-песок/ }));
    await user.type(screen.getByLabelText('Вес ингредиента 1, г'), '12,5');
    // 399 × 12,5 / 100 = 49,875 → 50
    expect(cell('Калорийность, ккал, ингредиент 1')).toHaveTextContent('50');
    expect(cell('Калорийность, ккал, на 100 г готового блюда')).toHaveTextContent('—');
  });

  it('Escape закрывает список', async () => {
    const user = await renderApp();
    const name = screen.getByRole('combobox', { name: 'Ингредиент 1' });
    await user.type(name, 'мол');
    await screen.findByRole('option', { name: /Молоко 2,5/ });
    expect(name).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}');
    expect(name).toHaveAttribute('aria-expanded', 'false');
  });

  it('кнопка «Добавить ингредиент» добавляет одну строку', async () => {
    const user = await renderApp();
    await user.click(screen.getByRole('button', { name: /Добавить ингредиент/ }));
    expect(screen.getAllByRole('combobox')).toHaveLength(5);
  });

  it('удаление строки отменяется', async () => {
    const user = await renderApp();
    await user.type(screen.getByLabelText('Вес ингредиента 2, г'), '50');
    await user.click(screen.getByRole('button', { name: 'Удалить строку 2' }));
    expect(screen.getAllByRole('combobox')).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: 'Отменить' }));
    expect(screen.getAllByRole('combobox')).toHaveLength(4);
    expect(screen.getByLabelText('Вес ингредиента 2, г')).toHaveValue('50');
  });

  it('очистка таблицы отменяется', async () => {
    const user = await renderApp();
    await user.type(screen.getByLabelText('Вес ингредиента 1, г'), '10');
    await user.click(screen.getByRole('button', { name: 'Очистить таблицу' }));
    expect(screen.getByLabelText('Вес ингредиента 1, г')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Отменить' }));
    expect(screen.getByLabelText('Вес ингредиента 1, г')).toHaveValue('10');
  });

  it('ручной ввод продукта и запись его в справочник после ввода веса', async () => {
    const user = await renderApp();
    await user.type(screen.getByRole('combobox', { name: 'Ингредиент 1' }), 'Соус песто');
    await user.click(await screen.findByRole('option', { name: /Ввести «Соус песто» вручную/ }));
    const dialog = screen.getByRole('dialog', { name: 'Новый продукт' });
    await user.type(within(dialog).getByLabelText('Калорийность, ккал'), '450');
    await user.type(within(dialog).getByLabelText('Белки, г'), '5');
    await user.type(within(dialog).getByLabelText('Жиры, г'), '45');
    await user.type(within(dialog).getByLabelText('Углеводы, г'), '6');
    await user.click(within(dialog).getByRole('button', { name: 'Добавить в таблицу' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    expect(await db.products.where('nameNorm').equals('соус песто').count()).toBe(0);
    await user.type(screen.getByLabelText('Вес ингредиента 1, г'), '30');
    expect(cell('Калорийность, ккал, ингредиент 1')).toHaveTextContent('135');
    await waitFor(async () =>
      expect(await db.products.where('nameNorm').equals('соус песто').first()).toMatchObject({
        source: 'user',
        rank: 1,
      }),
    );
  });

  it('черновик переживает перезапуск приложения', async () => {
    const user = userEvent.setup();
    const first = render(<App />);
    await screen.findByRole('table');
    await user.type(screen.getByRole('combobox', { name: 'Ингредиент 1' }), 'карт');
    await user.click(await screen.findByRole('option', { name: /Картофель/ }));
    await user.type(screen.getByLabelText('Вес ингредиента 1, г'), '300');
    await waitFor(async () =>
      expect((await db.drafts.get('current'))?.rows[0]?.weight).toBe('300'),
    );

    first.unmount();
    render(<App />);
    const name = await screen.findByRole('combobox', { name: 'Ингредиент 1' });
    expect(name).toHaveValue('Картофель');
    expect(screen.getByLabelText('Вес ингредиента 1, г')).toHaveValue('300');
  });

  it('подсказки из Open Food Facts отмечены источником', async () => {
    vi.stubGlobal(
      'fetch',
      // Новый Response на каждый вызов: тело ответа читается один раз, а fetch зовут и проверка версии, и поиск.
      vi.fn().mockImplementation(
        async () =>
          new Response(
            JSON.stringify({
              products: [
                {
                  code: '4601916007082',
                  product_name_ru: 'Гречка ядрица «Тест»',
                  nutriments: {
                    'energy-kcal_100g': 351,
                    proteins_100g: 12,
                    fat_100g: 3.4,
                    carbohydrates_100g: 64.2,
                  },
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );
    const user = await renderApp();
    await user.type(screen.getByRole('combobox', { name: 'Ингредиент 1' }), 'греч');
    const external = await screen.findByRole('option', { name: /Гречка ядрица «Тест»/ });
    expect(external).toHaveTextContent('Open Food Facts · в сети');
    expect(screen.getByRole('option', { name: /Гречневая крупа ядрица/ })).toHaveTextContent(
      'Скурихин',
    );
  });

  it('ошибка сети оставляет подсказки справочника', async () => {
    const user = await renderApp();
    await user.type(screen.getByRole('combobox', { name: 'Ингредиент 1' }), 'карт');
    expect(await screen.findByRole('option', { name: /Картофель/ })).toBeInTheDocument();
    expect(await screen.findByText(/Не ответил: Open Food Facts/)).toBeInTheDocument();
  });

  it('без интернета — сообщение, поиск по справочнику работает', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const user = await renderApp();
    expect(screen.getByText(/Нет интернета. Поиск идёт только по справочнику/)).toBeInTheDocument();
    await user.type(screen.getByRole('combobox', { name: 'Ингредиент 1' }), 'карт');
    expect(await screen.findByRole('option', { name: /Картофель/ })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('настройки', () => {
  it('ключ USDA сохраняется на устройстве', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/settings';
    render(<App />);
    const key = await screen.findByLabelText('Ключ USDA API');
    await user.type(key, 'my-key');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(async () => expect((await db.settings.get('app'))?.usdaApiKey).toBe('my-key'));
  });
});

describe('доступность навигации', () => {
  it('смена раздела переводит фокус на заголовок страницы', async () => {
    const user = await renderApp();
    await user.click(screen.getByRole('link', { name: 'Настройки' }));
    const heading = await screen.findByRole('heading', { level: 1, name: 'Настройки' });
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it('ссылка «Перейти к содержимому» ставит фокус на основную область и не меняет раздел', async () => {
    const user = await renderApp();
    await user.click(screen.getByRole('link', { name: 'Перейти к содержимому' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('форма продукта с ошибками ставит фокус на первое неверное поле', async () => {
    const user = await renderApp();
    await user.type(screen.getByRole('combobox', { name: 'Ингредиент 1' }), 'Новый');
    await user.click(await screen.findByRole('option', { name: /Ввести «Новый» вручную/ }));
    const dialog = screen.getByRole('dialog', { name: 'Новый продукт' });
    await user.click(within(dialog).getByRole('button', { name: 'Добавить в таблицу' }));
    // Подпись поля теперь содержит и текст ошибки.
    expect(within(dialog).getByLabelText(/^Калорийность, ккал/)).toHaveFocus();
  });
});
