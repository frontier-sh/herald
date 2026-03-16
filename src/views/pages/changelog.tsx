import type { FC } from 'hono/jsx';
import type { Release, EntryWithSection, Category } from '../../db/schema';
import { CATEGORIES } from '../../db/schema';
import { marked } from 'marked';

interface ReleaseWithEntries extends Release {
  entries: EntryWithSection[];
}

interface ChangelogProps {
  projectName: string;
  projectDescription: string;
  releases: ReleaseWithEntries[];
  standaloneEntries: EntryWithSection[];
  entryGrouping?: 'category' | 'section';
}

const CATEGORY_COLORS: Record<Category, { bg: string; text: string }> = {
  added: { bg: '#D1FAE5', text: '#059669' },
  changed: { bg: '#DBEAFE', text: '#2563EB' },
  fixed: { bg: '#EDE9FE', text: '#7C3AED' },
  removed: { bg: '#FEE2E2', text: '#DC2626' },
  deprecated: { bg: '#FEF3C7', text: '#D97706' },
  security: { bg: '#FED7AA', text: '#EA580C' },
};

function renderMarkdown(md: string): string {
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

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
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

const EntriesByCategoryView: FC<{ entries: EntryWithSection[] }> = ({ entries }) => {
  const grouped = groupEntriesByCategory(entries);
  return (
    <div class="timeline-entries">
      {CATEGORIES.filter((cat) => grouped[cat]).map((cat) => (
        <CategoryGroupEntries entries={grouped[cat]} category={cat} />
      ))}
    </div>
  );
};

const EntriesBySectionView: FC<{ entries: EntryWithSection[] }> = ({ entries }) => {
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

export const Changelog: FC<ChangelogProps> = ({
  projectName,
  projectDescription,
  releases,
  standaloneEntries,
  entryGrouping = 'category',
}) => {
  const hasContent = releases.length > 0 || standaloneEntries.length > 0;
  const allCategories = collectCategories(releases, standaloneEntries);
  const useSection = entryGrouping === 'section';

  return (
    <div class="changelog">
      <div class="changelog-hero">
        <h1 class="changelog-title">{projectName}</h1>
        {projectDescription && (
          <p class="changelog-subtitle">{projectDescription}</p>
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
            {releases.map((release) => {
              const summaryHtml = renderMarkdown(release.summary || '');
              const releaseDate = release.published_at || release.created_at;

              return (
                <div class={`timeline-item${useSection ? ' timeline-item--sections' : ''}`} id={`release-${release.version}`}>
                  <div class="timeline-marker"></div>
                  {useSection ? (
                    <>
                      <div class="timeline-sidebar">
                        <span class="timeline-version">{release.version}</span>
                        <span class="timeline-date">{formatDate(releaseDate)}</span>
                      </div>
                      <div class="timeline-content">
                        {release.title && (
                          <h2 class="timeline-release-title">{release.title}</h2>
                        )}
                        {summaryHtml && (
                          <div class="prose timeline-summary" dangerouslySetInnerHTML={{ __html: summaryHtml }} />
                        )}
                        <EntriesBySectionView entries={release.entries} />
                      </div>
                    </>
                  ) : (
                    <div class="timeline-content">
                      <div class="timeline-header">
                        <span class="timeline-version">{release.version}</span>
                        <span class="timeline-date">{formatDate(releaseDate)}</span>
                      </div>
                      {release.title && (
                        <h2 class="timeline-release-title">{release.title}</h2>
                      )}
                      {summaryHtml && (
                        <div class="prose timeline-summary" dangerouslySetInnerHTML={{ __html: summaryHtml }} />
                      )}
                      <EntriesByCategoryView entries={release.entries} />
                    </div>
                  )}
                </div>
              );
            })}

            {standaloneEntries.length > 0 && (
              <div class={`timeline-item${useSection ? ' timeline-item--sections' : ''}`} id="standalone-entries">
                <div class="timeline-marker"></div>
                {useSection ? (
                  <>
                    <div class="timeline-sidebar">
                      <span class="timeline-version">Other Updates</span>
                    </div>
                    <div class="timeline-content">
                      <EntriesBySectionView entries={standaloneEntries} />
                    </div>
                  </>
                ) : (
                  <div class="timeline-content">
                    <div class="timeline-header">
                      <span class="timeline-version">Other Updates</span>
                    </div>
                    <EntriesByCategoryView entries={standaloneEntries} />
                  </div>
                )}
              </div>
            )}
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
