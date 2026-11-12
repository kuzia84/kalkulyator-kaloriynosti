import { afterEach, describe, expect, it, vi } from 'vitest';
import { google } from './google';
import { CloudError } from './types';
import { yandex } from './yandex';

interface Call {
  url: string;
  init: RequestInit;
}

/** Подменяет fetch: ответы выдаются по очереди, запросы записываются. */
function mockFetch(...responses: (Response | Error)[]): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      const next = responses.shift();
      if (!next) throw new Error(`Лишний запрос: ${url}`);
      if (next instanceof Error) throw next;
      return next;
    }),
  );
  return calls;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Google Диск', () => {
  it('первая выгрузка создаёт файл', async () => {
    const calls = mockFetch(
      json({ files: [] }),
      json({ id: 'f1', modifiedTime: '2026-11-12T10:00:00.000Z' }),
    );
    expect(await google.upload('tok', '{"a":1}')).toBe('2026-11-12T10:00:00.000Z');
    const find = new URL(calls[0]!.url);
    expect(find.searchParams.get('q')).toBe(
      "name = 'kalkulyator-kaloriynosti.json' and trashed = false",
    );
    expect(calls[1]!.url).toContain('/upload/drive/v3/files?uploadType=multipart');
    expect(calls[1]!.init.method).toBe('POST');
    expect(String(calls[1]!.init.body)).toContain('{"a":1}');
    expect(new Headers(calls[1]!.init.headers).get('Authorization')).toBe('Bearer tok');
  });

  it('повторная выгрузка пишет поверх того же файла', async () => {
    const calls = mockFetch(
      json({ files: [{ id: 'f1', modifiedTime: 'old' }] }),
      json({ id: 'f1', modifiedTime: 'new' }),
    );
    expect(await google.upload('tok', '{}')).toBe('new');
    expect(calls[1]!.url).toContain('/upload/drive/v3/files/f1?uploadType=media');
    expect(calls[1]!.init.method).toBe('PATCH');
  });

  it('скачивание: копии нет — null, есть — текст и время', async () => {
    mockFetch(json({ files: [] }));
    expect(await google.download('tok')).toBeNull();

    const calls = mockFetch(
      json({ files: [{ id: 'f1', modifiedTime: 't1' }] }),
      new Response('{"x":2}'),
    );
    expect(await google.download('tok')).toEqual({ json: '{"x":2}', modifiedAt: 't1' });
    expect(calls[1]!.url).toBe('https://www.googleapis.com/drive/v3/files/f1?alt=media');
  });

  it('почта владельца', async () => {
    mockFetch(json({ email: 'me@gmail.com' }));
    expect(await google.whoami('tok')).toBe('me@gmail.com');
  });

  it('401 — нужен новый вход', async () => {
    mockFetch(json({}, 401));
    const error = await google.stat('tok').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CloudError);
    expect((error as CloudError).unauthorized).toBe(true);
  });

  it('нет сети — понятная ошибка', async () => {
    mockFetch(new TypeError('Failed to fetch'));
    await expect(google.stat('tok')).rejects.toThrow('Нет связи с сервисом «Google Диск»');
  });
});

describe('Яндекс Диск', () => {
  it('выгрузка: ссылка для записи, PUT без токена, время записи', async () => {
    const calls = mockFetch(
      json({ href: 'https://uploader.example/put', method: 'PUT' }),
      new Response(null, { status: 201 }),
      json({ modified: '2026-11-12T10:00:00+00:00' }),
    );
    expect(await yandex.upload('tok', '{"a":1}')).toBe('2026-11-12T10:00:00+00:00');
    const link = new URL(calls[0]!.url);
    expect(link.pathname).toBe('/v1/disk/resources/upload');
    expect(link.searchParams.get('path')).toBe('app:/kalkulyator-kaloriynosti.json');
    expect(link.searchParams.get('overwrite')).toBe('true');
    expect(new Headers(calls[0]!.init.headers).get('Authorization')).toBe('OAuth tok');
    expect(calls[1]).toEqual({
      url: 'https://uploader.example/put',
      init: { method: 'PUT', body: '{"a":1}' },
    });
  });

  it('скачивание: копии нет — null', async () => {
    mockFetch(json({ error: 'DiskNotFoundError' }, 404));
    expect(await yandex.download('tok')).toBeNull();
  });

  it('скачивание: время, ссылка, текст', async () => {
    const calls = mockFetch(
      json({ modified: 't1' }),
      json({ href: 'https://downloader.example/get' }),
      new Response('{"x":2}'),
    );
    expect(await yandex.download('tok')).toEqual({ json: '{"x":2}', modifiedAt: 't1' });
    expect(calls[2]!.url).toBe('https://downloader.example/get');
  });

  it('логин, если почты нет', async () => {
    mockFetch(json({ login: 'chef' }));
    expect(await yandex.whoami('tok')).toBe('chef');
  });

  it('нет места на Диске', async () => {
    mockFetch(json({ href: 'https://uploader.example/put' }), new Response(null, { status: 507 }));
    await expect(yandex.upload('tok', '{}')).rejects.toThrow('нет места');
  });
});
