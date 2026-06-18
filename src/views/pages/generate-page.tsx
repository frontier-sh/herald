import type { FC } from 'hono/jsx';
import type { CommitInfo } from '../../services/github-commits';
import { inferCategory } from '../../services/entries';
import { CATEGORIES } from '../../db/schema';

interface GeneratePageProps {
  sourceRepo: string | null;
  aiEnabled: boolean;
  /** Present once a fetch has run. */
  commits?: CommitInfo[];
  /** True when a fetch was attempted (so we can show an empty state). */
  fetched?: boolean;
  mode?: 'count' | 'range';
  count?: number;
  since?: string;
  until?: string;
  excludeMerges?: boolean;
  error?: string;
}

const shortSha = (sha: string): string => sha.slice(0, 7);

const formatDate = (dateStr: string): string => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

export const GeneratePage: FC<GeneratePageProps> = ({
  sourceRepo,
  aiEnabled,
  commits,
  fetched,
  mode = 'count',
  count = 20,
  since = '',
  until = '',
  excludeMerges = false,
  error,
}) => {
  return (
    <div>
      <div class="page-header">
        <h1>Generate from commits</h1>
      </div>

      <p class="text-muted" style="margin-bottom: 1.5rem;">
        Pull recent commits from your source repository and turn the selected
        ones into draft changelog entries
        {aiEnabled ? ', cleaned up by AI.' : '. Enable AI in Settings to have each entry polished automatically.'}
      </p>

      {!sourceRepo ? (
        <div class="empty-state">
          <h3>No source repository configured</h3>
          <p>
            Choose which repository to read commits from in{' '}
            <a href="/admin/settings">Settings</a>.
          </p>
          <a href="/admin/settings" class="btn btn-primary">Go to Settings</a>
        </div>
      ) : (
        <>
          {error && (
            <div class="alert alert-warning" role="alert" style="margin-bottom: 1.5rem;">
              {error}
            </div>
          )}

          <div class="settings-section">
            <div class="settings-section-body">
              <p class="text-sm text-muted" style="margin-bottom: 1rem;">
                Source repository: <strong>{sourceRepo}</strong>{' '}
                (<a href="/admin/settings">change</a>)
              </p>
              <form method="get" action="/admin/generate" class="generate-fetch-form">
                <div class="form-group">
                  <label for="mode" class="form-label">Fetch by</label>
                  <select id="mode" name="mode" class="form-select" data-generate-mode>
                    <option value="count" selected={mode === 'count'}>Number of recent commits</option>
                    <option value="range" selected={mode === 'range'}>Date range</option>
                  </select>
                </div>

                <div class="form-group" data-mode-count style={mode === 'count' ? '' : 'display:none;'}>
                  <label for="count" class="form-label">Number of commits</label>
                  <input
                    type="number"
                    id="count"
                    name="count"
                    class="form-input"
                    min="1"
                    max="200"
                    value={String(count)}
                  />
                </div>

                <div data-mode-range style={mode === 'range' ? '' : 'display:none;'}>
                  <div class="form-group form-group-half">
                    <label for="since" class="form-label">From</label>
                    <input type="date" id="since" name="since" class="form-input" value={since} />
                  </div>
                  <div class="form-group form-group-half">
                    <label for="until" class="form-label">To</label>
                    <input type="date" id="until" name="until" class="form-input" value={until} />
                  </div>
                </div>

                <div class="form-group">
                  <label class="form-label" style="display:flex; align-items:center; gap:0.5rem; cursor:pointer; font-weight:normal;">
                    <input type="checkbox" name="exclude_merges" value="true" checked={excludeMerges} />
                    Exclude merge commits
                  </label>
                </div>

                <div class="form-actions-right">
                  <button type="submit" class="btn btn-primary">Fetch commits</button>
                </div>
              </form>
            </div>
          </div>

          {fetched && commits && commits.length > 0 && (
            <form method="post" action="/admin/generate" class="generate-commits-form" style="margin-top: 1.5rem;">
              <div class="section-header">
                <h2>{commits.length} commit{commits.length === 1 ? '' : 's'} found</h2>
                <label class="text-sm" style="cursor:pointer;">
                  <input type="checkbox" data-select-all checked /> Select all
                </label>
              </div>

              <div class="table-container">
                <table>
                  <thead>
                    <tr>
                      <th style="width: 2rem;"></th>
                      <th>Commit</th>
                      <th style="width: 9rem;">Category</th>
                      <th style="width: 8rem;">Author</th>
                      <th style="width: 7rem;">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commits.map((commit) => (
                      <tr>
                        <td>
                          <input
                            type="checkbox"
                            name="selected"
                            value={commit.sha}
                            checked
                            data-commit-checkbox
                          />
                          <input type="hidden" name={`title_${commit.sha}`} value={commit.title} />
                          <input type="hidden" name={`message_${commit.sha}`} value={commit.message} />
                          <input type="hidden" name={`url_${commit.sha}`} value={commit.url} />
                          <input type="hidden" name={`date_${commit.sha}`} value={commit.date} />
                        </td>
                        <td>
                          <div>
                            <strong>{commit.title || '(no message)'}</strong>
                            {commit.isMerge && (
                              <span class="text-muted text-sm"> · merge</span>
                            )}
                          </div>
                          <a
                            href={commit.url}
                            target="_blank"
                            rel="noopener"
                            class="text-muted text-sm"
                            style="font-family: monospace;"
                          >
                            {shortSha(commit.sha)}
                          </a>
                        </td>
                        <td>
                          <select name={`category_${commit.sha}`} class="form-select">
                            {aiEnabled && (
                              <option value="" selected>
                                Auto (AI decides)
                              </option>
                            )}
                            {CATEGORIES.map((cat) => (
                              <option
                                value={cat}
                                selected={!aiEnabled && cat === inferCategory(commit.title)}
                              >
                                {cat.charAt(0).toUpperCase() + cat.slice(1)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td class="text-muted text-sm">{commit.author}</td>
                        <td class="text-muted text-sm">{formatDate(commit.date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div class="form-actions-right" style="margin-top: 1rem;">
                <button type="submit" class="btn btn-primary">
                  Generate drafts
                </button>
              </div>
            </form>
          )}

          {fetched && commits && commits.length === 0 && (
            <div class="empty-state" style="margin-top: 1.5rem;">
              <h3>No commits found</h3>
              <p>Try a larger number of commits or a wider date range.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
};
