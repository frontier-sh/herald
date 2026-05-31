// GitHub App manifest used by the setup wizard.

// GitHub App names must be globally unique across all of GitHub and are
// capped at 34 characters. We compose "Herald <label>" where <label> is a
// sanitized, unique token (the deployment host by default, or the org slug
// when the user targets an organization). The inline script in
// setup-wizard.tsx mirrors this logic when it rewrites the name for orgs —
// keep the two in sync.
export const APP_NAME_MAX = 34;
const APP_NAME_PREFIX = 'Herald ';

export function heraldAppName(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const room = APP_NAME_MAX - APP_NAME_PREFIX.length;
  return (APP_NAME_PREFIX + slug.slice(0, room)).slice(0, APP_NAME_MAX);
}

export function buildManifest(baseUrl: string): Record<string, unknown> {
  let host = baseUrl;
  try {
    host = new URL(baseUrl).hostname;
  } catch {
    // baseUrl already normalized without protocol; fall back to as-is.
  }
  return {
    name: heraldAppName(host),
    url: baseUrl,
    description: 'Self-hosted changelog admin for this repository.',
    public: false,
    redirect_url: `${baseUrl}/setup/callback`,
    callback_urls: [`${baseUrl}/auth/github/callback`],
    setup_url: `${baseUrl}/setup/installed`,
    setup_on_update: false,
    request_oauth_on_install: false,
    // The App is used only to gate admin login to a repository's
    // collaborators, so `metadata: read` is all it needs. Commit reading for
    // "Generate from commits" uses a separate PAT (see github-commits.ts).
    default_permissions: {
      metadata: 'read',
    },
    default_events: [],
  };
}
