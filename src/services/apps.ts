import type { App } from '../db/schema';

/**
 * Slugs that would collide with a top-level route or a static asset served from
 * the site root. An app may not claim any of these (see validateSlug()).
 */
export const RESERVED_SLUGS: readonly string[] = [
  'admin',
  'api',
  'auth',
  'setup',
  'images',
  'assets',
  'releases',
  'embed',
  'feed.xml',
  'embed.json',
  'embed.js',
  'herald-icon.png',
  'apple-touch-icon.png',
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
] as const;

const SLUG_PATTERN = /^[a-z0-9-]+$/;
const SLUG_MAX_LENGTH = 64;

/** Suggest a URL slug from an app name. May still fail validateSlug(). */
export function slugify(name: string): string {
  return name
    // Decompose accents so "Café" becomes "cafe" rather than "caf-".
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/, '');
}

/**
 * Lenient slug normalisation for a slug field being typed into, shared by the
 * browser so the field self-corrects per keystroke.
 *
 * Deliberately *not* slugify(): slugify strips trailing hyphens, so the space
 * in "my test" would collapse "my-" back to "my" and the separator could never
 * survive to the next word. This keeps a single trailing hyphen so a
 * word boundary can be typed; slugify still runs on blur and on the server.
 *
 * Unlike slugify, characters that are neither separators nor slug-safe are
 * dropped rather than turned into hyphens, so punctuation typed mid-word does
 * not push a separator into the field.
 */
export function liveSlugInput(value: string): string {
  return (
    value
      // Same accent handling as slugify, so "Café" types as "cafe".
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      // Whitespace and underscores are what people type for a word break.
      .replace(/[\s_]+/g, '-')
      .replace(/[^a-z0-9-]+/g, '')
      .replace(/-{2,}/g, '-')
      // A leading hyphen can never be meaningful, but a trailing one is a
      // word break in progress.
      .replace(/^-+/, '')
      .slice(0, SLUG_MAX_LENGTH)
  );
}

/** Returns an error message for display, or null when the slug is usable. */
export function validateSlug(slug: string): string | null {
  if (!slug) return 'URL slug is required';
  if (slug.length > SLUG_MAX_LENGTH) {
    return `URL slug must be ${SLUG_MAX_LENGTH} characters or fewer`;
  }
  if (!SLUG_PATTERN.test(slug)) {
    return 'URL slug may only contain lowercase letters, numbers and hyphens';
  }
  if (RESERVED_SLUGS.includes(slug)) {
    return `"${slug}" is reserved — choose another URL slug`;
  }
  return null;
}

/**
 * Public URL prefix for an app's pages. Empty for the default app, which is
 * served at the site root exactly as it was before multi-app support.
 */
export function appBasePath(app: App): string {
  return app.is_default ? '' : `/${app.slug}`;
}

export interface CreateAppData {
  slug: string;
  name: string;
  description?: string;
}

export interface UpdateAppData {
  slug?: string;
  name?: string;
  description?: string;
}

export async function listApps(db: D1Database): Promise<App[]> {
  const result = await db
    .prepare('SELECT * FROM apps ORDER BY is_default DESC, name ASC')
    .all<App>();
  return result.results;
}

export async function getApp(db: D1Database, id: number): Promise<App | null> {
  const result = await db
    .prepare('SELECT * FROM apps WHERE id = ?')
    .bind(id)
    .first<App>();
  return result ?? null;
}

export async function getAppBySlug(
  db: D1Database,
  slug: string,
): Promise<App | null> {
  const result = await db
    .prepare('SELECT * FROM apps WHERE LOWER(slug) = LOWER(?)')
    .bind(slug)
    .first<App>();
  return result ?? null;
}

/** The app served at the site root. Falls back to the lowest id if unset. */
export async function getDefaultApp(db: D1Database): Promise<App | null> {
  const result = await db
    .prepare('SELECT * FROM apps ORDER BY is_default DESC, id ASC')
    .first<App>();
  return result ?? null;
}

export async function createApp(
  db: D1Database,
  data: CreateAppData,
): Promise<App> {
  const result = await db
    .prepare(
      `INSERT INTO apps (slug, name, description) VALUES (?, ?, ?) RETURNING *`,
    )
    .bind(data.slug.toLowerCase(), data.name, data.description ?? '')
    .first<App>();
  return result!;
}

export async function updateApp(
  db: D1Database,
  id: number,
  data: UpdateAppData,
): Promise<App | null> {
  const fields: string[] = [];
  const params: unknown[] = [];

  const allowedFields = ['slug', 'name', 'description'] as const;

  for (const field of allowedFields) {
    if (field in data) {
      fields.push(`${field} = ?`);
      const value = data[field];
      params.push(field === 'slug' ? String(value).toLowerCase() : value);
    }
  }

  if (fields.length === 0) {
    return getApp(db, id);
  }

  fields.push("updated_at = datetime('now')");
  params.push(id);

  await db
    .prepare(`UPDATE apps SET ${fields.join(', ')} WHERE id = ?`)
    .bind(...params)
    .run();
  return getApp(db, id);
}

/**
 * Make `id` the app served at the site root. Exactly one app is default, so
 * clear the flag everywhere first — batched so the two statements land together.
 */
export async function setDefaultApp(db: D1Database, id: number): Promise<void> {
  await db.batch([
    db.prepare("UPDATE apps SET is_default = 0, updated_at = datetime('now') WHERE is_default = 1"),
    db.prepare("UPDATE apps SET is_default = 1, updated_at = datetime('now') WHERE id = ?").bind(id),
  ]);
}

/**
 * Delete an app and everything it owns. Refuses the default app — the site root
 * must always resolve, so callers must promote another app first.
 *
 * The app_id columns carry no foreign key (SQLite forbids one on ADD COLUMN
 * with a non-null default), so the cascade is explicit here.
 */
export async function deleteApp(db: D1Database, id: number): Promise<boolean> {
  const app = await getApp(db, id);
  if (!app) return false;
  if (app.is_default) {
    throw new Error('The default app cannot be deleted');
  }

  const statements = [
    db
      .prepare('DELETE FROM release_entries WHERE release_id IN (SELECT id FROM releases WHERE app_id = ?)')
      .bind(id),
    db
      .prepare('DELETE FROM release_entries WHERE entry_id IN (SELECT id FROM entries WHERE app_id = ?)')
      .bind(id),
    db.prepare('DELETE FROM releases WHERE app_id = ?').bind(id),
    db.prepare('DELETE FROM entries WHERE app_id = ?').bind(id),
    db.prepare('DELETE FROM sections WHERE app_id = ?').bind(id),
    db.prepare('DELETE FROM app_settings WHERE app_id = ?').bind(id),
    db.prepare('DELETE FROM api_keys WHERE app_id = ?').bind(id),
    db.prepare('DELETE FROM apps WHERE id = ?').bind(id),
  ];

  const results = await db.batch(statements);
  return (results[results.length - 1]?.meta.changes ?? 0) > 0;
}
