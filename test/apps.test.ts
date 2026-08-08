/**
 * Tests for app slug handling — the pure pieces of the multi-app foundation.
 *
 * Run with: npm test  (node --test, native TypeScript — no extra deps).
 *
 * A slug becomes a public URL prefix (`/tiller`), so it must stay within
 * [a-z0-9-] and must never shadow a top-level route or static asset.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RESERVED_SLUGS,
  slugify,
  validateSlug,
  appBasePath,
} from '../src/services/apps.ts';

test('accepts ordinary lowercase slugs', () => {
  assert.equal(validateSlug('tiller'), null);
  assert.equal(validateSlug('rivets-2'), null);
  assert.equal(validateSlug('a'), null);
  assert.equal(validateSlug('a'.repeat(64)), null);
});

test('rejects an empty slug', () => {
  assert.match(validateSlug('') ?? '', /required/i);
});

test('rejects slugs longer than 64 characters', () => {
  assert.match(validateSlug('a'.repeat(65)) ?? '', /64 characters/);
});

test('rejects uppercase, spaces and other invalid characters', () => {
  for (const slug of ['Tiller', 'my app', 'my_app', 'app!', 'app/sub', 'app.json', 'café']) {
    assert.notEqual(validateSlug(slug), null, `expected "${slug}" to be rejected`);
  }
  assert.match(validateSlug('Tiller') ?? '', /lowercase/i);
});

test('rejects every reserved slug', () => {
  for (const slug of RESERVED_SLUGS) {
    assert.notEqual(validateSlug(slug), null, `expected "${slug}" to be reserved`);
  }
  assert.match(validateSlug('admin') ?? '', /reserved/i);
});

test('reserves the routes and assets served from the site root', () => {
  for (const slug of ['admin', 'api', 'auth', 'setup', 'images', 'releases', 'embed', 'feed.xml']) {
    assert.ok(RESERVED_SLUGS.includes(slug), `expected "${slug}" in RESERVED_SLUGS`);
  }
});

test('slugify lowercases and hyphenates a name', () => {
  assert.equal(slugify('My Project'), 'my-project');
  assert.equal(slugify('  Tiller  '), 'tiller');
  assert.equal(slugify('Herald 2.0'), 'herald-2-0');
  assert.equal(slugify('Ünïcode & Symbols!'), 'unicode-symbols');
  assert.equal(slugify('---dashes---'), 'dashes');
});

test('slugify output passes validateSlug for ordinary names', () => {
  for (const name of ['My Project', 'Tiller', 'Herald 2.0', 'API Gateway']) {
    assert.equal(validateSlug(slugify(name)), null, `slugify(${name}) should validate`);
  }
});

test('slugify truncates to the maximum slug length', () => {
  const slug = slugify('x'.repeat(100));
  assert.equal(slug.length, 64);
  assert.equal(validateSlug(slug), null);
});

test('slugify can produce an empty or reserved slug, which validation catches', () => {
  assert.equal(slugify('!!!'), '');
  assert.notEqual(validateSlug(slugify('!!!')), null);
  assert.notEqual(validateSlug(slugify('Admin')), null);
});

test('appBasePath is empty for the default app and /slug otherwise', () => {
  const base = { id: 1, slug: 'default', name: 'Herald', description: '', created_at: '', updated_at: '' };
  assert.equal(appBasePath({ ...base, is_default: 1 }), '');
  assert.equal(appBasePath({ ...base, id: 2, slug: 'tiller', is_default: 0 }), '/tiller');
});
