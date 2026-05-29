// GitHub App manifest used by the setup wizard.
// When permissions change, bump EXPECTED_MANIFEST_VERSION in github-app.ts.
export function buildManifest(baseUrl: string): Record<string, unknown> {
  return {
    name: 'Herald Changelog',
    url: baseUrl,
    description: 'Self-hosted changelog admin for this repository.',
    public: false,
    redirect_url: `${baseUrl}/setup/callback`,
    callback_urls: [`${baseUrl}/auth/github/callback`],
    setup_url: `${baseUrl}/setup/installed`,
    setup_on_update: false,
    request_oauth_on_install: false,
    default_permissions: {
      metadata: 'read',
      // Needed to read commits from the source repository when generating
      // changelog entries from recent commits (see github-commits.ts).
      contents: 'read',
    },
    default_events: [],
  };
}
