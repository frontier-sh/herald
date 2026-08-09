import type { FC } from 'hono/jsx';
import type { App, ApiKey } from '../../db/schema';
import { SettingsSection } from '../components/settings-form';
import { ScopeBanner } from '../components/scope-banner';
import { SlackSettings } from '../components/slack-settings';
import { formatInZone } from '../../services/datetime';
import { appBasePath } from '../../services/apps';

interface AppSettingsPageProps {
  /** The app every setting on this page belongs to. */
  app: App;
  /** Origin of the current request, used to show the app's public URL. */
  baseUrl: string;
  /** The current app's settings (app_settings). */
  settings: Record<string, string>;
  apiKeys: Omit<ApiKey, 'key_hash'>[];
  newKey?: string | null;
}

/**
 * Settings that belong to a single app. Install-wide settings live on their
 * own page, {@link ../pages/instance-settings-page InstanceSettingsPage}.
 */
export const AppSettingsPage: FC<AppSettingsPageProps> = ({
  app,
  baseUrl,
  settings,
  apiKeys,
  newKey,
}) => {
  const sourceRepo = settings['source_repo'] || '';
  const autoPublish = settings['auto_publish'] === 'true';
  const aiEnabled = settings['ai_enabled'] === 'true';
  const aiPersonality = settings['ai_personality'] || 'neutral';
  const timezone = settings['timezone'] || 'UTC';
  const slackConnected = (settings['slack_webhook_url'] ?? '') !== '';
  // Absence of the flag means "on" — saving a URL enables notifications.
  const slackEnabled = settings['slack_notifications_enabled'] !== 'false';
  const projectName = settings['project_name'] || app.name;
  const projectDescription = settings['project_description'] || '';
  const publicUrl = `${baseUrl}${appBasePath(app) || '/'}`;
  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return 'Never';
    return formatInZone(dateStr, timezone, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div>
      <div class="page-header">
        <h1>Settings</h1>
      </div>

      <ScopeBanner
        variant="app"
        badge={app.name}
        title={`These settings apply only to ${app.name}`}
        note="Every other app on this install keeps its own values. Switch apps in the sidebar to change theirs."
        url={publicUrl}
      />

      {/* Everything inside the accented group belongs to the app named above. */}
      <div class="scope-group">
        {/* App details */}
        <SettingsSection
          title="App details"
          description="The name and description shown on this app's public changelog."
        >
          <form method="post" action="/admin/settings/general">
            <div class="form-group">
              <label for="project_name" class="form-label">
                Name
              </label>
              <input
                type="text"
                id="project_name"
                name="project_name"
                class="form-input"
                placeholder="My Project"
                value={projectName}
              />
            </div>
            <div class="form-group">
              <label for="project_description" class="form-label">
                Description
              </label>
              <textarea
                id="project_description"
                name="project_description"
                class="form-textarea"
                rows={3}
                placeholder="A brief description of your project..."
              >
                {projectDescription}
              </textarea>
            </div>
            <div class="settings-section-footer">
              <button type="submit" class="btn btn-primary">Save</button>
              <a href={`/admin/apps/${app.id}`} class="btn btn-secondary">
                Change URL slug
              </a>
            </div>
          </form>
        </SettingsSection>

        {/* Source Repository */}
        <SettingsSection
          title="Generate from commits"
          description="The GitHub repository this app drafts changelog entries from."
        >
          <form method="post" action="/admin/settings/source-repo">
            <div class="form-group">
              <label for="source_repo" class="form-label">Repository</label>
              <input
                type="text"
                id="source_repo"
                name="source_repo"
                class="form-input"
                placeholder="owner/repo"
                value={sourceRepo}
                autocomplete="off"
                autocapitalize="off"
                spellcheck={false}
              />
              <span class="settings-toggle-hint">
                Each app reads its own repository. The token used to read it is shared
                by the whole install — see <a href="/admin/settings/instance">Instance settings</a>.
              </span>
            </div>
            <div class="settings-section-footer">
              <button type="submit" class="btn btn-primary">Save</button>
            </div>
          </form>
        </SettingsSection>

        {/* Publishing Section */}
        <SettingsSection
          title="Publishing"
          description="Control how entries are published when received via API or webhook."
        >
          <form method="post" action="/admin/settings/publishing">
            <div class="settings-toggle-row">
              <div class="settings-toggle-info">
                <span class="settings-toggle-label">Auto-publish entries</span>
                <span class="settings-toggle-hint">
                  When enabled, entries received via the API or webhook will be published automatically instead of being saved as drafts.
                </span>
              </div>
              <label class="toggle-switch">
                <input
                  type="checkbox"
                  name="auto_publish"
                  value="true"
                  checked={autoPublish}
                  data-toggle-submit
                />
                <span class="toggle-slider"></span>
              </label>
            </div>
            <noscript>
              <div class="mt-4">
                <button type="submit" class="btn btn-primary btn-sm">
                  Save
                </button>
              </div>
            </noscript>
          </form>
        </SettingsSection>

        {/* AI Section */}
        <SettingsSection
          title="AI"
          description="Use Workers AI to rewrite this app's entries as they arrive."
        >
          <form method="post" action="/admin/settings/ai">
            <div class="settings-toggle-row mb-4">
              <div class="settings-toggle-info">
                <span class="settings-toggle-label">Enable AI features</span>
                <span class="settings-toggle-hint">
                  Use Workers AI to generate summaries, improve content, and categorize entries.
                </span>
              </div>
              <label class="toggle-switch">
                <input
                  type="checkbox"
                  name="ai_enabled"
                  value="true"
                  checked={aiEnabled}
                />
                <span class="toggle-slider"></span>
              </label>
            </div>

            <div id="ai-options" style={aiEnabled ? '' : 'display: none;'}>
              <div class="form-group">
                <label for="ai_personality" class="form-label">
                  Personality
                </label>
                <select id="ai_personality" name="ai_personality" class="form-select">
                  <option value="neutral" selected={aiPersonality === 'neutral'}>Neutral</option>
                  <option value="professional" selected={aiPersonality === 'professional'}>Professional</option>
                  <option value="casual" selected={aiPersonality === 'casual'}>Casual</option>
                </select>
                <span class="settings-toggle-hint">
                  The tone AI writes this app's entries in. The model itself is chosen
                  once for the whole install, under{' '}
                  <a href="/admin/settings/instance">Instance settings</a>.
                </span>
              </div>

              <div class="settings-section-footer">
                <button type="submit" class="btn btn-primary">
                  Save AI Settings
                </button>
                <button
                  type="button"
                  class="btn btn-secondary"
                  id="ai-test-btn"
                >
                  Test AI
                </button>
              </div>
            </div>
          </form>

          <div id="ai-test-result" class="ai-test-result" style="display: none;">
            <div class="ai-test-result-header">
              <strong>AI Test Result</strong>
            </div>
            <div id="ai-test-output" class="ai-test-result-body">
            </div>
          </div>
        </SettingsSection>

        {/* API Keys Section */}
        <SettingsSection
          title="API Keys"
          description={`Keys for programmatic access. Every key below writes to ${app.name} and no other app.`}
        >
          {/* New key alert */}
          {newKey && (
            <div class="api-key-created-alert" role="alert">
              <div class="api-key-created-header">
                <strong>API Key Created Successfully</strong>
              </div>
              <p class="api-key-created-warning">
                Copy this key now. It will not be shown again.
              </p>
              <div class="api-key-created-value">
                <code id="new-api-key">{newKey}</code>
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  data-copy-target="new-api-key"
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          {/* Create new key form */}
          <form
            method="post"
            action="/admin/settings/keys"
            class="api-key-create-form"
          >
            <div class="api-key-create-row">
              <input
                type="text"
                name="name"
                class="form-input"
                placeholder="Key name (e.g. CI/CD Pipeline)"
                required
              />
              <button type="submit" class="btn btn-primary">
                Create Key
              </button>
            </div>
          </form>

          {/* Key list */}
          {apiKeys.length > 0 ? (
            <div class="table-container mt-4">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Created</th>
                    <th>Last Used</th>
                    <th class="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {apiKeys.map((apiKey) => (
                    <tr>
                      <td>
                        <strong>{apiKey.name}</strong>
                      </td>
                      <td class="text-muted text-sm">
                        {formatDate(apiKey.created_at)}
                      </td>
                      <td class="text-muted text-sm">
                        {formatDate(apiKey.last_used_at)}
                      </td>
                      <td class="text-right">
                        <button
                          type="button"
                          class="btn btn-danger btn-sm"
                          data-delete-key-url={`/admin/settings/keys/${apiKey.id}/delete`}
                          data-delete-key-name={apiKey.name}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p class="text-muted text-sm mt-4">
              No API keys created yet. Create one to get started with the API.
            </p>
          )}
        </SettingsSection>

        {/* Slack Section */}
        <SettingsSection
          title="Slack"
          description="Post a message to a Slack channel whenever this app publishes an update."
        >
          <SlackSettings
            connected={slackConnected}
            enabled={slackEnabled}
            projectName={projectName}
          />
        </SettingsSection>
      </div>
    </div>
  );
};
