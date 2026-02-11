import type { FC } from 'hono/jsx';
import type { Entry } from '../../db/schema';
import { CATEGORIES } from '../../db/schema';

interface EntryFormProps {
  entry?: Entry;
  action: string;
}

export const EntryForm: FC<EntryFormProps> = ({ entry, action }) => {
  const isEditing = !!entry;

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
          <label for="version" class="form-label">
            Version
          </label>
          <input
            type="text"
            id="version"
            name="version"
            class="form-input"
            placeholder="e.g. 1.2.0"
            value={entry?.version ?? ''}
          />
          <p class="form-hint">Optional. Semantic version for this entry.</p>
        </div>

        <div class="form-group form-group-half">
          <label for="category" class="form-label">
            Category
          </label>
          <select id="category" name="category" class="form-select">
            {CATEGORIES.map((cat) => (
              <option
                value={cat}
                selected={entry?.category === cat}
              >
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </option>
            ))}
          </select>
        </div>
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
