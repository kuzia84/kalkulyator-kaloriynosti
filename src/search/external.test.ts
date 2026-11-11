import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../storage/schema';
import { resetDb } from '../test/db';
import { mapOffProduct, mapUsdaFood, RateLimiter } from './external';
import { activeSources, lookupBarcodeExternal, searchExternal } from './externalSearch';

beforeEach(resetDb);

const settings = (patch: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...patch });

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const offHit = {
  code: '4601916007082',
  product_name_ru: 'Гречка',
  brands: 'Мистраль',
  quantity: '900 г',
  nutriments: {
    'energy-kcal_100g': 351,
    proteins_100g: 12,
    fat_100g: 3.4,
    carbohydrates_100g: 64.2,
  },
};

describe('mapOffProduct', () => {
  it('берёт русское название, ккал и БЖУ на 100 г', () => {
    expect(mapOffProduct(offHit)).toEqual({
      source: 'off',
      externalId: 'off:4601916007082',
      name: 'Гречка',
      barcode: '4601916007082',
      kcal: 351,
      protein: 12,
      fat: 3.4,
      carbs: 64.2,
      detail: 'Мистраль, 900 г',
    });
  });

  it('пересчитывает кДж в ккал, если ккал нет', () => {
    const p = mapOffProduct({
      ...offHit,
      nutriments: { ...offHit.nutriments, 'energy-kcal_100g': undefined, 'energy-kj_100g': 418.4 },
    });
    expect(p?.kcal).toBe(100);
  });

  it('без БЖУ или названия — не продукт', () => {
    expect(mapOffProduct({ ...offHit, nutriments: { 'energy-kcal_100g': 10 } })).toBeNull();
    expect(mapOffProduct({ ...offHit, product_name_ru: '', product_name: '' })).toBeNull();
  });
});

describe('mapUsdaFood', () => {
  const food = {
    fdcId: 173904,
    description: 'Buckwheat',
    dataType: 'SR Legacy',
    foodNutrients: [
      { nutrientNumber: '203', unitName: 'G', value: 13.25 },
      { nutrientNumber: '204', unitName: 'G', value: 3.4 },
      { nutrientNumber: '205', unitName: 'G', value: 71.5 },
      { nutrientNumber: '208', unitName: 'KCAL', value: 343 },
    ],
  };

  it('читает нутриенты по номерам 208, 203, 204, 205', () => {
    expect(mapUsdaFood(food)).toMatchObject({
      externalId: 'usda:173904',
      name: 'Buckwheat',
      kcal: 343,
      protein: 13.25,
      fat: 3.4,
      carbs: 71.5,
    });
  });

  it('берёт энергию по Атуотеру (958), если нет 208', () => {
    const f = {
      ...food,
      foodNutrients: [
        ...food.foodNutrients.filter((n) => n.nutrientNumber !== '208'),
        { nutrientNumber: '958', unitName: 'KCAL', value: 340 },
        { nutrientNumber: '268', unitName: 'KJ', value: 1400 },
      ],
    };
    expect(mapUsdaFood(f)?.kcal).toBe(340);
  });
});

describe('RateLimiter', () => {
  it('не больше N запросов в окне', () => {
    const l = new RateLimiter(2, 1000);
    expect(l.tryTake(0)).toBe(true);
    expect(l.tryTake(10)).toBe(true);
    expect(l.tryTake(20)).toBe(false);
    expect(l.tryTake(1001)).toBe(true);
  });
});

describe('searchExternal', () => {
  it('USDA без ключа не участвует', () => {
    expect(activeSources(settings())).toEqual(['off']);
    expect(activeSources(settings({ usdaApiKey: 'k', sourcesOrder: ['usda', 'off'] }))).toEqual([
      'usda',
      'off',
    ]);
  });

  it('короткий запрос не идёт в сеть', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const r = await searchExternal('гр', settings(), new AbortController().signal, { fetchImpl });
    expect(r.products).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('ошибка сети отмечает источник, но не бросает исключение', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));
    const r = await searchExternal('гречка', settings(), new AbortController().signal, {
      fetchImpl,
    });
    expect(r).toEqual({ products: [], failed: ['off'] });
  });

  it('второй такой же запрос берётся из кэша', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ products: [offHit] }));
    const signal = new AbortController().signal;
    const first = await searchExternal('Гречка', settings(), signal, { fetchImpl });
    const second = await searchExternal('гречка ', settings(), signal, { fetchImpl });
    expect(first.products).toHaveLength(1);
    expect(second.products).toEqual(first.products);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('отменённый запрос бросает AbortError', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    const promise = searchExternal('молоко', settings(), controller.signal, { fetchImpl });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('lookupBarcodeExternal', () => {
  it('OFF: 404 — продукта нет', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ status: 0 }, 404));
    expect(
      await lookupBarcodeExternal(
        '4600000000000',
        settings(),
        new AbortController().signal,
        fetchImpl,
      ),
    ).toBeNull();
  });

  it('OFF: продукт по коду', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ status: 1, product: offHit }));
    const p = await lookupBarcodeExternal(
      '4601916007082',
      settings(),
      new AbortController().signal,
      fetchImpl,
    );
    expect(p?.name).toBe('Гречка');
  });

  it('все источники недоступны — ошибка', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(
      lookupBarcodeExternal('4601916007082', settings(), new AbortController().signal, fetchImpl),
    ).rejects.toThrow();
  });
});
