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
import { getAppConfig } from '../services/github-app';

const auth = new Hono<{ Bindings: Bindings }>();

auth.get('/github', async (c) => {
  const cfg = await getAppConfig(c.env.DB);
  if (!cfg) return c.redirect('/setup');

  const state = crypto.randomUUID();
  const signedState = `${state}.${await signValue(state, cfg.session_secret)}`;

  setCookie(c, 'herald_oauth_state', signedState, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/auth',
    maxAge: 300,
  });

  const url = new URL(c.req.url);
  const redirectUri = `${url.protocol}//${url.host}/auth/github/callback`;
  return c.redirect(getGitHubAuthUrl(cfg.client_id, redirectUri, state));
});

auth.get('/github/callback', async (c) => {
  const cfg = await getAppConfig(c.env.DB);
  if (!cfg || !cfg.allowed_repo) return c.redirect('/setup');

  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');

  if (error) {
    return c.redirect('/admin/login?error=oauth_denied');
  }
  if (!code || !state) {
    return c.redirect('/admin/login?error=oauth_failed');
  }

  const stateCookie = getCookie(c, 'herald_oauth_state');
  deleteCookie(c, 'herald_oauth_state', { path: '/auth' });
  if (!stateCookie) {
    return c.redirect('/admin/login?error=csrf_failed');
  }
  const dot = stateCookie.lastIndexOf('.');
  if (dot === -1) return c.redirect('/admin/login?error=csrf_failed');
  const cookieState = stateCookie.slice(0, dot);
  const cookieSig = stateCookie.slice(dot + 1);
  const stateValid = await verifySignature(
    cookieState,
    cookieSig,
    cfg.session_secret,
  );
  if (!stateValid || cookieState !== state) {
    return c.redirect('/admin/login?error=csrf_failed');
  }

  const url = new URL(c.req.url);
  const redirectUri = `${url.protocol}//${url.host}/auth/github/callback`;

  const accessToken = await exchangeCodeForToken(
    code,
    cfg.client_id,
    cfg.client_secret,
    redirectUri,
  );
  if (!accessToken) {
    return c.redirect('/admin/login?error=oauth_failed');
  }

  const user = await getGitHubUser(accessToken);
  if (!user) {
    return c.redirect('/admin/login?error=oauth_failed');
  }

  const hasAccess = await checkRepoAccess(accessToken, cfg.allowed_repo);
  if (!hasAccess) {
    return c.redirect(
      `/admin/login?error=no_access&repo=${encodeURIComponent(cfg.allowed_repo)}`,
    );
  }

  const expiry = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const sessionValue = `github:${user.login}:${expiry}`;
  const signature = await signValue(sessionValue, cfg.session_secret);

  setCookie(c, 'herald_session', `${sessionValue}.${signature}`, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/admin',
    maxAge: 7 * 24 * 60 * 60,
  });

  return c.redirect('/admin');
});

auth.post('/logout', (c) => {
  deleteCookie(c, 'herald_session', { path: '/admin' });
  return c.redirect('/admin/login');
});

export default auth;
