import { db } from '../storage/db';

/** Пересоздаёт общую базу приложения: каждый тест начинает со стартового набора. */
export async function resetDb(): Promise<void> {
  db.close();
  await db.delete();
  await db.open();
}
