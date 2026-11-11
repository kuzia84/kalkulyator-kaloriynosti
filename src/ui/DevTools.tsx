import { useState } from 'react';

/** Блок для разработки в настройках. SettingsPage показывает его только при npm run dev. */
export function DevTools() {
  const [message, setMessage] = useState('');

  async function addDemo() {
    try {
      // Динамический импорт: тестовые данные не попадают в основной фрагмент.
      const { addDemoRecipes } = await import('../dev/demoRecipes');
      const count = await addDemoRecipes();
      setMessage(`Тестовые рецепты добавлены: ${count}. Откройте «Мои рецепты».`);
    } catch {
      setMessage('Не удалось добавить тестовые рецепты.');
    }
  }

  return (
    <fieldset className="group">
      <legend className="group-label">Для разработки</legend>
      <p className="hint">
        Блок виден только в режиме разработки. Повторное нажатие заменяет тестовые рецепты, а не
        добавляет копии.
      </p>
      <div className="form-actions form-actions-start">
        <button type="button" className="button" onClick={() => void addDemo()}>
          Добавить тестовые рецепты
        </button>
      </div>
      {message ? (
        <p className="hint" role="status">
          {message}
        </p>
      ) : null}
    </fieldset>
  );
}
