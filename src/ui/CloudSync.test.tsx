import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSession, saveSession } from '../cloud/oauth';
import { exportBackup } from '../storage/backup';
import { db } from '../storage/db';
import { saveRecipe } from '../storage/recipes';
import { dishReducer, initialDishState } from '../dish/state';
import { resetDb } from '../test/db';
import { App } from './App';

/** Ответы облака по адресу запроса. Неизвестный адрес — ошибка теста. */
type Route = (url: string, init: RequestInit) => Response | undefined;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function mockCloud(route: Route) {
  const fn = vi.fn(async (url: string, init: RequestInit = {}) => {
    const res = route(url, init);
    if (!res) throw new Error(`Неожиданный запрос: ${init.method ?? 'GET'} ${url}`);
    return res;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

async function addRecipe(name: string, at: number) {
  const s = dishReducer(initialDishState(), { type: 'setDishName', value: name });
  return saveRecipe(s, db, at);
}

function openSettings() {
  window.location.hash = '#/settings';
  render(<App />);
}

beforeEach(async () => {
  await resetDb();
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'gid');
  vi.stubEnv('VITE_YANDEX_CLIENT_ID', 'yid');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  window.location.hash = '';
});

describe('облако в настройках', () => {
  it('без client ID облака нет', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');
    vi.stubEnv('VITE_YANDEX_CLIENT_ID', '');
    openSettings();
    await screen.findByRole('button', { name: /Сохранить в файл/ });
    expect(screen.queryByRole('button', { name: /Войти через/ })).toBeNull();
  });

  it('без входа — кнопки входа для обоих сервисов', async () => {
    openSettings();
    expect(await screen.findByRole('button', { name: /Войти через Google/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Войти через Яндекс/ })).toBeEnabled();
  });

  it('после входа: почта, дата копии, выгрузка пишет файл', async () => {
    saveSession('google', { token: 'tok', expiresAt: null, account: '' });
    let uploaded = '';
    mockCloud((url, init) => {
      if (url.includes('/oauth2/v3/userinfo')) return json({ email: 'me@gmail.com' });
      if (url.includes('uploadType=multipart')) {
        uploaded = String(init.body);
        return json({ id: 'f1', modifiedTime: '2026-11-12T10:05:00.000Z' });
      }
      if (url.includes('/drive/v3/files?')) return json({ files: [] });
      return undefined;
    });
    await addRecipe('Борщ', 1000);
    const user = userEvent.setup();
    openSettings();

    expect(await screen.findByText('Google Диск: me@gmail.com')).toBeInTheDocument();
    expect(await screen.findByText('Копии в облаке пока нет.')).toBeInTheDocument();
    expect(getSession('google')?.account).toBe('me@gmail.com');

    await user.click(screen.getByRole('button', { name: 'Выгрузить в облако' }));
    expect(await screen.findByText(/Выгружено в сервис «Google Диск»/)).toBeInTheDocument();
    expect(uploaded).toContain('Борщ');
    expect(screen.getByText(/В облаке: копия от 12\.11\.2026/)).toBeInTheDocument();
  });

  it('выгрузка поверх чужой копии спрашивает, после загрузки — не спрашивает', async () => {
    await addRecipe('Местный', 1000);
    const cloudJson = JSON.stringify(await exportBackup());
    saveSession('google', { token: 'tok', expiresAt: null, account: 'me@gmail.com' });
    let modified = '2026-11-10T08:00:00.000Z';
    let writes = 0;
    mockCloud((url) => {
      if (url.includes('/upload/drive/v3/files/f1')) {
        writes += 1;
        modified = `2026-11-12T10:0${writes}:00.000Z`;
        return json({ id: 'f1', modifiedTime: modified });
      }
      if (url.includes('/files/f1?alt=media')) return new Response(cloudJson);
      if (url.includes('/drive/v3/files?')) {
        return json({ files: [{ id: 'f1', modifiedTime: modified }] });
      }
      return undefined;
    });
    const user = userEvent.setup();
    openSettings();

    await user.click(await screen.findByRole('button', { name: 'Выгрузить в облако' }));
    const dialog = await screen.findByRole('dialog', { name: 'Записать поверх копии в облаке?' });
    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }));
    expect(writes).toBe(0);

    // Загрузка запоминает копию: следующая выгрузка идёт без вопроса.
    await user.click(screen.getByRole('button', { name: 'Загрузить из облака' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Объединить' }),
    );
    await screen.findByText(/Загружено из сервиса «Google Диск»/);
    await user.click(screen.getByRole('button', { name: 'Выгрузить в облако' }));
    await screen.findByText(/Выгружено в сервис «Google Диск»/);
    expect(writes).toBe(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('загрузка при своих рецептах спрашивает, «Заменить» оставляет рецепты облака', async () => {
    await addRecipe('Из облака', 1000);
    const cloudJson = JSON.stringify(await exportBackup());
    await resetDb();
    await addRecipe('Местный 1', 2000);
    await addRecipe('Местный 2', 3000);

    saveSession('yandex', { token: 'tok', expiresAt: null, account: 'chef@yandex.ru' });
    mockCloud((url) => {
      if (url.includes('/resources/download')) return json({ href: 'https://dl.example/x' });
      if (url === 'https://dl.example/x') return new Response(cloudJson);
      if (url.includes('/v1/disk/resources?')) return json({ modified: '2026-11-12T10:00:00Z' });
      return undefined;
    });
    const user = userEvent.setup();
    openSettings();

    await user.click(await screen.findByRole('button', { name: 'Загрузить из облака' }));
    const dialog = await screen.findByRole('dialog', { name: 'Загрузить рецепты из облака?' });
    expect(dialog).toHaveTextContent('В облаке — 1 рецепт');
    expect(dialog).toHaveTextContent('На этом устройстве — 2 рецепта');

    await user.click(within(dialog).getByRole('button', { name: 'Заменить' }));
    await waitFor(async () =>
      expect((await db.recipes.toArray()).map((r) => r.name)).toEqual(['Из облака']),
    );
    expect(await screen.findByText(/Рецепты заменены/)).toBeInTheDocument();
  });

  it('загрузка на пустое устройство идёт без вопроса', async () => {
    await addRecipe('Из облака', 1000);
    const cloudJson = JSON.stringify(await exportBackup());
    await resetDb();

    saveSession('google', { token: 'tok', expiresAt: null, account: 'me@gmail.com' });
    mockCloud((url) => {
      if (url.includes('/drive/v3/files?'))
        return json({ files: [{ id: 'f1', modifiedTime: 't' }] });
      if (url.includes('/files/f1?alt=media')) return new Response(cloudJson);
      return undefined;
    });
    const user = userEvent.setup();
    openSettings();

    await user.click(await screen.findByRole('button', { name: 'Загрузить из облака' }));
    await waitFor(async () => expect(await db.recipes.count()).toBe(1));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('истёкший токен — снова кнопка входа с почтой', async () => {
    saveSession('google', { token: 'old', expiresAt: null, account: 'me@gmail.com' });
    mockCloud(() => json({}, 401));
    openSettings();

    const button = await screen.findByRole('button', { name: /Войти через Google/ });
    expect(button).toHaveTextContent('me@gmail.com: вход истёк, войдите снова.');
    expect(await screen.findByText(/Вход в сервис «Google Диск» истёк/)).toBeInTheDocument();
  });

  it('выход забывает вход только этого сервиса', async () => {
    saveSession('google', { token: 'g', expiresAt: null, account: 'me@gmail.com' });
    saveSession('yandex', { token: 'y', expiresAt: null, account: 'chef' });
    mockCloud((url) => {
      if (url.includes('/drive/v3/files?')) return json({ files: [] });
      if (url.includes('/v1/disk/resources?')) return json({}, 404);
      return undefined;
    });
    const user = userEvent.setup();
    openSettings();

    await user.click(await screen.findByRole('button', { name: 'Выйти из сервиса «Google Диск»' }));
    expect(getSession('google')).toBeNull();
    expect(getSession('yandex')?.token).toBe('y');
    expect(screen.getByRole('button', { name: /Войти через Google/ })).toBeInTheDocument();
  });

  it('без сети кнопки облака неактивны', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    saveSession('yandex', { token: 'y', expiresAt: null, account: 'chef' });
    const fetchMock = mockCloud(() => undefined);
    openSettings();

    expect(await screen.findByRole('button', { name: 'Выгрузить в облако' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Загрузить из облака' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Войти через Google/ })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
