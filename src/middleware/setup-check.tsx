import { createMiddleware } from 'hono/factory';
import type { Bindings } from '../bindings';
import { isSetupComplete } from '../services/github-app';

// Redirects to /setup if the GitHub App config is missing or incomplete.
// Mounted on /admin/* and /auth/* — public routes work without setup.
export const requireSetup = createMiddleware<{ Bindings: Bindings }>(
  async (c, next) => {
    const done = await isSetupComplete(c.env.DB);
    if (!done) {
      return c.redirect('/setup');
    }
    await next();
  },
);
