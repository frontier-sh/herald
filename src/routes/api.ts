import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Bindings } from '../bindings';
import { apiKeyAuth } from '../middleware/auth';
import {
  listEntries,
  getEntry,
  createEntry,
  updateEntry,
  deleteEntry,
  publishEntry,
} from '../services/entries';
import {
  listReleases,
  getRelease,
  getReleaseByVersion,
  createRelease,
  updateRelease,
  deleteRelease,
  publishRelease,
  appendEntriesToRelease,
  getReleaseVersionsForEntry,
} from '../services/releases';
import {
  getAppSetting,
  getAllAppSettings,
  setAppSetting,
  PER_APP_SETTING_KEYS,
} from '../services/settings';
import { getApp } from '../services/apps';
import { notifyEntryPublished, notifyReleasePublishedWhenReady } from '../services/slack';
import {
  createApiKey,
  listApiKeys,
  deleteApiKey,
} from '../services/api-keys';
import { listSections, getOrCreateSection } from '../services/sections';
import { enqueueAISummarization } from '../services/ai';
import { purgePublicCache, purgeReleasePages } from '../services/cache';
import type { Category, EntryStatus, ReleaseStatus } from '../db/schema';

/**
 * Every request to /api is authenticated by an API key, and every API key
 * belongs to exactly one app (keys issued before multi-app support carry
 * app_id = 1). `apiKeyAppId` is that app: it is the ONLY tenant selector in this
 * router — the payloads carry no app/tenant field, so existing GitHub Actions
 * keep hitting the default app with byte-identical requests.
 */
type ApiEnv = { Bindings: Bindings; Variables: { apiKeyAppId: number } };

const api = new Hono<ApiEnv>();

/** Public origin for cache purges: explicit BASE_URL wins, else the request host. */
function baseUrlFor(c: Context<ApiEnv>): string {
  const url = new URL(c.req.url);
  return c.env.BASE_URL || `${url.protocol}//${url.host}`;
}

/** Purge the per-release public pages of the calling key's app. */
async function purgeAppReleasePages(
  c: Context<ApiEnv>,
  appId: number,
  versions: string[],
): Promise<void> {
  if (versions.length === 0) return;
  const app = await getApp(c.env.DB, appId);
  if (!app) return;
  await purgeReleasePages(baseUrlFor(c), app, versions);
}

// Apply API key auth to all routes
api.use('/*', apiKeyAuth);

// Purge public page cache after any successful mutation — for the app the
// calling key belongs to, since that's the only app this request can have
// changed.
api.use('/*', async (c, next) => {
  await next();
  const method = c.req.method;
  if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
    const status = c.res.status;
    if (status >= 200 && status < 400) {
      const baseUrl = baseUrlFor(c);
      const appId = c.get('apiKeyAppId');
      c.executionCtx.waitUntil(
        (async () => {
          const app = await getApp(c.env.DB, appId);
          if (app) await purgePublicCache(baseUrl, app);
        })(),
      );
    }
  }
});

// ─── Entries ───────────────────────────────────────────────

api.post('/entries', async (c) => {
  try {
    const appId = c.get('apiKeyAppId');
    const body = await c.req.json<{
      title?: string;
      content?: string;
      category?: Category;
      section_name?: string;
      source?: string;
      source_metadata?: string;
      commit_sha?: string;
    }>();

    if (!body.title) {
      return c.json({ error: 'title is required' }, 400);
    }

    let sectionId: number | null = null;
    if (body.section_name?.trim()) {
      const section = await getOrCreateSection(c.env.DB, appId, body.section_name.trim());
      sectionId = section.id;
    }

    const entry = await createEntry(c.env.DB, appId, {
      title: body.title,
      content: body.content,
      category: body.category,
      section_id: sectionId,
      source: body.source,
      source_metadata: body.source_metadata,
      commit_sha: body.commit_sha?.trim() || undefined,
    });

    // Auto-publish entries received via the API when the setting is on — but
    // never before AI has rewritten them (see below). Both switches are per-app.
    const wantPublish = (await getAppSetting(c.env.DB, appId, 'auto_publish')) === 'true';

    // Check if AI processing is enabled and enqueue if so
    const aiEnabled = await getAppSetting(c.env.DB, appId, 'ai_enabled');
    if (aiEnabled === 'true' && entry.content) {
      // Defer publishing to the queue worker via publish_on_ai_complete so the
      // raw commit isn't exposed before the AI rewrite lands.
      await c.env.DB.prepare(
        'UPDATE entries SET raw_content = ?, ai_status = ?, publish_on_ai_complete = ? WHERE id = ?',
      ).bind(entry.content, 'pending', wantPublish ? 1 : 0, entry.id).run();

      await enqueueAISummarization(c.env.CHANGELOG_QUEUE, entry.id, entry.content);
    } else if (wantPublish) {
      // No AI rewrite to wait on — publish the original content immediately.
      await publishEntry(c.env.DB, appId, entry.id);
      c.executionCtx.waitUntil(notifyEntryPublished(c.env, entry.id));
    }

    return c.json(entry, 201);
  } catch (err) {
    return c.json({ error: 'Failed to create entry' }, 500);
  }
});

api.get('/entries', async (c) => {
  try {
    const appId = c.get('apiKeyAppId');
    const status = c.req.query('status') as EntryStatus | undefined;
    const category = c.req.query('category') as Category | undefined;
    const entries = await listEntries(c.env.DB, appId, { status, category });
    return c.json(entries);
  } catch (err) {
    return c.json({ error: 'Failed to list entries' }, 500);
  }
});

api.get('/entries/:id', async (c) => {
  try {
    const appId = c.get('apiKeyAppId');
    const id = parseInt(c.req.param('id'), 10);
    if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

    // Scoped lookup: an id belonging to another app reads as "not found".
    const entry = await getEntry(c.env.DB, appId, id);
    if (!entry) return c.json({ error: 'Entry not found' }, 404);

    return c.json(entry);
  } catch (err) {
    return c.json({ error: 'Failed to get entry' }, 500);
  }
});

api.put('/entries/:id', async (c) => {
  try {
    const appId = c.get('apiKeyAppId');
    const id = parseInt(c.req.param('id'), 10);
    if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

    const body = await c.req.json();
    const entry = await updateEntry(c.env.DB, appId, id, body);
    if (!entry) return c.json({ error: 'Entry not found' }, 404);

    const versions = await getReleaseVersionsForEntry(c.env.DB, id);
    c.executionCtx.waitUntil(purgeAppReleasePages(c, appId, versions));

    return c.json(entry);
  } catch (err) {
    return c.json({ error: 'Failed to update entry' }, 500);
  }
});

api.delete('/entries/:id', async (c) => {
  try {
    const appId = c.get('apiKeyAppId');
    const id = parseInt(c.req.param('id'), 10);
    if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

    const versions = await getReleaseVersionsForEntry(c.env.DB, id);
    const deleted = await deleteEntry(c.env.DB, appId, id);
    if (!deleted) return c.json({ error: 'Entry not found' }, 404);

    c.executionCtx.waitUntil(purgeAppReleasePages(c, appId, versions));

    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: 'Failed to delete entry' }, 500);
  }
});

api.post('/entries/:id/publish', async (c) => {
  try {
    const appId = c.get('apiKeyAppId');
    const id = parseInt(c.req.param('id'), 10);
    if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

    const entry = await publishEntry(c.env.DB, appId, id);
    if (!entry) return c.json({ error: 'Entry not found' }, 404);

    const versions = await getReleaseVersionsForEntry(c.env.DB, id);
    c.executionCtx.waitUntil(purgeAppReleasePages(c, appId, versions));

    return c.json(entry);
  } catch (err) {
    return c.json({ error: 'Failed to publish entry' }, 500);
  }
});

// ─── Sections ─────────────────────────────────────────────

api.get('/sections', async (c) => {
  try {
    const sections = await listSections(c.env.DB, c.get('apiKeyAppId'));
    return c.json(sections);
  } catch (err) {
    return c.json({ error: 'Failed to list sections' }, 500);
  }
});

// ─── Releases ──────────────────────────────────────────────

api.post('/releases', async (c) => {
  try {
    const appId = c.get('apiKeyAppId');
    const body = await c.req.json<{
      version?: string;
      title?: string;
      summary?: string;
    }>();

    if (!body.version) {
      return c.json({ error: 'version is required' }, 400);
    }

    const release = await createRelease(c.env.DB, appId, {
      version: body.version,
      title: body.title,
      summary: body.summary,
    });
    return c.json(release, 201);
  } catch (err) {
    return c.json({ error: 'Failed to create release' }, 500);
  }
});

api.get('/releases', async (c) => {
  try {
    const appId = c.get('apiKeyAppId');
    const status = c.req.query('status') as ReleaseStatus | undefined;
    const releases = await listReleases(c.env.DB, appId, { status });
    return c.json(releases);
  } catch (err) {
    return c.json({ error: 'Failed to list releases' }, 500);
  }
});

api.get('/releases/:id', async (c) => {
  try {
    const appId = c.get('apiKeyAppId');
    const id = parseInt(c.req.param('id'), 10);
    if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

    const release = await getRelease(c.env.DB, appId, id);
    if (!release) return c.json({ error: 'Release not found' }, 404);

    return c.json(release);
  } catch (err) {
    return c.json({ error: 'Failed to get release' }, 500);
  }
});

api.put('/releases/:id', async (c) => {
  try {
    const appId = c.get('apiKeyAppId');
    const id = parseInt(c.req.param('id'), 10);
    if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

    const body = await c.req.json<{
      version?: string;
      title?: string;
      summary?: string;
      status?: ReleaseStatus;
      entryIds?: number[];
    }>();

    const { entryIds, ...data } = body;
    const release = await updateRelease(c.env.DB, appId, id, data, entryIds);
    if (!release) return c.json({ error: 'Release not found' }, 404);

    return c.json(release);
  } catch (err) {
    return c.json({ error: 'Failed to update release' }, 500);
  }
});

api.delete('/releases/:id', async (c) => {
  try {
    const appId = c.get('apiKeyAppId');
    const id = parseInt(c.req.param('id'), 10);
    if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

    const deleted = await deleteRelease(c.env.DB, appId, id);
    if (!deleted) return c.json({ error: 'Release not found' }, 404);

    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: 'Failed to delete release' }, 500);
  }
});

api.post('/releases/:id/publish', async (c) => {
  try {
    const appId = c.get('apiKeyAppId');
    const id = parseInt(c.req.param('id'), 10);
    if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

    const before = await getRelease(c.env.DB, appId, id);
    const release = await publishRelease(c.env.DB, appId, id);
    if (!release) return c.json({ error: 'Release not found' }, 404);
    if (before && before.status !== 'published') {
      c.executionCtx.waitUntil(notifyReleasePublishedWhenReady(c.env, id));
    }

    return c.json(release);
  } catch (err) {
    return c.json({ error: 'Failed to publish release' }, 500);
  }
});

// ─── Settings ──────────────────────────────────────────────
//
// These endpoints read and write the calling key's app ONLY, and only the keys
// on the per-app allowlist (PER_APP_SETTING_KEYS). Instance-wide settings
// (`ai_model`, `base_url`, `onboarding_completed`) are deliberately not exposed
// here: an API key is scoped to one app and must not read or rewrite state that
// affects the whole install (or another app).

api.get('/settings', async (c) => {
  try {
    const appId = c.get('apiKeyAppId');
    const stored = await getAllAppSettings(c.env.DB, appId);
    const settings: Record<string, string> = {};
    for (const key of PER_APP_SETTING_KEYS) {
      if (key in stored) settings[key] = stored[key];
    }
    return c.json(settings);
  } catch (err) {
    return c.json({ error: 'Failed to get settings' }, 500);
  }
});

api.put('/settings', async (c) => {
  try {
    const appId = c.get('apiKeyAppId');
    const body = await c.req.json<Record<string, string>>();

    // Keys outside the per-app allowlist are ignored rather than rejected, so a
    // client sending an unknown/global key still gets its valid keys applied.
    for (const [key, value] of Object.entries(body)) {
      if (!PER_APP_SETTING_KEYS.includes(key)) continue;
      await setAppSetting(c.env.DB, appId, key, value);
    }

    const stored = await getAllAppSettings(c.env.DB, appId);
    const settings: Record<string, string> = {};
    for (const key of PER_APP_SETTING_KEYS) {
      if (key in stored) settings[key] = stored[key];
    }
    return c.json(settings);
  } catch (err) {
    return c.json({ error: 'Failed to update settings' }, 500);
  }
});

// ─── API Keys ──────────────────────────────────────────────
//
// Key management stays available over the API but never crosses app
// boundaries: a key can only mint, list and revoke keys for its own app.

api.post('/keys', async (c) => {
  try {
    const appId = c.get('apiKeyAppId');
    const body = await c.req.json<{ name?: string }>();

    if (!body.name) {
      return c.json({ error: 'name is required' }, 400);
    }

    const apiKey = await createApiKey(c.env.DB, appId, body.name);
    return c.json(apiKey, 201);
  } catch (err) {
    return c.json({ error: 'Failed to create API key' }, 500);
  }
});

api.get('/keys', async (c) => {
  try {
    const keys = await listApiKeys(c.env.DB, c.get('apiKeyAppId'));
    return c.json(keys);
  } catch (err) {
    return c.json({ error: 'Failed to list API keys' }, 500);
  }
});

api.delete('/keys/:id', async (c) => {
  try {
    const appId = c.get('apiKeyAppId');
    const id = parseInt(c.req.param('id'), 10);
    if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

    const deleted = await deleteApiKey(c.env.DB, appId, id);
    if (!deleted) return c.json({ error: 'API key not found' }, 404);

    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: 'Failed to delete API key' }, 500);
  }
});

// ─── Webhook (generic ingest) ──────────────────────────────
//
// The payload is unchanged and carries no app field — the target app is the one
// the API key belongs to. Existing GitHub Actions keep posting exactly what they
// posted before and land in the default app (their keys have app_id = 1).

api.post('/webhook', async (c) => {
  try {
    const appId = c.get('apiKeyAppId');
    const body = await c.req.json<{
      release?: {
        version?: string;
        title?: string;
        summary?: string;
        publish?: boolean;
      };
      entries?: Array<{
        title: string;
        content?: string;
        category?: Category;
        section_name?: string;
        commit_sha?: string;
      }>;
    }>();

    if (!body.entries || !Array.isArray(body.entries)) {
      return c.json({ error: 'entries array is required' }, 400);
    }

    if (body.release !== undefined) {
      if (!body.release.version || typeof body.release.version !== 'string') {
        return c.json({ error: 'release.version is required when release is provided' }, 400);
      }
    }

    // Check AI/publish settings once for all entries in the batch. An entry
    // should auto-publish when the setting is on, or when it's part of a release
    // being published in this same request — but always after AI, never before.
    // Both are per-app settings, read for the key's app.
    const aiEnabled = await getAppSetting(c.env.DB, appId, 'ai_enabled');
    const autoPublish = (await getAppSetting(c.env.DB, appId, 'auto_publish')) === 'true';
    const wantPublish = autoPublish || body.release?.publish === true;

    // Determine up front whether a single consolidated release message will be
    // sent for this batch, so per-entry notifications (here and in the AI queue
    // worker) can be suppressed to avoid double-notifying. It fires only on a
    // draft→published transition; an already-published release sends no
    // consolidated message, so its entries fall back to per-entry notifications.
    // Versions are unique per app, so the lookup is app-scoped.
    const existingRelease = body.release?.version
      ? await getReleaseByVersion(c.env.DB, appId, body.release.version)
      : null;
    const releaseWillNotify =
      body.release?.publish === true &&
      (!existingRelease || existingRelease.status !== 'published');

    const created = [];
    for (const item of body.entries) {
      if (!item.title) {
        return c.json({ error: 'Each entry must have a title' }, 400);
      }

      let sectionId: number | null = null;
      if (item.section_name?.trim()) {
        const section = await getOrCreateSection(c.env.DB, appId, item.section_name.trim());
        sectionId = section.id;
      }

      const entry = await createEntry(c.env.DB, appId, {
        title: item.title,
        content: item.content,
        category: item.category,
        section_id: sectionId,
        source: 'api',
        commit_sha: item.commit_sha?.trim() || undefined,
      });

      // Enqueue for AI processing if enabled
      if (aiEnabled === 'true' && entry.content) {
        // Defer publishing to the queue worker via publish_on_ai_complete so the
        // raw commit isn't exposed before the AI rewrite lands.
        await c.env.DB.prepare(
          'UPDATE entries SET raw_content = ?, ai_status = ?, publish_on_ai_complete = ? WHERE id = ?',
        ).bind(entry.content, 'pending', wantPublish ? 1 : 0, entry.id).run();

        // The queue message shape is unchanged (entry id only) — the worker
        // reads the entry's app_id from the row, so messages enqueued before an
        // upgrade still process correctly.
        await enqueueAISummarization(
          c.env.CHANGELOG_QUEUE,
          entry.id,
          entry.content,
          releaseWillNotify,
        );
      } else if (wantPublish) {
        // No AI rewrite to wait on — publish the original content immediately.
        // (The release.publish cascade below would also catch these, but doing
        // it here keeps non-release auto-publish working too.)
        await publishEntry(c.env.DB, appId, entry.id);
        // Notify per-entry unless a consolidated release message will cover this
        // batch, in which case that single message replaces the per-entry ones.
        if (!releaseWillNotify) {
          c.executionCtx.waitUntil(notifyEntryPublished(c.env, entry.id));
        }
      }

      created.push(entry);
    }

    let releaseResponse = null;
    if (body.release?.version) {
      const version = body.release.version;
      // Reuse the status snapshot taken before the entry loop; releaseWillNotify
      // was derived from it, so the publish-time check below stays consistent.
      let release = existingRelease;
      if (!release) {
        release = await createRelease(c.env.DB, appId, {
          version,
          title: body.release.title,
          summary: body.release.summary,
        });
      } else {
        // Only fill in title/summary when currently empty - don't clobber human edits
        const updates: { title?: string; summary?: string } = {};
        if (body.release.title && !release.title) updates.title = body.release.title;
        if (body.release.summary && !release.summary) updates.summary = body.release.summary;
        if (Object.keys(updates).length > 0) {
          await updateRelease(c.env.DB, appId, release.id, updates);
        }
      }

      await appendEntriesToRelease(
        c.env.DB,
        appId,
        release.id,
        created.map((e) => e.id),
      );

      if (body.release.publish) {
        // `release.status` reflects state before this publish — only the
        // draft→published transition should fire the consolidated message. When
        // entries are still being AI-rewritten this defers until they land, so
        // the message carries post-AI titles (the queue worker sends it then).
        const wasPublished = release.status === 'published';
        await publishRelease(c.env.DB, appId, release.id);
        if (!wasPublished) {
          c.executionCtx.waitUntil(notifyReleasePublishedWhenReady(c.env, release.id));
        }
      }

      releaseResponse = await getRelease(c.env.DB, appId, release.id);

      // Invalidate the per-release public page in addition to the global purge
      // performed by the API middleware. Both are scoped to the key's app, so
      // the path carries that app's base path.
      c.executionCtx.waitUntil(purgeAppReleasePages(c, appId, [version]));
    }

    return c.json({ release: releaseResponse, entries: created }, 201);
  } catch (err) {
    return c.json({ error: 'Failed to process webhook' }, 500);
  }
});

export default api;
