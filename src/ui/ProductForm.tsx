import { useId, useState, type FormEvent } from 'react';
import {
  atwaterKcal,
  formatNutrient,
  isSuspicious,
  parseDecimal,
  sanitizeDecimalInput,
  toInputString,
  type Nutrients,
} from '../calc';
import { normalizeBarcode } from '../catalog/normalize';

export interface ProductFormValue extends Nutrients {
  name: string;
  barcode?: string;
}

export interface ProductFormProps {
  initial?: Partial<ProductFormValue>;
  submitLabel: string;
  onSubmit: (value: ProductFormValue) => void;
  onCancel: () => void;
}

type Field = 'name' | 'kcal' | 'protein' | 'fat' | 'carbs' | 'barcode';

const NUMBER_FIELDS: { key: keyof Nutrients; label: string }[] = [
  { key: 'kcal', label: 'Калорийность, ккал' },
  { key: 'protein', label: 'Белки, г' },
  { key: 'fat', label: 'Жиры, г' },
  { key: 'carbs', label: 'Углеводы, г' },
];

function toText(value: number | undefined): string {
  return value == null ? '' : toInputString(value, 2);
}

/** Форма продукта: название, ккал и БЖУ на 100 г, штрихкод. Нужна для ручного ввода и модерации. */
export function ProductForm({ initial, submitLabel, onSubmit, onCancel }: ProductFormProps) {
  const [values, setValues] = useState<Record<Field, string>>({
    name: initial?.name ?? '',
    kcal: toText(initial?.kcal),
    protein: toText(initial?.protein),
    fat: toText(initial?.fat),
    carbs: toText(initial?.carbs),
    barcode: initial?.barcode ?? '',
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const uid = useId();
  const errorId = (field: Field) => `${uid}-${field}-error`;

  const parsed = {
    kcal: parseDecimal(values.kcal),
    protein: parseDecimal(values.protein),
    fat: parseDecimal(values.fat),
    carbs: parseDecimal(values.carbs),
  };
  const complete =
    parsed.kcal != null && parsed.protein != null && parsed.fat != null && parsed.carbs != null;
  const suspicious = complete && isSuspicious(parsed as Nutrients);

  function set(field: Field, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const next: Partial<Record<Field, string>> = {};
    if (values.name.trim() === '') next.name = 'Введите название.';
    for (const { key } of NUMBER_FIELDS) {
      const v = parsed[key];
      if (v == null) next[key] = 'Введите число.';
    }
    if (parsed.kcal != null && parsed.kcal > 900) next.kcal = 'Не больше 900 ккал на 100 г.';
    const macroSum = (parsed.protein ?? 0) + (parsed.fat ?? 0) + (parsed.carbs ?? 0);
    if (macroSum > 100) next.carbs = 'Белки, жиры и углеводы вместе — не больше 100 г.';
    const barcode = normalizeBarcode(values.barcode);
    if (values.barcode.trim() !== '' && ![8, 12, 13].includes(barcode.length)) {
      next.barcode = 'Штрихкод — 8, 12 или 13 цифр.';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    onSubmit({
      name: values.name.trim(),
      kcal: parsed.kcal!,
      protein: parsed.protein!,
      fat: parsed.fat!,
      carbs: parsed.carbs!,
      ...(barcode ? { barcode } : {}),
    });
  }

  return (
    <form className="product-form" onSubmit={submit} noValidate>
      <p className="hint">Значения на 100 г сырого продукта.</p>
      <label className="field">
        <span>Название</span>
        <input
          className="input"
          value={values.name}
          onChange={(e) => set('name', e.target.value)}
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? errorId('name') : undefined}
        />
        {errors.name ? (
          <span id={errorId('name')} className="field-error">
            {errors.name}
          </span>
        ) : null}
      </label>
      <div className="field-grid">
        {NUMBER_FIELDS.map(({ key, label }) => (
          <label key={key} className="field">
            <span>{label}</span>
            <input
              className="input input-number"
              inputMode="decimal"
              value={values[key]}
              onChange={(e) => set(key, sanitizeDecimalInput(e.target.value, 2))}
              aria-invalid={!!errors[key]}
              aria-describedby={errors[key] ? errorId(key) : undefined}
            />
            {errors[key] ? (
              <span id={errorId(key)} className="field-error">
                {errors[key]}
              </span>
            ) : null}
          </label>
        ))}
      </div>
      <label className="field">
        <span>Штрихкод (если есть)</span>
        <input
          className="input"
          inputMode="numeric"
          value={values.barcode}
          onChange={(e) => set('barcode', e.target.value.replace(/[^\d\s]/g, ''))}
          aria-invalid={!!errors.barcode}
          aria-describedby={errors.barcode ? errorId('barcode') : undefined}
        />
        {errors.barcode ? (
          <span id={errorId('barcode')} className="field-error">
            {errors.barcode}
          </span>
        ) : null}
      </label>
      {suspicious ? (
        <p className="warning" role="status">
          По формуле Б×4 + Ж×9 + У×4 получается{' '}
          {formatNutrient('kcal', atwaterKcal(parsed as Nutrients))} ккал. Это отличается от
          введённой калорийности больше чем на 15 %. Проверьте значения.
        </p>
      ) : null}
      <div className="form-actions">
        <button type="button" className="button" onClick={onCancel}>
          Отмена
        </button>
        <button type="submit" className="button button-primary">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
