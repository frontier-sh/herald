#!/usr/bin/env node
/**
 * End-to-end harness for AI changelog generation.
 *
 * For each real commit (this repo's `git log`, or files you pass) it sends the
 * SAME request the production queue worker sends — built by
 * buildSummarizationRequest() and parsed by coerceSummary() — to the Cloudflare
 * Workers AI REST API, then prints a per-commit report flagging anything wrong:
 * unrenamed/empty titles, leaked JSON, truncated bodies, over-length output, and
 * internal details that shouldn't reach a public changelog.
 *
 * It talks to Workers AI over the REST API (`/accounts/{id}/ai/run/{model}`)
 * rather than a `wrangler dev` binding: the local dev AI-binding proxy was
 * unreliable in this environment, and REST uses the same model, the same
 * request body, and the same parser — so what you see still matches production.
 *
 * Credentials (reused from your local tools, in priority order):
 *   - token:   $CLOUDFLARE_API_TOKEN, else the `wrangler login` OAuth token
 *   - account: $CLOUDFLARE_ACCOUNT_ID, else parsed from `wrangler whoami`
 *
 * Usage:
 *   npm run ai:harness                       # last 10 non-merge commits of this repo
 *   node scripts/ai-harness.mjs 5            # last 5 commits
 *   node scripts/ai-harness.mjs --files a.txt b.txt   # use file contents as commits
 *   node scripts/ai-harness.mjs --model @cf/meta/llama-3.3-70b-instruct-fp8-fast 5
 *   node scripts/ai-harness.mjs --category fixed --personality casual 3
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { buildSummarizationRequest, coerceSummary } from '../src/services/changelog-format.ts';
import { resolveModelId } from '../src/services/models.ts';

// ── tiny ANSI helpers ─────────────────────────────────────
const useColor = process.stdout.isTTY;
const paint = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const c = {
  bold: (s) => paint('1', s),
  dim: (s) => paint('2', s),
  red: (s) => paint('31', s),
  green: (s) => paint('32', s),
  yellow: (s) => paint('33', s),
};

// ── args ──────────────────────────────────────────────────
function parseArgs(argv) {
  const opts = { n: 10, files: [], model: undefined, category: null, personality: 'neutral' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--model') opts.model = argv[++i];
    else if (a === '--category') opts.category = argv[++i];
    else if (a === '--personality') opts.personality = argv[++i];
    else if (a === '--files') {
      while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) opts.files.push(argv[++i]);
    } else if (/^\d+$/.test(a)) opts.n = Number(a);
  }
  return opts;
}

// ── credentials ───────────────────────────────────────────
function getToken() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  const cfg = join(homedir(), 'Library/Preferences/.wrangler/config/default.toml');
  try {
    const m = readFileSync(cfg, 'utf8').match(/^oauth_token\s*=\s*"([^"]+)"/m);
    if (m) return m[1];
  } catch {
    /* fall through */
  }
  throw new Error('No credential found. Run `npx wrangler login`, or set CLOUDFLARE_API_TOKEN.');
}

function getAccountId() {
  if (process.env.CLOUDFLARE_ACCOUNT_ID) return process.env.CLOUDFLARE_ACCOUNT_ID;
  const out = execFileSync('npx', ['wrangler', 'whoami'], { encoding: 'utf8' });
  const m = out.match(/\b[0-9a-f]{32}\b/);
  if (!m) throw new Error('Could not determine account id. Set CLOUDFLARE_ACCOUNT_ID.');
  return m[0];
}

// ── commit sources ────────────────────────────────────────
function gitCommits(n) {
  const F = '\x1f';
  const R = '\x1e';
  const out = execFileSync('git', ['log', `-n${n}`, '--no-merges', `--format=%h${F}%s${F}%B${R}`], {
    encoding: 'utf8',
  });
  return out
    .split(R)
    .map((s) => s.replace(/^\n+/, ''))
    .filter((s) => s.trim())
    .map((rec) => {
      const [sha, subject, message] = rec.split(F);
      return { sha, subject: subject.trim(), message: message.trim() };
    });
}

function fileCommits(paths) {
  return paths.map((p) => {
    const message = readFileSync(p, 'utf8').trim();
    return { sha: p, subject: message.split('\n')[0].trim(), message };
  });
}

// Mirror of services/entries.ts inferCategory (conventional commits).
function inferCategory(subject) {
  const type = subject.match(/^(\w+)(\(.+\))?!?:/)?.[1]?.toLowerCase();
  if (type === 'fix') return 'fixed';
  if (type === 'revert') return 'removed';
  return 'added';
}

// ── quality flags ─────────────────────────────────────────
const TECH_PATTERNS = [
  { re: /\b[0-9a-f]{7,40}\b/, label: 'commit hash' },
  { re: /\b[A-Z]{2,}-\d+\b/, label: 'ticket id' },
  { re: /(^|\s)#\d+\b/, label: 'PR/issue ref' },
  { re: /\b[\w./-]+\.(?:ts|tsx|js|jsx|mjs|php|sql|jsonc?|ya?ml|css)\b/, label: 'file name' },
  {
    re: /\b(?:Filament|Livewire|Laravel|Sanctum|Scramble|Cloudflare|Workers? AI|OpenAPI|Octane|Reverb|Sqlite|D1)\b/,
    label: 'internal tech',
  },
];

function analyze(commit, summary) {
  const title = (summary.title || '').trim();
  const body = (summary.content || '').trim();
  const flags = [];

  if (!body) flags.push('empty-body'); // the "AI does nothing" failure mode
  if (!title) flags.push('empty-title');
  else if (title.toLowerCase() === commit.subject.toLowerCase()) flags.push('title-not-renamed');

  if (/^\s*[{[]/.test(body) || /"(?:title|body|content)"\s*:/.test(body)) flags.push('json-leak');
  if (body && !/[.!?)\]"'`*_>]$/.test(body)) flags.push('truncated?');
  if (title && title.split(/\s+/).length > 10) flags.push('title-too-long');
  if (body.length > 600) flags.push('body-too-long');

  const haystack = `${title}\n${body}`;
  for (const { re, label } of TECH_PATTERNS) if (re.test(haystack)) flags.push(`tech:${label}`);
  return flags;
}

// ── main ──────────────────────────────────────────────────
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const commits = opts.files.length ? fileCommits(opts.files) : gitCommits(opts.n);
  if (!commits.length) {
    console.error(c.red('No commits found.'));
    process.exit(1);
  }

  const token = getToken();
  const account = getAccountId();
  const model = resolveModelId(opts.model);
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`;
  console.log(c.dim(`model: ${model}\n`));

  const results = [];
  for (const commit of commits) {
    const category = opts.category || inferCategory(commit.subject);
    const request = buildSummarizationRequest({
      content: commit.message,
      category,
      personality: opts.personality,
    });

    process.stdout.write(c.dim(`→ ${commit.sha}  `));
    let summary;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(request),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        const msg = json?.errors?.map((e) => e.message).join('; ') || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      summary = coerceSummary(json.result);
    } catch (err) {
      console.log(c.red(`error: ${err.message}`));
      results.push({ commit, flags: ['request-error'] });
      continue;
    }

    const flags = analyze(commit, summary);
    results.push({ commit, summary, flags, category });
    console.log(flags.length ? c.red(`⚠ ${flags.join(', ')}`) : c.green('ok'));
    console.log(c.dim('  commit  : ') + commit.subject);
    console.log(c.dim('  title   : ') + c.bold(summary.title || c.red('(empty)')));
    console.log(c.dim('  body    : ') + (summary.content || c.red('(empty)')).replace(/\n/g, '\n            '));
    console.log(c.dim(`  category: ${category}`));
    console.log();
  }

  // ── summary ─────────────────────────────────────────────
  const clean = results.filter((r) => r.flags.length === 0).length;
  const flagged = results.length - clean;
  console.log(c.bold('──────────── summary ────────────'));
  console.log(
    `${results.length} commits · ${c.green(`${clean} clean`)} · ${
      flagged ? c.red(`${flagged} flagged`) : c.green('0 flagged')
    }`,
  );
  if (flagged) {
    const counts = {};
    for (const r of results) for (const f of r.flags) counts[f] = (counts[f] || 0) + 1;
    for (const [flag, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${c.yellow(flag)}: ${n}`);
    }
  }
  process.exit(flagged ? 1 : 0);
}

main().catch((err) => {
  console.error(c.red(err.stack || String(err)));
  process.exit(1);
});
