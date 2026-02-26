import type { FC } from 'hono/jsx';

interface SidebarProps {
  currentPath?: string;
  githubUser?: string;
}

export const Sidebar: FC<SidebarProps> = ({
  currentPath = '',
  githubUser,
}) => {
  const navItems = [
    { href: '/admin', label: 'Dashboard', icon: '\u2302' },
    { href: '/admin/entries', label: 'Entries', icon: '\u2630' },
    { href: '/admin/releases', label: 'Releases', icon: '\u2696' },
    { href: '/admin/settings', label: 'Settings', icon: '\u2699' },
  ];

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
        {navItems.map((item) => (
          <a
            href={item.href}
            class={isActive(item.href) ? 'active' : ''}
          >
            <span class="nav-icon">{item.icon}</span>
            {item.label}
          </a>
        ))}
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
