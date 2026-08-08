import type { FC } from 'hono/jsx';
import type { App } from '../../db/schema';
import { appBasePath } from '../../services/apps';

interface AppEditProps {
  /** Omitted when creating a new app. */
  app?: App;
  baseUrl: string;
}

export const AppEdit: FC<AppEditProps> = ({ app, baseUrl }) => {
  const isEditing = !!app;
  const pageTitle = isEditing ? 'Edit App' : 'New App';
  const action = isEditing ? `/admin/apps/${app!.id}` : '/admin/apps';
  const publicUrl = app ? `${baseUrl}${appBasePath(app)}` : `${baseUrl}/your-slug`;

  return (
    <div>
      <nav class="breadcrumb">
        <a href="/admin/apps">Apps</a>
        <span class="breadcrumb-sep">/</span>
        <span>{pageTitle}</span>
      </nav>

      <div class="page-header">
        <h1>{pageTitle}</h1>
      </div>

      <form method="post" action={action} class="app-form">
        <div class="form-group">
          <label for="name" class="form-label">
            Name <span class="text-danger">*</span>
          </label>
          <input
            type="text"
            id="name"
            name="name"
            class="form-input"
            placeholder="My Product"
            value={app?.name ?? ''}
            data-slug-source
            required
          />
          <span class="form-hint">
            Shown in the admin, on the public changelog and in Slack messages.
          </span>
        </div>

        <div class="form-group">
          <label for="slug" class="form-label">
            URL slug <span class="text-danger">*</span>
          </label>
          <input
            type="text"
            id="slug"
            name="slug"
            class="form-input"
            placeholder="my-product"
            value={app?.slug ?? ''}
            autocomplete="off"
            autocapitalize="off"
            spellcheck={false}
            data-slug-target
            data-slug-locked={isEditing ? 'true' : undefined}
          />
          <span class="form-hint">
            Lowercase letters, numbers and hyphens. The changelog will be served at{' '}
            <code>{publicUrl}</code>
            {app?.is_default ? ' — this app is the default, so it is served at the site root and the slug only redirects there.' : '.'}
          </span>
          {isEditing && (
            <span class="form-hint app-slug-warning">
              Changing the slug changes the public URLs of this changelog. Existing
              links, RSS subscriptions and embeds pointing at the old slug will break.
            </span>
          )}
        </div>

        <div class="form-group">
          <label for="description" class="form-label">
            Description <span class="form-hint-inline">(optional)</span>
          </label>
          <textarea
            id="description"
            name="description"
            class="form-textarea"
            rows={3}
            placeholder="A brief description of this product..."
          >
            {app?.description ?? ''}
          </textarea>
        </div>

        {!isEditing && (
          <div class="form-group">
            <label
              class="form-label"
              style="display:flex; align-items:center; gap:0.5rem; cursor:pointer; font-weight:normal;"
            >
              <input type="checkbox" name="switch_to" value="true" checked />
              Switch to this app after creating it
            </label>
          </div>
        )}

        <div class="settings-section-footer">
          <button type="submit" class="btn btn-primary">
            {isEditing ? 'Save Changes' : 'Create App'}
          </button>
          <a href="/admin/apps" class="btn btn-secondary">
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
};
