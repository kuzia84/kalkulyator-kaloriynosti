import { beforeEach, describe, expect, it } from 'vitest';
import { dishToCsv } from '../dish/csv';
import { dishReducer, initialDishState, pickAction, type DishState } from '../dish/state';
import { resetDb } from '../test/db';
import { db } from './db';
import { BackupError, exportBackup, importBackup } from './backup';
import { deleteRecipe, listRecipes, recipeToState, restoreRecipe, saveRecipe } from './recipes';

beforeEach(resetDb);

function sampleDish(): DishState {
  let s = dishReducer(initialDishState(), { type: 'addRow' });
  const [a, b] = s.rows;
  s = dishReducer(
    s,
    pickAction(a!.id, { name: 'А', kcal: 150, protein: 10, fat: 5, carbs: 15, source: 'user' }),
  );
  s = dishReducer(s, { type: 'setWeight', rowId: a!.id, weight: '200' });
  s = dishReducer(
    s,
    pickAction(b!.id, {
      name: 'Б; "особый"',
      kcal: 200,
      protein: 0,
      fat: 0,
      carbs: 50,
      source: 'user',
    }),
  );
  s = dishReducer(s, { type: 'setWeight', rowId: b!.id, weight: '300' });
  s = dishReducer(s, { type: 'setCookedWeight', value: '400' });
  s = dishReducer(s, { type: 'setDishName', value: 'Контрольное блюдо' });
  s = dishReducer(s, { type: 'setNote', value: 'на 4 порции' });
  return s;
}

describe('рецепты', () => {
  it('сохраняет блюдо без пустых строк и обновляет его по recipeId', async () => {
    const state = sampleDish();
    const id = await saveRecipe(state, db, 1000);
    const [saved] = await listRecipes();
    expect(saved).toMatchObject({
      id,
      name: 'Контрольное блюдо',
      cookedWeight: '400',
      note: 'на 4 порции',
    });
    expect(saved!.rows).toHaveLength(2);

    const again = await saveRecipe({ ...state, recipeId: id, name: 'Новое имя' }, db, 2000);
    expect(again).toBe(id);
    const list = await listRecipes();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: 'Новое имя', createdAt: 1000, updatedAt: 2000 });
  });

  it('удаление и возврат', async () => {
    const id = await saveRecipe(sampleDish());
    const removed = await deleteRecipe(id);
    expect(await listRecipes()).toHaveLength(0);
    await restoreRecipe(removed!);
    expect(await listRecipes()).toHaveLength(1);
  });

  it('открытый рецепт — его строки без добавленных пустых, связь с рецептом сохраняется', async () => {
    const id = await saveRecipe(sampleDish());
    const state = recipeToState((await listRecipes())[0]!);
    expect(state.rows).toHaveLength(2);
    expect(state.recipeId).toBe(id);
    expect(state.rows[0]!.name).toBe('А');
  });
});

describe('CSV', () => {
  it('строки, итоги, на 100 г, уварка; запятая и кавычки', () => {
    const csv = dishToCsv(sampleDish());
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.slice(1).trim().split('\r\n');
    expect(lines[0]).toBe('Контрольное блюдо');
    expect(lines[2]).toBe('А;200;300;20,0;10,0;30,0');
    expect(lines[3]).toBe('"Б; ""особый""";300;600;0,0;0,0;150,0');
    expect(lines[4]).toBe('Итого;500;900;20,0;10,0;180,0');
    expect(lines[5]).toBe('На 100 г блюда;100;180;4,0;2,0;36,0');
    expect(lines[6]).toBe('На 100 г готового блюда (с учётом уварки);400;225;5,0;2,5;45,0');
  });
});

describe('экспорт и импорт JSON', () => {
  it('файл переносит рецепты и продукты на другое устройство', async () => {
    await saveRecipe(sampleDish());
    await db.products.update('sk-014', { rank: 5, verified: true });
    const json = JSON.stringify(await exportBackup());

    await resetDb();
    const result = await importBackup(json);
    expect(result.recipes).toBe(1);
    expect(result.products).toBeGreaterThanOrEqual(1);
    expect(await db.products.get('sk-014')).toMatchObject({ rank: 5, verified: true });
    expect((await listRecipes())[0]!.name).toBe('Контрольное блюдо');
  });

  it('файл без ключа USDA: настройки в него не входят', async () => {
    await db.settings.put({
      id: 'app',
      suggestionsLimit: 20,
      sourcesOrder: ['off', 'usda'],
      enabledSources: ['off', 'usda'],
      usdaApiKey: 'secret',
      theme: 'system',
      skin: 'glass',
    });
    expect(JSON.stringify(await exportBackup())).not.toContain('secret');
  });

  it('чужой файл и битые записи', async () => {
    await expect(importBackup('не json')).rejects.toBeInstanceOf(BackupError);
    await expect(importBackup('{"format":"other"}')).rejects.toBeInstanceOf(BackupError);
    const result = await importBackup(
      JSON.stringify({
        format: 'kalkulyator-kaloriynosti',
        version: 1,
        products: [{ id: 'x', name: 'Плохой', kcal: 'abc', protein: 0, fat: 0, carbs: 0 }],
        recipes: [],
      }),
    );
    expect(result).toEqual({ products: 0, recipes: 0, skipped: 1 });
  });

  it('старый рецепт из файла не заменяет более новый на устройстве', async () => {
    const id = await saveRecipe(sampleDish(), db, 5000);
    const json = JSON.stringify(await exportBackup());
    await saveRecipe({ ...sampleDish(), recipeId: id, name: 'Свежее' }, db, 9000);
    await importBackup(json);
    expect((await listRecipes())[0]!.name).toBe('Свежее');
  });

  it('режим «заменить» удаляет рецепты устройства и берёт рецепты из файла', async () => {
    const fromFile = await saveRecipe({ ...sampleDish(), name: 'Из облака' }, db, 1000);
    const json = JSON.stringify(await exportBackup());
    await deleteRecipe(fromFile);
    await saveRecipe({ ...sampleDish(), name: 'Только здесь' }, db, 9000);

    const result = await importBackup(json, db, { mode: 'replace' });
    expect(result.recipes).toBe(1);
    expect((await listRecipes()).map((r) => r.name)).toEqual(['Из облака']);
  });

  it('режим «заменить»: рецепт из файла берётся, даже если на устройстве он новее', async () => {
    const id = await saveRecipe({ ...sampleDish(), name: 'Старое' }, db, 1000);
    const json = JSON.stringify(await exportBackup());
    await saveRecipe({ ...sampleDish(), recipeId: id, name: 'Новое' }, db, 9000);
    await importBackup(json, db, { mode: 'replace' });
    expect((await listRecipes()).map((r) => r.name)).toEqual(['Старое']);
  });

  it('режим «заменить» с битым файлом ничего не удаляет', async () => {
    await saveRecipe(sampleDish());
    await expect(
      importBackup('{"format":"other"}', db, { mode: 'replace' }),
    ).rejects.toBeInstanceOf(BackupError);
    expect(await listRecipes()).toHaveLength(1);
  });

  it('удалённая на устройстве запись набора не возвращается из файла', async () => {
    const json = JSON.stringify(await exportBackup());
    await db.products.delete('sk-014');
    await db.meta.update('seed', { deletedIds: ['sk-014'] });
    await db.products.update('sk-015', { rank: 0 });
    await importBackup(json.replace('"rank":0', '"rank":9'));
    expect(await db.products.get('sk-014')).toBeUndefined();
  });

  it('тот же ручной продукт с другим id не дублируется, псевдонимы сохраняются', async () => {
    await db.products.add({
      id: 'local-1',
      name: 'Творог домашний',
      nameNorm: 'творог домашний',
      kcal: 150,
      protein: 16,
      fat: 9,
      carbs: 2,
      source: 'user',
      rank: 1,
      verified: false,
      aliases: ['old-1'],
    });
    const file = {
      format: 'kalkulyator-kaloriynosti',
      version: 1,
      products: [
        {
          id: 'phone-1',
          name: 'Творог домашний',
          kcal: 150,
          protein: 16,
          fat: 9,
          carbs: 2,
          source: 'user',
          rank: 4,
          verified: false,
          editedAt: 10,
        },
      ],
      recipes: [],
    };
    await importBackup(JSON.stringify(file));
    const same = await db.products.where('nameNorm').equals('творог домашний').toArray();
    expect(same).toHaveLength(1);
    expect(same[0]).toMatchObject({ id: 'local-1', rank: 4, aliases: ['old-1'], editedAt: 10 });
  });
});

describe('CSV и формулы Excel', () => {
  it('текст с = в начале не становится формулой', () => {
    let s = initialDishState();
    s = dishReducer(s, { type: 'setDishName', value: '=HYPERLINK("x")' });
    expect(dishToCsv(s)).toContain(`"'=HYPERLINK(""x"")"`);
  });
});
