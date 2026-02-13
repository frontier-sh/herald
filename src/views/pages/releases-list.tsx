import type { FC } from 'hono/jsx';
import type { Release } from '../../db/schema';
import { ReleaseCard } from '../components/release-card';

interface ReleasesListProps {
  releases: (Release & { entry_count: number })[];
  statusFilter?: string;
}

export const ReleasesList: FC<ReleasesListProps> = ({
  releases,
  statusFilter = '',
}) => {
  return (
    <div>
      <div class="page-header">
        <h1>Releases</h1>
        <a href="/admin/releases/new" class="btn btn-primary">
          + New Release
        </a>
      </div>

      <div class="filter-bar">
        <form method="get" action="/admin/releases" class="filter-form">
          <div class="filter-group">
            <label for="status" class="form-label text-sm">Status</label>
            <select id="status" name="status" class="form-select form-select-sm" onchange="this.form.submit()">
              <option value="">All Statuses</option>
              <option value="draft" selected={statusFilter === 'draft'}>Draft</option>
              <option value="published" selected={statusFilter === 'published'}>Published</option>
            </select>
          </div>
        </form>
      </div>

      {releases.length > 0 ? (
        <div class="releases-list">
          {releases.map((release) => (
            <ReleaseCard release={release} />
          ))}
        </div>
      ) : (
        <div class="empty-state">
          <h3>No releases found</h3>
          <p>
            {statusFilter
              ? 'No releases match the current filter. Try adjusting your filter or create a new release.'
              : 'Create your first release to group entries into a versioned changelog.'}
          </p>
          <a href="/admin/releases/new" class="btn btn-primary">
            + Create Release
          </a>
        </div>
      )}
    </div>
  );
};
