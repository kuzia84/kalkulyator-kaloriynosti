import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { ROUTES, useRoute, type Route } from '../app/router';
import { SettingsProvider, useSettings } from '../app/settingsContext';
import { UpdateProvider, useAppUpdate } from '../app/updateContext';
import { applyTheme } from '../app/theme';
import { useOnline } from '../app/useOnline';
import { useDish } from '../dish/useDish';
import { CalculatorPage } from './CalculatorPage';
import { HeaderActionsContext } from './HeaderActions';
import { Icon } from './icons';
import { ModerationPage } from './ModerationPage';
import { RecipesPage } from './RecipesPage';
import { SettingsPage } from './SettingsPage';
import { UndoToast, useUndo } from './UndoToast';
import './styles.css';

/** Разделы, которые уже есть в приложении. */
const PAGES: Route[] = ['calculator', 'recipes', 'moderation', 'settings'];

/** Подписи вкладок на телефоне: полные названия не помещаются в четверть ширины экрана. */
const SHORT_NAV_LABELS: Record<Route, string> = {
  calculator: 'Блюдо',
  recipes: 'Рецепты',
  moderation: 'Продукты',
  settings: 'Настройки',
};

/** Иконки разделов: на телефоне навигация — панель вкладок внизу экрана. */
function NavIcon({ route }: { route: Route }) {
  return (
    <Icon className="app-nav-icon icon" size={24}>
      {route === 'calculator' ? (
        <>
          <rect x="5" y="3" width="14" height="18" rx="3" />
          <path d="M8.5 7.5h7M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01" />
        </>
      ) : route === 'recipes' ? (
        <>
          <path d="M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4Z" />
          <path d="M5 16a4 4 0 0 1 4-4h10" />
        </>
      ) : route === 'moderation' ? (
        <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
      ) : (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />
        </>
      )}
    </Icon>
  );
}

function Shell() {
  const route = useRoute();
  const online = useOnline();
  const { settings, ready: settingsReady } = useSettings();
  const dish = useDish();
  const undo = useUndo();
  const { updateAvailable } = useAppUpdate();
  const page = PAGES.includes(route) ? route : 'calculator';
  const [actionsSlot, setActionsSlot] = useState<HTMLDivElement | null>(null);

  useEffect(() => applyTheme(settings.theme), [settings.theme]);

  const ready = dish.ready && settingsReady;
  const mainRef = useRef<HTMLElement>(null);
  const previousPage = useRef(page);
  const readyRef = useRef(ready);
  readyRef.current = ready;

  function focusPageTitle() {
    // У каждой страницы заголовок .page-title с tabIndex={-1}. Нет заголовка — фокус на <main>.
    const target =
      mainRef.current?.querySelector<HTMLElement>('.page-title') ?? mainRef.current ?? null;
    target?.focus();
  }

  // Смена раздела переводит фокус на заголовок страницы: программа чтения с экрана
  // объявляет новый раздел, а Tab продолжает с начала его содержимого.
  // Смена раздела во время загрузки фокус не трогает: пользователь мог уже уйти Tab дальше.
  useEffect(() => {
    const changed = previousPage.current !== page;
    previousPage.current = page;
    if (changed && readyRef.current) focusPageTitle();
  }, [page]);

  function skipToContent(e: MouseEvent<HTMLAnchorElement>) {
    // Обычный переход по #id сменил бы маршрут: адреса разделов тоже лежат в hash.
    e.preventDefault();
    focusPageTitle();
  }

  return (
    <div className="app">
      <a className="skip-link" href="#main-content" onClick={skipToContent}>
        Перейти к содержимому
      </a>
      <header className="app-header">
        <a className="app-brand" href="#/">
          <span className="app-logo" aria-hidden="true">
            <svg viewBox="0 0 40 40" focusable="false">
              <circle cx="20" cy="20" r="15" fill="none" stroke="currentColor" strokeWidth="3" />
              <path d="M20 20V9a11 11 0 0 1 10.5 14.2Z" fill="currentColor" />
              <path d="M20 20l10.5 3.2A11 11 0 0 1 12 27.6Z" fill="currentColor" opacity="0.7" />
              <path d="M20 20l-8 7.6A11 11 0 0 1 20 9Z" fill="currentColor" opacity="0.4" />
            </svg>
          </span>
          <span className="app-title">Ккалькулятор</span>
        </a>
        <nav className="app-nav" aria-label="Разделы">
          {ROUTES.filter((r) => PAGES.includes(r.route)).map((r) => (
            <a key={r.route} href={r.hash} aria-current={page === r.route ? 'page' : undefined}>
              <NavIcon route={r.route} />
              <span className="app-nav-label">{r.label}</span>
              <span className="app-nav-short" aria-hidden="true">
                {SHORT_NAV_LABELS[r.route]}
              </span>
              {r.route === 'settings' && updateAvailable ? (
                <>
                  <span className="update-dot" aria-hidden="true">
                    !
                  </span>
                  <span className="visually-hidden">, есть обновление</span>
                </>
              ) : null}
            </a>
          ))}
        </nav>
        <div className="app-actions" ref={setActionsSlot} />
      </header>
      {!online ? (
        <p className="banner banner-offline" role="status">
          Нет интернета. Поиск идёт только по справочнику на устройстве, расчёт работает как обычно.
        </p>
      ) : null}
      <HeaderActionsContext.Provider value={actionsSlot}>
        <main id="main-content" ref={mainRef} className="app-main" tabIndex={-1}>
          {!ready ? (
            <p className="hint" role="status">
              Загружаем данные…
            </p>
          ) : page === 'settings' ? (
            <SettingsPage />
          ) : page === 'recipes' ? (
            <RecipesPage
              current={dish.state}
              dispatch={dish.dispatch}
              offerUndo={undo.offer}
              dismissUndo={undo.dismiss}
              onOpened={() => {
                window.location.hash = '#/';
              }}
            />
          ) : page === 'moderation' ? (
            <ModerationPage offerUndo={undo.offer} />
          ) : (
            <CalculatorPage dish={dish} offerUndo={undo.offer} dismissUndo={undo.dismiss} />
          )}
        </main>
      </HeaderActionsContext.Provider>
      <UndoToast entry={undo.entry} onDismiss={undo.dismiss} />
    </div>
  );
}

export function App() {
  return (
    <SettingsProvider>
      <UpdateProvider>
        <Shell />
      </UpdateProvider>
    </SettingsProvider>
  );
}
