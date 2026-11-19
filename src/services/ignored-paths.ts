/**
 * Per-app "Ignored paths": changes that only touch these paths (tests, console
 * commands, CI config, …) never become public changelog entries.
 *
 * The list is stored as the `ignored_paths` app setting, one pattern per line,
 * in a .gitignore-like syntax:
 *
 *   tests/                 everything under a top-level `tests` directory
 *   app/Console/Commands   a path or anything beneath it (anchored: has a `/`)
 *   *.md                   no `/`, so it matches at any depth
 *   docs/**                `**` spans directories, `*` and `?` stay within one
 *   # comment              blank lines and `#` comments are ignored
 *
 * Filtering happens per commit: a commit is ignored only when EVERY file it
 * touches is ignored, so a feature commit that also adds tests still counts.
 * The GitHub Action sends each commit's changed files with the webhook entry
 * (see `WebhookCommit`); entries without that data are never filtered.
 */

export const IGNORED_PATHS_SETTING = 'ignored_paths';

/** One commit an auto-collected webhook entry was built from. */
export interface WebhookCommit {
  sha: string;
  subject: string;
  files: string[];
}

/** Split the stored setting into patterns, dropping blanks and comments. */
export function parseIgnorePatterns(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

/** Canonical form for storage: one trimmed pattern per line. */
export function normalizeIgnorePatterns(text: string | null | undefined): string {
  return parseIgnorePatterns(text).join('\n');
}

function escapeRegExp(ch: string): string {
  return /[.+^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
}

/** Compile one pattern to a RegExp matched against a repo-relative file path. */
export function compileIgnorePattern(pattern: string): RegExp {
  let p = pattern.trim();
  const dirOnly = p.endsWith('/');
  p = p.replace(/\/+$/, '');
  // Like .gitignore: a leading or inner slash anchors the pattern to the repo
  // root; a bare name (`*.md`, `tests`) matches at any depth.
  const anchored = p.includes('/');
  p = p.replace(/^\/+/, '');

  let body = '';
  for (let i = 0; i < p.length; i++) {
    const ch = p[i];
    if (ch === '*' && p[i + 1] === '*') {
      if (p[i + 2] === '/') {
        body += '(?:.*/)?'; // `**/` — zero or more leading directories
        i += 2;
      } else {
        body += '.*'; // `**` — anything, across directories
        i += 1;
      }
    } else if (ch === '*') {
      body += '[^/]*';
    } else if (ch === '?') {
      body += '[^/]';
    } else {
      body += escapeRegExp(ch);
    }
  }

  const prefix = anchored ? '^' : '^(?:.*/)?';
  // A match on a directory covers everything beneath it. A trailing `/` means
  // the pattern names a directory, so there must be something beneath it.
  const suffix = dirOnly ? '/.*$' : '(?:/.*)?$';
  return new RegExp(prefix + body + suffix);
}

export function compileIgnorePatterns(patterns: string[]): RegExp[] {
  return patterns.map(compileIgnorePattern);
}

export function isPathIgnored(path: string, matchers: RegExp[]): boolean {
  const normalized = path.replace(/^\.?\/+/, '');
  return matchers.some((re) => re.test(normalized));
}

/**
 * A commit is ignored only when it has file data and every file is ignored.
 * Commits with no files (merges, empty commits, missing data) are kept, so a
 * lack of information never hides a change.
 */
export function isCommitIgnored(commit: WebhookCommit, matchers: RegExp[]): boolean {
  if (matchers.length === 0 || commit.files.length === 0) return false;
  return commit.files.every((file) => isPathIgnored(file, matchers));
}

/** Keep only well-formed commits from an untrusted webhook payload. */
export function sanitizeWebhookCommits(raw: unknown): WebhookCommit[] {
  if (!Array.isArray(raw)) return [];
  const commits: WebhookCommit[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const { sha, subject, files } = item as Record<string, unknown>;
    if (typeof subject !== 'string') continue;
    commits.push({
      sha: typeof sha === 'string' ? sha : '',
      subject,
      files: Array.isArray(files) ? files.filter((f): f is string => typeof f === 'string') : [],
    });
  }
  return commits;
}

export interface IgnorableEntry {
  title: string;
  content?: string;
  commit_sha?: string;
  commits?: unknown;
}

export type IgnoreResult =
  | { skip: true; ignoredCommits: number }
  | { skip: false; title: string; content?: string; commit_sha?: string; ignoredCommits: number };

/**
 * Apply the app's ignored paths to one webhook entry.
 *
 * `commits` is the list the Action built `content` from (one `- subject` line
 * per commit, newest first). When some commits are ignored the content is
 * rebuilt from the rest; when all of them are, the entry is skipped. The title
 * and commit SHA default to the newest commit, so if that commit was ignored
 * they move to the newest one that remains. An explicitly chosen title (one
 * that isn't an ignored commit's subject) is left alone.
 */
export function applyIgnoredPaths(entry: IgnorableEntry, matchers: RegExp[]): IgnoreResult {
  const unchanged: IgnoreResult = {
    skip: false,
    title: entry.title,
    content: entry.content,
    commit_sha: entry.commit_sha,
    ignoredCommits: 0,
  };
  if (matchers.length === 0) return unchanged;

  const commits = sanitizeWebhookCommits(entry.commits);
  if (commits.length === 0) return unchanged;

  const kept: WebhookCommit[] = [];
  const ignored: WebhookCommit[] = [];
  for (const commit of commits) {
    (isCommitIgnored(commit, matchers) ? ignored : kept).push(commit);
  }
  if (ignored.length === 0) return unchanged;
  if (kept.length === 0) return { skip: true, ignoredCommits: ignored.length };

  const newest = kept[0];
  const keptSubjects = new Set(kept.map((c) => c.subject));
  const ignoredSubjects = new Set(ignored.map((c) => c.subject));
  const ignoredShas = new Set(ignored.map((c) => c.sha).filter(Boolean));

  return {
    skip: false,
    title:
      ignoredSubjects.has(entry.title) && !keptSubjects.has(entry.title)
        ? newest.subject
        : entry.title,
    content: kept.map((c) => `- ${c.subject}`).join('\n'),
    commit_sha:
      entry.commit_sha && ignoredShas.has(entry.commit_sha) && newest.sha
        ? newest.sha
        : entry.commit_sha,
    ignoredCommits: ignored.length,
  };
}
