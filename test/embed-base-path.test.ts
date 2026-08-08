/**
 * Tests for the embed loader's app resolution.
 *
 * Run with: npm test  (node --test, native TypeScript — no extra deps).
 *
 * The widget has no server to ask which app it belongs to: it works that out
 * from the URL of the script tag the page author wrote, or from an explicit
 * data-herald-app attribute. Getting this wrong silently renders the wrong
 * changelog, so the parsing is pinned here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  embedBasePathFromPathname,
  embedBasePathForApp,
} from '../src/client/embed-base-path.ts';

test('the site-root script means the default app', () => {
  assert.equal(embedBasePathFromPathname('/embed.js'), '');
});

test('a slug in the script URL means that app', () => {
  assert.equal(embedBasePathFromPathname('/tiller/embed.js'), '/tiller');
  assert.equal(embedBasePathFromPathname('/rivets-2/embed.js'), '/rivets-2');
});

test('ignores a query string or hash on the script URL', () => {
  assert.equal(embedBasePathFromPathname('/tiller/embed.js?v=2'), '/tiller');
  assert.equal(embedBasePathFromPathname('/embed.js?v=2'), '');
  assert.equal(embedBasePathFromPathname('/tiller/embed.js#x'), '/tiller');
});

test('collapses redundant slashes before the filename', () => {
  assert.equal(embedBasePathFromPathname('/tiller//embed.js'), '/tiller');
  assert.equal(embedBasePathFromPathname('//embed.js'), '');
});

test('the redirect target resolves to the default app, not an "assets" app', () => {
  assert.equal(embedBasePathFromPathname('/assets/embed.js'), '');
});

test('falls back to the default app for anything unexpected', () => {
  assert.equal(embedBasePathFromPathname(''), '');
  assert.equal(embedBasePathFromPathname('/'), '');
  assert.equal(embedBasePathFromPathname('embed.js'), '');
  assert.equal(embedBasePathFromPathname('/tiller/widget.js'), '');
  assert.equal(embedBasePathFromPathname('/embed.js/'), '');
});

test('an absent data-herald-app inherits the app of its script tag', () => {
  assert.equal(embedBasePathForApp(null, ''), '');
  assert.equal(embedBasePathForApp(null, '/tiller'), '/tiller');
});

test('data-herald-app overrides the script URL', () => {
  assert.equal(embedBasePathForApp('rivets', '/tiller'), '/rivets');
  assert.equal(embedBasePathForApp('rivets', ''), '/rivets');
});

test('an empty data-herald-app pins a widget to the default app', () => {
  assert.equal(embedBasePathForApp('', '/tiller'), '');
  assert.equal(embedBasePathForApp('   ', '/tiller'), '');
});

test('data-herald-app is normalised the way slugs are', () => {
  assert.equal(embedBasePathForApp(' Tiller ', ''), '/tiller');
});

test('a data-herald-app that cannot be a slug is ignored', () => {
  assert.equal(embedBasePathForApp('../admin', '/tiller'), '/tiller');
  assert.equal(embedBasePathForApp('a/b', '/tiller'), '/tiller');
  assert.equal(embedBasePathForApp('has space', ''), '');
});
