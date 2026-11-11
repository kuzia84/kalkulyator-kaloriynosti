import { normalizeBarcode } from '../catalog/normalize';

/** Контрольная цифра GTIN (EAN-13, EAN-8, UPC-A): веса 3 и 1 справа налево. */
export function gtinCheckDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i += 1) {
    const digit = Number(body[body.length - 1 - i]);
    sum += i % 2 === 0 ? digit * 3 : digit;
  }
  return (10 - (sum % 10)) % 10;
}

function hasValidGtinCheck(code: string): boolean {
  return gtinCheckDigit(code.slice(0, -1)) === Number(code[code.length - 1]);
}

/** Разворачивает UPC-E (8 цифр) в UPC-A (12 цифр) по правилам GS1. */
export function expandUpcE(code: string): string | null {
  if (!/^[01]\d{7}$/.test(code)) return null;
  const ns = code[0]!;
  const d = code.slice(1, 7);
  const check = code[7]!;
  const last = Number(d[5]);
  let manufacturer: string;
  let product: string;
  if (last <= 2) {
    manufacturer = `${d[0]}${d[1]}${d[5]}00`;
    product = `00${d[2]}${d[3]}${d[4]}`;
  } else if (last === 3) {
    manufacturer = `${d[0]}${d[1]}${d[2]}00`;
    product = `000${d[3]}${d[4]}`;
  } else if (last === 4) {
    manufacturer = `${d[0]}${d[1]}${d[2]}${d[3]}0`;
    product = `0000${d[4]}`;
  } else {
    manufacturer = `${d[0]}${d[1]}${d[2]}${d[3]}${d[4]}`;
    product = `0000${d[5]}`;
  }
  return `${ns}${manufacturer}${product}${check}`;
}

export type BarcodeKind = 'ean13' | 'ean8' | 'upca' | 'upce';

/**
 * Проверяет штрихкод по длине и контрольной цифре.
 * 8 цифр — EAN-8 или UPC-E: подходит любой из двух форматов с верной контрольной цифрой.
 */
export function barcodeKind(input: string): BarcodeKind | null {
  const code = normalizeBarcode(input);
  if (code.length === 13 && hasValidGtinCheck(code)) return 'ean13';
  if (code.length === 12 && hasValidGtinCheck(code)) return 'upca';
  if (code.length === 8) {
    if (hasValidGtinCheck(code)) return 'ean8';
    const upca = expandUpcE(code);
    if (upca && hasValidGtinCheck(upca)) return 'upce';
  }
  return null;
}

export function isValidBarcode(input: string): boolean {
  return barcodeKind(input) != null;
}

/**
 * Варианты записи одного кода для поиска: UPC-A и тот же код как EAN-13 с нулём впереди,
 * UPC-E и его развёрнутая форма. В базах один товар встречается в разных записях.
 */
export function barcodeVariants(input: string): string[] {
  const code = normalizeBarcode(input);
  const variants = new Set<string>([code]);
  const kind = barcodeKind(code);
  if (kind === 'upca') variants.add(`0${code}`);
  if (kind === 'ean13' && code.startsWith('0')) variants.add(code.slice(1));
  // Код, верный как EAN-8, считается EAN-8: его развёртка как UPC-E дала бы чужой товар.
  if (kind === 'upce') {
    const upca = expandUpcE(code);
    if (upca && hasValidGtinCheck(upca)) {
      variants.add(upca);
      variants.add(`0${upca}`);
    }
  }
  return [...variants];
}
