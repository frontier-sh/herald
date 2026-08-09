import { Hono } from 'hono';
import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
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
  getImportedCommitShas,
} from '../services/entries';
import {
  listReleases,
  getRelease,
  createRelease,
  updateRelease,
  deleteRelease,
  publishRelease,
  getReleaseVersionsForEntry,
  type ReleaseWithEntries,
} from '../services/releases';
import {
  getAllSettings,
  getSetting,
  setSetting,
  deleteSetting,
  getAppSetting,
  getAllAppSettings,
  setAppSetting,
  deleteAppSetting,
} from '../services/settings';
import {
  listApps,
  getApp,
  getAppBySlug,
  createApp,
  updateApp,
  setDefaultApp,
  deleteApp,
  appBasePath,
  validateSlug,
  slugify,
} from '../services/apps';
import { resolveAppById } from '../services/app-resolver';
import {
  isValidSlackWebhookUrl,
  notifyEntryPublished,
  notifyReleasePublishedWhenReady,
  sendSlackMessage,
  buildEntryMessage,
  resolveBranding,
  SLACK_WEBHOOK_SETTING,
  SLACK_ENABLED_SETTING,
} from '../services/slack';
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
import type {
  App,
  Category,
  EntryStatus,
  EntryWithSection,
  ReleaseStatus,
} from '../db/schema';

import { AdminLayout } from '../views/layouts/admin-layout';
import { AdminLogin } from '../views/pages/admin-login';
import { Dashboard } from '../views/pages/dashboard';
import { EntriesList } from '../views/pages/entries-list';
import { EntryEdit } from '../views/pages/entry-edit';
import { ReleasesList } from '../views/pages/releases-list';
import { ReleaseEdit } from '../views/pages/release-edit';
import { AppSettingsPage } from '../views/pages/settings-page';
import { InstanceSettingsPage } from '../views/pages/instance-settings-page';
import { CustomisePage } from '../views/pages/customise-page';
import { GeneratePage } from '../views/pages/generate-page';
import { AppsList } from '../views/pages/apps-list';
import { AppEdit, type AppFormValues } from '../views/pages/app-edit';
import onboarding from './onboarding';

type AdminEnv = {
  Bindings: Bindings;
  Variables: {
    githubUser: string;
    logoUrl: string | null;
    faviconUrl: string | null;
    // The app every admin page reads and writes. Chosen with the `herald_app`
    // cookie, falling back to the default app.
    currentApp: App;
    // Every app, for the sidebar switcher.
    apps: App[];
  };
};

// Cookie holding the id of the app the admin UI is acting on. Scoped to /admin
// so it never travels with public page requests.
const APP_COOKIE = 'herald_app';

const APP_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'Lax',
  path: '/admin',
  maxAge: 365 * 24 * 60 * 60,
} as const;

// Settings a brand-new app starts with. Deliberately conservative: nothing
// publishes or calls the AI until the user turns it on for that app.
const NEW_APP_SETTINGS: Record<string, string> = {
  auto_publish: 'false',
  ai_enabled: 'false',
  entry_grouping: 'category',
  timezone: 'UTC',
  date_grouping: 'day',
};

// Logo, favicon and brand-colour render on every public surface of an app,
// including its release detail pages. The blanket post-mutation middleware
// below only purges the shared pages, so handlers that change branding must
// also purge every published release page of that app.
async function purgeReleaseDetailPages(
  db: Bindings['DB'],
  baseUrl: string,
  app: App,
): Promise<void> {
  const releases = await listReleases(db, app.id, { status: 'published' });
  await purgeReleasePages(baseUrl, app, releases.map((r) => r.version));
}

/** Shared admin chrome props — sidebar branding plus the app switcher. */
function chrome(c: Context<AdminEnv>) {
  return {
    githubUser: c.get('githubUser'),
    logoUrl: c.get('logoUrl'),
    faviconUrl: c.get('faviconUrl'),
    currentApp: c.get('currentApp'),
    apps: c.get('apps'),
  };
}

function requestBaseUrl(c: Context<AdminEnv>): string {
  const url = new URL(c.req.url);
  return c.env.BASE_URL || `${url.protocol}//${url.host}`;
}

/**
 * An unticked checkbox is simply absent from the body, so presence is the
 * signal. Accepts "true" (what Herald's forms post) and the browser default
 * "on" alike.
 */
function isChecked(value: unknown): boolean {
  return typeof value === 'string' && value !== '' && value !== 'false';
}

/**
 * Re-render the app form in place after a rejected submit.
 *
 * Every other admin form redirects back to its GET route with a flash, which
 * for this form meant the user was returned to an empty one and lost what they
 * had typed. Rendering here instead keeps the submitted values in the fields;
 * the error still arrives in the usual flash banner, in its usual position, so
 * it is indistinguishable from the redirect version to look at. Status stays
 * 200 — this is the form again, not an error page.
 */
function renderAppForm(
  c: Context<AdminEnv>,
  opts: { app?: App; values: AppFormValues; error: string },
) {
  return c.html(
    <AdminLayout
      title={opts.app ? `Edit: ${opts.app.name}` : 'New App'}
      currentPath="/admin/apps"
      flash={{ type: 'error', message: opts.error }}
      {...chrome(c)}
    >
      <AppEdit app={opts.app} baseUrl={requestBaseUrl(c)} values={opts.values} />
    </AdminLayout>,
  );
}

const admin = new Hono<AdminEnv>();

// Apply admin auth middleware to all admin routes
// The middleware itself excludes /admin/login
admin.use('/*', adminAuth);

// Resolve the app the admin UI is acting on, and load its branding for the
// admin chrome. Everything downstream reads `currentApp` rather than assuming
// a single changelog.
admin.use('/*', async (c, next) => {
  if (new URL(c.req.url).pathname === '/admin/login') {
    await next();
    return;
  }

  const cookieValue = getCookie(c, APP_COOKIE);
  const cookieId = cookieValue ? parseInt(cookieValue, 10) : NaN;
  const app = await resolveAppById(c.env.DB, isNaN(cookieId) ? null : cookieId);
  if (!app) {
    // No apps at all means the database predates migration 0012.
    return c.redirect('/setup');
  }

  c.set('currentApp', app);
  c.set('apps', await listApps(c.env.DB));

  const settings = await getAllAppSettings(c.env.DB, app.id);
  const logoKey = settings['logo_image_key'] || '';
  const faviconKey = settings['favicon_image_key'] || '';
  c.set('logoUrl', logoKey ? `/images/${logoKey}` : null);
  c.set('faviconUrl', faviconKey ? `/images/${faviconKey}` : null);

  await next();
});

// Purge the current app's public page cache after any successful mutation
admin.use('/*', async (c, next) => {
  await next();
  if (c.req.method === 'POST') {
    const status = c.res.status;
    const app = c.get('currentApp');
    if (app && ((status >= 200 && status < 400) || status === 302)) {
      c.executionCtx.waitUntil(purgePublicCache(requestBaseUrl(c), app));
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
  const app = c.get('currentApp');

  // Redirect to onboarding if not completed
  const onboardingCompleted = await getSetting(c.env.DB, 'onboarding_completed');
  if (onboardingCompleted !== 'true') {
    // Auto-complete for existing installations that already have a project name
    const projectName = await getAppSetting(c.env.DB, app.id, 'project_name');
    if (projectName) {
      await setSetting(c.env.DB, 'onboarding_completed', 'true');
    } else {
      return c.redirect('/admin/onboarding');
    }
  }

  const flash = getFlash(c);
  const allEntries = await listEntries(c.env.DB, app.id);
  const publishedEntries = await listEntries(c.env.DB, app.id, {
    status: 'published' as EntryStatus,
  });
  const draftEntries = await listEntries(c.env.DB, app.id, { status: 'draft' as EntryStatus });
  const recentEntries = allEntries.slice(0, 10);
  const timezone = normalizeTimezone(await getAppSetting(c.env.DB, app.id, 'timezone'));

  return c.html(
    <AdminLayout title="Dashboard" currentPath="/admin" flash={flash} {...chrome(c)}>
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

// ─── Apps: switch the current app ───────────────────────

// Registered before /apps/:id so "switch" is never read as an app id.
admin.post('/apps/switch', async (c) => {
  const body = await c.req.parseBody();
  const id = parseInt((body['app_id'] as string) || '', 10);
  const requested = ((body['redirect_to'] as string) || '').trim();

  if (!isNaN(id)) {
    const app = await getApp(c.env.DB, id);
    if (app) {
      setCookie(c, APP_COOKIE, String(app.id), APP_COOKIE_OPTIONS);
    }
  }

  // Only ever bounce back inside the admin UI, and only to a section index —
  // a record from the previous app won't exist in the newly selected one.
  const target = /^\/admin(\/[a-z-]*)?$/.test(requested) ? requested : '/admin';
  return c.redirect(target);
});

// ─── Apps: list ─────────────────────────────────────────

admin.get('/apps', async (c) => {
  const flash = getFlash(c);
  const apps = c.get('apps');

  const counts = await c.env.DB.prepare(
    'SELECT app_id, COUNT(*) AS entry_count FROM entries GROUP BY app_id',
  ).all<{ app_id: number; entry_count: number }>();
  const entryCounts: Record<number, number> = {};
  for (const row of counts.results) {
    entryCounts[row.app_id] = row.entry_count;
  }

  return c.html(
    <AdminLayout title="Apps" currentPath="/admin/apps" flash={flash} {...chrome(c)}>
      <AppsList
        apps={apps}
        currentAppId={c.get('currentApp').id}
        entryCounts={entryCounts}
        baseUrl={requestBaseUrl(c)}
      />
    </AdminLayout>,
  );
});

// ─── Apps: new app form ─────────────────────────────────

admin.get('/apps/new', async (c) => {
  const flash = getFlash(c);
  return c.html(
    <AdminLayout title="New App" currentPath="/admin/apps" flash={flash} {...chrome(c)}>
      <AppEdit baseUrl={requestBaseUrl(c)} />
    </AdminLayout>,
  );
});

// ─── Apps: create ───────────────────────────────────────

admin.post('/apps', async (c) => {
  const body = await c.req.parseBody();
  const name = ((body['name'] as string) || '').trim();
  const description = ((body['description'] as string) || '').trim();
  const rawSlug = ((body['slug'] as string) || '').trim();
  const slug = (rawSlug || slugify(name)).toLowerCase();
  const switchToNew = isChecked(body['switch_to']);

  // Rejected submits come straight back as the same form with everything the
  // user typed still in it — never a redirect to an empty one.
  const values: AppFormValues = {
    name,
    slug: rawSlug,
    description,
    switchTo: switchToNew,
  };
  const reject = (message: string) => renderAppForm(c, { values, error: message });

  if (!name) return reject('App name is required.');

  const slugError = validateSlug(slug);
  if (slugError) return reject(slugError + '.');

  if (await getAppBySlug(c.env.DB, slug)) {
    return reject(`The URL slug "${slug}" is already taken.`);
  }

  try {
    const app = await createApp(c.env.DB, { slug, name, description });

    // Seed the app's own settings. project_name/description mirror apps.name so
    // the public page, RSS feed and Slack messages have branding from the start.
    for (const [key, value] of Object.entries(NEW_APP_SETTINGS)) {
      await setAppSetting(c.env.DB, app.id, key, value);
    }
    await setAppSetting(c.env.DB, app.id, 'project_name', name);
    await setAppSetting(c.env.DB, app.id, 'project_description', description);

    if (switchToNew) {
      setCookie(c, APP_COOKIE, String(app.id), APP_COOKIE_OPTIONS);
    }

    setFlash(c, 'success', `App "${name}" created at /${app.slug}.`);
    return c.redirect('/admin/apps');
  } catch (err) {
    // Most likely the UNIQUE constraint on apps.slug losing a race with the
    // check above; either way the form comes back filled in.
    return reject('Failed to create app. Please check the details and try again.');
  }
});

// ─── Apps: edit form ────────────────────────────────────

admin.get('/apps/:id', async (c) => {
  const flash = getFlash(c);
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    setFlash(c, 'error', 'Invalid app ID.');
    return c.redirect('/admin/apps');
  }

  const app = await getApp(c.env.DB, id);
  if (!app) {
    setFlash(c, 'error', 'App not found.');
    return c.redirect('/admin/apps');
  }

  return c.html(
    <AdminLayout title={`Edit: ${app.name}`} currentPath="/admin/apps" flash={flash} {...chrome(c)}>
      <AppEdit app={app} baseUrl={requestBaseUrl(c)} />
    </AdminLayout>,
  );
});

// ─── Apps: update ───────────────────────────────────────

admin.post('/apps/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    setFlash(c, 'error', 'Invalid app ID.');
    return c.redirect('/admin/apps');
  }

  const body = await c.req.parseBody();
  const name = ((body['name'] as string) || '').trim();
  const description = ((body['description'] as string) || '').trim();
  const rawSlug = ((body['slug'] as string) || '').trim();
  const slug = (rawSlug || slugify(name)).toLowerCase();

  const existing = await getApp(c.env.DB, id);
  if (!existing) {
    setFlash(c, 'error', 'App not found.');
    return c.redirect('/admin/apps');
  }

  // As on create: a rejected edit re-renders this app's form with the submitted
  // values, so nothing typed is lost.
  const values: AppFormValues = {
    name,
    slug: rawSlug,
    description,
    switchTo: false,
  };
  const reject = (message: string) =>
    renderAppForm(c, { app: existing, values, error: message });

  if (!name) return reject('App name is required.');

  const slugError = validateSlug(slug);
  if (slugError) return reject(slugError + '.');

  const clash = await getAppBySlug(c.env.DB, slug);
  if (clash && clash.id !== id) {
    return reject(`The URL slug "${slug}" is already taken.`);
  }

  try {
    const updated = await updateApp(c.env.DB, id, { name, slug, description });

    // apps.name is the canonical display name; the per-app settings copy is what
    // the public page and Slack read, so both are written together.
    await setAppSetting(c.env.DB, id, 'project_name', name);
    await setAppSetting(c.env.DB, id, 'project_description', description);

    // This route can edit an app other than the one the admin UI is switched to,
    // and the blanket middleware only purges that current app — so the edited
    // app is always purged explicitly here. Name and description render on its
    // public pages, so every page of it is stale, release permalinks included.
    // When the slug changed the app also moved, so both address forms are purged.
    const baseUrl = requestBaseUrl(c);
    c.executionCtx.waitUntil(purgePublicCache(baseUrl, existing));
    c.executionCtx.waitUntil(purgeReleaseDetailPages(c.env.DB, baseUrl, existing));
    if (updated && updated.slug !== existing.slug) {
      c.executionCtx.waitUntil(purgePublicCache(baseUrl, updated));
      c.executionCtx.waitUntil(purgeReleaseDetailPages(c.env.DB, baseUrl, updated));
    }

    setFlash(c, 'success', `App "${name}" updated successfully.`);
  } catch (err) {
    // Most likely the UNIQUE constraint on apps.slug losing a race with the
    // clash check above; either way the form comes back filled in.
    return reject('Failed to update app. Please check the details and try again.');
  }

  return c.redirect(`/admin/apps/${id}`);
});

// ─── Apps: make default ─────────────────────────────────

admin.post('/apps/:id/default', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    setFlash(c, 'error', 'Invalid app ID.');
    return c.redirect('/admin/apps');
  }

  try {
    const app = await getApp(c.env.DB, id);
    if (!app) {
      setFlash(c, 'error', 'App not found.');
      return c.redirect('/admin/apps');
    }

    const previousDefault = c.get('apps').find((a) => a.is_default);
    const baseUrl = requestBaseUrl(c);

    // Both apps change address: the promoted one moves to the site root and the
    // demoted one moves under its slug. Every cached page of both — including
    // release permalinks, which the blanket middleware never touches — is stored
    // under the old URL and must be dropped there as well as at the new one, so
    // each app is purged in its pre-switch form and again in its post-switch one.
    const affected = previousDefault && previousDefault.id !== app.id ? [app, previousDefault] : [app];
    const versions = new Map<number, string[]>();
    for (const a of affected) {
      const releases = await listReleases(c.env.DB, a.id, { status: 'published' });
      versions.set(a.id, releases.map((r) => r.version));
    }

    const purgeAll = async (variants: App[]) => {
      for (const variant of variants) {
        await purgePublicCache(baseUrl, variant);
        await purgeReleasePages(baseUrl, variant, versions.get(variant.id) ?? []);
      }
    };

    // Awaited, not deferred: a purge of the old paths that landed after the
    // switch could be beaten by a request re-caching them under the new routing.
    await purgeAll(affected);

    await setDefaultApp(c.env.DB, id);

    const switched = (await Promise.all(affected.map((a) => getApp(c.env.DB, a.id))))
      .filter((a): a is App => a !== null);
    c.executionCtx.waitUntil(purgeAll(switched));

    setFlash(c, 'success', `"${app.name}" is now served at the site root.`);
  } catch (err) {
    setFlash(c, 'error', 'Failed to change the default app.');
  }

  return c.redirect('/admin/apps');
});

// ─── Apps: delete ───────────────────────────────────────

admin.post('/apps/:id/delete', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    setFlash(c, 'error', 'Invalid app ID.');
    return c.redirect('/admin/apps');
  }

  try {
    const app = await getApp(c.env.DB, id);
    if (!app) {
      setFlash(c, 'error', 'App not found.');
      return c.redirect('/admin/apps');
    }

    const baseUrl = requestBaseUrl(c);
    // Collect the release URLs while the rows still exist.
    const releases = await listReleases(c.env.DB, id, { status: 'published' });

    // Throws for the default app — the site root must always resolve.
    const deleted = await deleteApp(c.env.DB, id);
    if (!deleted) {
      setFlash(c, 'error', 'App not found.');
      return c.redirect('/admin/apps');
    }

    c.executionCtx.waitUntil(purgePublicCache(baseUrl, app));
    c.executionCtx.waitUntil(
      purgeReleasePages(baseUrl, app, releases.map((r) => r.version)),
    );

    // Deleting the app you were working in drops you back to the default one.
    if (c.get('currentApp').id === id) {
      deleteCookie(c, APP_COOKIE, { path: '/admin' });
    }

    setFlash(c, 'success', `App "${app.name}" and all of its content were deleted.`);
  } catch (err) {
    setFlash(
      c,
      'error',
      err instanceof Error ? err.message + '.' : 'Failed to delete app.',
    );
  }

  return c.redirect('/admin/apps');
});

// ─── Entries List ────────────────────────────────────────

admin.get('/entries', async (c) => {
  const app = c.get('currentApp');
  const flash = getFlash(c);
  const statusFilter = c.req.query('status') || '';
  const categoryFilter = c.req.query('category') || '';

  const filters: { status?: EntryStatus; category?: Category } = {};
  if (statusFilter) filters.status = statusFilter as EntryStatus;
  if (categoryFilter) filters.category = categoryFilter as Category;

  const entries = await listEntries(c.env.DB, app.id, filters);
  const timezone = normalizeTimezone(await getAppSetting(c.env.DB, app.id, 'timezone'));

  return c.html(
    <AdminLayout title="Entries" currentPath="/admin/entries" flash={flash} {...chrome(c)}>
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
  const app = c.get('currentApp');
  const flash = getFlash(c);
  const sections = await listSections(c.env.DB, app.id);
  const aiEnabled = (await getAppSetting(c.env.DB, app.id, 'ai_enabled')) === 'true';
  const timezone = normalizeTimezone(await getAppSetting(c.env.DB, app.id, 'timezone'));
  return c.html(
    <AdminLayout title="New Entry" currentPath="/admin/entries" flash={flash} {...chrome(c)}>
      <EntryEdit sections={sections} aiEnabled={aiEnabled} timezone={timezone} />
    </AdminLayout>,
  );
});

// ─── Create Entry ────────────────────────────────────────

admin.post('/entries', async (c) => {
  const app = c.get('currentApp');
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
      const section = await getOrCreateSection(c.env.DB, app.id, sectionName);
      sectionId = section.id;
    }

    // The date field is entered in the configured timezone; store as UTC.
    const timezone = normalizeTimezone(await getAppSetting(c.env.DB, app.id, 'timezone'));
    const entryDate = entryDateRaw ? zonedDatetimeLocalToUTC(entryDateRaw, timezone) ?? undefined : undefined;

    const entry = await createEntry(c.env.DB, app.id, {
      title,
      content,
      category,
      section_id: sectionId,
      entry_date: entryDate,
    });

    // If publish was requested, publish immediately
    if (status === 'published') {
      await publishEntry(c.env.DB, app.id, entry.id);
      // Brand-new entry going straight to published — always a real transition.
      c.executionCtx.waitUntil(notifyEntryPublished(c.env, entry.id));
    }

    // Check if AI processing is enabled and enqueue if so
    const aiEnabled = await getAppSetting(c.env.DB, app.id, 'ai_enabled');
    if (aiEnabled === 'true' && entry.content) {
      await c.env.DB.prepare(
        'UPDATE entries SET raw_content = ?, ai_status = ? WHERE id = ? AND app_id = ?',
      ).bind(entry.content, 'pending', entry.id, app.id).run();

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
  const app = c.get('currentApp');
  const flash = getFlash(c);
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    setFlash(c, 'error', 'Invalid entry ID.');
    return c.redirect('/admin/entries');
  }

  const entry = await getEntry(c.env.DB, app.id, id);
  if (!entry) {
    setFlash(c, 'error', 'Entry not found.');
    return c.redirect('/admin/entries');
  }

  const sections = await listSections(c.env.DB, app.id);
  const aiEnabled = (await getAppSetting(c.env.DB, app.id, 'ai_enabled')) === 'true';
  const timezone = normalizeTimezone(await getAppSetting(c.env.DB, app.id, 'timezone'));

  return c.html(
    <AdminLayout title={`Edit: ${entry.title}`} currentPath="/admin/entries" flash={flash} {...chrome(c)}>
      <EntryEdit entry={entry} sections={sections} aiEnabled={aiEnabled} timezone={timezone} />
    </AdminLayout>,
  );
});

// ─── Update Entry ────────────────────────────────────────

admin.post('/entries/:id', async (c) => {
  const app = c.get('currentApp');
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
    // Capture the prior status so we only notify Slack on a genuine
    // draft→published transition, not on every re-save of a published entry.
    const before = await getEntry(c.env.DB, app.id, id);

    let sectionId: number | null = null;
    if (sectionName) {
      const section = await getOrCreateSection(c.env.DB, app.id, sectionName);
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
      const timezone = normalizeTimezone(await getAppSetting(c.env.DB, app.id, 'timezone'));
      const entryDate = zonedDatetimeLocalToUTC(entryDateRaw, timezone);
      if (entryDate) updateData.entry_date = entryDate;
    }

    if (status === 'published') {
      updateData.status = 'published';
    } else if (status === 'draft') {
      updateData.status = 'draft';
    }

    const entry = await updateEntry(c.env.DB, app.id, id, updateData);

    if (!entry) {
      setFlash(c, 'error', 'Entry not found.');
      return c.redirect('/admin/entries');
    }

    // If publish was requested and it was a draft, set published_at too
    if (status === 'published') {
      await publishEntry(c.env.DB, app.id, id);
      // Notify only when this actually flipped a non-published entry public.
      if (before && before.status !== 'published') {
        c.executionCtx.waitUntil(notifyEntryPublished(c.env, id));
      }
    }

    const versions = await getReleaseVersionsForEntry(c.env.DB, id);
    if (versions.length > 0) {
      c.executionCtx.waitUntil(purgeReleasePages(requestBaseUrl(c), app, versions));
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
  const app = c.get('currentApp');
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    setFlash(c, 'error', 'Invalid entry ID.');
    return c.redirect('/admin/entries');
  }

  try {
    const versions = await getReleaseVersionsForEntry(c.env.DB, id);
    const deleted = await deleteEntry(c.env.DB, app.id, id);
    if (!deleted) {
      setFlash(c, 'error', 'Entry not found.');
    } else {
      if (versions.length > 0) {
        c.executionCtx.waitUntil(purgeReleasePages(requestBaseUrl(c), app, versions));
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
  const app = c.get('currentApp');
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    setFlash(c, 'error', 'Invalid entry ID.');
    return c.redirect('/admin/entries');
  }

  try {
    const entry = await publishEntry(c.env.DB, app.id, id);
    if (!entry) {
      setFlash(c, 'error', 'Entry not found.');
      return c.redirect('/admin/entries');
    }
    const versions = await getReleaseVersionsForEntry(c.env.DB, id);
    if (versions.length > 0) {
      c.executionCtx.waitUntil(purgeReleasePages(requestBaseUrl(c), app, versions));
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
  const app = c.get('currentApp');
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    setFlash(c, 'error', 'Invalid entry ID.');
    return c.redirect('/admin/entries');
  }

  try {
    const entry = await getEntry(c.env.DB, app.id, id);
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
        'UPDATE entries SET raw_content = ? WHERE id = ? AND app_id = ?',
      ).bind(contentToProcess, id, app.id).run();
    }

    // Set status back to pending
    await c.env.DB.prepare(
      'UPDATE entries SET ai_status = ? WHERE id = ? AND app_id = ?',
    ).bind('pending', id, app.id).run();

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
  const app = c.get('currentApp');
  const flash = getFlash(c);
  const cfg = await getAppConfig(c.env.DB);
  if (!cfg || !cfg.installation_id || !cfg.allowed_repo) {
    return c.redirect('/setup');
  }

  // The repository is per app; the token that reads it is instance-wide.
  const sourceRepo = await getAppSetting(c.env.DB, app.id, 'source_repo');
  const githubPat = await getSourceToken(cfg);
  const aiEnabled = (await getAppSetting(c.env.DB, app.id, 'ai_enabled')) === 'true';
  const autoPublish = (await getAppSetting(c.env.DB, app.id, 'auto_publish')) === 'true';

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

  // Mark commits that already have an entry so they're unchecked by default
  // and re-running Generate doesn't create duplicates.
  const importedShas =
    commits && commits.length
      ? await getImportedCommitShas(c.env.DB, app.id)
      : new Set<string>();

  return c.html(
    <AdminLayout title="Generate from commits" currentPath="/admin/generate" flash={flash} {...chrome(c)}>
      <GeneratePage
        sourceRepo={sourceRepo}
        aiEnabled={aiEnabled}
        autoPublish={autoPublish}
        commits={commits}
        importedShas={importedShas}
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
  const app = c.get('currentApp');
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

  const aiEnabled = (await getAppSetting(c.env.DB, app.id, 'ai_enabled')) === 'true';
  const sourceRepo = (await getAppSetting(c.env.DB, app.id, 'source_repo')) || '';
  // Only meaningful alongside AI: publish each entry once its rewrite lands, so
  // the raw commit is never exposed. The checkbox is hidden when AI is off.
  const autoPublish = aiEnabled && body['auto_publish'] === 'true';

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
      const entry = await createEntry(c.env.DB, app.id, {
        title,
        content: message,
        category,
        source: 'github',
        source_metadata: JSON.stringify({ sha, url, repo: sourceRepo }),
        commit_sha: sha,
        // Preserve the commit's own date so entries keep their real order and
        // show when the work actually happened (not when they were imported).
        // Also set entry_date so it survives the publish-time COALESCE default.
        created_at: date || undefined,
        entry_date: date || undefined,
      });

      // Mirror the manual-create flow: queue for AI cleanup when enabled. When
      // auto-publish is requested, flag the entry to publish once AI finishes —
      // the queue worker does that, so the raw commit is never shown publicly.
      if (aiEnabled && message) {
        await c.env.DB.prepare(
          'UPDATE entries SET raw_content = ?, ai_status = ?, publish_on_ai_complete = ? WHERE id = ? AND app_id = ?',
        ).bind(message, 'pending', autoPublish ? 1 : 0, entry.id, app.id).run();
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
    autoPublish
      ? `Created ${created} draft ${noun} — AI is polishing them now and they'll publish automatically when it's done.`
      : aiEnabled
        ? `Created ${created} draft ${noun} — AI is polishing them now.`
        : `Created ${created} draft ${noun}.`,
  );
  return c.redirect('/admin/entries');
});

// ─── Releases List ──────────────────────────────────────

admin.get('/releases', async (c) => {
  const app = c.get('currentApp');
  const flash = getFlash(c);
  const statusFilter = c.req.query('status') || '';

  const filters: { status?: ReleaseStatus } = {};
  if (statusFilter) filters.status = statusFilter as ReleaseStatus;

  const releases = await listReleases(c.env.DB, app.id, filters);
  const timezone = normalizeTimezone(await getAppSetting(c.env.DB, app.id, 'timezone'));

  return c.html(
    <AdminLayout title="Releases" currentPath="/admin/releases" flash={flash} {...chrome(c)}>
      <ReleasesList releases={releases} statusFilter={statusFilter} timezone={timezone} />
    </AdminLayout>,
  );
});

// ─── New Release Form ───────────────────────────────────

admin.get('/releases/new', async (c) => {
  const app = c.get('currentApp');
  const flash = getFlash(c);
  // Fetch all entries (draft and published) that could be included
  const availableEntries = await listEntries(c.env.DB, app.id);
  const timezone = normalizeTimezone(await getAppSetting(c.env.DB, app.id, 'timezone'));

  return c.html(
    <AdminLayout title="New Release" currentPath="/admin/releases" flash={flash} {...chrome(c)}>
      <ReleaseEdit
        availableEntries={availableEntries}
        timezone={timezone}
        basePath={appBasePath(app)}
      />
    </AdminLayout>,
  );
});

// ─── Create Release ─────────────────────────────────────

admin.post('/releases', async (c) => {
  const app = c.get('currentApp');
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
    const timezone = normalizeTimezone(await getAppSetting(c.env.DB, app.id, 'timezone'));
    const releaseDate = releaseDateRaw
      ? zonedDatetimeLocalToUTC(releaseDateRaw, timezone) ?? undefined
      : undefined;

    const release = await createRelease(c.env.DB, app.id, {
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
      await updateRelease(c.env.DB, app.id, release.id, {}, entryIds);
    }

    // If publish was requested, publish immediately
    if (status === 'published') {
      await publishRelease(c.env.DB, app.id, release.id);
      // New release going straight to published — send the consolidated message.
      c.executionCtx.waitUntil(notifyReleasePublishedWhenReady(c.env, release.id));
    }

    c.executionCtx.waitUntil(purgeReleasePages(requestBaseUrl(c), app, [version]));

    setFlash(c, 'success', `Release "${version}" created successfully.`);
    return c.redirect('/admin/releases');
  } catch (err) {
    setFlash(c, 'error', 'Failed to create release.');
    return c.redirect('/admin/releases/new');
  }
});

// ─── Edit Release Form ──────────────────────────────────

admin.get('/releases/:id', async (c) => {
  const app = c.get('currentApp');
  const flash = getFlash(c);
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    setFlash(c, 'error', 'Invalid release ID.');
    return c.redirect('/admin/releases');
  }

  const release = await getRelease(c.env.DB, app.id, id);
  if (!release) {
    setFlash(c, 'error', 'Release not found.');
    return c.redirect('/admin/releases');
  }

  // Fetch all entries that could be included
  const availableEntries = await listEntries(c.env.DB, app.id);
  const timezone = normalizeTimezone(await getAppSetting(c.env.DB, app.id, 'timezone'));

  return c.html(
    <AdminLayout title={`Edit: ${release.version}`} currentPath="/admin/releases" flash={flash} {...chrome(c)}>
      <ReleaseEdit
        release={release}
        availableEntries={availableEntries}
        timezone={timezone}
        basePath={appBasePath(app)}
      />
    </AdminLayout>,
  );
});

// ─── Update Release ─────────────────────────────────────

admin.post('/releases/:id', async (c) => {
  const app = c.get('currentApp');
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
    const previous = await getRelease(c.env.DB, app.id, id);

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
      const timezone = normalizeTimezone(await getAppSetting(c.env.DB, app.id, 'timezone'));
      const releaseDate = zonedDatetimeLocalToUTC(releaseDateRaw, timezone);
      if (releaseDate) updateData.release_date = releaseDate;
    }

    const release = await updateRelease(c.env.DB, app.id, id, updateData, entryIds);

    if (!release) {
      setFlash(c, 'error', 'Release not found.');
      return c.redirect('/admin/releases');
    }

    // If publish was requested, publish the release
    if (status === 'published') {
      await publishRelease(c.env.DB, app.id, id);
      // Notify only when this flipped a non-published release public.
      if (previous && previous.status !== 'published') {
        c.executionCtx.waitUntil(notifyReleasePublishedWhenReady(c.env, id));
      }
    }

    const versionsToPurge = new Set<string>([version]);
    if (previous && previous.version !== version) {
      versionsToPurge.add(previous.version);
    }
    c.executionCtx.waitUntil(
      purgeReleasePages(requestBaseUrl(c), app, [...versionsToPurge]),
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
  const app = c.get('currentApp');
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    setFlash(c, 'error', 'Invalid release ID.');
    return c.redirect('/admin/releases');
  }

  try {
    const existing = await getRelease(c.env.DB, app.id, id);
    const deleted = await deleteRelease(c.env.DB, app.id, id);
    if (!deleted) {
      setFlash(c, 'error', 'Release not found.');
    } else {
      if (existing) {
        c.executionCtx.waitUntil(
          purgeReleasePages(requestBaseUrl(c), app, [existing.version]),
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
  const app = c.get('currentApp');
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    setFlash(c, 'error', 'Invalid release ID.');
    return c.redirect('/admin/releases');
  }

  try {
    // Capture prior status so re-clicking Publish doesn't re-notify Slack.
    const before = await getRelease(c.env.DB, app.id, id);
    const release = await publishRelease(c.env.DB, app.id, id);
    if (!release) {
      setFlash(c, 'error', 'Release not found.');
      return c.redirect('/admin/releases');
    }
    if (before && before.status !== 'published') {
      c.executionCtx.waitUntil(notifyReleasePublishedWhenReady(c.env, id));
    }
    c.executionCtx.waitUntil(
      purgeReleasePages(requestBaseUrl(c), app, [release.version]),
    );
    setFlash(c, 'success', `Release "${release.version}" published.`);
    return c.redirect(`/admin/releases/${id}`);
  } catch (err) {
    setFlash(c, 'error', 'Failed to publish release.');
    return c.redirect(`/admin/releases/${id}`);
  }
});

// ─── Customise Page ────────────────────────────────────

/**
 * Published content for the Customise page's live preview, scoped to one app.
 * Kept here rather than reusing the public route's loader so the preview only
 * pays for what it renders.
 */
async function fetchPreviewContent(
  db: Bindings['DB'],
  appId: number,
): Promise<{ releases: ReleaseWithEntries[]; standaloneEntries: EntryWithSection[] }> {
  const summaries = await listReleases(db, appId, { status: 'published' });
  const releases: ReleaseWithEntries[] = [];
  for (const summary of summaries) {
    const full = await getRelease(db, appId, summary.id);
    if (full) releases.push(full);
  }

  releases.sort((a, b) => {
    const dateA = a.published_at || a.created_at;
    const dateB = b.published_at || b.created_at;
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });

  const published = await listEntries(db, appId, { status: 'published' });
  const inRelease = new Set<number>();
  for (const release of releases) {
    for (const entry of release.entries) inRelease.add(entry.id);
  }

  return {
    releases,
    standaloneEntries: published.filter((e) => !inRelease.has(e.id)),
  };
}

admin.get('/customise', async (c) => {
  const app = c.get('currentApp');
  const flash = getFlash(c);
  const settings = await getAllAppSettings(c.env.DB, app.id);
  const baseUrl = requestBaseUrl(c);

  // Fetch changelog data for live preview
  const { releases, standaloneEntries } = await fetchPreviewContent(c.env.DB, app.id);
  const hasContent = releases.length > 0 || standaloneEntries.length > 0;

  // Example data if no published content exists
  const exampleReleases = hasContent ? releases : [{
    id: 0,
    app_id: app.id,
    version: 'v1.0.0',
    title: 'Initial Release',
    summary: 'The first release of our product with core functionality.',
    status: 'published' as const,
    published_at: new Date().toISOString(),
    release_date: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    publish_notify_pending: 0,
    entries: [
      { id: 1, app_id: app.id, title: 'Dark mode support', content: 'Added full dark mode with system preference detection.', category: 'added' as const, section_id: null, section_name: null, status: 'published' as const, published_at: new Date().toISOString(), entry_date: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), source: 'manual' as const, source_metadata: null, commit_sha: null, ai_status: null, raw_content: null , publish_on_ai_complete: 0 },
      { id: 2, app_id: app.id, title: 'Login page not loading on mobile devices', content: 'Resolved an issue where the login form failed to render on iOS Safari.', category: 'fixed' as const, section_id: null, section_name: null, status: 'published' as const, published_at: new Date().toISOString(), entry_date: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), source: 'manual' as const, source_metadata: null, commit_sha: null, ai_status: null, raw_content: null , publish_on_ai_complete: 0 },
      { id: 3, app_id: app.id, title: 'Updated dashboard layout for better navigation', content: 'Reorganised the sidebar and top nav for improved discoverability.', category: 'changed' as const, section_id: null, section_name: null, status: 'published' as const, published_at: new Date().toISOString(), entry_date: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), source: 'manual' as const, source_metadata: null, commit_sha: null, ai_status: null, raw_content: null , publish_on_ai_complete: 0 },
    ],
  }];
  const exampleStandalone = hasContent ? standaloneEntries : [];

  const logoKey = settings['logo_image_key'] || '';

  return c.html(
    <AdminLayout title="Customise" currentPath="/admin/customise" flash={flash} {...chrome(c)}>
      <CustomisePage
        settings={settings}
        baseUrl={baseUrl}
        basePath={appBasePath(app)}
        appName={app.name}
        previewReleases={exampleReleases}
        previewStandaloneEntries={exampleStandalone}
        previewProjectName={settings['project_name'] || app.name}
        previewProjectDescription={settings['project_description'] || ''}
        previewLogoUrl={logoKey ? `/images/${logoKey}` : null}
      />
    </AdminLayout>,
  );
});

// ─── Settings Page (per-app) ────────────────────────────

admin.get('/settings', async (c) => {
  const app = c.get('currentApp');
  const flash = getFlash(c);
  const settings = await getAllAppSettings(c.env.DB, app.id);
  const apiKeys = await listApiKeys(c.env.DB, app.id);
  const newKey = c.req.query('newKey') || null;

  return c.html(
    <AdminLayout title="Settings" currentPath="/admin/settings" flash={flash} {...chrome(c)}>
      <AppSettingsPage
        app={app}
        baseUrl={requestBaseUrl(c)}
        settings={settings}
        apiKeys={apiKeys}
        newKey={newKey}
      />
    </AdminLayout>,
  );
});

// ─── Settings Page (instance-wide) ──────────────────────

admin.get('/settings/instance', async (c) => {
  const app = c.get('currentApp');
  const flash = getFlash(c);
  const globalSettings = await getAllSettings(c.env.DB);
  const cfg = await getAppConfig(c.env.DB);

  return c.html(
    <AdminLayout
      title="Instance Settings"
      currentPath="/admin/settings/instance"
      flash={flash}
      {...chrome(c)}
    >
      <InstanceSettingsPage
        appName={app.name}
        globalSettings={globalSettings}
        hasGithubToken={!!cfg?.source_pat}
        githubRepo={cfg?.allowed_repo ?? null}
      />
    </AdminLayout>,
  );
});

// ─── Settings: Source Repository ────────────────────────

admin.post('/settings/source-repo', async (c) => {
  const app = c.get('currentApp');
  const body = await c.req.parseBody();
  const sourceRepo = ((body['source_repo'] as string) || '').trim();
  const githubPat = ((body['github_pat'] as string) || '').trim();
  const clearPat = body['clear_github_pat'] === 'true';
  // Two forms post here: the per-app repository field on /admin/settings and
  // the install-wide token field on /admin/settings/instance. Send each back
  // to the page it was submitted from.
  const isAppForm = 'source_repo' in body;

  try {
    // The repository is chosen per app; the token that reads it is shared by
    // the whole install (it lives encrypted in github_app_config). The two live
    // on separate pages now, so only touch what was submitted.
    if (isAppForm) {
      await setAppSetting(c.env.DB, app.id, 'source_repo', sourceRepo);
    }
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
      !isAppForm
        ? 'GitHub token saved.'
        : sourceRepo
          ? `Source repository set to ${sourceRepo}.`
          : 'Source repository cleared.',
    );
  } catch (err) {
    setFlash(c, 'error', 'Failed to save source repository.');
  }

  return c.redirect(isAppForm ? '/admin/settings' : '/admin/settings/instance');
});

// ─── Settings: General ──────────────────────────────────

admin.post('/settings/general', async (c) => {
  const app = c.get('currentApp');
  const body = await c.req.parseBody();
  const projectName = ((body['project_name'] as string) || '').trim();
  const projectDescription = (body['project_description'] as string) || '';

  try {
    await setAppSetting(c.env.DB, app.id, 'project_name', projectName);
    await setAppSetting(c.env.DB, app.id, 'project_description', projectDescription);
    // apps.name is the canonical display name (sidebar, switcher, apps list),
    // so keep it in step with the per-app setting the public page renders.
    if (projectName) {
      await updateApp(c.env.DB, app.id, {
        name: projectName,
        description: projectDescription,
      });
    }
    setFlash(c, 'success', 'App details saved successfully.');
  } catch (err) {
    setFlash(c, 'error', 'Failed to save app details.');
  }

  return c.redirect('/admin/settings');
});

// ─── Settings: Slack ────────────────────────────────────

admin.post('/settings/slack', async (c) => {
  const app = c.get('currentApp');
  const body = await c.req.parseBody();
  const webhookUrl = ((body['slack_webhook_url'] as string) || '').trim();

  try {
    if (webhookUrl === '') {
      // Empty submission disconnects the integration.
      await deleteAppSetting(c.env.DB, app.id, SLACK_WEBHOOK_SETTING);
      await deleteAppSetting(c.env.DB, app.id, SLACK_ENABLED_SETTING);
      setFlash(c, 'success', 'Slack disconnected.');
    } else if (!isValidSlackWebhookUrl(webhookUrl)) {
      setFlash(
        c,
        'error',
        'That doesn’t look like a Slack webhook URL (it should start with https://hooks.slack.com/).',
      );
    } else {
      await setAppSetting(c.env.DB, app.id, SLACK_WEBHOOK_SETTING, webhookUrl);
      // Saving a URL (re)enables notifications.
      await setAppSetting(c.env.DB, app.id, SLACK_ENABLED_SETTING, 'true');
      setFlash(c, 'success', 'Slack connected. Published updates will post to your channel.');
    }
  } catch (err) {
    setFlash(c, 'error', 'Failed to save Slack settings.');
  }

  return c.redirect('/admin/settings');
});

// Pause/resume without losing the saved webhook URL (toggle switch, async save).
admin.post('/settings/slack/toggle', async (c) => {
  const app = c.get('currentApp');
  const body = await c.req.parseBody();
  const enabled = body['slack_notifications_enabled'] === 'true';
  try {
    await setAppSetting(c.env.DB, app.id, SLACK_ENABLED_SETTING, enabled ? 'true' : 'false');
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ ok: false, error: 'Failed to update Slack setting.' }, 500);
  }
});

// Send a sample branded message so users can confirm the webhook works during
// setup. Uses the just-entered URL when provided, else the saved one.
admin.post('/settings/slack/test', async (c) => {
  const app = c.get('currentApp');
  const body = await c.req.parseBody();
  const entered = ((body['slack_webhook_url'] as string) || '').trim();
  const webhookUrl =
    entered || (await getAppSetting(c.env.DB, app.id, SLACK_WEBHOOK_SETTING)) || '';

  if (!isValidSlackWebhookUrl(webhookUrl)) {
    return c.json({ ok: false, error: 'Enter a valid Slack webhook URL first.' }, 400);
  }

  const branding = await resolveBranding(c.env, app.id);
  const message = buildEntryMessage(
    {
      title: 'Test notification',
      content: `This is a test message from ${branding.projectName}. Your Slack integration is working — new changelog updates will appear here.`,
      category: 'added',
    },
    branding,
  );
  const result = await sendSlackMessage(webhookUrl, message);
  return c.json(result, result.ok ? 200 : 502);
});

// ─── Settings: Display ──────────────────────────────────

admin.post('/settings/display', async (c) => {
  const app = c.get('currentApp');
  const body = await c.req.parseBody();
  const entryGrouping = body['entry_grouping'] === 'section' ? 'section' : 'category';
  const timezone = normalizeTimezone(body['timezone'] as string);
  const dateGrouping = body['date_grouping'] === 'month' ? 'month' : 'day';

  try {
    await setAppSetting(c.env.DB, app.id, 'entry_grouping', entryGrouping);
    await setAppSetting(c.env.DB, app.id, 'timezone', timezone);
    await setAppSetting(c.env.DB, app.id, 'date_grouping', dateGrouping);

    // Timezone & grouping affect every rendered page, including release detail
    // pages which aren't covered by the post-mutation shared-page purge.
    c.executionCtx.waitUntil(purgeReleaseDetailPages(c.env.DB, requestBaseUrl(c), app));

    setFlash(c, 'success', 'Display settings saved successfully.');
  } catch (err) {
    setFlash(c, 'error', 'Failed to save display settings.');
  }

  return c.redirect('/admin/customise');
});

// ─── Settings: Theme ────────────────────────────────────

admin.post('/settings/theme', async (c) => {
  const app = c.get('currentApp');
  const body = await c.req.parseBody();
  const theme = body['theme'] as string;
  const validThemes = ['herald', 'opencode', 'notion'];
  const selectedTheme = validThemes.includes(theme) ? theme : 'herald';

  try {
    await setAppSetting(c.env.DB, app.id, 'theme', selectedTheme);

    // Release detail pages also render the theme and are cached separately
    // from the shared pages purged by the post-mutation middleware.
    c.executionCtx.waitUntil(purgeReleaseDetailPages(c.env.DB, requestBaseUrl(c), app));

    setFlash(c, 'success', 'Theme saved successfully.');
  } catch (err) {
    setFlash(c, 'error', 'Failed to save theme.');
  }

  return c.redirect('/admin/customise');
});

// ─── Settings: Primary colour ───────────────────────────

admin.post('/settings/primary-color', async (c) => {
  const app = c.get('currentApp');
  const body = await c.req.parseBody();
  const raw = (body['primary_color'] as string) || '';
  const color = /^#[0-9a-fA-F]{6}$/.test(raw) ? raw.toUpperCase() : '#4F46E5';

  try {
    await setAppSetting(c.env.DB, app.id, 'primary_color', color);

    // Release detail pages also render the brand colour and are cached
    // separately from the shared pages purged by the post-mutation middleware.
    c.executionCtx.waitUntil(purgeReleaseDetailPages(c.env.DB, requestBaseUrl(c), app));

    return c.json({ ok: true, primary_color: color });
  } catch (err) {
    return c.json({ ok: false, error: 'Failed to save primary colour.' }, 500);
  }
});

// ─── Settings: Public page visibility toggles ───────────

admin.post('/settings/visibility', async (c) => {
  const app = c.get('currentApp');
  const body = await c.req.parseBody();
  const keys = ['show_title', 'show_description', 'hide_attribution'] as const;

  try {
    for (const key of keys) {
      if (key in body) {
        await setAppSetting(c.env.DB, app.id, key, body[key] === 'true' ? 'true' : 'false');
      }
    }

    // Title/description render on the home changelog; the attribution footer
    // renders on every public surface, including release detail pages which
    // aren't covered by the post-mutation shared-page purge.
    c.executionCtx.waitUntil(purgeReleaseDetailPages(c.env.DB, requestBaseUrl(c), app));

    return c.json({ ok: true });
  } catch (err) {
    return c.json({ ok: false, error: 'Failed to save visibility settings.' }, 500);
  }
});

// ─── Settings: Publishing ───────────────────────────────

admin.post('/settings/publishing', async (c) => {
  const app = c.get('currentApp');
  const body = await c.req.parseBody();
  const autoPublish = body['auto_publish'] === 'true' ? 'true' : 'false';

  try {
    await setAppSetting(c.env.DB, app.id, 'auto_publish', autoPublish);
    setFlash(c, 'success', 'Publishing settings saved successfully.');
  } catch (err) {
    setFlash(c, 'error', 'Failed to save publishing settings.');
  }

  return c.redirect('/admin/settings');
});

// ─── Settings: AI ───────────────────────────────────────

admin.post('/settings/ai', async (c) => {
  const app = c.get('currentApp');
  const body = await c.req.parseBody();
  const aiEnabled = body['ai_enabled'] === 'true' ? 'true' : 'false';
  const aiModel = resolveModelId(body['ai_model'] as string);
  const validPersonalities = ['neutral', 'professional', 'casual'];
  const aiPersonality = validPersonalities.includes(body['ai_personality'] as string)
    ? (body['ai_personality'] as string)
    : 'neutral';

  // Whether AI runs, and how it writes, is decided per app (/admin/settings);
  // the model itself is an instance-wide choice, one Workers AI binding for the
  // whole install (/admin/settings/instance). Both forms post here, and only
  // the instance one submits `ai_model` — an unchecked per-app toggle sends
  // nothing at all, and must not be read as "disable the model". `ai_scope` is
  // still honoured for callers built against the older single-page form.
  const isInstanceForm = 'ai_model' in body || body['ai_scope'] === 'instance';

  try {
    if (isInstanceForm) {
      await setSetting(c.env.DB, 'ai_model', aiModel);
    } else {
      await setAppSetting(c.env.DB, app.id, 'ai_enabled', aiEnabled);
      await setAppSetting(c.env.DB, app.id, 'ai_personality', aiPersonality);
    }
    setFlash(c, 'success', 'AI settings saved successfully.');
  } catch (err) {
    setFlash(c, 'error', 'Failed to save AI settings.');
  }

  return c.redirect(isInstanceForm ? '/admin/settings/instance' : '/admin/settings');
});

// ─── Settings: AI Test ──────────────────────────────────

admin.post('/settings/ai/test', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({})) as { model?: string; personality?: string };
    // The Test AI button sits with the per-app AI settings, where the model
    // picker isn't shown — fall back to the install-wide model on file so the
    // test exercises what this app actually writes with.
    const model = resolveModelId(body.model || (await getSetting(c.env.DB, 'ai_model')));
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
  const app = c.get('currentApp');
  try {
    const body = await c.req.parseBody();
    const file = body['file'];

    if (!file || !(file instanceof File) || file.size === 0) {
      return c.json({ error: 'No file provided' }, 400);
    }

    const existingKey = await getAppSetting(c.env.DB, app.id, 'logo_image_key');
    const result = await uploadBrandImage(c.env.IMAGES, c.env.IMAGE_STORE, app.id, file, 'logo', existingKey);

    if ('error' in result) {
      return c.json({ error: result.error }, 400);
    }

    await setAppSetting(c.env.DB, app.id, 'logo_image_key', result.key);

    const baseUrl = requestBaseUrl(c);
    c.executionCtx.waitUntil(purgeReleaseDetailPages(c.env.DB, baseUrl, app));

    if (existingKey && existingKey !== result.key) {
      c.executionCtx.waitUntil(purgeImageCache(baseUrl, existingKey));
    }

    return c.json({ url: `/images/${result.key}` });
  } catch (err) {
    return c.json({ error: 'Upload failed' }, 500);
  }
});

admin.post('/images/upload/favicon', async (c) => {
  const app = c.get('currentApp');
  try {
    const body = await c.req.parseBody();
    const file = body['file'];

    if (!file || !(file instanceof File) || file.size === 0) {
      return c.json({ error: 'No file provided' }, 400);
    }

    const existingKey = await getAppSetting(c.env.DB, app.id, 'favicon_image_key');
    const result = await uploadBrandImage(c.env.IMAGES, c.env.IMAGE_STORE, app.id, file, 'favicon', existingKey);

    if ('error' in result) {
      return c.json({ error: result.error }, 400);
    }

    await setAppSetting(c.env.DB, app.id, 'favicon_image_key', result.key);

    const baseUrl = requestBaseUrl(c);
    c.executionCtx.waitUntil(purgeReleaseDetailPages(c.env.DB, baseUrl, app));

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
  const app = c.get('currentApp');
  const body = await c.req.parseBody();
  const file = body['logo_file'];

  if (!file || !(file instanceof File) || file.size === 0) {
    setFlash(c, 'error', 'No logo file selected.');
    return c.redirect('/admin/customise');
  }

  try {
    const existingKey = await getAppSetting(c.env.DB, app.id, 'logo_image_key');
    const result = await uploadBrandImage(c.env.IMAGES, c.env.IMAGE_STORE, app.id, file, 'logo', existingKey);

    if ('error' in result) {
      setFlash(c, 'error', result.error);
      return c.redirect('/admin/customise');
    }

    await setAppSetting(c.env.DB, app.id, 'logo_image_key', result.key);

    const baseUrl = requestBaseUrl(c);
    c.executionCtx.waitUntil(purgeReleaseDetailPages(c.env.DB, baseUrl, app));

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
  const app = c.get('currentApp');
  try {
    const existingKey = await getAppSetting(c.env.DB, app.id, 'logo_image_key');
    if (existingKey) {
      await deleteImage(c.env.IMAGE_STORE, existingKey);
      await setAppSetting(c.env.DB, app.id, 'logo_image_key', '');
      const baseUrl = requestBaseUrl(c);
      c.executionCtx.waitUntil(purgeImageCache(baseUrl, existingKey));
      c.executionCtx.waitUntil(purgeReleaseDetailPages(c.env.DB, baseUrl, app));
    }
    setFlash(c, 'success', 'Logo removed.');
  } catch (err) {
    setFlash(c, 'error', 'Failed to remove logo.');
  }
  return c.redirect('/admin/customise');
});

// ─── Settings: Favicon Upload ──────────────────────────

admin.post('/settings/favicon', async (c) => {
  const app = c.get('currentApp');
  const body = await c.req.parseBody();
  const file = body['favicon_file'];

  if (!file || !(file instanceof File) || file.size === 0) {
    setFlash(c, 'error', 'No favicon file selected.');
    return c.redirect('/admin/customise');
  }

  try {
    const existingKey = await getAppSetting(c.env.DB, app.id, 'favicon_image_key');
    const result = await uploadBrandImage(c.env.IMAGES, c.env.IMAGE_STORE, app.id, file, 'favicon', existingKey);

    if ('error' in result) {
      setFlash(c, 'error', result.error);
      return c.redirect('/admin/customise');
    }

    await setAppSetting(c.env.DB, app.id, 'favicon_image_key', result.key);

    const baseUrl = requestBaseUrl(c);
    c.executionCtx.waitUntil(purgeReleaseDetailPages(c.env.DB, baseUrl, app));

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
  const app = c.get('currentApp');
  try {
    const existingKey = await getAppSetting(c.env.DB, app.id, 'favicon_image_key');
    if (existingKey) {
      await deleteImage(c.env.IMAGE_STORE, existingKey);
      await setAppSetting(c.env.DB, app.id, 'favicon_image_key', '');
      const baseUrl = requestBaseUrl(c);
      c.executionCtx.waitUntil(purgeImageCache(baseUrl, existingKey));
      c.executionCtx.waitUntil(purgeReleaseDetailPages(c.env.DB, baseUrl, app));
    }
    setFlash(c, 'success', 'Favicon removed.');
  } catch (err) {
    setFlash(c, 'error', 'Failed to remove favicon.');
  }
  return c.redirect('/admin/customise');
});

// ─── Settings: Create API Key ───────────────────────────

admin.post('/settings/keys', async (c) => {
  const app = c.get('currentApp');
  const body = await c.req.parseBody();
  const name = (body['name'] as string) || '';

  if (!name.trim()) {
    setFlash(c, 'error', 'API key name is required.');
    return c.redirect('/admin/settings');
  }

  try {
    // Keys are scoped to the app they were created in — the API and webhook
    // write to that app and no other.
    const result = await createApiKey(c.env.DB, app.id, name.trim());
    setFlash(c, 'success', `API key "${name}" created successfully.`);
    return c.redirect(`/admin/settings?newKey=${encodeURIComponent(result.key)}`);
  } catch (err) {
    setFlash(c, 'error', 'Failed to create API key.');
    return c.redirect('/admin/settings');
  }
});

// ─── Settings: Delete API Key ───────────────────────────

admin.post('/settings/keys/:id/delete', async (c) => {
  const app = c.get('currentApp');
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    setFlash(c, 'error', 'Invalid API key ID.');
    return c.redirect('/admin/settings');
  }

  try {
    const deleted = await deleteApiKey(c.env.DB, app.id, id);
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
