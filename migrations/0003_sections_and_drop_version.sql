-- Sections table for product-area groupings (e.g. Core, Desktop, API)
CREATE TABLE IF NOT EXISTS sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sections_sort ON sections(sort_order);

-- Add section_id FK to entries
ALTER TABLE entries ADD COLUMN section_id INTEGER REFERENCES sections(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_entries_section ON entries(section_id);

-- Drop version from entries (redundant with release version)
ALTER TABLE entries DROP COLUMN version;

-- Default setting for entry grouping on public changelog
INSERT OR IGNORE INTO settings (key, value) VALUES ('entry_grouping', 'category');
