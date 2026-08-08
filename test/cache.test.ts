/**
 * Tests for edge-cache path derivation.
 *
 * Run with: npm test  (node --test, native TypeScript — no extra deps).
 *
 * The cache is keyed by full URL, so the purge paths have to match the URLs the
 * public router actually serves: the default app at the site root, every other
 * app under its slug.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { cachedPathsForApp } from '../src/services/cache.ts';
import type { App } from '../src/db/schema.ts';

function makeApp(slug: string, isDefault: boolean): App {
  return {
    id: 1,
    slug,
    name: slug,
    description: '',
    is_default: isDefault ? 1 : 0,
    created_at: '2026-01-01 00:00:00',
    updated_at: '2026-01-01 00:00:00',
  };
}

test('the default app keeps the pre-multi-app root paths', () => {
  assert.deepEqual(cachedPathsForApp(makeApp('default', true)), [
    '/',
    '/embed',
    '/embed.json',
    '/feed.xml',
  ]);
});

test('a non-default app is cached under its slug', () => {
  assert.deepEqual(cachedPathsForApp(makeApp('tiller', false)), [
    '/tiller',
    '/tiller/embed',
    '/tiller/embed.json',
    '/tiller/feed.xml',
  ]);
});

test("a non-default app's changelog page has no trailing slash", () => {
  const paths = cachedPathsForApp(makeApp('rivets', false));
  assert.equal(paths[0], '/rivets');
  assert.ok(!paths.some((p) => p.endsWith('/')));
});

test('apps never share a cached path', () => {
  const a = cachedPathsForApp(makeApp('tiller', false));
  const b = cachedPathsForApp(makeApp('tiller-2', false));
  assert.equal(a.filter((p) => b.includes(p)).length, 0);
});
