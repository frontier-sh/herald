import type { FC } from 'hono/jsx';
import type { ApiKey } from '../../db/schema';
import { SettingsSection } from '../components/settings-form';
import { SlackSettings } from '../components/slack-settings';
import { AI_MODELS, DEFAULT_AI_MODEL, resolveModelId } from '../../services/models';
import { formatInZone } from '../../services/datetime';

interface SettingsPageProps {
  settings: Record<string, string>;
  apiKeys: Omit<ApiKey, 'key_hash'>[];
  newKey?: string | null;
  // Whether a source PAT is stored. The token itself is encrypted and never
  // sent to the client, so the page only knows that one exists.
  hasGithubToken?: boolean;
}

export const SettingsPage: FC<SettingsPageProps> = ({
  settings,
  apiKeys,
  newKey,
  hasGithubToken = false,
}) => {
  const sourceRepo = settings['source_repo'] || '';
  const autoPublish = settings['auto_publish'] === 'true';
  const aiEnabled = settings['ai_enabled'] === 'true';
  const aiModel = resolveModelId(settings['ai_model']);
  const aiPersonality = settings['ai_personality'] || 'neutral';
  const timezone = settings['timezone'] || 'UTC';
  const slackConnected = (settings['slack_webhook_url'] ?? '') !== '';
  // Absence of the flag means "on" — saving a URL enables notifications.
  const slackEnabled = settings['slack_notifications_enabled'] !== 'false';
  const projectName = settings['project_name'] || '';
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

      {/* Source Repository Section */}
      <SettingsSection
        title="Generate from commits"
        description="Read commits from a GitHub repository to draft changelog entries. Set the repository and a personal access token with read-only access to it."
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
          </div>
          <div class="form-group">
            <label for="github_pat" class="form-label">GitHub token</label>
            <input
              type="password"
              id="github_pat"
              name="github_pat"
              class="form-input"
              placeholder={hasGithubToken ? '•••••••• (leave blank to keep current)' : 'github_pat_… or ghp_…'}
              autocomplete="off"
            />
            <span class="settings-toggle-hint">
              A fine-grained token with read-only <strong>Contents</strong>{' '}
              access to the repository, or a classic token with the{' '}
              <code>repo</code> scope.{' '}
              {hasGithubToken
                ? 'A token is currently saved.'
                : 'No token saved yet.'}
            </span>
            {hasGithubToken && (
              <label class="settings-toggle-hint" style="display:flex; align-items:center; gap:0.5rem; margin-top:0.5rem; cursor:pointer;">
                <input type="checkbox" name="clear_github_pat" value="true" />
                Remove the saved token
              </label>
            )}
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
              />
              <span class="toggle-slider"></span>
            </label>
          </div>

          <div id="ai-options" style={aiEnabled ? '' : 'display: none;'}>
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

            <div class="form-group">
              <label for="ai_personality" class="form-label">
                Personality
              </label>
              <select id="ai_personality" name="ai_personality" class="form-select">
                <option value="neutral" selected={aiPersonality === 'neutral'}>Neutral</option>
                <option value="professional" selected={aiPersonality === 'professional'}>Professional</option>
                <option value="casual" selected={aiPersonality === 'casual'}>Casual</option>
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

      {/* Slack Section */}
      <SettingsSection
        title="Slack"
        description="Post a message to a Slack channel whenever an update is published."
      >
        <SlackSettings
          connected={slackConnected}
          enabled={slackEnabled}
          projectName={projectName}
        />
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
