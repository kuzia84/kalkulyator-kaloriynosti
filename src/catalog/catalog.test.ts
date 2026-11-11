import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppDB } from '../storage/db';
import { commitUsage, findByBarcode, InvalidProductError, markUsed, searchLocal } from './catalog';
import { rememberDeletedSeed, syncSeed } from '../storage/db';
import { normalizeName, normalizeQuery } from './normalize';

let db: AppDB;

beforeEach(async () => {
  db = new AppDB(`test-${crypto.randomUUID()}`);
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

describe('normalizeName', () => {
  it('нижний регистр, ё → е, лишние пробелы', () => {
    expect(normalizeName('  Свёкла   Столовая ')).toBe('свекла столовая');
  });

  it('запрос без пробела в конце: клавиатура телефона добавляет его после слова', () => {
    expect(normalizeQuery('  Рис ')).toBe('рис');
  });
});

describe('searchLocal', () => {
  it('справочник заполнен стартовым набором при создании базы', async () => {
    expect(await db.products.count()).toBeGreaterThan(40);
  });

  it('ищет по началу названия без учёта регистра', async () => {
    const names = (await searchLocal('МОЛ', 20, db)).map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(['Молоко 2,5 %', 'Молоко 3,2 %']));
    expect(names.every((n) => n.startsWith('Молоко'))).toBe(true);
  });

  it('«е» и «ё» — одна буква в обе стороны', async () => {
    expect((await searchLocal('свек', 20, db)).map((p) => p.name)).toContain('Свёкла');
    expect((await searchLocal('свёк', 20, db)).map((p) => p.name)).toContain('Свёкла');
    expect((await searchLocal('Горошек зеленый', 20, db)).map((p) => p.name)).toContain(
      'Горошек зелёный',
    );
  });

  it('полное название с пробелом в конце находит продукт', async () => {
    expect((await searchLocal('Картофель ', 20, db)).map((p) => p.name)).toEqual(['Картофель']);
  });

  it('не ищет совпадение в середине названия', async () => {
    expect(await searchLocal('крупа', 20, db)).toEqual([]);
  });

  it('пустой запрос — пустой список', async () => {
    expect(await searchLocal('', 20, db)).toEqual([]);
    expect(await searchLocal('   ', 20, db)).toEqual([]);
  });

  it('сортирует по рангу', async () => {
    const before = await searchLocal('мол', 20, db);
    const last = before[before.length - 1]!;
    await markUsed(last.id, db);
    const after = await searchLocal('мол', 20, db);
    expect(after[0]!.id).toBe(last.id);
  });

  it('ограничивает число результатов', async () => {
    expect((await searchLocal('к', 3, db)).length).toBe(3);
  });
});

describe('commitUsage', () => {
  it('продукт из справочника: ранг +1 и дата использования', async () => {
    const [milk] = await searchLocal('молоко 3', 1, db);
    const id = await commitUsage({ ...milk!, productId: milk!.id }, db, 1000);
    expect(id).toBe(milk!.id);
    const updated = await db.products.get(id);
    expect(updated).toMatchObject({ rank: milk!.rank + 1, lastUsedAt: 1000 });
  });

  it('новый ручной продукт попадает в справочник', async () => {
    const id = await commitUsage(
      { name: 'Соус домашний', kcal: 120, protein: 1, fat: 10, carbs: 6, source: 'user' },
      db,
    );
    const saved = await db.products.get(id);
    expect(saved).toMatchObject({
      name: 'Соус домашний',
      rank: 1,
      source: 'user',
      verified: false,
    });
    expect((await searchLocal('соус', 20, db)).map((p) => p.id)).toContain(id);
  });

  it('повторное использование того же внешнего продукта не создаёт дубликат', async () => {
    const product = {
      name: 'Гречка',
      kcal: 350,
      protein: 12,
      fat: 3.4,
      carbs: 64.2,
      source: 'off' as const,
      barcode: '4601916007082',
      externalId: 'off:4601916007082',
    };
    const first = await commitUsage(product, db);
    const second = await commitUsage(product, db);
    expect(second).toBe(first);
    expect((await db.products.get(first))!.rank).toBe(2);
  });

  it('поиск по штрихкоду', async () => {
    await commitUsage(
      {
        name: 'Йогурт',
        kcal: 60,
        protein: 3,
        fat: 2,
        carbs: 7,
        source: 'user',
        barcode: '4 600000 000017',
      },
      db,
    );
    expect((await findByBarcode('4600000000017', db))?.name).toBe('Йогурт');
    expect(await findByBarcode('123', db)).toBeUndefined();
  });

  it('внешний продукт с тем же штрихкодом, что у ручного, — отдельная запись', async () => {
    const userId = await commitUsage(
      { name: 'Сок', kcal: 10, protein: 0, fat: 0, carbs: 2, source: 'user', barcode: '111' },
      db,
    );
    const offId = await commitUsage(
      {
        name: 'Сок',
        kcal: 46,
        protein: 0.5,
        fat: 0,
        carbs: 10.6,
        source: 'off',
        barcode: '111',
        externalId: 'off:111',
      },
      db,
    );
    expect(offId).not.toBe(userId);
  });

  it('одинаковый externalId у разных источников не путается', async () => {
    const usda = await commitUsage(
      {
        name: 'Apple',
        kcal: 52,
        protein: 0.3,
        fat: 0.2,
        carbs: 13.8,
        source: 'usda',
        externalId: 'x1',
      },
      db,
    );
    const off1 = await commitUsage(
      {
        name: 'Яблоко',
        kcal: 47,
        protein: 0.4,
        fat: 0.4,
        carbs: 9.8,
        source: 'off',
        externalId: 'x1',
      },
      db,
    );
    const off2 = await commitUsage(
      {
        name: 'Яблоко',
        kcal: 47,
        protein: 0.4,
        fat: 0.4,
        carbs: 9.8,
        source: 'off',
        externalId: 'x1',
      },
      db,
    );
    expect(off1).not.toBe(usda);
    expect(off2).toBe(off1);
  });

  it('внешний продукт с названием и значениями как у стартового — отдельная запись', async () => {
    const [potato] = await searchLocal('картофель', 1, db);
    const id = await commitUsage({ ...potato!, source: 'off', externalId: 'off:42' }, db);
    expect(id).not.toBe(potato!.id);
  });

  it('пустое название и NaN не попадают в справочник', async () => {
    const before = await db.products.count();
    await expect(
      commitUsage({ name: '  ', kcal: 1, protein: 0, fat: 0, carbs: 0, source: 'user' }, db),
    ).rejects.toBeInstanceOf(InvalidProductError);
    await expect(
      commitUsage(
        { name: 'X', kcal: Number.NaN, protein: 0, fat: 0, carbs: 0, source: 'user' },
        db,
      ),
    ).rejects.toBeInstanceOf(InvalidProductError);
    expect(await db.products.count()).toBe(before);
  });
});

describe('syncSeed', () => {
  it('новая версия набора правит непроверенные записи и не возвращает удалённые', async () => {
    await db.products.update('sk-014', { kcal: 1, rank: 7 });
    await db.products.update('sk-015', { kcal: 1, verified: true });
    await db.products.delete('sk-016');
    await rememberDeletedSeed(db, 'sk-016');
    await db.meta.update('seed', { version: 0 });
    await syncSeed(db);
    expect(await db.products.get('sk-014')).toMatchObject({ kcal: 77, rank: 7 });
    expect((await db.products.get('sk-015'))!.kcal).toBe(1);
    expect(await db.products.get('sk-016')).toBeUndefined();
  });
});
