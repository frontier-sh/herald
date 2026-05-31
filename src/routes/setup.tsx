import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Bindings } from '../bindings';
import { signValue, verifySignature } from '../middleware/auth';
import { resolveBaseUrl } from '../middleware/base-url';
import { buildManifest } from '../services/manifest';
import {
  convertManifestCode,
  saveInitialAppConfig,
  setInstallationId,
  getAppConfig,
  generateSessionSecret,
} from '../services/github-app';
import { SetupStart, SetupInstall, SetupError } from '../views/pages/setup-wizard';

const setup = new Hono<{ Bindings: Bindings }>();

// Pre-shared key for signing the setup CSRF cookie. Used only until the
// real session_secret is generated and stored in D1.
const SETUP_CSRF_KEY = 'herald-setup-csrf-v1';

// ─── /setup ─────────────────────────────────────────────
// Landing page for the manifest flow.

setup.get('/', async (c) => {
  const existing = await getAppConfig(c.env.DB);
  if (existing?.installation_id && existing?.allowed_repo) {
    return c.redirect('/admin');
  }

  const baseUrl = resolveBaseUrl(c);
  const state = crypto.randomUUID();
  const signedState = `${state}.${await signValue(state, SETUP_CSRF_KEY)}`;
  setCookie(c, 'herald_setup_state', signedState, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/setup',
    maxAge: 600,
  });

  const manifest = JSON.stringify(buildManifest(baseUrl));
  return c.html(
    <SetupStart manifest={manifest} baseUrl={baseUrl} state={state} />,
  );
});

// ─── /setup/callback ────────────────────────────────────
// GitHub redirects here after the user creates the App from the manifest.
// We exchange the temporary code for the App's credentials and save them.

setup.get('/callback', async (c) => {
  const existing = await getAppConfig(c.env.DB);
  if (existing?.installation_id && existing?.allowed_repo) {
    return c.redirect('/admin');
  }

  const code = c.req.query('code');
  const state = c.req.query('state');
  if (!code || !state) {
    return c.html(<SetupError message="Missing code or state from GitHub." />, 400);
  }

  const stateCookie = getCookie(c, 'herald_setup_state');
  deleteCookie(c, 'herald_setup_state', { path: '/setup' });
  if (!stateCookie) {
    return c.html(<SetupError message="Setup session expired. Please start again." />, 400);
  }
  const dot = stateCookie.lastIndexOf('.');
  if (dot === -1) {
    return c.html(<SetupError message="Invalid setup session." />, 400);
  }
  const cookieState = stateCookie.slice(0, dot);
  const cookieSig = stateCookie.slice(dot + 1);
  const ok = await verifySignature(cookieState, cookieSig, SETUP_CSRF_KEY);
  if (!ok || cookieState !== state) {
    return c.html(<SetupError message="Setup state check failed." />, 400);
  }

  const conv = await convertManifestCode(code);
  if (!conv) {
    return c.html(
      <SetupError message="GitHub rejected the manifest code. Please try again." />,
      502,
    );
  }

  const sessionSecret = await generateSessionSecret();
  await saveInitialAppConfig(c.env.DB, conv, sessionSecret);

  const installUrl = `${conv.html_url}/installations/new`;
  return c.html(<SetupInstall installUrl={installUrl} />);
});

// ─── /setup/installed ───────────────────────────────────
// GitHub redirects here after the App is installed (manifest setup_url).
// Query: ?installation_id=…&setup_action=install
//
// We record the installation and hand off to /admin/login. The access-gating
// repo is chosen during that first login (which already obtains a user token),
// so no separate OAuth dance is needed here.

setup.get('/installed', async (c) => {
  const cfg = await getAppConfig(c.env.DB);
  if (!cfg) {
    return c.redirect('/setup');
  }

  const installationIdStr = c.req.query('installation_id');
  const installationId = installationIdStr ? Number(installationIdStr) : null;
  if (!installationId || Number.isNaN(installationId)) {
    return c.html(
      <SetupError message="GitHub did not return an installation_id." />,
      400,
    );
  }

  await setInstallationId(c.env.DB, installationId);
  return c.redirect('/admin/login');
});

export default setup;
