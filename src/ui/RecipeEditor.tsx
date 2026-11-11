import { useEffect, useReducer, useRef, useState } from 'react';
import { dishContentKey, dishReducer, type DishState } from '../dish/state';
import { useCatalogCommits } from '../dish/useCatalogCommits';
import { getRecipe, RecipeNotFoundError, recipeToState, updateRecipe } from '../storage/recipes';
import { DishSummary } from './DishSummary';
import { IngredientsEditor } from './IngredientsEditor';
import { Modal } from './Modal';
import type { UndoEntry } from './UndoToast';

export interface RecipeEditorProps {
  recipeId: string;
  offerUndo: (entry: UndoEntry) => void;
  dismissUndo: () => void;
  /** Выход к списку рецептов. `saved` — рецепт, если правку сохранили. */
  onDone: (saved?: { id: string; name: string }) => void;
}

type Loaded = { status: 'loading' } | { status: 'missing' } | { status: 'ready'; state: DishState };

/** Экран правки сохранённого рецепта. Загружает рецепт и показывает форму правки. */
export function RecipeEditor(props: RecipeEditorProps) {
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    getRecipe(props.recipeId)
      .then((recipe) => {
        if (cancelled) return;
        setLoaded(
          recipe ? { status: 'ready', state: recipeToState(recipe) } : { status: 'missing' },
        );
      })
      .catch(() => {
        if (!cancelled) setLoaded({ status: 'missing' });
      });
    return () => {
      cancelled = true;
    };
  }, [props.recipeId]);

  if (loaded.status === 'loading') {
    return (
      <p className="hint" role="status">
        Загружаем рецепт…
      </p>
    );
  }
  if (loaded.status === 'missing') {
    return (
      <section aria-labelledby="recipe-edit-title">
        <h1 className="page-title" tabIndex={-1} id="recipe-edit-title">
          Рецепт не найден
        </h1>
        <p className="note">Рецепт мог быть удалён.</p>
        <p>
          <a href="#/recipes">К списку рецептов</a>
        </p>
      </section>
    );
  }
  return <RecipeForm {...props} initial={loaded.state} />;
}

interface RecipeFormProps extends RecipeEditorProps {
  initial: DishState;
}

/**
 * Форма правки. Своё состояние, отдельное от калькулятора: черновик калькулятора не меняется.
 * Итоги, значения на 100 г и порция пересчитываются при каждой правке.
 */
function RecipeForm({ initial, offerUndo, dismissUndo, onDone }: RecipeFormProps) {
  const [state, dispatch] = useReducer(dishReducer, initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  // Запись продукта в справочник меняет служебные поля строки, но это не правка пользователя.
  const changed = dishContentKey(state) !== dishContentKey(initial);

  useCatalogCommits(state.rows, dispatch, true);

  // Экран открылся внутри того же раздела: App фокус не переводит, это делает форма.
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  // Отмена удаления строки работает только на этом экране.
  useEffect(() => dismissUndo, [dismissUndo]);

  function removeRow(rowId: string) {
    const index = state.rows.findIndex((r) => r.id === rowId);
    const row = state.rows[index];
    if (!row) return;
    dispatch({ type: 'removeRow', rowId });
    offerUndo({
      message: row.name ? `Строка «${row.name}» удалена.` : 'Строка удалена.',
      undo: () => dispatch({ type: 'insertRow', row, index }),
    });
  }

  async function save() {
    // Второе нажатие во время записи не нужно: рецепт уже сохраняется.
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const saved = await updateRecipe(state);
      onDone({ id: saved.id, name: saved.name });
    } catch (e) {
      setError(
        e instanceof RecipeNotFoundError
          ? 'Рецепт уже удалён, изменения не сохранены.'
          : 'Не удалось сохранить рецепт.',
      );
      setSaving(false);
    }
  }

  function cancel() {
    if (changed) setConfirmLeave(true);
    else onDone();
  }

  return (
    <section aria-labelledby="recipe-edit-title" className="recipe-editor">
      <div className="page-header">
        <h1 className="page-title" tabIndex={-1} id="recipe-edit-title" ref={titleRef}>
          Правка рецепта
        </h1>
        <div className="page-actions">
          <button type="button" className="button" onClick={cancel}>
            Отмена
          </button>
          <button
            type="button"
            className="button button-primary"
            disabled={saving}
            onClick={() => void save()}
          >
            Сохранить
          </button>
        </div>
      </div>
      <p className="hint">
        Измените вес, замените или добавьте ингредиенты. Калорийность и БЖУ пересчитываются сразу.
        Рецепт меняется только после нажатия «Сохранить».
      </p>
      {error ? (
        <p className="warning" role="alert">
          {error}
        </p>
      ) : null}
      <IngredientsEditor state={state} dispatch={dispatch} onRemoveRow={removeRow} />
      <DishSummary
        state={state}
        dispatch={dispatch}
        actions={
          <div className="form-actions form-actions-start no-print">
            <button
              type="button"
              className="button button-primary"
              disabled={saving}
              onClick={() => void save()}
            >
              Сохранить изменения
            </button>
            <button type="button" className="button" onClick={cancel}>
              Отмена
            </button>
          </div>
        }
      />
      {confirmLeave ? (
        <Modal title="Выйти без сохранения?" onClose={() => setConfirmLeave(false)}>
          <p>Изменения в рецепте «{initial.name}» не сохранены и пропадут.</p>
          <div className="form-actions">
            <button type="button" className="button" onClick={() => setConfirmLeave(false)}>
              Продолжить правку
            </button>
            <button type="button" className="button button-danger" onClick={() => onDone()}>
              Выйти без сохранения
            </button>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
