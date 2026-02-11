import type { FC } from 'hono/jsx';

interface AdminLoginProps {
  error?: string;
}

export const AdminLogin: FC<AdminLoginProps> = ({ error }) => {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Login - Herald Admin</title>
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
        <link rel="stylesheet" href="/assets/main.css" />
      </head>
      <body class="login-body">
        <div class="login-container">
          <div class="login-card">
            <div class="login-header">
              <h1 class="login-brand">Herald</h1>
              <p class="login-subtitle">Changelog Administration</p>
            </div>
            {error && (
              <div class="alert alert-danger">
                <span>{error}</span>
              </div>
            )}
            <form method="post" action="/admin/login" class="login-form">
              <div class="form-group">
                <label for="password" class="form-label">
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  class="form-input"
                  required
                  autofocus
                  placeholder="Enter admin password"
                />
              </div>
              <button type="submit" class="btn btn-primary btn-lg login-btn">
                Sign In
              </button>
            </form>
          </div>
        </div>
      </body>
    </html>
  );
};
