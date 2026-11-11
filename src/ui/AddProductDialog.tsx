import { useRef, useState } from 'react';
import { addProduct, findByExternalId } from '../catalog/moderation';
import type { Suggestion } from '../search/types';
import { SOURCE_LABELS, type Product, type ProductSource } from '../storage/schema';
import { BarcodeScanner } from './BarcodeDialog';
import { Modal } from './Modal';
import { ProductForm, type ProductFormValue } from './ProductForm';
import { WebProductSearch } from './WebProductSearch';

export interface AddProductDialogProps {
  /** Название для формы и поиска в сети, например текст из поиска по справочнику. */
  initialName: string;
  onClose: () => void;
  onAdded: (product: Product) => void;
  /** Найденный по штрихкоду продукт уже есть в справочнике. */
  onExisting: (name: string) => void;
}

type Mode = 'manual' | 'barcode' | 'web';

const MODES: { mode: Mode; label: string }[] = [
  { mode: 'manual', label: 'Вручную' },
  { mode: 'barcode', label: 'По штрихкоду' },
  { mode: 'web', label: 'Найти в сети' },
];

/** Откуда форма получила значения. Запись сохраняет этот источник и его id. */
interface Origin {
  source: ProductSource;
  externalId?: string;
  name: string;
  detail?: string;
}

/**
 * Окно «Новый продукт» справочника. Форму можно заполнить вручную, по штрихкоду
 * или поиском в сети. Автозаполнение меняет поля формы, а сохраняет запись человек.
 */
export function AddProductDialog({
  initialName,
  onClose,
  onAdded,
  onExisting,
}: AddProductDialogProps) {
  const [mode, setMode] = useState<Mode>('manual');
  const [fill, setFill] = useState<{ id: number; values: Partial<ProductFormValue> }>();
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [error, setError] = useState('');
  // Сохранение идёт: повторное нажатие «Добавить» не создаёт вторую запись.
  const saving = useRef(false);

  async function fillFrom(product: Suggestion) {
    if (product.productId) {
      onExisting(product.name);
      return;
    }
    // Продукт из сети уже сохраняли: показать его запись, а не заполнять форму дубликатом.
    const known = product.externalId ? await findByExternalId(product.externalId) : undefined;
    if (known) {
      onExisting(known.name);
      return;
    }
    setFill((f) => ({
      id: (f?.id ?? 0) + 1,
      values: {
        name: product.name,
        kcal: product.kcal,
        protein: product.protein,
        fat: product.fat,
        carbs: product.carbs,
        barcode: product.barcode ?? '',
        // Значения из сети человек ещё не сверил с упаковкой.
        verified: false,
      },
    }));
    setOrigin({
      source: product.source,
      ...(product.externalId ? { externalId: product.externalId } : {}),
      name: product.name,
      ...(product.detail ? { detail: product.detail } : {}),
    });
    setError('');
    setMode('manual');
  }

  function fillBarcode(barcode: string) {
    setFill((f) => ({ id: (f?.id ?? 0) + 1, values: { barcode } }));
    // Код не найден: форма заполняется вручную, прежний источник к ней больше не относится.
    setOrigin(null);
    setMode('manual');
  }

  async function submit(value: ProductFormValue) {
    if (saving.current) return;
    saving.current = true;
    setError('');
    try {
      const added = await addProduct({
        ...value,
        ...(origin ? { source: origin.source } : {}),
        ...(origin?.externalId ? { externalId: origin.externalId } : {}),
      });
      onAdded(added);
    } catch (e) {
      // Окно остаётся открытым: введённые значения не теряются.
      setError(e instanceof Error ? e.message : 'Продукт не добавлен.');
    } finally {
      saving.current = false;
    }
  }

  return (
    <Modal title="Новый продукт" onClose={onClose}>
      <div className="fill-modes" role="group" aria-label="Как заполнить">
        {MODES.map((m) => (
          <button
            key={m.mode}
            type="button"
            className="fill-mode"
            aria-pressed={mode === m.mode}
            onClick={() => setMode(m.mode)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'barcode' ? (
        <BarcodeScanner
          context="Найдите продукт по коду, и форма заполнится сама."
          pickLabel={(p) => (p.productId ? 'Показать в справочнике' : 'Заполнить форму')}
          onPick={(p) => void fillFrom(p)}
          onManual={fillBarcode}
        />
      ) : null}

      {mode === 'web' ? (
        <WebProductSearch initialQuery={initialName} onPick={(p) => void fillFrom(p)} />
      ) : null}

      {/* Форма остаётся в DOM в других режимах: введённые значения не теряются. */}
      <div hidden={mode !== 'manual'}>
        {origin ? (
          <p className="note" role="status">
            Заполнено из {SOURCE_LABELS[origin.source]}: {origin.name}
            {origin.detail ? `, ${origin.detail}` : ''}. Сверьте значения с упаковкой.
          </p>
        ) : null}
        {error ? (
          <p className="warning" role="alert">
            {error}
          </p>
        ) : null}
        <ProductForm
          initial={{ name: initialName }}
          submitLabel="Добавить"
          verifiedField
          {...(fill ? { fill } : {})}
          onCancel={onClose}
          onSubmit={(value) => void submit(value)}
        />
      </div>
    </Modal>
  );
}
