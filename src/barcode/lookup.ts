import { findByBarcode } from '../catalog/catalog';
import { lookupBarcodeExternal } from '../search/externalSearch';
import { suggestionFromExternal, suggestionFromProduct, type Suggestion } from '../search/types';
import type { Settings } from '../storage/schema';
import { barcodeVariants } from './gtin';

export type BarcodeLookup =
  | { status: 'found'; product: Suggestion }
  | { status: 'not-found'; offline: boolean }
  | { status: 'error' };

/**
 * Ищет продукт по штрихкоду: сначала в справочнике на устройстве, потом во внешних источниках.
 * Без сети внешние источники пропускаются.
 */
export async function lookupBarcode(
  code: string,
  settings: Settings,
  online: boolean,
  signal: AbortSignal,
): Promise<BarcodeLookup> {
  const variants = barcodeVariants(code);
  const local = await findByBarcode(variants);
  if (local) return { status: 'found', product: suggestionFromProduct(local) };
  if (!online) return { status: 'not-found', offline: true };
  try {
    const external = await lookupBarcodeExternal(variants, settings, signal);
    if (external) return { status: 'found', product: suggestionFromExternal(external) };
    return { status: 'not-found', offline: false };
  } catch (error) {
    if (signal.aborted) throw error;
    return { status: 'error' };
  }
}
