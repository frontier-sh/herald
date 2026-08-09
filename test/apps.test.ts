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
  liveSlugInput,
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

test('liveSlugInput hyphenates a phrase as it is typed', () => {
  assert.equal(liveSlugInput('my test app'), 'my-test-app');
  assert.equal(liveSlugInput('My Test App'), 'my-test-app');
  assert.equal(liveSlugInput('my_test_app'), 'my-test-app');
});

test('liveSlugInput keeps a trailing hyphen so a word break can be typed', () => {
  // The whole point of the lenient transform: slugify would give "my-test"
  // here, and the separator could never survive to the next word.
  assert.equal(liveSlugInput('My Test '), 'my-test-');
  assert.equal(liveSlugInput('my-test-a'), 'my-test-a');
});

test('liveSlugInput strips accents the same way slugify does', () => {
  assert.equal(liveSlugInput('Café X'), 'cafe-x');
  assert.equal(liveSlugInput('Ünïcode'), 'unicode');
});

test('liveSlugInput collapses consecutive hyphens', () => {
  assert.equal(liveSlugInput('my--test'), 'my-test');
  assert.equal(liveSlugInput('my - test'), 'my-test');
  assert.equal(liveSlugInput('my   test'), 'my-test');
  // ...including the pair a leading hyphen would otherwise leave behind.
  assert.equal(liveSlugInput('--my-test'), 'my-test');
});

test('liveSlugInput drops characters that are not slug-safe', () => {
  assert.equal(liveSlugInput('app!'), 'app');
  assert.equal(liveSlugInput('app/sub'), 'appsub');
  assert.equal(liveSlugInput('!!!'), '');
});

test('liveSlugInput enforces the 64-character cap', () => {
  assert.equal(liveSlugInput('x'.repeat(100)).length, 64);
  assert.equal(liveSlugInput('a b '.repeat(40)).length, 64);
});

test('blurring applies the strict slugify, which drops the trailing hyphen', () => {
  assert.equal(slugify('my-test-'), 'my-test');
  assert.equal(slugify(liveSlugInput('My Test ')), 'my-test');
});

test('liveSlugInput output only ever needs the trailing hyphen trimmed', () => {
  for (const typed of ['my test app', 'My Test ', 'Café X', 'a b c ', 'x'.repeat(100)]) {
    const live = liveSlugInput(typed);
    assert.equal(
      slugify(live),
      live.replace(/-+$/, ''),
      `slugify should agree with liveSlugInput for "${typed}"`,
    );
  }
});

test('appBasePath is empty for the default app and /slug otherwise', () => {
  const base = { id: 1, slug: 'default', name: 'Herald', description: '', created_at: '', updated_at: '' };
  assert.equal(appBasePath({ ...base, is_default: 1 }), '');
  assert.equal(appBasePath({ ...base, id: 2, slug: 'tiller', is_default: 0 }), '/tiller');
});
