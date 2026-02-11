import type { Entry, Category, EntryStatus } from '../db/schema';

export interface ListEntriesFilters {
  status?: EntryStatus;
  category?: Category;
}

export interface CreateEntryData {
  title: string;
  content?: string;
  version?: string;
  category?: Category;
  source?: string;
  source_metadata?: string;
}

export async function listEntries(
  db: D1Database,
  filters?: ListEntriesFilters,
): Promise<Entry[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters?.status) {
    conditions.push('status = ?');
    params.push(filters.status);
  }
  if (filters?.category) {
    conditions.push('category = ?');
    params.push(filters.category);
  }

  let sql = 'SELECT * FROM entries';
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY created_at DESC';

  const result = await db.prepare(sql).bind(...params).all<Entry>();
  return result.results;
}

export async function getEntry(
  db: D1Database,
  id: number,
): Promise<Entry | null> {
  const result = await db
    .prepare('SELECT * FROM entries WHERE id = ?')
    .bind(id)
    .first<Entry>();
  return result ?? null;
}

export async function createEntry(
  db: D1Database,
  data: CreateEntryData,
): Promise<Entry> {
  const result = await db
    .prepare(
      `INSERT INTO entries (title, content, version, category, source, source_metadata)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING *`,
    )
    .bind(
      data.title,
      data.content ?? '',
      data.version ?? null,
      data.category ?? 'added',
      data.source ?? 'manual',
      data.source_metadata ?? null,
    )
    .first<Entry>();
  return result!;
}

export async function updateEntry(
  db: D1Database,
  id: number,
  data: Partial<Entry>,
): Promise<Entry | null> {
  const fields: string[] = [];
  const params: unknown[] = [];

  const allowedFields = [
    'title',
    'content',
    'version',
    'category',
    'status',
    'source',
    'source_metadata',
  ] as const;

  for (const field of allowedFields) {
    if (field in data) {
      fields.push(`${field} = ?`);
      params.push(data[field as keyof Entry]);
    }
  }

  if (fields.length === 0) {
    return getEntry(db, id);
  }

  fields.push("updated_at = datetime('now')");
  params.push(id);

  const result = await db
    .prepare(
      `UPDATE entries SET ${fields.join(', ')} WHERE id = ? RETURNING *`,
    )
    .bind(...params)
    .first<Entry>();
  return result ?? null;
}

export async function deleteEntry(
  db: D1Database,
  id: number,
): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM entries WHERE id = ?')
    .bind(id)
    .run();
  return result.meta.changes > 0;
}

export async function publishEntry(
  db: D1Database,
  id: number,
): Promise<Entry | null> {
  const result = await db
    .prepare(
      `UPDATE entries SET status = 'published', published_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ? RETURNING *`,
    )
    .bind(id)
    .first<Entry>();
  return result ?? null;
}

export async function getDraftEntries(db: D1Database): Promise<Entry[]> {
  const result = await db
    .prepare(
      "SELECT * FROM entries WHERE status = 'draft' ORDER BY created_at DESC",
    )
    .all<Entry>();
  return result.results;
}
