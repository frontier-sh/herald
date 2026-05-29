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
- Automated upstream sync via GitHub Actions
- Runs on Cloudflare Workers -- fast, global, free tier friendly

## Setup

Setup is two parts: provision Cloudflare resources, then click through an in-app wizard that creates a private GitHub App for you. No OAuth app to create, no client IDs or secrets to copy.

### 1. Create your repo from the template

On [frontier-sh/herald](https://github.com/frontier-sh/herald), click **Use this template > Create a new repository** and make it private. (Unlike forking, this creates a clean repo with no public link back to upstream.)

Clone it:

```sh
git clone https://github.com/<your-username>/<your-repo>.git
cd <your-repo>
npm install
```

### 2. Create Cloudflare resources

```sh
npx wrangler d1 create herald-db          # copy database_id into wrangler.jsonc
npx wrangler r2 bucket create herald-images
npx wrangler queues create herald-queue
```

### 3. Deploy

```sh
npm run build && npm run deploy
```

### 4. Connect Workers Builds (auto-deploy)

In the Cloudflare dashboard, go to **Workers & Pages > herald > Settings > Builds**, click **Connect**, select your repo. Build command: `npm run build`. Deploy command: `npm run deploy`.

### 5. Run the in-app GitHub App setup wizard

Open your deployment URL. Herald detects that GitHub auth is not configured and walks you through:

1. **Create GitHub App** — one click. Herald POSTs a manifest to GitHub; you confirm the App on GitHub's screen; GitHub redirects back with the App's credentials, which Herald stores in your D1 database.
2. **Install on a repository** — pick the repo whose collaborators should have access. Only collaborators of that repo will be able to sign in to the admin panel.
3. **Done** — you're redirected to the login page and can sign in with GitHub.

That's it. No `wrangler secret put`, no OAuth app, no client ID / client secret to copy.

### Custom domain (optional)

By default the Worker is served at `https://herald.<your-subdomain>.workers.dev`. To bind it to your own domain, add a `routes` entry to `wrangler.jsonc` and redeploy:

```jsonc
{
  "name": "herald",
  // ...
  "routes": [
    { "pattern": "changelog.example.com", "custom_domain": true }
  ]
}
```

Requirements & notes:

- The domain's zone must already exist in the same Cloudflare account. Wrangler creates the custom domain and the required DNS record automatically on `npm run deploy`.
- To stop serving the `*.workers.dev` URL as well, also set `"workers_dev": false`.
- Set the `BASE_URL` var to your custom origin (e.g. `"https://changelog.example.com"`) so RSS/canonical links and the AI-summary cache purge use the right host.

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

### Updating App permissions

If a new Herald release needs additional GitHub App permissions, you'll see an upgrade banner in the admin dashboard linking to `/setup/upgrade`. Click through to GitHub, approve the new permissions on your App, then click **I have approved the new permissions** to record the new manifest version.

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
    "category": "added",
    "section_name": "Desktop"
  }'
```

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
        "category": "fixed",
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
          category: 'added'
```

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

The repo ships with `.github/workflows/sync-upstream.yml` — a scheduled workflow that fetches new commits from `frontier-sh/herald` daily and opens a PR against your default branch. Review the diff, merge, and Workers Builds redeploys automatically.

To trigger a sync immediately: **Actions > Sync from upstream Herald > Run workflow**.

To point at a different upstream, set the `HERALD_UPSTREAM` repo variable (e.g. your own private fork).

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
