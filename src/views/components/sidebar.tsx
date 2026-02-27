import type { FC } from 'hono/jsx';

interface SidebarProps {
  currentPath?: string;
  githubUser?: string;
}

export const Sidebar: FC<SidebarProps> = ({
  currentPath = '',
  githubUser,
}) => {
  const isActive = (href: string): boolean => {
    if (href === '/admin') {
      return currentPath === '/admin' || currentPath === '/admin/';
    }
    return currentPath?.startsWith(href) ?? false;
  };

  return (
    <aside class="sidebar">
      <div class="sidebar-header">
        <a href="/admin" class="sidebar-brand">Herald</a>
      </div>
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
        <a href="/admin/settings" class={isActive('/admin/settings') ? 'active' : ''}>
          <svg class="nav-icon" width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round">
            <path d="M2 4h3M9 4h5" />
            <path d="M2 8h7M13 8h1" />
            <path d="M2 12h1M7 12h7" />
            <circle cx="7" cy="4" r="1.5" />
            <circle cx="11.5" cy="8" r="1.5" />
            <circle cx="4.5" cy="12" r="1.5" />
          </svg>
          Settings
        </a>
      </nav>
      <div class="sidebar-footer">
        <a href="/" class="sidebar-footer-link" target="_blank" rel="noopener">
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
