import { createMiddleware } from 'hono/factory';
import type { Context } from 'hono';
import type { Bindings } from '../bindings';
import { getSetting, setSetting } from '../services/settings';

// Setting key under which the auto-detected public origin is cached so that
// request-less contexts (the queue consumer) can build absolute URLs.
export const BASE_URL_SETTING = 'base_url';

// Resolves the deployment's public origin for the current request: the
// explicit BASE_URL override wins, otherwise the request's own host.
export function resolveBaseUrl(c: Context<{ Bindings: Bindings }>): string {
  if (c.env.BASE_URL) return c.env.BASE_URL.replace(/\/$/, '');
  const url = new URL(c.req.url);
  return `${url.protocol}//${url.host}`;
}

// Persists the auto-detected origin so the queue consumer (which has no
// request to read a host from) can purge caches and build links. Skipped when
// BASE_URL is set explicitly. Writes only when the value changes — and off the
// response path via waitUntil — so steady-state requests cost one indexed read.
export const recordBaseUrl = createMiddleware<{ Bindings: Bindings }>(
  async (c, next) => {
    if (!c.env.BASE_URL) {
      const url = new URL(c.req.url);
      const origin = `${url.protocol}//${url.host}`;
      c.executionCtx.waitUntil(
        (async () => {
          const stored = await getSetting(c.env.DB, BASE_URL_SETTING);
          if (stored !== origin) {
            await setSetting(c.env.DB, BASE_URL_SETTING, origin);
          }
        })(),
      );
    }
    await next();
  },
);
