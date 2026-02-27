import { Hono } from 'hono';
import type { Bindings } from '../bindings';
import { adminAuth } from '../middleware/auth';
import { setFlash, getFlash } from '../middleware/flash';
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
import { createApiKey, listApiKeys, deleteApiKey } from '../services/api-keys';
import { enqueueAISummarization, extractAIText } from '../services/ai';
import { resolveModelId } from '../services/models';
import { purgePublicCache, purgeImageCache } from '../services/cache';
import { uploadContentImage, uploadBrandImage, deleteImage } from '../services/images';
import type { Category, EntryStatus, ReleaseStatus } from '../db/schema';

import { AdminLayout } from '../views/layouts/admin-layout';
import { AdminLogin } from '../views/pages/admin-login';
import { Dashboard } from '../views/pages/dashboard';
import { EntriesList } from '../views/pages/entries-list';
import { EntryEdit } from '../views/pages/entry-edit';
import { ReleasesList } from '../views/pages/releases-list';
import { ReleaseEdit } from '../views/pages/release-edit';
import { SettingsPage } from '../views/pages/settings-page';
import { CustomisePage } from '../views/pages/customise-page';

const admin = new Hono<{
  Bindings: Bindings;
  Variables: { githubUser: string };
}>();

// Apply admin auth middleware to all admin routes
// The middleware itself excludes /admin/login
admin.use('/*', adminAuth);

// Purge public page cache after any successful mutation
admin.use('/*', async (c, next) => {
  await next();
  if (c.req.method === 'POST') {
    const status = c.res.status;
    if ((status >= 200 && status < 400) || status === 302) {
      const url = new URL(c.req.url);
      const baseUrl = c.env.BASE_URL || `${url.protocol}//${url.host}`;
      c.executionCtx.waitUntil(purgePublicCache(baseUrl));
    }
  }
});

// ─── Login ───────────────────────────────────────────────

admin.get('/login', (c) => {
  const error = c.req.query('error') || undefined;
  const repo = c.req.query('repo') || c.env.GITHUB_ALLOWED_REPO;
  return c.html(<AdminLogin error={error} repo={repo} />);
});

// ─── Dashboard ───────────────────────────────────────────

admin.get('/', async (c) => {
  const flash = getFlash(c);
  const allEntries = await listEntries(c.env.DB);
  const publishedEntries = await listEntries(c.env.DB, { status: 'published' as EntryStatus });
  const draftEntries = await listEntries(c.env.DB, { status: 'draft' as EntryStatus });
  const recentEntries = allEntries.slice(0, 10);

  return c.html(
    <AdminLayout title="Dashboard" currentPath="/admin" flash={flash} githubUser={c.get('githubUser')}>
      <Dashboard
        totalEntries={allEntries.length}
        publishedCount={publishedEntries.length}
        draftCount={draftEntries.length}
        recentEntries={recentEntries}
      />
    </AdminLayout>,
  );
});

// ─── Entries List ────────────────────────────────────────

admin.get('/entries', async (c) => {
  const flash = getFlash(c);
  const statusFilter = c.req.query('status') || '';
  const categoryFilter = c.req.query('category') || '';

  const filters: { status?: EntryStatus; category?: Category } = {};
  if (statusFilter) filters.status = statusFilter as EntryStatus;
  if (categoryFilter) filters.category = categoryFilter as Category;

  const entries = await listEntries(c.env.DB, filters);

  return c.html(
    <AdminLayout title="Entries" currentPath="/admin/entries" flash={flash} githubUser={c.get('githubUser')}>
      <EntriesList
        entries={entries}
        statusFilter={statusFilter}
        categoryFilter={categoryFilter}
      />
    </AdminLayout>,
  );
});

// ─── New Entry Form ──────────────────────────────────────

admin.get('/entries/new', (c) => {
  const flash = getFlash(c);
  return c.html(
    <AdminLayout title="New Entry" currentPath="/admin/entries" flash={flash} githubUser={c.get('githubUser')}>
      <EntryEdit />
    </AdminLayout>,
  );
});

// ─── Create Entry ────────────────────────────────────────

admin.post('/entries', async (c) => {
  const body = await c.req.parseBody();
  const title = body['title'] as string;
  const content = (body['content'] as string) || (body['content_raw'] as string) || '';
  const version = (body['version'] as string) || undefined;
  const category = (body['category'] as Category) || 'added';
  const status = body['status'] as string;

  if (!title) {
    setFlash(c, 'error', 'Title is required.');
    return c.redirect('/admin/entries/new');
  }

  try {
    const entry = await createEntry(c.env.DB, {
      title,
      content,
      version,
      category,
    });

    // If publish was requested, publish immediately
    if (status === 'published') {
      await publishEntry(c.env.DB, entry.id);
    }

    // Check if AI processing is enabled and enqueue if so
    const aiEnabled = await getSetting(c.env.DB, 'ai_enabled');
    if (aiEnabled === 'true' && entry.content) {
      await c.env.DB.prepare(
        'UPDATE entries SET raw_content = ?, ai_status = ? WHERE id = ?',
      ).bind(entry.content, 'pending', entry.id).run();

      await enqueueAISummarization(c.env.CHANGELOG_QUEUE, entry.id, entry.content);
    }

    setFlash(c, 'success', `Entry "${title}" created successfully.`);
    return c.redirect('/admin/entries');
  } catch (err) {
    setFlash(c, 'error', 'Failed to create entry.');
    return c.redirect('/admin/entries/new');
  }
});

// ─── Edit Entry Form ─────────────────────────────────────

admin.get('/entries/:id', async (c) => {
  const flash = getFlash(c);
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    setFlash(c, 'error', 'Invalid entry ID.');
    return c.redirect('/admin/entries');
  }

  const entry = await getEntry(c.env.DB, id);
  if (!entry) {
    setFlash(c, 'error', 'Entry not found.');
    return c.redirect('/admin/entries');
  }

  return c.html(
    <AdminLayout title={`Edit: ${entry.title}`} currentPath="/admin/entries" flash={flash} githubUser={c.get('githubUser')}>
      <EntryEdit entry={entry} />
    </AdminLayout>,
  );
});

// ─── Update Entry ────────────────────────────────────────

admin.post('/entries/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    setFlash(c, 'error', 'Invalid entry ID.');
    return c.redirect('/admin/entries');
  }

  const body = await c.req.parseBody();
  const title = body['title'] as string;
  const content = (body['content'] as string) || (body['content_raw'] as string) || '';
  const version = (body['version'] as string) || null;
  const category = (body['category'] as Category) || 'added';
  const status = body['status'] as string;

  if (!title) {
    setFlash(c, 'error', 'Title is required.');
    return c.redirect(`/admin/entries/${id}`);
  }

  try {
    const updateData: Record<string, unknown> = {
      title,
      content,
      version,
      category,
    };

    if (status === 'published') {
      updateData.status = 'published';
    } else if (status === 'draft') {
      updateData.status = 'draft';
    }

    const entry = await updateEntry(c.env.DB, id, updateData);

    if (!entry) {
      setFlash(c, 'error', 'Entry not found.');
      return c.redirect('/admin/entries');
    }

    // If publish was requested and it was a draft, set published_at too
    if (status === 'published') {
      await publishEntry(c.env.DB, id);
    }

    setFlash(c, 'success', `Entry "${title}" updated successfully.`);
    return c.redirect(`/admin/entries/${id}`);
  } catch (err) {
    setFlash(c, 'error', 'Failed to update entry.');
    return c.redirect(`/admin/entries/${id}`);
  }
});

// ─── Delete Entry ────────────────────────────────────────

admin.post('/entries/:id/delete', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    setFlash(c, 'error', 'Invalid entry ID.');
    return c.redirect('/admin/entries');
  }

  try {
    const deleted = await deleteEntry(c.env.DB, id);
    if (!deleted) {
      setFlash(c, 'error', 'Entry not found.');
    } else {
      setFlash(c, 'success', 'Entry deleted successfully.');
    }
  } catch (err) {
    setFlash(c, 'error', 'Failed to delete entry.');
  }

  return c.redirect('/admin/entries');
});

// ─── Publish Entry ───────────────────────────────────────

admin.post('/entries/:id/publish', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    setFlash(c, 'error', 'Invalid entry ID.');
    return c.redirect('/admin/entries');
  }

  try {
    const entry = await publishEntry(c.env.DB, id);
    if (!entry) {
      setFlash(c, 'error', 'Entry not found.');
      return c.redirect('/admin/entries');
    }
    setFlash(c, 'success', `Entry "${entry.title}" published.`);
    return c.redirect(`/admin/entries/${id}`);
  } catch (err) {
    setFlash(c, 'error', 'Failed to publish entry.');
    return c.redirect(`/admin/entries/${id}`);
  }
});

// ─── Regenerate Entry with AI ────────────────────────────

admin.post('/entries/:id/regenerate', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    setFlash(c, 'error', 'Invalid entry ID.');
    return c.redirect('/admin/entries');
  }

  try {
    const entry = await getEntry(c.env.DB, id);
    if (!entry) {
      setFlash(c, 'error', 'Entry not found.');
      return c.redirect('/admin/entries');
    }

    // Use raw_content if available, otherwise fall back to current content
    const contentToProcess = entry.raw_content || entry.content;

    if (!contentToProcess) {
      setFlash(c, 'error', 'No content available to regenerate.');
      return c.redirect(`/admin/entries/${id}`);
    }

    // Save raw_content if not already stored
    if (!entry.raw_content) {
      await c.env.DB.prepare(
        'UPDATE entries SET raw_content = ? WHERE id = ?',
      ).bind(contentToProcess, id).run();
    }

    // Set status back to pending
    await c.env.DB.prepare(
      'UPDATE entries SET ai_status = ? WHERE id = ?',
    ).bind('pending', id).run();

    // Enqueue for AI processing
    await enqueueAISummarization(c.env.CHANGELOG_QUEUE, id, contentToProcess);

    setFlash(c, 'success', 'Entry queued for AI regeneration.');
    return c.redirect(`/admin/entries/${id}`);
  } catch (err) {
    setFlash(c, 'error', 'Failed to regenerate entry with AI.');
    return c.redirect(`/admin/entries/${id}`);
  }
});

// ─── Releases List ──────────────────────────────────────

admin.get('/releases', async (c) => {
  const flash = getFlash(c);
  const statusFilter = c.req.query('status') || '';

  const filters: { status?: ReleaseStatus } = {};
  if (statusFilter) filters.status = statusFilter as ReleaseStatus;

  const releases = await listReleases(c.env.DB, filters);

  return c.html(
    <AdminLayout title="Releases" currentPath="/admin/releases" flash={flash} githubUser={c.get('githubUser')}>
      <ReleasesList releases={releases} statusFilter={statusFilter} />
    </AdminLayout>,
  );
});

// ─── New Release Form ───────────────────────────────────

admin.get('/releases/new', async (c) => {
  const flash = getFlash(c);
  // Fetch all entries (draft and published) that could be included
  const availableEntries = await listEntries(c.env.DB);

  return c.html(
    <AdminLayout title="New Release" currentPath="/admin/releases" flash={flash} githubUser={c.get('githubUser')}>
      <ReleaseEdit availableEntries={availableEntries} />
    </AdminLayout>,
  );
});

// ─── Create Release ─────────────────────────────────────

admin.post('/releases', async (c) => {
  const body = await c.req.parseBody();
  const version = body['version'] as string;
  const title = (body['title'] as string) || '';
  const summary = (body['summary'] as string) || (body['summary_raw'] as string) || '';
  const status = body['status'] as string;

  if (!version) {
    setFlash(c, 'error', 'Version is required.');
    return c.redirect('/admin/releases/new');
  }

  try {
    const release = await createRelease(c.env.DB, {
      version,
      title,
      summary,
    });

    // Collect entry IDs from checkboxes and order field
    const entryIdsRaw = body['entry_ids'];
    const entryOrder = (body['entry_order'] as string) || '';
    let entryIds: number[] = [];

    if (entryOrder) {
      // Use the ordered list if available
      entryIds = entryOrder.split(',').map(Number).filter((n) => !isNaN(n) && n > 0);
    } else if (entryIdsRaw) {
      // Fall back to checkbox values
      const ids = Array.isArray(entryIdsRaw) ? entryIdsRaw : [entryIdsRaw];
      entryIds = ids.map(Number).filter((n) => !isNaN(n) && n > 0);
    }

    if (entryIds.length > 0) {
      await updateRelease(c.env.DB, release.id, {}, entryIds);
    }

    // If publish was requested, publish immediately
    if (status === 'published') {
      await publishRelease(c.env.DB, release.id);
    }

    setFlash(c, 'success', `Release "${version}" created successfully.`);
    return c.redirect('/admin/releases');
  } catch (err) {
    setFlash(c, 'error', 'Failed to create release.');
    return c.redirect('/admin/releases/new');
  }
});

// ─── Edit Release Form ──────────────────────────────────

admin.get('/releases/:id', async (c) => {
  const flash = getFlash(c);
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    setFlash(c, 'error', 'Invalid release ID.');
    return c.redirect('/admin/releases');
  }

  const release = await getRelease(c.env.DB, id);
  if (!release) {
    setFlash(c, 'error', 'Release not found.');
    return c.redirect('/admin/releases');
  }

  // Fetch all entries that could be included
  const availableEntries = await listEntries(c.env.DB);

  return c.html(
    <AdminLayout title={`Edit: ${release.version}`} currentPath="/admin/releases" flash={flash} githubUser={c.get('githubUser')}>
      <ReleaseEdit release={release} availableEntries={availableEntries} />
    </AdminLayout>,
  );
});

// ─── Update Release ─────────────────────────────────────

admin.post('/releases/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    setFlash(c, 'error', 'Invalid release ID.');
    return c.redirect('/admin/releases');
  }

  const body = await c.req.parseBody();
  const version = body['version'] as string;
  const title = (body['title'] as string) || '';
  const summary = (body['summary'] as string) || (body['summary_raw'] as string) || '';
  const status = body['status'] as string;

  if (!version) {
    setFlash(c, 'error', 'Version is required.');
    return c.redirect(`/admin/releases/${id}`);
  }

  try {
    // Collect entry IDs from checkboxes and order field
    const entryIdsRaw = body['entry_ids'];
    const entryOrder = (body['entry_order'] as string) || '';
    let entryIds: number[] = [];

    if (entryOrder) {
      entryIds = entryOrder.split(',').map(Number).filter((n) => !isNaN(n) && n > 0);
    } else if (entryIdsRaw) {
      const ids = Array.isArray(entryIdsRaw) ? entryIdsRaw : [entryIdsRaw];
      entryIds = ids.map(Number).filter((n) => !isNaN(n) && n > 0);
    }

    const updateData: { version: string; title: string; summary: string; status?: ReleaseStatus } = {
      version,
      title,
      summary,
    };

    if (status === 'draft') {
      updateData.status = 'draft';
    }

    const release = await updateRelease(c.env.DB, id, updateData, entryIds);

    if (!release) {
      setFlash(c, 'error', 'Release not found.');
      return c.redirect('/admin/releases');
    }

    // If publish was requested, publish the release
    if (status === 'published') {
      await publishRelease(c.env.DB, id);
    }

    setFlash(c, 'success', `Release "${version}" updated successfully.`);
    return c.redirect(`/admin/releases/${id}`);
  } catch (err) {
    setFlash(c, 'error', 'Failed to update release.');
    return c.redirect(`/admin/releases/${id}`);
  }
});

// ─── Delete Release ─────────────────────────────────────

admin.post('/releases/:id/delete', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    setFlash(c, 'error', 'Invalid release ID.');
    return c.redirect('/admin/releases');
  }

  try {
    const deleted = await deleteRelease(c.env.DB, id);
    if (!deleted) {
      setFlash(c, 'error', 'Release not found.');
    } else {
      setFlash(c, 'success', 'Release deleted successfully.');
    }
  } catch (err) {
    setFlash(c, 'error', 'Failed to delete release.');
  }

  return c.redirect('/admin/releases');
});

// ─── Publish Release ────────────────────────────────────

admin.post('/releases/:id/publish', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    setFlash(c, 'error', 'Invalid release ID.');
    return c.redirect('/admin/releases');
  }

  try {
    const release = await publishRelease(c.env.DB, id);
    if (!release) {
      setFlash(c, 'error', 'Release not found.');
      return c.redirect('/admin/releases');
    }
    setFlash(c, 'success', `Release "${release.version}" published.`);
    return c.redirect(`/admin/releases/${id}`);
  } catch (err) {
    setFlash(c, 'error', 'Failed to publish release.');
    return c.redirect(`/admin/releases/${id}`);
  }
});

// ─── Customise Page ────────────────────────────────────

admin.get('/customise', async (c) => {
  const flash = getFlash(c);
  const settings = await getAllSettings(c.env.DB);
  const url = new URL(c.req.url);
  const baseUrl = c.env.BASE_URL || `${url.protocol}//${url.host}`;

  return c.html(
    <AdminLayout title="Customise" currentPath="/admin/customise" flash={flash} githubUser={c.get('githubUser')}>
      <CustomisePage settings={settings} baseUrl={baseUrl} />
    </AdminLayout>,
  );
});

// ─── Settings Page ──────────────────────────────────────

admin.get('/settings', async (c) => {
  const flash = getFlash(c);
  const settings = await getAllSettings(c.env.DB);
  const apiKeys = await listApiKeys(c.env.DB);
  const newKey = c.req.query('newKey') || null;

  return c.html(
    <AdminLayout title="Settings" currentPath="/admin/settings" flash={flash} githubUser={c.get('githubUser')}>
      <SettingsPage settings={settings} apiKeys={apiKeys} newKey={newKey} />
    </AdminLayout>,
  );
});

// ─── Settings: General ──────────────────────────────────

admin.post('/settings/general', async (c) => {
  const body = await c.req.parseBody();
  const projectName = (body['project_name'] as string) || '';
  const projectDescription = (body['project_description'] as string) || '';

  try {
    await setSetting(c.env.DB, 'project_name', projectName);
    await setSetting(c.env.DB, 'project_description', projectDescription);
    setFlash(c, 'success', 'General settings saved successfully.');
  } catch (err) {
    setFlash(c, 'error', 'Failed to save general settings.');
  }

  return c.redirect('/admin/customise');
});

// ─── Settings: Publishing ───────────────────────────────

admin.post('/settings/publishing', async (c) => {
  const body = await c.req.parseBody();
  const autoPublish = body['auto_publish'] === 'true' ? 'true' : 'false';

  try {
    await setSetting(c.env.DB, 'auto_publish', autoPublish);
    setFlash(c, 'success', 'Publishing settings saved successfully.');
  } catch (err) {
    setFlash(c, 'error', 'Failed to save publishing settings.');
  }

  return c.redirect('/admin/settings');
});

// ─── Settings: AI ───────────────────────────────────────

admin.post('/settings/ai', async (c) => {
  const body = await c.req.parseBody();
  const aiEnabled = body['ai_enabled'] === 'true' ? 'true' : 'false';
  const aiModel = resolveModelId(body['ai_model'] as string);

  try {
    await setSetting(c.env.DB, 'ai_enabled', aiEnabled);
    await setSetting(c.env.DB, 'ai_model', aiModel);
    setFlash(c, 'success', 'AI settings saved successfully.');
  } catch (err) {
    setFlash(c, 'error', 'Failed to save AI settings.');
  }

  return c.redirect('/admin/settings');
});

// ─── Settings: AI Test ──────────────────────────────────

admin.post('/settings/ai/test', async (c) => {
  try {
    const settings = await getAllSettings(c.env.DB);
    const model = resolveModelId(settings['ai_model']);

    const response = await c.env.AI.run(model as any, {
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that writes concise changelog entries.',
        },
        {
          role: 'user',
          content: 'Write a brief example changelog entry for a bug fix related to user authentication. Keep it to 2-3 sentences.',
        },
      ],
    });

    const text = extractAIText(response) || 'No response received from AI.';
    return c.json({ success: true, result: text });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ success: false, error: `AI test failed: ${message}` }, 500);
  }
});

// ─── Image Upload (for EasyMDE) ────────────────────────

admin.post('/images/upload', async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body['file'];

    if (!file || !(file instanceof File)) {
      return c.json({ error: 'No file provided' }, 400);
    }

    const result = await uploadContentImage(c.env.IMAGES, c.env.IMAGE_STORE, file);

    if ('error' in result) {
      return c.json({ error: result.error }, 400);
    }

    return c.json({ url: result.url });
  } catch (err) {
    return c.json({ error: 'Upload failed' }, 500);
  }
});

// ─── Brand Image Upload (JSON API for drag-and-drop) ───

admin.post('/images/upload/logo', async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body['file'];

    if (!file || !(file instanceof File) || file.size === 0) {
      return c.json({ error: 'No file provided' }, 400);
    }

    const existingKey = await getSetting(c.env.DB, 'logo_image_key');
    const result = await uploadBrandImage(c.env.IMAGES, c.env.IMAGE_STORE, file, 'logo', existingKey);

    if ('error' in result) {
      return c.json({ error: result.error }, 400);
    }

    await setSetting(c.env.DB, 'logo_image_key', result.key);

    if (existingKey && existingKey !== result.key) {
      const url = new URL(c.req.url);
      const baseUrl = c.env.BASE_URL || `${url.protocol}//${url.host}`;
      c.executionCtx.waitUntil(purgeImageCache(baseUrl, existingKey));
    }

    return c.json({ url: `/images/${result.key}` });
  } catch (err) {
    return c.json({ error: 'Upload failed' }, 500);
  }
});

admin.post('/images/upload/favicon', async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body['file'];

    if (!file || !(file instanceof File) || file.size === 0) {
      return c.json({ error: 'No file provided' }, 400);
    }

    const existingKey = await getSetting(c.env.DB, 'favicon_image_key');
    const result = await uploadBrandImage(c.env.IMAGES, c.env.IMAGE_STORE, file, 'favicon', existingKey);

    if ('error' in result) {
      return c.json({ error: result.error }, 400);
    }

    await setSetting(c.env.DB, 'favicon_image_key', result.key);

    if (existingKey && existingKey !== result.key) {
      const url = new URL(c.req.url);
      const baseUrl = c.env.BASE_URL || `${url.protocol}//${url.host}`;
      c.executionCtx.waitUntil(purgeImageCache(baseUrl, existingKey));
    }

    return c.json({ url: `/images/${result.key}` });
  } catch (err) {
    return c.json({ error: 'Upload failed' }, 500);
  }
});

// ─── Settings: Logo Upload ─────────────────────────────

admin.post('/settings/logo', async (c) => {
  const body = await c.req.parseBody();
  const file = body['logo_file'];

  if (!file || !(file instanceof File) || file.size === 0) {
    setFlash(c, 'error', 'No logo file selected.');
    return c.redirect('/admin/customise');
  }

  try {
    const existingKey = await getSetting(c.env.DB, 'logo_image_key');
    const result = await uploadBrandImage(c.env.IMAGES, c.env.IMAGE_STORE, file, 'logo', existingKey);

    if ('error' in result) {
      setFlash(c, 'error', result.error);
      return c.redirect('/admin/customise');
    }

    await setSetting(c.env.DB, 'logo_image_key', result.key);

    if (existingKey && existingKey !== result.key) {
      const url = new URL(c.req.url);
      const baseUrl = c.env.BASE_URL || `${url.protocol}//${url.host}`;
      c.executionCtx.waitUntil(purgeImageCache(baseUrl, existingKey));
    }

    setFlash(c, 'success', 'Logo uploaded successfully.');
  } catch (err) {
    setFlash(c, 'error', 'Failed to upload logo.');
  }
  return c.redirect('/admin/customise');
});

// ─── Settings: Logo Remove ─────────────────────────────

admin.post('/settings/logo/remove', async (c) => {
  try {
    const existingKey = await getSetting(c.env.DB, 'logo_image_key');
    if (existingKey) {
      await deleteImage(c.env.IMAGE_STORE, existingKey);
      await setSetting(c.env.DB, 'logo_image_key', '');
      const url = new URL(c.req.url);
      const baseUrl = c.env.BASE_URL || `${url.protocol}//${url.host}`;
      c.executionCtx.waitUntil(purgeImageCache(baseUrl, existingKey));
    }
    setFlash(c, 'success', 'Logo removed.');
  } catch (err) {
    setFlash(c, 'error', 'Failed to remove logo.');
  }
  return c.redirect('/admin/customise');
});

// ─── Settings: Favicon Upload ──────────────────────────

admin.post('/settings/favicon', async (c) => {
  const body = await c.req.parseBody();
  const file = body['favicon_file'];

  if (!file || !(file instanceof File) || file.size === 0) {
    setFlash(c, 'error', 'No favicon file selected.');
    return c.redirect('/admin/customise');
  }

  try {
    const existingKey = await getSetting(c.env.DB, 'favicon_image_key');
    const result = await uploadBrandImage(c.env.IMAGES, c.env.IMAGE_STORE, file, 'favicon', existingKey);

    if ('error' in result) {
      setFlash(c, 'error', result.error);
      return c.redirect('/admin/customise');
    }

    await setSetting(c.env.DB, 'favicon_image_key', result.key);

    if (existingKey && existingKey !== result.key) {
      const url = new URL(c.req.url);
      const baseUrl = c.env.BASE_URL || `${url.protocol}//${url.host}`;
      c.executionCtx.waitUntil(purgeImageCache(baseUrl, existingKey));
    }

    setFlash(c, 'success', 'Favicon uploaded successfully.');
  } catch (err) {
    setFlash(c, 'error', 'Failed to upload favicon.');
  }
  return c.redirect('/admin/customise');
});

// ─── Settings: Favicon Remove ──────────────────────────

admin.post('/settings/favicon/remove', async (c) => {
  try {
    const existingKey = await getSetting(c.env.DB, 'favicon_image_key');
    if (existingKey) {
      await deleteImage(c.env.IMAGE_STORE, existingKey);
      await setSetting(c.env.DB, 'favicon_image_key', '');
      const url = new URL(c.req.url);
      const baseUrl = c.env.BASE_URL || `${url.protocol}//${url.host}`;
      c.executionCtx.waitUntil(purgeImageCache(baseUrl, existingKey));
    }
    setFlash(c, 'success', 'Favicon removed.');
  } catch (err) {
    setFlash(c, 'error', 'Failed to remove favicon.');
  }
  return c.redirect('/admin/customise');
});

// ─── Settings: Create API Key ───────────────────────────

admin.post('/settings/keys', async (c) => {
  const body = await c.req.parseBody();
  const name = (body['name'] as string) || '';

  if (!name.trim()) {
    setFlash(c, 'error', 'API key name is required.');
    return c.redirect('/admin/settings');
  }

  try {
    const result = await createApiKey(c.env.DB, name.trim());
    setFlash(c, 'success', `API key "${name}" created successfully.`);
    return c.redirect(`/admin/settings?newKey=${encodeURIComponent(result.key)}`);
  } catch (err) {
    setFlash(c, 'error', 'Failed to create API key.');
    return c.redirect('/admin/settings');
  }
});

// ─── Settings: Delete API Key ───────────────────────────

admin.post('/settings/keys/:id/delete', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    setFlash(c, 'error', 'Invalid API key ID.');
    return c.redirect('/admin/settings');
  }

  try {
    const deleted = await deleteApiKey(c.env.DB, id);
    if (!deleted) {
      setFlash(c, 'error', 'API key not found.');
    } else {
      setFlash(c, 'success', 'API key deleted successfully.');
    }
  } catch (err) {
    setFlash(c, 'error', 'Failed to delete API key.');
  }

  return c.redirect('/admin/settings');
});

export default admin;
