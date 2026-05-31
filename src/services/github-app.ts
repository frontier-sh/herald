import type { GitHubAppConfig } from '../db/schema';
import { encryptSecret, decryptSecret } from './secrets';

const GITHUB_API = 'https://api.github.com';
const USER_AGENT = 'Herald-Changelog';

export async function getAppConfig(
  db: D1Database,
): Promise<GitHubAppConfig | null> {
  return await db
    .prepare('SELECT * FROM github_app_config WHERE id = 1')
    .first<GitHubAppConfig>();
}

export async function generateSessionSecret(): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface ManifestConversion {
  client_id: string;
  client_secret: string;
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
       (id, client_id, client_secret, html_url, installation_id, allowed_repo, session_secret, created_at, updated_at)
       VALUES (1, ?, ?, ?, NULL, NULL, ?, datetime('now'), datetime('now'))`,
    )
    .bind(conv.client_id, conv.client_secret, conv.html_url, sessionSecret)
    .run();
}

// Records the installation_id once the App is installed. The access-gating
// repo (allowed_repo) is chosen later, on the first admin login.
export async function setInstallationId(
  db: D1Database,
  installationId: number,
): Promise<void> {
  await db
    .prepare(
      `UPDATE github_app_config
       SET installation_id = ?, updated_at = datetime('now')
       WHERE id = 1`,
    )
    .bind(installationId)
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

// ─── Source PAT (Generate from commits) ──────────────────
// The token is encrypted with a key derived from session_secret and stored on
// the single-row app config. It is write-only from the UI's perspective: it is
// never sent back to a client, only decrypted server-side to call the API.

export async function setSourceToken(
  db: D1Database,
  sessionSecret: string,
  token: string,
): Promise<void> {
  const encrypted = await encryptSecret(token, sessionSecret);
  await db
    .prepare(
      `UPDATE github_app_config
       SET source_pat = ?, updated_at = datetime('now')
       WHERE id = 1`,
    )
    .bind(encrypted)
    .run();
}

export async function clearSourceToken(db: D1Database): Promise<void> {
  await db
    .prepare(
      `UPDATE github_app_config
       SET source_pat = NULL, updated_at = datetime('now')
       WHERE id = 1`,
    )
    .run();
}

// Decrypts the stored PAT for server-side use. Returns null when none is set
// or decryption fails (e.g. session_secret was rotated).
export async function getSourceToken(
  cfg: GitHubAppConfig,
): Promise<string | null> {
  if (!cfg.source_pat) return null;
  return decryptSecret(cfg.source_pat, cfg.session_secret);
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
