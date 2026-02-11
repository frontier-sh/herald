# Herald Changelog GitHub Action

A composite GitHub Action that sends changelog entries to your [Herald](https://github.com/frontier-sh/herald) instance. No build step required -- it uses `bash` and `curl` under the hood.

## What it does

- Automatically creates changelog entries in Herald when you push code or publish a release
- For **release events**: uses the release name, body, and tag as the entry title, content, and version
- For **push events**: collects commit messages and uses the latest commit subject as the title
- Sends entries to Herald's `/api/webhook` endpoint with proper authentication

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `herald-url` | Yes | -- | URL of your Herald instance (e.g., `https://herald.example.com`) |
| `api-key` | Yes | -- | Herald API key (store as a GitHub secret) |
| `category` | No | `changed` | Entry category: `added`, `changed`, `fixed`, `removed`, `deprecated`, `security` |
| `title` | No | Auto-detected | Entry title. Defaults to release name or latest commit message |
| `content` | No | Auto-detected | Entry content in Markdown. Defaults to release body or commit messages |
| `version` | No | Auto-detected | Version tag. Defaults to release tag if available |

## Usage

### On push to main

```yaml
name: Changelog on Push
on:
  push:
    branches: [main]

jobs:
  changelog:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # Needed to access commit history

      - uses: frontier-sh/herald/action@main
        with:
          herald-url: ${{ secrets.HERALD_URL }}
          api-key: ${{ secrets.HERALD_API_KEY }}
          category: 'changed'
```

### On release published

```yaml
name: Changelog on Release
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

### Manual dispatch

```yaml
name: Manual Changelog Entry
on:
  workflow_dispatch:
    inputs:
      title:
        description: 'Entry title'
        required: true
      content:
        description: 'Entry content (Markdown)'
        required: true
      category:
        description: 'Category'
        required: true
        default: 'added'
        type: choice
        options:
          - added
          - changed
          - fixed
          - removed
          - deprecated
          - security
      version:
        description: 'Version (optional)'
        required: false

jobs:
  changelog:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: frontier-sh/herald/action@main
        with:
          herald-url: ${{ secrets.HERALD_URL }}
          api-key: ${{ secrets.HERALD_API_KEY }}
          title: ${{ github.event.inputs.title }}
          content: ${{ github.event.inputs.content }}
          category: ${{ github.event.inputs.category }}
          version: ${{ github.event.inputs.version }}
```

## Setup

1. Deploy Herald to Cloudflare Workers (see the [main README](../README.md))
2. Create an API key in Herald's admin panel under **Settings > API Keys**
3. Add the following secrets to your GitHub repository:
   - `HERALD_URL` -- your Herald instance URL (e.g., `https://herald.your-domain.com`)
   - `HERALD_API_KEY` -- the API key you created in step 2
4. Add one of the workflow examples above to `.github/workflows/` in your repository

## How it works

The action determines event context automatically:

- **Release events**: Extracts the release name, body (Markdown), and tag name
- **Push events**: Uses `git log` to collect commit messages between the before/after SHAs
- **Manual/other events**: Uses the values you provide via inputs

All values are safely escaped using `jq` before being sent as JSON to the Herald webhook API.

## Requirements

- `jq` and `curl` must be available on the runner (included by default on `ubuntu-latest`)
- For push events, `fetch-depth: 0` is recommended in the checkout step to access full commit history
