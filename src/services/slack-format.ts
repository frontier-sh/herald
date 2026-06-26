import type { Entry, EntryWithSection } from '../db/schema';

// Pure, dependency-light helpers for building Slack messages and validating
// webhook URLs. Kept free of runtime imports (types only) so it's unit-testable
// in isolation — mirrors the changelog-format.ts split.

// Slack only accepts incoming-webhook posts on this host. Validating against it
// both guards the save form and avoids posting credentials anywhere else.
const SLACK_WEBHOOK_PREFIX = 'https://hooks.slack.com/';

/** A modern Slack incoming-webhook URL, e.g. https://hooks.slack.com/services/T.../B.../X... */
export function isValidSlackWebhookUrl(url: string): boolean {
  return url.startsWith(SLACK_WEBHOOK_PREFIX) && url.length > SLACK_WEBHOOK_PREFIX.length;
}

export interface SlackBranding {
  projectName: string;
  /** Absolute, publicly-fetchable favicon URL, or null to omit the image. */
  faviconUrl: string | null;
  /** Public changelog URL for the "View changelog" button, or null to omit it. */
  changelogUrl: string | null;
}

/** Minimal Block Kit message shape we send. */
export interface SlackMessage {
  text: string;
  blocks: unknown[];
}

const CATEGORY_LABELS: Record<string, string> = {
  added: 'Added',
  changed: 'Changed',
  fixed: 'Fixed',
  removed: 'Removed',
  deprecated: 'Deprecated',
  security: 'Security',
};

/**
 * Reduce entry content (which may be markdown/HTML) to a short plain-text
 * excerpt. Slack's `mrkdwn` is not real markdown, so rather than render it
 * imperfectly we strip formatting and post clean prose.
 */
export function plainExcerpt(content: string, max = 280): string {
  const text = content
    .replace(/<[^>]+>/g, ' ') // HTML tags
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links -> label
    .replace(/[*_`#>~]/g, '') // markdown emphasis/heading/quote/code marks
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + '…';
}

/** Block Kit `context` block carrying the product branding (and favicon if usable). */
function brandingContext(branding: SlackBranding): Record<string, unknown> {
  const elements: unknown[] = [];
  // Slack fetches image_url server-side, so it must be an absolute public URL
  // (the caller resolves this to the custom favicon or Herald's own icon, and
  // passes null only when no public base URL is known — then we omit the image).
  if (branding.faviconUrl) {
    elements.push({
      type: 'image',
      image_url: branding.faviconUrl,
      alt_text: branding.projectName,
    });
  }
  elements.push({
    type: 'mrkdwn',
    text: `New in *${branding.projectName}*`,
  });
  return { type: 'context', elements };
}

/** Block Kit `actions` block with the "View changelog" button, when we have a URL. */
function viewButton(changelogUrl: string | null): Record<string, unknown> | null {
  if (!changelogUrl) return null;
  return {
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: 'View changelog', emoji: true },
        url: changelogUrl,
      },
    ],
  };
}

export function buildEntryMessage(
  entry: Pick<Entry, 'title' | 'content' | 'category'>,
  branding: SlackBranding,
): SlackMessage {
  const categoryLabel = CATEGORY_LABELS[entry.category] ?? entry.category;
  const excerpt = plainExcerpt(entry.content ?? '');

  const blocks: unknown[] = [
    brandingContext(branding),
    { type: 'header', text: { type: 'plain_text', text: entry.title, emoji: true } },
  ];

  const sectionText = excerpt ? `*${categoryLabel}*\n${excerpt}` : `*${categoryLabel}*`;
  blocks.push({ type: 'section', text: { type: 'mrkdwn', text: sectionText } });

  const button = viewButton(branding.changelogUrl);
  if (button) blocks.push(button);

  return {
    text: `New in ${branding.projectName}: ${entry.title}`,
    blocks,
  };
}

export function buildReleaseMessage(
  version: string,
  entries: Pick<EntryWithSection, 'title' | 'category'>[],
  branding: SlackBranding,
): SlackMessage {
  const blocks: unknown[] = [
    brandingContext(branding),
    { type: 'header', text: { type: 'plain_text', text: `New release ${version}`, emoji: true } },
  ];

  if (entries.length > 0) {
    const MAX = 12;
    const lines = entries.slice(0, MAX).map((e) => {
      const label = CATEGORY_LABELS[e.category] ?? e.category;
      return `• *${label}* — ${e.title}`;
    });
    if (entries.length > MAX) {
      lines.push(`…and ${entries.length - MAX} more`);
    }
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } });
  }

  const button = viewButton(branding.changelogUrl);
  if (button) blocks.push(button);

  return {
    text: `New release ${version} in ${branding.projectName}`,
    blocks,
  };
}
