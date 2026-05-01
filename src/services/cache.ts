// Edge caching for public pages using Cloudflare Cache API

const CACHED_PATHS = ['/', '/embed', '/embed.json', '/feed.xml'];

export async function getCachedResponse(request: Request): Promise<Response | undefined> {
  const cache = (caches as any).default as Cache;
  const response = await cache.match(request);
  return response;
}

export async function cacheResponse(request: Request, response: Response): Promise<void> {
  const cache = (caches as any).default as Cache;
  await cache.put(request, response.clone());
}

export async function purgePublicCache(baseUrl: string, extraPaths: string[] = []): Promise<void> {
  const cache = (caches as any).default as Cache;
  const paths = [...CACHED_PATHS, ...extraPaths];
  await Promise.all(
    paths.map((path) => cache.delete(new Request(baseUrl + path)))
  );
}

export async function purgeReleasePages(baseUrl: string, versions: string[]): Promise<void> {
  if (versions.length === 0) return;
  const cache = (caches as any).default as Cache;
  await Promise.all(
    versions.map((v) =>
      cache.delete(new Request(`${baseUrl}/releases/${encodeURIComponent(v)}`)),
    ),
  );
}

export async function purgeImageCache(baseUrl: string, imageKey: string): Promise<void> {
  const cache = (caches as any).default as Cache;
  await cache.delete(new Request(`${baseUrl}/images/${imageKey}`));
}
