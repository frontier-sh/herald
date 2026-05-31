import { Hono } from 'hono';
import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Bindings } from '../bindings';
import { signValue, verifySignature } from '../middleware/auth';
import { resolveBaseUrl } from '../middleware/base-url';
import {
  getGitHubAuthUrl,
  exchangeCodeForToken,
  getGitHubUser,
} from '../services/github';
import {
  getAppConfig,
  setAllowedRepo,
  listInstallationRepositoriesForUser,
} from '../services/github-app';
import { SetupChooseRepo } from '../views/pages/setup-wizard';

const auth = new Hono<{ Bindings: Bindings }>();

// Issues the signed admin session cookie and redirects into the panel.
async function startSession(c: Context, sessionSecret: string, login: string) {
  const value = `github:${login}:${Date.now() + 7 * 24 * 60 * 60 * 1000}`;
  const sig = await signValue(value, sessionSecret);
  setCookie(c, 'herald_session', `${value}.${sig}`, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/admin',
    maxAge: 7 * 24 * 60 * 60,
  });
  return c.redirect('/admin');
}

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

  const redirectUri = `${resolveBaseUrl(c)}/auth/github/callback`;
  return c.redirect(getGitHubAuthUrl(cfg.client_id, redirectUri, state));
});

auth.get('/github/callback', async (c) => {
  const cfg = await getAppConfig(c.env.DB);
  if (!cfg || !cfg.installation_id) {
    return c.redirect('/setup');
  }

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

  const redirectUri = `${resolveBaseUrl(c)}/auth/github/callback`;

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

  // The user token only lists repos in the intersection of the installation
  // and the user's own access, so membership here proves both.
  const repos = await listInstallationRepositoriesForUser(
    accessToken,
    cfg.installation_id,
  );
  if (!repos || repos.length === 0) {
    return c.redirect('/admin/login?error=no_access');
  }

  // First login: no gating repo chosen yet. Auto-select when unambiguous,
  // otherwise let the user pick from the installation's repos.
  if (!cfg.allowed_repo) {
    if (repos.length === 1) {
      await setAllowedRepo(c.env.DB, repos[0].full_name);
      return startSession(c, cfg.session_secret, user.login);
    }
    // Sign the user + candidate repos so the follow-up POST is stateless and
    // tamper-proof (no token is persisted between requests).
    const payload = btoa(
      JSON.stringify({
        u: user.login,
        r: repos.map((r) => r.full_name),
        e: Date.now() + 10 * 60 * 1000,
      }),
    );
    const authToken = `${payload}.${await signValue(payload, cfg.session_secret)}`;
    return c.html(
      <SetupChooseRepo repos={repos} auth={authToken} />,
    );
  }

  const target = cfg.allowed_repo.toLowerCase();
  const hasAccess = repos.some((r) => r.full_name.toLowerCase() === target);
  if (!hasAccess) {
    return c.redirect(
      `/admin/login?error=no_access&repo=${encodeURIComponent(cfg.allowed_repo)}`,
    );
  }

  return startSession(c, cfg.session_secret, user.login);
});

// Completes first-login repo selection (see /github/callback). The signed
// `auth` field carries the authenticated user and the repos they may pick.
auth.post('/github/select-repo', async (c) => {
  const cfg = await getAppConfig(c.env.DB);
  if (!cfg || !cfg.installation_id) {
    return c.redirect('/setup');
  }

  const body = await c.req.parseBody();
  const chosen = String(body.repo || '').trim();
  const authField = String(body.auth || '');
  const dot = authField.lastIndexOf('.');
  if (dot === -1) {
    return c.redirect('/admin/login?error=csrf_failed');
  }
  const payload = authField.slice(0, dot);
  const sig = authField.slice(dot + 1);
  if (!(await verifySignature(payload, sig, cfg.session_secret))) {
    return c.redirect('/admin/login?error=csrf_failed');
  }

  let data: { u: string; r: string[]; e: number };
  try {
    data = JSON.parse(atob(payload));
  } catch {
    return c.redirect('/admin/login?error=oauth_failed');
  }
  if (Date.now() > data.e) {
    return c.redirect('/admin/login?error=oauth_failed');
  }
  if (!chosen || !data.r.includes(chosen)) {
    return c.redirect('/admin/login?error=no_access');
  }

  await setAllowedRepo(c.env.DB, chosen);
  return startSession(c, cfg.session_secret, data.u);
});

auth.post('/logout', (c) => {
  deleteCookie(c, 'herald_session', { path: '/admin' });
  return c.redirect('/admin/login');
});

export default auth;
