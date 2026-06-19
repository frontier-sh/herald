-- Intent flag for entries that should auto-publish, but only once AI has
-- finished rewriting them. Set at ingest time (auto-publish setting, the
-- release.publish cascade, or the Generate "auto-publish" option) instead of
-- flipping status to 'published' immediately — that would expose the raw commit
-- before the AI rewrite. The queue worker publishes the entry when AI completes.
ALTER TABLE entries ADD COLUMN publish_on_ai_complete INTEGER NOT NULL DEFAULT 0;
