import type { FC } from 'hono/jsx';
import { Sidebar } from '../components/sidebar';
import { FlashMessageBanner } from '../components/flash-message';
import type { FlashMessage } from '../../middleware/flash';

interface AdminLayoutProps {
  children: any;
  title?: string;
  currentPath?: string;
  flash?: FlashMessage | null;
}

export const AdminLayout: FC<AdminLayoutProps> = ({
  children,
  title,
  currentPath,
  flash,
}) => {
  const pageTitle = title ? `${title} - Herald Admin` : 'Herald Admin';

  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{pageTitle}</title>
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
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/easymde/dist/easymde.min.css"
        />
        <link rel="stylesheet" href="/assets/main.css" />
      </head>
      <body>
        <div class="layout">
          <Sidebar currentPath={currentPath} />
          <main class="main-content">
            <div class="content-container">
              {flash && (
                <FlashMessageBanner type={flash.type} message={flash.message} />
              )}
              {children}
            </div>
          </main>
        </div>
        <script src="https://cdn.jsdelivr.net/npm/easymde/dist/easymde.min.js" defer></script>
        <script src="/assets/main.js" defer></script>
      </body>
    </html>
  );
};
