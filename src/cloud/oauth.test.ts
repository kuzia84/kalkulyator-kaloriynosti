import { afterEach, describe, expect, it } from 'vitest';
import {
  buildAuthUrl,
  completeRedirect,
  expireSession,
  getSession,
  isExpired,
  saveSession,
  startLogin,
  takeRedirectOutcome,
} from './oauth';

const REDIRECT = 'https://example.github.io/app/';

/** Запускает вход и возвращает `state`, который сервис вернёт назад. */
function login(provider: 'google' | 'yandex'): string {
  let url = '';
  startLogin(provider, 'client-1', REDIRECT, (u) => (url = u));
  return new URL(url).searchParams.get('state')!;
}

afterEach(() => {
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('адрес входа', () => {
  it('Google: implicit flow, только файлы приложения и почта', () => {
    const url = new URL(buildAuthUrl('google', 'gid', REDIRECT, 's1', 'me@gmail.com'));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      response_type: 'token',
      client_id: 'gid',
      redirect_uri: REDIRECT,
      state: 's1',
      scope: 'https://www.googleapis.com/auth/drive.file email',
      login_hint: 'me@gmail.com',
    });
  });

  it('Яндекс: права берутся из настроек приложения на oauth.yandex.ru', () => {
    const url = new URL(buildAuthUrl('yandex', 'yid', REDIRECT, 's2'));
    expect(url.origin + url.pathname).toBe('https://oauth.yandex.ru/authorize');
    expect(url.searchParams.get('response_type')).toBe('token');
    expect(url.searchParams.has('scope')).toBe(false);
    expect(url.searchParams.has('login_hint')).toBe(false);
  });

  it('каждый вход получает новый state', () => {
    expect(login('google')).not.toBe(login('google'));
  });
});

describe('возврат со страницы входа', () => {
  it('обычный адрес приложения не трогается', () => {
    window.location.hash = '#/recipes';
    expect(completeRedirect()).toBeNull();
    expect(window.location.hash).toBe('#/recipes');
  });

  it('токен сохраняется со сроком, хеш меняется на настройки', () => {
    const state = login('google');
    window.location.hash = `#state=${state}&access_token=tok&token_type=Bearer&expires_in=3600`;
    expect(completeRedirect(1_000)).toEqual({ ok: true, provider: 'google' });
    expect(window.location.hash).toBe('#/settings');
    expect(getSession('google')).toEqual({ token: 'tok', expiresAt: 3_601_000, account: '' });
    expect(takeRedirectOutcome()).toEqual({ ok: true, provider: 'google' });
    expect(takeRedirectOutcome()).toBeNull();
  });

  it('чужой state не принимается', () => {
    login('yandex');
    window.location.hash = '#access_token=evil&state=other';
    const outcome = completeRedirect();
    expect(outcome).toMatchObject({ ok: false, provider: 'yandex' });
    expect(getSession('yandex')).toBeNull();
    expect(window.location.hash).toBe('#/settings');
  });

  it('токен без начатого входа не принимается', () => {
    window.location.hash = '#access_token=evil&state=x';
    expect(completeRedirect()).toMatchObject({ ok: false, provider: null });
    expect(getSession('google')).toBeNull();
  });

  it('отказ пользователя — понятное сообщение', () => {
    const state = login('yandex');
    window.location.hash = `#error=access_denied&state=${state}`;
    expect(completeRedirect()).toEqual({
      ok: false,
      provider: 'yandex',
      message: 'Вход отменён: доступ к облаку не выдан.',
    });
  });

  it('пустой токен — не вход', () => {
    const state = login('yandex');
    window.location.hash = `#access_token=&state=${state}`;
    expect(completeRedirect()).toMatchObject({ ok: false, provider: 'yandex' });
    expect(getSession('yandex')).toBeNull();
  });

  it('Google без доступа к Диску — не вход', () => {
    const state = login('google');
    window.location.hash = `#access_token=t&state=${state}&scope=email%20openid`;
    expect(completeRedirect()).toMatchObject({
      ok: false,
      message: expect.stringContaining('Доступ к Google Диску не выдан'),
    });
    expect(getSession('google')).toBeNull();
  });

  it('Google с доступом к Диску среди прочих прав — вход', () => {
    const state = login('google');
    const scope = encodeURIComponent('email https://www.googleapis.com/auth/drive.file openid');
    window.location.hash = `#access_token=t&state=${state}&scope=${scope}`;
    expect(completeRedirect()).toEqual({ ok: true, provider: 'google' });
  });

  it('повторный возврат с тем же state не проходит', () => {
    const state = login('google');
    window.location.hash = `#state=${state}&access_token=a`;
    completeRedirect();
    window.location.hash = `#state=${state}&access_token=b`;
    expect(completeRedirect()).toMatchObject({ ok: false });
    expect(getSession('google')?.token).toBe('a');
  });
});

describe('срок входа', () => {
  it('истекает за минуту до срока, без срока — не истекает', () => {
    expect(isExpired({ token: 't', expiresAt: 100_000, account: '' }, 39_999)).toBe(false);
    expect(isExpired({ token: 't', expiresAt: 100_000, account: '' }, 40_000)).toBe(true);
    expect(isExpired({ token: 't', expiresAt: null, account: '' }, Date.now())).toBe(false);
  });

  it('истёкший вход сохраняет почту для повторного входа', () => {
    saveSession('google', { token: 't', expiresAt: null, account: 'me@gmail.com' });
    expireSession('google');
    const s = getSession('google')!;
    expect(isExpired(s)).toBe(true);
    expect(s.account).toBe('me@gmail.com');
  });

  it('выход удаляет только свой сервис', () => {
    saveSession('google', { token: 'g', expiresAt: null, account: '' });
    saveSession('yandex', { token: 'y', expiresAt: null, account: '' });
    saveSession('google', null);
    expect(getSession('google')).toBeNull();
    expect(getSession('yandex')?.token).toBe('y');
  });
});
