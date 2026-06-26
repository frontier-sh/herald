// Category enum array and type
export const CATEGORIES = ['added', 'changed', 'fixed', 'removed', 'deprecated', 'security'] as const;
export type Category = (typeof CATEGORIES)[number];

// Status arrays and types
export const ENTRY_STATUSES = ['draft', 'published'] as const;
export type EntryStatus = (typeof ENTRY_STATUSES)[number];

export const RELEASE_STATUSES = ['draft', 'published'] as const;
export type ReleaseStatus = (typeof RELEASE_STATUSES)[number];

// Source enum array and type
export const SOURCES = ['manual', 'github', 'api'] as const;
export type Source = (typeof SOURCES)[number];

// AI processing status
export const AI_STATUSES = ['pending', 'processing', 'completed', 'failed'] as const;
export type AiStatus = (typeof AI_STATUSES)[number] | null;

// Database row types

export interface Project {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface Section {
  id: number;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface Entry {
  id: number;
  title: string;
  content: string;
  category: Category;
  section_id: number | null;
  status: EntryStatus;
  published_at: string | null;
  // Editable "date of the change". Nullable; resolve via effectiveEntryDate().
  entry_date: string | null;
  created_at: string;
  updated_at: string;
  source: Source;
  source_metadata: string | null;
  // Related git commit ID when generated from a GitHub commit; null otherwise.
  commit_sha: string | null;
  ai_status: AiStatus;
  raw_content: string | null;
  // When 1, the entry should be published automatically once AI finishes
  // rewriting it. Lets auto-publish defer until the rewrite lands instead of
  // exposing the raw commit first. Resolved by the queue worker.
  publish_on_ai_complete: number;
}

export interface EntryWithSection extends Entry {
  section_name: string | null;
}

export interface Release {
  id: number;
  version: string;
  title: string;
  summary: string;
  status: ReleaseStatus;
  published_at: string | null;
  // Editable release date. Nullable; resolve via effectiveReleaseDate().
  release_date: string | null;
  created_at: string;
  updated_at: string;
  // When 1, the release is published but its consolidated Slack notification is
  // deferred until its entries finish AI rewriting (so titles are post-AI). The
  // queue worker sends the message and clears this flag. See migration 0011.
  publish_notify_pending: number;
}

export interface ReleaseEntry {
  release_id: number;
  entry_id: number;
  sort_order: number;
}

export interface Setting {
  key: string;
  value: string | null;
}

export interface ApiKey {
  id: number;
  name: string;
  key_hash: string;
  created_at: string;
  last_used_at: string | null;
}

export interface GitHubAppConfig {
  id: 1;
  client_id: string;
  client_secret: string;
  html_url: string;
  installation_id: number | null;
  allowed_repo: string | null;
  session_secret: string;
  // AES-GCM ciphertext of the "Generate from commits" PAT, or null. Never
  // returned to clients; decrypted server-side only (see services/secrets.ts).
  source_pat: string | null;
  created_at: string;
  updated_at: string;
}
