/**
 * Reads commits from a source repository using a GitHub App installation token.
 *
 * The logged-in admin's OAuth token is not persisted, so we authenticate as the
 * App: mint a short-lived RS256 JWT from the stored private key, exchange it for
 * an installation access token, then call the REST API with that token. This
 * requires the App to hold the `contents: read` permission and to be granted
 * access to the source repository (see manifest.ts / EXPECTED_MANIFEST_VERSION).
 */

const GITHUB_API = 'https://api.github.com';
const USER_AGENT = 'Herald-Changelog';

/** Error carrying the GitHub HTTP status so callers can react (e.g. 403). */
export class GitHubApiError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`GitHub API error ${status}: ${body}`);
    this.name = 'GitHubApiError';
  }
}

// ─── Base64 / DER helpers ────────────────────────────────

function base64UrlFromString(input: string): string {
  return base64UrlFromBytes(new TextEncoder().encode(input));
}

function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

/** DER length octets (short or long form). */
function derLength(len: number): Uint8Array {
  if (len < 0x80) return new Uint8Array([len]);
  const bytes: number[] = [];
  let n = len;
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>= 8;
  }
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
}

function derEncode(tag: number, content: Uint8Array): Uint8Array {
  return concatBytes(new Uint8Array([tag]), derLength(content.length), content);
}

/**
 * Wrap a PKCS#1 `RSAPrivateKey` (what GitHub issues) in a PKCS#8
 * `PrivateKeyInfo` so it can be imported via WebCrypto's `pkcs8` format.
 */
function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array {
  const version = new Uint8Array([0x02, 0x01, 0x00]); // INTEGER 0
  // AlgorithmIdentifier { rsaEncryption (1.2.840.113549.1.1.1), NULL }
  const rsaAlgId = new Uint8Array([
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01,
    0x01, 0x05, 0x00,
  ]);
  const privateKeyOctet = derEncode(0x04, pkcs1); // OCTET STRING
  const inner = concatBytes(version, rsaAlgId, privateKeyOctet);
  return derEncode(0x30, inner); // SEQUENCE
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const isPkcs1 = pem.includes('BEGIN RSA PRIVATE KEY');
  const b64 = pem
    .replace(/-----BEGIN[^-]+-----/g, '')
    .replace(/-----END[^-]+-----/g, '')
    .replace(/\s+/g, '');
  let der = base64ToBytes(b64);
  if (isPkcs1) der = pkcs1ToPkcs8(der);
  return crypto.subtle.importKey(
    'pkcs8',
    der as unknown as BufferSource,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

// ─── App / installation auth ─────────────────────────────

/** Mint a short-lived RS256 JWT signed as the GitHub App. */
export async function generateAppJWT(appId: number, pem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  // iat back-dated 60s to tolerate clock drift; exp must be <= 10 minutes.
  const payload = { iat: now - 60, exp: now + 540, iss: String(appId) };
  const signingInput =
    base64UrlFromString(JSON.stringify(header)) +
    '.' +
    base64UrlFromString(JSON.stringify(payload));

  const key = await importPrivateKey(pem);
  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    new TextEncoder().encode(signingInput),
  );
  return signingInput + '.' + base64UrlFromBytes(new Uint8Array(signature));
}

/** Exchange an App JWT for an installation access token. */
export async function getInstallationToken(
  appId: number,
  pem: string,
  installationId: number,
): Promise<string> {
  const jwt = await generateAppJWT(appId, pem);
  const res = await fetch(
    `${GITHUB_API}/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': USER_AGENT,
      },
    },
  );
  if (!res.ok) throw new GitHubApiError(res.status, await res.text());
  const data = (await res.json()) as { token: string };
  return data.token;
}

// ─── Repositories ────────────────────────────────────────

export interface InstallationRepo {
  full_name: string;
}

/** List repositories the installation can access (app-to-server). */
export async function listInstallationRepositories(
  installationToken: string,
): Promise<InstallationRepo[]> {
  const repos: InstallationRepo[] = [];
  let page = 1;
  while (page <= 10) {
    const res = await fetch(
      `${GITHUB_API}/installation/repositories?per_page=100&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${installationToken}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': USER_AGENT,
        },
      },
    );
    if (!res.ok) throw new GitHubApiError(res.status, await res.text());
    const data = (await res.json()) as { repositories: InstallationRepo[] };
    if (!data.repositories?.length) break;
    repos.push(...data.repositories.map((r) => ({ full_name: r.full_name })));
    if (data.repositories.length < 100) break;
    page++;
  }
  return repos;
}

// ─── Commits ─────────────────────────────────────────────

export interface CommitInfo {
  sha: string;
  title: string;
  message: string;
  author: string;
  date: string;
  url: string;
  isMerge: boolean;
}

export interface ListCommitsOptions {
  /** Count mode: fetch the most recent N commits. */
  count?: number;
  /** Date-range mode: ISO timestamps. */
  since?: string;
  until?: string;
  /** Hard upper bound regardless of mode. */
  maxCommits?: number;
}

interface RawCommit {
  sha: string;
  html_url: string;
  commit: { message: string; author: { name?: string; date?: string } | null };
  author: { login?: string } | null;
  parents?: unknown[];
}

function parseCommit(raw: RawCommit): CommitInfo {
  const message = raw.commit?.message ?? '';
  const title = message.split('\n')[0].trim();
  return {
    sha: raw.sha,
    title,
    message,
    author: raw.commit?.author?.name || raw.author?.login || 'Unknown',
    date: raw.commit?.author?.date || '',
    url: raw.html_url,
    isMerge: Array.isArray(raw.parents) && raw.parents.length > 1,
  };
}

/**
 * List commits for `owner/repo`. Provide `count` for the most-recent-N mode,
 * or `since`/`until` for a date range. Results are capped by `maxCommits`.
 */
export async function listRepoCommits(
  installationToken: string,
  repo: string,
  opts: ListCommitsOptions,
): Promise<CommitInfo[]> {
  const cap = opts.maxCommits ?? 200;
  const target = opts.count && opts.count > 0 ? Math.min(opts.count, cap) : cap;
  const perPage = Math.min(100, target);

  const commits: CommitInfo[] = [];
  let page = 1;
  while (commits.length < target && page <= 20) {
    const params = new URLSearchParams({
      per_page: String(perPage),
      page: String(page),
    });
    if (opts.since) params.set('since', opts.since);
    if (opts.until) params.set('until', opts.until);

    const res = await fetch(
      `${GITHUB_API}/repos/${repo}/commits?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${installationToken}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': USER_AGENT,
        },
      },
    );
    if (!res.ok) throw new GitHubApiError(res.status, await res.text());
    const batch = (await res.json()) as RawCommit[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const raw of batch) commits.push(parseCommit(raw));
    if (batch.length < perPage) break;
    page++;
  }

  return commits.slice(0, target);
}
