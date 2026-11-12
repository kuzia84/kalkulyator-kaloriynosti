import { expect, test, type Page } from '@playwright/test';

const WIDTHS = [320, 360, 375];

/** Ширина документа не больше окна: нет прокрутки вбок. */
async function expectNoSideScroll(page: Page, where: string) {
  const [scroll, inner] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(scroll, where).toBeLessThanOrEqual(inner);
}

/** Текст элемента виден целиком: не обрезан и не уходит за край. */
async function expectNotClipped(page: Page, selector: string, where: string) {
  const clipped = await page
    .locator(selector)
    .evaluateAll((els) =>
      els.filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent || ''),
    );
  expect(clipped, where).toEqual([]);
}

test.describe('узкий экран', () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile');
    await page.route(/openfoodfacts\.org|api\.nal\.usda\.gov/, (route) => route.abort());
    await page.goto('./');
    await page.getByRole('combobox', { name: 'Ингредиент 1' }).fill('греч');
    await page.getByRole('option', { name: /Гречневая крупа ядрица/ }).click();
    await page.getByLabel('Вес ингредиента 1, г').fill('1250.5');
    await page.getByLabel('Название блюда').fill('Гречка с очень длинным названием для проверки');
    await page.getByRole('button', { name: 'Сохранить в рецепты' }).click();
    await expect(page.getByText('Рецепт сохранён в «Мои рецепты».')).toBeVisible();
  });

  test('калькулятор и правка рецепта: нет прокрутки вбок, вес и вкладки видны целиком', async ({
    page,
  }) => {
    await page.goto('./#/recipes');
    const href = await page.getByRole('link', { name: /^Изменить рецепт/ }).getAttribute('href');
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 740 });
      for (const hash of ['#/', href!]) {
        await page.goto(`./${hash}`);
        await expect(page.getByLabel('Вес ингредиента 1, г')).toHaveValue('1250.5');
        const where = `${hash}, ${width}px`;
        await expectNoSideScroll(page, where);
        await expectNotClipped(page, '.weight-field .input', where);
        await expectNotClipped(page, '.app-nav-short', where);
        await expectNotClipped(
          page,
          '.ingredient-row :is(.cell-protein, .cell-fat, .cell-carbs)',
          where,
        );
        await expectNotClipped(page, '.form-actions-start .button', where);
      }
    }
  });

  test('рецепты: кнопки карточки помещаются, «⋯» видна', async ({ page }) => {
    await page.goto('./#/recipes');
    const menu = page.getByRole('button', { name: /^Ещё действия с рецептом/ });
    await expect(menu).toBeVisible();
    for (const width of [...WIDTHS, 390, 459]) {
      await page.setViewportSize({ width, height: 800 });
      await expectNoSideScroll(page, `${width}px`);
      const box = await menu.boundingBox();
      const inner = await page.evaluate(() => document.documentElement.clientWidth);
      expect(box && box.x + box.width, `«⋯» на ${width}px`).toBeLessThanOrEqual(inner);
    }
  });

  test('справочник: сортировка помещается, отметка проверки не наезжает на «Изменить»', async ({
    page,
  }) => {
    await page.goto('./#/moderation');
    const card = page.locator('.catalog-table tbody tr').first();
    await expect(card).toBeVisible();
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 740 });
      await expectNoSideScroll(page, `${width}px`);
      const a = await card.locator('.verified-toggle').boundingBox();
      const b = await card.getByRole('button', { name: /^Изменить/ }).boundingBox();
      const overlap =
        !!a &&
        !!b &&
        a.x < b.x + b.width &&
        b.x < a.x + a.width &&
        a.y < b.y + b.height &&
        b.y < a.y + a.height;
      expect(overlap, `${width}px`).toBe(false);
    }
  });

  test('настройки и окно «Новый продукт»: нет прокрутки вбок', async ({ page }) => {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 740 });
      await page.goto('./#/settings');
      await expect(page.getByRole('heading', { name: 'Настройки', level: 1 })).toBeVisible();
      await expectNoSideScroll(page, `настройки, ${width}px`);
      await page.goto('./#/');
      await page.getByRole('button', { name: 'Новый продукт по штрихкоду' }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      for (const mode of ['Вручную', 'По штрихкоду']) {
        await dialog.getByRole('button', { name: mode, exact: true }).click();
        const [scroll, inner] = await page
          .locator('.modal')
          .evaluate((el) => [el.scrollWidth, el.clientWidth]);
        expect(scroll, `окно, ${mode}, ${width}px`).toBeLessThanOrEqual(inner);
        await expectNoSideScroll(page, `окно, ${mode}, ${width}px`);
      }
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
    }
  });
});
