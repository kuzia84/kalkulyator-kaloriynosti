import { useEffect } from 'react';
import { ROUTES, useRoute, type Route } from '../app/router';
import { SettingsProvider, useSettings } from '../app/settingsContext';
import { applyTheme } from '../app/theme';
import { useOnline } from '../app/useOnline';
import { useDish } from '../dish/useDish';
import { CalculatorPage } from './CalculatorPage';
import { ModerationPage } from './ModerationPage';
import { SettingsPage } from './SettingsPage';
import { UndoToast, useUndo } from './UndoToast';
import './styles.css';

/** Разделы, которые уже есть в приложении. */
const PAGES: Route[] = ['calculator', 'moderation', 'settings'];

function Shell() {
  const route = useRoute();
  const online = useOnline();
  const { settings, ready: settingsReady } = useSettings();
  const dish = useDish();
  const undo = useUndo();
  const page = PAGES.includes(route) ? route : 'calculator';

  useEffect(() => applyTheme(settings.theme), [settings.theme]);

  const ready = dish.ready && settingsReady;

  return (
    <div className="app">
      <header className="app-header">
        <a className="app-brand" href="#/">
          <span className="app-logo" aria-hidden="true">
            ккал
          </span>
          <span className="app-title">Калорийность блюда</span>
        </a>
        <nav className="app-nav" aria-label="Разделы">
          {ROUTES.filter((r) => PAGES.includes(r.route)).map((r) => (
            <a key={r.route} href={r.hash} aria-current={page === r.route ? 'page' : undefined}>
              {r.label}
            </a>
          ))}
        </nav>
      </header>
      {!online ? (
        <p className="banner banner-offline" role="status">
          Нет интернета. Поиск идёт только по справочнику на устройстве, расчёт работает как обычно.
        </p>
      ) : null}
      <main className="app-main">
        {!ready ? (
          <p className="hint" role="status">
            Загружаем данные…
          </p>
        ) : page === 'settings' ? (
          <SettingsPage />
        ) : page === 'moderation' ? (
          <ModerationPage offerUndo={undo.offer} />
        ) : (
          <CalculatorPage dish={dish} offerUndo={undo.offer} dismissUndo={undo.dismiss} />
        )}
      </main>
      <UndoToast entry={undo.entry} onDismiss={undo.dismiss} />
    </div>
  );
}

export function App() {
  return (
    <SettingsProvider>
      <Shell />
    </SettingsProvider>
  );
}
