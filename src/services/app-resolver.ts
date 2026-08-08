import type { App } from '../db/schema';
import { RESERVED_SLUGS, getApp, getAppBySlug, getDefaultApp } from './apps';

/**
 * Resolve the app addressed by the first path segment of a public URL.
 *
 * An empty segment means the site root, which the default app owns. Reserved
 * segments (`/admin`, `/api`, `/embed.js`, …) are never apps — they're matched
 * by earlier routes, and returning null here keeps the `/:appSlug/*` group from
 * shadowing them. Unknown slugs return null so the caller can 404.
 */
export async function resolveAppFromSlugSegment(
  db: D1Database,
  segment: string | undefined,
): Promise<App | null> {
  if (!segment) return getDefaultApp(db);
  if (RESERVED_SLUGS.includes(segment.toLowerCase())) return null;
  return getAppBySlug(db, segment);
}

/**
 * Resolve an app id that may be missing or stale (e.g. the admin `herald_app`
 * cookie pointing at a deleted app), falling back to the default app.
 */
export async function resolveAppById(
  db: D1Database,
  id: number | null | undefined,
): Promise<App | null> {
  if (id) {
    const app = await getApp(db, id);
    if (app) return app;
  }
  return getDefaultApp(db);
}
