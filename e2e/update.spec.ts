import { expect, test } from '@playwright/test';

test('version.json отдаётся и совпадает со сборкой страницы', async ({ page, request }) => {
  await page.goto('./#/settings');
  const res = await request.get('version.json');
  expect(res.ok()).toBe(true);
  const remote = (await res.json()) as { version: string; build: string };
  const card = page.locator('.update-card');
  await expect(card).toContainText(`Установлена версия ${remote.version} (сборка ${remote.build})`);
  await expect(card).toContainText('Установлена последняя версия.');
  // Блок версии — первый на странице настроек.
  await expect(page.locator('.settings fieldset').first()).toHaveClass(/update-card/);
});

test('новая версия на сервере: «!» у «Настроек» и выделенная кнопка', async ({ page }) => {
  await page.route(/version\.json/, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ version: '9.9.9', build: 'next999', builtAt: '2099-01-01T00:00:00Z' }),
    }),
  );
  await page.goto('./');
  await expect(page.getByRole('link', { name: /Настройки.*есть обновление/ })).toBeVisible();
  await page.getByRole('link', { name: /Настройки/ }).click();
  const button = page.getByRole('button', { name: /Обновить приложение/ });
  await expect(button).toBeVisible();
  await expect(button).toHaveCSS('background-color', 'rgb(194, 65, 12)');
});
