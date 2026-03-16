import type { FC } from 'hono/jsx';
import { ClientHead } from '../components/client-assets';
import { html } from 'hono/html';

interface EmbedLayoutProps {
  children: any;
  faviconUrl?: string | null;
  theme?: string;
}

export const EmbedLayout: FC<EmbedLayoutProps> = ({ children, faviconUrl, theme }) => {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200..800&family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        {faviconUrl && <link rel="icon" href={faviconUrl} />}
        <ClientHead />
      </head>
      <body class="embed-body">
        <div class="embed-container" data-theme={theme || 'herald'}>
          {children}
        </div>
        {html`<script>
          (function() {
            function sendHeight() {
              var height = document.documentElement.scrollHeight;
              parent.postMessage({ type: 'herald-resize', height: height }, '*');
            }

            if (typeof ResizeObserver !== 'undefined') {
              new ResizeObserver(function() { sendHeight(); }).observe(document.body);
            }

            sendHeight();
            window.addEventListener('load', sendHeight);

            // Limit logic: read #limit=N from hash, hide excess items, show "view more"
            (function() {
              var hash = window.location.hash;
              var match = hash.match(/limit=(\d+)/);
              if (!match) return;
              var limit = parseInt(match[1], 10);
              if (!limit || limit < 1) return;

              var items = document.querySelectorAll('.timeline-item');
              if (items.length <= limit) return;

              for (var i = limit; i < items.length; i++) {
                items[i].style.display = 'none';
              }

              var changelogUrl = window.location.origin;
              var container = document.querySelector('.changelog-timeline');
              if (container) {
                var viewMore = document.createElement('div');
                viewMore.className = 'changelog-view-more';
                var link = document.createElement('a');
                link.href = changelogUrl;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.className = 'changelog-view-more-link';
                link.innerHTML = 'View all updates &rarr;';
                viewMore.appendChild(link);
                container.appendChild(viewMore);
              }
            })();

            // Category filter logic
            document.addEventListener('DOMContentLoaded', function() {
              var filtersContainer = document.getElementById('category-filters');
              if (!filtersContainer) return;

              var pills = filtersContainer.querySelectorAll('.category-pill');
              var entryGroups = document.querySelectorAll('.entry-group');

              pills.forEach(function(pill) {
                pill.addEventListener('click', function() {
                  var category = pill.getAttribute('data-category');
                  pills.forEach(function(p) { p.classList.remove('active'); });
                  pill.classList.add('active');
                  entryGroups.forEach(function(group) {
                    var groupCategory = group.getAttribute('data-category');
                    if (category === 'all' || groupCategory === category) {
                      group.style.display = '';
                    } else {
                      group.style.display = 'none';
                    }
                  });
                  setTimeout(sendHeight, 50);
                });
              });
            });
          })();
        </script>`}
      </body>
    </html>
  );
};
