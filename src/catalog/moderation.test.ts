import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppDB, syncSeed } from '../storage/db';
import { commitUsage, markUsed } from './catalog';
import {
  deleteProduct,
  filterProducts,
  mergeProducts,
  restoreProducts,
  unmergeProducts,
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
    // После объединения цель снова использовали: отмена вычитает только добавленное.
    await markUsed(a, db, 300);
    await unmergeProducts(result, db);
    expect(await db.products.get(a)).toMatchObject({ rank: 2, lastUsedAt: 300 });
    expect((await db.products.get(a))!.barcode).toBeUndefined();
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

  it('объединённый внешний продукт не создаётся снова', async () => {
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
    await mergeProducts('sk-037', ['sk-037', dup], db);
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

  it('объединение переносит «проверено» от дубликата', async () => {
    await updateProduct('sk-034', { verified: true }, db);
    const r = await mergeProducts('sk-035', ['sk-034'], db);
    expect(r.target.verified).toBe(true);
  });
});
