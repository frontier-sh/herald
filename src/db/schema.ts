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
  created_at: string;
  updated_at: string;
  source: Source;
  source_metadata: string | null;
  ai_status: AiStatus;
  raw_content: string | null;
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
  created_at: string;
  updated_at: string;
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
  app_id: number;
  slug: string;
  client_id: string;
  client_secret: string;
  webhook_secret: string | null;
  pem: string;
  html_url: string;
  installation_id: number | null;
  allowed_repo: string | null;
  manifest_version: number;
  session_secret: string;
  created_at: string;
  updated_at: string;
}
