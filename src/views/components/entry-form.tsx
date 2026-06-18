import type { FC } from 'hono/jsx';
import type { EntryWithSection, Section } from '../../db/schema';
import { CATEGORIES } from '../../db/schema';
import { effectiveEntryDate, toDatetimeLocalValue } from '../../services/datetime';

interface EntryFormProps {
  entry?: EntryWithSection;
  sections?: Section[];
  action: string;
  /** When AI features are enabled, offer an "Auto (AI decides)" category. */
  aiEnabled?: boolean;
  /** Configured default timezone; the date field is shown/edited in this zone. */
  timezone?: string;
}

export const EntryForm: FC<EntryFormProps> = ({
  entry,
  sections = [],
  action,
  aiEnabled = false,
  timezone = 'UTC',
}) => {
  const isEditing = !!entry;
  const dateValue = entry ? toDatetimeLocalValue(effectiveEntryDate(entry), timezone) : '';

  return (
    <form method="post" action={action} class="entry-form" id="entry-form">
      <div class="form-group">
        <label for="title" class="form-label">
          Title <span class="text-danger">*</span>
        </label>
        <input
          type="text"
          id="title"
          name="title"
          class="form-input"
          required
          placeholder="What changed?"
          value={entry?.title ?? ''}
        />
      </div>

      <div class="form-row">
        <div class="form-group form-group-half">
          <label for="section-input" class="form-label">
            Section
          </label>
          <div class="section-combo" id="section-combo">
            <input
              type="text"
              id="section-input"
              class="form-input"
              placeholder="e.g. Core, Desktop, API"
              value={entry?.section_name ?? ''}
              autocomplete="off"
            />
            <input type="hidden" id="section-name" name="section_name" value={entry?.section_name ?? ''} />
            <div class="section-combo-dropdown" id="section-dropdown" style="display: none;">
              {/* Populated by JS */}
            </div>
          </div>
          <p class="form-hint">Optional. Type to pick or create a section.</p>
          <script
            type="application/json"
            id="section-data"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(sections.map((s) => s.name)).replace(/<\//g, '<\\/'),
            }}
          />
        </div>

        <div class="form-group form-group-half">
          <label for="category" class="form-label">
            Category
          </label>
          <select id="category" name="category" class="form-select">
            {aiEnabled && (
              <option value="" selected={!isEditing}>
                Auto (AI decides)
              </option>
            )}
            {CATEGORIES.map((cat) => (
              <option
                value={cat}
                selected={entry?.category === cat}
              >
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </option>
            ))}
          </select>
          {aiEnabled && (
            <p class="form-hint">Leave on Auto to let AI pick the category.</p>
          )}
        </div>
      </div>

      <div class="form-group">
        <label for="entry_date" class="form-label">
          Date
        </label>
        <input
          type="datetime-local"
          id="entry_date"
          name="entry_date"
          class="form-input"
          value={dateValue}
        />
        <p class="form-hint">
          When this change happened. Shown and grouped on your public changelog. Times are in {timezone}.
        </p>
      </div>

      <div class="form-group">
        <label for="content-editor" class="form-label">
          Content
        </label>
        <textarea
          id="content-editor"
          name="content_raw"
          class="form-textarea"
          rows={10}
          placeholder="Describe the change in detail... (Markdown supported)"
        >
          {entry?.content ?? ''}
        </textarea>
        <input type="hidden" id="content-hidden" name="content" value={entry?.content ?? ''} />
      </div>

      <div class="form-actions">
        <div class="form-actions-left">
          {isEditing && (
            <button
              type="button"
              class="btn btn-danger"
              data-delete-url={`/admin/entries/${entry!.id}/delete`}
              id="delete-btn"
            >
              Delete
            </button>
          )}
        </div>
        <div class="form-actions-right">
          <a href="/admin/entries" class="btn btn-secondary">Cancel</a>
          <button type="submit" name="status" value="draft" class="btn btn-secondary">
            Save Draft
          </button>
          <button type="submit" name="status" value="published" class="btn btn-primary">
            Publish
          </button>
        </div>
      </div>
    </form>
  );
};
