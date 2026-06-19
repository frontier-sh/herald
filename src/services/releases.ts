import type { Release, ReleaseStatus, EntryWithSection } from '../db/schema';

export interface ListReleasesFilters {
  status?: ReleaseStatus;
}

export interface CreateReleaseData {
  version: string;
  title?: string;
  summary?: string;
  /** Editable release date (canonical UTC string). */
  release_date?: string;
}

export interface UpdateReleaseData {
  version?: string;
  title?: string;
  summary?: string;
  status?: ReleaseStatus;
  /** Editable release date (canonical UTC string). */
  release_date?: string;
}

export interface ReleaseWithEntries extends Release {
  entries: EntryWithSection[];
  entry_count?: number;
}

export async function listReleases(
  db: D1Database,
  filters?: ListReleasesFilters,
): Promise<(Release & { entry_count: number })[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters?.status) {
    conditions.push('r.status = ?');
    params.push(filters.status);
  }

  let sql = `
    SELECT r.*,
      (SELECT COUNT(*) FROM release_entries re WHERE re.release_id = r.id) AS entry_count
    FROM releases r`;

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY r.created_at DESC';

  const result = await db
    .prepare(sql)
    .bind(...params)
    .all<Release & { entry_count: number }>();
  return result.results;
}

export async function getReleaseByVersion(
  db: D1Database,
  version: string,
): Promise<Release | null> {
  const result = await db
    .prepare('SELECT * FROM releases WHERE version = ?')
    .bind(version)
    .first<Release>();
  return result ?? null;
}

export async function getReleaseVersionsForEntry(
  db: D1Database,
  entryId: number,
): Promise<string[]> {
  const result = await db
    .prepare(
      `SELECT r.version FROM releases r
       INNER JOIN release_entries re ON re.release_id = r.id
       WHERE re.entry_id = ?`,
    )
    .bind(entryId)
    .all<{ version: string }>();
  return result.results.map((r) => r.version);
}

export async function appendEntriesToRelease(
  db: D1Database,
  releaseId: number,
  entryIds: number[],
): Promise<void> {
  if (entryIds.length === 0) return;

  const max = await db
    .prepare('SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM release_entries WHERE release_id = ?')
    .bind(releaseId)
    .first<{ max_order: number }>();
  let next = (max?.max_order ?? -1) + 1;

  for (const entryId of entryIds) {
    await db
      .prepare(
        'INSERT OR IGNORE INTO release_entries (release_id, entry_id, sort_order) VALUES (?, ?, ?)',
      )
      .bind(releaseId, entryId, next)
      .run();
    next += 1;
  }
}

export async function getRelease(
  db: D1Database,
  id: number,
): Promise<ReleaseWithEntries | null> {
  const release = await db
    .prepare('SELECT * FROM releases WHERE id = ?')
    .bind(id)
    .first<Release>();

  if (!release) return null;

  const entries = await db
    .prepare(
      `SELECT e.*, s.name AS section_name FROM entries e
       INNER JOIN release_entries re ON re.entry_id = e.id
       LEFT JOIN sections s ON e.section_id = s.id
       WHERE re.release_id = ?
       ORDER BY re.sort_order ASC`,
    )
    .bind(id)
    .all<EntryWithSection>();

  return { ...release, entries: entries.results };
}

export async function createRelease(
  db: D1Database,
  data: CreateReleaseData,
): Promise<Release> {
  const result = await db
    .prepare(
      `INSERT INTO releases (version, title, summary, release_date)
       VALUES (?, ?, ?, datetime(?))
       RETURNING *`,
    )
    .bind(data.version, data.title ?? '', data.summary ?? '', data.release_date ?? null)
    .first<Release>();
  return result!;
}

export async function updateRelease(
  db: D1Database,
  id: number,
  data: UpdateReleaseData,
  entryIds?: number[],
): Promise<ReleaseWithEntries | null> {
  const fields: string[] = [];
  const params: unknown[] = [];

  const allowedFields = ['version', 'title', 'summary', 'status', 'release_date'] as const;

  for (const field of allowedFields) {
    if (field in data) {
      fields.push(`${field} = ?`);
      params.push(data[field as keyof UpdateReleaseData]);
    }
  }

  if (fields.length > 0) {
    fields.push("updated_at = datetime('now')");
    params.push(id);

    await db
      .prepare(
        `UPDATE releases SET ${fields.join(', ')} WHERE id = ?`,
      )
      .bind(...params)
      .run();
  }

  // Sync release_entries if entryIds provided
  if (entryIds !== undefined) {
    // Remove existing entries
    await db
      .prepare('DELETE FROM release_entries WHERE release_id = ?')
      .bind(id)
      .run();

    // Insert new entries
    for (let i = 0; i < entryIds.length; i++) {
      await db
        .prepare(
          'INSERT INTO release_entries (release_id, entry_id, sort_order) VALUES (?, ?, ?)',
        )
        .bind(id, entryIds[i], i)
        .run();
    }
  }

  return getRelease(db, id);
}

export async function deleteRelease(
  db: D1Database,
  id: number,
): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM releases WHERE id = ?')
    .bind(id)
    .run();
  return result.meta.changes > 0;
}

export async function publishRelease(
  db: D1Database,
  id: number,
): Promise<ReleaseWithEntries | null> {
  // Publish the release itself
  await db
    .prepare(
      `UPDATE releases SET status = 'published', published_at = datetime('now'),
         release_date = COALESCE(release_date, datetime('now')), updated_at = datetime('now')
       WHERE id = ?`,
    )
    .bind(id)
    .run();

  // Publish all associated entries — except any still pending/processing AI.
  // Publishing those now would expose the raw commit before the rewrite lands,
  // so instead flag them to publish the moment AI completes (see queue worker).
  await db
    .prepare(
      `UPDATE entries SET status = 'published', published_at = datetime('now'),
         entry_date = COALESCE(entry_date, datetime('now')),
         publish_on_ai_complete = 0, updated_at = datetime('now')
       WHERE id IN (SELECT entry_id FROM release_entries WHERE release_id = ?)
         AND (ai_status IS NULL OR ai_status NOT IN ('pending', 'processing'))`,
    )
    .bind(id)
    .run();

  await db
    .prepare(
      `UPDATE entries SET publish_on_ai_complete = 1
       WHERE id IN (SELECT entry_id FROM release_entries WHERE release_id = ?)
         AND ai_status IN ('pending', 'processing')`,
    )
    .bind(id)
    .run();

  return getRelease(db, id);
}
