import type { FC } from 'hono/jsx';
import { ClientHead } from '../components/client-assets';
import { DEFAULT_FAVICON } from '../components/default-favicon';

interface ShellProps {
  title: string;
  children: any;
}

const Shell: FC<ShellProps> = ({ title, children }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>{title} — Herald</title>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossorigin="anonymous"
      />
      <link
        href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200..800&family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=JetBrains+Mono:wght@400;500;600&display=swap"
        rel="stylesheet"
      />
      <link rel="icon" href={DEFAULT_FAVICON} />
      <ClientHead />
    </head>
    <body class="login-body">
      <div class="login-container">
        <div class="login-card">{children}</div>
      </div>
    </body>
  </html>
);

interface StartProps {
  manifest: string;
  baseUrl: string;
  state: string;
}

export const SetupStart: FC<StartProps> = ({ manifest, baseUrl, state }) => (
  <Shell title="Setup">
    <div class="login-header">
      <h1 class="login-brand">Herald</h1>
      <p class="login-subtitle">One-click setup</p>
    </div>
    <p class="setup-text">
      Herald will create a private GitHub App and use it to gate the admin
      panel to your repository's collaborators. No copy/paste, no client
      secrets — GitHub generates them and hands them straight back to this
      deployment.
    </p>
    <p class="setup-text">
      <strong>Where should the App live?</strong> Leave the field below blank
      to create it on your personal account, or enter an organization slug to
      create it under an organization you own. A private App can only be
      installed on the account that owns it, so to gate access to an{' '}
      <em>org</em> repository, create the App under that org.
    </p>
    <p class="setup-text">
      <strong>What happens next:</strong> click the button, review the App
      details on GitHub, click <em>Create GitHub App</em>, then install it on
      the repository whose collaborators should have access.
    </p>
    <form
      id="herald-setup-form"
      action="https://github.com/settings/apps/new"
      method="post"
      class="mt-6"
    >
      <label for="herald-org" class="form-label">
        GitHub organization (optional)
      </label>
      <input
        type="text"
        id="herald-org"
        class="form-control mt-2 mb-4"
        placeholder="my-org"
        autocomplete="off"
        autocapitalize="off"
        spellcheck={false}
      />
      <input type="hidden" name="manifest" value={manifest} id="herald-manifest" />
      <input type="hidden" name="state" value={state} />
      <button type="submit" class="btn btn-primary btn-lg login-btn">
        Create GitHub App
      </button>
    </form>
    <p class="login-info mt-5">
      Deployment URL: <code>{baseUrl}</code>
    </p>
    <script
      dangerouslySetInnerHTML={{
        __html: `
(function () {
  var APP_NAME_MAX = 34;
  var APP_NAME_PREFIX = 'Herald ';
  function heraldAppName(label) {
    var slug = String(label).toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    var room = APP_NAME_MAX - APP_NAME_PREFIX.length;
    return (APP_NAME_PREFIX + slug.slice(0, room)).slice(0, APP_NAME_MAX);
  }
  var form = document.getElementById('herald-setup-form');
  var orgInput = document.getElementById('herald-org');
  var manifestInput = document.getElementById('herald-manifest');
  form.addEventListener('submit', function () {
    var org = (orgInput.value || '').trim()
      .replace(/^@/, '')
      .replace(/^https?:\\/\\/github\\.com\\//i, '')
      .replace(/\\/.*$/, '')
      .trim();
    if (org) {
      form.action = 'https://github.com/organizations/' +
        encodeURIComponent(org) + '/settings/apps/new';
      try {
        var m = JSON.parse(manifestInput.value);
        m.name = heraldAppName(org);
        manifestInput.value = JSON.stringify(m);
      } catch (e) {}
    } else {
      form.action = 'https://github.com/settings/apps/new';
    }
  });
})();
`,
      }}
    />
  </Shell>
);

interface InstallProps {
  installUrl: string;
}

export const SetupInstall: FC<InstallProps> = ({ installUrl }) => (
  <Shell title="Install App">
    <div class="login-header">
      <h1 class="login-brand">Herald</h1>
      <p class="login-subtitle">Step 2 of 2 — Install the App</p>
    </div>
    <p class="setup-text">
      GitHub App created. Now install it on the repository whose collaborators
      should be able to sign in to Herald.
    </p>
    <a href={installUrl} class="btn btn-primary btn-lg login-btn">
      Install on a repository
    </a>
  </Shell>
);

interface ChooseRepoProps {
  repos: { full_name: string }[];
  // Signed token carrying the authenticated user + candidate repos; verified
  // by POST /auth/github/select-repo.
  auth: string;
  error?: string;
}

export const SetupChooseRepo: FC<ChooseRepoProps> = ({
  repos,
  auth,
  error,
}) => (
  <Shell title="Choose Repository">
    <div class="login-header">
      <h1 class="login-brand">Herald</h1>
      <p class="login-subtitle">Pick the access-gating repository</p>
    </div>
    {error && (
      <div class="alert alert-danger" role="alert">
        <span>{error}</span>
      </div>
    )}
    <p class="setup-text">
      Collaborators on this repository will be allowed to sign in to the admin
      panel.
    </p>
    <form action="/auth/github/select-repo" method="post">
      <input type="hidden" name="auth" value={auth} />
      <select name="repo" class="form-control my-4">
        {repos.map((r) => (
          <option value={r.full_name}>{r.full_name}</option>
        ))}
      </select>
      <button type="submit" class="btn btn-primary btn-lg login-btn">
        Continue
      </button>
    </form>
  </Shell>
);

interface ErrorProps {
  message: string;
}

export const SetupError: FC<ErrorProps> = ({ message }) => (
  <Shell title="Setup Error">
    <div class="login-header">
      <h1 class="login-brand">Herald</h1>
      <p class="login-subtitle">Setup error</p>
    </div>
    <div class="alert alert-danger" role="alert">
      <span>{message}</span>
    </div>
    <a href="/setup" class="btn btn-secondary mt-4">
      Start over
    </a>
  </Shell>
);
