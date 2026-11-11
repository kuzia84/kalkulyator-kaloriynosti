import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
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

export interface BarcodeScannerProps {
  /** Первое предложение подсказки: для чего ищется код. */
  context: string;
  /** Подпись кнопки под найденным продуктом. Может зависеть от продукта. */
  pickLabel: string | ((product: Suggestion) => string);
  onPick: (product: Suggestion) => void;
  /** Продукт не найден: перейти к ручному вводу с этим кодом. */
  onManual: (barcode: string) => void;
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

/** Окно поиска по штрихкоду для строки блюда. */
export function BarcodeDialog({ rowLabel, onPick, onManual, onClose }: BarcodeDialogProps) {
  return (
    <Modal title="Поиск по штрихкоду" onClose={onClose}>
      <BarcodeScanner
        context={`${rowLabel}.`}
        pickLabel="Добавить в таблицу"
        onPick={onPick}
        onManual={onManual}
      />
    </Modal>
  );
}

/**
 * Поиск продукта по штрихкоду: фото, камера или цифры вручную.
 * Сначала справочник на устройстве, потом внешние источники. Без окна: его даёт вызывающий.
 */
export function BarcodeScanner({ context, pickLabel, onPick, onManual }: BarcodeScannerProps) {
  const { settings } = useSettings();
  const online = useOnline();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [manualCode, setManualCode] = useState('');
  const [manualError, setManualError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const lookupAbort = useRef<AbortController | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  // Свежие настройки и состояние сети для поиска, запущенного из камеры или после распознавания.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const onlineRef = useRef(online);
  onlineRef.current = online;
  const alive = useRef(true);
  // Номер последнего действия: результат устаревшего распознавания фото отбрасывается.
  const actionId = useRef(0);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      lookupAbort.current?.abort();
    };
  }, []);

  const search = useCallback(async (code: string) => {
    if (!alive.current) return;
    actionId.current += 1;
    lookupAbort.current?.abort();
    const controller = new AbortController();
    lookupAbort.current = controller;
    // Смена фазы останавливает камеру (см. эффект ниже).
    setPhase({ kind: 'searching', code });
    try {
      const result = await lookupBarcode(
        code,
        settingsRef.current,
        onlineRef.current,
        controller.signal,
      );
      if (controller.signal.aborted || !alive.current) return;
      if (result.status === 'found') setPhase({ kind: 'found', code, product: result.product });
      else if (result.status === 'not-found')
        setPhase({ kind: 'not-found', code, offline: result.offline });
      else setPhase({ kind: 'lookup-error', code });
    } catch {
      // Окно закрыли или начали новый поиск.
    }
  }, []);

  // Камера живёт ровно столько, сколько фаза «camera». Любая другая фаза и закрытие окна
  // останавливают поток и сканирование, в том числе если они ещё не успели запуститься.
  const cameraOn = phase.kind === 'camera';
  useEffect(() => {
    if (!cameraOn) return;
    const video = videoRef.current;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let stopScan: (() => void) | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled || !video) return;
        video.srcObject = stream;
        await video.play();
        if (cancelled) return;
        const stop = await scanVideo(video, (code) => {
          if (!cancelled) void search(code);
        });
        if (cancelled) stop();
        else stopScan = stop;
      } catch {
        if (!cancelled) {
          setPhase({
            kind: 'camera-error',
            message:
              'Камера недоступна. Разрешите доступ к камере в настройках браузера или загрузите фото.',
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      stopScan?.();
      stream?.getTracks().forEach((t) => t.stop());
      if (video) video.srcObject = null;
    };
  }, [cameraOn, search]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    actionId.current += 1;
    const id = actionId.current;
    lookupAbort.current?.abort();
    setPhase({ kind: 'decoding' });
    const code = await decodeImageFile(file);
    if (!alive.current || id !== actionId.current) return;
    if (code) void search(code);
    else setPhase({ kind: 'unreadable' });
  }

  function toggleCamera() {
    if (cameraOn) {
      setPhase({ kind: 'idle' });
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setPhase({
        kind: 'camera-error',
        message: 'Браузер не даёт доступ к камере. Сфотографируйте штрихкод кнопкой «Снять фото».',
      });
      return;
    }
    actionId.current += 1;
    lookupAbort.current?.abort();
    setPhase({ kind: 'camera' });
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
    <>
      <p className="hint">
        {context} Штрихкод распознаётся на устройстве, фото никуда не отправляется.
      </p>
      <div className="barcode-actions">
        <button type="button" className="button" onClick={() => cameraInput.current?.click()}>
          Снять фото
        </button>
        <button type="button" className="button" onClick={() => galleryInput.current?.click()}>
          Фото из галереи
        </button>
        <button type="button" className="button" onClick={toggleCamera}>
          {cameraOn ? 'Остановить камеру' : 'Сканировать камерой'}
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
              {typeof pickLabel === 'function' ? pickLabel(phase.product) : pickLabel}
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
    </>
  );
}
