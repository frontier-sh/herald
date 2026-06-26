/**
 * Tests for the Slack notification message builders and webhook-URL validation.
 *
 * Run with: npm test  (node --test, native TypeScript — no extra deps).
 *
 * These cover the pure, side-effect-free pieces: URL validation (guards the
 * save form and every send) and Block Kit message shape (branding, excerpt
 * truncation, the "View changelog" button).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidSlackWebhookUrl,
  buildEntryMessage,
  buildReleaseMessage,
} from '../src/services/slack-format.ts';

const branding = {
  projectName: 'Acme',
  faviconUrl: 'https://example.com/images/favicon.png',
  changelogUrl: 'https://example.com',
};

function blockTypes(message: { blocks: unknown[] }): string[] {
  return message.blocks.map((b) => (b as { type: string }).type);
}

test('accepts a real Slack incoming-webhook URL', () => {
  assert.equal(
    isValidSlackWebhookUrl('https://hooks.slack.com/services/T000/B000/XXXX'),
    true,
  );
});

test('rejects non-Slack and bare-prefix URLs', () => {
  assert.equal(isValidSlackWebhookUrl('https://example.com/hook'), false);
  assert.equal(isValidSlackWebhookUrl('http://hooks.slack.com/services/x'), false);
  assert.equal(isValidSlackWebhookUrl('https://hooks.slack.com/'), false);
  assert.equal(isValidSlackWebhookUrl(''), false);
});

test('entry message carries branding, header, category, excerpt and button', () => {
  const msg = buildEntryMessage(
    { title: 'Faster search', content: 'Search is now instant.', category: 'added' },
    branding,
  );
  assert.equal(msg.text, 'New in Acme: Faster search');
  assert.deepEqual(blockTypes(msg), ['context', 'header', 'section', 'actions']);

  // Favicon thumbnail present in the context block when a favicon URL is given.
  const context = msg.blocks[0] as { elements: Array<{ type: string; image_url?: string }> };
  assert.equal(context.elements[0].type, 'image');
  assert.equal(context.elements[0].image_url, branding.faviconUrl);

  const section = msg.blocks[2] as { text: { text: string } };
  assert.match(section.text.text, /\*Added\*/);
  assert.match(section.text.text, /Search is now instant\./);
});

test('entry message omits the favicon image when none is available', () => {
  const msg = buildEntryMessage(
    { title: 'X', content: 'Y', category: 'fixed' },
    { ...branding, faviconUrl: null },
  );
  const context = msg.blocks[0] as { elements: Array<{ type: string }> };
  assert.ok(!context.elements.some((e) => e.type === 'image'));
});

test('entry message omits the button when there is no changelog URL', () => {
  const msg = buildEntryMessage(
    { title: 'X', content: 'Y', category: 'fixed' },
    { ...branding, changelogUrl: null },
  );
  assert.ok(!blockTypes(msg).includes('actions'));
});

test('long markdown content is stripped to a plain truncated excerpt', () => {
  const content =
    '# Heading\n\n**Bold** and [a link](https://x.com) and `code`. ' + 'word '.repeat(200);
  const msg = buildEntryMessage({ title: 'T', content, category: 'changed' }, branding);
  const section = msg.blocks[2] as { text: { text: string } };
  const body = section.text.text.replace('*Changed*\n', '');
  assert.ok(!body.includes('#'));
  assert.ok(!body.includes('**'));
  assert.ok(!body.includes('`'));
  assert.ok(body.includes('a link')); // link label kept, URL dropped
  assert.ok(!body.includes('https://x.com'));
  assert.ok(body.endsWith('…'));
  assert.ok(body.length <= 282); // ~280 + ellipsis
});

test('release message lists entries and caps the list', () => {
  const entries = Array.from({ length: 15 }, (_, i) => ({
    title: `Entry ${i + 1}`,
    category: 'added' as const,
  }));
  const msg = buildReleaseMessage('v2.0.0', entries, branding);
  assert.equal(msg.text, 'New release v2.0.0 in Acme');
  assert.deepEqual(blockTypes(msg), ['context', 'header', 'section', 'actions']);
  const header = msg.blocks[1] as { text: { text: string } };
  assert.equal(header.text.text, 'New release v2.0.0');
  const section = msg.blocks[2] as { text: { text: string } };
  assert.match(section.text.text, /Entry 1/);
  assert.match(section.text.text, /and 3 more/); // 15 entries, cap 12
});

test('release message with no entries still renders header and button', () => {
  const msg = buildReleaseMessage('v1.0.0', [], branding);
  assert.deepEqual(blockTypes(msg), ['context', 'header', 'actions']);
});
