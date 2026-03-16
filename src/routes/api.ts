import { Hono } from 'hono';
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
  createRelease,
  updateRelease,
  deleteRelease,
  publishRelease,
} from '../services/releases';
import { getAllSettings, getSetting, setSetting } from '../services/settings';
import {
  createApiKey,
  listApiKeys,
  deleteApiKey,
} from '../services/api-keys';
import { listSections, getOrCreateSection } from '../services/sections';
import { enqueueAISummarization } from '../services/ai';
import { purgePublicCache } from '../services/cache';
import type { Category, EntryStatus, ReleaseStatus } from '../db/schema';

const api = new Hono<{ Bindings: Bindings }>();

// Apply API key auth to all routes
api.use('/*', apiKeyAuth);

// Purge public page cache after any successful mutation
api.use('/*', async (c, next) => {
  await next();
  const method = c.req.method;
  if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
    const status = c.res.status;
    if (status >= 200 && status < 400) {
      const url = new URL(c.req.url);
      const baseUrl = c.env.BASE_URL || `${url.protocol}//${url.host}`;
      c.executionCtx.waitUntil(purgePublicCache(baseUrl));
    }
  }
});

// ─── Entries ───────────────────────────────────────────────

api.post('/entries', async (c) => {
  try {
    const body = await c.req.json<{
      title?: string;
      content?: string;
      category?: Category;
      section_name?: string;
      source?: string;
      source_metadata?: string;
    }>();

    if (!body.title) {
      return c.json({ error: 'title is required' }, 400);
    }

    let sectionId: number | null = null;
    if (body.section_name?.trim()) {
      const section = await getOrCreateSection(c.env.DB, body.section_name.trim());
      sectionId = section.id;
    }

    const entry = await createEntry(c.env.DB, {
      title: body.title,
      content: body.content,
      category: body.category,
      section_id: sectionId,
      source: body.source,
      source_metadata: body.source_metadata,
    });

    // Check if AI processing is enabled and enqueue if so
    const aiEnabled = await getSetting(c.env.DB, 'ai_enabled');
    if (aiEnabled === 'true' && entry.content) {
      await c.env.DB.prepare(
        'UPDATE entries SET raw_content = ?, ai_status = ? WHERE id = ?',
      ).bind(entry.content, 'pending', entry.id).run();

      await enqueueAISummarization(c.env.CHANGELOG_QUEUE, entry.id, entry.content);
    }

    return c.json(entry, 201);
  } catch (err) {
    return c.json({ error: 'Failed to create entry' }, 500);
  }
});

api.get('/entries', async (c) => {
  try {
    const status = c.req.query('status') as EntryStatus | undefined;
    const category = c.req.query('category') as Category | undefined;
    const entries = await listEntries(c.env.DB, { status, category });
    return c.json(entries);
  } catch (err) {
    return c.json({ error: 'Failed to list entries' }, 500);
  }
});

api.get('/entries/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10);
    if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

    const entry = await getEntry(c.env.DB, id);
    if (!entry) return c.json({ error: 'Entry not found' }, 404);

    return c.json(entry);
  } catch (err) {
    return c.json({ error: 'Failed to get entry' }, 500);
  }
});

api.put('/entries/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10);
    if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

    const body = await c.req.json();
    const entry = await updateEntry(c.env.DB, id, body);
    if (!entry) return c.json({ error: 'Entry not found' }, 404);

    return c.json(entry);
  } catch (err) {
    return c.json({ error: 'Failed to update entry' }, 500);
  }
});

api.delete('/entries/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10);
    if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

    const deleted = await deleteEntry(c.env.DB, id);
    if (!deleted) return c.json({ error: 'Entry not found' }, 404);

    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: 'Failed to delete entry' }, 500);
  }
});

api.post('/entries/:id/publish', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10);
    if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

    const entry = await publishEntry(c.env.DB, id);
    if (!entry) return c.json({ error: 'Entry not found' }, 404);

    return c.json(entry);
  } catch (err) {
    return c.json({ error: 'Failed to publish entry' }, 500);
  }
});

// ─── Sections ─────────────────────────────────────────────

api.get('/sections', async (c) => {
  try {
    const sections = await listSections(c.env.DB);
    return c.json(sections);
  } catch (err) {
    return c.json({ error: 'Failed to list sections' }, 500);
  }
});

// ─── Releases ──────────────────────────────────────────────

api.post('/releases', async (c) => {
  try {
    const body = await c.req.json<{
      version?: string;
      title?: string;
      summary?: string;
    }>();

    if (!body.version) {
      return c.json({ error: 'version is required' }, 400);
    }

    const release = await createRelease(c.env.DB, {
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
    const status = c.req.query('status') as ReleaseStatus | undefined;
    const releases = await listReleases(c.env.DB, { status });
    return c.json(releases);
  } catch (err) {
    return c.json({ error: 'Failed to list releases' }, 500);
  }
});

api.get('/releases/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10);
    if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

    const release = await getRelease(c.env.DB, id);
    if (!release) return c.json({ error: 'Release not found' }, 404);

    return c.json(release);
  } catch (err) {
    return c.json({ error: 'Failed to get release' }, 500);
  }
});

api.put('/releases/:id', async (c) => {
  try {
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
    const release = await updateRelease(c.env.DB, id, data, entryIds);
    if (!release) return c.json({ error: 'Release not found' }, 404);

    return c.json(release);
  } catch (err) {
    return c.json({ error: 'Failed to update release' }, 500);
  }
});

api.delete('/releases/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10);
    if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

    const deleted = await deleteRelease(c.env.DB, id);
    if (!deleted) return c.json({ error: 'Release not found' }, 404);

    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: 'Failed to delete release' }, 500);
  }
});

api.post('/releases/:id/publish', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10);
    if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

    const release = await publishRelease(c.env.DB, id);
    if (!release) return c.json({ error: 'Release not found' }, 404);

    return c.json(release);
  } catch (err) {
    return c.json({ error: 'Failed to publish release' }, 500);
  }
});

// ─── Settings ──────────────────────────────────────────────

api.get('/settings', async (c) => {
  try {
    const settings = await getAllSettings(c.env.DB);
    return c.json(settings);
  } catch (err) {
    return c.json({ error: 'Failed to get settings' }, 500);
  }
});

api.put('/settings', async (c) => {
  try {
    const body = await c.req.json<Record<string, string>>();

    for (const [key, value] of Object.entries(body)) {
      await setSetting(c.env.DB, key, value);
    }

    const settings = await getAllSettings(c.env.DB);
    return c.json(settings);
  } catch (err) {
    return c.json({ error: 'Failed to update settings' }, 500);
  }
});

// ─── API Keys ──────────────────────────────────────────────

api.post('/keys', async (c) => {
  try {
    const body = await c.req.json<{ name?: string }>();

    if (!body.name) {
      return c.json({ error: 'name is required' }, 400);
    }

    const apiKey = await createApiKey(c.env.DB, body.name);
    return c.json(apiKey, 201);
  } catch (err) {
    return c.json({ error: 'Failed to create API key' }, 500);
  }
});

api.get('/keys', async (c) => {
  try {
    const keys = await listApiKeys(c.env.DB);
    return c.json(keys);
  } catch (err) {
    return c.json({ error: 'Failed to list API keys' }, 500);
  }
});

api.delete('/keys/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10);
    if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

    const deleted = await deleteApiKey(c.env.DB, id);
    if (!deleted) return c.json({ error: 'API key not found' }, 404);

    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: 'Failed to delete API key' }, 500);
  }
});

// ─── Webhook (generic ingest) ──────────────────────────────

api.post('/webhook', async (c) => {
  try {
    const body = await c.req.json<{
      entries?: Array<{
        title: string;
        content?: string;
        category?: Category;
        section_name?: string;
      }>;
    }>();

    if (!body.entries || !Array.isArray(body.entries)) {
      return c.json({ error: 'entries array is required' }, 400);
    }

    // Check AI setting once for all entries in the batch
    const aiEnabled = await getSetting(c.env.DB, 'ai_enabled');

    const created = [];
    for (const item of body.entries) {
      if (!item.title) {
        return c.json({ error: 'Each entry must have a title' }, 400);
      }

      let sectionId: number | null = null;
      if (item.section_name?.trim()) {
        const section = await getOrCreateSection(c.env.DB, item.section_name.trim());
        sectionId = section.id;
      }

      const entry = await createEntry(c.env.DB, {
        title: item.title,
        content: item.content,
        category: item.category,
        section_id: sectionId,
        source: 'api',
      });

      // Enqueue for AI processing if enabled
      if (aiEnabled === 'true' && entry.content) {
        await c.env.DB.prepare(
          'UPDATE entries SET raw_content = ?, ai_status = ? WHERE id = ?',
        ).bind(entry.content, 'pending', entry.id).run();

        await enqueueAISummarization(c.env.CHANGELOG_QUEUE, entry.id, entry.content);
      }

      created.push(entry);
    }

    return c.json({ entries: created }, 201);
  } catch (err) {
    return c.json({ error: 'Failed to process webhook' }, 500);
  }
});

export default api;
