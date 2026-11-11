import {
  dishWeight,
  formatNutrient,
  formatWeight,
  NUTRIENT_KEYS,
  per100,
  per100Cooked,
  portion,
  rowNutrients,
  totals,
  type Nutrients,
} from '../calc';
import type { DishState } from './state';

// Excel с русской локалью ждёт «;» как разделитель столбцов и запятую в дробях.
const SEP = ';';
const BOM = '﻿';

function cell(raw: string): string {
  // Текст, который начинается с = + - @, Excel читает как формулу. Апостроф отключает это.
  const value = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[";\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function line(cells: string[]): string {
  return cells.map(cell).join(SEP);
}

function nutrientCells(n: Nutrients | null): string[] {
  return NUTRIENT_KEYS.map((key) => formatNutrient(key, n?.[key]).replace(/\s/g, ''));
}

function weightCell(w: number | null): string {
  return formatWeight(w).replace(/\s/g, '');
}

/** Блюдо в CSV: те же строки и итоги, что в таблице, числа с запятой. */
export function dishToCsv(state: DishState): string {
  const rows = state.rows.filter((r) => r.name.trim() !== '' || r.weight.trim() !== '');
  const total = totals(state.rows);
  const hasWeight = total.weight > 0;
  const lines: string[] = [];
  if (state.name.trim()) lines.push(line([state.name.trim()]));
  lines.push(
    line([
      'Наименование ингредиента',
      'Вес, г',
      'Калорийность, ккал',
      'Белки, г',
      'Жиры, г',
      'Углеводы, г',
    ]),
  );
  for (const r of rows) {
    lines.push(line([r.name, r.weight.replace('.', ','), ...nutrientCells(rowNutrients(r))]));
  }
  lines.push(
    line([
      'Итого',
      weightCell(hasWeight ? total.weight : null),
      ...nutrientCells(hasWeight ? total.nutrients : null),
    ]),
  );
  lines.push(
    line([
      'На 100 г блюда',
      hasWeight ? '100' : '—',
      ...nutrientCells(per100(total.nutrients, total.weight)),
    ]),
  );
  lines.push(
    line([
      'На 100 г готового блюда (с учётом уварки)',
      state.cookedWeight.replace('.', ',') || '—',
      ...nutrientCells(per100Cooked(total.nutrients, state.cookedWeight)),
    ]),
  );
  if (state.portionWeight.trim()) {
    const p = portion(
      total.nutrients,
      dishWeight(total.weight, state.cookedWeight),
      state.portionWeight,
    );
    lines.push(line(['Порция', state.portionWeight.replace('.', ','), ...nutrientCells(p)]));
  }
  if (state.note.trim()) lines.push(line(['Заметка', state.note.trim()]));
  return BOM + lines.join('\r\n') + '\r\n';
}
