/**
 * Registry of public changelog themes.
 *
 * Every theme renders the same markup (views/pages/changelog.tsx); a theme is
 * a `data-theme` value plus a block of CSS in client/styles/main.css that sets
 * the `--cl-*` design tokens and any layout overrides. Adding a theme means
 * adding an entry here and its CSS block — nothing else switches on the id.
 */

export interface ChangelogTheme {
  /** Stored in the per-app `theme` setting and emitted as `data-theme`. */
  id: string;
  /** Name shown in the Customise theme picker. */
  name: string;
  /** One-line description shown under the name in the picker. */
  description: string;
  /**
   * Extra Google Fonts stylesheet this theme needs beyond the base fonts
   * every page loads, or undefined if the base fonts are enough.
   */
  fontsHref?: string;
}

export const CHANGELOG_THEMES: readonly ChangelogTheme[] = [
  {
    id: 'herald',
    name: 'Herald',
    description: 'Clean timeline with colourful badges',
  },
  {
    id: 'studio',
    name: 'Studio',
    description: 'Pinned intro and filters beside the feed',
  },
  {
    id: 'gazette',
    name: 'Gazette',
    description: 'Serif print edition with a date column',
    fontsHref:
      'https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400..700;1,6..72,400..600&display=swap',
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Minimal editorial document',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    description: 'Dark monospace terminal style',
  },
] as const;

export const DEFAULT_THEME_ID = 'herald';

const themesById = new Map(CHANGELOG_THEMES.map((t) => [t.id, t]));

/** `value` if it names a registered theme, otherwise the default theme id. */
export function resolveThemeId(value: string | undefined | null): string {
  return value && themesById.has(value) ? value : DEFAULT_THEME_ID;
}

/** The extra font stylesheet for a theme, if it needs one. */
export function themeFontsHref(themeId: string | undefined | null): string | undefined {
  return themesById.get(resolveThemeId(themeId))?.fontsHref;
}
