-- Encrypted GitHub personal access token used by "Generate from commits".
-- Kept here rather than in the settings table so it is never returned by
-- getAllSettings()/the public API, and stored as AES-GCM ciphertext (see
-- src/services/secrets.ts). Write-only from the UI: decrypted server-side only
-- when calling the GitHub API.
ALTER TABLE github_app_config ADD COLUMN source_pat TEXT;
