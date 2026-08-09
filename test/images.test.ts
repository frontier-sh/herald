/**
 * Tests for brand image key derivation.
 *
 * Run with: npm test  (node --test, native TypeScript — no extra deps).
 *
 * Brand images share one R2 bucket across every app, so the key has to identify
 * the app: without that, two apps' logos overwrite each other. The leading `_`
 * has to survive, because it is what the image route reads to decide between the
 * short (mutable) and immutable cache lifetimes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateBrandKey } from '../src/services/images.ts';

test('brand keys are namespaced per app', () => {
  assert.equal(generateBrandKey(1, 'image/png', 'logo'), '_app1_logo.webp');
  assert.equal(generateBrandKey(2, 'image/png', 'logo'), '_app2_logo.webp');
});

test('apps never share a brand key', () => {
  const purposes = ['logo', 'favicon'] as const;
  for (const purpose of purposes) {
    assert.notEqual(
      generateBrandKey(1, 'image/png', purpose),
      generateBrandKey(2, 'image/png', purpose),
    );
  }
});

test('logo and favicon of one app are separate keys', () => {
  assert.notEqual(
    generateBrandKey(3, 'image/png', 'logo'),
    generateBrandKey(3, 'image/png', 'favicon'),
  );
});

test('brand keys keep the mutable-cache underscore prefix', () => {
  assert.ok(generateBrandKey(7, 'image/svg+xml', 'favicon').startsWith('_'));
  assert.ok(generateBrandKey(7, 'image/x-icon', 'favicon').startsWith('_'));
});

test('raster uploads are stored as webp, other types keep their extension', () => {
  assert.equal(generateBrandKey(1, 'image/jpeg', 'logo'), '_app1_logo.webp');
  assert.equal(generateBrandKey(1, 'image/svg+xml', 'logo'), '_app1_logo.svg');
  assert.equal(generateBrandKey(1, 'image/x-icon', 'favicon'), '_app1_favicon.ico');
});

test('brand keys are safe for the /images/:key route pattern', () => {
  assert.match(generateBrandKey(42, 'image/png', 'favicon'), /^[a-zA-Z0-9_.-]+$/);
});
