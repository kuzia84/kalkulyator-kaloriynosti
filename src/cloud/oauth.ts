import { GOOGLE_AUTH_URL, GOOGLE_SCOPE } from './google';
import type { CloudProviderId } from './types';
import { YANDEX_AUTH_URL } from './yandex';

/**
 * Вход без сервера: implicit flow OAuth 2.0 с полным переходом страницы.
 * Всплывающее окно не подходит: в установленной PWA на iPhone оно теряет связь с приложением.
 *
 * 1. `startLogin` запоминает `state` в sessionStorage и открывает страницу входа сервиса.
 * 2. Сервис возвращает на корень приложения с токеном в хеше адреса.
 * 3. `completeRedirect` (в main.tsx до роутера) проверяет `state`, сохраняет токен
 *    и меняет хеш на `#/settings`.
 */

const SESSIONS_KEY = 'cloud-auth';
const PENDING_KEY = 'cloud-auth-pending';

export interface CloudSession {
  token: string;
  /** Срок токена, мс с 1970 года. `null` — сервис не сообщил срок. */
  expiresAt: number | null;
  /** Почта или логин. Пусто, пока приложение не спросило у сервиса. */
  account: string;
}

type Sessions = Partial<Record<CloudProviderId, CloudSession>>;

export type RedirectOutcome =
  | { ok: true; provider: CloudProviderId }
  | { ok: false; provider: CloudProviderId | null; message: string };

interface Pending {
  provider: CloudProviderId;
  state: string;
}

function readJson<T>(storage: Storage | undefined, key: string): T | null {
  try {
    const raw = storage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(storage: Storage | undefined, key: string, value: unknown): void {
  try {
    if (value == null) storage?.removeItem(key);
    else storage?.setItem(key, JSON.stringify(value));
  } catch {
    // Хранилище закрыто (приватный режим): вход проживёт до перезагрузки страницы не дольше.
  }
}

function local(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function session(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

function readSessions(): Sessions {
  return readJson<Sessions>(local(), SESSIONS_KEY) ?? {};
}

export function getSession(provider: CloudProviderId): CloudSession | null {
  const s = readSessions()[provider];
  return s && typeof s.token === 'string' && s.token !== '' ? s : null;
}

export function isExpired(s: CloudSession, now = Date.now()): boolean {
  // Минута запаса: токен не должен истечь посреди выгрузки.
  return s.expiresAt != null && s.expiresAt - 60_000 <= now;
}

export function saveSession(provider: CloudProviderId, value: CloudSession | null): void {
  const all = readSessions();
  if (value) all[provider] = value;
  else delete all[provider];
  writeJson(local(), SESSIONS_KEY, all);
}

/** Токен больше не действует. Почта остаётся: её видно на кнопке повторного входа. */
export function expireSession(provider: CloudProviderId): void {
  const s = getSession(provider);
  if (s) saveSession(provider, { ...s, expiresAt: 0 });
}

export function buildAuthUrl(
  provider: CloudProviderId,
  clientId: string,
  redirectUri: string,
  state: string,
  loginHint = '',
): string {
  const params = new URLSearchParams({
    response_type: 'token',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
  });
  if (provider === 'google') {
    params.set('scope', GOOGLE_SCOPE);
    params.set('include_granted_scopes', 'true');
    if (loginHint) params.set('login_hint', loginHint);
    return `${GOOGLE_AUTH_URL}?${params}`;
  }
  if (loginHint) params.set('login_hint', loginHint);
  return `${YANDEX_AUTH_URL}?${params}`;
}

function randomState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function startLogin(
  provider: CloudProviderId,
  clientId: string,
  redirectUri: string,
  go: (url: string) => void = (url) => window.location.assign(url),
): void {
  const state = randomState();
  writeJson(session(), PENDING_KEY, { provider, state } satisfies Pending);
  const hint = getSession(provider)?.account ?? '';
  go(buildAuthUrl(provider, clientId, redirectUri, state, hint));
}

const ERROR_TEXT: Record<string, string> = {
  access_denied: 'Вход отменён: доступ к облаку не выдан.',
};

let lastOutcome: RedirectOutcome | null = null;

/**
 * Разбирает возврат со страницы входа. Возвращает `null`, если адрес — обычный адрес приложения.
 * Хеш с токеном всегда стирается из адреса и истории.
 */
export function completeRedirect(now = Date.now()): RedirectOutcome | null {
  const hash = window.location.hash.replace(/^#/, '');
  if (hash.startsWith('/') || !/(^|&)(access_token|error)=/.test(hash)) return null;
  const params = new URLSearchParams(hash);
  const pending = readJson<Pending>(session(), PENDING_KEY);
  writeJson(session(), PENDING_KEY, null);
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${window.location.search}#/settings`,
  );

  let outcome: RedirectOutcome;
  if (!pending || params.get('state') !== pending.state) {
    outcome = {
      ok: false,
      provider: pending?.provider ?? null,
      message: 'Вход не подтверждён: ответ сервиса не совпал с запросом. Войдите ещё раз.',
    };
  } else if (params.get('error')) {
    const code = params.get('error') ?? '';
    outcome = {
      ok: false,
      provider: pending.provider,
      message: ERROR_TEXT[code] ?? `Сервис отказал во входе (${code}).`,
    };
  } else {
    const token = params.get('access_token') ?? '';
    const seconds = Number(params.get('expires_in'));
    // Почту настройки спросят у сервиса заново: вход мог быть в другой аккаунт.
    saveSession(pending.provider, {
      token,
      expiresAt: Number.isFinite(seconds) && seconds > 0 ? now + seconds * 1000 : null,
      account: '',
    });
    outcome = { ok: true, provider: pending.provider };
  }
  lastOutcome = outcome;
  return outcome;
}

/** Итог последнего входа для настроек. Отдаётся один раз. */
export function takeRedirectOutcome(): RedirectOutcome | null {
  const outcome = lastOutcome;
  lastOutcome = null;
  return outcome;
}
