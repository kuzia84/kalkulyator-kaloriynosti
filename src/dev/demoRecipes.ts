import { SEED } from '../catalog/seed';
import { db as defaultDb, type AppDB } from '../storage/db';
import type { Dish, DishRow } from '../storage/schema';

/**
 * Тестовые рецепты для визуальной проверки. Только для режима разработки:
 * модуль подключает SettingsPage через import() под условием import.meta.env.DEV.
 */

type DemoIngredient = [seedId: string, weight: string];

interface DemoSpec {
  name: string;
  ingredients: DemoIngredient[];
  cookedWeight?: string;
  portionWeight?: string;
  note?: string;
}

const SPECS: DemoSpec[] = [
  {
    name: 'Гречка с курицей',
    ingredients: [
      ['sk-004', '200'],
      ['sk-050', '300'],
      ['sk-016', '80'],
      ['sk-015', '70'],
      ['sk-044', '15'],
    ],
    cookedWeight: '1100',
    portionWeight: '300',
    note: 'Крупу варить 20 минут, грудку обжарить отдельно.',
  },
  {
    name: 'Борщ',
    ingredients: [
      ['sk-047', '500'],
      ['sk-019', '300'],
      ['sk-017', '300'],
      ['sk-014', '400'],
      ['sk-015', '150'],
      ['sk-016', '150'],
      ['sk-021', '200'],
      ['sk-044', '20'],
      ['sk-001', '2500'],
    ],
    cookedWeight: '4000',
    portionWeight: '350',
    note: 'Свёклу тушить отдельно с томатами и каплей уксуса, чтобы сохранить цвет. Капусту класть после картофеля. Подавать со сметаной и зеленью. Сметана в расчёт не входит.',
  },
  {
    name: 'Омлет',
    ingredients: [
      ['sk-046', '150'],
      ['sk-034', '60'],
    ],
    portionWeight: '200',
  },
  {
    name: 'Сырники',
    ingredients: [
      ['sk-037', '400'],
      ['sk-046', '50'],
      ['sk-013', '60'],
      ['sk-003', '30'],
      ['sk-044', '20'],
    ],
    cookedWeight: '480',
    portionWeight: '150',
  },
  {
    name: 'Салат овощной',
    ingredients: [
      ['sk-020', '150'],
      ['sk-021', '200'],
      ['sk-016', '30'],
      ['sk-026', '10'],
      ['sk-045', '15'],
    ],
    note: 'Без веса готового блюда: порция считается от суммы весов.',
  },
  {
    name: 'Плов со свининой, морковью и чесноком по-домашнему в казане',
    ingredients: [
      ['sk-005', '400'],
      ['sk-048', '500'],
      ['sk-015', '300'],
      ['sk-016', '200'],
      ['sk-024', '40'],
      ['sk-044', '80'],
      ['sk-002', '10'],
    ],
    cookedWeight: '2100',
    portionWeight: '250',
  },
];

function demoRow(recipeIndex: number, rowIndex: number, [seedId, weight]: DemoIngredient): DishRow {
  const entry = SEED.find((e) => e.id === seedId);
  if (!entry) throw new Error(`Нет продукта ${seedId} в стартовом наборе.`);
  return {
    id: `demo-${recipeIndex + 1}-${rowIndex + 1}`,
    productId: entry.id,
    name: entry.name,
    weight,
    per100: { kcal: entry.kcal, protein: entry.protein, fat: entry.fat, carbs: entry.carbs },
    source: 'skurikhin',
    // Тестовые данные не меняют ранг продуктов в справочнике.
    committed: true,
  };
}

/** Тестовые рецепты. Id постоянные: повторное добавление заменяет рецепты, а не дублирует их. */
export function demoRecipes(now = Date.now()): Dish[] {
  const hour = 60 * 60 * 1000;
  return SPECS.map((spec, i) => ({
    id: `demo-${i + 1}`,
    name: spec.name,
    rows: spec.ingredients.map((ingredient, j) => demoRow(i, j, ingredient)),
    cookedWeight: spec.cookedWeight ?? '',
    portionWeight: spec.portionWeight ?? '',
    note: spec.note ?? '',
    // Разное время правки: список показывает рецепты в заданном порядке.
    createdAt: now - (i + 1) * 24 * hour,
    updatedAt: now - i * hour,
  }));
}

/** Добавляет тестовые рецепты в базу. Возвращает их число. */
export async function addDemoRecipes(db: AppDB = defaultDb, now = Date.now()): Promise<number> {
  const recipes = demoRecipes(now);
  await db.recipes.bulkPut(recipes);
  return recipes.length;
}
