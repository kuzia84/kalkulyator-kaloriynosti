import { expect, test } from '@playwright/test';

test('кнопки окна встают друг под другом на узком экране', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile');
  await page.goto('./');
  await page.getByRole('button', { name: 'Новый продукт по штрихкоду' }).click();
  await page.getByRole('button', { name: 'Вручную' }).click();
  const row = page.locator('.modal .form-actions').last();
  await expect(row).not.toHaveClass(/is-stacked/);
  await page.setViewportSize({ width: 320, height: 700 });
  await expect(row).toHaveClass(/is-stacked/);
  await page.setViewportSize({ width: 412, height: 800 });
  await expect(row).not.toHaveClass(/is-stacked/);
});
