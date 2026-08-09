import type { FC } from 'hono/jsx';
import type { App } from '../../db/schema';
import { appBasePath } from '../../services/apps';

interface SidebarProps {
  currentPath?: string;
  githubUser?: string;
  logoUrl?: string | null;
  /** App the admin UI is acting on. Absent only on the login page. */
  currentApp?: App;
  /** Every app, for the switcher. */
  apps?: App[];
}

/** Switch the app every admin page reads and writes. Works without JavaScript. */
const AppSwitcher: FC<{ currentApp: App; apps: App[]; currentPath: string }> = ({
  currentApp,
  apps,
  currentPath,
}) => {
  const pathLabel = (app: App): string => appBasePath(app) || '/';

  return (
    <div class="app-switcher" data-app-switcher>
      <button
        type="button"
        class="app-switcher-trigger"
        data-app-switcher-toggle
        aria-haspopup="true"
        aria-expanded="false"
      >
        <span class="app-switcher-current">
          <span class="app-switcher-name">{currentApp.name}</span>
          <span class="app-switcher-path">{pathLabel(currentApp)}</span>
        </span>
        <svg
          class="app-switcher-chevron"
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M4.5 6.5L8 10l3.5-3.5" />
        </svg>
      </button>

      <div class="app-switcher-menu" data-app-switcher-menu hidden>
        <form method="post" action="/admin/apps/switch">
          {/* Switching lands on the same section of the newly selected app —
              a record id from the previous app wouldn't resolve there. */}
          <input type="hidden" name="redirect_to" value={currentPath} />
          {apps.map((app) => (
            <button
              type="submit"
              name="app_id"
              value={String(app.id)}
              class={`app-switcher-item${app.id === currentApp.id ? ' active' : ''}`}
            >
              <span class="app-switcher-item-name">{app.name}</span>
              <span class="app-switcher-item-path">{pathLabel(app)}</span>
            </button>
          ))}
        </form>
        <a href="/admin/apps" class="app-switcher-manage">
          Manage apps
        </a>
      </div>
    </div>
  );
};

export const Sidebar: FC<SidebarProps> = ({
  currentPath = '',
  githubUser,
  logoUrl,
  currentApp,
  apps = [],
}) => {
  // Every destination in the nav below, so a nested one (/admin/settings/instance)
  // can win over its parent (/admin/settings) instead of lighting up both.
  const navHrefs = [
    '/admin',
    '/admin/entries',
    '/admin/generate',
    '/admin/releases',
    '/admin/customise',
    '/admin/apps',
    '/admin/settings',
    '/admin/settings/instance',
  ];

  const matches = (href: string): boolean => {
    if (href === '/admin') {
      return currentPath === '/admin' || currentPath === '/admin/';
    }
    return currentPath === href || currentPath.startsWith(`${href}/`);
  };

  const isActive = (href: string): boolean => {
    if (!matches(href)) return false;
    // A longer matching entry is the more specific destination — defer to it.
    return !navHrefs.some((other) => other.length > href.length && matches(other));
  };

  // The public changelog of the current app, not necessarily the site root.
  const changelogUrl = (currentApp ? appBasePath(currentApp) : '') || '/';

  return (
    <aside class="sidebar">
      <div class="sidebar-header">
        {logoUrl ? (
          <a href="/admin" class="sidebar-brand sidebar-brand--custom">
            <img src={logoUrl} alt="Logo" class="sidebar-brand-logo" />
            <span class="sidebar-brand-byline">Herald</span>
          </a>
        ) : (
          <a href="/admin" class="sidebar-brand">Herald</a>
        )}
      </div>
      {currentApp && (
        <AppSwitcher currentApp={currentApp} apps={apps} currentPath={currentPath} />
      )}
      <nav class="sidebar-nav">
        <a href="/admin" class={isActive('/admin') ? 'active' : ''}>
          <svg class="nav-icon" width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25">
            <rect x="1" y="1" width="5.5" height="5.5" rx="1" />
            <rect x="9.5" y="1" width="5.5" height="5.5" rx="1" />
            <rect x="1" y="9.5" width="5.5" height="5.5" rx="1" />
            <rect x="9.5" y="9.5" width="5.5" height="5.5" rx="1" />
          </svg>
          Dashboard
        </a>
        <a href="/admin/entries" class={isActive('/admin/entries') ? 'active' : ''}>
          <svg class="nav-icon" width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round">
            <path d="M2.5 4h11M2.5 8h11M2.5 12h7" />
          </svg>
          Entries
        </a>
        <a href="/admin/generate" class={isActive('/admin/generate') ? 'active' : ''}>
          <svg class="nav-icon" width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 5a3 1.5 0 0 0 6 0 3 1.5 0 0 0-6 0v6a3 1.5 0 0 0 6 0V5" />
            <path d="M11.5 8.5l1.25 1.25L15 7.25" />
          </svg>
          Generate
        </a>
        <a href="/admin/releases" class={isActive('/admin/releases') ? 'active' : ''}>
          <svg class="nav-icon" width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25">
            <path d="M1.5 3.5a2 2 0 0 1 2-2h3.672a2 2 0 0 1 1.414.586l5.828 5.828a2 2 0 0 1 0 2.828l-3.672 3.672a2 2 0 0 1-2.828 0L2.086 8.586A2 2 0 0 1 1.5 7.172V3.5z" />
            <circle cx="5" cy="5" r=".75" fill="currentColor" />
          </svg>
          Releases
        </a>
        <a href="/admin/customise" class={isActive('/admin/customise') ? 'active' : ''}>
          <svg class="nav-icon" width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
            <path d="M13.5 2.5a2 2 0 0 0-2.83 0L5.5 7.67l2.83 2.83 5.17-5.17a2 2 0 0 0 0-2.83z" />
            <path d="M5.5 7.67L3 12.5a1 1 0 0 0 1.17 1.37l4.33-1.37" />
          </svg>
          Customise
        </a>
        <a href="/admin/apps" class={isActive('/admin/apps') ? 'active' : ''}>
          <svg class="nav-icon" width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round">
            <rect x="1.5" y="4.5" width="9" height="7" rx="1.5" />
            <path d="M4.5 2.5h8a2 2 0 0 1 2 2v6" />
          </svg>
          Apps
        </a>
        <a href="/admin/settings" class={isActive('/admin/settings') ? 'active' : ''}>
          <svg class="nav-icon" width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round">
            <path d="M2 4h3M9 4h5" />
            <path d="M2 8h7M13 8h1" />
            <path d="M2 12h1M7 12h7" />
            <circle cx="7" cy="4" r="1.5" />
            <circle cx="11.5" cy="8" r="1.5" />
            <circle cx="4.5" cy="12" r="1.5" />
          </svg>
          App Settings
        </a>
        <a href="/admin/settings/instance" class={isActive('/admin/settings/instance') ? 'active' : ''}>
          <svg class="nav-icon" width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
            <rect x="1.5" y="2" width="13" height="5" rx="1.25" />
            <rect x="1.5" y="9" width="13" height="5" rx="1.25" />
            <path d="M4 4.5h.01M4 11.5h.01" />
          </svg>
          Herald Settings
        </a>
      </nav>
      <div class="sidebar-footer">
        <a href={changelogUrl} class="sidebar-footer-link" target="_blank" rel="noopener">
          View Changelog &rarr;
        </a>
        {githubUser && (
          <div class="sidebar-user">
            <span class="sidebar-username">{githubUser}</span>
            <form method="post" action="/auth/logout" style="display:inline;">
              <button type="submit" class="sidebar-footer-link sidebar-logout-btn">
                Sign out
              </button>
            </form>
          </div>
        )}
      </div>
    </aside>
  );
};
