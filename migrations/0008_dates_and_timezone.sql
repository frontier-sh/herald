-- Dedicated, editable "date of the change" for entries and releases.
-- Nullable; display/grouping resolves as entry_date -> published_at -> created_at.
ALTER TABLE entries  ADD COLUMN entry_date   TEXT;
ALTER TABLE releases ADD COLUMN release_date TEXT;

-- Backfill existing rows: default to published_at, fall back to created_at.
UPDATE entries  SET entry_date   = COALESCE(published_at, created_at) WHERE entry_date   IS NULL;
UPDATE releases SET release_date = COALESCE(published_at, created_at) WHERE release_date IS NULL;

-- Default display timezone and timeline date-grouping granularity.
INSERT OR IGNORE INTO settings (key, value) VALUES ('timezone', 'UTC');
INSERT OR IGNORE INTO settings (key, value) VALUES ('date_grouping', 'day');
