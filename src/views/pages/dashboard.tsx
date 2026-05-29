import type { FC } from 'hono/jsx';
import type { EntryWithSection } from '../../db/schema';
import { EntryCard } from '../components/entry-card';

interface DashboardProps {
  totalEntries: number;
  publishedCount: number;
  draftCount: number;
  recentEntries: EntryWithSection[];
}

export const Dashboard: FC<DashboardProps> = ({
  totalEntries,
  publishedCount,
  draftCount,
  recentEntries,
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
              <EntryCard entry={entry} />
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
            <span class="quick-action-icon">+</span>
            <span>New Entry</span>
          </a>
          <a href="/admin/generate" class="quick-action-card">
            <span class="quick-action-icon">{'\u2728'}</span>
            <span>Generate from Commits</span>
          </a>
          <a href="/admin/releases" class="quick-action-card">
            <span class="quick-action-icon">{'\u2696'}</span>
            <span>Manage Releases</span>
          </a>
          <a href="/admin/settings" class="quick-action-card">
            <span class="quick-action-icon">{'\u2699'}</span>
            <span>Settings</span>
          </a>
        </div>
      </div>
    </div>
  );
};
