import { Hono } from 'hono';
import type { Bindings } from '../bindings';
import { listReleases, getRelease } from '../services/releases';
import { listEntries } from '../services/entries';
import { getAllSettings } from '../services/settings';
import { generateRSS } from '../services/rss';
import { getCachedResponse, cacheResponse } from '../services/cache';
import type { Release, Entry } from '../db/schema';

import { PublicLayout } from '../views/layouts/public-layout';
import { EmbedLayout } from '../views/layouts/embed-layout';
import { Changelog } from '../views/pages/changelog';

interface ReleaseWithEntries extends Release {
  entries: Entry[];
}

// ─── Shared Data Fetching ──────────────────────────────

async function fetchChangelogData(db: D1Database) {
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

  return { projectName, projectDescription, releases, standaloneEntries };
}

const pub = new Hono<{ Bindings: Bindings }>();

// ─── Public Changelog Page ──────────────────────────────

pub.get('/', async (c) => {
  const cached = await getCachedResponse(c.req.raw);
  if (cached) return cached;

  const { projectName, projectDescription, releases, standaloneEntries } =
    await fetchChangelogData(c.env.DB);

  const response = await c.html(
    <PublicLayout
      title="Changelog"
      description={projectDescription}
      projectName={projectName}
    >
      <Changelog
        projectName={projectName}
        projectDescription={projectDescription}
        releases={releases}
        standaloneEntries={standaloneEntries}
      />
    </PublicLayout>,
  );

  c.executionCtx.waitUntil(cacheResponse(c.req.raw, response));

  return response;
});

// ─── Embeddable Widget ──────────────────────────────────

pub.get('/embed', async (c) => {
  const cached = await getCachedResponse(c.req.raw);
  if (cached) return cached;

  const { projectName, projectDescription, releases, standaloneEntries } =
    await fetchChangelogData(c.env.DB);

  const response = await c.html(
    <EmbedLayout>
      <Changelog
        projectName={projectName}
        projectDescription={projectDescription}
        releases={releases}
        standaloneEntries={standaloneEntries}
      />
    </EmbedLayout>,
  );

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

  const xml = generateRSS(releases, standaloneEntries, {
    name: projectName,
    description: projectDescription,
    url: baseUrl,
  });

  const response = await c.body(xml, 200, {
    'Content-Type': 'application/xml; charset=utf-8',
  });

  c.executionCtx.waitUntil(cacheResponse(c.req.raw, response));

  return response;
});

export default pub;
