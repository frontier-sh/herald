-- Multi-app support: one Herald install powers several changelogs ("apps"),
-- each with its own URL path, theming, source repo and Slack destination.
--
-- Backwards compatibility is non-negotiable: every existing row belongs to
-- app 1 (the default app, served at `/` exactly as today), so all the new
-- app_id columns default to 1 and the seeded app inherits the current
-- project name/description. Runs unattended on existing AND fresh databases.

-- Apps
CREATE TABLE IF NOT EXISTS apps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_apps_default ON apps(is_default);

-- The pre-existing changelog becomes app 1 and stays the default app. On a
-- fresh database the settings rows don't exist yet, hence the COALESCE.
INSERT OR IGNORE INTO apps (id, slug, name, description, is_default)
VALUES (1, 'default',
  COALESCE((SELECT value FROM settings WHERE key = 'project_name'), 'My Project'),
  COALESCE((SELECT value FROM settings WHERE key = 'project_description'), ''),
  1);

-- Per-app settings. Same key/value shape as `settings`, keyed by app.
CREATE TABLE IF NOT EXISTS app_settings (
  app_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  PRIMARY KEY (app_id, key)
);

-- Move the per-app keys from the global settings table to app 1. Anything not
-- listed here stays global (ai_model, base_url, onboarding_completed, and the
-- legacy github_pat handling).
INSERT OR IGNORE INTO app_settings (app_id, key, value)
SELECT 1, key, value FROM settings WHERE key IN (
  'project_name', 'project_description', 'auto_publish', 'ai_enabled',
  'ai_personality', 'entry_grouping', 'timezone', 'date_grouping', 'theme',
  'primary_color', 'logo_image_key', 'favicon_image_key', 'show_title',
  'show_description', 'hide_attribution', 'slack_webhook_url',
  'slack_notifications_enabled', 'source_repo'
);

DELETE FROM settings WHERE key IN (
  'project_name', 'project_description', 'auto_publish', 'ai_enabled',
  'ai_personality', 'entry_grouping', 'timezone', 'date_grouping', 'theme',
  'primary_color', 'logo_image_key', 'favicon_image_key', 'show_title',
  'show_description', 'hide_attribution', 'slack_webhook_url',
  'slack_notifications_enabled', 'source_repo'
);

-- Ownership columns. SQLite forbids a REFERENCES clause on ADD COLUMN with a
-- non-null default, so the app_id link is enforced in the services layer
-- (and by the cascading deletes in deleteApp()).
ALTER TABLE entries ADD COLUMN app_id INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_entries_app ON entries(app_id);

ALTER TABLE releases ADD COLUMN app_id INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_releases_app ON releases(app_id);

ALTER TABLE api_keys ADD COLUMN app_id INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_api_keys_app ON api_keys(app_id);

-- Release versions are unique per app, not globally: two apps may both ship
-- "v1.0.0". Version is still an upsert key and a public URL slug within an app.
DROP INDEX IF EXISTS idx_releases_version_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_releases_app_version_unique ON releases(app_id, version);

-- Sections: `name` is UNIQUE at table level, so a rebuild is required to make
-- it UNIQUE(app_id, name). Ids are preserved so entries.section_id stays valid;
-- deferring foreign keys lets the old table be dropped mid-transaction.
--
-- DROP TABLE performs an implicit DELETE FROM, which fires entries.section_id's
-- ON DELETE SET NULL action (deferral only postpones constraint *checks*, not
-- actions) — and `PRAGMA foreign_keys = off` is a no-op inside the transaction
-- wrangler wraps this file in. So stash the entry→section links first and put
-- them back once the rebuilt table exists.
PRAGMA defer_foreign_keys = true;

DROP TABLE IF EXISTS entry_sections_backup;
CREATE TABLE entry_sections_backup (
  entry_id INTEGER NOT NULL,
  section_id INTEGER NOT NULL
);
INSERT INTO entry_sections_backup (entry_id, section_id)
SELECT id, section_id FROM entries WHERE section_id IS NOT NULL;

CREATE TABLE sections_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_id INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (app_id, name)
);

INSERT INTO sections_new (id, app_id, name, sort_order, created_at)
SELECT id, 1, name, sort_order, created_at FROM sections;

DROP TABLE sections;
ALTER TABLE sections_new RENAME TO sections;

CREATE INDEX IF NOT EXISTS idx_sections_sort ON sections(sort_order);
CREATE INDEX IF NOT EXISTS idx_sections_app ON sections(app_id);

UPDATE entries
   SET section_id = (SELECT b.section_id FROM entry_sections_backup b WHERE b.entry_id = entries.id)
 WHERE id IN (SELECT entry_id FROM entry_sections_backup);

DROP TABLE entry_sections_backup;

-- The `projects` table from 0001 was superseded by settings and is never read
-- or written by any code; apps now own the name/description it modelled.
DROP TABLE IF EXISTS projects;
