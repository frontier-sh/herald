import type { FC } from 'hono/jsx';
import type { ApiKey } from '../../db/schema';
import { SettingsSection } from '../components/settings-form';
import { AI_MODELS, DEFAULT_AI_MODEL, resolveModelId } from '../../services/models';

interface SettingsPageProps {
  settings: Record<string, string>;
  apiKeys: Omit<ApiKey, 'key_hash'>[];
  newKey?: string | null;
}

export const SettingsPage: FC<SettingsPageProps> = ({
  settings,
  apiKeys,
  newKey,
}) => {
  const projectName = settings['project_name'] ?? '';
  const projectDescription = settings['project_description'] ?? '';
  const autoPublish = settings['auto_publish'] === 'true';
  const aiEnabled = settings['ai_enabled'] === 'true';
  const aiModel = resolveModelId(settings['ai_model']);

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleDateString('en-US', {
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

      {/* General Section */}
      <SettingsSection
        title="General"
        description="Basic information about your changelog project."
      >
        <form method="post" action="/admin/settings/general">
          <div class="form-group">
            <label for="project_name" class="form-label">
              Project Name
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
              Project Description
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
            <button type="submit" class="btn btn-primary">
              Save Changes
            </button>
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
        description="Configure AI-powered features for changelog generation and enhancement."
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
                data-toggle-submit
              />
              <span class="toggle-slider"></span>
            </label>
          </div>

          <div class="form-group">
            <label for="ai_model" class="form-label">
              AI Model
            </label>
            <select id="ai_model" name="ai_model" class="form-select">
              {AI_MODELS.map((m) => (
                <option
                  value={m.id}
                  selected={aiModel === m.id}
                >
                  {m.label}{m.id === DEFAULT_AI_MODEL.id ? ' (Default)' : ''}
                </option>
              ))}
            </select>
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
        description="Manage API keys for programmatic access to your changelog."
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

      {/* Danger Zone */}
      <SettingsSection
        title="Danger Zone"
        description="Irreversible and destructive actions."
      >
        <div class="danger-zone-content">
          <div class="danger-zone-item">
            <div>
              <strong>Reset all data</strong>
              <p class="text-sm text-muted">
                Delete all entries, releases, and settings. This cannot be undone.
              </p>
            </div>
            <button type="button" class="btn btn-danger" disabled>
              Reset Data
            </button>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
};
