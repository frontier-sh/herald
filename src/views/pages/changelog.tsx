import type { FC } from 'hono/jsx';
import type { Release, EntryWithSection, Category } from '../../db/schema';
import { CATEGORIES } from '../../db/schema';
import { marked } from 'marked';
import {
  type DateGrouping,
  bucketLabel,
  dateBucketKey,
  effectiveEntryDate,
  effectiveReleaseDate,
  parseStoredDate,
  toIsoUtc,
} from '../../services/datetime';

interface ReleaseWithEntries extends Release {
  entries: EntryWithSection[];
}

interface ChangelogProps {
  projectName: string;
  projectDescription: string;
  releases: ReleaseWithEntries[];
  standaloneEntries: EntryWithSection[];
  entryGrouping?: 'category' | 'section';
  timezone?: string;
  dateGrouping?: DateGrouping;
  showTitle?: boolean;
  showDescription?: boolean;
}

interface DateBucket {
  key: string;
  /** Representative (latest) date within the bucket, for the label. */
  date: string;
  releases: ReleaseWithEntries[];
  standalone: EntryWithSection[];
}

// Group releases and standalone entries into date buckets (computed in the
// configured timezone), newest first. Releases come before loose entries within
// a bucket.
function buildDateBuckets(
  releases: ReleaseWithEntries[],
  standaloneEntries: EntryWithSection[],
  timezone: string,
  dateGrouping: DateGrouping,
): DateBucket[] {
  const map = new Map<string, DateBucket>();
  const ensure = (date: string): DateBucket => {
    const key = dateBucketKey(date, timezone, dateGrouping);
    let bucket = map.get(key);
    if (!bucket) {
      bucket = { key, date, releases: [], standalone: [] };
      map.set(key, bucket);
    } else if (parseStoredDate(date).getTime() > parseStoredDate(bucket.date).getTime()) {
      bucket.date = date;
    }
    return bucket;
  };

  for (const release of releases) ensure(effectiveReleaseDate(release)).releases.push(release);
  for (const entry of standaloneEntries) ensure(effectiveEntryDate(entry)).standalone.push(entry);

  return [...map.values()].sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));
}

export const CATEGORY_COLORS: Record<Category, { bg: string; text: string }> = {
  added: { bg: '#D1FAE5', text: '#059669' },
  changed: { bg: '#DBEAFE', text: '#2563EB' },
  fixed: { bg: '#EDE9FE', text: '#7C3AED' },
  removed: { bg: '#FEE2E2', text: '#DC2626' },
  deprecated: { bg: '#FEF3C7', text: '#D97706' },
  security: { bg: '#FED7AA', text: '#EA580C' },
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Customise how images render in changelog content:
//  - images always lazy-load;
//  - a lone image on its own line becomes a block <figure>, and its alt text (if
//    any) is surfaced as a <figcaption>. We do this in the paragraph renderer
//    rather than the image renderer because <figure> is block content and is
//    invalid inside the <p> that marked otherwise wraps around it.
//  - an image inline within text stays a plain <img> (no caption).
// Empty alt (EasyMDE's default on drag/drop/paste) yields a caption-less figure.
marked.use({
  renderer: {
    image({ href, title, text }) {
      const src = escapeHtml(href || '');
      const alt = escapeHtml(text || '');
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
      return `<img src="${src}" alt="${alt}"${titleAttr} loading="lazy">`;
    },
    paragraph(token) {
      const tokens = token.tokens ?? [];
      const inner = this.parser.parseInline(tokens);
      const only = tokens.length === 1 ? tokens[0] : null;
      if (only && only.type === 'image') {
        const alt = escapeHtml(only.text || '');
        const caption = alt ? `<figcaption>${alt}</figcaption>` : '';
        return `<figure>${inner}${caption}</figure>\n`;
      }
      return `<p>${inner}</p>\n`;
    },
  },
});

export function renderMarkdown(md: string): string {
  if (!md) return '';
  return marked.parse(md, { async: false }) as string;
}

function groupEntriesByCategory(entries: EntryWithSection[]): Record<string, EntryWithSection[]> {
  const grouped: Record<string, EntryWithSection[]> = {};
  for (const entry of entries) {
    if (!grouped[entry.category]) {
      grouped[entry.category] = [];
    }
    grouped[entry.category].push(entry);
  }
  return grouped;
}

function groupEntriesBySection(entries: EntryWithSection[]): Map<string | null, EntryWithSection[]> {
  const map = new Map<string | null, EntryWithSection[]>();
  for (const entry of entries) {
    const key = entry.section_name || null;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(entry);
  }
  return map;
}

// Collect all unique categories across releases and standalone entries
function collectCategories(releases: ReleaseWithEntries[], standaloneEntries: EntryWithSection[]): Category[] {
  const cats = new Set<Category>();
  for (const r of releases) {
    for (const e of r.entries) {
      cats.add(e.category);
    }
  }
  for (const e of standaloneEntries) {
    cats.add(e.category);
  }
  // Return in canonical order
  return CATEGORIES.filter((c) => cats.has(c));
}

const CategoryGroupEntries: FC<{ entries: EntryWithSection[]; category: Category }> = ({ entries, category }) => (
  <div class="entry-group" data-category={category}>
    <h3 class="entry-group-title">
      <span
        class="entry-group-badge"
        style={`background-color: ${CATEGORY_COLORS[category].bg}; color: ${CATEGORY_COLORS[category].text};`}
      >
        {category.charAt(0).toUpperCase() + category.slice(1)}
      </span>
    </h3>
    <ul class="entry-group-list">
      {entries.map((entry) => {
        const contentHtml = renderMarkdown(entry.content || '');
        return (
          <li class="entry-group-item">
            <strong class="entry-group-item-title">{entry.title}</strong>
            {contentHtml && (
              <div class="prose entry-group-item-content" dangerouslySetInnerHTML={{ __html: contentHtml }} />
            )}
          </li>
        );
      })}
    </ul>
  </div>
);

export const EntriesByCategoryView: FC<{ entries: EntryWithSection[] }> = ({ entries }) => {
  const grouped = groupEntriesByCategory(entries);
  return (
    <div class="timeline-entries">
      {CATEGORIES.filter((cat) => grouped[cat]).map((cat) => (
        <CategoryGroupEntries entries={grouped[cat]} category={cat} />
      ))}
    </div>
  );
};

export const EntriesBySectionView: FC<{ entries: EntryWithSection[] }> = ({ entries }) => {
  const sectionMap = groupEntriesBySection(entries);
  const sectionEntries: Array<[string | null, EntryWithSection[]]> = [];

  // Named sections first
  for (const [name, sectionEnts] of sectionMap) {
    if (name !== null) sectionEntries.push([name, sectionEnts]);
  }
  // Ungrouped last
  const ungrouped = sectionMap.get(null);
  if (ungrouped) sectionEntries.push([null, ungrouped]);

  return (
    <div class="timeline-entries timeline-entries--sections">
      {sectionEntries.map(([sectionName, sectionEnts]) => (
        <div class="entry-section" data-section={sectionName || 'other'}>
          <h3 class="entry-section-title">{sectionName || 'Other'}</h3>
          <ul class="entry-section-list">
            {sectionEnts.map((entry) => {
              const contentHtml = renderMarkdown(entry.content || '');
              return (
                <li class="entry-section-item" data-category={entry.category}>
                  <span class="entry-section-item-title">{entry.title}</span>
                  {contentHtml && (
                    <div class="prose entry-section-item-content" dangerouslySetInnerHTML={{ __html: contentHtml }} />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
};

// A single release rendered inside a date bucket: version + title + summary,
// then its entries sub-grouped by category or section.
const ReleaseBlock: FC<{ release: ReleaseWithEntries; useSection: boolean }> = ({ release, useSection }) => {
  const summaryHtml = renderMarkdown(release.summary || '');
  const releaseHref = `/releases/${encodeURIComponent(release.version)}`;
  return (
    <div class="timeline-release" id={`release-${release.version}`}>
      <div class="timeline-header">
        <a href={releaseHref} class="timeline-version timeline-version-link">{release.version}</a>
      </div>
      {release.title && (
        <h2 class="timeline-release-title">
          <a href={releaseHref}>{release.title}</a>
        </h2>
      )}
      {summaryHtml && (
        <div class="prose timeline-summary" dangerouslySetInnerHTML={{ __html: summaryHtml }} />
      )}
      {useSection ? (
        <EntriesBySectionView entries={release.entries} />
      ) : (
        <EntriesByCategoryView entries={release.entries} />
      )}
    </div>
  );
};

export const Changelog: FC<ChangelogProps> = ({
  projectName,
  projectDescription,
  releases,
  standaloneEntries,
  entryGrouping = 'category',
  timezone = 'UTC',
  dateGrouping = 'day',
  showTitle = true,
  showDescription = true,
}) => {
  const hasContent = releases.length > 0 || standaloneEntries.length > 0;
  const allCategories = collectCategories(releases, standaloneEntries);
  const useSection = entryGrouping === 'section';
  const buckets = buildDateBuckets(releases, standaloneEntries, timezone, dateGrouping);

  return (
    <div class="changelog">
      <div class="changelog-hero">
        <h1 class="changelog-title" style={showTitle ? undefined : 'display: none;'}>{projectName}</h1>
        {projectDescription && (
          <p class="changelog-subtitle" style={showDescription ? undefined : 'display: none;'}>{projectDescription}</p>
        )}
      </div>

      {hasContent && !useSection && allCategories.length > 0 && (
        <div class="category-filters" id="category-filters">
          <button class="category-pill active" data-category="all">All</button>
          {allCategories.map((cat) => {
            const colors = CATEGORY_COLORS[cat];
            return (
              <button
                class="category-pill"
                data-category={cat}
                style={`--pill-bg: ${colors.bg}; --pill-text: ${colors.text};`}
              >
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </button>
            );
          })}
        </div>
      )}

      {hasContent ? (
        <div class="changelog-timeline">
          <div class="timeline">
            {buckets.map((bucket) => (
              <div class="timeline-item" data-timeline-bucket>
                <div class="timeline-marker"></div>
                <div class="timeline-content">
                  <time
                    class="timeline-date timeline-date-heading"
                    datetime={toIsoUtc(bucket.date)}
                    data-herald-date
                    data-format={dateGrouping}
                  >
                    {bucketLabel(bucket.date, timezone, dateGrouping)}
                  </time>
                  {bucket.releases.map((release) => (
                    <ReleaseBlock release={release} useSection={useSection} />
                  ))}
                  {bucket.standalone.length > 0 && (
                    <div class="timeline-standalone">
                      {useSection ? (
                        <EntriesBySectionView entries={bucket.standalone} />
                      ) : (
                        <EntriesByCategoryView entries={bucket.standalone} />
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div class="changelog-empty">
          <h2>No updates yet</h2>
          <p>Check back soon for the latest changes and improvements.</p>
        </div>
      )}
    </div>
  );
};
