import type { FC } from 'hono/jsx';
import type { EntryWithSection, Category, EntryStatus } from '../../db/schema';
import { CATEGORIES } from '../../db/schema';
import { EntryCard } from '../components/entry-card';

interface EntriesListProps {
  entries: EntryWithSection[];
  statusFilter?: string;
  categoryFilter?: string;
  timezone?: string;
}

export const EntriesList: FC<EntriesListProps> = ({
  entries,
  statusFilter = '',
  categoryFilter = '',
  timezone = 'UTC',
}) => {
  return (
    <div>
      <div class="page-header">
        <h1>Entries</h1>
        <a href="/admin/entries/new" class="btn btn-primary">
          + New Entry
        </a>
      </div>

      <div class="filter-bar">
        <form method="get" action="/admin/entries" class="filter-form">
          <div class="filter-group">
            <label for="status" class="form-label text-sm">Status</label>
            <select id="status" name="status" class="form-select form-select-sm" onchange="this.form.submit()">
              <option value="">All Statuses</option>
              <option value="draft" selected={statusFilter === 'draft'}>Draft</option>
              <option value="published" selected={statusFilter === 'published'}>Published</option>
            </select>
          </div>
          <div class="filter-group">
            <label for="category" class="form-label text-sm">Category</label>
            <select id="category" name="category" class="form-select form-select-sm" onchange="this.form.submit()">
              <option value="">All Categories</option>
              {CATEGORIES.map((cat) => (
                <option value={cat} selected={categoryFilter === cat}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </form>
      </div>

      {entries.length > 0 ? (
        <div class="entries-list">
          {entries.map((entry) => (
            <EntryCard entry={entry} timezone={timezone} />
          ))}
        </div>
      ) : (
        <div class="empty-state">
          <h3>No entries found</h3>
          <p>
            {statusFilter || categoryFilter
              ? 'No entries match the current filters. Try adjusting your filters or create a new entry.'
              : 'Create your first changelog entry to get started.'}
          </p>
          <a href="/admin/entries/new" class="btn btn-primary">
            + Create Entry
          </a>
        </div>
      )}
    </div>
  );
};
