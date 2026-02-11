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
  name: string,
): Promise<{ id: number; name: string; key: string }> {
  const key = crypto.randomUUID();
  const keyHash = await hashKey(key);

  const result = await db
    .prepare(
      `INSERT INTO api_keys (name, key_hash) VALUES (?, ?) RETURNING id, name`,
    )
    .bind(name, keyHash)
    .first<{ id: number; name: string }>();

  return { id: result!.id, name: result!.name, key };
}

export async function listApiKeys(
  db: D1Database,
): Promise<Omit<ApiKey, 'key_hash'>[]> {
  const result = await db
    .prepare(
      'SELECT id, name, created_at, last_used_at FROM api_keys ORDER BY created_at DESC',
    )
    .all<Omit<ApiKey, 'key_hash'>>();
  return result.results;
}

export async function deleteApiKey(
  db: D1Database,
  id: number,
): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM api_keys WHERE id = ?')
    .bind(id)
    .run();
  return result.meta.changes > 0;
}

export async function validateApiKey(
  db: D1Database,
  key: string,
): Promise<boolean> {
  const keyHash = await hashKey(key);
  const result = await db
    .prepare('SELECT id FROM api_keys WHERE key_hash = ?')
    .bind(keyHash)
    .first<{ id: number }>();

  if (!result) return false;

  // Update last_used_at
  await db
    .prepare(
      "UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?",
    )
    .bind(result.id)
    .run();

  return true;
}
