import { createMiddleware } from 'hono/factory';
import { getCookie, setCookie } from 'hono/cookie';
import type { Context } from 'hono';
import type { Bindings } from '../bindings';
import { validateApiKey } from '../services/api-keys';

// HMAC-SHA256 signing for session cookies
async function signValue(value: string, secret: string): Promise<string> {
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

async function verifySignature(
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

/**
 * Admin authentication middleware.
 * Checks for a valid signed session cookie. Redirects to /admin/login if not authenticated.
 * Excludes /admin/login GET and POST from auth check.
 */
export const adminAuth = createMiddleware<{ Bindings: Bindings }>(
  async (c, next) => {
    const path = new URL(c.req.url).pathname;

    // Exclude login routes from auth check
    if (path === '/admin/login') {
      await next();
      return;
    }

    const sessionCookie = getCookie(c, 'herald_session');
    if (!sessionCookie) {
      return c.redirect('/admin/login');
    }

    // Cookie format: "value.signature"
    const dotIndex = sessionCookie.lastIndexOf('.');
    if (dotIndex === -1) {
      return c.redirect('/admin/login');
    }

    const value = sessionCookie.slice(0, dotIndex);
    const signature = sessionCookie.slice(dotIndex + 1);

    const valid = await verifySignature(
      value,
      signature,
      c.env.ADMIN_PASSWORD,
    );
    if (!valid) {
      return c.redirect('/admin/login');
    }

    await next();
  },
);

/**
 * Login handler: verifies password and sets signed session cookie.
 */
export async function loginHandler(c: Context<{ Bindings: Bindings }>) {
  const body = await c.req.parseBody();
  const password = body['password'];

  if (typeof password !== 'string' || password !== c.env.ADMIN_PASSWORD) {
    return c.html(
      `<!DOCTYPE html>
<html>
<head><title>Herald - Login</title></head>
<body>
  <h1>Herald Admin Login</h1>
  <p style="color: red;">Invalid password. Please try again.</p>
  <form method="POST" action="/admin/login">
    <label>Password: <input type="password" name="password" required /></label>
    <button type="submit">Login</button>
  </form>
</body>
</html>`,
      401,
    );
  }

  // Create signed session value
  const sessionValue = 'authenticated';
  const signature = await signValue(sessionValue, c.env.ADMIN_PASSWORD);
  const cookieValue = `${sessionValue}.${signature}`;

  setCookie(c, 'herald_session', cookieValue, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/admin',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  return c.redirect('/admin');
}
