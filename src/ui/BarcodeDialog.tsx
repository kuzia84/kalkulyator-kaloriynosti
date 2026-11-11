import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSettings } from '../app/settingsContext';
import { useOnline } from '../app/useOnline';
import { decodeImageFile, scanVideo } from '../barcode/decode';
import { isValidBarcode } from '../barcode/gtin';
import { lookupBarcode } from '../barcode/lookup';
import { formatNutrient } from '../calc';
import { normalizeBarcode } from '../catalog/normalize';
import type { Suggestion } from '../search/types';
import { SOURCE_LABELS } from '../storage/schema';
import { Modal } from './Modal';

export interface BarcodeDialogProps {
  rowLabel: string;
  onPick: (product: Suggestion) => void;
  /** Продукт не найден: открыть ручной ввод с этим кодом. */
  onManual: (barcode: string) => void;
  onClose: () => void;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'camera' }
  | { kind: 'decoding' }
  | { kind: 'searching'; code: string }
  | { kind: 'found'; code: string; product: Suggestion }
  | { kind: 'not-found'; code: string; offline: boolean }
  | { kind: 'lookup-error'; code: string }
  | { kind: 'unreadable' }
  | { kind: 'camera-error'; message: string };

const UNREADABLE =
  'Не удалось распознать штрихкод. Сделайте новое фото: код целиком в кадре, ровно и при хорошем свете. Или введите цифры под штрихкодом вручную.';

export function BarcodeDialog({ rowLabel, onPick, onManual, onClose }: BarcodeDialogProps) {
  const { settings } = useSettings();
  const online = useOnline();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [manualCode, setManualCode] = useState('');
  const [manualError, setManualError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const lookupAbort = useRef<AbortController | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  function stopCamera() {
    stopRef.current?.();
    stopRef.current = null;
    const video = videoRef.current;
    const stream = video?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (video) video.srcObject = null;
  }

  useEffect(
    () => () => {
      stopCamera();
      lookupAbort.current?.abort();
    },
    [],
  );

  async function search(code: string) {
    stopCamera();
    lookupAbort.current?.abort();
    const controller = new AbortController();
    lookupAbort.current = controller;
    setPhase({ kind: 'searching', code });
    try {
      const result = await lookupBarcode(code, settings, online, controller.signal);
      if (controller.signal.aborted) return;
      if (result.status === 'found') setPhase({ kind: 'found', code, product: result.product });
      else if (result.status === 'not-found')
        setPhase({ kind: 'not-found', code, offline: result.offline });
      else setPhase({ kind: 'lookup-error', code });
    } catch {
      // Окно закрыли или начали новый поиск.
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    stopCamera();
    setPhase({ kind: 'decoding' });
    const code = await decodeImageFile(file);
    if (code) void search(code);
    else setPhase({ kind: 'unreadable' });
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setPhase({
        kind: 'camera-error',
        message: 'Браузер не даёт доступ к камере. Сфотографируйте штрихкод кнопкой «Снять фото».',
      });
      return;
    }
    setPhase({ kind: 'camera' });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      video.srcObject = stream;
      await video.play();
      stopRef.current = await scanVideo(video, (code) => void search(code));
    } catch {
      stopCamera();
      setPhase({
        kind: 'camera-error',
        message:
          'Камера недоступна. Разрешите доступ к камере в настройках браузера или загрузите фото.',
      });
    }
  }

  function submitManual(e: FormEvent) {
    e.preventDefault();
    const code = normalizeBarcode(manualCode);
    if (!isValidBarcode(code)) {
      setManualError('Проверьте цифры: нужен код из 8, 12 или 13 цифр с верной последней цифрой.');
      return;
    }
    setManualError('');
    void search(code);
  }

  return (
    <Modal
      title="Поиск по штрихкоду"
      onClose={() => {
        stopCamera();
        onClose();
      }}
    >
      <p className="hint">
        {rowLabel}. Штрихкод распознаётся на устройстве, фото никуда не отправляется.
      </p>
      <div className="barcode-actions">
        <button type="button" className="button" onClick={() => cameraInput.current?.click()}>
          Снять фото
        </button>
        <button type="button" className="button" onClick={() => galleryInput.current?.click()}>
          Фото из галереи
        </button>
        <button
          type="button"
          className="button"
          onClick={() => (phase.kind === 'camera' ? stopCamera() : void startCamera())}
        >
          {phase.kind === 'camera' ? 'Остановить камеру' : 'Сканировать камерой'}
        </button>
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <input
          ref={galleryInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>

      <video
        ref={videoRef}
        className="barcode-video"
        hidden={phase.kind !== 'camera'}
        muted
        playsInline
        aria-label="Изображение с камеры"
      />

      <div role="status" aria-live="polite" className="barcode-status">
        {phase.kind === 'camera' ? <p className="hint">Наведите камеру на штрихкод.</p> : null}
        {phase.kind === 'decoding' ? <p className="hint">Распознаём штрихкод…</p> : null}
        {phase.kind === 'searching' ? (
          <p className="hint">Ищем продукт с кодом {phase.code}…</p>
        ) : null}
        {phase.kind === 'unreadable' ? <p className="warning">{UNREADABLE}</p> : null}
        {phase.kind === 'camera-error' ? <p className="warning">{phase.message}</p> : null}
        {phase.kind === 'lookup-error' ? (
          <p className="warning">
            Код {phase.code} распознан, но внешние источники не ответили. Попробуйте позже или
            введите продукт вручную.
          </p>
        ) : null}
        {phase.kind === 'not-found' ? (
          <p className="note">
            Продукт с кодом {phase.code} не найден
            {phase.offline ? ' в справочнике. Без интернета внешние источники недоступны.' : '.'}
          </p>
        ) : null}
        {phase.kind === 'found' ? (
          <div className="barcode-found">
            <p>
              <strong>{phase.product.name}</strong>
              {phase.product.detail ? ` · ${phase.product.detail}` : ''}
            </p>
            <p className="hint">
              На 100 г: {formatNutrient('kcal', phase.product.kcal)} ккал, белки{' '}
              {formatNutrient('protein', phase.product.protein)} г, жиры{' '}
              {formatNutrient('fat', phase.product.fat)} г, углеводы{' '}
              {formatNutrient('carbs', phase.product.carbs)} г. Источник:{' '}
              {SOURCE_LABELS[phase.product.source]}.
            </p>
            <button
              type="button"
              className="button button-primary"
              onClick={() => onPick(phase.product)}
            >
              Добавить в таблицу
            </button>
          </div>
        ) : null}
      </div>

      {phase.kind === 'not-found' || phase.kind === 'lookup-error' ? (
        <button type="button" className="button" onClick={() => onManual(phase.code)}>
          Ввести продукт вручную
        </button>
      ) : null}

      <form className="field barcode-manual" onSubmit={submitManual} noValidate>
        <label htmlFor="barcode-manual-input">Или введите цифры кода</label>
        <div className="inline-fields">
          <input
            id="barcode-manual-input"
            className="input"
            inputMode="numeric"
            autoComplete="off"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value.replace(/[^\d\s]/g, ''))}
            aria-invalid={!!manualError}
            aria-describedby={manualError ? 'barcode-manual-error' : undefined}
          />
          <button type="submit" className="button button-primary">
            Найти
          </button>
        </div>
        {manualError ? (
          <span id="barcode-manual-error" className="field-error">
            {manualError}
          </span>
        ) : null}
      </form>
    </Modal>
  );
}
