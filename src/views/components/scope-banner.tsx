import type { FC } from 'hono/jsx';

interface ScopeBannerProps {
  /**
   * `app` tints the banner with the brand colour and pairs with a
   * `.scope-group` wrapper around the sections it governs; `instance` is its
   * neutral counterpart for install-wide settings.
   */
  variant: 'app' | 'instance';
  /** Pill text — the app's name, or "All apps" for instance-wide settings. */
  badge: string;
  /** The scope statement itself, e.g. "These settings apply only to Rivets". */
  title: string;
  /** Clarifying second line. */
  note?: string;
  /** Public URL the scope is served at, shown as code. */
  url?: string;
}

/**
 * Banner announcing which scope the settings beneath it belong to.
 *
 * One Herald install serves many changelogs, so "which app am I editing?" has
 * to be answerable at a glance rather than inferred from a heading.
 */
export const ScopeBanner: FC<ScopeBannerProps> = ({
  variant,
  badge,
  title,
  note,
  url,
}) => (
  <div class={`scope-banner scope-banner-${variant}`}>
    <span class="scope-banner-badge">{badge}</span>
    <div class="scope-banner-body">
      <p class="scope-banner-title">{title}</p>
      {note && <p class="scope-banner-note">{note}</p>}
    </div>
    {url && <code class="settings-code scope-banner-url">{url}</code>}
  </div>
);
