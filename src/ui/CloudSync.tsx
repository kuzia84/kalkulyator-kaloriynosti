import { useEffect, useState } from 'react';
import { useOnline } from '../app/useOnline';
import { clientId, configuredProviders, redirectUri } from '../cloud/config';
import {
  expireSession,
  getSession,
  isExpired,
  saveSession,
  startLogin,
  takeRedirectOutcome,
  type CloudSession,
} from '../cloud/oauth';
import {
  CloudError,
  type CloudFile,
  type CloudProvider,
  type CloudProviderId,
} from '../cloud/types';
import { BackupError, exportBackup, importBackup, type ImportMode } from '../storage/backup';
import { db } from '../storage/db';
import { Modal } from './Modal';
import { ChevronIcon } from './icons';
import { recipesCount } from './plural';

const dateFormatter = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' });

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dateFormatter.format(d);
}

/** Что известно о копии в облаке: `undefined` — ещё не спрашивали, `null` — копии нет. */
type CopyDates = Partial<Record<CloudProviderId, string | null>>;

interface Confirm {
  provider: CloudProvider;
  file: CloudFile;
  cloudRecipes: number;
  localRecipes: number;
}

function countRecipes(json: string): number {
  try {
    const data = JSON.parse(json) as { recipes?: unknown };
    return Array.isArray(data.recipes) ? data.recipes.length : 0;
  } catch {
    return 0;
  }
}

function activeSession(id: CloudProviderId): CloudSession | null {
  const s = getSession(id);
  return s && !isExpired(s) ? s : null;
}

export interface CloudSyncProps {
  /** Итог действия для строки состояния под блоком «Перенос данных». */
  onMessage: (text: string) => void;
}

/** Копия справочника и рецептов в Google Диске или Яндекс Диске. Кнопки — вручную. */
export function CloudSync({ onMessage }: CloudSyncProps) {
  const providers = configuredProviders();
  const online = useOnline();
  // Счётчик перечитывает вход из localStorage после входа, выхода и истечения токена.
  const [version, setVersion] = useState(0);
  const [dates, setDates] = useState<CopyDates>({});
  const [busy, setBusy] = useState<CloudProviderId | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const refresh = () => setVersion((v) => v + 1);

  useEffect(() => {
    const outcome = takeRedirectOutcome();
    if (!outcome) return;
    if (outcome.ok) {
      const label = providers.find((p) => p.id === outcome.provider)?.label ?? 'облако';
      onMessage(`Вход выполнен. Копия будет храниться в сервисе «${label}».`);
    } else {
      onMessage(outcome.message);
    }
    // Итог входа показывается один раз, при первом открытии настроек.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Ошибка облака → сообщение. Истёкший токен → кнопка повторного входа. */
  function fail(provider: CloudProvider, e: unknown) {
    if (e instanceof CloudError && e.unauthorized) {
      expireSession(provider.id);
      refresh();
    }
    onMessage(
      e instanceof CloudError || e instanceof BackupError
        ? e.message
        : `Не удалось связаться с сервисом «${provider.label}».`,
    );
  }

  // Для каждого входа без почты — спросить почту. Для каждого входа — дату копии.
  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    for (const provider of providers) {
      const s = activeSession(provider.id);
      if (!s) continue;
      void (async () => {
        try {
          if (!s.account) {
            const account = await provider.whoami(s.token);
            if (cancelled) return;
            // Пустой ответ не сохраняется: иначе запрос почты повторялся бы без конца.
            if (account) {
              saveSession(provider.id, { ...s, account });
              refresh();
            }
          }
          const date = await provider.stat(s.token);
          if (!cancelled) setDates((d) => ({ ...d, [provider.id]: date }));
        } catch (e) {
          if (!cancelled) fail(provider, e);
        }
      })();
    }
    return () => {
      cancelled = true;
    };
    // Перезапуск — при смене сети и после входа или выхода.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, version]);

  if (providers.length === 0) return null;

  async function upload(provider: CloudProvider, s: CloudSession) {
    setBusy(provider.id);
    try {
      const backup = await exportBackup();
      const modifiedAt = await provider.upload(s.token, JSON.stringify(backup));
      setDates((d) => ({ ...d, [provider.id]: modifiedAt }));
      onMessage(
        `Выгружено в сервис «${provider.label}»: продуктов — ${backup.products.length}, рецептов — ${backup.recipes.length}.`,
      );
    } catch (e) {
      fail(provider, e);
    } finally {
      setBusy(null);
    }
  }

  async function apply(provider: CloudProvider, file: CloudFile, mode: ImportMode) {
    setConfirm(null);
    try {
      const result = await importBackup(file.json, db, { mode });
      const action = mode === 'replace' ? 'Рецепты заменены' : 'Загружено';
      onMessage(
        `${action} из сервиса «${provider.label}»: продуктов — ${result.products}, рецептов — ${result.recipes}. Пропущено: ${result.skipped}.`,
      );
    } catch (e) {
      fail(provider, e);
    }
  }

  async function download(provider: CloudProvider, s: CloudSession) {
    setBusy(provider.id);
    try {
      const file = await provider.download(s.token);
      setDates((d) => ({ ...d, [provider.id]: file?.modifiedAt ?? null }));
      if (!file) {
        onMessage(
          `В сервисе «${provider.label}» пока нет копии. Сначала выгрузите её на основном устройстве.`,
        );
        return;
      }
      const localRecipes = await db.recipes.count();
      if (localRecipes === 0) {
        await apply(provider, file, 'merge');
        return;
      }
      setConfirm({ provider, file, cloudRecipes: countRecipes(file.json), localRecipes });
    } catch (e) {
      fail(provider, e);
    } finally {
      setBusy(null);
    }
  }

  function logout(provider: CloudProvider) {
    saveSession(provider.id, null);
    setDates((d) => ({ ...d, [provider.id]: undefined }));
    refresh();
    onMessage(
      `Вы вышли из сервиса «${provider.label}». Копия в облаке осталась. Доступ приложения можно отозвать в настройках аккаунта.`,
    );
  }

  return (
    <>
      <p className="group-hint">
        Копия в облаке — тот же файл, только в вашем Google Диске или Яндекс Диске. Выгрузите её на
        основном устройстве и загрузите на другом.
        {online ? null : ' Сейчас нет сети: облако недоступно.'}
      </p>
      <div className="group-list">
        {providers.map((provider) => {
          const stored = getSession(provider.id);
          const s = activeSession(provider.id);
          if (!s) {
            return (
              <button
                key={provider.id}
                type="button"
                className="group-row group-row-action"
                disabled={!online}
                onClick={() => startLogin(provider.id, clientId(provider.id), redirectUri())}
              >
                <span className="group-row-text">
                  <span className="group-row-title">{provider.loginLabel}</span>
                  <span className="group-row-hint">
                    {stored
                      ? `${stored.account || provider.label}: вход истёк, войдите снова.`
                      : `Копия будет храниться в сервисе «${provider.label}».`}
                  </span>
                </span>
                <ChevronIcon />
              </button>
            );
          }
          const date = dates[provider.id];
          const disabled = !online || busy !== null;
          return (
            <div key={provider.id} className="group-row group-row-stack">
              <span className="group-row-text">
                <span className="group-row-title">
                  {provider.label}
                  {s.account ? `: ${s.account}` : ''}
                </span>
                <span className="group-row-hint">
                  {busy === provider.id
                    ? 'Связь с облаком…'
                    : date === undefined
                      ? 'Вход выполнен.'
                      : date === null
                        ? 'Копии в облаке пока нет.'
                        : `В облаке: копия от ${formatDate(date)}.`}
                </span>
              </span>
              <div className="cloud-actions">
                <button
                  type="button"
                  className="button button-small"
                  disabled={disabled}
                  onClick={() => void upload(provider, s)}
                >
                  Выгрузить в облако
                </button>
                <button
                  type="button"
                  className="button button-small"
                  disabled={disabled}
                  onClick={() => void download(provider, s)}
                >
                  Загрузить из облака
                </button>
                <button
                  type="button"
                  className="button button-small button-link"
                  disabled={busy !== null}
                  aria-label={`Выйти из сервиса «${provider.label}»`}
                  onClick={() => logout(provider)}
                >
                  Выйти
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {confirm ? (
        <Modal title="Загрузить рецепты из облака?" onClose={() => setConfirm(null)}>
          <p>
            В облаке — {recipesCount(confirm.cloudRecipes)}, копия от{' '}
            {formatDate(confirm.file.modifiedAt)}. На этом устройстве —{' '}
            {recipesCount(confirm.localRecipes)}.
          </p>
          <p>
            «Объединить» добавит рецепты из облака к рецептам устройства. «Заменить» удалит рецепты
            устройства и оставит только рецепты из облака. Справочник продуктов объединяется в обоих
            случаях.
          </p>
          <div className="form-actions">
            <button type="button" className="button" onClick={() => setConfirm(null)}>
              Отмена
            </button>
            <button
              type="button"
              className="button button-danger"
              onClick={() => void apply(confirm.provider, confirm.file, 'replace')}
            >
              Заменить
            </button>
            <button
              type="button"
              className="button button-primary"
              onClick={() => void apply(confirm.provider, confirm.file, 'merge')}
            >
              Объединить
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
