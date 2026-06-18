// Herald Embeddable Changelog Widget Loader
// Zero dependencies — runs on customer websites
//
// Iframe mode (default):
//   <script async src="https://your-herald.com/embed.js"></script>
//
// Inline mode (no iframe, styleable via CSS variables):
//   <div data-herald-widget data-herald-inline></div>
//   <script async src="https://your-herald.com/embed.js"></script>

(function () {
  // Guard against multiple initialization
  if ((window as any).__heraldInitialized) return;
  (window as any).__heraldInitialized = true;

  // Capture currentScript synchronously — becomes null after script execution
  var currentScript = document.currentScript as HTMLScriptElement | null;

  // Derive the Herald origin from the script's src URL
  var heraldOrigin = '';
  if (currentScript && currentScript.src) {
    try {
      var url = new URL(currentScript.src);
      heraldOrigin = url.origin;
    } catch (e) {
      // Fallback: same origin
    }
  }
  if (!heraldOrigin) {
    heraldOrigin = window.location.origin;
  }

  var embedBaseUrl = heraldOrigin + '/embed';

  // ─── Inline mode styles (CSS custom properties for full customisation) ───

  var INLINE_STYLES = [
    '.herald-changelog {',
    '  --herald-font: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;',
    '  --herald-font-mono: ui-monospace, "SF Mono", monospace;',
    '  --herald-text: #1a1a2e;',
    '  --herald-text-muted: #6b7280;',
    '  --herald-border: #e5e7eb;',
    '  --herald-bg: transparent;',
    '  --herald-radius: 8px;',
    '  --herald-accent: #4f46e5;',
    '  --herald-accent-text: #fff;',
    '  --herald-added-bg: #d1fae5; --herald-added-text: #059669;',
    '  --herald-changed-bg: #dbeafe; --herald-changed-text: #2563eb;',
    '  --herald-fixed-bg: #ede9fe; --herald-fixed-text: #7c3aed;',
    '  --herald-removed-bg: #fee2e2; --herald-removed-text: #dc2626;',
    '  --herald-deprecated-bg: #fef3c7; --herald-deprecated-text: #d97706;',
    '  --herald-security-bg: #fed7aa; --herald-security-text: #ea580c;',
    '  font-family: var(--herald-font);',
    '  color: var(--herald-text);',
    '  background: var(--herald-bg);',
    '  line-height: 1.6;',
    '}',
    '.herald-changelog *, .herald-changelog *::before, .herald-changelog *::after {',
    '  box-sizing: border-box;',
    '}',
    '.herald-header { margin-bottom: 1.5rem; }',
    '.herald-title {',
    '  font-size: 1.5rem;',
    '  font-weight: 700;',
    '  margin: 0 0 0.25rem;',
    '  line-height: 1.3;',
    '}',
    '.herald-subtitle {',
    '  color: var(--herald-text-muted);',
    '  margin: 0;',
    '  font-size: 0.95rem;',
    '}',
    '.herald-release {',
    '  border-left: 2px solid var(--herald-border);',
    '  padding-left: 1.5rem;',
    '  margin-bottom: 2rem;',
    '  position: relative;',
    '}',
    '.herald-release::before {',
    '  content: "";',
    '  position: absolute;',
    '  left: -5px; top: 4px;',
    '  width: 8px; height: 8px;',
    '  border-radius: 50%;',
    '  background: var(--herald-accent);',
    '}',
    '.herald-release-header {',
    '  display: flex;',
    '  align-items: baseline;',
    '  gap: 0.75rem;',
    '  flex-wrap: wrap;',
    '  margin-bottom: 0.5rem;',
    '}',
    '.herald-version {',
    '  font-size: 1.25rem;',
    '  font-weight: 700;',
    '}',
    '.herald-date {',
    '  font-size: 0.8rem;',
    '  color: var(--herald-text-muted);',
    '}',
    '.herald-release-title {',
    '  font-size: 1.1rem;',
    '  font-weight: 600;',
    '  margin: 0 0 0.5rem;',
    '}',
    '.herald-summary { margin-bottom: 0.75rem; }',
    '.herald-summary p { margin: 0 0 0.5rem; }',
    '.herald-badge {',
    '  display: inline-block;',
    '  padding: 0.15rem 0.6rem;',
    '  border-radius: 9999px;',
    '  font-size: 0.75rem;',
    '  font-weight: 600;',
    '  text-transform: capitalize;',
    '  margin-bottom: 0.35rem;',
    '}',
    '.herald-entries { list-style: none; padding: 0; margin: 0 0 0.75rem; }',
    '.herald-entry { margin-bottom: 0.5rem; }',
    '.herald-entry-title { font-weight: 600; }',
    '.herald-entry-content {',
    '  margin-top: 0.25rem;',
    '  font-size: 0.9rem;',
    '  color: var(--herald-text-muted);',
    '}',
    '.herald-entry-content p { margin: 0 0 0.4rem; }',
    '.herald-standalone-title {',
    '  font-size: 1.1rem;',
    '  font-weight: 700;',
    '  border-left: 2px solid var(--herald-border);',
    '  padding-left: 1.5rem;',
    '  position: relative;',
    '  margin-bottom: 0.75rem;',
    '}',
    '.herald-standalone-title::before {',
    '  content: "";',
    '  position: absolute;',
    '  left: -5px; top: 4px;',
    '  width: 8px; height: 8px;',
    '  border-radius: 50%;',
    '  background: var(--herald-accent);',
    '}',
    '.herald-standalone {',
    '  border-left: 2px solid var(--herald-border);',
    '  padding-left: 1.5rem;',
    '  margin-bottom: 2rem;',
    '}',
    '.herald-view-more {',
    '  text-align: center;',
    '  padding: 1rem 0 0.5rem;',
    '}',
    '.herald-view-more a {',
    '  display: inline-block;',
    '  padding: 0.5rem 1.25rem;',
    '  font-size: 0.85rem;',
    '  font-weight: 600;',
    '  color: var(--herald-accent);',
    '  text-decoration: none;',
    '  border: 1.5px solid var(--herald-accent);',
    '  border-radius: var(--herald-radius);',
    '  transition: background 0.15s, color 0.15s;',
    '}',
    '.herald-view-more a:hover {',
    '  background: var(--herald-accent);',
    '  color: var(--herald-accent-text);',
    '}',
    '.herald-empty {',
    '  text-align: center;',
    '  padding: 2rem 0;',
    '  color: var(--herald-text-muted);',
    '}',
  ].join('\n');

  var stylesInjected = false;

  function injectStyles(): void {
    if (stylesInjected) return;
    stylesInjected = true;
    var style = document.createElement('style');
    style.setAttribute('data-herald-styles', '');
    style.textContent = INLINE_STYLES;
    document.head.appendChild(style);
  }

  // ─── Category badge colors ───

  var CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
    added: { bg: 'var(--herald-added-bg)', text: 'var(--herald-added-text)' },
    changed: { bg: 'var(--herald-changed-bg)', text: 'var(--herald-changed-text)' },
    fixed: { bg: 'var(--herald-fixed-bg)', text: 'var(--herald-fixed-text)' },
    removed: { bg: 'var(--herald-removed-bg)', text: 'var(--herald-removed-text)' },
    deprecated: { bg: 'var(--herald-deprecated-bg)', text: 'var(--herald-deprecated-text)' },
    security: { bg: 'var(--herald-security-bg)', text: 'var(--herald-security-text)' },
  };

  // ─── Category ordering ───

  var CATEGORY_ORDER = ['added', 'changed', 'fixed', 'removed', 'deprecated', 'security'];

  // ─── Escape HTML to prevent XSS ───

  function esc(s: string): string {
    var el = document.createElement('span');
    el.textContent = s;
    return el.innerHTML;
  }

  // ─── Simple markdown-ish rendering (bold, inline code, links, paragraphs) ───

  function renderContent(md: string): string {
    if (!md) return '';
    // Escape HTML first
    var html = esc(md);
    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code style="font-family:var(--herald-font-mono);font-size:0.85em;background:var(--herald-border);padding:0.1em 0.35em;border-radius:3px">$1</code>');
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:var(--herald-accent)">$1</a>');
    // Paragraphs (double newline)
    html = html.replace(/\n\n+/g, '</p><p>');
    return '<p>' + html + '</p>';
  }

  function formatDate(dateStr: string): string {
    if (!dateStr) return '';
    // Stored timestamps are UTC; SQLite's "YYYY-MM-DD HH:MM:SS" form has no
    // timezone marker, so normalise to UTC before formatting in local time.
    var iso = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(dateStr)
      ? dateStr.replace(' ', 'T')
      : dateStr.replace(' ', 'T') + 'Z';
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: 'numeric', month: 'long', day: 'numeric',
      });
    } catch (e) {
      return dateStr;
    }
  }

  // ─── Group entries by category ───

  function groupByCategory(entries: any[]): Record<string, any[]> {
    var grouped: Record<string, any[]> = {};
    for (var i = 0; i < entries.length; i++) {
      var cat = entries[i].category;
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(entries[i]);
    }
    return grouped;
  }

  // ─── Build HTML for a group of entries ───

  function renderEntryGroup(category: string, entries: any[]): string {
    var colors = CATEGORY_COLORS[category] || { bg: '#f3f4f6', text: '#374151' };
    var html = '<div>';
    html += '<span class="herald-badge" style="background:' + colors.bg + ';color:' + colors.text + '">' + esc(category) + '</span>';
    html += '<ul class="herald-entries">';
    for (var i = 0; i < entries.length; i++) {
      html += '<li class="herald-entry">';
      html += '<span class="herald-entry-title">' + esc(entries[i].title) + '</span>';
      if (entries[i].content) {
        html += '<div class="herald-entry-content">' + renderContent(entries[i].content) + '</div>';
      }
      html += '</li>';
    }
    html += '</ul></div>';
    return html;
  }

  // ─── Build full inline HTML from JSON data ───

  function buildInlineHTML(data: any, limit?: number): string {
    var html = '<div class="herald-changelog">';

    // Header
    html += '<div class="herald-header">';
    html += '<h2 class="herald-title">' + esc(data.projectName) + '</h2>';
    if (data.projectDescription) {
      html += '<p class="herald-subtitle">' + esc(data.projectDescription) + '</p>';
    }
    html += '</div>';

    var releases = data.releases || [];
    var standalone = data.standaloneEntries || [];
    var hasContent = releases.length > 0 || standalone.length > 0;

    if (!hasContent) {
      html += '<div class="herald-empty"><p>No updates yet</p><p>Check back soon for the latest changes.</p></div>';
      html += '</div>';
      return html;
    }

    var totalItems = releases.length + (standalone.length > 0 ? 1 : 0);
    var isLimited = typeof limit === 'number' && limit > 0 && totalItems > limit;
    var displayReleases = isLimited ? releases.slice(0, limit) : releases;
    var displayStandalone = isLimited && displayReleases.length >= limit! ? [] : standalone;

    // Releases
    for (var r = 0; r < displayReleases.length; r++) {
      var rel = displayReleases[r];
      html += '<div class="herald-release">';
      html += '<div class="herald-release-header">';
      html += '<span class="herald-version">' + esc(rel.version) + '</span>';
      var relDate = rel.date || rel.published_at;
      if (relDate) {
        html += '<span class="herald-date">' + formatDate(relDate) + '</span>';
      }
      html += '</div>';
      if (rel.title) {
        html += '<h3 class="herald-release-title">' + esc(rel.title) + '</h3>';
      }
      if (rel.summary) {
        html += '<div class="herald-summary">' + renderContent(rel.summary) + '</div>';
      }
      // Entries grouped by category
      var grouped = groupByCategory(rel.entries || []);
      for (var ci = 0; ci < CATEGORY_ORDER.length; ci++) {
        var cat = CATEGORY_ORDER[ci];
        if (grouped[cat]) {
          html += renderEntryGroup(cat, grouped[cat]);
        }
      }
      html += '</div>';
    }

    // Standalone entries
    if (displayStandalone.length > 0) {
      html += '<div class="herald-standalone-title">Other Updates</div>';
      html += '<div class="herald-standalone">';
      var sGrouped = groupByCategory(displayStandalone);
      for (var si = 0; si < CATEGORY_ORDER.length; si++) {
        var sCat = CATEGORY_ORDER[si];
        if (sGrouped[sCat]) {
          html += renderEntryGroup(sCat, sGrouped[sCat]);
        }
      }
      html += '</div>';
    }

    // View more link
    if (isLimited && data.changelogUrl) {
      html += '<div class="herald-view-more">';
      html += '<a href="' + esc(data.changelogUrl) + '" target="_blank" rel="noopener noreferrer">View all updates &rarr;</a>';
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  // ─── Inline render: fetch JSON and inject DOM ───

  function renderInline(target: HTMLElement): void {
    if (target.querySelector('.herald-changelog')) return;

    injectStyles();

    var limitAttr = target.getAttribute('data-herald-limit');
    var limit = limitAttr && /^\d+$/.test(limitAttr) ? parseInt(limitAttr, 10) : undefined;

    var xhr = new XMLHttpRequest();
    xhr.open('GET', heraldOrigin + '/embed.json');
    xhr.onload = function () {
      if (xhr.status === 200) {
        try {
          var data = JSON.parse(xhr.responseText);
          target.innerHTML = buildInlineHTML(data, limit);
        } catch (e) {
          // Silent fail
        }
      }
    };
    xhr.send();
  }

  // ─── Iframe mode ───

  function createIframe(container: HTMLElement): HTMLIFrameElement {
    var iframe = document.createElement('iframe');
    var limit = container.getAttribute('data-herald-limit');
    iframe.src = limit && /^\d+$/.test(limit) ? embedBaseUrl + '#limit=' + limit : embedBaseUrl;
    iframe.style.width = '100%';
    iframe.style.border = 'none';
    iframe.style.overflow = 'hidden';
    iframe.style.display = 'block';
    iframe.style.minHeight = '200px';
    iframe.style.colorScheme = 'normal';
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('title', 'Changelog');
    iframe.setAttribute('allowtransparency', 'true');
    iframe.dataset.heraldIframe = 'true';
    container.appendChild(iframe);
    return iframe;
  }

  function renderIframe(target: HTMLElement): void {
    if (target.querySelector('iframe[data-herald-iframe]')) return;
    createIframe(target);
  }

  // ─── Unified render ───

  function render(target: HTMLElement): void {
    if (target.hasAttribute('data-herald-inline')) {
      renderInline(target);
    } else {
      renderIframe(target);
    }
  }

  // Listen for resize messages from embed iframes
  window.addEventListener('message', function (event) {
    if (event.origin !== heraldOrigin) return;
    var data = event.data;
    if (!data || data.type !== 'herald-resize' || typeof data.height !== 'number') return;

    var iframes = document.querySelectorAll<HTMLIFrameElement>('iframe[data-herald-iframe]');
    for (var i = 0; i < iframes.length; i++) {
      if (iframes[i].contentWindow === event.source) {
        iframes[i].style.height = data.height + 'px';
        break;
      }
    }
  });

  function init(): void {
    var targets = document.querySelectorAll<HTMLElement>('[data-herald-widget]');

    if (targets.length > 0) {
      for (var i = 0; i < targets.length; i++) {
        render(targets[i]);
      }
    } else if (currentScript && currentScript.parentNode) {
      var container = document.createElement('div');
      container.dataset.heraldWidget = '';
      currentScript.parentNode.insertBefore(container, currentScript.nextSibling);
      render(container);
    }
  }

  // Expose global API
  (window as any).Herald = { render: render };

  // Run init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
