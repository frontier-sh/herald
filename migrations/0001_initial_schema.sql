-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT 'My Project',
  description TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Entries
CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'added' CHECK(category IN ('added','changed','fixed','removed','deprecated','security')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','github','api')),
  source_metadata TEXT,
  ai_status TEXT CHECK(ai_status IN (NULL,'pending','processing','completed','failed')),
  raw_content TEXT
);

-- Releases
CREATE TABLE IF NOT EXISTS releases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT NOT NULL,
  title TEXT DEFAULT '',
  summary TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Release-Entry junction
CREATE TABLE IF NOT EXISTS release_entries (
  release_id INTEGER NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (release_id, entry_id)
);

-- Settings
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- API Keys
CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_entries_status ON entries(status);
CREATE INDEX IF NOT EXISTS idx_entries_category ON entries(category);
CREATE INDEX IF NOT EXISTS idx_releases_status ON releases(status);
CREATE INDEX IF NOT EXISTS idx_release_entries_release ON release_entries(release_id);
CREATE INDEX IF NOT EXISTS idx_release_entries_entry ON release_entries(entry_id);

-- Default settings
INSERT OR IGNORE INTO settings (key, value) VALUES ('project_name', 'My Project');
INSERT OR IGNORE INTO settings (key, value) VALUES ('project_description', '');
INSERT OR IGNORE INTO settings (key, value) VALUES ('auto_publish', 'false');
INSERT OR IGNORE INTO settings (key, value) VALUES ('ai_enabled', 'false');
INSERT OR IGNORE INTO settings (key, value) VALUES ('ai_model', '@cf/meta/llama-4-scout-17b-16e-instruct');

-- Default project
INSERT OR IGNORE INTO projects (id, name) VALUES (1, 'My Project');
