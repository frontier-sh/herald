import type { Release, EntryWithSection } from '../db/schema';
import { marked } from 'marked';

interface ReleaseWithEntries extends Release {
  entries: EntryWithSection[];
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function renderMarkdown(md: string): string {
  if (!md) return '';
  return marked.parse(md, { async: false }) as string;
}

function formatRssDate(dateStr: string): string {
  return new Date(dateStr).toUTCString();
}

function buildReleaseDescription(release: ReleaseWithEntries, grouping: 'category' | 'section'): string {
  let html = '';

  if (release.summary) {
    html += renderMarkdown(release.summary);
  }

  if (release.entries.length > 0) {
    if (grouping === 'section') {
      // Group by section
      const sectionMap = new Map<string | null, EntryWithSection[]>();
      for (const entry of release.entries) {
        const key = entry.section_name || null;
        if (!sectionMap.has(key)) sectionMap.set(key, []);
        sectionMap.get(key)!.push(entry);
      }

      for (const [sectionName, entries] of sectionMap) {
        html += `<h3>${escapeXml(sectionName || 'Other')}</h3><ul>`;
        for (const entry of entries) {
          html += `<li><strong>${escapeXml(entry.title)}</strong>`;
          if (entry.content) {
            html += renderMarkdown(entry.content);
          }
          html += '</li>';
        }
        html += '</ul>';
      }
    } else {
      // Group by category (default)
      const grouped: Record<string, EntryWithSection[]> = {};
      for (const entry of release.entries) {
        if (!grouped[entry.category]) {
          grouped[entry.category] = [];
        }
        grouped[entry.category].push(entry);
      }

      for (const [category, entries] of Object.entries(grouped)) {
        html += `<h3>${category.charAt(0).toUpperCase() + category.slice(1)}</h3><ul>`;
        for (const entry of entries) {
          html += `<li><strong>${escapeXml(entry.title)}</strong>`;
          if (entry.content) {
            html += renderMarkdown(entry.content);
          }
          html += '</li>';
        }
        html += '</ul>';
      }
    }
  }

  return html;
}

export function generateRSS(
  releases: ReleaseWithEntries[],
  standaloneEntries: EntryWithSection[],
  settings: { name: string; description: string; url: string },
  entryGrouping: 'category' | 'section' = 'category',
): string {
  const channelTitle = escapeXml(settings.name || 'Changelog');
  const channelDescription = escapeXml(settings.description || 'Latest updates and changes');
  const channelLink = escapeXml(settings.url || '');
  const buildDate = formatRssDate(new Date().toISOString());

  let items = '';

  // Add release items
  for (const release of releases) {
    const title = escapeXml(
      release.title
        ? `${release.version} - ${release.title}`
        : release.version,
    );
    const description = buildReleaseDescription(release, entryGrouping);
    const pubDate = formatRssDate(release.published_at || release.created_at);
    const link = `${channelLink}/releases/${encodeURIComponent(release.version)}`;

    items += `
    <item>
      <title>${title}</title>
      <link>${link}</link>
      <description><![CDATA[${description}]]></description>
      <pubDate>${pubDate}</pubDate>
      <guid isPermaLink="true">${link}</guid>
      <category>release</category>
    </item>`;
  }

  // Add standalone entry items
  for (const entry of standaloneEntries) {
    const title = escapeXml(entry.title);
    const contentHtml = entry.content ? renderMarkdown(entry.content) : '';
    const pubDate = formatRssDate(entry.published_at || entry.created_at);
    const guid = `${channelLink}/entries/${entry.id}`;

    items += `
    <item>
      <title>${title}</title>
      <description><![CDATA[${contentHtml}]]></description>
      <pubDate>${pubDate}</pubDate>
      <guid isPermaLink="false">${guid}</guid>
      <category>${escapeXml(entry.category)}</category>
    </item>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${channelTitle}</title>
    <link>${channelLink}</link>
    <description>${channelDescription}</description>
    <language>en</language>
    <lastBuildDate>${buildDate}</lastBuildDate>
    <atom:link href="${channelLink}/feed.xml" rel="self" type="application/rss+xml" />${items}
  </channel>
</rss>`;
}
