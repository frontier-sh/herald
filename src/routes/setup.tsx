import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Bindings } from '../bindings';
import { signValue, verifySignature } from '../middleware/auth';
import { buildManifest } from '../services/manifest';
import {
  convertManifestCode,
  saveInitialAppConfig,
  setInstallation,
  getAppConfig,
  generateSessionSecret,
  listInstallationRepositoriesForUser,
  acknowledgeManifestVersion,
  EXPECTED_MANIFEST_VERSION,
} from '../services/github-app';
import {
  exchangeCodeForToken,
} from '../services/github';
import {
  SetupStart,
  SetupInstall,
  SetupChooseRepo,
  SetupError,
  SetupUpgrade,
} from '../views/pages/setup-wizard';

const setup = new Hono<{ Bindings: Bindings }>();

function baseUrlFrom(c: any): string {
  if (c.env.BASE_URL) return c.env.BASE_URL.replace(/\/$/, '');
  const url = new URL(c.req.url);
  return `${url.protocol}//${url.host}`;
}

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

  const baseUrl = baseUrlFrom(c);
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

  // We need a user-to-server token to list the repos this installation covers,
  // so kick the user through the OAuth dance with the installation_id in state.
  const baseUrl = baseUrlFrom(c);
  const state = `install:${installationId}:${crypto.randomUUID()}`;
  const signedState = `${state}.${await signValue(state, cfg.session_secret)}`;
  setCookie(c, 'herald_setup_state', signedState, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/setup',
    maxAge: 600,
  });

  const authUrl = new URL('https://github.com/login/oauth/authorize');
  authUrl.searchParams.set('client_id', cfg.client_id);
  authUrl.searchParams.set('redirect_uri', `${baseUrl}/setup/oauth-callback`);
  authUrl.searchParams.set('state', state);
  return c.redirect(authUrl.toString());
});

// ─── /setup/oauth-callback ──────────────────────────────
// Returns from the GitHub user OAuth dance triggered by /setup/installed,
// then renders a repo picker scoped to the installation's repos.

setup.get('/oauth-callback', async (c) => {
  const cfg = await getAppConfig(c.env.DB);
  if (!cfg) return c.redirect('/setup');

  const code = c.req.query('code');
  const state = c.req.query('state');
  if (!code || !state) {
    return c.html(<SetupError message="Missing OAuth response from GitHub." />, 400);
  }

  const stateCookie = getCookie(c, 'herald_setup_state');
  deleteCookie(c, 'herald_setup_state', { path: '/setup' });
  if (!stateCookie) {
    return c.html(<SetupError message="Setup session expired." />, 400);
  }
  const dot = stateCookie.lastIndexOf('.');
  if (dot === -1) {
    return c.html(<SetupError message="Invalid setup session." />, 400);
  }
  const cookieState = stateCookie.slice(0, dot);
  const cookieSig = stateCookie.slice(dot + 1);
  const ok = await verifySignature(cookieState, cookieSig, cfg.session_secret);
  if (!ok || cookieState !== state) {
    return c.html(<SetupError message="Setup state check failed." />, 400);
  }

  const stateParts = state.split(':');
  if (stateParts[0] !== 'install') {
    return c.html(<SetupError message="Invalid setup state." />, 400);
  }
  const installationId = Number(stateParts[1]);

  const baseUrl = baseUrlFrom(c);
  const accessToken = await exchangeCodeForToken(
    code,
    cfg.client_id,
    cfg.client_secret,
    `${baseUrl}/setup/oauth-callback`,
  );
  if (!accessToken) {
    return c.html(<SetupError message="GitHub OAuth exchange failed." />, 502);
  }

  const repos = await listInstallationRepositoriesForUser(
    accessToken,
    installationId,
  );
  if (!repos || repos.length === 0) {
    return c.html(
      <SetupError message="No repositories visible for this installation. Re-run setup and pick at least one repository to install on." />,
      400,
    );
  }

  return c.html(
    <SetupChooseRepo repos={repos} installationId={installationId} />,
  );
});

// ─── /setup/upgrade ─────────────────────────────────────
// Surfaces an out-of-date manifest_version. After the user approves the new
// App permissions on GitHub, they POST /setup/upgrade/acknowledge to record it.

setup.get('/upgrade', async (c) => {
  const cfg = await getAppConfig(c.env.DB);
  if (!cfg) return c.redirect('/setup');
  return c.html(
    <SetupUpgrade
      appHtmlUrl={cfg.html_url}
      currentVersion={cfg.manifest_version}
      expectedVersion={EXPECTED_MANIFEST_VERSION}
    />,
  );
});

setup.post('/upgrade/acknowledge', async (c) => {
  await acknowledgeManifestVersion(c.env.DB, EXPECTED_MANIFEST_VERSION);
  return c.redirect('/admin');
});

// ─── POST /setup/repo ───────────────────────────────────
// Final step: save the chosen repo + installation_id, redirect to admin.

setup.post('/repo', async (c) => {
  const cfg = await getAppConfig(c.env.DB);
  if (!cfg) return c.redirect('/setup');

  const body = await c.req.parseBody();
  const repo = String(body.repo || '').trim();
  const installationId = Number(body.installation_id);

  if (!repo || !installationId) {
    return c.html(<SetupError message="Missing repository or installation_id." />, 400);
  }

  await setInstallation(c.env.DB, installationId, repo);
  return c.redirect('/admin/login');
});

export default setup;
