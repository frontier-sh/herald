import type { Release, ReleaseStatus, Entry } from '../db/schema';

export interface ListReleasesFilters {
  status?: ReleaseStatus;
}

export interface CreateReleaseData {
  version: string;
  title?: string;
  summary?: string;
}

export interface UpdateReleaseData {
  version?: string;
  title?: string;
  summary?: string;
  status?: ReleaseStatus;
}

export interface ReleaseWithEntries extends Release {
  entries: Entry[];
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
      `SELECT e.* FROM entries e
       INNER JOIN release_entries re ON re.entry_id = e.id
       WHERE re.release_id = ?
       ORDER BY re.sort_order ASC`,
    )
    .bind(id)
    .all<Entry>();

  return { ...release, entries: entries.results };
}

export async function createRelease(
  db: D1Database,
  data: CreateReleaseData,
): Promise<Release> {
  const result = await db
    .prepare(
      `INSERT INTO releases (version, title, summary)
       VALUES (?, ?, ?)
       RETURNING *`,
    )
    .bind(data.version, data.title ?? '', data.summary ?? '')
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

  const allowedFields = ['version', 'title', 'summary', 'status'] as const;

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
      `UPDATE releases SET status = 'published', published_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`,
    )
    .bind(id)
    .run();

  // Also publish all associated entries
  await db
    .prepare(
      `UPDATE entries SET status = 'published', published_at = datetime('now'), updated_at = datetime('now')
       WHERE id IN (SELECT entry_id FROM release_entries WHERE release_id = ?)`,
    )
    .bind(id)
    .run();

  return getRelease(db, id);
}
