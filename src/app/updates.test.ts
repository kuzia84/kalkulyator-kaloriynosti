import { describe, expect, it, vi } from 'vitest';
import {
  versionLabel,
  checkRemoteVersion,
  freshReloadUrl,
  CHECK_INTERVAL_MS,
  fetchRemoteVersion,
  isNewer,
  readStoredCheck,
  shouldCheck,
  writeStoredCheck,
} from './updates';

const HOUR = 60 * 60 * 1000;

describe('shouldCheck', () => {
  it('первая проверка — сразу', () => {
    expect(shouldCheck(null, 0)).toBe(true);
  });

  it('не чаще раза в сутки', () => {
    expect(shouldCheck(1000, 1000)).toBe(false);
    expect(shouldCheck(0, 23 * HOUR)).toBe(false);
    expect(shouldCheck(0, CHECK_INTERVAL_MS)).toBe(true);
    expect(shouldCheck(0, 25 * HOUR)).toBe(true);
  });
});

describe('isNewer', () => {
  const current = { build: 'aaa1111', builtAt: '2026-11-11T10:00:00.000Z' };

  it('та же сборка — обновления нет', () => {
    expect(isNewer({ version: '0.2.0', build: 'aaa1111' }, current)).toBe(false);
  });

  it('более поздняя сборка — обновление есть', () => {
    expect(
      isNewer({ version: '0.2.1', build: 'bbb2222', builtAt: '2026-11-12T10:00:00.000Z' }, current),
    ).toBe(true);
  });

  it('запомненная сборка старше текущей — обновления нет', () => {
    expect(
      isNewer({ version: '0.1.0', build: 'zzz0000', builtAt: '2026-11-01T10:00:00.000Z' }, current),
    ).toBe(false);
  });

  it('без даты сборки решает номер сборки', () => {
    expect(isNewer({ version: '0.2.1', build: 'bbb2222' }, current)).toBe(true);
    expect(isNewer(null, current)).toBe(false);
  });
});

describe('fetchRemoteVersion', () => {
  it('читает version.json в обход кэша', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ version: '0.2.0', build: 'abc1234' })));
    expect(await fetchRemoteVersion('/app/', fetchImpl, 42)).toEqual({
      version: '0.2.0',
      build: 'abc1234',
    });
    expect(fetchImpl).toHaveBeenCalledWith('/app/version.json?t=42', { cache: 'no-store' });
  });

  it('404, нет сети, битый файл — null', async () => {
    expect(
      await fetchRemoteVersion(
        '/',
        vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 404 })),
      ),
    ).toBeNull();
    expect(
      await fetchRemoteVersion(
        '/',
        vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline')),
      ),
    ).toBeNull();
    expect(
      await fetchRemoteVersion(
        '/',
        vi.fn<typeof fetch>().mockResolvedValue(new Response('<html>')),
      ),
    ).toBeNull();
    expect(
      await fetchRemoteVersion(
        '/',
        vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ version: 1 }))),
      ),
    ).toBeNull();
  });
});

describe('запомненная проверка', () => {
  it('пишется и читается из localStorage', () => {
    writeStoredCheck({ lastCheckAt: 5, remote: { version: '0.2.0', build: 'x' } });
    expect(readStoredCheck()).toEqual({ lastCheckAt: 5, remote: { version: '0.2.0', build: 'x' } });
  });

  it('битая запись — как будто проверки не было', () => {
    localStorage.setItem('kk-update-check', '{oops');
    expect(readStoredCheck()).toBeNull();
  });
});

describe('checkRemoteVersion', () => {
  it('различает «нет связи» и «плохой ответ»', async () => {
    expect(
      await checkRemoteVersion('/', vi.fn<typeof fetch>().mockRejectedValue(new TypeError('x'))),
    ).toEqual({ ok: false, reason: 'network' });
    expect(
      await checkRemoteVersion(
        '/',
        vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 404 })),
      ),
    ).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('freshReloadUrl', () => {
  it('новый параметр запроса, раздел сохраняется', () => {
    expect(freshReloadUrl({ pathname: '/app/', hash: '#/settings' }, 7)).toBe(
      '/app/?r=7#/settings',
    );
  });
});

describe('versionLabel', () => {
  it('дата сборки в формате дд.мм.гг', () => {
    expect(versionLabel({ version: '0.2.0', builtAt: '2026-11-05T12:00:00.000Z' })).toBe(
      '05.11.26',
    );
  });

  it('без даты — номер версии', () => {
    expect(versionLabel({ version: '0.2.0' })).toBe('0.2.0');
    expect(versionLabel({ version: '0.2.0', builtAt: 'не дата' })).toBe('0.2.0');
  });
});
