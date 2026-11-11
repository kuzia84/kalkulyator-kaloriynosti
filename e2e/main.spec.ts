import { expect, test, type Page } from '@playwright/test';

// Внешние источники в сквозных тестах не нужны: сеть к ним закрыта, работает справочник.
async function blockExternal(page: Page) {
  await page.route(/openfoodfacts\.org|api\.nal\.usda\.gov/, (route) => route.abort());
}

async function pick(page: Page, row: number, query: string, option: RegExp) {
  const name = page.getByRole('combobox', { name: `Ингредиент ${row}` });
  await name.fill(query);
  await page.getByRole('option', { name: option }).click();
  await expect(name).not.toHaveValue(query);
}

test.beforeEach(async ({ page }) => {
  await blockExternal(page);
  await page.goto('./');
  await expect(page.getByRole('table')).toBeVisible();
});

test('основной сценарий: продукт, вес, вес готового блюда, перезагрузка', async ({ page }) => {
  await expect(page.getByRole('combobox')).toHaveCount(4);

  await pick(page, 1, 'греч', /Гречневая крупа ядрица/);
  await page.getByLabel('Вес ингредиента 1, г').fill('200');
  await pick(page, 2, 'вода', /Вода питьевая/);
  await page.getByLabel('Вес ингредиента 2, г').fill('400');

  // 308 × 200 / 100 = 616 ккал; общий вес 600 г.
  await expect(page.getByLabel('Калорийность, ккал, ингредиент 1')).toHaveText('616');
  await expect(page.getByLabel('Общий вес, г')).toHaveText('600');
  await expect(page.getByLabel('Калорийность, ккал, итого')).toHaveText('616');
  // 616 / 600 × 100 = 102,67 → 103
  await expect(page.getByLabel('Калорийность, ккал, на 100 г блюда')).toHaveText('103');

  await page.getByLabel('На 100 г готового блюда (с учётом уварки)').fill('560');
  // 616 / 560 × 100 = 110
  await expect(page.getByLabel('Калорийность, ккал, на 100 г готового блюда')).toHaveText('110');
  await expect(page.getByLabel('Белки, г, на 100 г готового блюда')).toHaveText('4,5');

  // Черновик пишется с паузой: ждём, пока запись появится в IndexedDB, и перезагружаем страницу.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<string | null>((resolve) => {
            const open = indexedDB.open('kalkulyator-kaloriynosti');
            open.onerror = () => resolve(null);
            open.onsuccess = () => {
              const get = open.result.transaction('drafts').objectStore('drafts').get('current');
              get.onsuccess = () => {
                resolve(
                  (get.result as { cookedWeight?: string } | undefined)?.cookedWeight ?? null,
                );
                open.result.close();
              };
              get.onerror = () => resolve(null);
            };
          }),
      ),
    )
    .toBe('560');
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Ингредиент 1' })).toHaveValue(
    'Гречневая крупа ядрица',
  );
  await expect(page.getByLabel('Вес ингредиента 1, г')).toHaveValue('200');
  await expect(page.getByLabel('На 100 г готового блюда (с учётом уварки)')).toHaveValue('560');
  await expect(page.getByLabel('Калорийность, ккал, на 100 г готового блюда')).toHaveText('110');
});

test('контрольный пример ТЗ через ручной ввод, десятичная запятая', async ({ page }) => {
  async function manual(row: number, name: string, kcal: string) {
    await page.getByRole('combobox', { name: `Ингредиент ${row}` }).fill(name);
    await page.getByRole('option', { name: new RegExp(`Ввести «${name}» вручную`) }).click();
    const dialog = page.getByRole('dialog', { name: 'Новый продукт' });
    await dialog.getByLabel('Калорийность, ккал').fill(kcal);
    await dialog.getByLabel('Белки, г').fill('0');
    await dialog.getByLabel('Жиры, г').fill('0');
    await dialog.getByLabel('Углеводы, г').fill('37,5');
    await dialog.getByRole('button', { name: 'Добавить в таблицу' }).click();
  }
  await manual(1, 'Ингредиент А', '150');
  await page.getByLabel('Вес ингредиента 1, г').fill('200');
  await manual(2, 'Ингредиент Б', '200');
  await page.getByLabel('Вес ингредиента 2, г').fill('300');

  await expect(page.getByLabel('Калорийность, ккал, ингредиент 1')).toHaveText('300');
  await expect(page.getByLabel('Калорийность, ккал, ингредиент 2')).toHaveText('600');
  await expect(page.getByLabel('Общий вес, г')).toHaveText('500');
  await expect(page.getByLabel('Калорийность, ккал, итого')).toHaveText('900');
  await expect(page.getByLabel('Калорийность, ккал, на 100 г блюда')).toHaveText('180');
  await page.getByLabel('На 100 г готового блюда (с учётом уварки)').fill('400');
  await expect(page.getByLabel('Калорийность, ккал, на 100 г готового блюда')).toHaveText('225');
});

test('клавиатура: стрелки, Enter, Escape; список видит до 5 пунктов', async ({ page }) => {
  const name = page.getByRole('combobox', { name: 'Ингредиент 1' });
  await name.fill('к');
  const list = page.getByRole('listbox', { name: 'Подсказки: Ингредиент 1' });
  await expect(list).toBeVisible();
  const box = await list.boundingBox();
  const option = await list.getByRole('option').first().boundingBox();
  expect(box && option ? Math.round(box.height / option.height) : 0).toBeLessThanOrEqual(5);
  await name.press('Escape');
  await expect(name).toHaveAttribute('aria-expanded', 'false');
  await name.press('ArrowDown');
  await name.press('Enter');
  await expect(name).toHaveAttribute('aria-expanded', 'false');
  await expect(name).not.toHaveValue('к');
});

test('нет горизонтальной прокрутки', async ({ page }) => {
  const [scroll, width] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    window.innerWidth,
  ]);
  expect(scroll).toBeLessThanOrEqual(width);
});

for (const theme of ['light', 'dark'] as const) {
  test(`рамка поля ввода заметна (${theme}): контраст к фону страницы и карточки не меньше 3:1`, async ({
    page,
  }) => {
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    const ratios = await page.evaluate(() => {
      const lum = (c: string) => {
        const [r, g, b] = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map((v) => {
          const x = Number(v) / 255;
          return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
      };
      const contrast = (a: string, b: string) => {
        const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
        return (x! + 0.05) / (y! + 0.05);
      };
      const border = getComputedStyle(
        document.querySelector<HTMLElement>('.input')!,
      ).borderTopColor;
      // Рамку сравниваем с цветами вокруг поля: фон страницы, карточки и шапки таблицы.
      return ['--bg', '--surface', '--surface-2'].map((token) => {
        const probe = document.createElement('div');
        probe.style.background = `var(${token})`;
        document.body.append(probe);
        const bg = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return contrast(border, bg);
      });
    });
    for (const r of ratios) expect(r).toBeGreaterThanOrEqual(3);
  });
}

test('планшет и телефон в горизонтальной ориентации: карточки, без прокрутки вбок', async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 400 });
  // Карточный вид: строка таблицы — сетка, а не строка таблицы.
  await expect(page.locator('.dish-table tbody tr').first()).toHaveCSS('display', 'grid');
  const [scroll, width] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    window.innerWidth,
  ]);
  expect(scroll).toBeLessThanOrEqual(width);
});

test('правка рецепта: новый вес пересчитывает калорийность в списке', async ({ page }) => {
  await pick(page, 1, 'греч', /Гречневая крупа ядрица/);
  await page.getByLabel('Вес ингредиента 1, г').fill('100');
  await page.getByLabel('Название блюда').fill('Гречка');
  await page.getByRole('button', { name: 'Сохранить в рецепты' }).click();
  await expect(page.getByText('Рецепт сохранён в «Мои рецепты».')).toBeVisible();

  await page.getByRole('link', { name: 'Мои рецепты' }).click();
  await expect(page.getByText(/308 ккал на 100 г/)).toBeVisible();
  await page.getByRole('link', { name: 'Изменить рецепт «Гречка»' }).click();
  await expect(page.getByRole('heading', { name: 'Правка рецепта' })).toBeVisible();

  await pick(page, 2, 'вода', /Вода питьевая/);
  await page.getByLabel('Вес ингредиента 2, г').fill('100');
  // 308 ккал на 200 г → 154 на 100 г
  await expect(page.getByLabel('Калорийность, ккал, на 100 г блюда')).toHaveText('154');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();

  await expect(page.getByText('Рецепт «Гречка» обновлён.')).toBeVisible();
  await expect(page.getByText(/2 ингр\. · вес 200 г · 154 ккал на 100 г/)).toBeVisible();
});
