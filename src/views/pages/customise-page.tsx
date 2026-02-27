import type { FC } from 'hono/jsx';
import { SettingsSection } from '../components/settings-form';

interface CustomisePageProps {
  settings: Record<string, string>;
  baseUrl: string;
}

export const CustomisePage: FC<CustomisePageProps> = ({
  settings,
  baseUrl,
}) => {
  const logoKey = settings['logo_image_key'] ?? '';
  const faviconKey = settings['favicon_image_key'] ?? '';
  const logoUrl = logoKey ? `/images/${logoKey}` : null;
  const faviconUrl = faviconKey ? `/images/${faviconKey}` : null;

  const changelogUrl = baseUrl;
  const embedCode = `<script src="${baseUrl}/embed.js"></script>`;
  const embedCodeWithDiv = `<div data-herald-widget></div>\n<script src="${baseUrl}/embed.js"></script>`;
  const rssUrl = `${baseUrl}/feed.xml`;

  return (
    <div>
      <div class="page-header">
        <h1>Customise</h1>
      </div>

      {/* Branding Section */}
      <SettingsSection
        title="Branding"
        description="Upload a logo and favicon for your public changelog."
      >
        <div class="form-group">
          <label class="form-label">Logo</label>
          <p class="form-hint">Displayed in the header of your public changelog. Recommended: wide format, max 2MB.</p>
          {logoUrl && (
            <div class="brand-preview">
              <img src={logoUrl} alt="Current logo" class="brand-preview-image" />
              <form method="post" action="/admin/settings/logo/remove" style="margin: 0;">
                <button type="submit" class="btn btn-secondary btn-sm">Remove</button>
              </form>
            </div>
          )}
          <form method="post" action="/admin/settings/logo" enctype="multipart/form-data">
            <div class="file-upload-row">
              <input type="file" name="logo_file" accept="image/*" class="form-input" />
              <button type="submit" class="btn btn-primary btn-sm">Upload Logo</button>
            </div>
          </form>
        </div>

        <div class="form-group">
          <label class="form-label">Favicon</label>
          <p class="form-hint">Browser tab icon. Recommended: 32x32px .ico or .png, max 1MB.</p>
          {faviconUrl && (
            <div class="brand-preview">
              <img src={faviconUrl} alt="Current favicon" class="brand-preview-favicon" />
              <form method="post" action="/admin/settings/favicon/remove" style="margin: 0;">
                <button type="submit" class="btn btn-secondary btn-sm">Remove</button>
              </form>
            </div>
          )}
          <form method="post" action="/admin/settings/favicon" enctype="multipart/form-data">
            <div class="file-upload-row">
              <input type="file" name="favicon_file" accept="image/*,.ico" class="form-input" />
              <button type="submit" class="btn btn-primary btn-sm">Upload Favicon</button>
            </div>
          </form>
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
