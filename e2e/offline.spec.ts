import { expect, test } from '@playwright/test';

test('PWA работает без интернета после первого открытия', async ({ page, context }) => {
  await page.goto('./');
  await expect(page.getByRole('table')).toBeVisible();
  // Service worker кэширует приложение при первом открытии.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByText(/Нет интернета\. Поиск идёт только по справочнику/)).toBeVisible();

  const name = page.getByRole('combobox', { name: 'Ингредиент 1' });
  await name.fill('карт');
  await page.getByRole('option', { name: /Картофель/ }).click();
  await page.getByLabel('Вес ингредиента 1, г').fill('100');
  await expect(page.getByLabel('Калорийность, ккал, ингредиент 1')).toHaveText('77');
  await context.setOffline(false);
});

test('манифест для установки', async ({ page }) => {
  await page.goto('./');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const res = await page.request.get(new URL(href!, page.url()).toString());
  const manifest = await res.json();
  expect(manifest).toMatchObject({ lang: 'ru', display: 'standalone' });
  expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
});
