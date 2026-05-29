import type { FC } from 'hono/jsx';
import { ClientHead } from '../components/client-assets';

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
      Herald will create a private GitHub App on your account and use it to
      gate the admin panel to your repository's collaborators. No copy/paste,
      no client secrets — GitHub generates them and hands them straight back to
      this deployment.
    </p>
    <p class="setup-text">
      <strong>What happens next:</strong> click the button, review the App
      details on GitHub, click <em>Create GitHub App</em>, then install it on
      the repository whose collaborators should have access.
    </p>
    <form
      action="https://github.com/settings/apps/new"
      method="post"
      style="margin-top: 1.5rem;"
    >
      <input type="hidden" name="manifest" value={manifest} />
      <input type="hidden" name="state" value={state} />
      <button type="submit" class="btn btn-primary btn-lg login-btn">
        Create GitHub App
      </button>
    </form>
    <p class="login-info" style="margin-top: 1.25rem;">
      Deployment URL: <code>{baseUrl}</code>
    </p>
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
  installationId: number;
  error?: string;
}

export const SetupChooseRepo: FC<ChooseRepoProps> = ({
  repos,
  installationId,
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
    <form action="/setup/repo" method="post">
      <input type="hidden" name="installation_id" value={installationId} />
      <select name="repo" class="form-control" style="margin: 1rem 0;">
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

interface UpgradeProps {
  appHtmlUrl: string;
  currentVersion: number;
  expectedVersion: number;
}

export const SetupUpgrade: FC<UpgradeProps> = ({
  appHtmlUrl,
  currentVersion,
  expectedVersion,
}) => (
  <Shell title="Upgrade Permissions">
    <div class="login-header">
      <h1 class="login-brand">Herald</h1>
      <p class="login-subtitle">GitHub App permissions out of date</p>
    </div>
    <p class="setup-text">
      Your deployment is configured for manifest version{' '}
      <code>{String(currentVersion)}</code> but this Herald build expects
      version <code>{String(expectedVersion)}</code>. New features may not
      work until the App is updated.
    </p>
    <p class="setup-text">
      Open the App settings on GitHub, review the requested permissions, and
      approve the changes. GitHub will prompt repository owners to accept the
      new permissions.
    </p>
    <a href={appHtmlUrl} class="btn btn-primary btn-lg login-btn">
      Open App settings on GitHub
    </a>
    <p class="login-info" style="margin-top: 1.25rem;">
      Once approved, restart the setup wizard to record the new version.
    </p>
    <form action="/setup/upgrade/acknowledge" method="post" style="margin-top: 0.75rem;">
      <button type="submit" class="btn btn-secondary">
        I have approved the new permissions
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
    <a href="/setup" class="btn btn-secondary" style="margin-top: 1rem;">
      Start over
    </a>
  </Shell>
);
