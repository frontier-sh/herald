import type { FC } from 'hono/jsx';
import { ClientHead } from '../components/client-assets';

interface SetupRequiredProps {
  missing: string[];
}

export const SetupRequired: FC<SetupRequiredProps> = ({ missing }) => {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Setup Required - Herald</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossorigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
        <ClientHead />
      </head>
      <body class="login-body">
        <div class="login-container">
          <div class="login-card">
            <div class="login-header">
              <h1 class="login-brand">Herald</h1>
              <p class="login-subtitle">Setup Required</p>
            </div>
            <p class="setup-text">
              Herald needs GitHub OAuth credentials before the admin panel can be
              used. The following secrets are not configured:
            </p>
            <ul class="setup-list">
              {missing.map((v) => (
                <li>
                  <code>{v}</code>
                </li>
              ))}
            </ul>
            <div class="setup-instructions">
              <p class="setup-text">Set them with the Wrangler CLI:</p>
              <pre class="setup-code">
                <code>
                  {missing.map((v) => `wrangler secret put ${v}`).join('\n')}
                </code>
              </pre>
              <p class="setup-text">
                See the{' '}
                <a
                  href="https://github.com/frontier-sh/herald#authentication"
                  class="setup-link"
                >
                  setup guide
                </a>{' '}
                for details.
              </p>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
};
