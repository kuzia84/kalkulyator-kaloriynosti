import { expect, test } from '@playwright/test';

test('кнопки окна встают друг под другом, когда не помещаются в строку', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile');
  await page.goto('./');
  await page.getByRole('button', { name: 'Новый продукт по штрихкоду' }).click();
  await page.getByRole('button', { name: 'Вручную' }).click();
  const row = page.locator('.modal .form-actions').last();
  await expect(row).not.toHaveClass(/is-stacked/);
  // Помещаются ли обычные подписи на 320 px, зависит от шрифтов системы. Длинная подпись
  // не помещается нигде: так тест не зависит от шрифтов.
  await page.setViewportSize({ width: 320, height: 700 });
  const button = row.getByRole('button').last();
  const label = await button.textContent();
  await button.evaluate((b) => {
    b.textContent = 'Сохранить продукт в справочник и вернуться к блюду';
  });
  await expect(row).toHaveClass(/is-stacked/);
  await button.evaluate((b, text) => {
    b.textContent = text;
  }, label);
  await page.setViewportSize({ width: 412, height: 800 });
  await expect(row).not.toHaveClass(/is-stacked/);
});
