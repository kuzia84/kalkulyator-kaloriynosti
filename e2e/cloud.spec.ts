import { expect, test, type Page } from '@playwright/test';

/** Страница входа сервиса сразу возвращает в приложение с токеном, как после согласия. */
async function fakeLogin(page: Page, host: string) {
  await page.route(`https://${host}/**`, async (route) => {
    const url = new URL(route.request().url());
    const back = new URL(url.searchParams.get('redirect_uri')!);
    back.hash = new URLSearchParams({
      access_token: 'e2e-token',
      token_type: 'bearer',
      expires_in: '3600',
      state: url.searchParams.get('state')!,
    }).toString();
    await route.fulfill({ status: 302, headers: { Location: back.toString() } });
  });
}

test('Google Диск: вход, выгрузка, загрузка на «другом устройстве»', async ({ page, browser }) => {
  let stored: string | null = null;
  const routeDrive = async (p: Page) => {
    await p.route('https://www.googleapis.com/**', async (route) => {
      const req = route.request();
      const url = req.url();
      if (url.includes('/oauth2/v3/userinfo')) {
        return route.fulfill({ json: { email: 'chef@gmail.com' } });
      }
      if (url.includes('uploadType=multipart')) {
        const body = req.postData() ?? '';
        stored = body.slice(body.indexOf('{"format"'), body.lastIndexOf('}') + 1);
        return route.fulfill({ json: { id: 'f1', modifiedTime: '2026-11-12T10:05:00.000Z' } });
      }
      if (url.includes('alt=media')) return route.fulfill({ body: stored ?? '' });
      if (url.includes('/drive/v3/files?')) {
        return route.fulfill({
          json: { files: stored ? [{ id: 'f1', modifiedTime: '2026-11-12T10:05:00.000Z' }] : [] },
        });
      }
      return route.fulfill({ status: 404 });
    });
  };

  // Основное устройство: блюдо в «Моих рецептах», вход, выгрузка.
  await routeDrive(page);
  await fakeLogin(page, 'accounts.google.com');
  await page.goto('./');
  await page.getByRole('combobox', { name: 'Ингредиент 1' }).fill('сахар');
  await page.getByRole('option', { name: /Сахар-песок/ }).click();
  await page.getByLabel('Вес ингредиента 1, г').fill('100');
  await page.getByLabel('Название блюда').fill('Сироп из облака');
  await page.getByRole('button', { name: 'Сохранить в рецепты' }).click();
  await expect(page.getByText('Рецепт сохранён в «Мои рецепты».')).toBeVisible();

  await page.goto('./#/settings');
  await page.getByRole('button', { name: /Войти через Google/ }).click();
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(page.getByText('Google Диск: chef@gmail.com')).toBeVisible();
  await expect(page.getByText(/Вход выполнен/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Выгрузить в облако' }).click();
  await expect(page.getByText(/Выгружено в сервис «Google Диск»/)).toBeVisible();
  expect(stored).toContain('Сироп из облака');

  // Другое устройство: чистый браузер, тот же аккаунт.
  const other = await browser.newContext({ locale: 'ru-RU' });
  const second = await other.newPage();
  await routeDrive(second);
  await fakeLogin(second, 'accounts.google.com');
  await second.goto(new URL('./#/settings', page.url()).toString());
  await second.getByRole('button', { name: /Войти через Google/ }).click();
  await second.getByRole('button', { name: 'Загрузить из облака' }).click();
  await expect(second.getByText(/Загружено из сервиса «Google Диск»/)).toBeVisible();
  await second.goto(new URL('./#/recipes', page.url()).toString());
  await expect(second.getByRole('heading', { name: 'Сироп из облака' })).toBeVisible();
  await other.close();
});

test('Яндекс: отказ во входе — сообщение, токена нет', async ({ page }) => {
  await page.route('https://oauth.yandex.ru/**', async (route) => {
    const url = new URL(route.request().url());
    const back = new URL(url.searchParams.get('redirect_uri')!);
    back.hash = `error=access_denied&state=${url.searchParams.get('state')}`;
    await route.fulfill({ status: 302, headers: { Location: back.toString() } });
  });
  await page.goto('./#/settings');
  await page.getByRole('button', { name: /Войти через Яндекс/ }).click();
  await expect(page.getByText('Вход отменён: доступ к облаку не выдан.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Войти через Яндекс/ })).toBeVisible();
});
