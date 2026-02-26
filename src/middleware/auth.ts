import { createMiddleware } from 'hono/factory';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Bindings } from '../bindings';
import { validateApiKey } from '../services/api-keys';

// HMAC-SHA256 signing for session cookies
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

/**
 * API key authentication middleware.
 * Extracts Bearer token from Authorization header and validates against stored API keys.
 */
export const apiKeyAuth = createMiddleware<{ Bindings: Bindings }>(
  async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'Missing or invalid Authorization header' }, 401);
    }

    const token = authHeader.slice(7);
    const valid = await validateApiKey(c.env.DB, token);
    if (!valid) {
      return c.json({ error: 'Invalid API key' }, 401);
    }

    await next();
  },
);

type AdminAuthEnv = {
  Bindings: Bindings;
  Variables: { githubUser: string };
};

/**
 * Admin authentication middleware.
 * Checks for a valid signed GitHub session cookie. Redirects to /admin/login if not authenticated.
 * Cookie format: "github:{username}:{expiry_ms}.{hmac_signature}"
 */
export const adminAuth = createMiddleware<AdminAuthEnv>(async (c, next) => {
  const path = new URL(c.req.url).pathname;

  // Exclude login route from auth check
  if (path === '/admin/login') {
    await next();
    return;
  }

  const sessionCookie = getCookie(c, 'herald_session');
  if (!sessionCookie) {
    return c.redirect('/admin/login');
  }

  // Cookie format: "github:{username}:{expiry}.{signature}"
  const dotIndex = sessionCookie.lastIndexOf('.');
  if (dotIndex === -1) {
    return c.redirect('/admin/login');
  }

  const value = sessionCookie.slice(0, dotIndex);
  const signature = sessionCookie.slice(dotIndex + 1);

  const valid = await verifySignature(
    value,
    signature,
    c.env.GITHUB_CLIENT_SECRET,
  );
  if (!valid) {
    return c.redirect('/admin/login');
  }

  // Parse session value: "github:{username}:{expiry_ms}"
  const parts = value.split(':');
  if (parts.length !== 3 || parts[0] !== 'github') {
    return c.redirect('/admin/login');
  }

  const [, username, expiryStr] = parts;
  const expiry = parseInt(expiryStr, 10);
  if (isNaN(expiry) || Date.now() > expiry) {
    // Session expired — clear the stale cookie
    deleteCookie(c, 'herald_session', { path: '/admin' });
    return c.redirect('/admin/login');
  }

  c.set('githubUser', username);
  await next();
});
