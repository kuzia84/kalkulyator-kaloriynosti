import { CloudError } from './types';

/**
 * Выполняет запрос к API облака. Сбой сети и ответ не 2xx становятся `CloudError`.
 * `allow` — коды, которые вызывающий код разбирает сам (например, 404 — «копии нет»).
 */
export async function cloudFetch(
  label: string,
  url: string,
  init: RequestInit = {},
  allow: number[] = [],
): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new CloudError(`Нет связи с сервисом «${label}». Проверьте интернет.`);
  }
  if (res.ok || allow.includes(res.status)) return res;
  if (res.status === 401) {
    throw new CloudError(`Вход в сервис «${label}» истёк. Войдите снова.`, true);
  }
  if (res.status === 507) throw new CloudError(`В сервисе «${label}» нет места для копии.`);
  throw new CloudError(`Сервис «${label}» ответил ошибкой ${res.status}. Повторите позже.`);
}
