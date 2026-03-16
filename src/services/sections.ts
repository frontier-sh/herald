import type { Section } from '../db/schema';

export async function listSections(db: D1Database): Promise<Section[]> {
  const result = await db
    .prepare('SELECT * FROM sections ORDER BY sort_order ASC, name ASC')
    .all<Section>();
  return result.results;
}

export async function getOrCreateSection(
  db: D1Database,
  name: string,
): Promise<Section> {
  const trimmed = name.trim();

  // Try to find existing section (case-insensitive)
  const existing = await db
    .prepare('SELECT * FROM sections WHERE LOWER(name) = LOWER(?)')
    .bind(trimmed)
    .first<Section>();

  if (existing) return existing;

  // Get max sort_order to append at end
  const maxOrder = await db
    .prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM sections')
    .first<{ next_order: number }>();

  const result = await db
    .prepare(
      `INSERT INTO sections (name, sort_order) VALUES (?, ?) RETURNING *`,
    )
    .bind(trimmed, maxOrder?.next_order ?? 0)
    .first<Section>();

  return result!;
}

export async function deleteSection(
  db: D1Database,
  id: number,
): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM sections WHERE id = ?')
    .bind(id)
    .run();
  return result.meta.changes > 0;
}
