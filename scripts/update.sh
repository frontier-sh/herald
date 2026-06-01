#!/usr/bin/env bash
#
# Pull the latest upstream Herald into your copy and open a pull request.
#
# Herald is distributed via the "Deploy to Cloudflare" button / the GitHub
# template, so your repo shares no git history with upstream. This script
# merges upstream into a `sync/upstream` branch (using
# --allow-unrelated-histories for the first sync) and opens a PR with `gh`.
# Because it runs as you, no extra GitHub App, secret, or repo setting is
# needed — unlike a GitHub Action, your own credentials can open PRs.
#
# Usage:   npm run update
# Config:  HERALD_UPSTREAM         (default https://github.com/frontier-sh/herald.git)
#          HERALD_UPSTREAM_BRANCH  (default main)
set -euo pipefail

UPSTREAM="${HERALD_UPSTREAM:-https://github.com/frontier-sh/herald.git}"
UPSTREAM_BRANCH="${HERALD_UPSTREAM_BRANCH:-main}"
SYNC_BRANCH="sync/upstream"

if [ -n "$(git status --porcelain)" ]; then
  echo "Your working tree has uncommitted changes. Commit or stash them first." >&2
  exit 1
fi

# Default branch = whatever you currently have checked out.
BASE_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$BASE_BRANCH" = "$SYNC_BRANCH" ]; then
  echo "Run this from your main branch, not $SYNC_BRANCH." >&2
  exit 1
fi

# Point the 'upstream' remote at the configured source (idempotent).
if git remote get-url upstream >/dev/null 2>&1; then
  git remote set-url upstream "$UPSTREAM"
else
  git remote add upstream "$UPSTREAM"
fi

echo "Fetching $UPSTREAM ($UPSTREAM_BRANCH)..."
git fetch --quiet upstream "$UPSTREAM_BRANCH"

BEHIND="$(git rev-list --count "HEAD..upstream/${UPSTREAM_BRANCH}")"
if [ "$BEHIND" -eq 0 ]; then
  echo "Already up to date with upstream."
  exit 0
fi
echo "Behind upstream by ${BEHIND} commit(s). Building ${SYNC_BRANCH}..."

git checkout -B "$SYNC_BRANCH" "$BASE_BRANCH"

# --allow-unrelated-histories stitches the template-created history to upstream
# on the first sync; it's a harmless no-op afterward.
if ! git merge --no-edit --allow-unrelated-histories "upstream/${UPSTREAM_BRANCH}"; then
  echo
  echo "Merge hit conflicts. Resolve them, run 'git commit', then:" >&2
  echo "  git push -u origin $SYNC_BRANCH" >&2
  echo "  gh pr create --base $BASE_BRANCH --head $SYNC_BRANCH" >&2
  git checkout "$BASE_BRANCH" >/dev/null 2>&1 || true
  exit 1
fi

git push --force-with-lease -u origin "$SYNC_BRANCH"
git checkout "$BASE_BRANCH" >/dev/null 2>&1

TITLE="Sync from upstream Herald"
BODY="Automated sync from \`${UPSTREAM}\` (\`${UPSTREAM_BRANCH}\`), ${BEHIND} commit(s) behind. Review and merge to deploy."

if command -v gh >/dev/null 2>&1; then
  EXISTING="$(gh pr list --head "$SYNC_BRANCH" --base "$BASE_BRANCH" --state open --json number -q '.[0].number' 2>/dev/null || true)"
  if [ -n "$EXISTING" ]; then
    gh pr edit "$EXISTING" --body "$BODY" >/dev/null
    echo "Updated existing PR #$EXISTING."
    gh pr view "$EXISTING" --web >/dev/null 2>&1 || true
  else
    gh pr create --base "$BASE_BRANCH" --head "$SYNC_BRANCH" --title "$TITLE" --body "$BODY"
  fi
else
  REMOTE_URL="$(git remote get-url origin)"
  SLUG="$(echo "$REMOTE_URL" | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##')"
  echo
  echo "Pushed $SYNC_BRANCH. Install the GitHub CLI (https://cli.github.com) to open PRs automatically,"
  echo "or open one here:"
  echo "  https://github.com/${SLUG}/compare/${BASE_BRANCH}...${SYNC_BRANCH}?expand=1"
fi
