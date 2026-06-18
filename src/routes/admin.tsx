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
  inferCategory,
} from '../services/entries';
import {
  listReleases,
  getRelease,
  createRelease,
  updateRelease,
  deleteRelease,
  publishRelease,
  getReleaseVersionsForEntry,
} from '../services/releases';
import { getAllSettings, getSetting, setSetting, deleteSetting } from '../services/settings';
import { createApiKey, listApiKeys, deleteApiKey } from '../services/api-keys';
import { enqueueAISummarization, extractAIText } from '../services/ai';
import { resolveModelId } from '../services/models';
import { purgePublicCache, purgeImageCache, purgeReleasePages } from '../services/cache';
import { uploadContentImage, uploadBrandImage, deleteImage } from '../services/images';
import { listSections, getOrCreateSection } from '../services/sections';
import { zonedDatetimeLocalToUTC, normalizeTimezone } from '../services/datetime';
import {
  getAppConfig,
  getSourceToken,
  setSourceToken,
  clearSourceToken,
} from '../services/github-app';
import {
  listRepoCommits,
  GitHubApiError,
  type CommitInfo,
  type ListCommitsOptions,
} from '../services/github-commits';
import { CATEGORIES } from '../db/schema';
import type { Category, EntryStatus, ReleaseStatus } from '../db/schema';

import { fetchChangelogData } from './public';
import { AdminLayout } from '../views/layouts/admin-layout';
import { AdminLogin } from '../views/pages/admin-login';
import { Dashboard } from '../views/pages/dashboard';
import { EntriesList } from '../views/pages/entries-list';
import { EntryEdit } from '../views/pages/entry-edit';
import { ReleasesList } from '../views/pages/releases-list';
import { ReleaseEdit } from '../views/pages/release-edit';
import { SettingsPage } from '../views/pages/settings-page';
import { CustomisePage } from '../views/pages/customise-page';
import { GeneratePage } from '../views/pages/generate-page';
import onboarding from './onboarding';

// Logo, favicon and brand-colour are global branding: they render on every
// public surface, including release detail pages. The blanket post-mutation
// middleware below only purges the shared pages (CACHED_PATHS), so handlers
// that change global branding must also purge every published release page.
async function purgeReleaseDetailPages(db: Bindings['DB'], baseUrl: string): Promise<void> {
  const releases = await listReleases(db, { status: 'published' });
  await purgeReleasePages(baseUrl, releases.map((r) => r.version));
}

const admin = new Hono<{
  Bindings: Bindings;
  Variables: {
    githubUser: string;
    logoUrl: string | null;
    faviconUrl: string | null;
  };
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

// ─── Onboarding ─────────────────────────────────────────

admin.route('/onboarding', onboarding);

// ─── Login ───────────────────────────────────────────────

admin.get('/login', async (c) => {
  const error = c.req.query('error') || undefined;
  const cfg = await getAppConfig(c.env.DB);
  const repo = c.req.query('repo') || cfg?.allowed_repo || undefined;
  return c.html(<AdminLogin error={error} repo={repo} />);
});

// ─── Dashboard ───────────────────────────────────────────

admin.get('/', async (c) => {
  // Redirect to onboarding if not completed
  const onboardingCompleted = await getSetting(c.env.DB, 'onboarding_completed');
  if (onboardingCompleted !== 'true') {
    // Auto-complete for existing installations that already have a project name
    const projectName = await getSetting(c.env.DB, 'project_name');
    if (projectName) {
      await setSetting(c.env.DB, 'onboarding_completed', 'true');
    } else {
      return c.redirect('/admin/onboarding');
    }
  }

  const flash = getFlash(c);
  const allEntries = await listEntries(c.env.DB);
  const publishedEntries = await listEntries(c.env.DB, { status: 'published' as EntryStatus });
  const draftEntries = await listEntries(c.env.DB, { status: 'draft' as EntryStatus });
  const recentEntries = allEntries.slice(0, 10);
  const timezone = normalizeTimezone(await getSetting(c.env.DB, 'timezone'));

  return c.html(
    <AdminLayout
      title="Dashboard"
      currentPath="/admin"
      flash={flash}
      githubUser={c.get('githubUser')} logoUrl={c.get('logoUrl')} faviconUrl={c.get('faviconUrl')}
    >
      <Dashboard
        totalEntries={allEntries.length}
        publishedCount={publishedEntries.length}
        draftCount={draftEntries.length}
        recentEntries={recentEntries}
        timezone={timezone}
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
  const timezone = normalizeTimezone(await getSetting(c.env.DB, 'timezone'));

  return c.html(
    <AdminLayout title="Entries" currentPath="/admin/entries" flash={flash} githubUser={c.get('githubUser')} logoUrl={c.get('logoUrl')} faviconUrl={c.get('faviconUrl')}>
      <EntriesList
        entries={entries}
        statusFilter={statusFilter}
        categoryFilter={categoryFilter}
        timezone={timezone}
      />
    </AdminLayout>,
  );
});

// ─── New Entry Form ──────────────────────────────────────

admin.get('/entries/new', async (c) => {
  const flash = getFlash(c);
  const sections = await listSections(c.env.DB);
  const aiEnabled = (await getSetting(c.env.DB, 'ai_enabled')) === 'true';
  const timezone = normalizeTimezone(await getSetting(c.env.DB, 'timezone'));
  return c.html(
    <AdminLayout title="New Entry" currentPath="/admin/entries" flash={flash} githubUser={c.get('githubUser')} logoUrl={c.get('logoUrl')} faviconUrl={c.get('faviconUrl')}>
      <EntryEdit sections={sections} aiEnabled={aiEnabled} timezone={timezone} />
    </AdminLayout>,
  );
});

// ─── Create Entry ────────────────────────────────────────

admin.post('/entries', async (c) => {
  const body = await c.req.parseBody();
  const title = body['title'] as string;
  const content = (body['content'] as string) || (body['content_raw'] as string) || '';
  const sectionName = ((body['section_name'] as string) || '').trim();
  // Empty category means "Auto" — let createEntry infer one (and AI override it
  // later when enabled) rather than forcing a default.
  const category = (((body['category'] as string) || '').trim() || undefined) as
    | Category
    | undefined;
  const status = body['status'] as string;
  const entryDateRaw = (body['entry_date'] as string) || '';

  if (!title) {
    setFlash(c, 'error', 'Title is required.');
    return c.redirect('/admin/entries/new');
  }

  try {
    let sectionId: number | null = null;
    if (sectionName) {
      const section = await getOrCreateSection(c.env.DB, sectionName);
      sectionId = section.id;
    }

    // The date field is entered in the configured timezone; store as UTC.
    const timezone = normalizeTimezone(await getSetting(c.env.DB, 'timezone'));
    const entryDate = entryDateRaw ? zonedDatetimeLocalToUTC(entryDateRaw, timezone) ?? undefined : undefined;

    const entry = await createEntry(c.env.DB, {
      title,
      content,
      category,
      section_id: sectionId,
      entry_date: entryDate,
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

  const sections = await listSections(c.env.DB);
  const aiEnabled = (await getSetting(c.env.DB, 'ai_enabled')) === 'true';
  const timezone = normalizeTimezone(await getSetting(c.env.DB, 'timezone'));

  return c.html(
    <AdminLayout title={`Edit: ${entry.title}`} currentPath="/admin/entries" flash={flash} githubUser={c.get('githubUser')} logoUrl={c.get('logoUrl')} faviconUrl={c.get('faviconUrl')}>
      <EntryEdit entry={entry} sections={sections} aiEnabled={aiEnabled} timezone={timezone} />
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
  const sectionName = ((body['section_name'] as string) || '').trim();
  // Empty category means "Auto" — leave the existing category untouched rather
  // than overwriting it with a blanket default.
  const category = ((body['category'] as string) || '').trim();
  const status = body['status'] as string;
  const entryDateRaw = (body['entry_date'] as string) || '';

  if (!title) {
    setFlash(c, 'error', 'Title is required.');
    return c.redirect(`/admin/entries/${id}`);
  }

  try {
    let sectionId: number | null = null;
    if (sectionName) {
      const section = await getOrCreateSection(c.env.DB, sectionName);
      sectionId = section.id;
    }

    const updateData: Record<string, unknown> = {
      title,
      content,
      section_id: sectionId,
    };
    if (category) {
      updateData.category = category as Category;
    }
    if (entryDateRaw) {
      // Entered in the configured timezone; store as UTC.
      const timezone = normalizeTimezone(await getSetting(c.env.DB, 'timezone'));
      const entryDate = zonedDatetimeLocalToUTC(entryDateRaw, timezone);
      if (entryDate) updateData.entry_date = entryDate;
    }

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

    const versions = await getReleaseVersionsForEntry(c.env.DB, id);
    if (versions.length > 0) {
      const url = new URL(c.req.url);
      const baseUrl = c.env.BASE_URL || `${url.protocol}//${url.host}`;
      c.executionCtx.waitUntil(purgeReleasePages(baseUrl, versions));
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
    const versions = await getReleaseVersionsForEntry(c.env.DB, id);
    const deleted = await deleteEntry(c.env.DB, id);
    if (!deleted) {
      setFlash(c, 'error', 'Entry not found.');
    } else {
      if (versions.length > 0) {
        const url = new URL(c.req.url);
        const baseUrl = c.env.BASE_URL || `${url.protocol}//${url.host}`;
        c.executionCtx.waitUntil(purgeReleasePages(baseUrl, versions));
      }
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
    const versions = await getReleaseVersionsForEntry(c.env.DB, id);
    if (versions.length > 0) {
      const url = new URL(c.req.url);
      const baseUrl = c.env.BASE_URL || `${url.protocol}//${url.host}`;
      c.executionCtx.waitUntil(purgeReleasePages(baseUrl, versions));
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

// ─── Generate from commits ──────────────────────────────

admin.get('/generate', async (c) => {
  const flash = getFlash(c);
  const cfg = await getAppConfig(c.env.DB);
  if (!cfg || !cfg.installation_id || !cfg.allowed_repo) {
    return c.redirect('/setup');
  }

  const sourceRepo = await getSetting(c.env.DB, 'source_repo');
  const githubPat = await getSourceToken(cfg);
  const aiEnabled = (await getSetting(c.env.DB, 'ai_enabled')) === 'true';

  const mode = c.req.query('mode') === 'range' ? 'range' : 'count';
  const countParam = parseInt(c.req.query('count') || '', 10);
  const count = !isNaN(countParam) && countParam > 0 ? Math.min(countParam, 200) : 20;
  const since = c.req.query('since') || '';
  const until = c.req.query('until') || '';
  const excludeMerges = c.req.query('exclude_merges') === 'true';
  const hasQuery = !!c.req.query('mode');

  let commits: CommitInfo[] | undefined;
  let fetched = false;
  let error: string | undefined;

  if (hasQuery && sourceRepo && !githubPat) {
    error =
      'Add a GitHub personal access token in Settings to read commits from your source repository.';
  } else if (hasQuery && sourceRepo && githubPat) {
    try {
      const opts: ListCommitsOptions = {};
      if (mode === 'range') {
        if (since) opts.since = `${since}T00:00:00Z`;
        if (until) opts.until = `${until}T23:59:59Z`;
      } else {
        opts.count = count;
      }
      commits = await listRepoCommits(githubPat, sourceRepo, opts);
      if (excludeMerges) {
        commits = commits.filter((commit) => !commit.isMerge);
      }
      fetched = true;
    } catch (err) {
      fetched = true;
      commits = [];
      if (err instanceof GitHubApiError && (err.status === 403 || err.status === 401)) {
        error = `Herald can't read ${sourceRepo}. Check that your GitHub token is valid and has read access to this repository.`;
      } else if (err instanceof GitHubApiError && err.status === 404) {
        error = `Repository "${sourceRepo}" wasn't found, or your GitHub token doesn't have access to it.`;
      } else {
        error = 'Failed to fetch commits from GitHub. Please try again.';
      }
    }
  }

  return c.html(
    <AdminLayout
      title="Generate from commits"
      currentPath="/admin/generate"
      flash={flash}
      githubUser={c.get('githubUser')} logoUrl={c.get('logoUrl')} faviconUrl={c.get('faviconUrl')}
    >
      <GeneratePage
        sourceRepo={sourceRepo}
        aiEnabled={aiEnabled}
        commits={commits}
        fetched={fetched}
        mode={mode}
        count={count}
        since={since}
        until={until}
        excludeMerges={excludeMerges}
        error={error}
      />
    </AdminLayout>,
  );
});

admin.post('/generate', async (c) => {
  const body = await c.req.parseBody({ all: true });
  const raw = body['selected'];
  const shas = Array.isArray(raw)
    ? raw.map(String)
    : raw
      ? [String(raw)]
      : [];

  if (shas.length === 0) {
    setFlash(c, 'error', 'Select at least one commit to generate from.');
    return c.redirect('/admin/generate');
  }

  const aiEnabled = (await getSetting(c.env.DB, 'ai_enabled')) === 'true';
  const sourceRepo = (await getSetting(c.env.DB, 'source_repo')) || '';

  let created = 0;
  for (const sha of shas) {
    const title =
      ((body[`title_${sha}`] as string) || '').trim() || `Commit ${sha.slice(0, 7)}`;
    const message = ((body[`message_${sha}`] as string) || '').trim() || title;
    const url = (body[`url_${sha}`] as string) || '';
    const date = ((body[`date_${sha}`] as string) || '').trim();
    const chosenCategory = body[`category_${sha}`] as string | undefined;
    const category: Category = CATEGORIES.includes(chosenCategory as Category)
      ? (chosenCategory as Category)
      : inferCategory(title);

    try {
      const entry = await createEntry(c.env.DB, {
        title,
        content: message,
        category,
        source: 'github',
        source_metadata: JSON.stringify({ sha, url, repo: sourceRepo }),
        // Preserve the commit's own date so entries keep their real order and
        // show when the work actually happened (not when they were imported).
        // Also set entry_date so it survives the publish-time COALESCE default.
        created_at: date || undefined,
        entry_date: date || undefined,
      });

      // Mirror the manual-create flow: queue for AI cleanup when enabled.
      if (aiEnabled && message) {
        await c.env.DB.prepare(
          'UPDATE entries SET raw_content = ?, ai_status = ? WHERE id = ?',
        ).bind(message, 'pending', entry.id).run();
        await enqueueAISummarization(c.env.CHANGELOG_QUEUE, entry.id, message);
      }
      created++;
    } catch (err) {
      // Skip the failed commit and continue with the rest.
    }
  }

  if (created === 0) {
    setFlash(c, 'error', 'Failed to create entries from the selected commits.');
    return c.redirect('/admin/generate');
  }

  const noun = created === 1 ? 'entry' : 'entries';
  setFlash(
    c,
    'success',
    aiEnabled
      ? `Created ${created} draft ${noun} — AI is polishing them now.`
      : `Created ${created} draft ${noun}.`,
  );
  return c.redirect('/admin/entries');
});

// ─── Releases List ──────────────────────────────────────

admin.get('/releases', async (c) => {
  const flash = getFlash(c);
  const statusFilter = c.req.query('status') || '';

  const filters: { status?: ReleaseStatus } = {};
  if (statusFilter) filters.status = statusFilter as ReleaseStatus;

  const releases = await listReleases(c.env.DB, filters);
  const timezone = normalizeTimezone(await getSetting(c.env.DB, 'timezone'));

  return c.html(
    <AdminLayout title="Releases" currentPath="/admin/releases" flash={flash} githubUser={c.get('githubUser')} logoUrl={c.get('logoUrl')} faviconUrl={c.get('faviconUrl')}>
      <ReleasesList releases={releases} statusFilter={statusFilter} timezone={timezone} />
    </AdminLayout>,
  );
});

// ─── New Release Form ───────────────────────────────────

admin.get('/releases/new', async (c) => {
  const flash = getFlash(c);
  // Fetch all entries (draft and published) that could be included
  const availableEntries = await listEntries(c.env.DB);
  const timezone = normalizeTimezone(await getSetting(c.env.DB, 'timezone'));

  return c.html(
    <AdminLayout title="New Release" currentPath="/admin/releases" flash={flash} githubUser={c.get('githubUser')} logoUrl={c.get('logoUrl')} faviconUrl={c.get('faviconUrl')}>
      <ReleaseEdit availableEntries={availableEntries} timezone={timezone} />
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
  const releaseDateRaw = (body['release_date'] as string) || '';

  if (!version) {
    setFlash(c, 'error', 'Version is required.');
    return c.redirect('/admin/releases/new');
  }

  try {
    const timezone = normalizeTimezone(await getSetting(c.env.DB, 'timezone'));
    const releaseDate = releaseDateRaw
      ? zonedDatetimeLocalToUTC(releaseDateRaw, timezone) ?? undefined
      : undefined;

    const release = await createRelease(c.env.DB, {
      version,
      title,
      summary,
      release_date: releaseDate,
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

    const url = new URL(c.req.url);
    const baseUrl = c.env.BASE_URL || `${url.protocol}//${url.host}`;
    c.executionCtx.waitUntil(
      purgePublicCache(baseUrl, [`/releases/${encodeURIComponent(version)}`]),
    );

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
  const timezone = normalizeTimezone(await getSetting(c.env.DB, 'timezone'));

  return c.html(
    <AdminLayout title={`Edit: ${release.version}`} currentPath="/admin/releases" flash={flash} githubUser={c.get('githubUser')} logoUrl={c.get('logoUrl')} faviconUrl={c.get('faviconUrl')}>
      <ReleaseEdit release={release} availableEntries={availableEntries} timezone={timezone} />
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
  const releaseDateRaw = (body['release_date'] as string) || '';

  if (!version) {
    setFlash(c, 'error', 'Version is required.');
    return c.redirect(`/admin/releases/${id}`);
  }

  try {
    const previous = await getRelease(c.env.DB, id);

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

    const updateData: {
      version: string;
      title: string;
      summary: string;
      status?: ReleaseStatus;
      release_date?: string;
    } = {
      version,
      title,
      summary,
    };

    if (status === 'draft') {
      updateData.status = 'draft';
    }

    if (releaseDateRaw) {
      const timezone = normalizeTimezone(await getSetting(c.env.DB, 'timezone'));
      const releaseDate = zonedDatetimeLocalToUTC(releaseDateRaw, timezone);
      if (releaseDate) updateData.release_date = releaseDate;
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

    const url = new URL(c.req.url);
    const baseUrl = c.env.BASE_URL || `${url.protocol}//${url.host}`;
    const versionsToPurge = new Set<string>([version]);
    if (previous && previous.version !== version) {
      versionsToPurge.add(previous.version);
    }
    c.executionCtx.waitUntil(
      purgePublicCache(
        baseUrl,
        [...versionsToPurge].map((v) => `/releases/${encodeURIComponent(v)}`),
      ),
    );

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
    const existing = await getRelease(c.env.DB, id);
    const deleted = await deleteRelease(c.env.DB, id);
    if (!deleted) {
      setFlash(c, 'error', 'Release not found.');
    } else {
      if (existing) {
        const url = new URL(c.req.url);
        const baseUrl = c.env.BASE_URL || `${url.protocol}//${url.host}`;
        c.executionCtx.waitUntil(
          purgePublicCache(baseUrl, [`/releases/${encodeURIComponent(existing.version)}`]),
        );
      }
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
    const url = new URL(c.req.url);
    const baseUrl = c.env.BASE_URL || `${url.protocol}//${url.host}`;
    c.executionCtx.waitUntil(
      purgePublicCache(baseUrl, [`/releases/${encodeURIComponent(release.version)}`]),
    );
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

  // Fetch changelog data for live preview
  const changelogData = await fetchChangelogData(c.env.DB);
  const hasContent = changelogData.releases.length > 0 || changelogData.standaloneEntries.length > 0;

  // Example data if no published content exists
  const exampleReleases = hasContent ? changelogData.releases : [{
    id: 0,
    version: 'v1.0.0',
    title: 'Initial Release',
    summary: 'The first release of our product with core functionality.',
    status: 'published' as const,
    published_at: new Date().toISOString(),
    release_date: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    entries: [
      { id: 1, title: 'Dark mode support', content: 'Added full dark mode with system preference detection.', category: 'added' as const, section_id: null, section_name: null, status: 'published' as const, published_at: new Date().toISOString(), entry_date: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), source: 'manual' as const, source_metadata: null, ai_status: null, raw_content: null },
      { id: 2, title: 'Login page not loading on mobile devices', content: 'Resolved an issue where the login form failed to render on iOS Safari.', category: 'fixed' as const, section_id: null, section_name: null, status: 'published' as const, published_at: new Date().toISOString(), entry_date: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), source: 'manual' as const, source_metadata: null, ai_status: null, raw_content: null },
      { id: 3, title: 'Updated dashboard layout for better navigation', content: 'Reorganised the sidebar and top nav for improved discoverability.', category: 'changed' as const, section_id: null, section_name: null, status: 'published' as const, published_at: new Date().toISOString(), entry_date: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), source: 'manual' as const, source_metadata: null, ai_status: null, raw_content: null },
    ],
  }];
  const exampleStandalone = hasContent ? changelogData.standaloneEntries : [];

  return c.html(
    <AdminLayout title="Customise" currentPath="/admin/customise" flash={flash} githubUser={c.get('githubUser')} logoUrl={c.get('logoUrl')} faviconUrl={c.get('faviconUrl')}>
      <CustomisePage
        settings={settings}
        baseUrl={baseUrl}
        previewReleases={exampleReleases}
        previewStandaloneEntries={exampleStandalone}
        previewProjectName={changelogData.projectName}
        previewProjectDescription={changelogData.projectDescription}
        previewLogoUrl={changelogData.logoUrl}
      />
    </AdminLayout>,
  );
});

// ─── Settings Page ──────────────────────────────────────

admin.get('/settings', async (c) => {
  const flash = getFlash(c);
  const settings = await getAllSettings(c.env.DB);
  const apiKeys = await listApiKeys(c.env.DB);
  const newKey = c.req.query('newKey') || null;
  const cfg = await getAppConfig(c.env.DB);

  return c.html(
    <AdminLayout
      title="Settings"
      currentPath="/admin/settings"
      flash={flash}
      githubUser={c.get('githubUser')} logoUrl={c.get('logoUrl')} faviconUrl={c.get('faviconUrl')}
    >
      <SettingsPage
        settings={settings}
        apiKeys={apiKeys}
        newKey={newKey}
        hasGithubToken={!!cfg?.source_pat}
      />
    </AdminLayout>,
  );
});

// ─── Settings: Source Repository ────────────────────────

admin.post('/settings/source-repo', async (c) => {
  const body = await c.req.parseBody();
  const sourceRepo = ((body['source_repo'] as string) || '').trim();
  const githubPat = ((body['github_pat'] as string) || '').trim();
  const clearPat = body['clear_github_pat'] === 'true';

  try {
    await setSetting(c.env.DB, 'source_repo', sourceRepo);
    // The token is encrypted at rest and never sent back to the client, so the
    // field is left blank to keep the current value; only overwrite when a new
    // one is supplied (or explicitly cleared).
    if (clearPat) {
      await clearSourceToken(c.env.DB);
    } else if (githubPat) {
      const cfg = await getAppConfig(c.env.DB);
      if (cfg) await setSourceToken(c.env.DB, cfg.session_secret, githubPat);
    }
    // Purge any token left in the settings table by earlier builds, which the
    // API would otherwise expose in plaintext.
    await deleteSetting(c.env.DB, 'github_pat');
    setFlash(
      c,
      'success',
      sourceRepo
        ? `Source repository set to ${sourceRepo}.`
        : 'Source repository cleared.',
    );
  } catch (err) {
    setFlash(c, 'error', 'Failed to save source repository.');
  }

  return c.redirect('/admin/settings');
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

// ─── Settings: Display ──────────────────────────────────

admin.post('/settings/display', async (c) => {
  const body = await c.req.parseBody();
  const entryGrouping = body['entry_grouping'] === 'section' ? 'section' : 'category';
  const timezone = normalizeTimezone(body['timezone'] as string);
  const dateGrouping = body['date_grouping'] === 'month' ? 'month' : 'day';

  try {
    await setSetting(c.env.DB, 'entry_grouping', entryGrouping);
    await setSetting(c.env.DB, 'timezone', timezone);
    await setSetting(c.env.DB, 'date_grouping', dateGrouping);

    // Timezone & grouping affect every rendered page, including release detail
    // pages which aren't covered by the post-mutation shared-page purge.
    const url = new URL(c.req.url);
    const baseUrl = c.env.BASE_URL || `${url.protocol}//${url.host}`;
    c.executionCtx.waitUntil(purgeReleaseDetailPages(c.env.DB, baseUrl));

    setFlash(c, 'success', 'Display settings saved successfully.');
  } catch (err) {
    setFlash(c, 'error', 'Failed to save display settings.');
  }

  return c.redirect('/admin/customise');
});

// ─── Settings: Theme ────────────────────────────────────

admin.post('/settings/theme', async (c) => {
  const body = await c.req.parseBody();
  const theme = body['theme'] as string;
  const validThemes = ['herald', 'opencode', 'notion'];
  const selectedTheme = validThemes.includes(theme) ? theme : 'herald';

  try {
    await setSetting(c.env.DB, 'theme', selectedTheme);

    // Release detail pages also render the theme and are cached separately
    // from the shared pages purged by the post-mutation middleware.
    const url = new URL(c.req.url);
    const baseUrl = c.env.BASE_URL || `${url.protocol}//${url.host}`;
    c.executionCtx.waitUntil(purgeReleaseDetailPages(c.env.DB, baseUrl));

    setFlash(c, 'success', 'Theme saved successfully.');
  } catch (err) {
    setFlash(c, 'error', 'Failed to save theme.');
  }

  return c.redirect('/admin/customise');
});

// ─── Settings: Primary colour ───────────────────────────

admin.post('/settings/primary-color', async (c) => {
  const body = await c.req.parseBody();
  const raw = (body['primary_color'] as string) || '';
  const color = /^#[0-9a-fA-F]{6}$/.test(raw) ? raw.toUpperCase() : '#4F46E5';

  try {
    await setSetting(c.env.DB, 'primary_color', color);

    // Release detail pages also render the brand colour and are cached
    // separately from the shared pages purged by the post-mutation middleware.
    const url = new URL(c.req.url);
    const baseUrl = c.env.BASE_URL || `${url.protocol}//${url.host}`;
    c.executionCtx.waitUntil(purgeReleaseDetailPages(c.env.DB, baseUrl));

    return c.json({ ok: true, primary_color: color });
  } catch (err) {
    return c.json({ ok: false, error: 'Failed to save primary colour.' }, 500);
  }
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
  const validPersonalities = ['neutral', 'professional', 'casual'];
  const aiPersonality = validPersonalities.includes(body['ai_personality'] as string)
    ? (body['ai_personality'] as string)
    : 'neutral';

  try {
    await setSetting(c.env.DB, 'ai_enabled', aiEnabled);
    await setSetting(c.env.DB, 'ai_model', aiModel);
    await setSetting(c.env.DB, 'ai_personality', aiPersonality);
    setFlash(c, 'success', 'AI settings saved successfully.');
  } catch (err) {
    setFlash(c, 'error', 'Failed to save AI settings.');
  }

  return c.redirect('/admin/settings');
});

// ─── Settings: AI Test ──────────────────────────────────

admin.post('/settings/ai/test', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({})) as { model?: string; personality?: string };
    const model = resolveModelId(body.model);
    const personality = body.personality || 'neutral';

    const personalityInstructions: Record<string, string> = {
      neutral: 'Write in a clear, straightforward tone.',
      professional: 'Write in a formal, polished, corporate tone. Use precise technical language.',
      casual: 'Write in a friendly, conversational tone. Keep it light and approachable.',
    };

    const systemContent = `You are a helpful assistant that writes concise changelog entries. ${personalityInstructions[personality] || personalityInstructions['neutral']}`;

    const response = await c.env.AI.run(model as any, {
      messages: [
        {
          role: 'system',
          content: systemContent,
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

    const url = new URL(c.req.url);
    const baseUrl = c.env.BASE_URL || `${url.protocol}//${url.host}`;
    c.executionCtx.waitUntil(purgeReleaseDetailPages(c.env.DB, baseUrl));

    if (existingKey && existingKey !== result.key) {
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

    const url = new URL(c.req.url);
    const baseUrl = c.env.BASE_URL || `${url.protocol}//${url.host}`;
    c.executionCtx.waitUntil(purgeReleaseDetailPages(c.env.DB, baseUrl));

    if (existingKey && existingKey !== result.key) {
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

    const url = new URL(c.req.url);
    const baseUrl = c.env.BASE_URL || `${url.protocol}//${url.host}`;
    c.executionCtx.waitUntil(purgeReleaseDetailPages(c.env.DB, baseUrl));

    if (existingKey && existingKey !== result.key) {
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
      c.executionCtx.waitUntil(purgeReleaseDetailPages(c.env.DB, baseUrl));
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

    const url = new URL(c.req.url);
    const baseUrl = c.env.BASE_URL || `${url.protocol}//${url.host}`;
    c.executionCtx.waitUntil(purgeReleaseDetailPages(c.env.DB, baseUrl));

    if (existingKey && existingKey !== result.key) {
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
      c.executionCtx.waitUntil(purgeReleaseDetailPages(c.env.DB, baseUrl));
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
