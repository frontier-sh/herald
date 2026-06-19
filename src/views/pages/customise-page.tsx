import type { FC } from 'hono/jsx';
import type { Release, EntryWithSection } from '../../db/schema';
import { SettingsSection } from '../components/settings-form';
import { Changelog } from './changelog';
import { listTimezones } from '../../services/datetime';

interface ReleaseWithEntries extends Release {
  entries: EntryWithSection[];
}

interface CustomisePageProps {
  settings: Record<string, string>;
  baseUrl: string;
  previewReleases: ReleaseWithEntries[];
  previewStandaloneEntries: EntryWithSection[];
  previewProjectName: string;
  previewProjectDescription: string;
  previewLogoUrl: string | null;
}

const UploadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="brand-dropzone-icon">
    <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
  </svg>
);

const THEMES = [
  {
    id: 'herald',
    name: 'Herald',
    description: 'Clean timeline with colorful badges',
    previewBg: '#FAFAF9',
    previewAccent: '#4F46E5',
    previewText: '#1C1917',
    previewBadges: ['#D1FAE5', '#DBEAFE', '#EDE9FE'],
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    description: 'Dark monospace developer style',
    previewBg: '#0a0a0a',
    previewAccent: '#e5e5e5',
    previewText: '#e5e5e5',
    previewBadges: ['#1a1a1a', '#1a1a1a', '#1a1a1a'],
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Minimal editorial layout',
    previewBg: '#FFFFFF',
    previewAccent: '#111111',
    previewText: '#37352F',
    previewBadges: ['#E8F5E9', '#E3F2FD', '#F3E8FD'],
  },
];

export const CustomisePage: FC<CustomisePageProps> = ({
  settings,
  baseUrl,
  previewReleases,
  previewStandaloneEntries,
  previewProjectName,
  previewProjectDescription,
  previewLogoUrl,
}) => {
  const projectName = settings['project_name'] ?? '';
  const projectDescription = settings['project_description'] ?? '';
  const logoKey = settings['logo_image_key'] ?? '';
  const faviconKey = settings['favicon_image_key'] ?? '';
  const logoUrl = logoKey ? `/images/${logoKey}` : null;
  const faviconUrl = faviconKey ? `/images/${faviconKey}` : null;
  const currentTheme = settings['theme'] || 'herald';
  const primaryColor = settings['primary_color'] || '#4F46E5';
  const currentTimezone = settings['timezone'] || 'UTC';
  const dateGrouping = settings['date_grouping'] || 'day';
  const showTitle = settings['show_title'] !== 'false';
  const showDescription = settings['show_description'] !== 'false';
  const hideAttribution = settings['hide_attribution'] === 'true';
  const timezones = listTimezones();

  const changelogUrl = baseUrl;
  const embedCode = `<script src="${baseUrl}/embed.js"></script>`;
  const embedCodeWithDiv = `<div data-herald-widget></div>\n<script src="${baseUrl}/embed.js"></script>`;
  const embedCodeWithLimit = `<div data-herald-widget data-herald-limit="5"></div>\n<script src="${baseUrl}/embed.js"></script>`;
  const embedCodeInline = `<div data-herald-widget data-herald-inline></div>\n<script src="${baseUrl}/embed.js"></script>`;
  const rssUrl = `${baseUrl}/feed.xml`;

  return (
    <div>
      <div class="page-header">
        <h1>Customise</h1>
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

      {/* Display Section */}
      <SettingsSection
        title="Display"
        description="Control how entries are grouped on your public changelog."
      >
        <form method="post" action="/admin/settings/display">
          <div class="form-group">
            <label class="form-label">Group entries by</label>
            <p class="form-hint">Choose how entries are organised within each release on your public changelog.</p>
            <div class="radio-group">
              <label class="radio-label">
                <input
                  type="radio"
                  name="entry_grouping"
                  value="category"
                  checked={settings['entry_grouping'] !== 'section'}
                />
                <span>Category</span>
                <span class="form-hint">Group by change type (Added, Fixed, Changed, etc.)</span>
              </label>
              <label class="radio-label">
                <input
                  type="radio"
                  name="entry_grouping"
                  value="section"
                  checked={settings['entry_grouping'] === 'section'}
                />
                <span>Section</span>
                <span class="form-hint">Group by product area (e.g. Core, Desktop, API)</span>
              </label>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Split timeline by</label>
            <p class="form-hint">How the timeline down the left is grouped by date.</p>
            <div class="radio-group">
              <label class="radio-label">
                <input type="radio" name="date_grouping" value="day" checked={dateGrouping !== 'month'} />
                <span>Day</span>
                <span class="form-hint">A node per day (e.g. June 18, 2025)</span>
              </label>
              <label class="radio-label">
                <input type="radio" name="date_grouping" value="month" checked={dateGrouping === 'month'} />
                <span>Month</span>
                <span class="form-hint">A node per month (e.g. June 2025)</span>
              </label>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="timezone">Timezone</label>
            <p class="form-hint">
              Default timezone for dates shown on your public changelog. Visitors still see their own
              local time where their browser supports it.
            </p>
            <select id="timezone" name="timezone" class="form-select">
              {timezones.map((tz) => (
                <option value={tz} selected={tz === currentTimezone}>{tz}</option>
              ))}
            </select>
          </div>

          <div class="settings-section-footer">
            <button type="submit" class="btn btn-primary">
              Save Changes
            </button>
          </div>
        </form>
      </SettingsSection>

      {/* Branding Section */}
      <SettingsSection
        title="Branding"
        description="Customise the look and feel of your public changelog."
      >
        <div class="form-group">
          <label class="form-label">Logo</label>
          <p class="form-hint">Displayed in the header of your public changelog. Recommended: wide format, max 2MB.</p>
          <div class="brand-dropzone" data-upload-url="/admin/images/upload/logo" data-accept="image/*">
            {logoUrl ? (
              <div class="brand-dropzone-preview">
                <img src={logoUrl} alt="Current logo" class="brand-preview-image" />
              </div>
            ) : (
              <div class="brand-dropzone-empty">
                <UploadIcon />
                <span class="brand-dropzone-text">Click or drag image to upload</span>
              </div>
            )}
            <div class="brand-dropzone-progress">
              <div class="brand-dropzone-progress-fill"></div>
            </div>
            <input type="file" accept="image/*" />
          </div>
          {logoUrl && (
            <form method="post" action="/admin/settings/logo/remove" class="brand-remove-form">
              <button type="submit" class="btn btn-secondary btn-sm">Remove</button>
            </form>
          )}
        </div>

        <div class="form-group">
          <label class="form-label">Favicon</label>
          <p class="form-hint">Browser tab icon. Recommended: 32x32px .ico or .png, max 1MB.</p>
          <div class="brand-dropzone" data-upload-url="/admin/images/upload/favicon" data-accept="image/*,.ico">
            {faviconUrl ? (
              <div class="brand-dropzone-preview">
                <img src={faviconUrl} alt="Current favicon" class="brand-preview-favicon" />
              </div>
            ) : (
              <div class="brand-dropzone-empty">
                <UploadIcon />
                <span class="brand-dropzone-text">Click or drag image to upload</span>
              </div>
            )}
            <div class="brand-dropzone-progress">
              <div class="brand-dropzone-progress-fill"></div>
            </div>
            <input type="file" accept="image/*,.ico" />
          </div>
          {faviconUrl && (
            <form method="post" action="/admin/settings/favicon/remove" class="brand-remove-form">
              <button type="submit" class="btn btn-secondary btn-sm">Remove</button>
            </form>
          )}
        </div>

        {/* Theme Picker */}
        <div class="form-group">
          <label class="form-label">Theme</label>
          <p class="form-hint">Choose a visual style for your public changelog.</p>
          <div class="theme-picker">
            {THEMES.map((theme) => (
              <label class={`theme-card${currentTheme === theme.id ? ' active' : ''}`}>
                <input
                  type="radio"
                  name="theme"
                  value={theme.id}
                  data-theme-radio
                  checked={currentTheme === theme.id}
                />
                <div
                  class="theme-card-preview"
                  style={`background-color: ${theme.previewBg};`}
                >
                  <div class="theme-card-preview-lines">
                    <div class="theme-card-preview-title" style={`background-color: ${theme.previewText};`}></div>
                    <div class="theme-card-preview-subtitle" style={`background-color: ${theme.previewText}; opacity: 0.3;`}></div>
                    <div class="theme-card-preview-badges">
                      {theme.previewBadges.map((color) => (
                        <div class="theme-card-preview-badge" style={`background-color: ${color};`}></div>
                      ))}
                    </div>
                    <div class="theme-card-preview-line" style={`background-color: ${theme.previewText}; opacity: 0.15;`}></div>
                    <div class="theme-card-preview-line" style={`background-color: ${theme.previewText}; opacity: 0.1;`}></div>
                  </div>
                </div>
                <div class="theme-card-name">{theme.name}</div>
                <div class="theme-card-description">{theme.description}</div>
              </label>
            ))}
          </div>
        </div>

        {/* Primary colour */}
        <div class="form-group">
          <label class="form-label" for="primary_color_text">Primary colour</label>
          <p class="form-hint">Your brand accent colour. Applied across all templates on your public changelog.</p>
          <div class="color-picker" data-primary-color>
            <input
              type="color"
              id="primary_color"
              class="color-picker-swatch"
              value={primaryColor}
              data-primary-color-input
            />
            <input
              type="text"
              id="primary_color_text"
              class="form-input color-picker-hex"
              value={primaryColor}
              maxlength={7}
              spellcheck={false}
              data-primary-color-hex
            />
          </div>
        </div>

        {/* Changelog page elements */}
        <div class="form-group" data-visibility-toggles>
          <label class="form-label">Changelog page</label>
          <p class="form-hint">Choose which header elements appear at the top of your public changelog page.</p>
          <div class="settings-toggle-row">
            <div class="settings-toggle-info">
              <span class="settings-toggle-label">Show title</span>
              <span class="settings-toggle-hint">Display the project name as a heading on the changelog page.</span>
            </div>
            <label class="toggle-switch">
              <input
                type="checkbox"
                checked={showTitle}
                data-visibility-toggle="show_title"
              />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="settings-toggle-row">
            <div class="settings-toggle-info">
              <span class="settings-toggle-label">Show description</span>
              <span class="settings-toggle-hint">Display the project description beneath the title on the changelog page.</span>
            </div>
            <label class="toggle-switch">
              <input
                type="checkbox"
                checked={showDescription}
                data-visibility-toggle="show_description"
              />
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>

        {/* Herald attribution */}
        <div class="form-group">
          <label class="form-label">Attribution</label>
          <p class="form-hint">A small "Powered by Herald" link in the footer of your public changelog.</p>
          <div class="settings-toggle-row">
            <div class="settings-toggle-info">
              <span class="settings-toggle-label">Remove Herald attribution link</span>
              <span class="settings-toggle-hint">When enabled, the footer is removed entirely from your public changelog.</span>
            </div>
            <label class="toggle-switch">
              <input
                type="checkbox"
                checked={hideAttribution}
                data-visibility-toggle="hide_attribution"
              />
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>

        {/* Live Preview */}
        <div class="form-group">
          <label class="form-label">Preview</label>
          <div class="theme-preview-container" data-theme-preview>
            <div class="theme-preview-frame" data-theme={currentTheme} style={`--color-primary: ${primaryColor}`}>
              <div class="theme-preview-header">
                <a href="#" class="theme-preview-brand">
                  {previewLogoUrl ? (
                    <img src={previewLogoUrl} alt={previewProjectName} class="theme-preview-brand-logo" />
                  ) : (
                    previewProjectName
                  )}
                </a>
              </div>
              <div class="theme-preview-content">
                <Changelog
                  projectName={previewProjectName}
                  projectDescription={previewProjectDescription}
                  releases={previewReleases}
                  standaloneEntries={previewStandaloneEntries}
                  timezone={currentTimezone}
                  dateGrouping={dateGrouping === 'month' ? 'month' : 'day'}
                  showTitle={showTitle}
                  showDescription={showDescription}
                />
              </div>
            </div>
          </div>
        </div>
      </SettingsSection>

      {/* Distribution Section */}
      <SettingsSection
        title="Distribution"
        description="Share your changelog with your users."
      >
        <div class="customise-tabs">
          <button type="button" class="customise-tab active" data-tab="webpage">Webpage</button>
          <button type="button" class="customise-tab" data-tab="embed">Embed</button>
          <button type="button" class="customise-tab" data-tab="rss">RSS</button>
        </div>

        {/* Webpage Panel */}
        <div class="customise-tab-panel" data-tab-panel="webpage">
          <p class="form-hint">Your public changelog is available at the URL below. Share it with your users to keep them informed about updates.</p>
          <div class="customise-copyable">
            <code id="webpage-url" class="customise-code">{changelogUrl}</code>
            <button type="button" class="btn btn-secondary btn-sm" data-copy-target="webpage-url">Copy</button>
          </div>
        </div>

        {/* Embed Panel */}
        <div class="customise-tab-panel" data-tab-panel="embed" style="display: none;">
          <p class="form-hint">Add the changelog widget to any webpage by pasting the code below. It loads asynchronously and creates an embedded changelog on your site.</p>
          <div class="customise-copyable">
            <code id="embed-code" class="customise-code">{embedCode}</code>
            <button type="button" class="btn btn-secondary btn-sm" data-copy-target="embed-code">Copy</button>
          </div>
          <p class="form-hint">To target a specific container, use this instead:</p>
          <div class="customise-copyable">
            <code id="embed-code-div" class="customise-code">{embedCodeWithDiv}</code>
            <button type="button" class="btn btn-secondary btn-sm" data-copy-target="embed-code-div">Copy</button>
          </div>
          <p class="form-hint">To show only the most recent entries with a "view all" link, add a <code>data-herald-limit</code> attribute:</p>
          <div class="customise-copyable">
            <code id="embed-code-limit" class="customise-code">{embedCodeWithLimit}</code>
            <button type="button" class="btn btn-secondary btn-sm" data-copy-target="embed-code-limit">Copy</button>
          </div>
          <p class="form-hint">For full style control, use <code>data-herald-inline</code> to render directly on your page (no iframe). Override CSS variables on <code>.herald-changelog</code> to customise colours and fonts:</p>
          <div class="customise-copyable">
            <code id="embed-code-inline" class="customise-code">{embedCodeInline}</code>
            <button type="button" class="btn btn-secondary btn-sm" data-copy-target="embed-code-inline">Copy</button>
          </div>
        </div>

        {/* RSS Panel */}
        <div class="customise-tab-panel" data-tab-panel="rss" style="display: none;">
          <p class="form-hint">Subscribe to your changelog via RSS. Share this feed URL with users who prefer RSS readers.</p>
          <div class="customise-copyable">
            <code id="rss-url" class="customise-code">{rssUrl}</code>
            <button type="button" class="btn btn-secondary btn-sm" data-copy-target="rss-url">Copy</button>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
};
