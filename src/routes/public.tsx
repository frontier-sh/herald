import { Hono } from 'hono';
import type { Bindings } from '../bindings';
import { listReleases, getRelease } from '../services/releases';
import { listEntries } from '../services/entries';
import { getAllSettings } from '../services/settings';
import { generateRSS } from '../services/rss';
import type { Release, Entry } from '../db/schema';

import { PublicLayout } from '../views/layouts/public-layout';
import { Changelog } from '../views/pages/changelog';

interface ReleaseWithEntries extends Release {
  entries: Entry[];
}

const pub = new Hono<{ Bindings: Bindings }>();

// ─── Public Changelog Page ──────────────────────────────

pub.get('/', async (c) => {
  const settings = await getAllSettings(c.env.DB);
  const projectName = settings['project_name'] || 'Changelog';
  const projectDescription = settings['project_description'] || '';

  // Fetch published releases
  const releaseSummaries = await listReleases(c.env.DB, { status: 'published' });

  // Fetch full release details with entries
  const releases: ReleaseWithEntries[] = [];
  for (const r of releaseSummaries) {
    const full = await getRelease(c.env.DB, r.id);
    if (full) {
      releases.push(full);
    }
  }

  // Sort by published_at descending
  releases.sort((a, b) => {
    const dateA = a.published_at || a.created_at;
    const dateB = b.published_at || b.created_at;
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });

  // Fetch published entries not in any release
  const allPublishedEntries = await listEntries(c.env.DB, { status: 'published' });
  const releaseEntryIds = new Set<number>();
  for (const r of releases) {
    for (const e of r.entries) {
      releaseEntryIds.add(e.id);
    }
  }
  const standaloneEntries = allPublishedEntries.filter((e) => !releaseEntryIds.has(e.id));

  return c.html(
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
});

// ─── RSS Feed ───────────────────────────────────────────

pub.get('/feed.xml', async (c) => {
  const settings = await getAllSettings(c.env.DB);
  const projectName = settings['project_name'] || 'Changelog';
  const projectDescription = settings['project_description'] || '';

  // Determine base URL from request
  const url = new URL(c.req.url);
  const baseUrl = `${url.protocol}//${url.host}`;

  // Fetch published releases with entries
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

  // Fetch standalone published entries
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

  return c.body(xml, 200, {
    'Content-Type': 'application/xml; charset=utf-8',
  });
});

export default pub;
