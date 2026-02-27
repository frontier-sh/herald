const GITHUB_API = 'https://api.github.com';
const GITHUB_AUTH = 'https://github.com/login/oauth';
const USER_AGENT = 'Herald-Changelog';

/**
 * Build the GitHub OAuth authorization URL.
 */
export function getGitHubAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'repo read:org',
    state,
  });
  return `${GITHUB_AUTH}/authorize?${params.toString()}`;
}

/**
 * Exchange an authorization code for an access token.
 */
export async function exchangeCodeForToken(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<string | null> {
  const res = await fetch(`${GITHUB_AUTH}/access_token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) return null;

  const data = (await res.json()) as { access_token?: string; error?: string };
  return data.access_token ?? null;
}

/**
 * Fetch the authenticated GitHub user's profile.
 */
export async function getGitHubUser(
  accessToken: string,
): Promise<{ login: string; avatar_url: string } | null> {
  const res = await fetch(`${GITHUB_API}/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': USER_AGENT,
    },
  });

  if (!res.ok) return null;

  const data = (await res.json()) as { login: string; avatar_url: string };
  if (!data.login) return null;
  return { login: data.login, avatar_url: data.avatar_url };
}

/**
 * Check whether the authenticated user has access to a repository.
 * For private repos, returns true only if the user is a collaborator.
 * For public repos, any authenticated user will have access.
 *
 * Note: If the repository belongs to a GitHub organization with OAuth app
 * access restrictions, the OAuth app must be approved by an org owner.
 * See: https://docs.github.com/en/organizations/managing-oauth-access-to-your-organizations-data
 */
export async function checkRepoAccess(
  accessToken: string,
  repo: string,
): Promise<boolean> {
  const res = await fetch(`${GITHUB_API}/repos/${repo}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': USER_AGENT,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(
      `checkRepoAccess failed for "${repo}": ${res.status} ${res.statusText} — ${body}`,
    );
    if (res.status === 403) {
      console.error(
        'Hint: If this repo belongs to a GitHub organization, the organization may need to approve this OAuth app. ' +
          'Visit https://github.com/settings/connections/applications/<client_id> and request org access, ' +
          'or ask an org owner to approve it under Organization Settings > Third-party access.',
      );
    }
  }

  return res.ok;
}
