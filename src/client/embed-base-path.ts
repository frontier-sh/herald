/**
 * Base-path derivation for the embeddable widget loader.
 *
 * Kept in its own module purely so it can be unit-tested — vite inlines it into
 * the standalone `embed.js` bundle, which stays dependency-free. Nothing here
 * may import anything else, touch the DOM, or use syntax the loader avoids.
 */

/** Slugs are the only thing an app can be addressed by: [a-z0-9-]. */
const SLUG_PATTERN = /^[a-z0-9-]+$/;

/**
 * The app a loader script belongs to, as a public URL prefix, derived from the
 * pathname of the script's own `src`:
 *
 *   /embed.js         → ''         (default app, served at the site root)
 *   /tiller/embed.js  → '/tiller'  (an app served under its slug)
 *
 * `document.currentScript.src` is the URL the author wrote, so the 301 from
 * `/embed.js` to `/assets/embed.js` never reaches this function — but a hand-
 * written `/assets/embed.js` would, and `assets` is a reserved slug that can
 * never be an app, so it resolves to the default app rather than to a path that
 * cannot exist. Anything else unexpected (a renamed bundle, a proxy that
 * rewrote the URL) falls back to '' for the same reason.
 */
export function embedBasePathFromPathname(pathname: string): string {
  if (!pathname) return '';

  // Tolerate a full path+query being passed in.
  const path = pathname.split('?')[0].split('#')[0];

  const lastSlash = path.lastIndexOf('/');
  if (lastSlash < 0) return '';
  if (path.slice(lastSlash + 1) !== 'embed.js') return '';

  // '/tiller//embed.js' addresses the same app as '/tiller/embed.js'.
  const base = path.slice(0, lastSlash).replace(/\/+$/, '');
  if (base === '/assets') return '';

  return base;
}

/**
 * Resolve a `data-herald-app` attribute to a base path, falling back to the
 * path the script itself was loaded from.
 *
 * `null` means the attribute is absent — inherit. An empty or whitespace-only
 * value is a deliberate "the default app", which is how a widget opts back out
 * to the site root when the script was loaded from an app-scoped URL. A value
 * that isn't a valid slug is junk and inherits rather than requesting a URL
 * that can only 404.
 */
export function embedBasePathForApp(app: string | null, fallback: string): string {
  if (app === null) return fallback;

  const slug = app.trim().toLowerCase();
  if (!slug) return '';
  if (!SLUG_PATTERN.test(slug)) return fallback;

  return '/' + slug;
}
