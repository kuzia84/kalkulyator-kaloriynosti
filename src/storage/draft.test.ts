import { beforeEach, describe, expect, it } from 'vitest';
import { dishReducer, initialDishState } from '../dish/state';
import { resetDb } from '../test/db';
import { loadDraft, saveDraft } from './draft';

beforeEach(resetDb);

describe('черновик', () => {
  it('пустая база — черновика нет', async () => {
    expect(await loadDraft()).toBeNull();
  });

  it('сохраняет и читает блюдо целиком', async () => {
    let s = dishReducer(initialDishState(), { type: 'addRow' });
    s = dishReducer(s, { type: 'setWeight', rowId: s.rows[1]!.id, weight: '12,5' });
    s = dishReducer(s, { type: 'setCookedWeight', value: '400' });
    await saveDraft(s);
    expect(await loadDraft()).toEqual(s);
  });
});
