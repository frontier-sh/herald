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
  /** Related git commit ID, set when generating an entry from a GitHub commit. */
  commit_sha?: string;
  /**
   * ISO timestamp to preserve as the entry's `created_at` (e.g. the original
   * commit date). When omitted, the database default of `datetime('now')` is
   * used. Determines ordering and the date shown on draft entries.
   */
  created_at?: string;
  /**
   * Editable "date of the change" shown and grouped on the public changelog.
   * Canonical UTC string. When omitted, defaults to the commit/created date so
   * imported entries land on the day the work happened; on publish it falls
   * back to `published_at` if still unset.
   */
  entry_date?: string;
}

/**
 * Sections are per-app, so an incoming section_id is only honoured when it
 * belongs to the same app as the entry. Anything else (unknown id, or another
 * app's section) resolves to null rather than erroring — the same lenient shape
 * the rest of this module uses for ids it can't match.
 */
async function resolveSectionId(
  db: D1Database,
  appId: number,
  sectionId: number | null | undefined,
): Promise<number | null> {
  if (sectionId === null || sectionId === undefined) return null;
  const section = await db
    .prepare('SELECT id FROM sections WHERE id = ? AND app_id = ?')
    .bind(sectionId, appId)
    .first<{ id: number }>();
  return section?.id ?? null;
}

export async function listEntries(
  db: D1Database,
  appId: number,
  filters?: ListEntriesFilters,
): Promise<EntryWithSection[]> {
  const conditions: string[] = ['e.app_id = ?'];
  const params: unknown[] = [appId];

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

  // The join is app-scoped as well as id-matched, so a section belonging to
  // another app can never contribute its name to this app's rows.
  let sql = 'SELECT e.*, s.name AS section_name FROM entries e LEFT JOIN sections s ON e.section_id = s.id AND s.app_id = e.app_id';
  sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY e.created_at DESC';

  const result = await db.prepare(sql).bind(...params).all<EntryWithSection>();
  return result.results;
}

/** Scoped by app: an id from another app resolves to null, never a foreign row. */
export async function getEntry(
  db: D1Database,
  appId: number,
  id: number,
): Promise<EntryWithSection | null> {
  const result = await db
    .prepare('SELECT e.*, s.name AS section_name FROM entries e LEFT JOIN sections s ON e.section_id = s.id AND s.app_id = e.app_id WHERE e.id = ? AND e.app_id = ?')
    .bind(id, appId)
    .first<EntryWithSection>();
  return result ?? null;
}

export async function createEntry(
  db: D1Database,
  appId: number,
  data: CreateEntryData,
): Promise<EntryWithSection> {
  const sectionId = await resolveSectionId(db, appId, data.section_id);

  const result = await db
    .prepare(
      `INSERT INTO entries (app_id, title, content, category, section_id, source, source_metadata, commit_sha, created_at, entry_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(datetime(?), datetime('now')), datetime(?))
       RETURNING *`,
    )
    .bind(
      appId,
      data.title,
      data.content ?? '',
      // When no category is supplied, infer one from the commit subject rather
      // than defaulting to a blanket 'added'. If AI is enabled, the queue worker
      // later overrides this with the AI's choice.
      data.category ?? inferCategory(data.title),
      sectionId,
      data.source ?? 'manual',
      data.source_metadata ?? null,
      data.commit_sha ?? null,
      data.created_at ?? null,
      // Editable change date. When omitted, leave NULL so display/grouping
      // resolves via effectiveEntryDate() (published_at -> created_at).
      data.entry_date ?? null,
    )
    .first<Entry>();

  // Re-fetch with section name joined
  if (result?.section_id) {
    return (await getEntry(db, appId, result.id))!;
  }
  return { ...result!, section_name: null };
}

export async function updateEntry(
  db: D1Database,
  appId: number,
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
    'commit_sha',
    'entry_date',
  ] as const;

  for (const field of allowedFields) {
    if (field in data) {
      fields.push(`${field} = ?`);
      // section_id is the one field that names another table's row, so it is
      // validated against this app's sections rather than written through.
      params.push(
        field === 'section_id'
          ? await resolveSectionId(db, appId, data.section_id)
          : data[field as keyof Entry],
      );
    }
  }

  if (fields.length === 0) {
    return getEntry(db, appId, id);
  }

  fields.push("updated_at = datetime('now')");
  params.push(id, appId);

  await db
    .prepare(
      `UPDATE entries SET ${fields.join(', ')} WHERE id = ? AND app_id = ?`,
    )
    .bind(...params)
    .run();
  return getEntry(db, appId, id);
}

export async function deleteEntry(
  db: D1Database,
  appId: number,
  id: number,
): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM entries WHERE id = ? AND app_id = ?')
    .bind(id, appId)
    .run();
  return result.meta.changes > 0;
}

export async function publishEntry(
  db: D1Database,
  appId: number,
  id: number,
): Promise<EntryWithSection | null> {
  // Clearing publish_on_ai_complete keeps the flag from lingering after the
  // intent it represents (publish-when-AI-done) has been satisfied.
  await db
    .prepare(
      `UPDATE entries SET status = 'published', published_at = datetime('now'),
         entry_date = COALESCE(entry_date, datetime('now')),
         publish_on_ai_complete = 0, updated_at = datetime('now')
       WHERE id = ? AND app_id = ?`,
    )
    .bind(id, appId)
    .run();
  return getEntry(db, appId, id);
}

/** SHAs of commits already imported as entries, for de-duping the Generate flow. */
export async function getImportedCommitShas(
  db: D1Database,
  appId: number,
): Promise<Set<string>> {
  const result = await db
    .prepare('SELECT commit_sha FROM entries WHERE app_id = ? AND commit_sha IS NOT NULL')
    .bind(appId)
    .all<{ commit_sha: string }>();
  return new Set(result.results.map((r) => r.commit_sha));
}

export async function getDraftEntries(
  db: D1Database,
  appId: number,
): Promise<EntryWithSection[]> {
  const result = await db
    .prepare(
      "SELECT e.*, s.name AS section_name FROM entries e LEFT JOIN sections s ON e.section_id = s.id AND s.app_id = e.app_id WHERE e.app_id = ? AND e.status = 'draft' ORDER BY e.created_at DESC",
    )
    .bind(appId)
    .all<EntryWithSection>();
  return result.results;
}
