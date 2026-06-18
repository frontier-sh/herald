import type { Entry, EntryWithSection, Category, EntryStatus } from '../db/schema';

/**
 * Map a (possibly conventional-commit) message title to a changelog category.
 * Used to seed the category when generating entries from commits.
 */
export function inferCategory(title: string): Category {
  const match = title.match(/^(\w+)(\([^)]*\))?!?:/);
  const type = match?.[1]?.toLowerCase();
  switch (type) {
    case 'fix':
      return 'fixed';
    case 'feat':
    case 'feature':
      return 'added';
    case 'revert':
      return 'removed';
    case 'perf':
    case 'refactor':
    case 'style':
    case 'build':
    case 'chore':
    case 'docs':
    case 'test':
    case 'ci':
      return 'changed';
    default:
      return 'added';
  }
}

export interface ListEntriesFilters {
  status?: EntryStatus;
  category?: Category;
  section_id?: number;
}

export interface CreateEntryData {
  title: string;
  content?: string;
  category?: Category;
  section_id?: number | null;
  source?: string;
  source_metadata?: string;
  /**
   * ISO timestamp to preserve as the entry's `created_at` (e.g. the original
   * commit date). When omitted, the database default of `datetime('now')` is
   * used. Determines ordering and the date shown on draft entries.
   */
  created_at?: string;
}

export async function listEntries(
  db: D1Database,
  filters?: ListEntriesFilters,
): Promise<EntryWithSection[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters?.status) {
    conditions.push('e.status = ?');
    params.push(filters.status);
  }
  if (filters?.category) {
    conditions.push('e.category = ?');
    params.push(filters.category);
  }
  if (filters?.section_id) {
    conditions.push('e.section_id = ?');
    params.push(filters.section_id);
  }

  let sql = 'SELECT e.*, s.name AS section_name FROM entries e LEFT JOIN sections s ON e.section_id = s.id';
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY e.created_at DESC';

  const result = await db.prepare(sql).bind(...params).all<EntryWithSection>();
  return result.results;
}

export async function getEntry(
  db: D1Database,
  id: number,
): Promise<EntryWithSection | null> {
  const result = await db
    .prepare('SELECT e.*, s.name AS section_name FROM entries e LEFT JOIN sections s ON e.section_id = s.id WHERE e.id = ?')
    .bind(id)
    .first<EntryWithSection>();
  return result ?? null;
}

export async function createEntry(
  db: D1Database,
  data: CreateEntryData,
): Promise<EntryWithSection> {
  const result = await db
    .prepare(
      `INSERT INTO entries (title, content, category, section_id, source, source_metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, COALESCE(datetime(?), datetime('now')))
       RETURNING *`,
    )
    .bind(
      data.title,
      data.content ?? '',
      // When no category is supplied, infer one from the commit subject rather
      // than defaulting to a blanket 'added'. If AI is enabled, the queue worker
      // later overrides this with the AI's choice.
      data.category ?? inferCategory(data.title),
      data.section_id ?? null,
      data.source ?? 'manual',
      data.source_metadata ?? null,
      data.created_at ?? null,
    )
    .first<Entry>();

  // Re-fetch with section name joined
  if (result?.section_id) {
    return (await getEntry(db, result.id))!;
  }
  return { ...result!, section_name: null };
}

export async function updateEntry(
  db: D1Database,
  id: number,
  data: Partial<Entry>,
): Promise<EntryWithSection | null> {
  const fields: string[] = [];
  const params: unknown[] = [];

  const allowedFields = [
    'title',
    'content',
    'category',
    'section_id',
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

  await db
    .prepare(
      `UPDATE entries SET ${fields.join(', ')} WHERE id = ?`,
    )
    .bind(...params)
    .run();
  return getEntry(db, id);
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
): Promise<EntryWithSection | null> {
  await db
    .prepare(
      `UPDATE entries SET status = 'published', published_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`,
    )
    .bind(id)
    .run();
  return getEntry(db, id);
}

export async function getDraftEntries(db: D1Database): Promise<EntryWithSection[]> {
  const result = await db
    .prepare(
      "SELECT e.*, s.name AS section_name FROM entries e LEFT JOIN sections s ON e.section_id = s.id WHERE e.status = 'draft' ORDER BY e.created_at DESC",
    )
    .all<EntryWithSection>();
  return result.results;
}
