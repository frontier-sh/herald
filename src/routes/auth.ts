import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Bindings } from '../bindings';
import { signValue, verifySignature } from '../middleware/auth';
import {
  getGitHubAuthUrl,
  exchangeCodeForToken,
  getGitHubUser,
  checkRepoAccess,
} from '../services/github';

const auth = new Hono<{ Bindings: Bindings }>();

/**
 * GET /auth/github — Initiate GitHub OAuth flow.
 * Generates a CSRF state, stores it in a signed cookie, and redirects to GitHub.
 */
auth.get('/github', async (c) => {
  const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } = c.env;
  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    return c.text('GitHub OAuth is not configured.', 500);
  }

  const state = crypto.randomUUID();
  const signedState = `${state}.${await signValue(state, GITHUB_CLIENT_SECRET)}`;

  setCookie(c, 'herald_oauth_state', signedState, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/auth',
    maxAge: 300, // 5 minutes
  });

  const url = new URL(c.req.url);
  const redirectUri = `${url.protocol}//${url.host}/auth/github/callback`;
  const authUrl = getGitHubAuthUrl(GITHUB_CLIENT_ID, redirectUri, state);

  return c.redirect(authUrl);
});

/**
 * GET /auth/github/callback — Handle GitHub OAuth callback.
 * Verifies CSRF state, exchanges code for token, checks repo access, creates session.
 */
auth.get('/github/callback', async (c) => {
  const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_ALLOWED_REPO } =
    c.env;

  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');

  // User denied authorization on GitHub
  if (error) {
    return c.redirect('/admin/login?error=oauth_denied');
  }

  if (!code || !state) {
    return c.redirect('/admin/login?error=oauth_failed');
  }

  // Verify CSRF state
  const stateCookie = getCookie(c, 'herald_oauth_state');
  deleteCookie(c, 'herald_oauth_state', { path: '/auth' });

  if (!stateCookie) {
    return c.redirect('/admin/login?error=csrf_failed');
  }

  const dotIndex = stateCookie.lastIndexOf('.');
  if (dotIndex === -1) {
    return c.redirect('/admin/login?error=csrf_failed');
  }

  const cookieState = stateCookie.slice(0, dotIndex);
  const cookieSignature = stateCookie.slice(dotIndex + 1);

  const stateValid = await verifySignature(
    cookieState,
    cookieSignature,
    GITHUB_CLIENT_SECRET,
  );
  if (!stateValid || cookieState !== state) {
    return c.redirect('/admin/login?error=csrf_failed');
  }

  // Exchange code for access token
  const url = new URL(c.req.url);
  const redirectUri = `${url.protocol}//${url.host}/auth/github/callback`;

  const accessToken = await exchangeCodeForToken(
    code,
    GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET,
    redirectUri,
  );
  if (!accessToken) {
    return c.redirect('/admin/login?error=oauth_failed');
  }

  // Fetch GitHub user
  const user = await getGitHubUser(accessToken);
  if (!user) {
    return c.redirect('/admin/login?error=oauth_failed');
  }

  // Check repo access
  const hasAccess = await checkRepoAccess(accessToken, GITHUB_ALLOWED_REPO);
  if (!hasAccess) {
    return c.redirect(
      `/admin/login?error=no_access&repo=${encodeURIComponent(GITHUB_ALLOWED_REPO)}`,
    );
  }

  // Create signed session cookie: "github:{username}:{expiry}.{signature}"
  const expiry = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
  const sessionValue = `github:${user.login}:${expiry}`;
  const signature = await signValue(sessionValue, GITHUB_CLIENT_SECRET);

  setCookie(c, 'herald_session', `${sessionValue}.${signature}`, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/admin',
    maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
  });

  return c.redirect('/admin');
});

/**
 * POST /auth/logout — Destroy session and redirect to login.
 */
auth.post('/logout', (c) => {
  deleteCookie(c, 'herald_session', { path: '/admin' });
  return c.redirect('/admin/login');
});

export default auth;
