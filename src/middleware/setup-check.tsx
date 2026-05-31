import { createMiddleware } from 'hono/factory';
import type { Bindings } from '../bindings';
import { getAppConfig } from '../services/github-app';

// Redirects to /setup until the GitHub App exists and is installed. The
// access-gating repo (allowed_repo) is chosen on the first admin login, so we
// gate on installation_id only — otherwise /admin/login and /auth/* would be
// unreachable during that first login. Mounted on /admin/* and /auth/*;
// public routes work without setup.
export const requireSetup = createMiddleware<{ Bindings: Bindings }>(
  async (c, next) => {
    const cfg = await getAppConfig(c.env.DB);
    if (!cfg || !cfg.installation_id) {
      return c.redirect('/setup');
    }
    await next();
  },
);
