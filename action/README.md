# Herald Changelog GitHub Action

A composite GitHub Action that sends changelog entries to your [Herald](https://github.com/frontier-sh/herald) instance and (optionally) syncs them into a Herald release. No build step required -- it uses `bash`, `curl`, and `jq` under the hood.

## What it does

- Creates changelog entries in Herald on push or release events.
- When a `version` is supplied (or auto-detected from a release tag), upserts a Herald release by version and attaches the new entries to it. Optionally publishes the release.
- Returns the created entry IDs and the release URL as action outputs so downstream steps can reference them.

## Inputs

| Input             | Required | Default     | Description                                                                                                                                                           |
| ----------------- | -------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `herald-url`      | Yes      | --          | URL of your Herald instance (e.g., `https://herald.example.com`)                                                                                                      |
| `api-key`         | Yes      | --          | Herald API key (store as a GitHub secret)                                                                                                                             |
| `category`        | No       | Auto        | Entry category: `added`, `changed`, `fixed`, `removed`, `deprecated`, `security`. Leave unset to let Herald categorize automatically — with AI features enabled the AI picks the category (and may re-categorize an explicit one); otherwise Herald infers one from the title. |
| `title`           | No       | Auto        | Entry title. Defaults to release name on `release` events, or the latest commit subject on `push`.                                                                    |
| `content`         | No       | Auto        | Entry content in Markdown. Defaults to the release body on `release` events, or the bulleted commit list on `push`.                                                   |
| `section`         | No       | --          | Section name for product-area grouping (e.g. `Core`, `Desktop`, `API`).                                                                                               |
| `version`         | No       | Auto        | Release version to attach this entry to (e.g. `v1.2.3`). Defaults to the GitHub release tag on `release` events, or `git describe --tags --exact-match HEAD` on push. |
| `release-title`   | No       | Auto        | Release title. Defaults to the GitHub release name on `release` events.                                                                                               |
| `release-summary` | No       | Auto        | Release summary in Markdown. Defaults to the GitHub release body on `release` events.                                                                                 |
| `publish`         | No       | Event-based | Publish the release immediately. Defaults to `true` on `release` events, `false` otherwise.                                                                           |
| `include-paths`   | No       | --          | Comma-separated git pathspecs for monorepos (e.g. `apps/web/**,packages/shared/**`). Restricts auto-collected commits to those touching these paths.                  |
| `include-merges`  | No       | `false`     | Include merge commits in auto-collected content.                                                                                                                      |

## Outputs

| Output            | Description                                                                          |
| ----------------- | ------------------------------------------------------------------------------------ |
| `entry-ids`       | Comma-separated list of created entry IDs                                            |
| `entry-count`     | Number of entries created                                                            |
| `release-id`      | Herald release ID (empty when no release was attached)                               |
| `release-version` | Herald release version (empty when no release was attached)                          |
| `release-url`     | Public URL of the release on Herald (empty when no release was attached)             |

Outputs are empty when the action skipped the post (e.g. `include-paths` filtered out all commits).

## Usage

### On release published — sync to a Herald release

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
        id: herald
        with:
          herald-url: ${{ secrets.HERALD_URL }}
          api-key: ${{ secrets.HERALD_API_KEY }}
          # category is optional — omit it to let Herald categorize automatically.

      - name: Comment release URL
        if: steps.herald.outputs.release-url
        run: echo "Released at ${{ steps.herald.outputs.release-url }}"
```

### On push to main — collect into a draft release

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
          # Tag-pushes (vX.Y.Z) auto-bind to a release; non-tag pushes won't.
```

### Monorepo — scope to a sub-package

```yaml
- uses: frontier-sh/herald/action@main
  with:
    herald-url: ${{ secrets.HERALD_URL }}
    api-key: ${{ secrets.HERALD_API_KEY }}
    section: 'Web'
    include-paths: 'apps/web/**,packages/shared/**'
```

When `include-paths` is set and no commits in the range touch those paths, the action emits a `::notice::`, exits successfully, and produces empty outputs.

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
        description: 'Category (optional — leave as Auto to let Herald decide)'
        required: false
        default: ''
        type: choice
        options: ['', added, changed, fixed, removed, deprecated, security]
      section:
        description: 'Section (optional, e.g. Core, Desktop, API)'
        required: false
      version:
        description: 'Attach to release version (optional)'
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
          section: ${{ github.event.inputs.section }}
          version: ${{ github.event.inputs.version }}
```

### Using outputs

```yaml
- uses: frontier-sh/herald/action@main
  id: herald
  with:
    herald-url: ${{ secrets.HERALD_URL }}
    api-key: ${{ secrets.HERALD_API_KEY }}

- name: Use outputs
  if: steps.herald.outputs.release-url
  run: |
    echo "Created entries: ${{ steps.herald.outputs.entry-ids }}"
    echo "Release: ${{ steps.herald.outputs.release-url }}"
```

## Setup

1. Deploy Herald to Cloudflare Workers (see the [main README](../README.md)).
2. Create an API key in Herald's admin panel under **Settings > API Keys**.
3. Add these secrets to your GitHub repository:
   - `HERALD_URL` -- your Herald instance URL (e.g., `https://herald.your-domain.com`)
   - `HERALD_API_KEY` -- the API key from step 2
4. Add one of the workflow examples above to `.github/workflows/`.

## Requirements

- `jq` and `curl` available on the runner (default on `ubuntu-latest` and `macos-latest`).
- For push events, `actions/checkout` should set `fetch-depth: 0` so the commit range is reachable.

## Troubleshooting

**`jq is required but not found`** -- install jq, or switch to a GitHub-hosted runner.

**Empty entry content on push** -- usually a shallow checkout. Add `with: { fetch-depth: 0 }` to the checkout step.

**`Initial push detected; falling back to HEAD commit only`** -- expected on the first push to a branch where there is no `before` SHA.

**`No commits in range matched include-paths; skipping`** -- the `include-paths` filter excluded everything in the range. The action exits successfully with empty outputs.

**`Invalid category`** -- when supplied, `category` must be one of `added`, `changed`, `fixed`, `removed`, `deprecated`, `security`. Leave it unset to let Herald categorize automatically.

**`release-url` is empty after a successful run** -- no `version` was supplied or auto-detected. Pass `version` explicitly, or trigger on a `release` event, or push a tag matching HEAD.
