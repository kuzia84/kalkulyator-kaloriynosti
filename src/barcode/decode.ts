import { isValidBarcode } from './gtin';

/** Форматы, которые ищет распознавание. */
export const DETECTOR_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const;

interface DetectedBarcode {
  rawValue: string;
  format: string;
}

interface BarcodeDetectorLike {
  detect(source: ImageBitmapSource): Promise<DetectedBarcode[]>;
}

interface BarcodeDetectorCtor {
  new (options?: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

let detectorPromise: Promise<BarcodeDetectorLike | null> | null = null;

/**
 * Встроенный `BarcodeDetector`, если браузер его умеет и знает нужные форматы.
 * В Safari на iPhone и в Firefox его нет — тогда работает ZXing.
 */
export function getNativeDetector(): Promise<BarcodeDetectorLike | null> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const Ctor = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
      if (!Ctor) return null;
      try {
        const supported = (await Ctor.getSupportedFormats?.()) ?? [];
        const formats = DETECTOR_FORMATS.filter((f) => supported.includes(f));
        if (formats.length === 0) return null;
        return new Ctor({ formats: [...formats] });
      } catch {
        return null;
      }
    })();
  }
  return detectorPromise;
}

type ZxingControls = { stop(): void };

type ZxingReader = {
  decodeFromImageUrl(url: string): Promise<{ getText(): string }>;
  decodeFromVideoElement(
    video: HTMLVideoElement,
    callback: (
      result: { getText(): string } | undefined,
      error: unknown,
      controls: ZxingControls,
    ) => void,
  ): Promise<ZxingControls>;
};

let zxingPromise: Promise<ZxingReader> | null = null;

/** ZXing грузится отдельным файлом и только тогда, когда он нужен. */
export function getZxingReader(): Promise<ZxingReader> {
  if (!zxingPromise) {
    zxingPromise = Promise.all([import('@zxing/browser'), import('@zxing/library')]).then(
      ([browser, library]) => {
        const hints = new Map();
        hints.set(library.DecodeHintType.POSSIBLE_FORMATS, [
          library.BarcodeFormat.EAN_13,
          library.BarcodeFormat.EAN_8,
          library.BarcodeFormat.UPC_A,
          library.BarcodeFormat.UPC_E,
        ]);
        hints.set(library.DecodeHintType.TRY_HARDER, true);
        return new browser.BrowserMultiFormatReader(hints) as unknown as ZxingReader;
      },
    );
  }
  return zxingPromise;
}

function firstValid(codes: string[]): string | null {
  return codes.find((c) => isValidBarcode(c)) ?? null;
}

/**
 * Распознаёт штрихкод на фото. Распознавание идёт в браузере, фото не уходит на сервер.
 * Возвращает цифры кода или `null`, если код не найден.
 */
export async function decodeImageFile(file: Blob): Promise<string | null> {
  const detector = await getNativeDetector();
  if (detector) {
    try {
      const bitmap = await createImageBitmap(file);
      try {
        const found = await detector.detect(bitmap);
        const code = firstValid(found.map((b) => b.rawValue));
        if (code) return code;
      } finally {
        bitmap.close();
      }
    } catch {
      // Встроенный детектор не справился — пробуем ZXing.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const reader = await getZxingReader();
    const result = await reader.decodeFromImageUrl(url);
    return firstValid([result.getText()]);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Ищет штрихкод в потоке с камеры, пока не найдёт или пока не вызван `stop`.
 * Возвращает функцию остановки.
 */
export async function scanVideo(
  video: HTMLVideoElement,
  onCode: (code: string) => void,
): Promise<() => void> {
  const detector = await getNativeDetector();
  if (detector) {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (stopped) return;
      try {
        if (video.readyState >= 2) {
          const code = firstValid((await detector.detect(video)).map((b) => b.rawValue));
          if (code && !stopped) {
            stopped = true;
            onCode(code);
            return;
          }
        }
      } catch {
        // Кадр не готов — берём следующий.
      }
      timer = setTimeout(tick, 250);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }
  const reader = await getZxingReader();
  let done = false;
  // ZXing вызывает обработчик первого кадра ещё до того, как вернёт controls,
  // поэтому остановка идёт через третий аргумент обработчика.
  const controls = await reader.decodeFromVideoElement(video, (result, _error, ctrl) => {
    if (done || !result) return;
    const code = firstValid([result.getText()]);
    if (code) {
      done = true;
      ctrl.stop();
      onCode(code);
    }
  });
  return () => {
    done = true;
    controls.stop();
  };
}
