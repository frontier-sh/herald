import type { FC } from 'hono/jsx';

interface Step4DistributionProps {
  baseUrl: string;
}

export const Step4Distribution: FC<Step4DistributionProps> = ({ baseUrl }) => {
  const changelogUrl = baseUrl;
  const embedCode = `<script src="${baseUrl}/embed.js"></script>`;
  const embedCodeWithDiv = `<div data-herald-widget></div>\n<script src="${baseUrl}/embed.js"></script>`;
  const embedCodeWithLimit = `<div data-herald-widget data-herald-limit="5"></div>\n<script src="${baseUrl}/embed.js"></script>`;
  const embedCodeInline = `<div data-herald-widget data-herald-inline></div>\n<script src="${baseUrl}/embed.js"></script>`;
  const rssUrl = `${baseUrl}/feed.xml`;

  return (
    <div>
      <h2 class="onboarding-heading">Share your changelog</h2>
      <p class="form-hint">Your changelog is ready. Here's how your users can access it.</p>

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
        <p class="form-hint">Add the changelog widget to any webpage by pasting the code below.</p>
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

      <div class="onboarding-footer">
        <a href="/admin/onboarding/3" class="btn btn-secondary">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;">
            <path d="M10 3l-5 5 5 5" />
          </svg>
          Back
        </a>
        <form method="post" action="/admin/onboarding/complete">
          <button type="submit" class="btn btn-primary">
            Finish Setup
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 4px;">
              <path d="M3 8.5l3.5 3.5L13 4" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
};
