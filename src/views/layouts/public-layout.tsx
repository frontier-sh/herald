import type { FC } from 'hono/jsx';
import { ClientHead, ClientBody } from '../components/client-assets';

interface PublicLayoutProps {
  children: any;
  title?: string;
  description?: string;
  projectName?: string;
  logoUrl?: string | null;
  faviconUrl?: string | null;
}

export const PublicLayout: FC<PublicLayoutProps> = ({
  children,
  title,
  description,
  projectName,
  logoUrl,
  faviconUrl,
}) => {
  const displayName = projectName || 'Changelog';
  const pageTitle = title ? `${title} - ${displayName}` : displayName;
  const metaDescription = description || `${displayName} - Stay up to date with the latest changes.`;

  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{pageTitle}</title>
        <meta name="description" content={metaDescription} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:type" content="website" />
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossorigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200..800&family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <link rel="alternate" type="application/rss+xml" title={`${displayName} RSS Feed`} href="/feed.xml" />
        {faviconUrl && <link rel="icon" href={faviconUrl} />}
        <ClientHead />
      </head>
      <body class="public-body">
        <div class="public-layout">
          <header class="public-header">
            <div class="public-header-inner">
              <a href="/" class="public-brand">
                {logoUrl ? (
                  <img src={logoUrl} alt={displayName} class="public-brand-logo" />
                ) : (
                  displayName
                )}
              </a>
              <a href="/feed.xml" class="rss-link" title="RSS Feed" target="_blank" rel="noopener">
                <svg class="rss-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="6.18" cy="17.82" r="2.18" />
                  <path d="M4 4.44v2.83c7.03 0 12.73 5.7 12.73 12.73h2.83c0-8.59-6.97-15.56-15.56-15.56zm0 5.66v2.83c3.9 0 7.07 3.17 7.07 7.07h2.83c0-5.47-4.43-9.9-9.9-9.9z" />
                </svg>
                <span>RSS</span>
              </a>
            </div>
          </header>
          <main class="public-main">
            <div class="public-container">
              {children}
            </div>
          </main>
          <footer class="public-footer">
            <div class="public-footer-inner">
              <span class="powered-by">Powered by <a href="https://github.com" target="_blank" rel="noopener noreferrer">Herald</a></span>
            </div>
          </footer>
        </div>
        <ClientBody />
      </body>
    </html>
  );
};
