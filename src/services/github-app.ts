import type { GitHubAppConfig } from '../db/schema';

const GITHUB_API = 'https://api.github.com';
const USER_AGENT = 'Herald-Changelog';

// Bump when the manifest in src/services/manifest.ts requires permissions
// or events that earlier deployments would not have approved. Deployments
// with a lower manifest_version see an upgrade banner.
export const EXPECTED_MANIFEST_VERSION = 2;

export async function getAppConfig(
  db: D1Database,
): Promise<GitHubAppConfig | null> {
  return await db
    .prepare('SELECT * FROM github_app_config WHERE id = 1')
    .first<GitHubAppConfig>();
}

export async function isSetupComplete(db: D1Database): Promise<boolean> {
  const cfg = await getAppConfig(db);
  return !!(cfg && cfg.installation_id && cfg.allowed_repo);
}

export async function generateSessionSecret(): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface ManifestConversion {
  id: number;
  slug: string;
  client_id: string;
  client_secret: string;
  webhook_secret: string | null;
  pem: string;
  html_url: string;
}

export async function convertManifestCode(
  code: string,
): Promise<ManifestConversion | null> {
  const res = await fetch(
    `${GITHUB_API}/app-manifests/${encodeURIComponent(code)}/conversions`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': USER_AGENT,
      },
    },
  );
  if (!res.ok) {
    console.error(
      `convertManifestCode failed: ${res.status} ${res.statusText} — ${await res.text()}`,
    );
    return null;
  }
  const data = (await res.json()) as ManifestConversion;
  return data;
}

export async function saveInitialAppConfig(
  db: D1Database,
  conv: ManifestConversion,
  sessionSecret: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT OR REPLACE INTO github_app_config
       (id, app_id, slug, client_id, client_secret, webhook_secret, pem, html_url, installation_id, allowed_repo, manifest_version, session_secret, created_at, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, datetime('now'), datetime('now'))`,
    )
    .bind(
      conv.id,
      conv.slug,
      conv.client_id,
      conv.client_secret,
      conv.webhook_secret,
      conv.pem,
      conv.html_url,
      EXPECTED_MANIFEST_VERSION,
      sessionSecret,
    )
    .run();
}

export async function setInstallation(
  db: D1Database,
  installationId: number,
  allowedRepo: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE github_app_config
       SET installation_id = ?, allowed_repo = ?, updated_at = datetime('now')
       WHERE id = 1`,
    )
    .bind(installationId, allowedRepo)
    .run();
}

export async function acknowledgeManifestVersion(
  db: D1Database,
  version: number,
): Promise<void> {
  await db
    .prepare(
      `UPDATE github_app_config
       SET manifest_version = ?, updated_at = datetime('now')
       WHERE id = 1`,
    )
    .bind(version)
    .run();
}

export async function setAllowedRepo(
  db: D1Database,
  allowedRepo: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE github_app_config
       SET allowed_repo = ?, updated_at = datetime('now')
       WHERE id = 1`,
    )
    .bind(allowedRepo)
    .run();
}

export interface InstallationRepo {
  full_name: string;
}

// Lists repositories the App is installed on, using a user-to-server token.
// GET /user/installations/{installation_id}/repositories
export async function listInstallationRepositoriesForUser(
  accessToken: string,
  installationId: number,
): Promise<InstallationRepo[] | null> {
  const res = await fetch(
    `${GITHUB_API}/user/installations/${installationId}/repositories?per_page=100`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': USER_AGENT,
      },
    },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { repositories: InstallationRepo[] };
  return data.repositories;
}

// Lists installations of this App that the user has access to.
// GET /user/installations
export async function listUserInstallations(
  accessToken: string,
): Promise<{ id: number; account: { login: string } }[] | null> {
  const res = await fetch(`${GITHUB_API}/user/installations`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': USER_AGENT,
    },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    installations: { id: number; account: { login: string } }[];
  };
  return data.installations;
}
