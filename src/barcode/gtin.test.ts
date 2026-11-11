import { describe, expect, it } from 'vitest';
import { barcodeKind, barcodeVariants, expandUpcE, gtinCheckDigit, isValidBarcode } from './gtin';

describe('штрихкоды', () => {
  it('контрольная цифра EAN-13', () => {
    expect(gtinCheckDigit('460191600708')).toBe(2);
    expect(isValidBarcode('4601916007082')).toBe(true);
    expect(isValidBarcode('4601916007083')).toBe(false);
  });

  it('форматы по длине', () => {
    expect(barcodeKind('4601916007082')).toBe('ean13');
    expect(barcodeKind('96385074')).toBe('ean8');
    expect(barcodeKind('036000291452')).toBe('upca');
    expect(barcodeKind('04252614')).toBe('upce');
    expect(barcodeKind('123')).toBeNull();
  });

  it('UPC-E разворачивается в UPC-A', () => {
    expect(expandUpcE('01234565')).toBe('012345000065');
    expect(expandUpcE('04252614')).toBe('042100005264');
    expect(expandUpcE('92345678')).toBeNull();
  });

  it('варианты кода для поиска', () => {
    expect(barcodeVariants('036000291452')).toEqual(['036000291452', '0036000291452']);
    expect(barcodeVariants('0036000291452')).toEqual(['0036000291452', '036000291452']);
    expect(barcodeVariants('04252614')).toEqual(['04252614', '042100005264', '0042100005264']);
    // Код верен и как EAN-8, и как UPC-E: считается EAN-8, развёртки нет.
    expect(barcodeVariants('01234565')).toEqual(['01234565']);
  });

  it('пробелы и дефисы не мешают', () => {
    expect(isValidBarcode('4 601916 007082')).toBe(true);
  });
});
