import { useDish } from '../dish/useDish';
import { DEFAULT_SETTINGS } from '../storage/schema';
import { CalculatorPage } from './CalculatorPage';
import { UndoToast, useUndo } from './UndoToast';
import './styles.css';

export function App() {
  const dish = useDish();
  const undo = useUndo();

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-logo" aria-hidden="true">
          ккал
        </span>
        <span className="app-title">Калорийность блюда</span>
      </header>
      <main className="app-main">
        {dish.ready ? (
          <CalculatorPage
            dish={dish}
            suggestionsLimit={DEFAULT_SETTINGS.suggestionsLimit}
            offerUndo={undo.offer}
            dismissUndo={undo.dismiss}
          />
        ) : (
          <p className="hint" role="status">
            Загружаем данные…
          </p>
        )}
      </main>
      <UndoToast entry={undo.entry} onDismiss={undo.dismiss} />
    </div>
  );
}
