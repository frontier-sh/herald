import type { FC } from 'hono/jsx';
import { SettingsSection } from '../components/settings-form';
import { ScopeBanner } from '../components/scope-banner';
import { AI_MODELS, DEFAULT_AI_MODEL, resolveModelId } from '../../services/models';

interface InstanceSettingsPageProps {
  /** Name of the app the admin is currently in, for the scope note. */
  appName: string;
  /** Install-wide settings (settings) — currently just the AI model. */
  globalSettings: Record<string, string>;
  // Whether a source PAT is stored. The token itself is encrypted and never
  // sent to the client, so the page only knows that one exists.
  hasGithubToken?: boolean;
  /** Repository that gates admin sign-in (the GitHub App's allowed repo). */
  githubRepo?: string | null;
}

/**
 * Settings shared by every app on this Herald install. Per-app settings live
 * on their own page, {@link ../pages/settings-page AppSettingsPage}.
 */
export const InstanceSettingsPage: FC<InstanceSettingsPageProps> = ({
  appName,
  globalSettings,
  hasGithubToken = false,
  githubRepo = null,
}) => {
  const aiModel = resolveModelId(globalSettings['ai_model']);

  return (
    <div>
      <div class="page-header">
        <h1>Instance Settings</h1>
      </div>

      <ScopeBanner
        variant="instance"
        badge="All apps"
        title="Instance settings — applied to every app on this Herald install"
        note={`Changing anything below affects all changelogs, ${appName} included.`}
      />

      {/* GitHub access */}
      <SettingsSection
        title="GitHub access"
        description="The GitHub App that gates admin sign-in, and the token Herald uses to read commits."
      >
        <div class="form-group">
          <label class="form-label">Admin repository</label>
          <p class="form-hint">
            {githubRepo
              ? 'Anyone with access to this repository can sign in to the Herald admin.'
              : 'No repository connected yet — run setup to connect the GitHub App.'}
          </p>
          <code class="settings-code">{githubRepo || 'Not connected'}</code>
        </div>

        <form method="post" action="/admin/settings/source-repo">
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
              access to the repositories your apps generate from, or a classic
              token with the <code>repo</code> scope.{' '}
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

      {/* AI model */}
      <SettingsSection
        title="AI model"
        description="The Workers AI model every app on this install writes with."
      >
        {/* Shares POST /admin/settings/ai with the per-app AI form; the handler
            tells them apart by the ai_model field this form alone submits. */}
        <form method="post" action="/admin/settings/ai">
          <div class="form-group">
            <label for="ai_model" class="form-label">
              Model
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
            <button type="submit" class="btn btn-primary">Save</button>
          </div>
        </form>
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
