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
    scope: 'repo',
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

  return res.ok;
}
