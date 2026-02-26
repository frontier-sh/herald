import type { FC } from 'hono/jsx';
import { ClientHead } from '../components/client-assets';
import { html } from 'hono/html';

interface EmbedLayoutProps {
  children: any;
}

export const EmbedLayout: FC<EmbedLayoutProps> = ({ children }) => {
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
        <ClientHead />
      </head>
      <body class="embed-body">
        <div class="embed-container">
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
