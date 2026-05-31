import type { Setting } from '../db/schema';

export async function getSetting(
  db: D1Database,
  key: string,
): Promise<string | null> {
  const result = await db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .bind(key)
    .first<Setting>();
  return result?.value ?? null;
}

export async function getAllSettings(
  db: D1Database,
): Promise<Record<string, string>> {
  const result = await db.prepare('SELECT * FROM settings').all<Setting>();
  const settings: Record<string, string> = {};
  for (const row of result.results) {
    settings[row.key] = row.value ?? '';
  }
  return settings;
}

export async function setSetting(
  db: D1Database,
  key: string,
  value: string,
): Promise<void> {
  await db
    .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .bind(key, value)
    .run();
}

export async function deleteSetting(
  db: D1Database,
  key: string,
): Promise<void> {
  await db.prepare('DELETE FROM settings WHERE key = ?').bind(key).run();
}
