# Herald

**Open-source changelog app powered by Cloudflare Workers**

A self-hosted changelog solution that makes it easy to track, manage, and publish software changes. Deploy in one click to Cloudflare Workers.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/frontier-sh/herald) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Features

- Rich Markdown editor for changelog entries
- Categorize changes (Added, Changed, Fixed, Removed, Deprecated, Security)
- Group entries into versioned releases
- AI-powered summarization via Cloudflare Workers AI
- REST API + GitHub Action for CI/CD automation
- RSS feed for subscribers
- Public changelog page for your users
- GitHub OAuth admin authentication (scoped to repo collaborators)
- Runs on Cloudflare Workers -- fast, global, free tier friendly

## Quick Start

### Deploy to Cloudflare

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/frontier-sh/herald)

After deploying, you'll need to set up GitHub OAuth -- see [Authentication](#authentication) below.

### Local Development

```bash
git clone https://github.com/frontier-sh/herald.git
cd herald
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

The app will be available at `http://localhost:5173`.

For local development, create a separate GitHub OAuth App with the callback URL set to `http://localhost:5173/auth/github/callback`, and fill in your `.dev.vars` file.

## Authentication

Herald uses GitHub OAuth to control access to the admin panel. Only users who have access to a specific GitHub repository can sign in. Each deployment is independent -- your OAuth App and repo gate are yours alone.

### Setup

1. Go to [github.com/settings/developers](https://github.com/settings/developers) and click **New OAuth App**.
2. Fill in the form:
   - **Application name**: Herald (or any name you like)
   - **Homepage URL**: `https://your-worker.workers.dev`
   - **Authorization callback URL**: `https://your-worker.workers.dev/auth/github/callback`
3. Click **Register application**, then generate a client secret.
4. Set the three secrets in Cloudflare:

```bash
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put GITHUB_ALLOWED_REPO    # e.g. your-org/your-repo
```

5. Visit `/admin` and sign in with GitHub.

### Access control

Access is gated by GitHub repository visibility:

- **Private repo**: Only collaborators with access to the repo can sign in. This is the recommended setup.
- **Public repo**: Any GitHub user can sign in (since public repos are visible to everyone).

To restrict access, use a private repository as your `GITHUB_ALLOWED_REPO` and manage collaborators through GitHub's repository settings.

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
    "version": "1.2.0"
  }'
```

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
        "version": "1.1.1"
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
| `GITHUB_CLIENT_ID` | Yes | OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | Yes | OAuth App client secret |
| `GITHUB_ALLOWED_REPO` | Yes | Repository to gate access on (format: `owner/repo`) |

Set these as secrets via `wrangler secret put` or in `.dev.vars` for local development.

### Cloudflare Resources

Herald uses the following Cloudflare resources (auto-provisioned by the Deploy button):

| Resource | Name | Purpose |
|----------|------|---------|
| D1 Database | `herald-db` | Stores entries, releases, settings, and API keys |
| Queue | `herald-queue` | Async processing for AI summarization |
| Workers AI | -- | Optional AI-powered changelog summarization |

### Settings

Configurable via the admin panel or the `/api/settings` endpoint:

| Setting | Default | Description |
|---------|---------|-------------|
| `project_name` | My Project | Displayed on the public changelog |
| `project_description` | -- | Short description shown on the public page |
| `auto_publish` | false | Automatically publish entries created via API/webhook |
| `ai_enabled` | false | Enable AI summarization of raw changelog content |
| `ai_model` | `@cf/meta/llama-4-scout-17b-16e-instruct` | Cloudflare Workers AI model to use |

## Tech Stack

- **Runtime**: [Cloudflare Workers](https://workers.cloudflare.com/)
- **Framework**: [Hono](https://hono.dev/)
- **Database**: [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite)
- **AI**: [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/)
- **Queue**: [Cloudflare Queues](https://developers.cloudflare.com/queues/)
- **Build**: [Vite](https://vite.dev/) + [@hono/vite-build](https://github.com/honojs/vite-plugins)
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
