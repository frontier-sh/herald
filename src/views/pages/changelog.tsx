import type { FC } from 'hono/jsx';
import type { Release, Entry, Category } from '../../db/schema';
import { CATEGORIES } from '../../db/schema';
import { marked } from 'marked';

interface ReleaseWithEntries extends Release {
  entries: Entry[];
}

interface ChangelogProps {
  projectName: string;
  projectDescription: string;
  releases: ReleaseWithEntries[];
  standaloneEntries: Entry[];
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

function groupEntriesByCategory(entries: Entry[]): Record<string, Entry[]> {
  const grouped: Record<string, Entry[]> = {};
  for (const entry of entries) {
    if (!grouped[entry.category]) {
      grouped[entry.category] = [];
    }
    grouped[entry.category].push(entry);
  }
  return grouped;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// Collect all unique categories across releases and standalone entries
function collectCategories(releases: ReleaseWithEntries[], standaloneEntries: Entry[]): Category[] {
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

export const Changelog: FC<ChangelogProps> = ({
  projectName,
  projectDescription,
  releases,
  standaloneEntries,
}) => {
  const hasContent = releases.length > 0 || standaloneEntries.length > 0;
  const allCategories = collectCategories(releases, standaloneEntries);

  return (
    <div class="changelog">
      <div class="changelog-hero">
        <h1 class="changelog-title">{projectName}</h1>
        {projectDescription && (
          <p class="changelog-subtitle">{projectDescription}</p>
        )}
      </div>

      {hasContent && allCategories.length > 0 && (
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
              const grouped = groupEntriesByCategory(release.entries);
              const summaryHtml = renderMarkdown(release.summary || '');
              const releaseDate = release.published_at || release.created_at;

              return (
                <div class="timeline-item" id={`release-${release.version}`}>
                  <div class="timeline-marker"></div>
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
                    <div class="timeline-entries">
                      {CATEGORIES.filter((cat) => grouped[cat]).map((cat) => (
                        <div class="entry-group" data-category={cat}>
                          <h3 class="entry-group-title">
                            <span
                              class="entry-group-badge"
                              style={`background-color: ${CATEGORY_COLORS[cat].bg}; color: ${CATEGORY_COLORS[cat].text};`}
                            >
                              {cat.charAt(0).toUpperCase() + cat.slice(1)}
                            </span>
                          </h3>
                          <ul class="entry-group-list">
                            {grouped[cat].map((entry) => {
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
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}

            {standaloneEntries.length > 0 && (
              <div class="timeline-item" id="standalone-entries">
                <div class="timeline-marker"></div>
                <div class="timeline-content">
                  <div class="timeline-header">
                    <span class="timeline-version">Other Updates</span>
                  </div>
                  <div class="timeline-entries">
                    {(() => {
                      const grouped = groupEntriesByCategory(standaloneEntries);
                      return CATEGORIES.filter((cat) => grouped[cat]).map((cat) => (
                        <div class="entry-group" data-category={cat}>
                          <h3 class="entry-group-title">
                            <span
                              class="entry-group-badge"
                              style={`background-color: ${CATEGORY_COLORS[cat].bg}; color: ${CATEGORY_COLORS[cat].text};`}
                            >
                              {cat.charAt(0).toUpperCase() + cat.slice(1)}
                            </span>
                          </h3>
                          <ul class="entry-group-list">
                            {grouped[cat].map((entry) => {
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
                      ));
                    })()}
                  </div>
                </div>
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
