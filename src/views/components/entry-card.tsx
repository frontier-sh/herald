import type { FC } from 'hono/jsx';
import type { EntryWithSection } from '../../db/schema';
import { CategoryBadge } from './category-badge';

interface EntryCardProps {
  entry: EntryWithSection;
}

const AiStatusIndicator: FC<{ status: string | null }> = ({ status }) => {
  if (!status) return null;

  switch (status) {
    case 'pending':
      return <span class="ai-badge ai-badge-pending">AI Processing...</span>;
    case 'processing':
      return <span class="ai-badge ai-badge-processing">AI Generating...</span>;
    case 'completed':
      return <span class="ai-badge ai-badge-completed">AI Generated</span>;
    case 'failed':
      return <span class="ai-badge ai-badge-failed">AI Failed</span>;
    default:
      return null;
  }
};

export const EntryCard: FC<EntryCardProps> = ({ entry }) => {
  const dateStr = entry.published_at
    ? new Date(entry.published_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : new Date(entry.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });

  return (
    <a href={`/admin/entries/${entry.id}`} class="entry-card">
      <div class="entry-card-header">
        <h3 class="entry-card-title">{entry.title}</h3>
        <div class="entry-card-badges">
          <AiStatusIndicator status={entry.ai_status} />
          <CategoryBadge category={entry.category} />
          <span class={`badge badge-${entry.status}`}>{entry.status}</span>
        </div>
      </div>
      <div class="entry-card-meta">
        {entry.section_name && (
          <span class="entry-card-section">{entry.section_name}</span>
        )}
        <span class="entry-card-date">{dateStr}</span>
        <span class="entry-card-source">{entry.source}</span>
      </div>
    </a>
  );
};
