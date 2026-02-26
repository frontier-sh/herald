export type Bindings = {
  DB: D1Database;
  AI: Ai;
  CHANGELOG_QUEUE: Queue;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_ALLOWED_REPO: string; // Format: "owner/repo"
};
