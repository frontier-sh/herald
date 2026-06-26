import type { FC } from 'hono/jsx';
import { SlackLogo } from './slack-logo';

interface SlackSettingsProps {
  connected: boolean;
  /** Whether notifications are active (the pause toggle). Only meaningful when connected. */
  enabled: boolean;
  /** Suggested Slack app name shown to copy during setup (the product name). */
  projectName: string;
}

/**
 * Slack integration panel for the Settings page. Disconnected: a "Connect Slack"
 * button that opens a guided, slideshow modal walking through the Slack-side
 * steps (with copy-ready values) and ending in pasting the webhook URL.
 * Connected: a status row with test + disconnect, plus a pause toggle.
 *
 * All interactive behaviour (open/close, step navigation, test, toggle) lives in
 * initSlackSettings() in the client bundle; this component only renders markup.
 */
export const SlackSettings: FC<SlackSettingsProps> = ({ connected, enabled, projectName }) => {
  if (connected) {
    return (
      <div>
        <div class="slack-connected-row">
          <SlackLogo size={28} class="slack-connected-logo" />
          <div class="slack-connected-info">
            <span class="settings-toggle-label">Slack is connected</span>
            <span class="settings-toggle-hint">
              Published updates post to your Slack channel.
            </span>
          </div>
          <div class="slack-connected-actions">
            <button type="button" class="btn btn-secondary" data-slack-test>
              Send test
            </button>
            <form method="post" action="/admin/settings/slack" data-slack-disconnect>
              <input type="hidden" name="slack_webhook_url" value="" />
              <button type="submit" class="btn btn-danger">
                Disconnect
              </button>
            </form>
          </div>
        </div>
        <span class="form-hint slack-test-result" data-slack-test-result hidden></span>

        <div class="settings-toggle-row">
          <div class="settings-toggle-info">
            <span class="settings-toggle-label">Send notifications</span>
            <span class="settings-toggle-hint">Pause without removing your webhook URL.</span>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" checked={enabled} data-slack-toggle />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div class="slack-intro">
        <SlackLogo size={32} class="slack-intro-logo" />
        <p class="settings-toggle-hint slack-intro-text">
          Connect a Slack workspace and Herald will post a branded message to your channel
          whenever an entry or release is published. Setup takes about a minute.
        </p>
      </div>
      <button type="button" class="btn btn-primary" data-slack-connect>
        Connect Slack
      </button>

      <SlackConnectModal projectName={projectName} />
    </div>
  );
};

/** The guided setup modal. Hidden until opened by initSlackSettings(). */
const SlackConnectModal: FC<{ projectName: string }> = ({ projectName }) => {
  const appName = projectName || 'Changelog';
  return (
    <div class="slack-modal" data-slack-modal hidden>
      <div class="slack-modal-backdrop" data-slack-modal-close></div>
      <div
        class="slack-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="slack-modal-title"
      >
        <div class="slack-modal-header">
          <SlackLogo size={22} />
          <h3 id="slack-modal-title" class="slack-modal-title">
            Connect Slack
          </h3>
          <button
            type="button"
            class="slack-modal-close"
            data-slack-modal-close
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form method="post" action="/admin/settings/slack">
          <div class="slack-modal-body">
            {/* Step 1 */}
            <section class="slack-step" data-slack-step="0">
              <h4 class="slack-step-title">Create a Slack app</h4>
              <p class="slack-step-text">
                Open Slack's app dashboard, click <strong>Create New App</strong>, then choose{' '}
                <strong>From scratch</strong>. Give it a name and pick the workspace to post to.
              </p>
              <p class="slack-step-label">Suggested app name</p>
              <div class="slack-copy-field">
                <code id="slack-suggested-name">{appName}</code>
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  data-copy-target="slack-suggested-name"
                >
                  Copy
                </button>
              </div>
              <p class="slack-step-tip">
                Tip: Slack shows the app's name and icon as the sender — name it after your
                product and set its icon to your logo.
              </p>
              <a
                href="https://api.slack.com/apps/new"
                target="_blank"
                rel="noreferrer noopener"
                class="btn btn-secondary btn-sm slack-step-link"
              >
                Open Slack app dashboard ↗
              </a>
            </section>

            {/* Step 2 */}
            <section class="slack-step" data-slack-step="1" hidden>
              <h4 class="slack-step-title">Turn on Incoming Webhooks</h4>
              <p class="slack-step-text">
                In your new app's left sidebar, open <strong>Incoming Webhooks</strong> and switch{' '}
                <strong>Activate Incoming Webhooks</strong> to <strong>On</strong>.
              </p>
            </section>

            {/* Step 3 */}
            <section class="slack-step" data-slack-step="2" hidden>
              <h4 class="slack-step-title">Add it to a channel</h4>
              <p class="slack-step-text">
                Scroll down and click <strong>Add New Webhook to Workspace</strong>. Choose the
                channel that should receive updates, then click <strong>Allow</strong>.
              </p>
            </section>

            {/* Step 4 */}
            <section class="slack-step" data-slack-step="3" hidden>
              <h4 class="slack-step-title">Paste your webhook URL</h4>
              <p class="slack-step-text">
                Slack now shows a <strong>Webhook URL</strong> starting with{' '}
                <code>https://hooks.slack.com/</code>. Copy it and paste it below to finish.
              </p>
              <input
                type="text"
                name="slack_webhook_url"
                class="form-input"
                placeholder="https://hooks.slack.com/services/..."
                autocomplete="off"
                spellcheck={false}
                data-slack-webhook-input
              />
              <span class="form-hint slack-test-result" data-slack-test-result hidden></span>
            </section>
          </div>

          <div class="slack-modal-footer">
            <span class="slack-step-indicator" data-slack-step-indicator></span>
            <div class="slack-modal-actions">
              <button type="button" class="btn btn-secondary" data-slack-test hidden>
                Send test
              </button>
              <button type="button" class="btn btn-secondary" data-slack-back hidden>
                Back
              </button>
              <button type="button" class="btn btn-primary" data-slack-next>
                Next
              </button>
              <button type="submit" class="btn btn-primary" data-slack-connect-submit hidden>
                Connect
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
