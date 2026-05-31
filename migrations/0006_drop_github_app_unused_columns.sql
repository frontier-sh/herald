-- The GitHub App is now used only to gate admin login. Commit reading moved
-- to a user-supplied PAT, and the manifest-version upgrade flow was removed,
-- so these columns are no longer read by any code. Drop them.
ALTER TABLE github_app_config DROP COLUMN app_id;
ALTER TABLE github_app_config DROP COLUMN slug;
ALTER TABLE github_app_config DROP COLUMN webhook_secret;
ALTER TABLE github_app_config DROP COLUMN pem;
ALTER TABLE github_app_config DROP COLUMN manifest_version;
