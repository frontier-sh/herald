import type { FC } from 'hono/jsx';
import type { App } from '../../db/schema';
import { SettingsSection } from '../components/settings-form';
import { slugify } from '../../services/apps';

/**
 * Values as they were submitted, echoed back when a submit is rejected so the
 * user never loses what they typed. Every field is the raw request value, not a
 * normalised one — they are looking at their own input and fixing it.
 */
export interface AppFormValues {
  name: string;
  slug: string;
  description: string;
  /** Create form only: state of the "switch to this app" toggle. */
  switchTo: boolean;
}

interface AppEditProps {
  /** Omitted when creating a new app. */
  app?: App;
  baseUrl: string;
  /** Present only on a re-render after a failed submit. */
  values?: AppFormValues;
}

export const AppEdit: FC<AppEditProps> = ({ app, baseUrl, values }) => {
  const isEditing = !!app;
  const nameValue = values ? values.name : (app?.name ?? '');
  const slugValue = values ? values.slug : (app?.slug ?? '');
  const descriptionValue = values ? values.description : (app?.description ?? '');
  const switchToChecked = values ? values.switchTo : true;
  const pageTitle = isEditing ? 'Edit App' : 'New App';
  const action = isEditing ? `/admin/apps/${app!.id}` : '/admin/apps';
  // Preview the slug as submitted after a failed submit, so it agrees with the
  // field the user is looking at rather than with the stored app.
  const previewSlug = values ? slugify(values.slug) : (app?.slug ?? '');
  const publicUrl = app?.is_default
    ? baseUrl
    : `${baseUrl}/${previewSlug || 'your-slug'}`;
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
              value={nameValue}
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
              value={slugValue}
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
              {descriptionValue}
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
                <input
                  type="checkbox"
                  name="switch_to"
                  value="true"
                  checked={switchToChecked}
                />
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
