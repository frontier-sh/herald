-- GitHub App configuration produced by the in-app setup wizard.
-- Replaces the previous GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET /
-- GITHUB_ALLOWED_REPO environment variables.
CREATE TABLE IF NOT EXISTS github_app_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  app_id INTEGER NOT NULL,
  slug TEXT NOT NULL,
  client_id TEXT NOT NULL,
  client_secret TEXT NOT NULL,
  webhook_secret TEXT,
  pem TEXT NOT NULL,
  html_url TEXT NOT NULL,
  installation_id INTEGER,
  allowed_repo TEXT,
  manifest_version INTEGER NOT NULL DEFAULT 1,
  session_secret TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
