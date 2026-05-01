import { Hono } from 'hono';
import type { Bindings } from '../bindings';
import { listReleases, getRelease, getReleaseByVersion } from '../services/releases';
import { listEntries } from '../services/entries';
import { getAllSettings } from '../services/settings';
import { generateRSS } from '../services/rss';
import { getCachedResponse, cacheResponse } from '../services/cache';
import type { Release, EntryWithSection } from '../db/schema';

import { PublicLayout } from '../views/layouts/public-layout';
import { EmbedLayout } from '../views/layouts/embed-layout';
import { Changelog } from '../views/pages/changelog';
import { ReleaseDetail } from '../views/pages/release-detail';

interface ReleaseWithEntries extends Release {
  entries: EntryWithSection[];
}

// ─── Shared Data Fetching ──────────────────────────────

export async function fetchChangelogData(db: D1Database) {
  const settings = await getAllSettings(db);
  const projectName = settings['project_name'] || 'Changelog';
  const projectDescription = settings['project_description'] || '';

  const releaseSummaries = await listReleases(db, { status: 'published' });

  const releases: ReleaseWithEntries[] = [];
  for (const r of releaseSummaries) {
    const full = await getRelease(db, r.id);
    if (full) {
      releases.push(full);
    }
  }

  releases.sort((a, b) => {
    const dateA = a.published_at || a.created_at;
    const dateB = b.published_at || b.created_at;
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });

  const allPublishedEntries = await listEntries(db, { status: 'published' });
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

  return { projectName, projectDescription, releases, standaloneEntries, logoUrl, faviconUrl, entryGrouping, theme };
}

const pub = new Hono<{ Bindings: Bindings }>();

// ─── Image Serving ─────────────────────────────────────

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

// ─── Public Changelog Page ──────────────────────────────

pub.get('/', async (c) => {
  const cached = await getCachedResponse(c.req.raw);
  if (cached) return cached;

  const { projectName, projectDescription, releases, standaloneEntries, logoUrl, faviconUrl, entryGrouping, theme } =
    await fetchChangelogData(c.env.DB);

  const response = await c.html(
    <PublicLayout
      title="Changelog"
      description={projectDescription}
      projectName={projectName}
      logoUrl={logoUrl}
      faviconUrl={faviconUrl}
      theme={theme}
    >
      <Changelog
        projectName={projectName}
        projectDescription={projectDescription}
        releases={releases}
        standaloneEntries={standaloneEntries}
        entryGrouping={entryGrouping}
      />
    </PublicLayout>,
  );

  response.headers.set('Cache-Control', 'public, s-maxage=31536000, stale-while-revalidate=60');
  c.executionCtx.waitUntil(cacheResponse(c.req.raw, response));

  return response;
});

// ─── Public Release Permalink ──────────────────────────

pub.get('/releases/:slug', async (c) => {
  const cached = await getCachedResponse(c.req.raw);
  if (cached) return cached;

  const slugParam = c.req.param('slug');
  let version: string;
  try {
    version = decodeURIComponent(slugParam);
  } catch {
    return c.notFound();
  }

  const release = await getReleaseByVersion(c.env.DB, version);
  if (!release || release.status !== 'published') {
    return c.notFound();
  }

  const full = await getRelease(c.env.DB, release.id);
  if (!full) return c.notFound();

  const settings = await getAllSettings(c.env.DB);
  const projectName = settings['project_name'] || 'Changelog';
  const projectDescription = settings['project_description'] || '';
  const logoKey = settings['logo_image_key'] || '';
  const faviconKey = settings['favicon_image_key'] || '';
  const logoUrl = logoKey ? `/images/${logoKey}` : null;
  const faviconUrl = faviconKey ? `/images/${faviconKey}` : null;
  const entryGrouping = (settings['entry_grouping'] as 'category' | 'section') || 'category';
  const theme = settings['theme'] || 'herald';

  const pageTitle = full.title ? `${full.version} – ${full.title}` : full.version;
  const description = full.summary || projectDescription;

  const response = await c.html(
    <PublicLayout
      title={pageTitle}
      description={description}
      projectName={projectName}
      logoUrl={logoUrl}
      faviconUrl={faviconUrl}
      theme={theme}
    >
      <ReleaseDetail
        projectName={projectName}
        release={full}
        entryGrouping={entryGrouping}
      />
    </PublicLayout>,
  );

  response.headers.set('Cache-Control', 'public, s-maxage=31536000, stale-while-revalidate=60');
  c.executionCtx.waitUntil(cacheResponse(c.req.raw, response));

  return response;
});

// ─── Embeddable Widget ──────────────────────────────────

pub.get('/embed', async (c) => {
  const cached = await getCachedResponse(c.req.raw);
  if (cached) return cached;

  const { projectName, projectDescription, releases, standaloneEntries, logoUrl, faviconUrl, entryGrouping, theme } =
    await fetchChangelogData(c.env.DB);

  const response = await c.html(
    <EmbedLayout faviconUrl={faviconUrl} theme={theme}>
      <Changelog
        projectName={projectName}
        projectDescription={projectDescription}
        releases={releases}
        standaloneEntries={standaloneEntries}
        entryGrouping={entryGrouping}
      />
    </EmbedLayout>,
  );

  response.headers.set('Cache-Control', 'public, s-maxage=31536000, stale-while-revalidate=60');
  c.executionCtx.waitUntil(cacheResponse(c.req.raw, response));

  return response;
});

// ─── Embed JSON API (public, no auth) ───────────────────

pub.get('/embed.json', async (c) => {
  const cached = await getCachedResponse(c.req.raw);
  if (cached) return cached;

  const { projectName, projectDescription, releases, standaloneEntries, entryGrouping } =
    await fetchChangelogData(c.env.DB);

  const url = new URL(c.req.url);
  const changelogUrl = `${url.protocol}//${url.host}`;

  const data = {
    projectName,
    projectDescription,
    changelogUrl,
    entryGrouping,
    releases: releases.map((r) => ({
      id: r.id,
      version: r.version,
      title: r.title,
      summary: r.summary,
      published_at: r.published_at,
      url: `${changelogUrl}/releases/${encodeURIComponent(r.version)}`,
      entries: r.entries.map((e) => ({
        id: e.id,
        title: e.title,
        content: e.content,
        category: e.category,
        section: e.section_name,
        published_at: e.published_at,
      })),
    })),
    standaloneEntries: standaloneEntries.map((e) => ({
      id: e.id,
      title: e.title,
      content: e.content,
      category: e.category,
      section: e.section_name,
      published_at: e.published_at,
    })),
  };

  const response = c.json(data);
  response.headers.set('Cache-Control', 'public, s-maxage=31536000, stale-while-revalidate=60');
  response.headers.set('Access-Control-Allow-Origin', '*');
  c.executionCtx.waitUntil(cacheResponse(c.req.raw, response));

  return response;
});

// ─── Embed Script Redirect ──────────────────────────────

pub.get('/embed.js', (c) => {
  return c.redirect('/assets/embed.js', 301);
});

// ─── RSS Feed ───────────────────────────────────────────

pub.get('/feed.xml', async (c) => {
  const cached = await getCachedResponse(c.req.raw);
  if (cached) return cached;

  const settings = await getAllSettings(c.env.DB);
  const projectName = settings['project_name'] || 'Changelog';
  const projectDescription = settings['project_description'] || '';

  const url = new URL(c.req.url);
  const baseUrl = `${url.protocol}//${url.host}`;

  const releaseSummaries = await listReleases(c.env.DB, { status: 'published' });
  const releases: ReleaseWithEntries[] = [];
  for (const r of releaseSummaries) {
    const full = await getRelease(c.env.DB, r.id);
    if (full) {
      releases.push(full);
    }
  }

  releases.sort((a, b) => {
    const dateA = a.published_at || a.created_at;
    const dateB = b.published_at || b.created_at;
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });

  const allPublishedEntries = await listEntries(c.env.DB, { status: 'published' });
  const releaseEntryIds = new Set<number>();
  for (const r of releases) {
    for (const e of r.entries) {
      releaseEntryIds.add(e.id);
    }
  }
  const standaloneEntries = allPublishedEntries.filter((e) => !releaseEntryIds.has(e.id));

  const entryGrouping = (settings['entry_grouping'] as 'category' | 'section') || 'category';

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
});

export default pub;
