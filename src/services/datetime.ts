// Single source of truth for parsing, formatting, bucketing and timezone
// conversion of stored timestamps.
//
// Storage convention: all timestamps are UTC, written via SQLite `datetime()`
// which yields `YYYY-MM-DD HH:MM:SS` (no timezone designator). Older/ISO values
// with a trailing `Z` also occur. `parseStoredDate` normalises both to a real
// UTC Date so we never accidentally trust the runtime timezone (UTC on Workers,
// but local in tests/tooling).

import type { Entry, Release } from '../db/schema';

export type DateGrouping = 'day' | 'month';

/**
 * Parse a stored timestamp into a correct UTC `Date`.
 *
 * SQLite's `YYYY-MM-DD HH:MM:SS` has no timezone marker; `new Date()` would
 * interpret it in the runtime's local zone. We always treat such values as UTC.
 */
export function parseStoredDate(value: string): Date {
  if (!value) return new Date(NaN);
  const trimmed = value.trim();
  // Already has an explicit timezone designator (Z or ±HH:MM) — trust it.
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    return new Date(trimmed.replace(' ', 'T'));
  }
  // Bare `YYYY-MM-DD HH:MM:SS` (or date-only) — treat as UTC.
  return new Date(trimmed.replace(' ', 'T') + 'Z');
}

/** Format a stored timestamp for display in the given IANA timezone. */
export function formatInZone(
  value: string,
  timeZone: string,
  opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' },
): string {
  const date = parseStoredDate(value);
  if (isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone, ...opts }).format(date);
  } catch {
    // Invalid timezone — fall back to UTC.
    return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...opts }).format(date);
  }
}

/** Extract Y/M/D wall-clock parts of an instant as seen in `timeZone`. */
function zonedParts(date: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/**
 * Stable grouping key for a timestamp, computed in `timeZone`.
 * `day` -> `YYYY-MM-DD`, `month` -> `YYYY-MM`.
 */
export function dateBucketKey(value: string, timeZone: string, granularity: DateGrouping): string {
  const date = parseStoredDate(value);
  if (isNaN(date.getTime())) return '0000';
  let p: { year: number; month: number; day: number };
  try {
    p = zonedParts(date, timeZone);
  } catch {
    p = zonedParts(date, 'UTC');
  }
  const mm = String(p.month).padStart(2, '0');
  if (granularity === 'month') return `${p.year}-${mm}`;
  const dd = String(p.day).padStart(2, '0');
  return `${p.year}-${mm}-${dd}`;
}

/** Human-readable label for a timeline date bucket. */
export function bucketLabel(value: string, timeZone: string, granularity: DateGrouping): string {
  return formatInZone(
    value,
    timeZone,
    granularity === 'month'
      ? { year: 'numeric', month: 'long' }
      : { year: 'numeric', month: 'long', day: 'numeric' },
  );
}

/** Pad helper. */
function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Render a stored UTC timestamp as a `YYYY-MM-DDTHH:MM` string in `timeZone`,
 * suitable as the value of an `<input type="datetime-local">`.
 */
export function toDatetimeLocalValue(value: string, timeZone: string): string {
  const date = parseStoredDate(value);
  if (isNaN(date.getTime())) return '';
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
  } catch {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/**
 * Convert a `datetime-local` value (a wall-clock time in `timeZone`) back to a
 * canonical UTC `YYYY-MM-DD HH:MM:SS` string for storage.
 *
 * Uses the standard offset trick: interpret the wall-clock as if it were UTC,
 * find what that instant looks like in `timeZone`, and correct by the diff.
 * DST-ambiguous/skipped hours resolve to a single arbitrary-but-stable instant.
 */
export function zonedDatetimeLocalToUTC(localValue: string, timeZone: string): string | null {
  const m = localValue.trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const naiveUtc = Date.UTC(+y, +mo - 1, +d, +h, +mi, s ? +s : 0);
  let offset = 0;
  try {
    const p = zonedParts(new Date(naiveUtc), timeZone);
    const tp = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(naiveUtc));
    const gh = (t: string) => Number(tp.find((x) => x.type === t)?.value);
    const asZoneUtc = Date.UTC(p.year, p.month - 1, p.day, gh('hour'), gh('minute'), gh('second'));
    offset = asZoneUtc - naiveUtc;
  } catch {
    offset = 0;
  }
  const utcMs = naiveUtc - offset;
  const dt = new Date(utcMs);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())} ${pad(
    dt.getUTCHours(),
  )}:${pad(dt.getUTCMinutes())}:${pad(dt.getUTCSeconds())}`;
}

/** Stored timestamp as an ISO/UTC string for machine-readable `<time datetime>`. */
export function toIsoUtc(value: string): string {
  const date = parseStoredDate(value);
  if (isNaN(date.getTime())) return '';
  return date.toISOString();
}

/** Curated fallback list when Intl.supportedValuesOf is unavailable. */
const FALLBACK_TIMEZONES = [
  'UTC',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
];

/** All selectable IANA timezones, UTC first. */
export function listTimezones(): string[] {
  try {
    const sv = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    if (typeof sv === 'function') {
      const all = sv('timeZone');
      return ['UTC', ...all.filter((t) => t !== 'UTC')];
    }
  } catch {
    /* fall through */
  }
  return FALLBACK_TIMEZONES;
}

/** Validate a timezone string; returns it if usable, else 'UTC'. */
export function normalizeTimezone(value: string | undefined | null): string {
  if (!value) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return value;
  } catch {
    return 'UTC';
  }
}

/** Resolve the effective display/grouping date for an entry. */
export function effectiveEntryDate(entry: Pick<Entry, 'entry_date' | 'published_at' | 'created_at'>): string {
  return entry.entry_date ?? entry.published_at ?? entry.created_at;
}

/** Resolve the effective display/grouping date for a release. */
export function effectiveReleaseDate(
  release: Pick<Release, 'release_date' | 'published_at' | 'created_at'>,
): string {
  return release.release_date ?? release.published_at ?? release.created_at;
}
