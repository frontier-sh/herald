import type { FC } from 'hono/jsx';
import type { Release, EntryWithSection } from '../../db/schema';
import {
  EntriesByCategoryView,
  EntriesBySectionView,
  renderMarkdown,
} from './changelog';
import { effectiveReleaseDate, formatInZone, toIsoUtc } from '../../services/datetime';

interface ReleaseWithEntries extends Release {
  entries: EntryWithSection[];
}

interface ReleaseDetailProps {
  projectName: string;
  release: ReleaseWithEntries;
  entryGrouping?: 'category' | 'section';
  timezone?: string;
}

export const ReleaseDetail: FC<ReleaseDetailProps> = ({
  projectName,
  release,
  entryGrouping = 'category',
  timezone = 'UTC',
}) => {
  const summaryHtml = renderMarkdown(release.summary || '');
  const releaseDate = effectiveReleaseDate(release);
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
          <time class="timeline-date" datetime={toIsoUtc(releaseDate)} data-herald-date data-format="day">
            {formatInZone(releaseDate, timezone)}
          </time>
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
