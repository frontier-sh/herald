-- When 1, this release is published but still waiting on AI rewrites of its
-- entries before its consolidated Slack notification is sent. Set by the webhook
-- when it publishes a release whose entries were just enqueued for AI; the queue
-- worker sends the notification (and clears this flag) once the last entry's
-- rewrite lands, so the message carries post-AI titles rather than raw commits.
ALTER TABLE releases ADD COLUMN publish_notify_pending INTEGER NOT NULL DEFAULT 0;
