import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  atwaterKcal,
  formatNutrient,
  isSuspicious,
  parseDecimal,
  sanitizeDecimalInput,
  SUSPICIOUS_MIN_KCAL_DIFF,
  SUSPICIOUS_THRESHOLD,
  toInputString,
  type Nutrients,
} from '../calc';
import { normalizeBarcode } from '../catalog/normalize';

export interface ProductFormValue extends Nutrients {
  name: string;
  barcode?: string;
  /** Есть, только если форма показывает поле «Проверено» (`verifiedField`). */
  verified?: boolean;
}

export interface ProductFormProps {
  initial?: Partial<ProductFormValue>;
  submitLabel: string;
  /** Показать флажок «Проверено». Начальное значение — `initial.verified`, иначе включён. */
  verifiedField?: boolean;
  /**
   * Автозаполнение: новые значения поверх введённых. Форма применяет его, когда меняется `id`.
   * Поля, которых нет в `values`, не меняются.
   */
  fill?: { id: number; values: Partial<ProductFormValue> };
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
export function ProductForm({
  initial,
  submitLabel,
  verifiedField = false,
  fill,
  onSubmit,
  onCancel,
}: ProductFormProps) {
  const [values, setValues] = useState<Record<Field, string>>({
    name: initial?.name ?? '',
    kcal: toText(initial?.kcal),
    protein: toText(initial?.protein),
    fat: toText(initial?.fat),
    carbs: toText(initial?.carbs),
    barcode: initial?.barcode ?? '',
  });
  const [verified, setVerified] = useState(initial?.verified ?? true);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const uid = useId();
  const formRef = useRef<HTMLFormElement>(null);
  // Номер неудачной отправки: после неё фокус уходит на первое поле с ошибкой.
  const [failedSubmit, setFailedSubmit] = useState(0);

  useEffect(() => {
    if (failedSubmit === 0) return;
    formRef.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
  }, [failedSubmit]);

  const fillId = fill?.id;
  useEffect(() => {
    if (!fill) return;
    const { values: next } = fill;
    setValues((v) => ({
      name: next.name ?? v.name,
      kcal: next.kcal != null ? toText(next.kcal) : v.kcal,
      protein: next.protein != null ? toText(next.protein) : v.protein,
      fat: next.fat != null ? toText(next.fat) : v.fat,
      carbs: next.carbs != null ? toText(next.carbs) : v.carbs,
      barcode: next.barcode ?? v.barcode,
    }));
    if (next.verified != null) setVerified(next.verified);
    setErrors({});
    // Применяется только новое заполнение: тот же `id` уже в форме.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fillId]);
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
    if (Object.keys(next).length > 0) {
      setFailedSubmit((n) => n + 1);
      return;
    }
    onSubmit({
      name: values.name.trim(),
      kcal: parsed.kcal!,
      protein: parsed.protein!,
      fat: parsed.fat!,
      carbs: parsed.carbs!,
      ...(barcode ? { barcode } : {}),
      ...(verifiedField ? { verified } : {}),
    });
  }

  return (
    <form ref={formRef} className="product-form" onSubmit={submit} noValidate>
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
      {verifiedField ? (
        <label className="checkbox">
          <input
            type="checkbox"
            checked={verified}
            onChange={(e) => setVerified(e.target.checked)}
          />
          <span>
            Проверено
            <span className="hint">Значения сверены с упаковкой или надёжным источником.</span>
          </span>
        </label>
      ) : null}
      {suspicious ? (
        <p className="warning" role="status">
          Калорийность не сходится с БЖУ. По БЖУ получается{' '}
          {formatNutrient('kcal', atwaterKcal(parsed as Nutrients))} ккал (белки и углеводы — по 4
          ккал на грамм, жиры — 9). Разница больше {Math.round(SUSPICIOUS_THRESHOLD * 100)} % и
          больше {SUSPICIOUS_MIN_KCAL_DIFF} ккал. Проверьте значения.
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
