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
            <table class="apps-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th class="apps-col-fit">URL</th>
                  <th class="apps-col-fit apps-col-num">Entries</th>
                  <th class="apps-col-fit apps-col-actions">
                    <span class="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {apps.map((app) => {
                  const basePath = appBasePath(app);
                  const isCurrent = app.id === currentAppId;
                  return (
                    <tr>
                      <td>
                        <div class="apps-name">
                          <a href={`/admin/apps/${app.id}`} class="apps-name-link">
                            {app.name}
                          </a>
                          {app.is_default ? (
                            <span class="badge badge-published">Default</span>
                          ) : null}
                          {isCurrent ? (
                            <span class="badge badge-changed">Selected</span>
                          ) : null}
                        </div>
                        {app.description ? (
                          <p class="apps-description" title={app.description}>
                            {app.description}
                          </p>
                        ) : null}
                      </td>
                      <td class="apps-col-fit">
                        <a
                          href={`${baseUrl}${basePath}/`}
                          target="_blank"
                          rel="noopener"
                          class="apps-url"
                          title={`${baseUrl}${basePath}/`}
                        >
                          <code>{basePath || '/'}</code>
                        </a>
                      </td>
                      <td class="apps-col-fit apps-col-num">
                        {(entryCounts[app.id] ?? 0).toLocaleString('en-US')}
                      </td>
                      <td class="apps-col-fit apps-col-actions">
                        {/* Edit is always last so it lines up down the column;
                            actions that don't apply to a row are left out. */}
                        <div class="table-actions">
                          {app.is_default ? null : (
                            <button
                              type="button"
                              class="btn btn-ghost-danger btn-sm"
                              data-delete-app-url={`/admin/apps/${app.id}/delete`}
                              data-delete-app-name={app.name}
                            >
                              Delete
                            </button>
                          )}
                          {app.is_default ? null : (
                            <form method="post" action={`/admin/apps/${app.id}/default`}>
                              <button type="submit" class="btn btn-ghost btn-sm">
                                Make default
                              </button>
                            </form>
                          )}
                          {isCurrent ? null : (
                            <form method="post" action="/admin/apps/switch">
                              <input type="hidden" name="app_id" value={String(app.id)} />
                              <input type="hidden" name="redirect_to" value="/admin/apps" />
                              <button type="submit" class="btn btn-secondary btn-sm">
                                Switch
                              </button>
                            </form>
                          )}
                          <a href={`/admin/apps/${app.id}`} class="btn btn-secondary btn-sm">
                            Edit
                          </a>
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
