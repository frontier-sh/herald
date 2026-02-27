// Edge caching for public pages using Cloudflare Cache API

const CACHED_PATHS = ['/', '/embed', '/feed.xml'];

export async function getCachedResponse(request: Request): Promise<Response | undefined> {
  const cache = (caches as any).default as Cache;
  const response = await cache.match(request);
  return response;
}

export async function cacheResponse(request: Request, response: Response): Promise<void> {
  const cache = (caches as any).default as Cache;
  await cache.put(request, response.clone());
}

export async function purgePublicCache(baseUrl: string): Promise<void> {
  const cache = (caches as any).default as Cache;
  await Promise.all(
    CACHED_PATHS.map((path) => cache.delete(new Request(baseUrl + path)))
  );
}

export async function purgeImageCache(baseUrl: string, imageKey: string): Promise<void> {
  const cache = (caches as any).default as Cache;
  await cache.delete(new Request(`${baseUrl}/images/${imageKey}`));
}
