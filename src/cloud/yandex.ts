import { cloudFetch } from './http';
import { CLOUD_FILE_NAME, CloudError, type CloudProvider } from './types';

const LABEL = 'Яндекс Диск';
const API = 'https://cloud-api.yandex.net/v1/disk/resources';
const INFO = 'https://login.yandex.ru/info?format=json';
/** Папка приложения: `Приложения/<имя приложения>` на Диске пользователя. */
const PATH = `app:/${CLOUD_FILE_NAME}`;

export const YANDEX_AUTH_URL = 'https://oauth.yandex.ru/authorize';

function auth(token: string): HeadersInit {
  return { Authorization: `OAuth ${token}` };
}

function query(extra: Record<string, string> = {}): string {
  return new URLSearchParams({ path: PATH, ...extra }).toString();
}

async function link(token: string, kind: 'upload' | 'download', extra = {}) {
  const res = await cloudFetch(
    LABEL,
    `${API}/${kind}?${query(extra)}`,
    {
      headers: auth(token),
    },
    [404],
  );
  if (res.status === 404) return null;
  return (await res.json()) as { href: string; method?: string };
}

export const yandex: CloudProvider = {
  id: 'yandex',
  label: LABEL,
  loginLabel: 'Войти через Яндекс',

  async whoami(token) {
    const res = await cloudFetch(LABEL, INFO, { headers: auth(token) });
    const data = (await res.json()) as { default_email?: string; login?: string };
    return data.default_email || data.login || '';
  },

  async stat(token) {
    const res = await cloudFetch(
      LABEL,
      `${API}?${query({ fields: 'modified' })}`,
      { headers: auth(token) },
      [404],
    );
    if (res.status === 404) return null;
    return ((await res.json()) as { modified: string }).modified;
  },

  async upload(token, json) {
    const target = await link(token, 'upload', { overwrite: 'true' });
    if (!target) throw new CloudError('Яндекс Диск не выдал ссылку для записи. Повторите позже.');
    // Ссылка уже содержит доступ: токен на чужой хост не уходит. PUT всё равно требует
    // предварительного запроса CORS (OPTIONS). Ответ на него проверяет ручная проверка из README.
    await cloudFetch(LABEL, target.href, { method: target.method ?? 'PUT', body: json });
    // Диск может обработать файл не сразу: тогда берётся время устройства.
    return (await yandex.stat(token)) ?? new Date().toISOString();
  },

  async download(token) {
    const modifiedAt = await yandex.stat(token);
    if (!modifiedAt) return null;
    const source = await link(token, 'download');
    if (!source) return null;
    const res = await cloudFetch(LABEL, source.href);
    return { json: await res.text(), modifiedAt };
  },
};
