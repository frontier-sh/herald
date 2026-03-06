// Edge caching for public pages using Cloudflare Cache API

const CACHED_PATHS = ['/', '/embed', '/feed.xml'];

// Common embed limit values to purge (covers typical configurations)
const EMBED_LIMIT_VALUES = [1, 2, 3, 5, 10, 15, 20, 25, 50];

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
  const paths = [
    ...CACHED_PATHS,
    ...EMBED_LIMIT_VALUES.map((n) => `/embed?limit=${n}`),
  ];
  await Promise.all(
    paths.map((path) => cache.delete(new Request(baseUrl + path)))
  );
}

export async function purgeImageCache(baseUrl: string, imageKey: string): Promise<void> {
  const cache = (caches as any).default as Cache;
  await cache.delete(new Request(`${baseUrl}/images/${imageKey}`));
}
