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
import { ActionMenu } from './ActionMenu';
import { SearchIcon } from './icons';
import { Modal } from './Modal';
import { ingredientsCount } from './plural';
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

/** Плашки под названием рецепта: калорийность на 100 г, число ингредиентов, вес. */
function summary(recipe: Dish): { kcal: string | null; count: string; weight: string } {
  const t = totals(recipe.rows);
  const cooked = per100Cooked(t.nutrients, recipe.cookedWeight);
  const raw = per100(t.nutrients, t.weight);
  const base = cooked ?? raw;
  return {
    kcal: base
      ? `${formatNutrient('kcal', base.kcal)} ккал / 100 г${cooked ? ' готового' : ''}`
      : null,
    count: ingredientsCount(recipe.rows.filter((r) => r.per100).length),
    weight: `${formatWeight(t.weight > 0 ? t.weight : null)} г`,
  };
}

export function RecipesPage(props: RecipesPageProps) {
  const editId = recipeEditId(useHash());
  const [notice, setNotice] = useState('');
  const returned = useRef(false);
  const { current, dispatch } = props;

  // Список после экрана правки — внутри того же раздела, App фокус не переводит.
  // Это верно и для кнопки «Назад» браузера, поэтому метка ставится при входе в правку.
  useEffect(() => {
    if (editId != null) returned.current = true;
  }, [editId]);

  if (editId != null) {
    return (
      <RecipeEditor
        key={editId}
        recipeId={editId}
        offerUndo={props.offerUndo}
        dismissUndo={props.dismissUndo}
        onDone={(saved) => {
          let message = '';
          if (saved) {
            message = `Рецепт «${saved.name}» обновлён.`;
            // Калькулятор открыт из этого рецепта и держит старую версию. «Обновить рецепт»
            // в калькуляторе перезаписал бы правку, поэтому связь снимается.
            if (current.recipeId === saved.id) {
              dispatch({ type: 'unlinkRecipe' });
              message +=
                ' В калькуляторе осталась прежняя версия, она больше не связана с рецептом.';
            }
          }
          setNotice(message);
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
  // Область status появляется пустой, текст приходит следующим шагом: так его объявляют
  // программы чтения с экрана.
  const [shownNotice, setShownNotice] = useState('');
  const [recipes, setRecipes] = useState<Dish[] | null>(null);
  const [error, setError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState<Dish | null>(null);
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const found = (recipes ?? []).filter((r) => r.name.toLowerCase().includes(needle));

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
    setShownNotice(notice);
  }, [notice]);

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
    setShownNotice('');
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
    setShownNotice('');
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
      <p className="hint" role="status">
        {shownNotice}
      </p>
      {error ? (
        <p className="warning" role="alert">
          {error}
        </p>
      ) : null}
      {recipes != null && recipes.length > 0 ? (
        <label className="search-field">
          <SearchIcon />
          <input
            className="search-input"
            type="search"
            placeholder="Найти рецепт"
            aria-label="Найти рецепт"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      ) : null}
      {recipes != null && recipes.length > 0 && found.length === 0 ? (
        <p className="note" role="status">
          Рецептов с «{query.trim()}» в названии нет.
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
      ) : found.length === 0 ? null : (
        <ul className="recipe-list">
          {found.map((r) => {
            const info = summary(r);
            return (
              <li key={r.id} className="card recipe-item">
                <h2>{r.name}</h2>
                <p className="chips">
                  {info.kcal ? <span className="chip chip-accent">{info.kcal}</span> : null}
                  <span className="chip">{info.count}</span>
                  <span className="chip">{info.weight}</span>
                  <span className="chip chip-quiet">
                    Изменён {dateFormatter.format(r.updatedAt)}
                  </span>
                </p>
                {r.note ? <p className="recipe-note">{r.note}</p> : null}
                <div className="recipe-actions">
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() => (hasContent(current) ? setConfirmOpen(r) : open(r))}
                    aria-label={`В калькулятор: рецепт «${r.name}»`}
                  >
                    В калькулятор
                  </button>
                  <a
                    className="button"
                    href={recipeEditHash(r.id)}
                    aria-label={`Изменить рецепт «${r.name}»`}
                  >
                    Изменить рецепт
                  </a>
                  <ActionMenu
                    label={`Ещё действия с рецептом «${r.name}»`}
                    items={[
                      { label: 'Копировать', onSelect: () => void copy(r) },
                      {
                        label: 'Удалить',
                        ariaLabel: `Удалить рецепт «${r.name}»`,
                        danger: true,
                        onSelect: () => void remove(r),
                      },
                    ]}
                  />
                </div>
              </li>
            );
          })}
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
