import { useCallback, useEffect, useRef, useState } from 'react';
import { recipeEditHash, recipeEditId, useHash } from '../app/router';
import { formatNutrient, formatWeight, per100, per100Cooked, totals } from '../calc';
import { hasContent, type DishAction, type DishState } from '../dish/state';
import {
  deleteRecipe,
  duplicateRecipe,
  listRecipes,
  recipeToState,
  restoreRecipe,
} from '../storage/recipes';
import type { Dish } from '../storage/schema';
import { Modal } from './Modal';
import { RecipeEditor } from './RecipeEditor';
import type { UndoEntry } from './UndoToast';

export interface RecipesPageProps {
  current: DishState;
  dispatch: (action: DishAction) => void;
  offerUndo: (entry: UndoEntry) => void;
  dismissUndo: () => void;
  /** Открыть калькулятор после загрузки рецепта. */
  onOpened: () => void;
}

const dateFormatter = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium' });

function summary(recipe: Dish): string {
  const t = totals(recipe.rows);
  const cooked = per100Cooked(t.nutrients, recipe.cookedWeight);
  const raw = per100(t.nutrients, t.weight);
  const base = cooked ?? raw;
  const parts = [
    `${recipe.rows.filter((r) => r.per100).length} ингр.`,
    `вес ${formatWeight(t.weight > 0 ? t.weight : null)} г`,
  ];
  if (base) {
    parts.push(`${formatNutrient('kcal', base.kcal)} ккал на 100 г${cooked ? ' готового' : ''}`);
  }
  return parts.join(' · ');
}

export function RecipesPage(props: RecipesPageProps) {
  const editId = recipeEditId(useHash());
  const [notice, setNotice] = useState('');
  const returned = useRef(false);

  if (editId != null) {
    return (
      <RecipeEditor
        key={editId}
        recipeId={editId}
        offerUndo={props.offerUndo}
        dismissUndo={props.dismissUndo}
        onDone={(message) => {
          setNotice(message ?? '');
          returned.current = true;
          window.location.hash = '#/recipes';
        }}
      />
    );
  }
  return <RecipeList {...props} notice={notice} focusTitle={returned} />;
}

interface RecipeListProps extends RecipesPageProps {
  /** Итог последней правки рецепта. */
  notice: string;
  /** Список открыт после выхода из правки: фокус на заголовок. */
  focusTitle: { current: boolean };
}

function RecipeList({
  current,
  dispatch,
  offerUndo,
  onOpened,
  notice,
  focusTitle,
}: RecipeListProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [recipes, setRecipes] = useState<Dish[] | null>(null);
  const [error, setError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState<Dish | null>(null);

  const reload = useCallback(async () => {
    try {
      setRecipes(await listRecipes());
    } catch {
      setError('Не удалось прочитать рецепты.');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    // Возврат из правки происходит внутри раздела: App фокус не переводит.
    if (focusTitle.current) {
      focusTitle.current = false;
      titleRef.current?.focus();
    }
  }, [focusTitle]);

  function open(recipe: Dish) {
    const snapshot = current;
    dispatch({ type: 'replace', state: recipeToState(recipe) });
    setConfirmOpen(null);
    onOpened();
    if (hasContent(snapshot)) {
      offerUndo({
        message: `Открыт рецепт «${recipe.name}».`,
        undo: () => dispatch({ type: 'replace', state: snapshot }),
      });
    }
  }

  async function remove(recipe: Dish) {
    setError('');
    try {
      const removed = await deleteRecipe(recipe.id);
      await reload();
      if (removed) {
        offerUndo({
          message: `Рецепт «${removed.name}» удалён.`,
          undo: () => void restoreRecipe(removed).then(reload),
        });
      }
    } catch {
      setError('Не удалось удалить рецепт.');
    }
  }

  async function copy(recipe: Dish) {
    setError('');
    try {
      await duplicateRecipe(recipe.id);
      await reload();
    } catch {
      setError('Не удалось скопировать рецепт.');
    }
  }

  return (
    <section aria-labelledby="recipes-title">
      <h1 className="page-title" tabIndex={-1} id="recipes-title" ref={titleRef}>
        Мои рецепты
      </h1>
      <p className="hint">
        Рецепт хранит ингредиенты с их значениями на момент сохранения. Правки справочника рецепт не
        меняют.
      </p>
      {notice ? (
        <p className="hint" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="warning" role="alert">
          {error}
        </p>
      ) : null}
      {recipes == null ? (
        <p className="hint" role="status">
          Загружаем рецепты…
        </p>
      ) : recipes.length === 0 ? (
        <p className="note">
          Рецептов пока нет. Посчитайте блюдо в калькуляторе и нажмите «Сохранить в рецепты».
        </p>
      ) : (
        <ul className="recipe-list">
          {recipes.map((r) => (
            <li key={r.id} className="card recipe-item">
              <div>
                <h2>{r.name}</h2>
                <p className="hint">{summary(r)}</p>
                {r.note ? <p className="recipe-note">{r.note}</p> : null}
                <p className="hint">Изменён {dateFormatter.format(r.updatedAt)}</p>
              </div>
              <div className="form-actions form-actions-start recipe-actions">
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => (hasContent(current) ? setConfirmOpen(r) : open(r))}
                >
                  Открыть
                </button>
                <a
                  className="button"
                  href={recipeEditHash(r.id)}
                  aria-label={`Изменить рецепт «${r.name}»`}
                >
                  Изменить
                </a>
                <button type="button" className="button" onClick={() => void copy(r)}>
                  Копировать
                </button>
                <button
                  type="button"
                  className="button button-danger"
                  onClick={() => void remove(r)}
                  aria-label={`Удалить рецепт «${r.name}»`}
                >
                  Удалить
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {confirmOpen ? (
        <Modal title="Открыть рецепт?" onClose={() => setConfirmOpen(null)}>
          <p>
            В калькуляторе есть данные. Рецепт «{confirmOpen.name}» заменит их. Вернуть прежнюю
            таблицу можно кнопкой «Отменить» сразу после открытия.
          </p>
          <div className="form-actions">
            <button type="button" className="button" onClick={() => setConfirmOpen(null)}>
              Отмена
            </button>
            <button
              type="button"
              className="button button-primary"
              onClick={() => open(confirmOpen)}
            >
              Открыть рецепт
            </button>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
