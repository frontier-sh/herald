import type { Section } from '../db/schema';

export async function listSections(
  db: D1Database,
  appId: number,
): Promise<Section[]> {
  const result = await db
    .prepare('SELECT * FROM sections WHERE app_id = ? ORDER BY sort_order ASC, name ASC')
    .bind(appId)
    .all<Section>();
  return result.results;
}

export async function getSection(
  db: D1Database,
  appId: number,
  id: number,
): Promise<Section | null> {
  const result = await db
    .prepare('SELECT * FROM sections WHERE id = ? AND app_id = ?')
    .bind(id, appId)
    .first<Section>();
  return result ?? null;
}

export async function getOrCreateSection(
  db: D1Database,
  appId: number,
  name: string,
): Promise<Section> {
  const trimmed = name.trim();

  // Try to find existing section (case-insensitive, within this app)
  const existing = await db
    .prepare('SELECT * FROM sections WHERE app_id = ? AND LOWER(name) = LOWER(?)')
    .bind(appId, trimmed)
    .first<Section>();

  if (existing) return existing;

  // Get max sort_order to append at end
  const maxOrder = await db
    .prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM sections WHERE app_id = ?')
    .bind(appId)
    .first<{ next_order: number }>();

  const result = await db
    .prepare(
      `INSERT INTO sections (app_id, name, sort_order) VALUES (?, ?, ?) RETURNING *`,
    )
    .bind(appId, trimmed, maxOrder?.next_order ?? 0)
    .first<Section>();

  return result!;
}

export async function deleteSection(
  db: D1Database,
  appId: number,
  id: number,
): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM sections WHERE id = ? AND app_id = ?')
    .bind(id, appId)
    .run();
  return result.meta.changes > 0;
}
