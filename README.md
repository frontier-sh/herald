# Herald

**Open-source changelog app powered by Cloudflare Workers**

A self-hosted changelog solution that makes it easy to track, manage, and publish software changes. Use the template, deploy, and stay in sync with upstream updates — all from a private repo.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Features

- Rich Markdown editor with image upload (drag & drop, paste, toolbar)
- Custom logo and favicon via Settings
- Image optimization via Cloudflare Images (auto WebP, resize)
- Categorize changes (Added, Changed, Fixed, Removed, Deprecated, Security)
- Organize entries by product area sections (e.g. Core, Desktop, API)
- Group entries into versioned releases
- AI-powered summarization via Cloudflare Workers AI
- REST API + GitHub Action for CI/CD automation
- RSS feed for subscribers
- Public changelog page for your users
- One-click GitHub App setup — no OAuth app to manage, scoped to repo collaborators
- One-command upstream sync (`npm run update`) to pull the latest Herald release
- Runs on Cloudflare Workers -- fast, global, free tier friendly

## Setup

Deploy your own copy, then click through an in-app wizard that creates a private GitHub App for you. No OAuth app to create, no client IDs or secrets to copy.

### 1. Deploy to Cloudflare

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/frontier-sh/herald)

Click the button. Cloudflare reads `wrangler.jsonc` and, in one flow:

- creates a private copy of this repo on your GitHub account,
- auto-provisions the D1 database, R2 bucket, queue, and AI binding,
- sets up Workers Builds so every push to your repo redeploys automatically, and
- builds and deploys the Worker.

When it finishes you'll have a live URL at `https://herald.<your-subdomain>.workers.dev`.

<details>
<summary>Prefer the CLI?</summary>

```sh
git clone https://github.com/<your-username>/<your-repo>.git
cd <your-repo>
npm install
npm run build && npm run deploy   # Cloudflare auto-provisions D1/R2/queue on first deploy
```

Then connect Workers Builds for auto-deploy: in the dashboard go to **Workers & Pages > herald > Settings > Builds**, click **Connect**, and select your repo (build command `npm run build`, deploy command `npm run deploy`).
</details>

### 2. Run the in-app GitHub App setup wizard

Open your deployment URL. Herald detects that GitHub auth is not configured and walks you through:

1. **Create GitHub App** — one click. Herald POSTs a manifest to GitHub; you confirm the App on GitHub's screen; GitHub redirects back with the App's credentials, which Herald stores in your D1 database. Leave the **organization** field blank to create the App on your personal account, or enter an org slug to create it under an organization you own (you must be an org **owner**). Because the App is private, it can only be installed on the account that owns it — so if you want to gate access to an org repository, create the App under that org.
2. **Install on a repository** — pick the repo whose collaborators should have access.
3. **Sign in with GitHub** — on your first login Herald confirms which repo gates access (auto-selected when the App is installed on just one) and signs you in. Only collaborators of that repo can reach the admin panel.

That's it. No `wrangler secret put`, no OAuth app, no client ID / client secret to copy.

### Custom domain (optional)

By default the Worker is served at `https://herald.<your-subdomain>.workers.dev`. To bind your own domain, add it in the Cloudflare dashboard under **Workers & Pages > herald > Settings > Domains & Routes > Add** (the zone must already be in the same Cloudflare account).

> Configure the custom domain in the dashboard rather than adding `routes` to `wrangler.jsonc`. Keeping `wrangler.jsonc` identical to upstream is what lets `npm run update` merge cleanly with no conflicts.

Then set the `BASE_URL` var (in the dashboard, or `wrangler secret put`) to your custom origin (e.g. `https://changelog.example.com`) so RSS/canonical links and the AI-summary cache purge use the right host.

## Local development

```sh
cp .dev.vars.example .dev.vars   # optional — only BASE_URL is needed
npm run db:migrate
npm run dev
```

The app runs at `http://localhost:5173`. For local development you'll need to run through the same in-app setup wizard against a tunnel URL (e.g. `cloudflared tunnel`) since GitHub requires HTTPS callback URLs.

## Authentication

Herald uses a **GitHub App** (created once, per deployment, via the in-app wizard) to gate the admin panel. Only users who are collaborators on the configured repository can sign in.

Access control follows the repository:

- **Private repo (recommended)**: Only collaborators can sign in. Manage them in the repo's **Settings > Collaborators**.
- **Public repo**: Anyone with a GitHub account can sign in.

The App only needs `metadata: read` — just enough to confirm repo access on login. It never reads your code.

### Generate from commits (optional)

To draft changelog entries from a repository's recent commits, go to **Settings > Generate from commits** and set a **Repository** (`owner/repo`) plus a **GitHub token** — a fine-grained personal access token with read-only **Contents** access to that repo (or a classic token with the `repo` scope). The token is stored in D1 and used only to read commits; commit reading is fully decoupled from login.

### Re-running setup

If you ever need to start over (e.g. moved deployments, want to point at a different repo), delete the row in D1 and reload:

```sh
npx wrangler d1 execute herald-db --remote --command "DELETE FROM github_app_config WHERE id = 1"
```

Then reload — the setup wizard runs again.

## API Documentation

All API endpoints require authentication via a Bearer token. Create an API key in the admin panel under **Settings > API Keys**.

```bash
# Include this header with every request
-H "Authorization: Bearer YOUR_API_KEY"
```

### Entries

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/entries` | List all entries (optional query: `?status=draft&category=added`) |
| `GET` | `/api/entries/:id` | Get a single entry |
| `POST` | `/api/entries` | Create an entry |
| `PUT` | `/api/entries/:id` | Update an entry |
| `DELETE` | `/api/entries/:id` | Delete an entry |
| `POST` | `/api/entries/:id/publish` | Publish an entry |

**Create an entry:**

```bash
curl -X POST https://herald.example.com/api/entries \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Dark mode support",
    "content": "Added dark mode toggle in user preferences.",
    "section_name": "Desktop"
  }'
```

`category` is optional. Omit it and Herald categorizes the entry for you — when AI
features are enabled the AI picks the best of `added`, `changed`, `fixed`,
`removed`, `deprecated`, or `security` (and polishes the title and body);
otherwise Herald infers one from the title. Pass an explicit `category` only when
you want to set it yourself (note that with AI enabled, the AI may still
re-categorize it).

### Sections

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/sections` | List all sections |

Sections are created automatically when you assign a `section_name` to an entry. Use sections to group entries by product area (e.g. Core, Desktop, API).

### Releases

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/releases` | List all releases (optional query: `?status=draft`) |
| `GET` | `/api/releases/:id` | Get a single release |
| `POST` | `/api/releases` | Create a release |
| `PUT` | `/api/releases/:id` | Update a release (supports `entryIds` array to assign entries) |
| `DELETE` | `/api/releases/:id` | Delete a release |
| `POST` | `/api/releases/:id/publish` | Publish a release |

**Create a release:**

```bash
curl -X POST https://herald.example.com/api/releases \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "version": "1.2.0",
    "title": "January Release",
    "summary": "Dark mode, bug fixes, and performance improvements."
  }'
```

### Webhook

The webhook endpoint accepts one or more entries in a single request. This is what the GitHub Action uses.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/webhook` | Create one or more entries in bulk |

```bash
curl -X POST https://herald.example.com/api/webhook \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "entries": [
      {
        "title": "Fix login timeout",
        "content": "Resolved session expiry issue causing premature logouts.",
        "section_name": "Core"
      }
    ]
  }'
```

### Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/settings` | Get all settings |
| `PUT` | `/api/settings` | Update settings (key-value pairs) |

### API Keys

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/keys` | List all API keys |
| `POST` | `/api/keys` | Create an API key (requires `name` in body) |
| `DELETE` | `/api/keys/:id` | Delete an API key |

## GitHub Action

Automatically send changelog entries from your CI/CD pipeline. See the full [Action documentation](action/README.md).

**Quick setup:**

```yaml
# .github/workflows/changelog.yml
name: Changelog
on:
  release:
    types: [published]

jobs:
  changelog:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: frontier-sh/herald/action@main
        with:
          herald-url: ${{ secrets.HERALD_URL }}
          api-key: ${{ secrets.HERALD_API_KEY }}
```

The entry is categorized automatically. Set the optional `category` input only if
you want to choose it yourself.

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BASE_URL` | No | Public origin of the deployment (e.g. `https://changelog.example.com`). Auto-detected from the incoming request if unset. |

GitHub App credentials and the repo access gate are stored in D1 (table `github_app_config`), populated by the in-app setup wizard. There are no GitHub-related env vars to set.

### Cloudflare Resources

| Resource | Name | Purpose |
|----------|------|---------|
| D1 Database | `herald-db` | Stores entries, releases, settings, and API keys |
| R2 Bucket | `herald-images` | Stores uploaded images (logo, favicon, content images) |
| Queue | `herald-queue` | Async processing for AI summarization |
| Workers AI | -- | Optional AI-powered changelog summarization |
| Images | -- | Automatic image optimization on upload (resize, WebP conversion) |

### Settings

Configurable via the admin panel or the `/api/settings` endpoint:

| Setting | Default | Description |
|---------|---------|-------------|
| `project_name` | My Project | Displayed on the public changelog |
| `project_description` | -- | Short description shown on the public page |
| `auto_publish` | false | Automatically publish entries created via API/webhook |
| `entry_grouping` | category | How entries are grouped on the public changelog (`category` or `section`) |
| `ai_enabled` | false | Enable AI summarization of raw changelog content |
| `ai_model` | `@cf/moonshotai/kimi-k2.6` | Cloudflare Workers AI model to use |

## Tech Stack

- **Runtime**: [Cloudflare Workers](https://workers.cloudflare.com/)
- **Framework**: [Hono](https://hono.dev/)
- **Database**: [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite)
- **Storage**: [Cloudflare R2](https://developers.cloudflare.com/r2/) (image uploads)
- **Images**: [Cloudflare Images](https://developers.cloudflare.com/images/) (optimization)
- **AI**: [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/)
- **Queue**: [Cloudflare Queues](https://developers.cloudflare.com/queues/)
- **Build**: [Vite](https://vite.dev/)
- **Editor**: [EasyMDE](https://github.com/Ionaru/easy-markdown-editor) (Markdown)
- **Language**: TypeScript

## Project Structure

```
herald/
  action/           # GitHub Action (composite, bash + curl)
  migrations/       # D1 database migrations
  src/
    client/         # Client-side JS and CSS
    db/             # Database schema types
    middleware/      # Auth middleware (admin + API key)
    routes/         # Hono route handlers (auth, api, admin, public)
    services/       # Data access layer (entries, releases, settings, api-keys, github)
    index.ts        # App entry point
  wrangler.jsonc    # Cloudflare Workers config
```

## Staying in sync with upstream

When a new Herald version ships, pull it into your copy with one command:

```sh
npm run update
```

This fetches the latest from `frontier-sh/herald`, merges it into a `sync/upstream` branch, pushes it, and opens a pull request (using your GitHub CLI login — if `gh` isn't installed it prints a compare link instead). Because your repo is kept byte-identical to upstream, the merge is a clean fast-forward. Review the PR, merge it, and Workers Builds redeploys automatically.

Requirements: a local clone of your repo and an authenticated [GitHub CLI](https://cli.github.com/) (`gh auth login`). To point at a different upstream, set `HERALD_UPSTREAM` (and optionally `HERALD_UPSTREAM_BRANCH`) when running, e.g. `HERALD_UPSTREAM=https://github.com/me/herald.git npm run update`.

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b my-feature`
3. Make your changes
4. Run the build to verify: `npm run build`
5. Commit your changes: `git commit -m "Add my feature"`
6. Push to your fork: `git push origin my-feature`
7. Open a pull request

## License

MIT
