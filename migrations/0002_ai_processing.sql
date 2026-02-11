-- AI processing indexes
-- Note: ai_status and raw_content columns already exist in 0001_initial_schema.sql
-- This migration adds an index for efficient AI status queries.

CREATE INDEX IF NOT EXISTS idx_entries_ai_status ON entries(ai_status);
