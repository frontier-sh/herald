import type { FC } from 'hono/jsx';
import type { EntryWithSection } from '../../db/schema';
import { EntryCard } from '../components/entry-card';

interface DashboardProps {
  totalEntries: number;
  publishedCount: number;
  draftCount: number;
  recentEntries: EntryWithSection[];
  timezone?: string;
}

export const Dashboard: FC<DashboardProps> = ({
  totalEntries,
  publishedCount,
  draftCount,
  recentEntries,
  timezone = 'UTC',
}) => {
  return (
    <div>
      <div class="page-header">
        <h1>Dashboard</h1>
        <a href="/admin/entries/new" class="btn btn-primary">
          + New Entry
        </a>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-number">{totalEntries}</div>
          <div class="stat-label">Total Entries</div>
        </div>
        <div class="stat-card">
          <div class="stat-number stat-published">{publishedCount}</div>
          <div class="stat-label">Published</div>
        </div>
        <div class="stat-card">
          <div class="stat-number stat-draft">{draftCount}</div>
          <div class="stat-label">Drafts</div>
        </div>
      </div>

      <div class="dashboard-section">
        <div class="section-header">
          <h2>Recent Entries</h2>
          <a href="/admin/entries" class="btn btn-ghost btn-sm">
            View All &rarr;
          </a>
        </div>
        {recentEntries.length > 0 ? (
          <div class="entries-list">
            {recentEntries.map((entry) => (
              <EntryCard entry={entry} timezone={timezone} />
            ))}
          </div>
        ) : (
          <div class="empty-state">
            <h3>No entries yet</h3>
            <p>Create your first changelog entry to get started.</p>
            <a href="/admin/entries/new" class="btn btn-primary">
              + Create Entry
            </a>
          </div>
        )}
      </div>

      <div class="dashboard-section">
        <h2>Quick Actions</h2>
        <div class="quick-actions">
          <a href="/admin/entries/new" class="quick-action-card">
            <span class="quick-action-icon">
              <svg width="24" height="24" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M8 3v10M3 8h10" />
              </svg>
            </span>
            <span>New Entry</span>
          </a>
          <a href="/admin/generate" class="quick-action-card">
            <span class="quick-action-icon">
              <svg width="24" height="24" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M2 5a3 1.5 0 0 0 6 0 3 1.5 0 0 0-6 0v6a3 1.5 0 0 0 6 0V5" />
                <path d="M11.5 8.5l1.25 1.25L15 7.25" />
              </svg>
            </span>
            <span>Generate from Commits</span>
          </a>
          <a href="/admin/releases" class="quick-action-card">
            <span class="quick-action-icon">
              <svg width="24" height="24" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M1.5 3.5a2 2 0 0 1 2-2h3.672a2 2 0 0 1 1.414.586l5.828 5.828a2 2 0 0 1 0 2.828l-3.672 3.672a2 2 0 0 1-2.828 0L2.086 8.586A2 2 0 0 1 1.5 7.172V3.5z" />
                <circle cx="5" cy="5" r=".75" fill="currentColor" />
              </svg>
            </span>
            <span>Manage Releases</span>
          </a>
          <a href="/admin/settings" class="quick-action-card">
            <span class="quick-action-icon">
              <svg width="24" height="24" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M2 4h3M9 4h5M2 8h7M13 8h1M2 12h1M7 12h7" />
                <circle cx="7" cy="4" r="1.5" />
                <circle cx="11.5" cy="8" r="1.5" />
                <circle cx="4.5" cy="12" r="1.5" />
              </svg>
            </span>
            <span>Settings</span>
          </a>
        </div>
      </div>
    </div>
  );
};
