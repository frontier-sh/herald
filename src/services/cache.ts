// Edge caching for public pages using Cloudflare Cache API

import type { App } from '../db/schema';

/**
 * Same rule as appBasePath() in ./apps — inlined so this module has no runtime
 * imports and stays testable under `node --test`.
 */
function basePathOf(app: App): string {
  return app.is_default ? '' : `/${app.slug}`;
}

/**
 * Public pages held in the edge cache, expressed relative to an app's base
 * path. The default app owns the site root, so its paths are unprefixed —
 * exactly the set that was cached before multi-app support.
 */
const CACHED_PATHS = ['/', '/embed', '/embed.json', '/feed.xml'];

/**
 * Absolute paths of an app's cached public pages.
 *
 * Default app → ['/', '/embed', '/embed.json', '/feed.xml'].
 * Other apps  → the same list under `/${slug}`, with the changelog page at the
 * bare prefix (`/tiller`, not `/tiller/`) because that is the URL the router
 * serves and therefore the key the cache is stored under.
 */
export function cachedPathsForApp(app: App): string[] {
  const basePath = basePathOf(app);
  if (!basePath) return [...CACHED_PATHS];
  return CACHED_PATHS.map((path) => (path === '/' ? basePath : `${basePath}${path}`));
}

/** Cache key path for one release permalink of an app. */
function releasePath(app: App, version: string): string {
  return `${basePathOf(app)}/releases/${encodeURIComponent(version)}`;
}

export async function getCachedResponse(request: Request): Promise<Response | undefined> {
  const cache = (caches as any).default as Cache;
  const response = await cache.match(request);
  return response;
}

export async function cacheResponse(request: Request, response: Response): Promise<void> {
  const cache = (caches as any).default as Cache;
  await cache.put(request, response.clone());
}

/** Drop the cached changelog, embed, embed.json and feed for one app. */
export async function purgePublicCache(baseUrl: string, app: App): Promise<void> {
  const cache = (caches as any).default as Cache;
  await Promise.all(
    cachedPathsForApp(app).map((path) => cache.delete(new Request(baseUrl + path))),
  );
}

/** Drop the cached permalink pages for the given versions of one app. */
export async function purgeReleasePages(
  baseUrl: string,
  app: App,
  versions: string[],
): Promise<void> {
  if (versions.length === 0) return;
  const cache = (caches as any).default as Cache;
  await Promise.all(
    versions.map((v) => cache.delete(new Request(baseUrl + releasePath(app, v)))),
  );
}

export async function purgeImageCache(baseUrl: string, imageKey: string): Promise<void> {
  const cache = (caches as any).default as Cache;
  await cache.delete(new Request(`${baseUrl}/images/${imageKey}`));
}
