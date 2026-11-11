import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CURRENT_VERSION, UPDATE_STORAGE_KEY } from '../app/updates';
import { db } from '../storage/db';
import { resetDb } from '../test/db';
import { App } from './App';

const NEWER = { version: '9.9.9', build: 'new9999', builtAt: '2099-01-01T00:00:00.000Z' };

function serveVersion(body: unknown) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('version.json')) return new Response(JSON.stringify(body));
    throw new TypeError('Failed to fetch');
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const versionCalls = (m: ReturnType<typeof serveVersion>) =>
  m.mock.calls.filter(([u]) => String(u).includes('version.json')).length;

beforeEach(async () => {
  await resetDb();
  window.location.hash = '#/settings';
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = '';
});

async function renderSettings() {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole('heading', { level: 1, name: 'Настройки' });
  return user;
}

describe('обновление приложения', () => {
  it('блок «Версия приложения» — первый в настройках', async () => {
    serveVersion(CURRENT_VERSION);
    await renderSettings();
    const first = document.querySelector('.settings fieldset legend');
    expect(first).toHaveTextContent('Версия приложения');
    expect(
      screen.getByText(new RegExp(`Установлена версия ${CURRENT_VERSION.version}`)),
    ).toBeInTheDocument();
  });

  it('та же сборка на сервере — «последняя версия», без «!»', async () => {
    serveVersion(CURRENT_VERSION);
    await renderSettings();
    expect(await screen.findByText('Установлена последняя версия.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Настройки' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Обновить приложение/ })).not.toBeInTheDocument();
  });

  it('новая сборка — «!» у «Настроек» и выделенная кнопка обновления', async () => {
    serveVersion(NEWER);
    const user = await renderSettings();
    expect(
      await screen.findByRole('link', { name: /Настройки.*есть обновление/ }),
    ).toBeInTheDocument();
    const button = screen.getByRole('button', { name: /Обновить приложение/ });
    expect(button).toHaveClass('button-update');
    expect(screen.getByText(/Вышла новая версия 9\.9\.9/)).toBeInTheDocument();

    // Без ждущего service worker обновление сбрасывает кэш и перезагружает страницу
    // по новому адресу: так index.html не берётся из HTTP-кэша.
    const replace = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      pathname: '/',
      hash: '#/settings',
      replace,
    });
    await user.click(button);
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(expect.stringMatching(/^\/\?r=\d+#\/settings$/)),
    );
  });

  it('нет связи с сервером — понятное сообщение, «!» нет', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await renderSettings();
    expect(await screen.findByText(/нет связи/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Настройки' })).toBeInTheDocument();
  });

  it('проверка не повторяется раньше чем через сутки', async () => {
    localStorage.setItem(
      UPDATE_STORAGE_KEY,
      JSON.stringify({ lastCheckAt: Date.now() - 60 * 60 * 1000, remote: CURRENT_VERSION }),
    );
    const fetchMock = serveVersion(CURRENT_VERSION);
    const user = await renderSettings();
    expect(versionCalls(fetchMock)).toBe(0);
    await user.click(screen.getByRole('button', { name: 'Проверить обновления' }));
    await waitFor(() => expect(versionCalls(fetchMock)).toBe(1));
  });

  it('сброс кэша удаляет Cache Storage и не трогает данные', async () => {
    serveVersion(CURRENT_VERSION);
    const deleted: string[] = [];
    vi.stubGlobal('caches', {
      keys: async () => ['workbox-precache', 'other'],
      delete: async (k: string) => {
        deleted.push(k);
        return true;
      },
    });
    const replace = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, replace });
    const before = await db.products.count();
    const user = await renderSettings();
    const card = screen.getByText('Версия приложения').closest('fieldset')!;
    await user.click(
      within(card as HTMLElement).getByRole('button', { name: 'Сбросить кэш и перезагрузить' }),
    );
    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(deleted).toEqual(['workbox-precache', 'other']);
    expect(await db.products.count()).toBe(before);
  });

  it('сервер ответил, но не version.json — сообщение не про связь', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>', { status: 200 })),
    );
    await renderSettings();
    expect(await screen.findByText(/Сервер не отдал данные о версии/)).toBeInTheDocument();
  });

  it('без сети кнопки обновления и сброса кэша недоступны, проверка ждёт сеть', async () => {
    localStorage.setItem(
      UPDATE_STORAGE_KEY,
      JSON.stringify({ lastCheckAt: Date.now() - 48 * 60 * 60 * 1000, remote: NEWER }),
    );
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const fetchMock = serveVersion(NEWER);
    await renderSettings();
    expect(screen.getByRole('button', { name: /Обновить приложение/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Сбросить кэш и перезагрузить' })).toBeDisabled();
    expect(screen.getByText(/сейчас нет связи/)).toBeInTheDocument();
    expect(versionCalls(fetchMock)).toBe(0);

    // Сеть появилась — проверка идёт сразу, а не через час.
    online.mockReturnValue(true);
    window.dispatchEvent(new Event('online'));
    await waitFor(() => expect(versionCalls(fetchMock)).toBe(1));
  });
});
