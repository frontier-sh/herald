-- Enforce unique release versions so they can be used as upsert keys
-- (CI release-sync) and as public URL slugs (/releases/:version).
CREATE UNIQUE INDEX IF NOT EXISTS idx_releases_version_unique ON releases(version);
