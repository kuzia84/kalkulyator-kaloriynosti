import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppDB, syncSeed } from '../storage/db';
import { commitUsage } from './catalog';
import {
  addProduct,
  deleteProduct,
  filterProducts,
  restoreProducts,
  updateProduct,
  type ProductFilter,
} from './moderation';

let db: AppDB;

beforeEach(async () => {
  db = new AppDB(`mod-${crypto.randomUUID()}`);
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

const ALL: ProductFilter = { query: '', source: 'all', verified: 'all', suspiciousOnly: false };

describe('модерация', () => {
  it('правка записи и признак «проверено»', async () => {
    const p = await updateProduct('sk-014', { name: 'Картофель молодой', verified: true }, db);
    expect(p).toMatchObject({
      name: 'Картофель молодой',
      nameNorm: 'картофель молодой',
      verified: true,
    });
  });

  it('правка с NaN отклоняется', async () => {
    await expect(updateProduct('sk-014', { kcal: Number.NaN }, db)).rejects.toThrow();
    expect((await db.products.get('sk-014'))!.kcal).toBe(77);
  });

  it('удаление и отмена', async () => {
    const removed = await deleteProduct('sk-014', db);
    expect(await db.products.get('sk-014')).toBeUndefined();
    await restoreProducts([removed!], db);
    expect(await db.products.get('sk-014')).toMatchObject({ name: 'Картофель' });
  });

  it('отменённое удаление записи набора не мешает обновлению набора', async () => {
    const removed = await deleteProduct('sk-014', db);
    await restoreProducts([removed!], db);
    await db.meta.update('seed', { version: 0 });
    await db.products.update('sk-014', { kcal: 1 });
    await syncSeed(db);
    expect((await db.products.get('sk-014'))!.kcal).toBe(77);
  });

  it('фильтры: поиск внутри названия, источник, подозрительные', async () => {
    await commitUsage(
      { name: 'Странный продукт', kcal: 500, protein: 1, fat: 1, carbs: 1, source: 'user' },
      db,
    );
    const all = await db.products.toArray();
    const byQuery = filterProducts(all, { ...ALL, query: 'крупа' }, { key: 'name', dir: 'asc' });
    expect(byQuery.length).toBeGreaterThan(3);
    const users = filterProducts(all, { ...ALL, source: 'user' }, { key: 'name', dir: 'asc' });
    expect(users.map((p) => p.name)).toEqual(['Странный продукт']);
    const suspicious = filterProducts(
      all,
      { ...ALL, suspiciousOnly: true },
      { key: 'name', dir: 'asc' },
    );
    expect(suspicious.map((p) => p.name)).toEqual(['Странный продукт']);
  });

  it('сортировка по ккал по убыванию', async () => {
    const all = await db.products.toArray();
    const sorted = filterProducts(all, ALL, { key: 'kcal', dir: 'desc' });
    expect(sorted[0]!.name).toBe('Масло подсолнечное');
  });

  it('запись с псевдонимом принимает внешний продукт и старый id', async () => {
    const offProduct = {
      name: 'Творог 5%',
      kcal: 121,
      protein: 17.2,
      fat: 5,
      carbs: 1.8,
      source: 'off' as const,
      externalId: 'off:777',
    };
    const dup = await commitUsage(offProduct, db);
    // Так выглядят записи, которые объединили в прошлых версиях.
    await db.products.delete(dup);
    await db.products.update('sk-037', { aliases: [dup, 'off:777'] });
    const again = await commitUsage(offProduct, db);
    expect(again).toBe('sk-037');
    // Строка блюда со старым id тоже попадает в цель.
    expect(await commitUsage({ ...offProduct, productId: dup }, db)).toBe('sk-037');
  });

  it('удалённая запись не возвращается из блюда', async () => {
    await deleteProduct('sk-014', db);
    const id = await commitUsage(
      {
        name: 'Картофель',
        kcal: 77,
        protein: 2,
        fat: 0.4,
        carbs: 16.3,
        source: 'skurikhin',
        productId: 'sk-014',
      },
      db,
    );
    expect(id).toBe('sk-014');
    expect(await db.products.where('nameNorm').equals('картофель').count()).toBe(0);
  });

  it('правка модератора не теряется при обновлении стартового набора', async () => {
    await updateProduct('sk-014', { kcal: 80 }, db);
    await db.meta.update('seed', { version: 0 });
    await syncSeed(db);
    expect((await db.products.get('sk-014'))!.kcal).toBe(80);
  });

  it('штрихкод чужой записи не принимается', async () => {
    await updateProduct('sk-014', { barcode: '4601916007082' }, db);
    await expect(updateProduct('sk-015', { barcode: '4601916007082' }, db)).rejects.toThrow(
      /уже есть у «Картофель»/,
    );
  });

  it('поиск по штрихкоду с пробелами', async () => {
    await updateProduct('sk-014', { barcode: '4601916007082' }, db);
    const all = await db.products.toArray();
    expect(
      filterProducts(all, { ...ALL, query: '4601 916 007082' }, { key: 'name', dir: 'asc' }).map(
        (p) => p.id,
      ),
    ).toEqual(['sk-014']);
  });

  it('добавление продукта вручную', async () => {
    const p = await addProduct(
      { name: '  Сыр   адыгейский ', kcal: 240, protein: 18.5, fat: 16, carbs: 0, verified: true },
      db,
      500,
    );
    expect(p).toMatchObject({
      name: 'Сыр адыгейский',
      source: 'user',
      verified: true,
      rank: 0,
      editedAt: 500,
    });
    expect(await db.products.get(p.id)).toEqual(p);
    const all = await db.products.toArray();
    expect(
      filterProducts(all, { ...ALL, query: 'адыгей' }, { key: 'name', dir: 'asc' }).map(
        (x) => x.id,
      ),
    ).toEqual([p.id]);
  });

  it('добавление без отметки «проверено» и со штрихкодом', async () => {
    const p = await addProduct(
      { name: 'Кефир', kcal: 51, protein: 2.8, fat: 3.2, carbs: 4.1, barcode: '4601 916 007082' },
      db,
    );
    expect(p).toMatchObject({ verified: false, barcode: '4601916007082' });
  });

  it('добавление со штрихкодом чужой записи отклоняется', async () => {
    await updateProduct('sk-014', { barcode: '4601916007082' }, db);
    await expect(
      addProduct(
        { name: 'Кефир', kcal: 51, protein: 2.8, fat: 3.2, carbs: 4.1, barcode: '4601916007082' },
        db,
      ),
    ).rejects.toThrow(/уже есть у «Картофель»/);
    expect(await db.products.where('nameNorm').equals('кефир').count()).toBe(0);
  });

  it('добавление с пустым названием отклоняется', async () => {
    await expect(
      addProduct({ name: '  ', kcal: 1, protein: 0, fat: 0, carbs: 0 }, db),
    ).rejects.toThrow(/не может быть пустым/);
  });

  it('добавление из внешнего источника сохраняет источник и не повторяется', async () => {
    const input = {
      name: 'Творог 5%',
      kcal: 121,
      protein: 17.2,
      fat: 5,
      carbs: 1.8,
      source: 'off' as const,
      externalId: 'off:4601916007082',
    };
    const p = await addProduct(input, db);
    expect(p).toMatchObject({ source: 'off', externalId: 'off:4601916007082' });
    await expect(addProduct(input, db)).rejects.toThrow(/уже есть в справочнике: «Творог 5%»/);
    // Тот же продукт из поиска в блюде попадает в эту запись, а не в новую.
    expect(await commitUsage(input, db)).toBe(p.id);
  });
});
