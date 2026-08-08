import type { ApiKey } from '../db/schema';

async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function createApiKey(
  db: D1Database,
  appId: number,
  name: string,
): Promise<{ id: number; name: string; key: string }> {
  const key = crypto.randomUUID();
  const keyHash = await hashKey(key);

  const result = await db
    .prepare(
      `INSERT INTO api_keys (app_id, name, key_hash) VALUES (?, ?, ?) RETURNING id, name`,
    )
    .bind(appId, name, keyHash)
    .first<{ id: number; name: string }>();

  return { id: result!.id, name: result!.name, key };
}

export async function listApiKeys(
  db: D1Database,
  appId: number,
): Promise<Omit<ApiKey, 'key_hash'>[]> {
  const result = await db
    .prepare(
      'SELECT id, app_id, name, created_at, last_used_at FROM api_keys WHERE app_id = ? ORDER BY created_at DESC',
    )
    .bind(appId)
    .all<Omit<ApiKey, 'key_hash'>>();
  return result.results;
}

export async function deleteApiKey(
  db: D1Database,
  appId: number,
  id: number,
): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM api_keys WHERE id = ? AND app_id = ?')
    .bind(id, appId)
    .run();
  return result.meta.changes > 0;
}

/**
 * Resolve an API key to its row, or null when unknown. The row carries the
 * `app_id` the key is scoped to — every /api handler must confine its queries
 * to that app. Keys issued before multi-app support have app_id = 1, so
 * existing GitHub Actions keep hitting the default app unchanged.
 */
export async function validateApiKey(
  db: D1Database,
  key: string,
): Promise<Omit<ApiKey, 'key_hash'> | null> {
  const keyHash = await hashKey(key);
  const result = await db
    .prepare(
      'SELECT id, app_id, name, created_at, last_used_at FROM api_keys WHERE key_hash = ?',
    )
    .bind(keyHash)
    .first<Omit<ApiKey, 'key_hash'>>();

  if (!result) return null;

  // Update last_used_at
  await db
    .prepare(
      "UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?",
    )
    .bind(result.id)
    .run();

  return result;
}
