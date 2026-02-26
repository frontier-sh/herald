import { createMiddleware } from 'hono/factory';
import type { Bindings } from '../bindings';
import { SetupRequired } from '../views/pages/setup-required';

const REQUIRED_VARS = [
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'GITHUB_ALLOWED_REPO',
] as const;

/**
 * Middleware that blocks the request with a setup page if any required
 * GitHub OAuth environment variables are missing.
 */
export const requireSetup = createMiddleware<{ Bindings: Bindings }>(
  async (c, next) => {
    const missing = REQUIRED_VARS.filter(
      (v) => !c.env[v],
    ) as unknown as string[];
    if (missing.length > 0) {
      return c.html(<SetupRequired missing={missing} />, 503);
    }
    await next();
  },
);
