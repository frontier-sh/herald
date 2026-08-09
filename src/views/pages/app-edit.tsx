import type { FC } from 'hono/jsx';
import type { App } from '../../db/schema';
import { SettingsSection } from '../components/settings-form';
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
  // The preview follows the slug field only where the slug actually shapes the
  // URL — the default app is served at the site root whatever its slug says.
  const livePreview = !app?.is_default;

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

      <SettingsSection
        title="App details"
        description={
          isEditing
            ? 'The name, URL and description of this changelog.'
            : 'The name, URL and description of the new changelog.'
        }
      >
        <form method="post" action={action}>
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
            <p class="form-hint">
              Shown in the admin, on the public changelog and in Slack messages.
            </p>
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
            <p class="form-hint">
              Lowercase letters, numbers and hyphens. The changelog is served at:
            </p>
            <code
              class="settings-code"
              data-slug-preview={livePreview ? baseUrl : undefined}
              data-slug-placeholder={livePreview ? 'your-slug' : undefined}
            >
              {publicUrl}
            </code>
            {app?.is_default && (
              <p class="form-hint">
                This app is the default, so it is served at the site root and the
                slug only redirects there.
              </p>
            )}
          </div>

          {isEditing && (
            <div class="alert alert-warning" role="alert">
              Changing the slug changes the public URLs of this changelog. Existing
              links, RSS subscriptions and embeds pointing at the old slug will break.
            </div>
          )}

          <div class="form-group">
            <label for="description" class="form-label">
              Description
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
            <p class="form-hint">Optional. Shown on the public changelog.</p>
          </div>

          {!isEditing && (
            <div class="settings-toggle-row">
              <div class="settings-toggle-info">
                <span class="settings-toggle-label">Switch to this app</span>
                <span class="settings-toggle-hint">
                  Make this the app the admin acts on as soon as it is created.
                </span>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" name="switch_to" value="true" checked />
                <span class="toggle-slider"></span>
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
      </SettingsSection>
    </div>
  );
};
