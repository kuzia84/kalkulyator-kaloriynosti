import { useRef, useState } from 'react';
import { downloadText } from '../lib/download';
import { BackupError, exportBackup, importBackup } from '../storage/backup';
import { useSettings } from '../app/settingsContext';
import type { ExternalSource, Theme } from '../storage/schema';
import { SUGGESTIONS_MAX, SUGGESTIONS_MIN } from '../storage/settings';

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

const THEME_LABELS: Record<Theme, string> = {
  system: 'Как в системе',
  light: 'Светлая',
  dark: 'Тёмная',
};

export function SettingsPage() {
  const { settings, update } = useSettings();
  const [showKey, setShowKey] = useState(false);
  const [keyDraft, setKeyDraft] = useState(settings.usdaApiKey);
  const [limitDraft, setLimitDraft] = useState(String(settings.suggestionsLimit));
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

  // Число применяется после ухода из поля: иначе при вводе «20» первая «2» сразу стала бы 5.
  function commitLimit() {
    const v = Math.round(Number(limitDraft));
    const next =
      limitDraft.trim() !== '' && Number.isFinite(v)
        ? Math.min(SUGGESTIONS_MAX, Math.max(SUGGESTIONS_MIN, v))
        : settings.suggestionsLimit;
    setLimitDraft(String(next));
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
      <h1 className="page-title" tabIndex={-1} id="settings-title">
        Настройки
      </h1>
      <p className="hint">Настройки хранятся только на этом устройстве.</p>

      <fieldset className="card">
        <legend>Подсказки</legend>
        <label className="field">
          <span>Сколько подсказок загружать из справочника и из сети</span>
          <input
            className="input input-short"
            type="number"
            min={SUGGESTIONS_MIN}
            max={SUGGESTIONS_MAX}
            inputMode="numeric"
            value={limitDraft}
            onChange={(e) => setLimitDraft(e.target.value)}
            onBlur={commitLimit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitLimit();
            }}
          />
          <span className="hint">
            Видно 5 пунктов, остальные — прокруткой. От {SUGGESTIONS_MIN} до {SUGGESTIONS_MAX}.
          </span>
        </label>
      </fieldset>

      <fieldset className="card">
        <legend>Внешние источники</legend>
        <p className="hint">
          Поиск идёт сначала по справочнику на устройстве, потом в источниках в этом порядке.
          Внешний поиск начинается с трёх букв и работает только при подключении к интернету.
        </p>
        <ol className="source-list">
          {settings.sourcesOrder.map((source, i) => (
            <li key={source} className="source-item">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={settings.enabledSources.includes(source)}
                  onChange={(e) => toggle(source, e.target.checked)}
                />
                <span>
                  <strong>{SOURCE_INFO[source].title}</strong>
                  <span className="hint">{SOURCE_INFO[source].text}</span>
                </span>
              </label>
              <span className="source-move">
                <button
                  type="button"
                  className="button-icon"
                  aria-label={`Поднять ${SOURCE_INFO[source].title}`}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="button-icon"
                  aria-label={`Опустить ${SOURCE_INFO[source].title}`}
                  disabled={i === settings.sourcesOrder.length - 1}
                  onClick={() => move(i, 1)}
                >
                  ↓
                </button>
              </span>
            </li>
          ))}
        </ol>
        <form
          className="field"
          onSubmit={(e) => {
            e.preventDefault();
            update({ usdaApiKey: keyDraft.trim() });
          }}
        >
          <label htmlFor="usda-key">Ключ USDA API</label>
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
          <span id="usda-key-hint" className="hint">
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
      </fieldset>

      <fieldset className="card">
        <legend>Перенос данных</legend>
        <p className="hint">
          Данные хранятся только в этом браузере. Чтобы перенести справочник и рецепты на другое
          устройство, сохраните файл и загрузите его там. Настройки и ключ USDA в файл не входят.
          При загрузке ничего не удаляется: более новые рецепты и проверенные продукты на устройстве
          остаются.
        </p>
        <div className="form-actions form-actions-start">
          <button type="button" className="button" onClick={() => void exportFile()}>
            Сохранить в файл
          </button>
          <button type="button" className="button" onClick={() => fileInput.current?.click()}>
            Загрузить из файла
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
        {dataMessage ? (
          <p className="hint" role="status">
            {dataMessage}
          </p>
        ) : null}
      </fieldset>

      <fieldset className="card">
        <legend>Оформление</legend>
        <div className="radio-group" role="radiogroup" aria-label="Тема">
          {(Object.keys(THEME_LABELS) as Theme[]).map((theme) => (
            <label key={theme} className="checkbox">
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
      </fieldset>
    </section>
  );
}
