import { createMiddleware } from 'hono/factory';
import { getCookie, deleteCookie } from 'hono/cookie';
import type { Bindings } from '../bindings';
import { validateApiKey } from '../services/api-keys';
import { getAppConfig } from '../services/github-app';

export async function signValue(
  value: string,
  secret: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(value),
  );
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function verifySignature(
  value: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const expected = await signValue(value, secret);
  return expected === signature;
}

// API key auth. Beyond authenticating the request it establishes its tenant:
// every key belongs to exactly one app, and `apiKeyAppId` is what the /api
// handlers scope their queries by. Keys issued before multi-app support have
// app_id = 1, so existing GitHub Actions keep writing to the default app.
export const apiKeyAuth = createMiddleware<{
  Bindings: Bindings;
  Variables: { apiKeyAppId: number };
}>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }

  const token = authHeader.slice(7);
  const key = await validateApiKey(c.env.DB, token);
  if (!key) {
    return c.json({ error: 'Invalid API key' }, 401);
  }

  c.set('apiKeyAppId', key.app_id);

  await next();
});

type AdminAuthEnv = {
  Bindings: Bindings;
  Variables: {
    githubUser: string;
    logoUrl: string | null;
    faviconUrl: string | null;
  };
};

// Admin auth: verifies a signed GitHub session cookie against the
// session_secret stored in D1.
// Cookie format: "github:{username}:{expiry_ms}.{hmac_signature}"
export const adminAuth = createMiddleware<AdminAuthEnv>(async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path === '/admin/login') {
    await next();
    return;
  }

  const cfg = await getAppConfig(c.env.DB);
  if (!cfg) return c.redirect('/setup');

  const sessionCookie = getCookie(c, 'herald_session');
  if (!sessionCookie) {
    return c.redirect('/admin/login');
  }

  const dotIndex = sessionCookie.lastIndexOf('.');
  if (dotIndex === -1) {
    return c.redirect('/admin/login');
  }

  const value = sessionCookie.slice(0, dotIndex);
  const signature = sessionCookie.slice(dotIndex + 1);

  const valid = await verifySignature(value, signature, cfg.session_secret);
  if (!valid) {
    return c.redirect('/admin/login');
  }

  const parts = value.split(':');
  if (parts.length !== 3 || parts[0] !== 'github') {
    return c.redirect('/admin/login');
  }

  const [, username, expiryStr] = parts;
  const expiry = parseInt(expiryStr, 10);
  if (isNaN(expiry) || Date.now() > expiry) {
    deleteCookie(c, 'herald_session', { path: '/admin' });
    return c.redirect('/admin/login');
  }

  c.set('githubUser', username);

  // Branding (sidebar logo + favicon) is per-app now, so it's loaded by the
  // current-app middleware in routes/admin.tsx once the app is resolved.
  await next();
});
