import type { FC } from 'hono/jsx';
import type { Release, EntryWithSection } from '../../db/schema';
import {
  EntriesByCategoryView,
  EntriesBySectionView,
  formatDate,
  renderMarkdown,
} from './changelog';

interface ReleaseWithEntries extends Release {
  entries: EntryWithSection[];
}

interface ReleaseDetailProps {
  projectName: string;
  release: ReleaseWithEntries;
  entryGrouping?: 'category' | 'section';
}

export const ReleaseDetail: FC<ReleaseDetailProps> = ({
  projectName,
  release,
  entryGrouping = 'category',
}) => {
  const summaryHtml = renderMarkdown(release.summary || '');
  const releaseDate = release.published_at || release.created_at;
  const useSection = entryGrouping === 'section';

  return (
    <div class="changelog">
      <nav class="release-detail-breadcrumb" aria-label="Breadcrumb">
        <a href="/">{projectName}</a>
        <span aria-hidden="true"> / </span>
        <span>{release.version}</span>
      </nav>

      <article class="release-detail">
        <header class="release-detail-header">
          <span class="timeline-version">{release.version}</span>
          <span class="timeline-date">{formatDate(releaseDate)}</span>
          {release.title && (
            <h1 class="release-detail-title">{release.title}</h1>
          )}
        </header>

        {summaryHtml && (
          <div
            class="prose timeline-summary"
            dangerouslySetInnerHTML={{ __html: summaryHtml }}
          />
        )}

        {release.entries.length > 0 ? (
          useSection ? (
            <EntriesBySectionView entries={release.entries} />
          ) : (
            <EntriesByCategoryView entries={release.entries} />
          )
        ) : (
          <p class="release-detail-empty">No entries in this release.</p>
        )}
      </article>
    </div>
  );
};
