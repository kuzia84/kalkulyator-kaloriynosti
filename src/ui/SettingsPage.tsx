import { useRef, useState } from 'react';
import { downloadText } from '../lib/download';
import { BackupError, exportBackup, importBackup } from '../storage/backup';
import { useSettings } from '../app/settingsContext';
import { useAppUpdate } from '../app/updateContext';
import { isNewer, versionLabel } from '../app/updates';
import { useOnline } from '../app/useOnline';
import type { ExternalSource, Skin, Theme } from '../storage/schema';
import { SUGGESTIONS_MAX, SUGGESTIONS_MIN } from '../storage/settings';
import { CloudSync } from './CloudSync';
import { DevTools } from './DevTools';
import { ChevronIcon } from './icons';

const SOURCE_INFO: Record<ExternalSource, { title: string; text: string }> = {
  off: {
    title: 'Open Food Facts',
    text: 'Продукты в упаковке, есть русские названия и поиск по штрихкоду. Ключ не нужен.',
  },
  usda: {
    title: 'USDA FoodData Central',
    text: 'База Министерства сельского хозяйства США. Названия на английском. Нужен ключ API.',
  },
};

const SKIN_INFO: Record<Skin, { title: string; text: string }> = {
  glass: { title: 'Стекло', text: 'Полупрозрачные панели на мягком цветном фоне.' },
  label: { title: 'Этикетка', text: 'Чёрно-белое оформление, как этикетка с пищевой ценностью.' },
};

const THEME_LABELS: Record<Theme, string> = {
  system: 'Системная',
  light: 'Светлая',
  dark: 'Тёмная',
};

/** Шаг счётчика подсказок: от 5 до 50 — это 9 нажатий. */
const LIMIT_STEP = 5;

export function SettingsPage() {
  const { settings, update } = useSettings();
  const [showKey, setShowKey] = useState(false);
  const [keyDraft, setKeyDraft] = useState(settings.usdaApiKey);
  const [dataMessage, setDataMessage] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  async function exportFile() {
    try {
      const backup = await exportBackup();
      // Дата в имени файла — по часам устройства, а не по UTC.
      const d = new Date(backup.exportedAt);
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      downloadText(`калькулятор-${date}.json`, JSON.stringify(backup, null, 2), 'application/json');
      setDataMessage(
        `Сохранено: продуктов — ${backup.products.length}, рецептов — ${backup.recipes.length}.`,
      );
    } catch {
      setDataMessage('Не удалось собрать файл.');
    }
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    try {
      const result = await importBackup(await file.text());
      setDataMessage(
        `Загружено: продуктов — ${result.products}, рецептов — ${result.recipes}. Пропущено: ${result.skipped}.`,
      );
    } catch (e) {
      setDataMessage(e instanceof BackupError ? e.message : 'Не удалось прочитать файл.');
    }
  }

  /** Шаг ведёт к ближайшему кратному 5: старое значение 12 становится 15 или 10. */
  function stepLimit(direction: 1 | -1) {
    const v = settings.suggestionsLimit;
    const snapped =
      direction > 0
        ? Math.floor(v / LIMIT_STEP) * LIMIT_STEP + LIMIT_STEP
        : Math.ceil(v / LIMIT_STEP) * LIMIT_STEP - LIMIT_STEP;
    const next = Math.min(SUGGESTIONS_MAX, Math.max(SUGGESTIONS_MIN, snapped));
    if (next !== settings.suggestionsLimit) update({ suggestionsLimit: next });
  }

  function move(index: number, delta: -1 | 1) {
    const order = [...settings.sourcesOrder];
    const target = index + delta;
    const a = order[index];
    const b = order[target];
    if (a == null || b == null) return;
    order[index] = b;
    order[target] = a;
    update({ sourcesOrder: order });
  }

  function toggle(source: ExternalSource, on: boolean) {
    const enabled = on
      ? [...settings.enabledSources, source]
      : settings.enabledSources.filter((s) => s !== source);
    update({ enabledSources: enabled });
  }

  return (
    <section aria-labelledby="settings-title" className="settings">
      <div className="page-header">
        <div className="page-heading">
          <h1 className="page-title" tabIndex={-1} id="settings-title">
            Настройки
          </h1>
          <p className="page-subtitle">Настройки хранятся только на этом устройстве.</p>
        </div>
      </div>

      <UpdateSection />

      <fieldset className="group">
        <legend className="group-label">Оформление</legend>
        <div className="group-list">
          <div className="group-row group-row-stack">
            <span className="group-row-title" id="skin-label">
              Стиль
            </span>
            <div className="segmented" role="radiogroup" aria-labelledby="skin-label">
              {(Object.keys(SKIN_INFO) as Skin[]).map((skin) => (
                <label key={skin} className="segmented-option">
                  <input
                    type="radio"
                    name="skin"
                    value={skin}
                    checked={settings.skin === skin}
                    onChange={() => update({ skin })}
                  />
                  <span>{SKIN_INFO[skin].title}</span>
                </label>
              ))}
            </div>
            <span className="group-row-hint">{SKIN_INFO[settings.skin].text}</span>
          </div>
          <div className="group-row group-row-stack">
            <span className="group-row-title" id="theme-label">
              Цветовая схема
            </span>
            <div className="segmented" role="radiogroup" aria-labelledby="theme-label">
              {(Object.keys(THEME_LABELS) as Theme[]).map((theme) => (
                <label key={theme} className="segmented-option">
                  <input
                    type="radio"
                    name="theme"
                    value={theme}
                    checked={settings.theme === theme}
                    onChange={() => update({ theme })}
                  />
                  <span>{THEME_LABELS[theme]}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </fieldset>

      <fieldset className="group">
        <legend className="group-label">Подсказки</legend>
        <div className="group-list">
          <div className="group-row">
            <span className="group-row-text">
              <span className="group-row-title" id="limit-label">
                Подсказок в списке
              </span>
              <span className="group-row-hint">
                Видно 5 пунктов, остальные — прокруткой. От {SUGGESTIONS_MIN} до {SUGGESTIONS_MAX}.
              </span>
            </span>
            <span className="stepper" role="group" aria-labelledby="limit-label">
              <button
                type="button"
                className="stepper-button"
                aria-label="Меньше подсказок"
                disabled={settings.suggestionsLimit <= SUGGESTIONS_MIN}
                onClick={() => stepLimit(-1)}
              >
                −
              </button>
              <output className="stepper-value" aria-live="polite">
                {settings.suggestionsLimit}
              </output>
              <button
                type="button"
                className="stepper-button"
                aria-label="Больше подсказок"
                disabled={settings.suggestionsLimit >= SUGGESTIONS_MAX}
                onClick={() => stepLimit(1)}
              >
                +
              </button>
            </span>
          </div>
        </div>
      </fieldset>

      <fieldset className="group">
        <legend className="group-label">Внешние источники</legend>
        <p className="group-hint">
          Поиск идёт сначала по справочнику на устройстве, потом в источниках в этом порядке.
          Внешний поиск начинается с трёх букв и работает только при подключении к интернету.
        </p>
        <div className="group-list">
          <ol className="source-list">
            {settings.sourcesOrder.map((source, i) => (
              <li key={source} className="group-row source-item">
                <span className="source-move">
                  <button
                    type="button"
                    className="button-icon button-quiet"
                    aria-label={`Поднять ${SOURCE_INFO[source].title}`}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="button-icon button-quiet"
                    aria-label={`Опустить ${SOURCE_INFO[source].title}`}
                    disabled={i === settings.sourcesOrder.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    ↓
                  </button>
                </span>
                <label className="group-row-text switch-label">
                  <span className="group-row-title">{SOURCE_INFO[source].title}</span>
                  <span className="group-row-hint">{SOURCE_INFO[source].text}</span>
                  <input
                    type="checkbox"
                    className="switch"
                    checked={settings.enabledSources.includes(source)}
                    onChange={(e) => toggle(source, e.target.checked)}
                  />
                </label>
              </li>
            ))}
          </ol>
          <form
            className="group-row group-row-stack"
            onSubmit={(e) => {
              e.preventDefault();
              update({ usdaApiKey: keyDraft.trim() });
            }}
          >
            <label htmlFor="usda-key" className="group-row-title">
              Ключ USDA API
            </label>
            <div className="inline-fields">
              <input
                id="usda-key"
                className="input"
                type={showKey ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                aria-describedby="usda-key-hint"
              />
              <button type="button" className="button" onClick={() => setShowKey((v) => !v)}>
                {showKey ? 'Скрыть' : 'Показать'}
              </button>
              <button type="submit" className="button button-primary">
                Сохранить
              </button>
            </div>
            <span id="usda-key-hint" className="group-row-hint">
              {settings.usdaApiKey
                ? 'Ключ сохранён на этом устройстве.'
                : 'Ключ не задан: USDA не участвует в поиске.'}{' '}
              Бесплатный ключ выдаёт{' '}
              <a href="https://fdc.nal.usda.gov/api-key-signup" target="_blank" rel="noreferrer">
                api.data.gov
              </a>
              . Ключ не уходит никуда, кроме запросов к USDA.
            </span>
          </form>
        </div>
      </fieldset>

      <fieldset className="group">
        <legend className="group-label">Перенос данных</legend>
        <p className="group-hint">
          Данные хранятся только в этом браузере. Чтобы перенести справочник и рецепты на другое
          устройство, сохраните файл и загрузите его там. Настройки и ключ USDA в файл не входят.
          При загрузке из файла ничего не удаляется: более новые рецепты и проверенные продукты на
          устройстве остаются.
        </p>
        <div className="group-list">
          <button
            type="button"
            className="group-row group-row-action"
            onClick={() => void exportFile()}
          >
            <span className="group-row-title">Сохранить в файл</span>
            <ChevronIcon />
          </button>
          <button
            type="button"
            className="group-row group-row-action"
            onClick={() => fileInput.current?.click()}
          >
            <span className="group-row-title">Загрузить из файла</span>
            <ChevronIcon />
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              void importFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
        <CloudSync onMessage={setDataMessage} />
        {dataMessage ? (
          <p className="group-hint" role="status">
            {dataMessage}
          </p>
        ) : null}
      </fieldset>

      {import.meta.env.DEV ? <DevTools /> : null}
    </section>
  );
}

const checkTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'short',
  timeStyle: 'short',
});

/** Блок «Версия приложения»: проверка и установка новой версии, сброс кэша. */
function UpdateSection() {
  const {
    status,
    current,
    remote,
    lastCheckAt,
    updateAvailable,
    checkNow,
    applyUpdate,
    resetCache,
  } = useAppUpdate();
  const online = useOnline();
  const busy = status === 'checking' || status === 'updating';
  // Обновление может прийти только от service worker: тогда запомненная версия сервера
  // не новее установленной, и её дату не показываем как новую.
  const remoteIsNewer = isNewer(remote, current);

  const message =
    status === 'checking'
      ? 'Проверяем…'
      : status === 'updating'
        ? 'Обновляем приложение…'
        : !online || status === 'offline'
          ? updateAvailable
            ? 'Вышла новая версия, но сейчас нет связи. Обновите приложение, когда появится интернет.'
            : 'Не удалось узнать версию на сервере: нет связи. Проверьте позже.'
          : updateAvailable
            ? `Вышла новая версия${remoteIsNewer && remote ? ` ${versionLabel(remote)} (сборка ${remote.build})` : ''}. Нажмите «Обновить»: страница перезагрузится.`
            : status === 'invalid'
              ? 'Сервер не отдал данные о версии. Попробуйте позже.'
              : status === 'checked'
                ? 'Установлена последняя версия.'
                : '';

  return (
    <fieldset className={`group update-card${updateAvailable ? ' is-available' : ''}`}>
      <legend className="group-label">Версия приложения</legend>
      <div className="group-list">
        <div className="group-row">
          <span className="group-row-text">
            <span className="group-row-title">
              Установлена версия {versionLabel(current)} (сборка {current.build}).
            </span>
            {lastCheckAt ? (
              <span className="group-row-hint">
                Проверено: {checkTimeFormatter.format(lastCheckAt)}.
              </span>
            ) : null}
          </span>
        </div>
        {updateAvailable ? (
          <button
            type="button"
            className="group-row group-row-action button-update"
            disabled={busy || !online}
            onClick={() => void applyUpdate()}
          >
            <span className="update-dot" aria-hidden="true">
              !
            </span>
            <span className="group-row-title">Обновить приложение</span>
            <ChevronIcon />
          </button>
        ) : (
          <button
            type="button"
            className="group-row group-row-action is-accent"
            disabled={busy || !online}
            onClick={() => void checkNow()}
          >
            <span className="group-row-title">Проверить обновления</span>
            <ChevronIcon />
          </button>
        )}
        {/* Без сети сброс оставил бы приложение без файлов: оно бы не открылось. */}
        <button
          type="button"
          className="group-row group-row-action"
          disabled={busy || !online}
          onClick={() => void resetCache()}
          aria-label="Сбросить кэш и перезагрузить"
          aria-describedby="reset-cache-hint"
        >
          <span className="group-row-text">
            <span className="group-row-title">Сбросить кэш и перезагрузить</span>
            <span className="group-row-hint" id="reset-cache-hint">
              Справочник, рецепты, черновик и настройки останутся.
            </span>
          </span>
          <ChevronIcon />
        </button>
      </div>
      <p className="group-hint" role="status">
        {message}
      </p>
      <p className="group-hint">
        Приложение само проверяет версию раз в день. Сброс кэша удаляет сохранённые файлы приложения
        и скачивает их заново.
      </p>
    </fieldset>
  );
}
