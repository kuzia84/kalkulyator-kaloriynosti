import { db as defaultDb, type AppDB } from './db';
import type { DraftRecord } from './schema';
import type { DishState } from '../dish/state';

const DRAFT_ID = 'current';

export async function loadDraft(db: AppDB = defaultDb): Promise<DishState | null> {
  const draft = await db.drafts.get(DRAFT_ID);
  if (!draft || !Array.isArray(draft.rows) || draft.rows.length === 0) return null;
  return {
    name: draft.name ?? '',
    rows: draft.rows,
    cookedWeight: draft.cookedWeight ?? '',
    portionWeight: draft.portionWeight ?? '',
    note: draft.note ?? '',
    ...(draft.recipeId ? { recipeId: draft.recipeId } : {}),
  };
}

export async function saveDraft(
  state: DishState,
  db: AppDB = defaultDb,
  now = Date.now(),
): Promise<void> {
  await db.transaction('rw', db.drafts, async () => {
    const existing = await db.drafts.get(DRAFT_ID);
    const record: DraftRecord = {
      id: DRAFT_ID,
      name: state.name,
      rows: state.rows,
      cookedWeight: state.cookedWeight,
      portionWeight: state.portionWeight,
      note: state.note,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      ...(state.recipeId ? { recipeId: state.recipeId } : {}),
    };
    await db.drafts.put(record);
  });
}
