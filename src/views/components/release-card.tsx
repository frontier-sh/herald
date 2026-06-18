import type { FC } from 'hono/jsx';
import type { Release } from '../../db/schema';
import { effectiveReleaseDate, formatInZone } from '../../services/datetime';

interface ReleaseCardProps {
  release: Release & { entry_count: number };
  timezone?: string;
}

export const ReleaseCard: FC<ReleaseCardProps> = ({ release, timezone = 'UTC' }) => {
  const dateStr = formatInZone(effectiveReleaseDate(release), timezone, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const summaryExcerpt =
    release.summary && release.summary.length > 120
      ? release.summary.substring(0, 120) + '...'
      : release.summary || '';

  return (
    <a href={`/admin/releases/${release.id}`} class="release-card">
      <div class="release-card-header">
        <span class="release-card-version">{release.version}</span>
        <div class="release-card-badges">
          <span class={`badge badge-${release.status}`}>{release.status}</span>
        </div>
      </div>
      {release.title && (
        <h3 class="release-card-title">{release.title}</h3>
      )}
      {summaryExcerpt && (
        <p class="release-card-summary">{summaryExcerpt}</p>
      )}
      <div class="release-card-meta">
        <span class="release-card-entries">
          {release.entry_count} {release.entry_count === 1 ? 'entry' : 'entries'}
        </span>
        <span class="release-card-date">{dateStr}</span>
      </div>
    </a>
  );
};
