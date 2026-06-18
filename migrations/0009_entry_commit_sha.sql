-- Optional related commit ID for entries generated from GitHub commits.
-- Lets the Generate flow detect already-imported commits and avoid duplicates.
ALTER TABLE entries ADD COLUMN commit_sha TEXT;

-- Backfill from existing GitHub imports, which stored the SHA in source_metadata JSON.
UPDATE entries
   SET commit_sha = json_extract(source_metadata, '$.sha')
 WHERE source = 'github'
   AND source_metadata IS NOT NULL
   AND json_extract(source_metadata, '$.sha') IS NOT NULL;

-- Speed up the duplicate lookup when re-running Generate.
CREATE INDEX IF NOT EXISTS idx_entries_commit_sha ON entries(commit_sha);
