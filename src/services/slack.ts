import type { Bindings } from '../bindings';
import { getEntry } from './entries';
import {
  getRelease,
  markReleaseNotifyPending,
  claimReleaseNotificationIfReady,
  releaseIdsAwaitingNotifyForEntry,
} from './releases';
import { getSetting } from './settings';
import { BASE_URL_SETTING } from '../middleware/base-url';
import {
  isValidSlackWebhookUrl,
  buildEntryMessage,
  buildReleaseMessage,
  type SlackBranding,
  type SlackMessage,
} from './slack-format';

// Re-export the pure helpers so callers can keep importing from one place.
export {
  isValidSlackWebhookUrl,
  buildEntryMessage,
  buildReleaseMessage,
} from './slack-format';

// Setting keys. Presence of a valid webhook URL is what enables the integration;
// the *_ENABLED flag is a "pause" switch so users can mute notifications without
// losing the URL they pasted.
export const SLACK_WEBHOOK_SETTING = 'slack_webhook_url';
export const SLACK_ENABLED_SETTING = 'slack_notifications_enabled';

/**
 * POST a payload to a Slack incoming webhook. Returns a result instead of
 * throwing so the test button can surface the failure inline; the notify
 * helpers below ignore the error entirely.
 */
export async function sendSlackMessage(
  webhookUrl: string,
  payload: SlackMessage,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) return { ok: true };
    const detail = (await res.text().catch(() => '')) || `HTTP ${res.status}`;
    return { ok: false, error: detail };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Request failed' };
  }
}

/** Resolve the active webhook URL, honouring the pause toggle. Null when off/unset/invalid. */
async function getActiveWebhook(db: D1Database): Promise<string | null> {
  const url = await getSetting(db, SLACK_WEBHOOK_SETTING);
  if (!url || !isValidSlackWebhookUrl(url)) return null;
  // Absence of the flag means "on" — the integration is enabled the moment a
  // URL is saved; only an explicit 'false' pauses it.
  const enabled = await getSetting(db, SLACK_ENABLED_SETTING);
  if (enabled === 'false') return null;
  return url;
}

/** Read product name + favicon + base URL for message branding. */
export async function resolveBranding(env: Bindings): Promise<SlackBranding> {
  const projectName = (await getSetting(env.DB, 'project_name')) || 'Changelog';
  const baseUrl = (env.BASE_URL || (await getSetting(env.DB, BASE_URL_SETTING)) || '').replace(
    /\/$/,
    '',
  );
  // Use the custom favicon when uploaded, otherwise fall back to Herald's own
  // icon (served as a real PNG at /herald-icon.png). Slack fetches the image
  // server-side, so this needs an absolute URL — omit it only when no public
  // base URL is known yet.
  const faviconKey = await getSetting(env.DB, 'favicon_image_key');
  const faviconUrl = baseUrl
    ? faviconKey
      ? `${baseUrl}/images/${faviconKey}`
      : `${baseUrl}/herald-icon.png`
    : null;
  return {
    projectName,
    faviconUrl,
    changelogUrl: baseUrl || null,
  };
}

/**
 * Send a Slack notification for a freshly-published entry. No-op when Slack
 * isn't configured. Never throws — Slack must never break publishing or fail an
 * AI job, so all errors are swallowed (and logged).
 */
export async function notifyEntryPublished(env: Bindings, entryId: number): Promise<void> {
  try {
    const webhook = await getActiveWebhook(env.DB);
    if (!webhook) return;
    const entry = await getEntry(env.DB, entryId);
    if (!entry) return;
    const branding = await resolveBranding(env);
    const result = await sendSlackMessage(webhook, buildEntryMessage(entry, branding));
    if (!result.ok) {
      console.error(`Slack notify (entry ${entryId}) failed: ${result.error}`);
    }
  } catch (err) {
    console.error(`Slack notify (entry ${entryId}) error:`, err);
  }
}

/**
 * Send a single consolidated Slack notification for a freshly-published
 * release. No-op when Slack isn't configured. Never throws.
 */
export async function notifyReleasePublished(env: Bindings, releaseId: number): Promise<void> {
  try {
    const webhook = await getActiveWebhook(env.DB);
    if (!webhook) return;
    const release = await getRelease(env.DB, releaseId);
    if (!release) return;
    const branding = await resolveBranding(env);
    const result = await sendSlackMessage(
      webhook,
      buildReleaseMessage(release.version, release.entries ?? [], branding),
    );
    if (!result.ok) {
      console.error(`Slack notify (release ${releaseId}) failed: ${result.error}`);
    }
  } catch (err) {
    console.error(`Slack notify (release ${releaseId}) error:`, err);
  }
}

/**
 * Arrange the consolidated notification for a just-published release. If its
 * entries have all finished AI processing, send immediately; otherwise defer —
 * flag the release so the queue worker sends it once the last rewrite lands, so
 * the message always carries post-AI titles. Race-free: the flag is set before
 * we re-check readiness, so an entry that finishes concurrently can't slip
 * between the two and leave the notification unsent. Never throws.
 */
export async function notifyReleasePublishedWhenReady(
  env: Bindings,
  releaseId: number,
): Promise<void> {
  try {
    await markReleaseNotifyPending(env.DB, releaseId);
    if (await claimReleaseNotificationIfReady(env.DB, releaseId)) {
      await notifyReleasePublished(env, releaseId);
    }
    // Otherwise entries are still rewriting; a queue worker will fire it via
    // notifyPendingReleasesForEntry once the last one completes.
  } catch (err) {
    console.error(`Slack notify-when-ready (release ${releaseId}) error:`, err);
  }
}

/**
 * Called after an entry reaches a terminal AI state: send the consolidated
 * message for any release that was waiting on this entry (now that its title is
 * post-AI). No-op when nothing is waiting. Never throws.
 */
export async function notifyPendingReleasesForEntry(
  env: Bindings,
  entryId: number,
): Promise<void> {
  try {
    const releaseIds = await releaseIdsAwaitingNotifyForEntry(env.DB, entryId);
    for (const id of releaseIds) {
      if (await claimReleaseNotificationIfReady(env.DB, id)) {
        await notifyReleasePublished(env, id);
      }
    }
  } catch (err) {
    console.error(`Slack pending-release notify (entry ${entryId}) error:`, err);
  }
}
