import { Hono } from 'hono';
import type { Context, MiddlewareHandler } from 'hono';
import type { Bindings } from '../bindings';
import { listReleases, getRelease, getReleaseByVersion } from '../services/releases';
import { listEntries } from '../services/entries';
import { getAllAppSettings } from '../services/settings';
import { appBasePath } from '../services/apps';
import { resolveAppFromSlugSegment } from '../services/app-resolver';
import { generateRSS } from '../services/rss';
import { effectiveEntryDate, effectiveReleaseDate } from '../services/datetime';
import { getCachedResponse, cacheResponse } from '../services/cache';
import type { App, Release, EntryWithSection } from '../db/schema';

import { DEFAULT_FAVICON } from '../views/components/default-favicon';
import { PublicLayout } from '../views/layouts/public-layout';
import { EmbedLayout } from '../views/layouts/embed-layout';
import { Changelog } from '../views/pages/changelog';
import { ReleaseDetail } from '../views/pages/release-detail';

interface ReleaseWithEntries extends Release {
  entries: EntryWithSection[];
}

/** The app a public request addresses, resolved once per request. */
type PublicEnv = { Bindings: Bindings; Variables: { publicApp: App } };

type PublicHandler = (c: Context<PublicEnv>) => Promise<Response>;

/**
 * Origin of the current request, derived the same way the embed JSON and RSS
 * feed derive theirs. Canonical links have to be absolute, and an app is
 * reachable at exactly one origin per request.
 */
function requestOrigin(c: Context<PublicEnv>): string {
  const url = new URL(c.req.url);
  return `${url.protocol}//${url.host}`;
}

// ─── Shared Data Fetching ──────────────────────────────

export async function fetchChangelogData(db: D1Database, appId: number) {
  const settings = await getAllAppSettings(db, appId);
  const projectName = settings['project_name'] || 'Changelog';
  const projectDescription = settings['project_description'] || '';

  const releaseSummaries = await listReleases(db, appId, { status: 'published' });

  const releases: ReleaseWithEntries[] = [];
  for (const r of releaseSummaries) {
    const full = await getRelease(db, appId, r.id);
    if (full) {
      releases.push(full);
    }
  }

  releases.sort((a, b) => {
    const dateA = a.published_at || a.created_at;
    const dateB = b.published_at || b.created_at;
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });

  const allPublishedEntries = await listEntries(db, appId, { status: 'published' });
  const releaseEntryIds = new Set<number>();
  for (const r of releases) {
    for (const e of r.entries) {
      releaseEntryIds.add(e.id);
    }
  }
  const standaloneEntries = allPublishedEntries.filter((e) => !releaseEntryIds.has(e.id));

  const logoKey = settings['logo_image_key'] || '';
  const faviconKey = settings['favicon_image_key'] || '';
  const logoUrl = logoKey ? `/images/${logoKey}` : null;
  const faviconUrl = faviconKey ? `/images/${faviconKey}` : null;
  const entryGrouping = (settings['entry_grouping'] as 'category' | 'section') || 'category';

  const theme = settings['theme'] || 'herald';
  const primaryColor = settings['primary_color'] || '';
  const timezone = settings['timezone'] || 'UTC';
  const dateGrouping = (settings['date_grouping'] as 'day' | 'month') || 'day';
  const showTitle = settings['show_title'] !== 'false';
  const showDescription = settings['show_description'] !== 'false';
  const hideAttribution = settings['hide_attribution'] === 'true';

  return { projectName, projectDescription, releases, standaloneEntries, logoUrl, faviconUrl, entryGrouping, theme, primaryColor, timezone, dateGrouping, showTitle, showDescription, hideAttribution };
}

const pub = new Hono<PublicEnv>();

// ─── Herald default icon ───────────────────────────────

// Serve Herald's built-in default icon as a real, publicly-fetchable PNG. The
// in-app favicon is a data: URI (great for inlining in HTML), but external
// services like Slack need a URL they can fetch server-side — so we expose the
// same bytes here for the notification-branding fallback when no custom favicon
// has been uploaded.
pub.get('/herald-icon.png', (c) => {
  const base64 = DEFAULT_FAVICON.split(',')[1] ?? '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Response(bytes, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
});

// ─── Image Serving ─────────────────────────────────────

// Images are stored per install, not per app, so this stays at the site root.
pub.get('/images/:key', async (c) => {
  const key = c.req.param('key');

  // Validate key format: alphanumeric, dots, underscores, hyphens only
  if (!/^[a-zA-Z0-9_.-]+$/.test(key)) {
    return c.notFound();
  }

  // Check edge cache first
  const cached = await getCachedResponse(c.req.raw);
  if (cached) return cached;

  const object = await c.env.IMAGE_STORE.get(key);
  if (!object) {
    return c.notFound();
  }

  const isHashBased = !key.startsWith('_');
  const cacheControl = isHashBased
    ? 'public, max-age=31536000, immutable'
    : 'public, max-age=3600, s-maxage=86400';

  const contentType = object.httpMetadata?.contentType || 'application/octet-stream';

  const headers = new Headers();
  headers.set('Content-Type', contentType);
  headers.set('Cache-Control', cacheControl);
  headers.set('ETag', object.httpEtag);
  if (contentType === 'image/svg+xml') {
    headers.set('Content-Security-Policy', "default-src 'none'");
  }

  const response = new Response(object.body, { headers });

  c.executionCtx.waitUntil(cacheResponse(c.req.raw, response));

  return response;
});

// ─── Embed Script Redirect ──────────────────────────────

// One bundle serves every app — the loader works out which app to show from
// the URL it was loaded from, so `/embed.js` (default app) and `/tiller/embed.js`
// (see appPages below) both redirect to the same asset.
pub.get('/embed.js', (c) => {
  return c.redirect('/assets/embed.js', 301);
});

// ─── Public Changelog Page ──────────────────────────────

const changelogPage: PublicHandler = async (c) => {
  const cached = await getCachedResponse(c.req.raw);
  if (cached) return cached;

  const app = c.get('publicApp');
  const basePath = appBasePath(app);

  const { projectName, projectDescription, releases, standaloneEntries, logoUrl, faviconUrl, entryGrouping, theme, primaryColor, timezone, dateGrouping, showTitle, showDescription, hideAttribution } =
    await fetchChangelogData(c.env.DB, app.id);

  const response = await c.html(
    <PublicLayout
      title="Changelog"
      description={projectDescription}
      projectName={projectName}
      basePath={basePath}
      logoUrl={logoUrl}
      faviconUrl={faviconUrl}
      theme={theme}
      primaryColor={primaryColor}
      hideAttribution={hideAttribution}
      canonicalUrl={`${requestOrigin(c)}${basePath || '/'}`}
    >
      <Changelog
        projectName={projectName}
        projectDescription={projectDescription}
        basePath={basePath}
        releases={releases}
        standaloneEntries={standaloneEntries}
        entryGrouping={entryGrouping}
        timezone={timezone}
        dateGrouping={dateGrouping}
        showTitle={showTitle}
        showDescription={showDescription}
      />
    </PublicLayout>,
  );

  response.headers.set('Cache-Control', 'public, s-maxage=31536000, stale-while-revalidate=60');
  c.executionCtx.waitUntil(cacheResponse(c.req.raw, response));

  return response;
};

// ─── Public Release Permalink ──────────────────────────

const releasePage: PublicHandler = async (c) => {
  const cached = await getCachedResponse(c.req.raw);
  if (cached) return cached;

  const app = c.get('publicApp');
  const basePath = appBasePath(app);

  const versionParam = c.req.param('version');
  if (!versionParam) return c.notFound();
  let version: string;
  try {
    version = decodeURIComponent(versionParam);
  } catch {
    return c.notFound();
  }

  const release = await getReleaseByVersion(c.env.DB, app.id, version);
  if (!release || release.status !== 'published') {
    return c.notFound();
  }

  const full = await getRelease(c.env.DB, app.id, release.id);
  if (!full) return c.notFound();

  const settings = await getAllAppSettings(c.env.DB, app.id);
  const projectName = settings['project_name'] || 'Changelog';
  const projectDescription = settings['project_description'] || '';
  const logoKey = settings['logo_image_key'] || '';
  const faviconKey = settings['favicon_image_key'] || '';
  const logoUrl = logoKey ? `/images/${logoKey}` : null;
  const faviconUrl = faviconKey ? `/images/${faviconKey}` : null;
  const entryGrouping = (settings['entry_grouping'] as 'category' | 'section') || 'category';
  const theme = settings['theme'] || 'herald';
  const primaryColor = settings['primary_color'] || '';
  const timezone = settings['timezone'] || 'UTC';
  const hideAttribution = settings['hide_attribution'] === 'true';

  const pageTitle = full.title ? `${full.version} – ${full.title}` : full.version;
  const description = full.summary || projectDescription;

  const response = await c.html(
    <PublicLayout
      title={pageTitle}
      description={description}
      projectName={projectName}
      basePath={basePath}
      logoUrl={logoUrl}
      faviconUrl={faviconUrl}
      theme={theme}
      primaryColor={primaryColor}
      hideAttribution={hideAttribution}
      canonicalUrl={`${requestOrigin(c)}${basePath}/releases/${encodeURIComponent(version)}`}
    >
      <ReleaseDetail
        projectName={projectName}
        basePath={basePath}
        release={full}
        entryGrouping={entryGrouping}
        timezone={timezone}
      />
    </PublicLayout>,
  );

  response.headers.set('Cache-Control', 'public, s-maxage=31536000, stale-while-revalidate=60');
  c.executionCtx.waitUntil(cacheResponse(c.req.raw, response));

  return response;
};

// ─── Embeddable Widget ──────────────────────────────────

const embedPage: PublicHandler = async (c) => {
  const cached = await getCachedResponse(c.req.raw);
  if (cached) return cached;

  const app = c.get('publicApp');
  const basePath = appBasePath(app);

  const { projectName, projectDescription, releases, standaloneEntries, faviconUrl, entryGrouping, theme, primaryColor, timezone, dateGrouping, showTitle, showDescription } =
    await fetchChangelogData(c.env.DB, app.id);

  const response = await c.html(
    <EmbedLayout faviconUrl={faviconUrl} theme={theme} primaryColor={primaryColor} basePath={basePath}>
      <Changelog
        projectName={projectName}
        projectDescription={projectDescription}
        basePath={basePath}
        releases={releases}
        standaloneEntries={standaloneEntries}
        entryGrouping={entryGrouping}
        timezone={timezone}
        dateGrouping={dateGrouping}
        showTitle={showTitle}
        showDescription={showDescription}
      />
    </EmbedLayout>,
  );

  response.headers.set('Cache-Control', 'public, s-maxage=31536000, stale-while-revalidate=60');
  c.executionCtx.waitUntil(cacheResponse(c.req.raw, response));

  return response;
};

// ─── Embed JSON API (public, no auth) ───────────────────

const embedJson: PublicHandler = async (c) => {
  const cached = await getCachedResponse(c.req.raw);
  if (cached) return cached;

  const app = c.get('publicApp');
  const basePath = appBasePath(app);

  const { projectName, projectDescription, releases, standaloneEntries, entryGrouping, timezone, dateGrouping } =
    await fetchChangelogData(c.env.DB, app.id);

  const url = new URL(c.req.url);
  const changelogUrl = `${url.protocol}//${url.host}${basePath}`;

  const data = {
    projectName,
    projectDescription,
    changelogUrl,
    entryGrouping,
    timezone,
    dateGrouping,
    releases: releases.map((r) => ({
      id: r.id,
      version: r.version,
      title: r.title,
      summary: r.summary,
      published_at: r.published_at,
      date: effectiveReleaseDate(r),
      url: `${changelogUrl}/releases/${encodeURIComponent(r.version)}`,
      entries: r.entries.map((e) => ({
        id: e.id,
        title: e.title,
        content: e.content,
        category: e.category,
        section: e.section_name,
        published_at: e.published_at,
        date: effectiveEntryDate(e),
      })),
    })),
    standaloneEntries: standaloneEntries.map((e) => ({
      id: e.id,
      title: e.title,
      content: e.content,
      category: e.category,
      section: e.section_name,
      published_at: e.published_at,
      date: effectiveEntryDate(e),
    })),
  };

  const response = c.json(data);
  response.headers.set('Cache-Control', 'public, s-maxage=31536000, stale-while-revalidate=60');
  response.headers.set('Access-Control-Allow-Origin', '*');
  c.executionCtx.waitUntil(cacheResponse(c.req.raw, response));

  return response;
};

// ─── RSS Feed ───────────────────────────────────────────

const feedXml: PublicHandler = async (c) => {
  const cached = await getCachedResponse(c.req.raw);
  if (cached) return cached;

  const app = c.get('publicApp');
  const basePath = appBasePath(app);

  const { projectName, projectDescription, releases, standaloneEntries, entryGrouping } =
    await fetchChangelogData(c.env.DB, app.id);

  const url = new URL(c.req.url);
  // Item links and the channel link live under the app's base path, so the feed
  // of a non-default app points at that app's pages.
  const baseUrl = `${url.protocol}//${url.host}${basePath}`;

  const xml = generateRSS(releases, standaloneEntries, {
    name: projectName,
    description: projectDescription,
    url: baseUrl,
  }, entryGrouping);

  const response = await c.body(xml, 200, {
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'public, s-maxage=31536000, stale-while-revalidate=60',
  });

  c.executionCtx.waitUntil(cacheResponse(c.req.raw, response));

  return response;
};

// ─── App Resolution ─────────────────────────────────────

/** Site-root pages belong to the default app. */
const withDefaultApp: MiddlewareHandler<PublicEnv> = async (c, next) => {
  const app = await resolveAppFromSlugSegment(c.env.DB, undefined);
  if (!app) return c.notFound();
  c.set('publicApp', app);
  await next();
};

/**
 * `/:appSlug/...` pages belong to the named app. Reserved and unknown slugs
 * 404; the default app's own slug redirects to the site root so each page has
 * exactly one canonical URL.
 */
const withSlugApp: MiddlewareHandler<PublicEnv> = async (c, next) => {
  const slug = c.req.param('appSlug');
  const app = await resolveAppFromSlugSegment(c.env.DB, slug);
  if (!app) return c.notFound();

  const url = new URL(c.req.url);
  if (app.is_default) {
    const rest = url.pathname.slice(`/${slug}`.length) || '/';
    return c.redirect(rest + url.search, 301);
  }

  // `/tiller/` is the same page as `/tiller`; the router only serves the latter.
  if (url.pathname.endsWith('/')) {
    return c.redirect(url.pathname.replace(/\/+$/, '') + url.search, 301);
  }

  c.set('publicApp', app);
  await next();
};

// ─── Routes ─────────────────────────────────────────────

// Default app at the site root — unchanged URLs for every existing install.
pub.get('/', withDefaultApp, changelogPage);
pub.get('/releases/:version', withDefaultApp, releasePage);
pub.get('/embed', withDefaultApp, embedPage);
pub.get('/embed.json', withDefaultApp, embedJson);
pub.get('/feed.xml', withDefaultApp, feedXml);

// Every other app under its slug. Registered last so the routes above (and the
// /setup, /auth, /admin, /api mounts in index.ts) always win the match.
const appPages = new Hono<PublicEnv>();
appPages.use('*', withSlugApp);
appPages.get('/', changelogPage);
appPages.get('/releases/:version', releasePage);
appPages.get('/embed', embedPage);
appPages.get('/embed.json', embedJson);
appPages.get('/feed.xml', feedXml);
// The same bundle as `/embed.js`; the slug is only here so the loader can read
// its own app out of the URL the page author wrote. Registered inside the group
// so an unknown or reserved slug 404s and the default app's slug redirects to
// `/embed.js`, exactly like its sibling pages.
appPages.get('/embed.js', (c) => c.redirect('/assets/embed.js', 301));

pub.route('/:appSlug', appPages);

export default pub;
