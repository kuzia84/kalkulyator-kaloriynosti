import { google } from './google';
import type { CloudProvider, CloudProviderId } from './types';
import { yandex } from './yandex';

export const PROVIDERS: Record<CloudProviderId, CloudProvider> = { google, yandex };

/** Client ID приложения OAuth. Пустая строка — сервис не настроен в этой сборке. */
export function clientId(id: CloudProviderId): string {
  const env = import.meta.env;
  const value = id === 'google' ? env.VITE_GOOGLE_CLIENT_ID : env.VITE_YANDEX_CLIENT_ID;
  return typeof value === 'string' ? value.trim() : '';
}

/** Сервисы, для которых в сборке задан client ID. Порядок — порядок кнопок в настройках. */
export function configuredProviders(): CloudProvider[] {
  return (['google', 'yandex'] as const)
    .filter((id) => clientId(id) !== '')
    .map((id) => PROVIDERS[id]);
}

/** Адрес возврата после входа — корень приложения. Его же надо указать в кабинете сервиса. */
export function redirectUri(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString();
}
