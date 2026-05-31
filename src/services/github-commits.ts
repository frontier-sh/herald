/**
 * Reads commits from a source repository using a GitHub personal access token.
 *
 * The token is supplied by the admin in Settings (a fine-grained PAT with
 * read-only `contents` access is enough) and passed straight through as the
 * REST API bearer token. This keeps commit reading entirely decoupled from the
 * GitHub App used for login.
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
 * `token` is a GitHub personal access token with read access to the repo.
 */
export async function listRepoCommits(
  token: string,
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
          Authorization: `Bearer ${token}`,
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
