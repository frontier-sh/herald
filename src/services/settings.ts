import type { AppSetting, Setting } from '../db/schema';

/**
 * Settings that belong to a single app rather than the whole install. Moved out
 * of `settings` and into `app_settings` by migration 0012; the API layer uses
 * this list as the allowlist for GET/PUT /api/settings so global keys are never
 * exposed or overwritten by a key scoped to one app.
 *
 * Everything not listed here stays global: `ai_model`, `base_url`,
 * `onboarding_completed`.
 */
export const PER_APP_SETTING_KEYS: readonly string[] = [
  'project_name',
  'project_description',
  'auto_publish',
  'ai_enabled',
  'ai_personality',
  'entry_grouping',
  'timezone',
  'date_grouping',
  'theme',
  'primary_color',
  'logo_image_key',
  'favicon_image_key',
  'show_title',
  'show_description',
  'hide_attribution',
  'slack_webhook_url',
  'slack_notifications_enabled',
  'source_repo',
] as const;

// ─── Global settings ────────────────────────────────────

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

// ─── Per-app settings ───────────────────────────────────

export async function getAppSetting(
  db: D1Database,
  appId: number,
  key: string,
): Promise<string | null> {
  const result = await db
    .prepare('SELECT value FROM app_settings WHERE app_id = ? AND key = ?')
    .bind(appId, key)
    .first<AppSetting>();
  return result?.value ?? null;
}

export async function getAllAppSettings(
  db: D1Database,
  appId: number,
): Promise<Record<string, string>> {
  const result = await db
    .prepare('SELECT * FROM app_settings WHERE app_id = ?')
    .bind(appId)
    .all<AppSetting>();
  const settings: Record<string, string> = {};
  for (const row of result.results) {
    settings[row.key] = row.value ?? '';
  }
  return settings;
}

export async function setAppSetting(
  db: D1Database,
  appId: number,
  key: string,
  value: string,
): Promise<void> {
  await db
    .prepare(
      'INSERT OR REPLACE INTO app_settings (app_id, key, value) VALUES (?, ?, ?)',
    )
    .bind(appId, key, value)
    .run();
}

export async function deleteAppSetting(
  db: D1Database,
  appId: number,
  key: string,
): Promise<void> {
  await db
    .prepare('DELETE FROM app_settings WHERE app_id = ? AND key = ?')
    .bind(appId, key)
    .run();
}
