import type { FC } from 'hono/jsx';

interface Step3GitHubProps {
  repoName?: string;
}

export const Step3GitHub: FC<Step3GitHubProps> = ({ repoName }) => {
  return (
    <div>
      <h2 class="onboarding-heading">Connect GitHub</h2>
      <p class="form-hint">Automatically create changelog entries from your commits and pull requests.</p>

      {repoName && (
        <div class="onboarding-info-card">
          <div class="onboarding-info-label">Connected Repository</div>
          <code class="onboarding-info-value">{repoName}</code>
        </div>
      )}

      <div class="onboarding-instructions">
        <p class="form-label">Add the Herald GitHub Action to your repository:</p>
        <div class="onboarding-code-block">
          <pre><code>{`# .github/workflows/herald.yml
name: Herald Changelog

on:
  pull_request:
    types: [closed]

jobs:
  changelog:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Create changelog entry
        run: |
          curl -X POST \\
            "\${HERALD_URL}/api/entries" \\
            -H "Authorization: Bearer \${HERALD_API_KEY}" \\
            -H "Content-Type: application/json" \\
            -d '{
              "title": "'"$\{github.event.pull_request.title}"'",
              "content": "'"$\{github.event.pull_request.body}"'",
              "category": "changed"
            }'
        env:
          HERALD_URL: \${{ secrets.HERALD_URL }}
          HERALD_API_KEY: \${{ secrets.HERALD_API_KEY }}`}</code></pre>
        </div>
        <p class="form-hint">You can configure this later from Settings. Skip this step if you prefer to manage your changelog manually.</p>
      </div>

      <div class="onboarding-footer">
        <a href="/admin/onboarding/2" class="btn btn-secondary">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;">
            <path d="M10 3l-5 5 5 5" />
          </svg>
          Back
        </a>
        <div class="onboarding-footer-right">
          <a href="/admin/onboarding/4" class="btn btn-secondary">Skip</a>
          <a href="/admin/onboarding/4" class="btn btn-primary">
            Next
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 4px;">
              <path d="M6 3l5 5-5 5" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
};
