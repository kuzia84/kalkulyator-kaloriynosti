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
    await user.click(within(row).getByRole('checkbox', { name: 'Не проверено' }));
    await waitFor(async () => expect((await db.products.get('sk-023'))!.verified).toBe(true));
  });

  it('фильтр подозрительной калорийности', async () => {
    await db.products.update('sk-023', { kcal: 90 });
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'Не сходится с БЖУ' }));
    expect(screen.getByText(/Найдено: 1 из/)).toBeInTheDocument();
    const row = screen.getByText('Тыква').closest('tr')!;
    // Тыква: Б 1, Ж 0,1, У 4,4 — по БЖУ 22,5 ккал, указано 90.
    expect(within(row).getByText(/Не сходится: \+\d+ %/)).toBeInTheDocument();
    expect(within(row).getByText(/по БЖУ \d+(,\d)? ккал/)).toBeInTheDocument();
  });

  it('объяснение проверки калорийности называет оба порога', async () => {
    const user = await renderPage();
    await user.click(screen.getByText('Как это проверяется?'));
    const details = screen.getByText('Как это проверяется?').closest('details')!;
    expect(details).toHaveAttribute('open');
    expect(details).toHaveTextContent('больше чем на 15 %');
    expect(details).toHaveTextContent('не меньше чем на 5 ккал');
  });

  it('сортировка списком работает без заголовков таблицы', async () => {
    await db.products.update('sk-023', { rank: 50 });
    const user = await renderPage();
    await user.selectOptions(screen.getByLabelText('Сортировка'), 'Сначала частые');
    const first = screen.getAllByRole('row')[1]!;
    expect(within(first).getByText('Тыква')).toBeInTheDocument();
  });

  it('добавление продукта вручную', async () => {
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'Добавить продукт' }));
    const dialog = screen.getByRole('dialog', { name: 'Новый продукт' });
    await user.type(within(dialog).getByLabelText('Название'), 'Сыр адыгейский');
    await user.type(within(dialog).getByLabelText('Калорийность, ккал'), '240');
    await user.type(within(dialog).getByLabelText('Белки, г'), '18,5');
    await user.type(within(dialog).getByLabelText('Жиры, г'), '16');
    await user.type(within(dialog).getByLabelText('Углеводы, г'), '0');
    expect(within(dialog).getByRole('checkbox', { name: /Проверено/ })).toBeChecked();
    await user.click(within(dialog).getByRole('button', { name: 'Добавить' }));
    expect(await screen.findByText('Продукт «Сыр адыгейский» добавлен.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Новый продукт' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Поиск')).toHaveValue('Сыр адыгейский');
    expect(screen.getByText(/Найдено: 1 из/)).toBeInTheDocument();
    const saved = await db.products.where('nameNorm').equals('сыр адыгейский').first();
    expect(saved).toMatchObject({ source: 'user', verified: true, kcal: 240 });
  });

  it('пустой поиск предлагает добавить продукт с этим названием', async () => {
    const user = await renderPage();
    await user.type(screen.getByLabelText('Поиск'), 'Халва');
    await user.click(screen.getByRole('button', { name: 'Добавить «Халва»' }));
    const dialog = screen.getByRole('dialog', { name: 'Новый продукт' });
    expect(within(dialog).getByLabelText('Название')).toHaveValue('Халва');
  });

  it('занятый штрихкод: окно остаётся открытым с ошибкой', async () => {
    await db.products.update('sk-014', { barcode: '4601916007082' });
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'Добавить продукт' }));
    const dialog = screen.getByRole('dialog', { name: 'Новый продукт' });
    await user.type(within(dialog).getByLabelText('Название'), 'Кефир');
    await user.type(within(dialog).getByLabelText('Калорийность, ккал'), '51');
    await user.type(within(dialog).getByLabelText('Белки, г'), '2,8');
    await user.type(within(dialog).getByLabelText('Жиры, г'), '3,2');
    await user.type(within(dialog).getByLabelText('Углеводы, г'), '4,1');
    await user.type(within(dialog).getByLabelText('Штрихкод (если есть)'), '4601916007082');
    await user.click(within(dialog).getByRole('button', { name: 'Добавить' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/уже есть у «Картофель»/);
    expect(within(dialog).getByLabelText('Название')).toHaveValue('Кефир');
  });

  it('поиск в сети заполняет форму, запись сохраняет источник', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => offResponse({ products: [OFF_TVOROG] })),
    );
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'Добавить продукт' }));
    const dialog = screen.getByRole('dialog', { name: 'Новый продукт' });
    await user.click(within(dialog).getByRole('button', { name: 'Найти в сети' }));
    await user.type(within(dialog).getByLabelText('Название и производитель'), 'творог тест');
    await user.click(within(dialog).getByRole('button', { name: 'Найти' }));
    await user.click(
      await within(dialog).findByRole('button', { name: 'Заполнить форму: Творог 5 % «Тест»' }),
    );
    // Заполнение ждёт проверки справочника: запись могли сохранить раньше.
    await waitFor(() =>
      expect(within(dialog).getByLabelText('Название')).toHaveValue('Творог 5 % «Тест»'),
    );
    expect(within(dialog).getByRole('button', { name: 'Вручную' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(dialog).getByText(/Заполнено из Open Food Facts/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Название')).toHaveValue('Творог 5 % «Тест»');
    expect(within(dialog).getByLabelText('Калорийность, ккал')).toHaveValue('121');
    expect(within(dialog).getByLabelText('Штрихкод (если есть)')).toHaveValue('4601916007082');
    // Значения из сети человек ещё не сверил.
    expect(within(dialog).getByRole('checkbox', { name: /Проверено/ })).not.toBeChecked();
    await user.click(within(dialog).getByRole('button', { name: 'Добавить' }));
    expect(await screen.findByText('Продукт «Творог 5 % «Тест»» добавлен.')).toBeInTheDocument();
    const saved = await db.products.where('barcode').equals('4601916007082').first();
    expect(saved).toMatchObject({
      source: 'off',
      externalId: 'off:4601916007082',
      verified: false,
    });
  });

  it('поиск в сети без ответа источника показывает ошибку', async () => {
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'Добавить продукт' }));
    const dialog = screen.getByRole('dialog', { name: 'Новый продукт' });
    await user.click(within(dialog).getByRole('button', { name: 'Найти в сети' }));
    await user.type(within(dialog).getByLabelText('Название и производитель'), 'творог');
    await user.click(within(dialog).getByRole('button', { name: 'Найти' }));
    expect(await within(dialog).findByText(/Не ответил: Open Food Facts/)).toBeInTheDocument();
  });

  it('штрихкод заполняет форму из внешнего источника', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => offResponse({ status: 1, product: OFF_TVOROG })),
    );
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'Добавить продукт' }));
    const dialog = screen.getByRole('dialog', { name: 'Новый продукт' });
    await user.type(within(dialog).getByLabelText('Название'), 'черновик');
    await user.click(within(dialog).getByRole('button', { name: 'По штрихкоду' }));
    await user.type(within(dialog).getByLabelText('Или введите цифры кода'), '4601916007082');
    await user.click(within(dialog).getByRole('button', { name: 'Найти' }));
    await user.click(await within(dialog).findByRole('button', { name: 'Заполнить форму' }));
    await waitFor(() =>
      expect(within(dialog).getByLabelText('Название')).toHaveValue('Творог 5 % «Тест»'),
    );
    expect(within(dialog).getByLabelText('Жиры, г')).toHaveValue('5');
  });

  it('штрихкод не найден: код переходит в форму, введённое остаётся', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 404 })));
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'Добавить продукт' }));
    const dialog = screen.getByRole('dialog', { name: 'Новый продукт' });
    await user.type(within(dialog).getByLabelText('Название'), 'Сырок');
    await user.click(within(dialog).getByRole('button', { name: 'По штрихкоду' }));
    await user.type(within(dialog).getByLabelText('Или введите цифры кода'), '96385074');
    await user.click(within(dialog).getByRole('button', { name: 'Найти' }));
    await user.click(await within(dialog).findByRole('button', { name: 'Ввести продукт вручную' }));
    expect(within(dialog).getByLabelText('Название')).toHaveValue('Сырок');
    expect(within(dialog).getByLabelText('Штрихкод (если есть)')).toHaveValue('96385074');
  });

  it('штрихкод продукта из справочника показывает эту запись', async () => {
    await db.products.update('sk-014', { barcode: '4601916007082' });
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'Добавить продукт' }));
    const dialog = screen.getByRole('dialog', { name: 'Новый продукт' });
    await user.click(within(dialog).getByRole('button', { name: 'По штрихкоду' }));
    await user.type(within(dialog).getByLabelText('Или введите цифры кода'), '4601916007082');
    await user.click(within(dialog).getByRole('button', { name: 'Найти' }));
    await user.click(await within(dialog).findByRole('button', { name: 'Показать в справочнике' }));
    expect(screen.queryByRole('dialog', { name: 'Новый продукт' })).not.toBeInTheDocument();
    expect(screen.getByText(/«Картофель» уже есть в справочнике/)).toBeInTheDocument();
    expect(screen.getByLabelText('Поиск')).toHaveValue('Картофель');
  });

  it('пустой результат из-за фильтра не предлагает добавить продукт', async () => {
    const user = await renderPage();
    await user.click(
      within(screen.getByRole('group', { name: 'Фильтры' })).getByRole('button', {
        name: 'Проверено',
      }),
    );
    await user.type(screen.getByLabelText('Поиск'), 'тыква');
    expect(screen.getByText(/Найдено: 0 из/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Добавить «тыква»' })).not.toBeInTheDocument();
  });

  it('результат из сети, который уже в справочнике, показывает эту запись', async () => {
    await db.products.update('sk-037', { externalId: 'off:4601916007082' });
    const name = (await db.products.get('sk-037'))!.name;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => offResponse({ products: [OFF_TVOROG] })),
    );
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'Добавить продукт' }));
    const dialog = screen.getByRole('dialog', { name: 'Новый продукт' });
    await user.click(within(dialog).getByRole('button', { name: 'Найти в сети' }));
    await user.type(within(dialog).getByLabelText('Название и производитель'), 'творог тест');
    await user.click(within(dialog).getByRole('button', { name: 'Найти' }));
    await user.click(
      await within(dialog).findByRole('button', { name: 'Заполнить форму: Творог 5 % «Тест»' }),
    );
    expect(
      await screen.findByText(`Продукт «${name}» уже есть в справочнике. Он показан в списке.`),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Новый продукт' })).not.toBeInTheDocument();
  });

  it('Tab в окне не уходит в скрытую форму', async () => {
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'Добавить продукт' }));
    const dialog = screen.getByRole('dialog', { name: 'Новый продукт' });
    await user.click(within(dialog).getByRole('button', { name: 'Найти в сети' }));
    const find = within(dialog).getByRole('button', { name: 'Найти' });
    find.focus();
    await user.tab();
    expect(within(dialog).getByRole('button', { name: 'Закрыть' })).toHaveFocus();
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

/** Новый Response на каждый вызов: тело читается один раз, а fetch зовёт и проверка версии. */
function offResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
