import type { FC } from 'hono/jsx';
import type { App } from '../../db/schema';
import { SettingsSection } from '../components/settings-form';
import { appBasePath } from '../../services/apps';

interface AppsListProps {
  apps: App[];
  /** The app the admin UI is currently acting on. */
  currentAppId: number;
  entryCounts: Record<number, number>;
  baseUrl: string;
}

export const AppsList: FC<AppsListProps> = ({
  apps,
  currentAppId,
  entryCounts,
  baseUrl,
}) => {
  return (
    <div>
      <div class="page-header">
        <h1>Apps</h1>
        <a href="/admin/apps/new" class="btn btn-primary">
          + New App
        </a>
      </div>

      <SettingsSection
        title="All apps"
        description="Each app is its own changelog with its own URL, branding, source repository, Slack channel and API keys. The default app is served at the site root."
      >
        {apps.length > 0 ? (
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>URL</th>
                  <th>Entries</th>
                  <th class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {apps.map((app) => {
                  const basePath = appBasePath(app);
                  return (
                    <tr>
                      <td>
                        <a href={`/admin/apps/${app.id}`}>
                          <strong>{app.name}</strong>
                        </a>{' '}
                        {app.is_default ? (
                          <span class="badge badge-published">Default</span>
                        ) : null}{' '}
                        {app.id === currentAppId ? (
                          <span class="badge badge-changed">Selected</span>
                        ) : null}
                        {app.description ? (
                          <div class="text-muted text-sm">{app.description}</div>
                        ) : null}
                      </td>
                      <td class="text-sm">
                        <a href={`${baseUrl}${basePath}`} target="_blank" rel="noopener">
                          <code>{basePath || '/'}</code>
                        </a>
                      </td>
                      <td class="text-muted text-sm">{entryCounts[app.id] ?? 0}</td>
                      <td class="text-right">
                        <div class="table-actions">
                          {app.id === currentAppId ? null : (
                            <form method="post" action="/admin/apps/switch" style="margin: 0;">
                              <input type="hidden" name="app_id" value={String(app.id)} />
                              <input type="hidden" name="redirect_to" value="/admin/apps" />
                              <button type="submit" class="btn btn-secondary btn-sm">
                                Switch to
                              </button>
                            </form>
                          )}
                          {app.is_default ? null : (
                            <form
                              method="post"
                              action={`/admin/apps/${app.id}/default`}
                              style="margin: 0;"
                            >
                              <button type="submit" class="btn btn-ghost btn-sm">
                                Make default
                              </button>
                            </form>
                          )}
                          <a href={`/admin/apps/${app.id}`} class="btn btn-ghost btn-sm">
                            Edit
                          </a>
                          {app.is_default ? null : (
                            <button
                              type="button"
                              class="btn btn-danger btn-sm"
                              data-delete-app-url={`/admin/apps/${app.id}/delete`}
                              data-delete-app-name={app.name}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div class="empty-state">
            <h3>No apps yet</h3>
            <p>Create your first app to start publishing a changelog.</p>
            <a href="/admin/apps/new" class="btn btn-primary">
              + Create App
            </a>
          </div>
        )}
      </SettingsSection>
    </div>
  );
};
