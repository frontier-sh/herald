#!/usr/bin/env bash
set -euo pipefail

# ─── Pre-flight ───────────────────────────────────────────

if ! command -v jq &>/dev/null; then
  echo "::error::jq is required but not found. Install jq or use a GitHub-hosted runner."
  exit 1
fi

if ! command -v curl &>/dev/null; then
  echo "::error::curl is required but not found."
  exit 1
fi

if [[ -z "${HERALD_URL:-}" ]]; then
  echo "::error::herald-url input is required"
  exit 1
fi

if [[ "$HERALD_URL" != http://* && "$HERALD_URL" != https://* ]]; then
  echo "::error::herald-url must start with http:// or https:// (got: $HERALD_URL)"
  exit 1
fi

# Strip trailing slash to keep URL composition predictable.
HERALD_URL="${HERALD_URL%/}"

if [[ -z "${HERALD_API_KEY:-}" ]]; then
  echo "::error::api-key input is required"
  exit 1
fi

# Category is optional. When omitted, Herald categorizes the entry itself (AI
# picks the category when AI features are enabled, otherwise it's inferred from
# the commit subject). Only validate when an explicit value was provided.
CATEGORY="${HERALD_CATEGORY:-}"
if [[ -n "$CATEGORY" ]]; then
  case "$CATEGORY" in
    added|changed|fixed|removed|deprecated|security) ;;
    *)
      echo "::error::Invalid category '$CATEGORY'. Must be one of: added, changed, fixed, removed, deprecated, security."
      exit 1
      ;;
  esac
fi

if [[ -z "${GITHUB_OUTPUT:-}" ]]; then
  echo "::error::GITHUB_OUTPUT is not set. This action must run inside GitHub Actions."
  exit 1
fi

# ─── Helpers ──────────────────────────────────────────────

is_truthy() {
  case "${1:-}" in
    true|TRUE|True|1|yes|YES) return 0 ;;
    *) return 1 ;;
  esac
}

write_output() {
  local key="$1"
  local value="$2"
  {
    echo "${key}<<EOF"
    echo "${value}"
    echo "EOF"
  } >> "$GITHUB_OUTPUT"
}

write_empty_outputs() {
  write_output "entry-ids" ""
  write_output "entry-count" "0"
  write_output "release-id" ""
  write_output "release-version" ""
  write_output "release-url" ""
}

# Scratch space for anything too large to pass as a command-line argument
# (per-commit file lists, the request payload, the response).
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT
COMMITS_FILE="$WORK_DIR/commits.json"
PAYLOAD_FILE="$WORK_DIR/payload.json"
BODY_FILE="$WORK_DIR/body.json"

# ─── Determine commit range / title / content ─────────────

ZERO_SHA="0000000000000000000000000000000000000000"

# Build the git-log path filter (passed after `--`) from include-paths.
PATH_ARGS=()
if [[ -n "${HERALD_INCLUDE_PATHS:-}" ]]; then
  IFS=',' read -ra _PATHS <<< "$HERALD_INCLUDE_PATHS"
  for p in "${_PATHS[@]}"; do
    # Trim whitespace
    p="${p#"${p%%[![:space:]]*}"}"
    p="${p%"${p##*[![:space:]]}"}"
    [[ -z "$p" ]] && continue
    PATH_ARGS+=("$p")
  done
fi

MERGE_FLAGS=()
if ! is_truthy "${HERALD_INCLUDE_MERGES:-false}"; then
  MERGE_FLAGS+=("--no-merges")
fi
LOG_FLAGS=("--format=- %s" ${MERGE_FLAGS[@]+"${MERGE_FLAGS[@]}"})

run_git_log_range() {
  local before="$1"
  local after="$2"
  if [[ ${#PATH_ARGS[@]} -gt 0 ]]; then
    git log "${LOG_FLAGS[@]}" "$before".."$after" -- "${PATH_ARGS[@]}" 2>/dev/null || true
  else
    git log "${LOG_FLAGS[@]}" "$before".."$after" 2>/dev/null || true
  fi
}

run_git_log_head() {
  if [[ ${#PATH_ARGS[@]} -gt 0 ]]; then
    git log "${LOG_FLAGS[@]}" -1 -- "${PATH_ARGS[@]}" 2>/dev/null || true
  else
    git log "${LOG_FLAGS[@]}" -1 2>/dev/null || true
  fi
}

# The commits behind auto-collected content, as JSON
# [{sha, subject, files: [...]}] (newest first, same order and filters as the
# content). Herald uses the file lists to apply the app's "Ignored paths"
# setting, so changes that only touch e.g. tests/ never reach the changelog.
# Takes the same revision arguments as `git log` (a range, or `-1`).
collect_commits_json() {
  local args=("$@")
  if [[ ${#PATH_ARGS[@]} -gt 0 ]]; then
    args+=(-- "${PATH_ARGS[@]}")
  fi
  local log
  log="$(git -c core.quotePath=false log ${MERGE_FLAGS[@]+"${MERGE_FLAGS[@]}"} \
    --format='%x1e%H%x1f%s' --name-only "${args[@]}" 2>/dev/null)" || log=""
  printf '%s' "$log" | jq -Rs '
        split("\u001e")
        | map(select(length > 0)
          | split("\n") as $lines
          | ($lines[0] | split("\u001f")) as $head
          | {sha: $head[0],
             subject: ($head[1:] | join("\u001f")),
             files: ($lines[1:] | map(select(length > 0)))})' \
    2>/dev/null || echo '[]'
}

TITLE="${HERALD_TITLE:-}"
CONTENT="${HERALD_CONTENT:-}"
echo '[]' > "$COMMITS_FILE"

if [[ "$EVENT_NAME" = "release" ]]; then
  TITLE="${TITLE:-$RELEASE_NAME}"
  CONTENT="${CONTENT:-$RELEASE_BODY}"
else
  if [[ -z "$TITLE" ]]; then
    TITLE="$(git log --format='%s' -1 2>/dev/null || true)"
  fi
  if [[ -z "$CONTENT" ]]; then
    if [[ -n "${EVENT_BEFORE:-}" && "$EVENT_BEFORE" != "$ZERO_SHA" && -n "${EVENT_AFTER:-}" ]]; then
      CONTENT="$(run_git_log_range "$EVENT_BEFORE" "$EVENT_AFTER")"
      collect_commits_json "$EVENT_BEFORE".."$EVENT_AFTER" > "$COMMITS_FILE"
      if [[ -z "$CONTENT" && ${#PATH_ARGS[@]} -gt 0 ]]; then
        echo "::notice::No commits in range matched include-paths; skipping Herald post."
        write_empty_outputs
        exit 0
      fi
      if [[ -z "$CONTENT" ]]; then
        echo "::warning::No commits found in range ${EVENT_BEFORE}..${EVENT_AFTER}; falling back to HEAD."
        CONTENT="$(run_git_log_head)"
        collect_commits_json -1 > "$COMMITS_FILE"
      fi
    else
      if [[ "${EVENT_BEFORE:-}" = "$ZERO_SHA" ]]; then
        echo "::warning::Initial push detected (before=zeros); falling back to HEAD commit only."
      fi
      CONTENT="$(run_git_log_head)"
      collect_commits_json -1 > "$COMMITS_FILE"
    fi
  fi
fi

if [[ -z "$TITLE" ]]; then
  TITLE="Changelog update"
fi

# ─── Build entry payload ──────────────────────────────────

ENTRY=$(jq -n \
  --arg title "$TITLE" \
  --arg content "$CONTENT" \
  '{title: $title, content: $content}')

# Only attach a category when one was explicitly provided; otherwise let Herald
# auto-categorize the entry.
if [[ -n "$CATEGORY" ]]; then
  ENTRY=$(echo "$ENTRY" | jq --arg category "$CATEGORY" '. + {category: $category}')
fi

if [[ -n "${HERALD_SECTION:-}" ]]; then
  ENTRY=$(echo "$ENTRY" | jq --arg section "$HERALD_SECTION" '. + {section_name: $section}')
fi

# Attach the commit SHA so Herald can de-duplicate this entry against its
# "Generate from commits" flow. Prefer an explicit input, then the pushed tip
# commit, then HEAD. Stays empty (and is omitted) when none can be resolved.
COMMIT_SHA="${HERALD_COMMIT_SHA:-}"
if [[ -z "$COMMIT_SHA" && -n "${EVENT_AFTER:-}" && "$EVENT_AFTER" != "$ZERO_SHA" ]]; then
  COMMIT_SHA="$EVENT_AFTER"
fi
if [[ -z "$COMMIT_SHA" ]]; then
  COMMIT_SHA="$(git rev-parse HEAD 2>/dev/null || true)"
fi
if [[ -n "$COMMIT_SHA" ]]; then
  ENTRY=$(echo "$ENTRY" | jq --arg commit_sha "$COMMIT_SHA" '. + {commit_sha: $commit_sha}')
fi

# ─── Determine release block ──────────────────────────────

VERSION="${HERALD_VERSION:-}"
if [[ -z "$VERSION" ]]; then
  if [[ "$EVENT_NAME" = "release" && -n "${RELEASE_TAG:-}" ]]; then
    VERSION="$RELEASE_TAG"
  elif [[ "$EVENT_NAME" = "push" ]]; then
    # Auto-detect version from a tag pointing at HEAD; silent if none.
    VERSION="$(git describe --tags --exact-match HEAD 2>/dev/null || true)"
  fi
fi

RELEASE_TITLE="${HERALD_RELEASE_TITLE:-}"
RELEASE_SUMMARY="${HERALD_RELEASE_SUMMARY:-}"
if [[ "$EVENT_NAME" = "release" ]]; then
  RELEASE_TITLE="${RELEASE_TITLE:-$RELEASE_NAME}"
  RELEASE_SUMMARY="${RELEASE_SUMMARY:-$RELEASE_BODY}"
fi

# Default publish: true on release events, false otherwise.
if [[ -n "${HERALD_PUBLISH:-}" ]]; then
  if is_truthy "$HERALD_PUBLISH"; then PUBLISH_BOOL="true"; else PUBLISH_BOOL="false"; fi
else
  if [[ "$EVENT_NAME" = "release" ]]; then PUBLISH_BOOL="true"; else PUBLISH_BOOL="false"; fi
fi

if [[ -n "$VERSION" ]]; then
  RELEASE_BLOCK=$(jq -n \
    --arg version "$VERSION" \
    --arg title "$RELEASE_TITLE" \
    --arg summary "$RELEASE_SUMMARY" \
    --argjson publish "$PUBLISH_BOOL" \
    '{version: $version, title: $title, summary: $summary, publish: $publish}')
  JSON=$(jq -n \
    --argjson release "$RELEASE_BLOCK" \
    --argjson entry "$ENTRY" \
    '{release: $release, entries: [$entry]}')
else
  JSON=$(jq -n --argjson entry "$ENTRY" '{entries: [$entry]}')
fi

# Attach the per-commit file lists (only present for auto-collected content,
# never with an explicit `content` input, since Herald rebuilds the content
# from whichever commits survive the app's ignored paths). Older Herald
# versions ignore the field. Read from a file: it can be large.
if jq -e 'type == "array" and length > 0' "$COMMITS_FILE" >/dev/null 2>&1; then
  jq --slurpfile commits "$COMMITS_FILE" '.entries[0] += {commits: $commits[0]}' \
    <<< "$JSON" > "$PAYLOAD_FILE"
else
  printf '%s' "$JSON" > "$PAYLOAD_FILE"
fi

# ─── POST to Herald ───────────────────────────────────────

set +e
HTTP_CODE=$(curl -sS \
  --max-time 30 \
  --retry 2 --retry-delay 2 --retry-connrefused \
  -o "$BODY_FILE" \
  -w "%{http_code}" \
  -X POST "${HERALD_URL}/api/webhook" \
  -H "Authorization: Bearer ${HERALD_API_KEY}" \
  -H "Content-Type: application/json" \
  --data-binary @"$PAYLOAD_FILE")
CURL_EXIT=$?
set -e

BODY="$(cat "$BODY_FILE")"

if [[ $CURL_EXIT -ne 0 || -z "$HTTP_CODE" ]]; then
  echo "::error::Failed to reach Herald (curl exit $CURL_EXIT)"
  echo "$BODY"
  exit 1
fi

if [[ "$HTTP_CODE" -lt 200 || "$HTTP_CODE" -ge 300 ]]; then
  echo "::error::Failed to send to Herald (HTTP $HTTP_CODE): $BODY"
  exit 1
fi

echo "Sent changelog update to Herald"
echo "$BODY" | jq . 2>/dev/null || echo "$BODY"

# ─── Parse response and write outputs ─────────────────────

if ! echo "$BODY" | jq -e . >/dev/null 2>&1; then
  echo "::warning::Herald response was not valid JSON; outputs will be empty."
  write_empty_outputs
  exit 0
fi

ENTRY_IDS=$(echo "$BODY" | jq -r '[.entries[]?.id] | join(",")')
SKIPPED_COUNT=$(echo "$BODY" | jq -r '[.skipped[]?] | length')
if [[ "$SKIPPED_COUNT" -gt 0 ]]; then
  echo "::notice::Herald skipped ${SKIPPED_COUNT} entry(ies): every commit only touched paths this app ignores (Settings > Ignored paths)."
fi
ENTRY_COUNT=$(echo "$BODY" | jq -r '[.entries[]?.id] | length')
RELEASE_ID=$(echo "$BODY" | jq -r '.release.id // empty')
RELEASE_VERSION=$(echo "$BODY" | jq -r '.release.version // empty')

RELEASE_URL=""
if [[ -n "$RELEASE_VERSION" ]]; then
  ENCODED=$(jq -rn --arg v "$RELEASE_VERSION" '$v|@uri')
  RELEASE_URL="${HERALD_URL}/releases/${ENCODED}"
fi

write_output "entry-ids" "$ENTRY_IDS"
write_output "entry-count" "$ENTRY_COUNT"
write_output "release-id" "$RELEASE_ID"
write_output "release-version" "$RELEASE_VERSION"
write_output "release-url" "$RELEASE_URL"
