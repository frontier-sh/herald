import type { FC } from 'hono/jsx';
import type { EntryWithSection, Section } from '../../db/schema';
import { EntryForm } from '../components/entry-form';

interface EntryEditProps {
  entry?: EntryWithSection;
  sections?: Section[];
  /** When AI features are enabled, the category field offers an "Auto" option. */
  aiEnabled?: boolean;
}

const AiStatusBadge: FC<{ status: string | null }> = ({ status }) => {
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

export const EntryEdit: FC<EntryEditProps> = ({ entry, sections = [], aiEnabled = false }) => {
  const isEditing = !!entry;
  const pageTitle = isEditing ? 'Edit Entry' : 'New Entry';
  const action = isEditing ? `/admin/entries/${entry!.id}` : '/admin/entries';

  return (
    <div>
      <nav class="breadcrumb">
        <a href="/admin/entries">Entries</a>
        <span class="breadcrumb-sep">/</span>
        <span>{pageTitle}</span>
      </nav>

      <div class="page-header">
        <div class="flex items-center gap-4">
          <h1>{pageTitle}</h1>
          {isEditing && <AiStatusBadge status={entry!.ai_status} />}
        </div>
        <div class="flex gap-2">
          {isEditing && (entry!.ai_status === 'completed' || entry!.ai_status === 'failed' || entry!.raw_content) && (
            <form method="post" action={`/admin/entries/${entry!.id}/regenerate`} style="margin: 0;">
              <button type="submit" class="btn btn-secondary btn-sm ai-regenerate-btn">
                Regenerate with AI
              </button>
            </form>
          )}
          {isEditing && entry!.status === 'draft' && (
            <form method="post" action={`/admin/entries/${entry!.id}/publish`} style="margin: 0;">
              <button type="submit" class="btn btn-primary btn-sm">
                Publish
              </button>
            </form>
          )}
        </div>
      </div>

      <EntryForm entry={entry} sections={sections} action={action} aiEnabled={aiEnabled} />

      {isEditing && entry!.raw_content && (
        <details class="ai-original-content">
          <summary class="ai-original-content-toggle">
            Original Content
          </summary>
          <div class="ai-original-content-body">
            <pre class="ai-original-content-pre">{entry!.raw_content}</pre>
          </div>
        </details>
      )}
    </div>
  );
};
