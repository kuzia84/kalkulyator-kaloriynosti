import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppDB, syncSeed } from '../storage/db';
import { commitUsage } from './catalog';
import {
  deleteProduct,
  filterProducts,
  mergeProducts,
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

  it('объединение: ранги складываются, дубликаты удаляются, отмена возвращает всё', async () => {
    const a = await commitUsage(
      { name: 'Творог', kcal: 121, protein: 17.2, fat: 5, carbs: 1.8, source: 'user' },
      db,
      100,
    );
    const b = await commitUsage(
      {
        name: 'Творог 5%',
        kcal: 121,
        protein: 17.2,
        fat: 5,
        carbs: 1.8,
        source: 'off',
        barcode: '4601916007082',
        externalId: 'off:1',
      },
      db,
      200,
    );
    const result = await mergeProducts(a, [a, b], db);
    expect(result.target).toMatchObject({
      id: a,
      rank: 2,
      lastUsedAt: 200,
      barcode: '4601916007082',
    });
    expect(await db.products.get(b)).toBeUndefined();
    await restoreProducts([result.targetBefore, ...result.removed], db);
    expect((await db.products.get(a))!.rank).toBe(1);
    expect(await db.products.get(b)).toBeDefined();
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
});
