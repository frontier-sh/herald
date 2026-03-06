// Herald Embeddable Changelog Widget Loader
// Zero dependencies — runs on customer websites
// Usage: <script async src="https://your-herald.com/embed.js"></script>

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

  function buildEmbedUrl(container: HTMLElement): string {
    var url = embedBaseUrl;
    var limit = container.getAttribute('data-herald-limit');
    if (limit && /^\d+$/.test(limit)) {
      url += '?limit=' + limit;
    }
    return url;
  }

  function createIframe(container: HTMLElement): HTMLIFrameElement {
    var iframe = document.createElement('iframe');
    iframe.src = buildEmbedUrl(container);
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

  function render(target: HTMLElement): void {
    if (target.querySelector('iframe[data-herald-iframe]')) return;
    createIframe(target);
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
